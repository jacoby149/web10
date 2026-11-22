"""Repaired T2 attempt on the same admitted store; preserve the first attempt."""
import asyncio
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import shutil
import sys
import urllib.request

BASE = Path('/opt/satellite')
HERE = BASE / 'repo/research/experiments/costfn'
sys.path.insert(0, str(HERE))
import arm_satellite_counts as counts
import arm_satellite_probe as probe
import arm_satellite_runtime as runtime
import restore_dataset
import restore_realism as restore

original = runtime.Session(BASE)
if (original.deadline - datetime.now(UTC)).total_seconds() < 1200:
    raise ValueError('insufficient original window; no retry or extension')
ROOT = BASE / 'serve-retry2'
ROOT.mkdir(mode=0o700, exist_ok=False)
for relative in ('evidence/operation.json', 'restore.json', 'counts-batch-p2/result.json',
                 'metadata/result.json', 'metadata-parity/result.json', 'presence/result.json',
                 'profile/inventory.json', 'reference/rows.json', 'reference/summary.json'):
    target = ROOT / relative
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    shutil.copyfile(BASE / relative, target)
(ROOT / 'input').symlink_to(BASE / 'input', target_is_directory=True)
session = runtime.Session(ROOT)
reference = json.loads((ROOT / 'reference/summary.json').read_bytes())
if hashlib.sha256((ROOT / 'reference/rows.json').read_bytes()).hexdigest() != reference['rows_sha256']:
    raise ValueError('private independent reference changed')
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned retry ClickHouse')
    envelope = session.verify_envelope()
    generation, _ = counts.generation(session)
    expected = json.loads((ROOT / 'counts-batch-p2/result.json').read_bytes())['canonical_generation']
    if generation != expected:
        raise ValueError('changed source; do not reuse independent reference or count scopes')
    reuse = {'kind': 'CONFIG_P_REPAIRED_T2_ATTEMPT', 'started_utc': datetime.now(UTC).isoformat(),
             'previous_attempt_preserved': True, 'same_store_not_fresh_trial': True,
             'canonical_generation': generation, 'private_reference_sha256': reference['rows_sha256'],
             'deadline_utc': session.operation['deadline_utc'], 'envelope': envelope,
             'repair': 'setup timeout restored; marked reads stay10s/22GiB/10M rows', 'fanout': False}
    (ROOT / 'reuse.json').write_text(json.dumps(reuse, indent=2) + '\n')
    state = ROOT / 'serve-state'
    state.mkdir(mode=0o700, exist_ok=False)
    for name, relative in {'operation': 'evidence/operation.json', 'counts': 'counts-batch-p2/result.json',
                          'metadata': 'metadata/result.json', 'parity': 'metadata-parity/result.json',
                          'profile': 'profile/inventory.json', 'presence': 'presence/result.json'}.items():
        shutil.copyfile(ROOT / relative, state / (name + '.json'))
    env = {**session.env, 'SATELLITE_SERVE_STATE': str(state)}
    compose = session.compose[:-2] + ['-f', str(HERE / 'arm_satellite_serve.compose.yml'), *session.compose[-2:]]
    restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=120)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=5).status == 200,
                            'repaired isolated Config P API')
    print('[satellite-retry2] repaired full API diagnostic start; original deadline unchanged', flush=True)
    result = asyncio.run(probe.probe(ROOT))
    print(json.dumps({key: result.get(key) for key in ('outcome', 'T2', 'diagnostic_targets_met', 'performance_observations')}, indent=2), flush=True)
    if result['T2'] != 'PASS':
        raise RuntimeError('T2/native/parity stop; no further sequence')
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    print('[satellite-retry2] all owned containers stopped', flush=True)
