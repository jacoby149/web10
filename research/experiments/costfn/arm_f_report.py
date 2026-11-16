"""Observed F stage costs alongside an explicitly cited banked P comparator."""
import arm_f_banked as banked
from arm_f_native import save


def table(native, stages):
    by_id = {row['query_id']: row for row in stages}
    if len(by_id) != len(stages) or set(by_id) != {row['query_id'] for row in native}:
        raise ValueError('stage table needs an exact one-to-one native observation join')
    result = {}
    for row in native:
        if int(row['exception_code']):
            raise ValueError('failed query is not a successful F stage table')
        observed = by_id[row['query_id']]
        stages_for_request = result.setdefault(observed['request_id'], {})
        entry = stages_for_request.setdefault(observed['stage'], dict(read_rows=0, read_bytes=0, native_ms=0, queries=0))
        for field, key in (('read_rows', 'read_rows'), ('read_bytes', 'read_bytes'), ('native_ms', 'query_duration_ms')):
            entry[field] += int(row[key])
        entry['queries'] += 1
    return result


def report(root, output, native, stages):
    reference = banked.citation(root)
    value = dict(P_baseline_status='CITED_NOT_REMEASURED', P_pull_request=1572,
        P_archive_sha256=reference['archive_sha256'], P_stage_table=reference['stage_table'],
        F_status='OBSERVED_QUERY_STAGES_NOT_A_GATE_VERDICT', F_per_request=table(native, stages),
        mixed_stage_policy='mixed resolution/preparation+counts remain mixed; no invented apportionment')
    save(output, value)
    return value
