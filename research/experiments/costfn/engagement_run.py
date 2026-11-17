"""Three-part isolated native experiment, on its explicitly admitted DO lease.

Stage measurements are not a complete HTTP response or a new F acceptance run.
The old F FAIL stays banked. Never imports this adapter into ordinary runtime.
"""
import argparse
import asyncio
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path

import arm_f_failure as failure
from arm_f_native import save
from arm_f_run import download, operation, setup_scopes
from arm_f_runtime import Session
from arm_satellite_counts import canonical_boundary, oracle_boundary
from arm_satellite_sql import literal as q
import arm_t
import engagement_events as events
import engagement_ref as refs
import restore_realism as restore


def aggregate_segment(sql, service, *, uniform):
    if service == 'comments':
        target = 'ref_value' if uniform else "JSONExtractString(body,'post_id')"
        return 'SELECT ' + target + ' AS root,count() AS n FROM (' + sql + ') GROUP BY root ORDER BY root'
    target_filter = " AND JSONExtractString(body,'target_id')=''" if uniform else ''
    return ("SELECT ref_value AS root,countIf(JSONExtractString(body,'type')='like') AS likes,"
        "countIf(JSONExtractString(body,'type')='dislike') AS dislikes FROM (" + sql
        + ") WHERE 1" + target_filter + ' GROUP BY root ORDER BY root')


def measure(session, output, label, sql):
    """Retain SQL/result/native even when a stop fires; one observed stage only."""
    receipt = dict(outcome='RUNNING', label=label, scope='NATIVE_STAGE_NOT_COMPLETE_HTTP_SEQUENCE',
        sql_sha256=hashlib.sha256(sql.encode()).hexdigest())
    (output / (label + '.sql')).write_text(sql)
    try:
        rows, query_id = session.rows(label, sql, measured=True)
        rows = events.integer_counts(rows)
        receipt.update(query_id=query_id, rows=rows)
        native = session.native(query_id, measured=True)
        receipt['native'] = native
        selected, _ = session.rows(label + '_actual_projection', 'SELECT projections FROM system.query_log WHERE query_id='
            + q(query_id) + " AND type='QueryFinish'")
        if len(selected) != 1:
            raise ValueError('missing/ambiguous actual optimizer projection receipt')
        receipt['actual_projections'] = selected[0]['projections']
        if int(native['exception_code']):
            raise ValueError('native stage exception')
        receipt['outcome'] = 'OBSERVED_NOT_PARITY_VERIFIED'
        return receipt
    except BaseException as error:
        receipt.update(outcome='STOP', **failure.details(error))
        raise
    finally:
        save(output / (label + '.json'), receipt)


def verify_sample(output, sample, expected):
    if sample['rows'] != events.integer_counts(expected):
        save(output / (sample['label'] + '-mismatch.json'), dict(actual=sample['rows'], expected=expected))
        raise ValueError('independent engagement stage parity mismatch')
    sample['outcome'] = 'PARITY_PASS_NATIVE_STAGE_ONLY'
    save(output / (sample['label'] + '.json'), sample)


def run(root, *, downloaded=False):
    root = Path(root)
    approval = json.loads((root / 'admission.json').read_bytes())
    if approval.get('engagement_ref_admitted') is not True or approval.get('purpose') != 'ENGAGEMENT_REF_REDESIGN_NOT_A_NEW_F_GATE':
        raise ValueError('explicit three-part engagement admission required')
    output = root / 'engagement-full'
    output.mkdir(mode=0o700, exist_ok=False)
    result = dict(kind='ENGAGEMENT_REF_THREE_PART_EXPERIMENT', outcome='RUNNING', completed=[],
        dataset_id=arm_t.DATASET, droplet_id=approval['droplet_id'], deadline_utc=approval['deadline_utc'],
        sources={name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
            for name in ('engagement_run.py', 'engagement_ref.py', 'engagement_events.py')},
        full_response='NOT_MEASURED', mixed_resolution_counts='NOT_ATTRIBUTED_TO_ENGAGEMENT',
        preparation='EXCLUDED', unclassified='EXCLUDED', production_changes=False)
    session = None
    try:
        operation(root)  # Existing bounded restore/transport infrastructure only.
        if downloaded:
            archive = json.loads((root / 'evidence/archive.json').read_bytes())
            if archive.get('all_size_sha256_verified') is not True or archive.get('dataset_id') != arm_t.DATASET:
                raise ValueError('exact previously verified download required')
            restore.verified_input(root / 'input', root / 'input/validation.json', arm_t.DATASET, arm_t.VALIDATION)
        else:
            download(root)
        restore.restore(root / 'input', root / 'input/validation.json', arm_t.DATASET, arm_t.VALIDATION,
            'web10-costfn-frozen-satellite-engage', 6098, root / 'restore.json')
        session = Session(root)
        result['envelope'] = session.verify_envelope()
        profile = asyncio.run(setup_scopes(root, session))  # Real authenticated/compiler scope, LIMIT0.
        restore.command(session.compose, session.env, 'stop', 'api', timeout=60)
        scope_directory = output / 'views-scope'
        scope_directory.mkdir(mode=0o700)
        save(scope_directory / 'input.json', profile)
        program = ("import json;from pathlib import Path;import core_feed;from app.v3.services import clickhouse as ch;"
            "p=Path('/engagement-scope');s=json.loads((p/'input.json').read_bytes());"
            "v=core_feed.payload(core_feed.wire()['requests'][3]['payload'],'__oracle_not_a_credential__',s['groups']);"
            "g=ch.readable_groups(s['reader'],v['service'],True,v['groups']);"
            "(p/'actual.json').write_text(json.dumps(g))")
        restore.command(session.compose, session.env, 'run', '--rm', '-T', '--no-deps',
            '-v', str(scope_directory) + ':/engagement-scope', 'api', 'uv', 'run', 'python', '-c', program, timeout=180)
        views_groups = json.loads((scope_directory / 'actual.json').read_bytes())
        if not views_groups:
            raise ValueError('positive ordinary-page view scope required')
        result['writers_stopped'] = True
        ids = [row['doc_id'] for row in profile['reference_page']]
        result['page_count'] = len(ids)
        # Stop TTL/merges during the separately measured frozen-store experiment.
        # This is not a claim that insert aggregates track production expiry.
        for index, sql in enumerate(refs.projection()):
            session.query('projection_' + str(index), sql, setup_seconds=1200)
        for table in ('documents', 'doc_groups', 'content_events'):
            session.query('quiescent_' + table, 'SYSTEM STOP MERGES ' + table)
        result['completed'].append('PROJECTION_MATERIALIZED_VIEWS_UNAFFECTED')
        result['projection_only_views'] = 'UNAFFECTED'
        plan, _ = session.query('projection_plan', 'EXPLAIN indexes=1 ' + refs.seek(ids)
            + " SETTINGS force_optimize_projection_name='ref_sorted'", measured=True)
        (output / 'projection-plan.txt').write_text(plan)
        if 'ref_sorted' not in plan:
            raise ValueError('projection routing not confirmed')
        expected_candidates, _ = session.rows('independent_old_ref_candidates',
            'SELECT author_key,doc_id FROM documents WHERE has([' + refs.targets(ids)
            + "],ref_value) AND collection_name IN ('comments','reactions','posts') SETTINGS optimize_use_projections=0",
            setup_seconds=900)
        candidate_sample = measure(session, output, 'projection_only_candidate_seek', refs.seek(ids)
            + " SETTINGS force_optimize_projection_name='ref_sorted'")
        def pair(row):
            return row['author_key'], row['doc_id']
        candidate_sample['rows'].sort(key=pair)
        verify_sample(output, candidate_sample, sorted(expected_candidates, key=pair))
        # Old semantics use independent FINAL-table reference, not the rewritten
        # constructor. Comments still read body.post_id at this step; do not
        # claim ref_sorted can seek their entire legacy reply tree.
        references = {}
        for service in ('reactions', 'comments'):
            groups = profile['actual_readable_by_kind'][service][service]
            boundary = oracle_boundary(service, groups, profile['reader'])
            target = 'ref_value' if service == 'reactions' else "JSONExtractString(body,'post_id')"
            sql = 'SELECT * FROM (' + boundary + ') WHERE ' + target + ' IN (' + refs.targets(ids) + ')'
            references[service], _ = session.rows('reference_' + service,
                aggregate_segment(sql, service, uniform=False), setup_seconds=900)
        save(output / 'independent-legacy-reference.json', references)
        checks, statements = refs.migration()
        for label, sql in checks.items():
            checked, _ = session.rows('source_' + label, sql, setup_seconds=900)
            if len(checked) != 1 or int(checked[0]['n']):
                raise ValueError('source validation refused migration: ' + label)
        for index, sql in enumerate(statements):
            session.query('migration_' + str(index), sql, setup_seconds=1200)
        session.query('stop_copy_merges', 'SYSTEM STOP MERGES engagement_documents')
        # Count is an early guard, never the parity oracle. Every physical
        # column/version/multiplicity then passes the independent inverse map.
        counts, _ = session.rows('copy_row_counts', 'SELECT (SELECT count() FROM documents) AS old,'
            '(SELECT count() FROM engagement_documents) AS new', setup_seconds=900)
        if counts[0]['old'] != counts[0]['new']:
            raise ValueError('migration changed physical row count')
        result['copy_row_counts'] = counts
        result['roundtrip_batches'] = []
        for batch in range(32):
            sql = refs.roundtrip_check(batch)
            rows, query_id = session.rows('roundtrip_' + str(batch), sql, setup_seconds=900)
            save(output / ('roundtrip-' + str(batch) + '.json'), dict(query_id=query_id, rows=rows,
                sql_sha256=hashlib.sha256(sql.encode()).hexdigest()))
            if len(rows) != 1 or int(rows[0]['mismatches']):
                raise ValueError('exact physical inverse-semantics multiset mismatch')
            result['roundtrip_batches'].append(batch)
            save(output / 'result.json', result)
        result['whole_store_all_column_parity'] = 'EXACT_INVERSE_SEMANTICS_MULTISET_PASS'
        result['document_stages'] = {}
        for service in ('reactions', 'comments'):
            groups = profile['actual_readable_by_kind'][service][service]
            boundary = canonical_boundary(service, groups, profile['reader'])
            segment = refs.segment(boundary, ids, table='engagement_documents')
            samples = []
            for phase in ('warmup', 'measured'):
                sample = measure(session, output, 'uniform_' + service + '_' + phase,
                    aggregate_segment(segment, service, uniform=True))
                verify_sample(output, sample, references[service])
                samples.append(sample)
            result['document_stages'][service] = samples
        result['completed'].append('UNIFORM_PAGE_DOCUMENT_COUNTS_PARITY')
        # The actual captured request, resolved through the existing live gate
        # above. Never substitute public assumptions or main request groups.
        groups = views_groups
        raw_sql = events.read(ids, 'posts', groups, aggregate=False)
        raw = measure(session, output, 'views_raw', raw_sql)
        from arm_f_reads import visible_views
        independent = visible_views(session, ids, groups, 'independent_true_page_events')
        expected_views = sorted([dict(doc_id=doc, **metrics) for doc, metrics in independent.items()], key=lambda row: row['doc_id'])
        raw['rows'].sort(key=lambda row: row['doc_id'])
        verify_sample(output, raw, expected_views)
        true_count = sum(int(row['impressions']) for row in expected_views)
        diagnosis = events.diagnostic(raw_sql, {k: int(raw['native'][k]) for k in ('read_rows', 'read_bytes', 'exception_code')},
            true_count, sum(int(row['impressions']) for row in raw['rows']))
        save(output / 'views-diagnostic.json', diagnosis)
        result['views_diagnostic'] = diagnosis
        for index, sql in enumerate(events.build(diagnosis, writers_stopped=True)):
            session.query('events_build_' + str(index), sql, setup_seconds=1800)
        result['views_stages'] = []
        for phase in ('warmup', 'measured'):
            sample = measure(session, output, 'views_aggregated_' + phase, events.read(ids, 'posts', groups))
            # GROUP BY output order is not a contract; exact values/keys are.
            sample['rows'].sort(key=lambda row: row['doc_id'])
            verify_sample(output, sample, sorted(raw['rows'], key=lambda row: row['doc_id']))
            result['views_stages'].append(sample)
        result['completed'].append('VIEWS_AGGREGATE_PAGE_PARITY')
        result.update(outcome='PAGE_STAGE_PARITY_PASS_NOT_FULL_ACCEPTANCE',
            TTL_reconciliation='OPEN_INSERT_AGGREGATES_DO_NOT_SUBTRACT_EXPIRED_RAW_EVENTS',
            completed_utc=datetime.now(UTC).isoformat())
        return result
    except BaseException as error:
        result.update(outcome='STOP', **failure.details(error))
        raise
    finally:
        save(output / 'result.json', result)
        if session:
            restore.command(session.compose, session.env, 'stop', timeout=120)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--downloaded', action='store_true')
    args = parser.parse_args()
    run(args.root, downloaded=args.downloaded)
