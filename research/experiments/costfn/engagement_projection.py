"""Default-mode probe, materialization and exact native projection coverage."""
import time
import re

from arm_f_failure import details
from arm_f_native import save
from arm_satellite_sql import identifier, literal as q
import engagement_ref as refs


def coverage(session, table):
    names, _ = session.rows('projection_names_' + table, "SELECT name FROM system.projections WHERE database='web10' AND table=" + q(table))
    if [row['name'] for row in names] != ['ref_sorted']:
        raise ValueError('exactly the one admitted ref_sorted projection is required')
    rows, _ = session.rows('projection_coverage_' + table, 'SELECT '
        '(SELECT count() FROM ' + identifier(table) + ') AS source_rows,'
        '(SELECT sum(rows) FROM system.projection_parts WHERE database=\'web10\' AND table=' + q(table)
        + " AND active AND (endsWith(path,'/ref_sorted.proj/') OR endsWith(path,'/ref_sorted.proj'))) AS projection_rows,"
        '(SELECT count() FROM system.parts WHERE database=\'web10\' AND table=' + q(table) + ' AND active) AS source_parts,'
        '(SELECT uniqExact(parent_name) FROM system.projection_parts WHERE database=\'web10\' AND table=' + q(table)
        + " AND active AND (endsWith(path,'/ref_sorted.proj/') OR endsWith(path,'/ref_sorted.proj'))) AS covered_parts")
    value = {key: int(item or 0) for key, item in rows[0].items()}
    if value['source_rows'] != value['projection_rows'] or value['source_parts'] != value['covered_parts']:
        raise ValueError('projection coverage differs from documents; dependent cells cannot proceed')
    return value


def install(session, table, output):
    started = time.perf_counter()
    settings, add, materialize = refs.projection(table)
    definition, _ = session.query('projection_prior_mode_' + table, 'SHOW CREATE TABLE ' + identifier(table))
    declared = re.search(r"deduplicate_merge_projection_mode\s*=\s*'([^']+)'", definition)
    session.query('projection_start_merges_' + table, 'SYSTEM START MERGES ' + identifier(table))
    default = True
    try:
        session.query('projection_default_probe_' + table, add)
    except Exception as error:
        failure = details(error)
        save(output / ('projection-default-stop-' + table + '.json'), failure)
        if 'deduplicate_merge_projection_mode' not in failure.get('failure_stderr', ''):
            raise
        default = False
        session.query('projection_explicit_rebuild_' + table, settings)
        session.query('projection_add_after_mode_probe_' + table, add)
    materialize_started = time.perf_counter()
    _, materialize_id = session.query('projection_materialize_' + table, materialize, setup_seconds=1200)
    materialize_seconds = time.perf_counter() - materialize_started
    session.query('projection_freeze_' + table, 'SYSTEM STOP MERGES ' + identifier(table))
    value = dict(default_mode_accepted=default if declared is None else None,
        inherited_or_explicit_mode=declared[1] if declared else None,
        table_mode_accepted_without_override=default, forced_rebuild_mode=not default,
        materialization_seconds=materialize_seconds, materialization_query_id=materialize_id,
        projection_setup_total_seconds=time.perf_counter() - started, **coverage(session, table))
    save(output / ('projection-' + table + '.json'), value)
    return value
