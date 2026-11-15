"""One approved p2 attempt; preserve p1 and always stop owned containers afterward."""
import json
from pathlib import Path
import sys

ROOT = Path('/opt/satellite')
sys.path.insert(0, str(ROOT / 'repo/research/experiments/costfn'))
import arm_satellite_batch_run as run
import arm_satellite_runtime as runtime
import restore_dataset
import restore_realism as restore

session = runtime.Session(ROOT)
run.approved(session, ROOT)  # Before restart, not merely before the first DDL.
print('[satellite-p2] approved same-host restart; limits/deadline unchanged', flush=True)
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'existing owned ClickHouse')
    result = run.build(ROOT)
    print(json.dumps({key: result[key] for key in ('kind', 'outcome', 'T1', 'droplet_id', 'final_table')}, indent=2), flush=True)
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    print('[satellite-p2] owned containers stopped; no automatic next experiment', flush=True)
