"""Tiny admitted-host coordinator/driver trim replay, not API authorization proof.

Called inside the existing pinned native preflight, before its container cleanup.
The deliberately broken capture must fail, and the live per-thread path must
complete with foreground work overlapping trim. Never run on a measured store.
"""
import ast
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path
import subprocess
import threading
import time
from types import SimpleNamespace

import arm_f as f
from arm_f_client import dispatch
import arm_f_failure as failure
from arm_f_journal import Journal
from arm_f_store import Store


FOREGROUND_SQL = 'SELECT sleep(2) /* F_TRIM_OLD_OVERLAP */'
TRIM_SOURCES = ('arm_f.py', 'arm_f_client.py', 'arm_f_failure.py', 'arm_f_journal.py',
                'arm_f_store.py', 'arm_f_trim_native.py')


def foreground_probe_sql():
    # The driver appends FORMAT Native (httpcommon.plan_query_request). Exact
    # equality with submitted SQL can never observe that executing statement.
    from arm_satellite_sql import literal
    return 'SELECT query_id,query FROM system.processes WHERE startsWith(query,' + literal(FOREGROUND_SQL) + ')'


def run(container, root):
    import clickhouse_connect
    from clickhouse_connect.driver.exceptions import ProgrammingError
    root = Path(root)
    output = root / 'trim-native-fixture'
    output.mkdir(mode=0o700, exist_ok=False)
    ip = subprocess.check_output(['docker', 'inspect', '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container], timeout=10).decode().strip()
    settings = SimpleNamespace(CLICKHOUSE_HOST=ip, CLICKHOUSE_PORT=8123, CLICKHOUSE_DATABASE='web10',
        CLICKHOUSE_USER='web10', CLICKHOUSE_PASSWORD='web10', CLICKHOUSE_SECURE=False)
    source = Path(__file__).resolve().parents[3] / 'api/app/v3/services/clickhouse.py'
    nodes = [node for node in ast.parse(source.read_text()).body
             if getattr(node, 'name', None) in ('_get_client', '_LazyClickHouse')]
    namespace = dict(_thread_local=threading.local(), settings=settings, clickhouse_connect=clickhouse_connect)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)
    proxy = namespace['_LazyClickHouse']()
    control = clickhouse_connect.get_client(host=ip, database='web10', username='web10', password='web10')
    journal = Journal(output / 'journal')
    result = dict(outcome='RUNNING', serving_measurement=False, api_authorization_proof=False,
        droplet_id=json.loads((root / 'admission.json').read_bytes())['droplet_id'],
        engine=control.command('SELECT version()'), core_source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        publications=0, readers=2, logical_cap=200,
        source_sha256={name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in TRIM_SOURCES})
    limits = dict(max_execution_time=10, max_memory_usage=22 * 1024**3,
                  max_rows_to_read=10_000_000, read_overflow_mode='throw')
    query_ids = []
    def query(sql, *args, **kwargs):
        kwargs['settings'] = {**limits, 'log_comment': 'F_TRIM_NATIVE', **kwargs.get('settings', {})}
        answer = namespace['_get_client']().query(sql, *args, **kwargs)
        query_ids.append(answer.query_id)
        failure.save(output / 'query-ids.json', query_ids)
        return answer
    try:
        if result['engine'] != '24.8.14.39':
            raise ValueError('wrong native trim fixture engine')
        control.command('DROP TABLE IF EXISTS fanout')
        control.command(f.DDL)
        control.command('CREATE TABLE IF NOT EXISTS group_members (group_id String,member_key String,'
            'updated_at DateTime64(3),deleted UInt8) ENGINE=MergeTree ORDER BY (group_id,member_key)')
        control.command("INSERT INTO group_members VALUES ('trim-fixture','reader-a',now64(3),0),"
            "('trim-fixture','reader-b',now64(3),0)")
        old = proxy.query  # Exactly the old import-thread-bound adapter defect.
        for method in ('query', 'command', 'insert'):
            setattr(proxy, method, dispatch(namespace['_get_client'], method, getattr(proxy, method)))
        native_insert = proxy.insert
        def insert(*args, **kwargs):
            kwargs['settings'] = {**limits, 'log_comment': 'F_TRIM_NATIVE', **kwargs.get('settings', {})}
            answer = native_insert(*args, **kwargs)
            identity = getattr(answer, 'query_id', None)
            if identity:
                query_ids.append(identity)
                failure.save(output / 'query-ids.json', query_ids)
            return answer
        proxy.query = query
        proxy.insert = insert
        store = Store(proxy, journal)
        for index in range(205):
            document = dict(author_key='trim-author', doc_id='trim-' + str(index).zfill(3),
                created_at=datetime(2026, 11, 16, tzinfo=UTC) + timedelta(milliseconds=index))
            # Real durable coordinator and append-only canonical-member publisher.
            journal.run('fixture-publish-' + str(index), 'trim-author', 'publish', {'doc_id': document['doc_id']},
                lambda: None, lambda sequence, payload, d=document: store.publish(d, 'trim-fixture', sequence),
                lambda *args: None, scope_keys=['group:trim-fixture'])
            result['publications'] += 1
            failure.save(output / 'result.json', result)
        def held_foreground():
            return old(FOREGROUND_SQL, settings={**limits, 'log_comment': 'F_TRIM_OLD_OVERLAP'})
        def await_foreground():
            for _ in range(100):
                observed = control.query(foreground_probe_sql())
                if observed.result_rows:
                    result.setdefault('overlap_observations', []).extend(
                        dict(zip(observed.column_names, row)) for row in observed.result_rows)
                    failure.save(output / 'result.json', result)
                    return
                time.sleep(.02)
            raise TimeoutError('native foreground overlap was not observed')
        with ThreadPoolExecutor(max_workers=2) as pool:
            held = pool.submit(held_foreground)
            await_foreground()
            old_store = Store(SimpleNamespace(query=old), journal)
            try:
                with failure.operation(output, stage='native_preflight', cell='old_capture', operation='trim'):
                    pool.submit(journal.trim_batch, old_store.trim).result(timeout=5)
            except ProgrammingError as error:
                result['old_capture_failure'] = failure.details(error)
                if 'concurrent queries within the same session' not in str(error):
                    raise
            else:
                raise ValueError('old bound-method capture did not reproduce ProgrammingError')
            held.result(timeout=5)
            # Repeat the same overlap with the repaired method dispatch.
            held = pool.submit(held_foreground)
            await_foreground()
            trimmed = pool.submit(journal.trim_batch, store.trim).result(timeout=5)
            held.result(timeout=5)
        if trimmed != 2 or journal.trim_batch(store.trim) != 0:
            raise ValueError('trim did not drain both dirty readers')
        for reader in ('reader-a', 'reader-b'):
            actual = store.rows(f.cache_sql(reader, ['trim-fixture']))
            if len(actual) != 200 or {row['doc_id'] for row in actual} != {'trim-' + str(i).zfill(3) for i in range(5, 205)}:
                raise ValueError('native trimmed logical window differs')
        control.command('SYSTEM FLUSH LOGS')
        from arm_satellite_sql import literal
        native = control.query('SELECT query_id,exception_code,read_rows,read_bytes,written_rows FROM system.query_log '
            'WHERE query_id IN (' + ','.join(literal(value) for value in query_ids) + ") AND type='QueryFinish'")
        result['native'] = [dict(zip(native.column_names, row)) for row in native.result_rows]
        if {row['query_id'] for row in result['native']} != set(query_ids) or any(int(row['exception_code']) for row in result['native']):
            raise ValueError('native fixture query attribution incomplete')
        result.update(outcome='PASS', readers=2, publications=205, logical_cap=200,
            overlap_observed=True, journal_pending=journal.pending())
    except BaseException as error:
        result.update(outcome='STOP', **failure.details(error))
        failure.persist(output, error, stage='native_trim_fixture')
        raise
    finally:
        # Even a harness/probe failure keeps correlated engine evidence before
        # this function returns to the owner which stops the fixture container.
        failure.save(output / 'result.json', result)
        try:
            control.command('SYSTEM FLUSH LOGS')
            from arm_satellite_sql import literal
            observed = control.query('SELECT query_id,toString(type) AS type,exception_code,exception,stack_trace,'
                'read_rows,read_bytes,written_rows FROM system.query_log WHERE (query_id IN ('
                + (','.join(literal(value) for value in query_ids) or "''")
                + ") OR log_comment IN ('F_TRIM_OLD_OVERLAP','F_TRIM_NATIVE')) AND type IN "
                "('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
            result['stopped_native'] = [dict(zip(observed.column_names, row)) for row in observed.result_rows]
        except BaseException as diagnostic_error:
            result['native_collection_failure'] = failure.details(diagnostic_error)
        result['completed_utc'] = datetime.now(UTC).isoformat()
        failure.save(output / 'result.json', result)  # Before any engine/client cleanup.
        journal.close()
        control.close()
    return result
