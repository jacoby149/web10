"""Remaining pointer metadata only; p2 T1 required, exploratory views stay off."""
import json
from pathlib import Path
import sys

ROOT = Path('/opt/satellite')
sys.path.insert(0, str(ROOT / 'repo/research/experiments/costfn'))
import arm_satellite_metadata as metadata
import arm_satellite_runtime as runtime
import restore_dataset
import restore_realism as restore

session = runtime.Session(ROOT)
receipt = ROOT / 'counts-batch-p2/result.json'
metadata.count_receipt(ROOT, session.host_id, receipt)  # Before restarting.
print('[satellite-metadata] p2 T1 admitted; views off; original deadline unchanged', flush=True)
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned metadata ClickHouse')
    result = metadata.build(ROOT, counts_receipt=receipt)
    print(json.dumps({key: result[key] for key in ('kind', 'outcome', 'T2', 'count_table', 'view_treatment')}, indent=2), flush=True)
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    print('[satellite-metadata] owned containers stopped; no automatic feed probe', flush=True)
