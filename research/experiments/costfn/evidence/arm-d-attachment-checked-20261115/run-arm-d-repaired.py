"""One operator-approved repaired K20 fixed-inventory native diagnostic."""
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import uuid

ROOT = Path('/opt/arm-t')
HERE = ROOT / 'repo/research/experiments/costfn'
sys.path.insert(0, str(HERE))
import arm_d_attachment_repair as repair
import arm_t
import restore_dataset
import restore_realism as restore
import smoke_realism

assert arm_t.digitalocean_id() == 619371600
approval = json.loads((ROOT / 'arm-d-repair-approval.json').read_bytes())
deadline = arm_t._utc(approval['deadline_utc'])
assert deadline == arm_t._utc('2026-11-15T05:17:51Z')
assert approval['approved_by'] == 'Jacob' and approval['droplet_id'] == 619371600
assert approval['source_sha256'] == arm_t.digest(HERE / 'arm_d_attachment_repair.py')
assert (deadline - datetime.now(UTC)).total_seconds() > 180
out = ROOT / 'arm-d-attachment-checked'
out.mkdir(exist_ok=False)
prior = json.loads((ROOT / 'arm-d-realism-r1/result.json').read_bytes())
oracle = json.loads((ROOT / 'arm-d-realism-r1/oracle.json').read_bytes())
assert prior['dataset_id'] == arm_t.DATASET and prior['row_count_verified']
restored = json.loads((ROOT / 'restore.json').read_bytes())
assert restored['dataset_id'] == arm_t.DATASET
compose = restore.commands(restored['project'], restored['api_port'], restored['overlay'])
env = {**os.environ, 'API_PORT': str(restored['api_port']), 'COSTFN_RESEARCH_DIR': str(HERE),
       'COSTFN_REPO_DIR': str(ROOT / 'repo')}
result = {'kind': 'ARM_D_ATTACHMENT_CHECKED_FIXED_INVENTORY_DIAGNOSTIC', 'outcome': 'IN_PROGRESS',
          'parity': 'NOT_RUN', 'steps': [], 'observations': [], 'measured_trials': [],
          'dataset_id': arm_t.DATASET, 'droplet_id': 619371600, 'deadline_utc': approval['deadline_utc'],
          'scope': 'fixed preserved author inventory, native main only; not full runtime enumeration/request cost, HTTP or p95',
          'K1000': 'NOT_AUTHORIZED', 'full_sequence': 'NOT_ATTEMPTED',
          'prior_census_receipt_sha256': arm_t.digest(ROOT / 'arm-d-realism-r1/result.json'),
          'prior_oracle_sha256': arm_t.digest(ROOT / 'arm-d-realism-r1/oracle.json'),
          'source_sha256': {n: arm_t.digest(HERE / n) for n in
                            ['arm_d_attachment_repair.py', 'arm_t_rewrite.py', 'smoke_realism.py']},
          'driver_sha256': arm_t.digest(__file__)}


def save():
    with (out / 'result.json').open('w') as stream:
        json.dump(result, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def query(label, sql, measured=False):
    remaining = int((deadline - datetime.now(UTC)).total_seconds()) - 60
    assert remaining > 20, 'original lease exhausted'
    cap = 10 if measured else min(120, remaining)
    qid = 'arm-d-repaired-' + uuid.uuid4().hex
    step = {'label': label, 'query_id': qid, 'setup': not measured,
            'sql_sha256': hashlib.sha256(sql.encode()).hexdigest()}
    result['steps'].append(step)
    save()
    print('[arm-d-repaired] start', label, qid, flush=True)
    start = time.monotonic()
    try:
        value = restore.command(compose, env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
            '--user', 'web10', '--password', 'web10', '--database', 'web10', '--query_id', qid,
            '--max_execution_time', str(cap), '--max_memory_usage', str(22 * 1024**3),
            '--max_threads', '4', '--query', sql, timeout=cap + 15).decode().strip()
        return value, qid
    finally:
        step['elapsed_seconds'] = round(time.monotonic() - start, 3)
        save()
        print('[arm-d-repaired] end', label, step['elapsed_seconds'], flush=True)


def rows(label, sql):
    return json.loads(query(label, sql + ' FORMAT JSON')[0])['data']


def native(qid):
    query('flush_native', 'SYSTEM FLUSH LOGS')
    found = rows('native_receipt', "SELECT query_id,query_duration_ms,read_rows,read_bytes,memory_usage,exception_code "
        "FROM system.query_log WHERE query_id='" + qid + "' AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
    assert len(found) == 1, 'missing or ambiguous native query receipt'
    return found[0]


def identities():
    return rows('identities', "SELECT name,toString(uuid) AS uuid,sorting_key FROM system.tables "
        "WHERE database='web10' AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name")


save()
try:
    result['host_resources'] = arm_t.host_resources()
    restore.command(compose, env, 'up', '-d', '--no-deps', 'clickhouse', timeout=90)
    restore_dataset.wait_for(lambda: query('ready', 'SELECT 1')[0] == '1', 'owned ClickHouse')
    assert query('engine', 'SELECT version()')[0] == '24.8.14.39'
    container = restore.command(compose, env, 'ps', '-q', 'clickhouse').decode().strip()
    assert int(restore.command(['docker'], env, 'inspect', '--format', '{{.HostConfig.Memory}}', container)) == 28 * 1024**3
    assert int(query('server_cap', "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")[0]) == 22 * 1024**3
    result['original_identities_before'] = identities()
    assert result['original_identities_before'] == prior['original_identities_after']
    settled = rows('settled_census', "SELECT table,partition_id,count() AS parts,sum(rows) AS rows,sum(marks) AS marks "
        "FROM system.parts WHERE database='web10' AND active AND table IN "
        "('documents','documents_d','doc_groups','doc_groups_t') GROUP BY table,partition_id ORDER BY table,partition_id")
    assert settled == prior['after_parts']
    result['settled_parts'] = settled
    assert not rows('merges', "SELECT table FROM system.merges WHERE database='web10'")
    copy_key = rows('copy_key', 'SHOW CREATE TABLE documents_d')[0]['statement']
    assert 'ORDER BY (author_key, created_at, doc_id, updated_at)' in copy_key
    expected = json.loads((ROOT / 'evidence/consolidation-setup.json').read_bytes())['after_fingerprints']
    result['fresh_fingerprints'] = {}
    for table in ('documents', 'doc_groups', 'documents_d'):
        columns = rows('columns_' + table, "SELECT name FROM system.columns WHERE database='web10' AND table='" + table + "' ORDER BY position")
        names = [r['name'] for r in columns]
        assert names and all(re.fullmatch('[A-Za-z_][A-Za-z_0-9]*', n) for n in names)
        full = 'tuple(' + ','.join('`' + n + '`' for n in names) + ')'
        digest = rows('fingerprint_' + table, 'SELECT count() AS rows,sum(cityHash64(' + full + ')) AS hash_sum,groupBitXor(cityHash64(' + full + ')) AS hash_xor FROM ' + table)
        assert digest == expected['documents' if table == 'documents_d' else table]
        result['fresh_fingerprints'][table] = digest
        save()
    inventory = {row['group_id']: row['actual_attached_authors'] for row in prior['author_sets']}
    compiled = (ROOT / 'arm-d-realism-r1/compiled.sql').read_text().strip()
    sql = repair.transform(compiled, prior['reader'], prior['groups_including_self'], inventory)
    (out / 'treated.sql').write_text(sql + '\n')
    result['treated_sql_sha256'] = hashlib.sha256(sql.encode()).hexdigest()
    result['author_sets'] = prior['author_sets']
    for index, phase in enumerate(['warmup', 'measured', 'measured', 'measured']):
        try:
            raw, qid = query(phase + '_main', sql + ' FORMAT JSON', measured=True)
        except Exception:
            qid = result['steps'][-1]['query_id']
            metrics = native(qid)
            result['observations'].append({'phase': phase, 'index': index, **metrics})
            result['outcome'] = 'NATIVE_FAILURE_STOP'
            if int(metrics['read_rows']) > 10_000_000:
                result['anomaly'] = 'MAIN_EXCEEDS_10M_ROWS'
            save()
            break
        (out / (phase + '-' + str(index) + '-native-response.json')).write_text(raw + '\n')
        metrics = native(qid)
        observation = {'phase': phase, 'index': index, **metrics}
        result['observations'].append(observation)
        returned = repair.native_rows(raw)
        try:
            smoke_realism.validate_rows(returned, oracle['expected'], oracle['profiles'], oracle['attachments'], oracle['counts'])
        except ValueError as error:
            result.update(outcome='INVALID_STOP', parity='FAIL', parity_error=str(error))
            break
        observation['exact_projected_parity'] = True
        result['parity'] = 'PASS'
        if phase == 'measured':
            result['measured_trials'].append(observation)
        if int(metrics['read_rows']) > 10_000_000:
            result.update(outcome='STRUCTURAL_ANOMALY_STOP', anomaly='MAIN_EXCEEDS_10M_ROWS')
            break
        save()
    else:
        result['outcome'] = 'FIXED_INVENTORY_NATIVE_OBSERVATIONS_COMPLETE'
except Exception as error:
    result.update(outcome='SETUP_OR_RECEIPT_FAILURE_STOP', error_class=type(error).__name__)
    raise
finally:
    try:
        result['original_identities_after'] = identities()
        result['original_identities_unchanged'] = result['original_identities_after'] == prior['original_identities_after']
    finally:
        restore.command(compose, env, 'stop', '--timeout', '30', 'clickhouse', timeout=90)
        result['completed_utc'] = datetime.now(UTC).isoformat()
        save()
        print('[arm-d-repaired] STOP', result['outcome'], result['parity'], flush=True)
