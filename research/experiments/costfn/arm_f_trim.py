"""Open the deployed continuation at the maintenance wound, before T4 timings.

Real authorized HTTP publishes, real journal and ordinary 60-second background
worker. No test endpoint, direct pointer insert or forced successful trim marker.
"""
import asyncio
import json
from pathlib import Path
import time

import arm_f as f
import arm_f_environment as environment
import arm_f_failure as failure
from arm_f_http import HTTP
import arm_f_lifecycle as lifecycle
from arm_satellite_sql import literal as q


def overflow_sql(reader):
    return f.cache_sql(reader, []).replace("position<=200 AND group_id IN ('')", 'position>200')


async def run(root, output):
    root, output = Path(root), Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    session = environment.boot(root)
    http = HTTP(root, session, output)
    result = dict(outcome='RUNNING', verified=False, stage='trim-first', serving_measurement=False,
                  publications=[], physical_overflow_observed=False)
    try:
        writer = http.manifest['readers'][0]
        token = await http.login(writer)
        await http.consent(token, lifecycle.ORIGIN)
        fixture = (await lifecycle.fixture_groups(http, writer, token, [2], prefix='trim-first'))[0]
        result['fixture'] = fixture
        for index in range(205):
            doc, row = await lifecycle.checked_publish(http, token, fixture['group_id'])
            result['publications'].append(dict(doc_id=doc['doc_id'], request_id=row['request_id']))
            failure.save(output / 'result.json', result)
        reader = fixture['members'][1]
        rows, _ = session.rows('trim_first_overflow', overflow_sql(reader))
        if not rows:
            raise ValueError('trim-first did not observe physical overflow; maintenance proof unestablished')
        result['physical_overflow_observed'] = True
        failure.save(output / 'result.json', result)
        deadline = time.monotonic() + 125  # At most two ordinary timer ticks; never extend the lease.
        while True:
            if (root / 'fanout-state/F.stop').exists():
                raise RuntimeError('trim-first worker stopped; inspect private API failure receipts')
            rows, _ = session.rows('trim_first_remaining', overflow_sql(reader))
            if not rows:
                break
            if time.monotonic() >= deadline:
                raise TimeoutError('ordinary periodic trim did not remove physical overflow within125s')
            await asyncio.sleep(1)
        canonical, _ = session.rows('trim_first_expected', 'SELECT author_key,doc_id FROM documents FINAL WHERE author_key='
            + q(writer) + ' AND deleted=0 AND doc_id IN (' + ','.join(q(row['doc_id']) for row in result['publications'])
            + ') ORDER BY created_at DESC,doc_id DESC,author_key DESC LIMIT 200')
        expected = {(row['author_key'], row['doc_id']) for row in canonical}
        if len(expected) != 200:
            raise ValueError('trim-first canonical200 fixture incomplete')
        for reader in fixture['members']:
            remaining, _ = session.rows('trim_first_each_reader_overflow', overflow_sql(reader))
            actual, _ = session.rows('trim_first_retained', f.cache_sql(reader, [fixture['group_id']]))
            if remaining or len(actual) != 200 or {(row['author_key'], row['doc_id']) for row in actual} != expected:
                raise ValueError('trim-first physical/global cap or canonical retained-window mismatch')
        observations = [json.loads(path.read_bytes()) for path in (root / 'fanout-state/background').glob('*.json')]
        if not observations or any(row.get('failure_class') for row in observations):
            raise ValueError('trim-first background observation missing/failed')
        session.query('trim_first_flush', 'SYSTEM FLUSH LOGS')
        native, _ = session.rows('trim_first_native', 'SELECT query_id,exception_code,exception,stack_trace,read_rows,'
            'written_rows,log_comment FROM system.query_log WHERE log_comment IN ('
            + ','.join(q(prefix + row['request_id']) for row in observations for prefix in ('F_READ:', 'F_WRITE:'))
            + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if not native or any(int(row['exception_code']) or int(row['read_rows']) > 10_000_000 for row in native):
            raise ValueError('trim-first native failure/missing attribution')
        if sum(int(row['written_rows']) for row in native) < 10:
            raise ValueError('trim-first native tombstone writes not established')
        result.update(outcome='PASS', verified=True, native=native, readers=2, logical_cap=200)
        return result
    except BaseException as error:
        result.update(outcome='STOP', **failure.details(error))
        failure.persist(output, error, stage='trim-first', operation='publish_overflow_periodic_trim')
        raise
    finally:
        failure.save(output / 'result.json', result)
        await http.close()
        environment.stop(root)
