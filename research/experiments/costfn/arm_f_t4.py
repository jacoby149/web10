"""Real authorized API publish T4. No direct canonical/workload table inserts.

Fixtures use existing synthetic human sessions and actual self-grant/group APIs.
The read-only frozen contracts are not bypassed for the new writer origin.
"""
import asyncio
from datetime import UTC, datetime
import json
import math
from pathlib import Path
import time
import urllib.request
import uuid

import httpx

import arm_f as f
import arm_f_environment as environment
from arm_f_runtime import Session
from arm_satellite_sql import literal as q
import restore_dataset
import restore_realism as restore

ORIGIN = 'https://fanout.research.invalid'


def p95(values):
    if not values or any(not math.isfinite(value) or value < 0 for value in values):
        raise ValueError('finite nonempty measured latency samples required')
    return sorted(values)[math.ceil(.95 * len(values)) - 1]


def start(root):
    return environment.boot(root)


def switch_writer(root, *, control):
    """Separate original-P control worker, never a request-level F hook bypass.

    One API container at a time under the same memory/server envelope. Controls
    are new labelled T4 write controls, not a rewrite of Step0 or old receipts.
    """
    root = Path(root)
    if not control:
        environment.boot(root)
        return ['uv', 'run', 'uvicorn', 'arm_f_api:application', '--host', '0.0.0.0', '--port', '80', '--no-access-log']
    session = Session(root)
    env = {**session.env, 'SATELLITE_SERVE_STATE': str(root / 'serve-state')}
    here = Path(__file__).parent
    overlay = root / ('T4-control.overlay.json' if control else 'F-api.overlay.json')
    if control:
        stages = root / 'T4-control-stages'
        stages.mkdir(mode=0o700, exist_ok=True)
        overlay.write_text(json.dumps({'services': {'api': {'volumes': [str(stages) + ':/fanout-stages'],
            'environment': {'FANOUT_STAGE_DIR': '/fanout-stages'}, 'command': ['uv', 'run', 'uvicorn',
                'arm_f_profile_api:application', '--host', '0.0.0.0', '--port', '80', '--no-access-log']}}}))
    logs = root / 'T4-phase-logs'
    logs.mkdir(mode=0o700, exist_ok=True)
    (logs / (uuid.uuid4().hex + '.log')).write_bytes(
        restore.command(session.compose, session.env, 'logs', '--no-log-prefix', 'api'))
    compose = session.compose[:-2] + ['-f', str(here / 'arm_satellite_serve.compose.yml'), '-f', str(overlay), *session.compose[-2:]]
    restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=180)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=3).status == 200,
                            'T4 original control' if control else 'T4 real F worker')
    container = restore.command(session.compose, session.env, 'ps', '-q', 'api').decode().strip()
    actual = json.loads(restore.command(['docker'], session.env, 'inspect', '--format', '{{json .Config.Cmd}}', container))
    expected = 'arm_f_profile_api:application' if control else 'arm_f_api:application'
    if expected not in actual:
        raise ValueError('T4 actual API worker entry differs')
    return actual


async def run(root):
    root = Path(root)
    session = start(root)
    output = root / 'T4'
    output.mkdir(mode=0o700, exist_ok=False)
    result = dict(kind='CONFIG_F_T4_REAL_AUTHORIZED_PUBLISH', T4='NOT_ESTABLISHED', outcome='RUNNING',
        cutoff=f.CUTOFF, samples_per_size=20, groups=[], requests=[], control_requests=[], queries=[],
        droplet_id=session.host_id, source='actual v3 login/self-grant/group/create paths, no direct workload inserts')
    def save():
        (output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    save()
    manifest = json.loads((root / 'input/manifest.json').read_bytes())
    writer = manifest['readers'][0]
    users, _ = session.rows('T4_fixture_humans', 'SELECT username FROM users FINAL WHERE deleted=0 AND username!='
                           + q(writer) + ' ORDER BY username LIMIT 1999')
    if len(users) != 1999:
        raise ValueError('actual synthetic recipient fixtures incomplete')
    roles = [{'name': 'owner', 'permissions': {'*': ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup']}},
        {'name': 'member', 'permissions': {'posts': ['readAll', 'create']}},
        {'name': 'public', 'permissions': {'posts': ['readAll']}}]
    async with httpx.AsyncClient(base_url='http://127.0.0.1:6098', timeout=120, trust_env=False) as client:
        login = await client.post('/v3/login', json={'username': writer, 'password': manifest['password'], 'site': 'costfn'})
        login.raise_for_status()
        token = login.json()['token']
        # Real home-session consent endpoint, no Origin spoof or direct grant SQL.
        grant = await client.post('/v3/app-contracts/add', json={'token': token, 'allowed_origin': ORIGIN,
            'permissions': {'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'],
                            'reactions': ['readAll'], 'comments': ['readAll'], 'profile': ['readAll']}})
        grant.raise_for_status()
        try:
            for size in (10, 500, 999, 1999, 2000):
                members = [{'member_key': writer, 'role': 'owner'},
                           *[{'member_key': row['username'], 'role': 'member'} for row in users[:size - 1]],
                           {'member_key': 'anyone', 'role': 'public'}]
                group = await client.post('/v3/groups/create', json={'token': token,
                    'name': 'F-T4-' + str(size), 'roles': roles, 'members': members, 'join_policy': 'open',
                    'discoverable': False, 'membership_visibility': 'hidden'}, headers={'Origin': ORIGIN})
                group.raise_for_status()
                group_id = group.json()['group_id']
                expected = {writer, *(row['username'] for row in users[:size - 1])}
                info = {'members': size, 'group_id': group_id, 'latencies_ms': [], 'control_latencies_ms': [],
                        'public_class_excluded': True}
                result['groups'].append(info)
                info['control_api_command'] = switch_writer(root, control=True)
                for index in range(20):
                    request_id = uuid.uuid4().hex
                    lower = datetime.now(UTC).isoformat()
                    begin = time.perf_counter()
                    response = await client.post('/v3/create', json={'token': token, 'service': 'posts',
                        'body': {'text': 'F T4 synthetic publication', 'trial': index}, 'groups': [group_id]},
                        headers={'Origin': ORIGIN, 'X-Research-ID': request_id})
                    elapsed = (time.perf_counter() - begin) * 1000
                    result['control_requests'].append({'request_id': request_id, 'status': response.status_code,
                        'started': lower, 'ended': datetime.now(UTC).isoformat(), 'elapsed_ms': elapsed, 'members': size})
                    if response.status_code != 200 or response.headers.get('x-arm-p-stop') == '1':
                        raise ValueError('original authorized T4 write control failed')
                    info['control_latencies_ms'].append(elapsed)
                info['control_publish_p95_ms'] = p95(info['control_latencies_ms'])
                info['F_api_command'] = switch_writer(root, control=False)
                for index in range(20):
                    request_id, op = uuid.uuid4().hex, str(uuid.uuid4())
                    lower = datetime.now(UTC).isoformat()
                    begin = time.perf_counter()
                    response = await client.post('/v3/create', json={'token': token, 'service': 'posts',
                        'body': {'text': 'F T4 synthetic publication', 'trial': index}, 'groups': [group_id]},
                        headers={'Origin': ORIGIN, 'X-Research-ID': request_id, 'X-Fanout-Operation': op})
                    elapsed = (time.perf_counter() - begin) * 1000
                    upper = datetime.now(UTC).isoformat()
                    record = dict(request_id=request_id, operation_id=op, status=response.status_code,
                                  elapsed_ms=elapsed, started=lower, ended=upper)
                    result['requests'].append(record)
                    save()
                    if response.headers.get('x-arm-p-stop') == '1' or response.status_code != 200:
                        raise ValueError('real publish native/authority stop')
                    doc = response.json()['doc_id']
                    # Independent full-key canonical/pointer check outside measured window.
                    rows, _ = session.rows('T4_canonical_pointer_parity', 'SELECT reader_key,author_key,doc_id,'
                        "argMax(deleted,tuple(version,deleted)) AS removed FROM fanout WHERE doc_id=" + q(doc)
                        + ' GROUP BY reader_key,author_key,doc_id HAVING removed=0')
                    actual = {row['reader_key'] for row in rows}
                    wanted = expected if size < f.CUTOFF else set()
                    if actual != wanted or len(rows) != len(actual) or any(row['author_key'] != writer for row in rows):
                        raise ValueError('T4 INVALID: entitled recipient pointers differ')
                    record.update(doc_id=doc, canonical_recipient_count=len(expected), logical_pointers=len(rows), parity='PASS')
                    info['latencies_ms'].append(elapsed)
                    save()
                info['publish_path_p95_ms'] = p95(info['latencies_ms'])
                info['p95_quantile_delta_ms'] = info['publish_path_p95_ms'] - info['control_publish_p95_ms']
                deltas = [treated - control for treated, control in zip(info['latencies_ms'], info['control_latencies_ms'], strict=True)]
                info['paired_index_added_latency_p95_ms'] = sorted(deltas)[math.ceil(.95 * len(deltas)) - 1]
                info['control_scope'] = 'twenty serial original-P writes, then twenty F writes; same fixture/member count; index-paired, not randomized causal proof'
                print('[arm-f T4]', size, 'members p95_ms=', info['publish_path_p95_ms'], flush=True)
            session.query('T4_flush_query_log', 'SYSTEM FLUSH LOGS')
            ids = [row['request_id'] for row in result['requests']]
            raw = restore.command(session.compose, session.env, 'logs', '--no-log-prefix', 'api').decode()
            raw += '\n' + '\n'.join(path.read_text() for path in (root / 'T4-phase-logs').glob('*.log'))
            observed = [json.loads(line.split('COSTFN_REQUEST=', 1)[1]) for line in raw.splitlines()
                        if line.startswith('COSTFN_REQUEST=')]
            observed = {row['request_id']: row for row in observed if row.get('request_id') in ids}
            if set(observed) != set(ids):
                raise ValueError('T4 exact native request attribution missing')
            native_ids = [query['query_id'] for row in observed.values() for query in row.get('arm_p_native', [])]
            conditions = 'query_id IN (' + ','.join(q(value) for value in native_ids) + ') OR log_comment IN ('
            conditions += ','.join(q('F_WRITE:' + value) for value in ids) + ')'
            native, _ = session.rows('T4_native_write_receipts', 'SELECT query_id,query_duration_ms,read_rows,read_bytes,'
                'written_rows,written_bytes,memory_usage,exception_code,log_comment,query FROM system.query_log WHERE ('
                + conditions + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
            for row in native:
                sql = row.pop('query')
                import sqlglot
                from sqlglot import exp
                tree = sqlglot.parse_one(sql, read='clickhouse')
                reads_fanout = any(table.name == 'fanout' and table.find_ancestor(exp.Select) for table in tree.find_all(exp.Table))
                if int(row['exception_code']) or int(row['read_rows']) > 10_000_000 or reads_fanout:
                    raise ValueError('T4 native stop or per-insert reader rerank defect')
            result.update(outcome='T4_PASS', T4='PASS', observations=observed, queries=native,
                physical_written_rows=sum(int(row['written_rows']) for row in native),
                physical_written_bytes=sum(int(row['written_bytes']) for row in native))
        except Exception as error:
            result.update(outcome='STOP', **__import__('arm_f_failure').details(error))
            __import__('arm_f_failure').persist(root, error, stage='T4', groups=result['groups'],
                operation='publish_schedule')
            (root / 'F.stop').write_text('T4_' + type(error).__name__ + '\n')
            raise
        finally:
            save()
            restore.command(session.compose, session.env, 'stop', 'api', timeout=120)
    return result


if __name__ == '__main__':
    import sys
    asyncio.run(run(Path(sys.argv[1])))
