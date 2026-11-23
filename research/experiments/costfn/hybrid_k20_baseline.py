"""Current-arm adapter for RD4. Requires the prepared native slice, never provisions it."""
import hashlib
import json
import math
from pathlib import Path
from uuid import UUID


CELL = 'all-fixes-uniform-K20'
PHASES = ('warmup', 'measured')
METRICS = ('read_rows', 'read_bytes', 'query_duration_ms', 'memory_usage')


def read(path):
    return json.loads(path.read_bytes())


def by_query(rows):
    result = {}
    for row in rows:
        key = row['query_id']
        if not isinstance(key, str) or not key or key in result:
            raise ValueError('missing or duplicate native query identity')
        result[key] = row
    return result


def metrics(row):
    values = {}
    for key in METRICS:
        value = row[key]
        if isinstance(value, str) and value.isascii() and value.isdecimal():
            value = int(value)
        if type(value) is not int or value < 0:
            raise ValueError('invalid native metric: ' + key)
        values[key] = value
    return values


def totals(rows):
    return dict(read_rows=sum(row['read_rows'] for row in rows),
        logical_read_bytes=sum(row['read_bytes'] for row in rows),
        summed_native_duration_ms=sum(row['query_duration_ms'] for row in rows),
        largest_statement_memory_bytes=max(row['memory_usage'] for row in rows))


def sample_evidence(cell, sample, all_native):
    if sample.get('parity') != 'PASS' or sample.get('path_mode') != 'P_DOCUMENT_STREAM_V1':
        raise ValueError('current arm requires the original indexed path and oracle parity')
    wall = sample['elapsed_ms']
    if type(wall) not in (int, float) or not math.isfinite(wall) or wall <= 0:
        raise ValueError('complete HTTP wall time required')
    requests = sample['request_ids']
    if not requests or len(requests) != len(set(requests)):
        raise ValueError('missing or duplicate HTTP request identity')
    observed = []
    directory = cell / 'F-stages'
    for request in requests:
        if UUID(request).hex != request:
            raise ValueError('unexpected HTTP request identity')
        rows = [json.loads(line) for line in (directory / (request + '.jsonl')).read_text().splitlines()]
        if not rows or any(row.get('request_id') != request or row.get('success') is not True for row in rows):
            raise ValueError('missing or failed request stages')
        observed.extend(rows)
    captured, native = by_query(observed), by_query(sample['native'])
    if captured.keys() != native.keys():
        raise ValueError('captured and measured native identities differ')
    tags = {prefix + request for request in requests for prefix in ('F_READ:', 'F_WRITE:')}
    harvested = by_query(row for row in all_native if row['log_comment'] in tags)
    if not captured.keys() <= harvested.keys():
        raise ValueError('incomplete request-tagged native inventory')

    statements, stages, auxiliary = [], {}, []
    for query_id, trace in captured.items():
        row, verified = native[query_id], harvested[query_id]
        expected_tag = 'F_READ:' + trace['request_id']
        if (row['log_comment'] != expected_tag or verified['log_comment'] != expected_tag
                or verified['type'] != 'QueryFinish' or int(row['exception_code']) or int(verified['exception_code'])):
            raise ValueError('captured receipt failed or belongs to another request')
        if metrics(row) != metrics(verified):
            raise ValueError('captured and harvested native metrics differ')
        digest = trace['sql_sha256']
        if len(digest) != 64 or any(char not in '0123456789abcdef' for char in digest):
            raise ValueError('invalid captured SQL digest')
        sql = directory / (digest + '.sql')
        if hashlib.sha256(sql.read_bytes()).hexdigest() != digest:
            raise ValueError('captured SQL digest differs from receipt')
        stage = trace['stage']
        if not isinstance(stage, str) or not stage:
            raise ValueError('captured query stage missing')
        item = dict(query_id=query_id, stage=stage, sql_sha256=digest, **metrics(row))
        stages.setdefault(stage, []).append(item)
        statements.append(item)
    for query_id, row in harvested.items():
        if query_id not in captured:
            auxiliary.append(dict(query_id=query_id, log_comment=row['log_comment'],
                native_type=row['type'], exception_code=int(row['exception_code']), **metrics(row)))
    return dict(phase=sample['phase'], parity='PASS', complete_http_wall_ms=wall,
        captured_statements=statements, captured_totals=totals(statements),
        captured_by_stage={stage: totals(rows) for stage, rows in stages.items()},
        auxiliary_statements=auxiliary, auxiliary_totals=totals(auxiliary) if auxiliary else None,
        request_tagged_totals=totals([*statements, *auxiliary]))


def audit_cell(cell):
    cell = Path(cell)
    native = read(cell / 'all-native-including-failures-and-writes.json')
    # engagement_cells.harvest uses LIMIT 10000; hitting the limit cannot prove
    # that all request-tagged auxiliary statements made it into the archive.
    if len(native) >= 10_000:
        raise ValueError('request-tagged native harvest may have been truncated')
    results = []
    for phase in PHASES:
        sample = read(cell / (phase + '.json'))
        if sample['phase'] != phase:
            raise ValueError('sample phase differs from evidence file')
        results.append(sample_evidence(cell, sample, native))
    seen = set()
    for result in results:
        for row in (*result['captured_statements'], *result['auxiliary_statements']):
            if row['query_id'] in seen:
                raise ValueError('native statement reused between samples')
            seen.add(row['query_id'])
    return results


def run_current(actions):
    """Run unchanged composition HTTP/oracle code after preparing a native slice."""
    import engagement_pin_index as pins
    if not pins.enabled(actions.approval) or not actions.aggregate_ready:
        raise ValueError('indexed composition and both views grains required')
    from arm_f_native import save

    path = Path(actions.root) / 'hybrid-k20-current.json'
    if path.exists():
        raise FileExistsError(path)
    actions.stage('uniform-K20', {})
    samples = audit_cell(Path(actions.root) / 'cells' / CELL)
    save(path, dict(arm='current', samples=samples,
        comparison_status='NOT_RUN', peak_memory_scope='largest individual statement, not concurrent memory'))
    return samples
