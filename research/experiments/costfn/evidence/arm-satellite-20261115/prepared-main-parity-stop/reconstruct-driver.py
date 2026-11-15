"""Only native query-log reads and read-only reconstruction after parity STOP."""
import json
import os
from pathlib import Path
import subprocess
import sys

BASE = Path('/opt/satellite')
ROOT = BASE / 'serve-retry2'
HERE = BASE / 'repo/research/experiments/costfn'
sys.path.insert(0, str(HERE))
import arm_satellite_runtime as runtime
import arm_satellite_counts as counts
import restore_realism as restore
import restore_dataset

session = runtime.Session(ROOT)
result = json.loads((ROOT / 'serve-probe/config-p.json').read_bytes())
if result['outcome'] != 'INVALID_STOP':
    raise ValueError('diagnosis requires the preserved invalid stop')
output = ROOT / 'diagnosis'
output.mkdir(mode=0o700, exist_ok=False)
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned diagnostic ClickHouse')
    session.verify_envelope()
    generation, _ = counts.generation(session)
    if generation != json.loads((ROOT / 'counts-batch-p2/result.json').read_bytes())['canonical_generation']:
        raise ValueError('source changed; do not reconstruct')
    ids = [query['query_id'] for sample in result['samples'] for query in sample['native_queries']]
    quoted = ','.join("'" + value + "'" for value in ids)
    rows, _ = session.rows('diagnostic_native_sql', "SELECT query_id,query,lower(hex(SHA256(query))) AS sql_sha256,"
        "read_rows,read_bytes,query_duration_ms FROM system.query_log WHERE query_id IN (" + quoted
        + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') ORDER BY query_start_time_microseconds")
    (output / 'private-queries.json').write_text(json.dumps(rows, indent=2) + '\n')
    shutil_source = BASE / 'reconstruct-container.py'
    (output / 'container.py').write_bytes(shutil_source.read_bytes())
    command = [*session.compose, 'run', '--rm', '-T', '--no-deps',
               '-v', str(ROOT / 'serve-state') + ':/satellite-state:ro',
               '-v', str(ROOT / 'reference') + ':/satellite-reference:ro',
               '-v', str(output) + ':/satellite-diagnosis',
               '-e', 'SATELLITE_CONFIG_P=1', '-e', 'SATELLITE_SERVE_STATE=/satellite-state',
               'api', 'uv', 'run', 'python', '/satellite-diagnosis/container.py']
    completed = subprocess.run(command, env=session.env, capture_output=True, timeout=300)
    (output / 'process.stdout').write_bytes(completed.stdout)
    (output / 'process.stderr').write_bytes(completed.stderr)
    completed.check_returncode()
    closing, _ = counts.generation(session)
    if closing != generation:
        raise ValueError('canonical data changed during reconstruction')
    print((output / 'report.json').read_text(), flush=True)
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    owned = restore.command(['docker'], session.env, 'ps', '-q', '--filter',
                            'label=com.docker.compose.project=web10-costfn-frozen-satellite-p1').decode().split()
    if owned:
        restore.command(['docker'], session.env, 'stop', '-t', '20', *owned, timeout=120)
