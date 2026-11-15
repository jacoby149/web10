"""Untreated live inventory with actual post-gate scopes; no satellite builds."""
import asyncio
import json
import os
from pathlib import Path
import sys
import urllib.request

ROOT = Path('/opt/satellite')
HERE = ROOT / 'repo/research/experiments/costfn'
sys.path.insert(0, str(HERE))
import arm_satellite_runtime as runtime
import arm_satellite_profile as profile
import restore_realism as restore
import restore_dataset

session = runtime.Session(ROOT)
session.verify_envelope()
scopes = ROOT / 'scope-observer'
scopes.mkdir(mode=0o700, exist_ok=False)
env = {**session.env, 'SATELLITE_OPERATION': str(ROOT / 'evidence/operation.json'),
       'SATELLITE_SCOPES_DIR': str(scopes)}
compose = session.compose[:-2] + ['-f', str(HERE / 'arm_satellite_profile.compose.yml'), *session.compose[-2:]]
restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=180)
restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=5).status == 200,
                        'untreated scope-observing API')
result = asyncio.run(profile.profile(ROOT))
summary = {'kind': result['kind'], 'droplet_id': result['droplet_id'],
           'stages': [{k: stage[k] for k in ('kind', 'http_completed', 'elapsed_ms', 'read_rows', 'read_bytes')}
                      for stage in result['stages']],
           'actual_scope_services': {kind: {service: len(groups) for service, groups in mapping.items()}
                                     for kind, mapping in result['actual_readable_by_kind'].items()},
           'complete_sequence_parity': result['complete_sequence_parity'], 'satellite_builds_started': False}
(ROOT / 'profile/summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2), flush=True)
