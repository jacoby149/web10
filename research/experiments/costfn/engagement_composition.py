"""All source fixes, then one lease: fail-closed verification/measurement driver.

This module has no provisioning or engine side effects. An executable action
provider must supply native receipts for every gate; an empty/partial gate is
never permission to measure. Historical experiment drivers remain unchanged.
"""
import hashlib
from pathlib import Path

from arm_f_failure import details
from arm_f_native import save
import engagement_delivery_dedup as delivery_dedup

DIRECTIVE = 'Jacob Hoffman 2026-11-19 all fixes first then one experiment'
GATES = ('refs', 'paired-tallies', 'views', 'ads')
CELLS = ('uniform-K20', 'paired-P', 'paired-F')
SETUP = ('banked', 'restore', 'read-setup', 'migrate', 'billboard-fixtures', 'furniture')


def gate(name, value):
    if name not in GATES or value.get('parity') != 'PASS' or not value.get('source_binding'):
        raise ValueError('source-bound native gate required: ' + name)
    queries = value.get('query_ids', [])
    if not queries or any(not isinstance(q, str) or not q for q in queries):
        raise ValueError('nonempty native query evidence required: ' + name)
    if name == 'refs':
        if (value.get('batches') != list(range(32)) or value.get('mismatches') != 0
                or value.get('multi_ref') is not True or value.get('pins') is not True
                or value.get('fat_universe') is not True or value.get('same_question_parity') is not True):
            raise ValueError('exact complete refs census, pins and fat coverage required')
    elif name == 'paired-tallies':
        roots = set(value.get('actual_oracle_roots', []))
        domains = value.get('queried_domains', {})
        if (len(roots) != 20 or set(domains) != {'main:reactions', 'main:comments', 'main:posts',
                'reactions:reactions', 'comments:comments'} or any(not roots <= set(v) for v in domains.values())
                or not all(value.get(k) is True for k in ('ordinary', 'fat', 'store_sample', 'values_exact'))):
            raise ValueError('all20 actual paired roots must be verified in all five domains')
    elif name == 'views':
        if (set(value.get('profiles', [])) != {'ordinary', 'fixture'}
                or value.get('exact_impressions_and_reach') is not True
                or value.get('all_time_parity') != 'PASS' or value.get('daily_parity') != 'PASS'):
            raise ValueError('both actual pages need exact aggregate views verification')
    elif name == 'ads':
        if (set(value.get('profiles', [])) != {'ordinary', 'fixture'}
                or value.get('exact_creative_identity_required') is not True
                or value.get('setup_sha256') is None):
            raise ValueError('immutable setup-bound exact ad identity verification required')
    return value


def run(actions, output):
    """Measurements are independent AFTER every required precheck passes.

    A measured timeout is a result; it must not silently skip another cell.
    Setup/precheck failure, on the other hand, blocks ALL measured work.
    """
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = {}
    steps = [*SETUP, *('verify-' + name for name in GATES), *CELLS, 'decomposition']
    blocked = False
    for name in steps:
        measuring = name in (*CELLS, 'decomposition')
        if blocked:
            result = dict(outcome='BLOCKED_PRE_MEASUREMENT_VERIFICATION')
        else:
            try:
                print('[composition] start', name, flush=True)
                value = actions.stage(name, results)
                if name.startswith('verify-'):
                    gate(name.removeprefix('verify-'), value)
                result = dict(outcome='PASS', evidence=value)
            except Exception as error:
                result = dict(outcome='INCOMPLETE', **details(error))
                if not measuring:
                    blocked = True
        results[name] = result
        save(output / (name + '.json'), result)
        save(output / 'summary.json', dict(directive=DIRECTIVE, stages=results,
            paired_tally_verdict=results.get('verify-paired-tallies', {}).get('outcome', 'NOT_RUN'),
            ads_verdict=results.get('verify-ads', {}).get('outcome', 'NOT_RUN'),
            banked_failures_unchanged=True, whole_arm_pass=False))
        actions.checkpoint(name, result)
        print('[composition] finish', name, result['outcome'], flush=True)
    return results


def statement_inventory(directory, records):
    """Exact per-query decomposition, not subtraction or renamed unknown work."""
    import sqlglot
    from sqlglot import exp
    result = []
    seen = set()
    for record in records:
        identity = record['query_id']
        if identity in seen:
            raise ValueError('duplicate native query identity in measured sequence')
        seen.add(identity)
        digest = record['sql_sha256']
        sql = (Path(directory) / (digest + '.sql')).read_text()
        if hashlib.sha256(sql.encode()).hexdigest() != digest:
            raise ValueError('measured SQL digest differs from query receipt')
        statements = sqlglot.parse(sql, read='clickhouse')
        if len(statements) != 1 or statements[0] is None:
            raise ValueError('one parsed measured statement required')
        tree = statements[0]
        tables = sorted({t.name for t in tree.find_all(exp.Table)})
        if digest == '4bc916c85c420f45a56d98424274efe1f83483092363c8c9fdae1194c24765f6':
            raise ValueError('retired node-ad inventory statement executed')
        dedup = 'content_events' in tables and delivery_dedup.admitted(tree)
        if 'ref_sorted' in sql or ('content_events' in tables and not dedup):
            raise ValueError('retired projection/raw-view read survived in measured composition')
        if any(isinstance(fn.expression, exp.Literal) and fn.expression.this == 'node_ad'
                and fn.find_ancestor(exp.Not) is None for fn in tree.find_all(exp.ArrayContains)):
            raise ValueError('read-time node-ad inventory search survived')
        native = record['native']
        item = dict(query_id=identity, sql_sha256=digest, tables=tables,
            identity=record.get('identity', 'read:' + '+'.join(tables) if tables else 'select:constant') + ':' + digest,
            previous_stage=record.get('stage'), sql_file=digest + '.sql',
            native={key: int(native[key]) for key in ('read_rows', 'read_bytes', 'query_duration_ms', 'exception_code')})
        if dedup:
            item.update(stage=delivery_dedup.STAGE, identity=delivery_dedup.STAGE + ':' + digest)
            print('[composition-audit]', delivery_dedup.STAGE, identity,
                'rows=', item['native']['read_rows'], 'bytes=', item['native']['read_bytes'],
                'native_ms=', item['native']['query_duration_ms'], flush=True)
        result.append(item)
    if not result:
        raise ValueError('empty statement inventory is not measured decomposition')
    return dict(statements=result, read_rows=sum(v['native']['read_rows'] for v in result),
         read_bytes=sum(v['native']['read_bytes'] for v in result), additive_native_statements=True,
         native_ms_sum_not_wall=sum(v['native']['query_duration_ms'] for v in result),
         auxiliary_scope='report request-tagged non-captured work separately')
