"""Admitted-host tiny native checker controls BEFORE the full archive restore.

No measured workload, provisioning, API/grant substitution or production data.
Uses a separate exact-name container; always stops it before the main restore.
"""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import subprocess
import time
import uuid

import arm_f_runtime
import arm_t
import arm_satellite_metadata as metadata
import arm_satellite_reconcile as reconcile

IMAGE = 'clickhouse/clickhouse-server:24.8.14.39@sha256:1ffa82edee000a42c09313bd9f1293d94c570aee74babc1b3ca9983a35fa597b'


def run(root, *, trim_only=False, engagement_only=False, engagement_engine=None):
    root = Path(root)
    approval = json.loads((root / 'admission.json').read_bytes())
    host = arm_t.digitalocean_id()
    deadline = arm_f_runtime.admitted(approval, host)
    engine, image = '24.8.14.39', IMAGE
    if engagement_engine is not None:
        import engagement_modern as modern
        modern.admitted(approval, host)
        if engagement_engine != modern.ENGINE or not engagement_only or trim_only:
            raise ValueError('modern native rehearsal is engagement-only')
        engine, image = modern.ENGINE, modern.IMAGE
    output = root / 'checker-native-fixture'
    output.mkdir(mode=0o700, exist_ok=False)
    name = 'fanout-checker-fixture-' + uuid.uuid4().hex[:12]
    if subprocess.check_output(['docker', 'ps', '-q']).strip():
        raise ValueError('tiny preflight must not share a running measured engine')
    result = dict(kind='NATIVE_BATCHED_CHECKER_PREFLIGHT', outcome='RUNNING', cases=[], droplet_id=host,
                  scope='tiny native SQL/semantic controls only; not full-store memory/parity or F performance')
    class Session:
        def query(self, label, sql, *, setup_seconds=10, settings=None):
            arm_f_runtime.admitted(approval, host)
            if (deadline - datetime.now(UTC)).total_seconds() < 300:
                raise ValueError('original cleanup margin exhausted')
            query_id = 'checker-fixture-' + uuid.uuid4().hex
            (output / (query_id + '.sql')).write_text(sql)
            args = ['docker', 'exec', name, 'clickhouse-client', '--user', 'web10', '--password', 'web10',
                '--database', 'web10', '--query_id', query_id, '--max_execution_time=10',
                '--read_overflow_mode=throw', '--result_overflow_mode=throw', '--max_threads=4']
            limits = {'max_memory_usage': 22 * 1024**3, 'max_rows_to_read': 10_000_000, **(settings or {})}
            args += ['--' + key + '=' + str(value) for key, value in limits.items()]
            args += ['--query', sql]
            completed = subprocess.run(args, capture_output=True, timeout=30)
            if completed.returncode:
                (output / (query_id + '.stderr')).write_bytes(completed.stderr)
                error = RuntimeError('native fixture SQL failed; exact private stderr retained')
                error.stderr = completed.stderr
                raise error
            return completed.stdout.decode().strip(), query_id
        def rows(self, label, sql, **kwargs):
            text, query_id = self.query(label, sql + ' FORMAT JSON', **kwargs)
            return json.loads(text)['data'], query_id
        def native(self, query_id):
            self.query('flush_fixture_log', 'SYSTEM FLUSH LOGS')
            rows, _ = self.rows('fixture_native', 'SELECT query_id,query_duration_ms,read_rows,read_bytes,memory_usage,'
                "exception_code FROM system.query_log WHERE query_id='" + query_id + "' AND type='QueryFinish'")
            if len(rows) != 1 or int(rows[0]['exception_code']) or int(rows[0]['read_rows']) > 10_000_000:
                raise ValueError('native fixture receipt/stop-rule failure')
            return rows[0]
    session = Session()
    session.engagement_engine = engagement_engine
    config = Path(__file__).parent / 'clickhouse-config/realism-memory.xml'
    try:
        subprocess.run(['docker', 'run', '-d', '--rm', '--name', name, '--memory', str(28 * 1024**3),
            '--label', 'web10.checker-fixture=' + str(host), '-e', 'CLICKHOUSE_DB=web10',
            '-e', 'CLICKHOUSE_USER=web10', '-e', 'CLICKHOUSE_PASSWORD=web10',
            '-v', str(config) + ':/etc/clickhouse-server/config.d/fanout-memory.xml:ro', image],
            capture_output=True, check=True, timeout=180)
        ready = False
        for _ in range(90):
            state = subprocess.run(['docker', 'exec', name, 'cat', '/proc/1/comm'], capture_output=True)
            if state.returncode == 0 and state.stdout.startswith(b'clickhouse'):
                try:
                    version, _ = session.query('fixture_version', 'SELECT version()')
                    if version == engine:
                        ready = True
                        break
                except RuntimeError:
                    pass
            time.sleep(1)
        if not ready:
            raise ValueError('pinned fixture engine not ready')
        limit, _ = session.query('fixture_memory', "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")
        if int(limit) != 22 * 1024**3:
            raise ValueError('fixture server memory cap differs')
        if engagement_only:
            if approval.get('engagement_ref_admitted') is not True:
                raise ValueError('explicit engagement experiment admission required')
            from engagement_fixture import run as engagement_fixture
            result['engagement'] = engagement_fixture(session, root)
            result.update(outcome='PASS', engine=engine, server_bytes=int(limit))
            return result
        if trim_only:
            from arm_f_trim_native import run as trim_fixture
            result['trim'] = trim_fixture(name, root)
            result.update(outcome='PASS', engine=engine, server_bytes=int(limit))
            return result
        session.query('fixture_docs', "CREATE TABLE documents (doc_id String,author_key String,collection_name String,body String,"
            "ref_value String,tags Array(String),created_at DateTime64(3),updated_at DateTime64(3),deleted UInt8) "
            "ENGINE=ReplacingMergeTree(updated_at) ORDER BY (author_key,doc_id)")
        session.query('fixture_links', "CREATE TABLE doc_groups (doc_id String,group_id String,created_at DateTime64(3),"
            "updated_at DateTime64(3),deleted UInt8) ENGINE=ReplacingMergeTree(updated_at) ORDER BY (doc_id,group_id)")
        session.query('fixture_layout', arm_t.DDL + ' SETTINGS index_granularity=64')
        t = "toDateTime64('2026-11-15 00:00:00',3)"
        def doc_values(doc, author, version, deleted):
            edited = doc == 'edited' and version == 1
            body = '{"post_id":"current-target","repost_of":"current-repost"}' if edited else '{}'
            return ("('" + doc + "','" + author + "','posts','" + body + "','"
                    + ('current-ref' if edited else 'ref') + "',['" + ('edited' if edited else 'tag')
                    + "']," + t + ',' + t + '+' + str(version) + ',' + str(deleted) + ')')
        session.query('fixture_insert_docs', "INSERT INTO documents VALUES " + ','.join(
            doc_values(doc, author, version, deleted) for doc, author, version, deleted in
            [('shared','a',0,0), ('shared','b',0,0), ('edited','a',0,0), ('edited','a',1,0), ('dead','a',0,0), ('dead','a',1,1)]))
        session.query('fixture_insert_links', 'INSERT INTO doc_groups VALUES ' + ','.join(
            "('" + doc + "','" + group + "'," + t + ',' + t + '+' + str(version) + ',' + str(deleted) + ')'
            for doc, group, version, deleted in [('shared','g1',0,0),('shared','g2',0,0),('edited','g1',0,0),
                ('shared','g1',1,0),('dead','g1',0,0),('edited','removed',0,0),('edited','removed',1,1)]))
        session.query('fixture_build', metadata.TRANSPOSE_BUILD)
        _, _, _, checked = reconcile.transpose(session, output / 'valid', metadata.TRANSPOSE_CHECK, batches=2)
        if checked['totals']['matched'] != 5:
            raise ValueError('native positive/history/shared/same-ID-author fixture cardinality differs')
        result['cases'].append({'case': 'positive_histories_shared_routes_same_id_authors', 'outcome': 'PASS'})
        for case in ('field_mutation', 'orphan', 'duplicate_cancels_missing'):
            session.query('fixture_reset', 'TRUNCATE TABLE doc_groups_t')
            session.query('fixture_rebuild', metadata.TRANSPOSE_BUILD)
            if case == 'field_mutation':
                session.query('fixture_bad_field', "ALTER TABLE doc_groups_t UPDATE tags=['wrong'] WHERE doc_id='edited' SETTINGS mutations_sync=2")
            elif case == 'orphan':
                session.query('fixture_orphan', "INSERT INTO doc_groups_t SELECT group_id,created_at,'orphan',author_key,"
                    'link_created_at,updated_at,deleted,collection_name,tags,ref_value,comment_post_id,repost_of FROM doc_groups_t LIMIT 1')
            else:
                session.query('fixture_missing', "ALTER TABLE doc_groups_t DELETE WHERE doc_id='shared' AND author_key='b' AND group_id='g2' SETTINGS mutations_sync=2")
                session.query('fixture_duplicate', "INSERT INTO doc_groups_t SELECT * FROM doc_groups_t WHERE doc_id='shared' AND author_key='a' AND group_id='g1'")
            try:
                reconcile.transpose(session, output / case, metadata.TRANSPOSE_CHECK, batches=2)
            except ValueError as error:
                if str(error) != 'transpose exact batch mismatch; stop before next batch':
                    raise
                result['cases'].append({'case': case, 'outcome': 'DENIED_EXPECTED'})
            else:
                raise ValueError('native checker admitted deliberate corruption: ' + case)
        if approval.get('full_population_backfill_required') is True:
            from arm_f_population_fixture import run as population_fixture
            result['population_builder_rehearsal'] = population_fixture(session, root)['outcome']
        result.update(outcome='PASS', engine=engine, server_bytes=int(limit),
                      checker_source_sha256=hashlib.sha256(Path(reconcile.__file__).read_bytes()).hexdigest())
    except Exception as error:
        result.update(outcome='STOP', **__import__('arm_f_failure').details(error))
        raise
    finally:
        reconcile.persist(output / 'result.json', result)  # Failure evidence BEFORE container cleanup.
        subprocess.run(['docker', 'stop', '-t', '20', name], capture_output=True, timeout=60)
        reconcile.persist(output / 'result.json', result)
    print('[checker-native] tiny positive/negative controls PASS; full-store memory remains unproven', flush=True)
    return result
