"""Sequential canonical setup reference -> full API probe; always stop on failure."""
import asyncio
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path('/opt/satellite')
HERE = ROOT / 'repo/research/experiments/costfn'
sys.path.insert(0, str(HERE))
import arm_satellite_runtime as runtime
import arm_satellite_probe as probe
import restore_dataset
import restore_realism as restore

session = runtime.Session(ROOT)
presence = json.loads((ROOT / 'presence/result.json').read_bytes())
parity = json.loads((ROOT / 'metadata-parity/result.json').read_bytes())
if presence['outcome'] != 'PASS' or parity['outcome'] != 'PASS':
    raise ValueError('presence and independent metadata parity must pass before next step')
reference = ROOT / 'reference'
reference.mkdir(mode=0o700, exist_ok=False)
shutil.copyfile(ROOT / 'profile/inventory.json', reference / 'profile.json')
shutil.copyfile(ROOT / 'reference-container.py', reference / 'driver.py')
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned full-probe ClickHouse')
    session.verify_envelope()
    remaining = int((session.deadline - datetime.now(UTC)).total_seconds()) - 300
    if remaining < 1200:
        raise ValueError('insufficient original window for setup reference and full probe')
    command = [*session.compose, 'run', '--rm', '-T', '--no-deps', '-v', str(reference) + ':/satellite-reference',
               'api', 'uv', 'run', 'python', '/satellite-reference/driver.py']
    print('[satellite-full] independent original canonical/prepare reference start (setup, not serving)', flush=True)
    completed = subprocess.run(command, env=session.env, capture_output=True, timeout=min(1200, remaining))
    (reference / 'process.stdout').write_bytes(completed.stdout)
    (reference / 'process.stderr').write_bytes(completed.stderr)
    completed.check_returncode()
    print('[satellite-full] original prepared reference complete; boot gated Config P API', flush=True)
    state = ROOT / 'serve-state'
    state.mkdir(mode=0o700, exist_ok=False)
    for name, path in {'operation': 'evidence/operation.json', 'counts': 'counts-batch-p2/result.json',
                       'metadata': 'metadata/result.json', 'parity': 'metadata-parity/result.json',
                       'profile': 'profile/inventory.json', 'presence': 'presence/result.json'}.items():
        shutil.copyfile(ROOT / path, state / (name + '.json'))
    env = {**session.env, 'SATELLITE_SERVE_STATE': str(state)}
    compose = session.compose[:-2] + ['-f', str(HERE / 'arm_satellite_serve.compose.yml'), *session.compose[-2:]]
    restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=120)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=5).status == 200,
                            'gated Config P API')
    print('[satellite-full] T2 full API warmup/diagnostic sequence start', flush=True)
    result = asyncio.run(probe.probe(ROOT))
    print(json.dumps({key: result.get(key) for key in ('outcome', 'T2', 'diagnostic_targets_met', 'formal_T6')}, indent=2), flush=True)
    if result['T2'] != 'PASS':
        raise RuntimeError('T2/native safety stop; do not run another step')
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    owned = restore.command(['docker'], session.env, 'ps', '-q', '--filter',
                            'label=com.docker.compose.project=web10-costfn-frozen-satellite-p1').decode().split()
    if owned:
        restore.command(['docker'], session.env, 'stop', '-t', '20', *owned, timeout=120)
    print('[satellite-full] all owned containers stopped', flush=True)
