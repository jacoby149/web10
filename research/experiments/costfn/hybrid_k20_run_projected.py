"""Separately admitted current vs projected K20 run; never provisions a host."""
import argparse
from pathlib import Path

from arm_f_failure import details
from arm_f_native import save
from arm_satellite_sql import literal as q
import engagement_cells as cells
import engagement_modern as modern
import hybrid_k20_baseline as baseline
import hybrid_k20_projected as projected
import hybrid_k20_run_current as current


CELL = 'projected-K20'
BANKED_EVENT_COUNT = 897_139_143


def compare(current_cell, projected_cell, indexed, challenger):
    left = baseline.read(current_cell / 'measured-views-audit.json')
    right = baseline.read(projected_cell / 'measured-views-audit.json')
    if left != right or left['before'] != left['after']:
        raise ValueError('measured arms do not share identical quiet delivery history')
    def delta(before, after):
        return dict(indexed=before, projected=after,
            projected_minus_indexed={metric: after[metric] - before[metric] for metric in before})

    def stages(sample, names):
        rows = [row for row in sample['captured_statements'] if row['stage'] in names]
        if not rows:
            raise ValueError('no comparable captured stage costs')
        return baseline.totals(rows)

    result = {label: delta(indexed[label], challenger[label])
        for label in ('captured_totals', 'request_tagged_totals')}
    result['preparation'] = delta(stages(indexed, ('preparation',)),
        stages(challenger, ('preparation', *projected.STAGES[2:])))
    result['counts_embedded_in_resolution'] = delta(stages(indexed, ('counts_embedded_in_resolution',)),
        stages(challenger, projected.STAGES[:2]))
    result['complete_http_wall_ms'] = dict(indexed=indexed['complete_http_wall_ms'],
        projected=challenger['complete_http_wall_ms'],
        projected_minus_indexed=challenger['complete_http_wall_ms'] - indexed['complete_http_wall_ms'])
    return result


def body_logged(columns):
    return any(name.replace('`', '').split('.')[-1] == 'body' for name in columns)


def plans(session, directory, sample, stages):
    statements = [row for row in sample['captured_statements'] if row['stage'] in stages]
    ids = ','.join(q(row['query_id']) for row in statements)
    if not ids:
        raise ValueError('no native evidence for targeted K20 stages')
    logged, _ = session.rows('k20_plan_target_columns', "SELECT query_id,columns,ProfileEvents['SelectedMarks'] AS selected_marks "
        'FROM system.query_log '
        "WHERE type='QueryFinish' AND query_id IN (" + ids + ')')
    keyed = baseline.by_query(logged)
    if set(keyed) != {row['query_id'] for row in statements}:
        raise ValueError('missing target statement native column receipt')
    explained, records = {}, []
    for row in statements:
        digest = row['sql_sha256']
        if digest not in explained:
            if modern.remaining(session.operation) < 120:
                raise TimeoutError('projected K20 plan collection reached cleanup margin')
            sql = (directory / 'F-stages' / (digest + '.sql')).read_text()
            # Use the measurement envelope, not setup's forced join algorithm.
            plan, explain_id = session.query('k20_explain',
                'EXPLAIN PLAN indexes=1,actions=1,header=1 ' + sql, measured=True)
            explained[digest] = dict(plan=plan, explain_query_id=explain_id)
        columns = keyed[row['query_id']]['columns']
        if not isinstance(columns, list) or not columns:
            raise ValueError('missing column evidence on target query')
        records.append({**row, **explained[digest], 'native_columns': columns, 'body_logged': body_logged(columns),
            'query_wide_selected_marks': int(keyed[row['query_id']]['selected_marks'])})
    return records


def pruning(records):
    by_stage = {stage: [row for row in records if row['stage'] == stage] for stage in projected.STAGES}
    if any(not rows for rows in by_stage.values()):
        raise ValueError('not all four projected statements were exercised')
    return {stage: all(row['body_logged'] == stage.endswith('_payload') for row in rows)
        for stage, rows in by_stage.items()}


def run(root):
    root = Path(root).resolve()
    approval = baseline.read(root / 'admission.json')
    if not projected.enabled(approval):
        raise ValueError('separate projected-only K20 admission required')
    current.source_guard(approval)
    path = root / 'hybrid-k20-projected-comparison.json'
    if path.exists():
        raise FileExistsError(path)
    result = dict(status='RUNNING', hybrid='NOT_RUN', fault_suite='NOT_RUN',
        source_commit=approval['hybrid_k20_source_commit'], droplet_id=approval['droplet_id'],
        deadline_utc=approval['deadline_utc'])
    save(path, result)
    try:
        # Unchanged restore, slice, oracle, furniture, gates and indexed HTTP arm.
        print('[hybrid-k20-projected] indexed control', flush=True)
        current.run(root)
        manifest = root / 'hybrid-k20-slice.json'
        if int(baseline.read(manifest)['tables']['content_events']['census']['n']) != BANKED_EVENT_COUNT:
            raise ValueError('fixed event census differs from banked indexed slice')
        result['slice_sha256'] = cells.digest(manifest)
        session = modern.Session(root)
        schema, _ = session.rows('k20_payload_version_schema', "SELECT type FROM system.columns WHERE database=currentDatabase() "
            "AND table='engagement_documents' AND name='updated_at'")
        if schema != [{'type': 'DateTime64(3)'}]:
            raise ValueError('K20 exact version seek requires the pinned millisecond schema')
        if modern.remaining(approval) < 120:
            raise TimeoutError('projected K20 reached cleanup margin')
        expected = baseline.read(root / 'reference-ordinary/expected.json')
        print('[hybrid-k20-projected] projected challenger', flush=True)
        cells.run_complete(root, CELL, 'ordinary', 'uniform', expected, aggregate=True, projected=True,
            serving_mode=baseline.CELL_SERVING_MODES[baseline.CELL_NAME])
        indexed, challenger = root / 'cells' / baseline.CELL, root / 'cells' / CELL
        result['indexed'], result['projected'] = baseline.audit_cell(indexed), baseline.audit_cell(challenger)
        save(path, result)
        result['measured_comparison'] = compare(indexed, challenger, result['indexed'][-1], result['projected'][-1])
        # Plan and receipt reads are separate setup/diagnostics, not request work.
        result['indexed_plans'] = plans(session, indexed, result['indexed'][-1],
            ('preparation', 'counts_embedded_in_resolution'))
        result['projected_plans'] = plans(session, challenger, result['projected'][-1], projected.STAGES)
        result['column_evidence'] = pruning(result['projected_plans'])
        result['status'] = 'EVIDENCE_COLLECTED'
        return result
    except BaseException as error:
        result.update(status='STOP', failure=details(error))
        raise
    finally:
        save(path, result)
        if (root / 'restore.json').exists():
            cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
