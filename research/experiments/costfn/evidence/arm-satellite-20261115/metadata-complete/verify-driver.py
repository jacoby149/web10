"""Full metadata multiset gate; no serving or performance claim."""
from pathlib import Path
import sys

ROOT = Path('/opt/satellite')
sys.path.insert(0, str(ROOT / 'repo/research/experiments/costfn'))
import arm_satellite_runtime as runtime
import arm_satellite_verify as verify
import restore_realism as restore
import restore_dataset

session = runtime.Session(ROOT)
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned parity ClickHouse')
    result = verify.verify(ROOT)
    print('[satellite-parity] outcome=' + result['outcome'], flush=True)
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    print('[satellite-parity] owned containers stopped', flush=True)
