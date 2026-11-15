"""Read-only failure attribution after count setup STOP; never retry a build."""
from datetime import UTC, datetime
import json
from pathlib import Path
import sys

ROOT = Path('/opt/satellite')
sys.path.insert(0, str(ROOT / 'repo/research/experiments/costfn'))
import arm_satellite_runtime as runtime
import restore_realism as restore

session = runtime.Session(ROOT)
envelope = session.verify_envelope()
result = json.loads((ROOT / 'counts/result.json').read_bytes())
if result['outcome'] != 'STOP':
    raise ValueError('diagnostic requires the retained failed build')
ledger = [json.loads(line) for line in (ROOT / 'evidence/query-ledger.jsonl').read_text().splitlines()]
failed = [row for row in ledger if row.get('phase') == 'finish' and row.get('success') is False]
if len(failed) != 1:
    raise ValueError('unexpected failure inventory; inspect rather than choose')
query_id = failed[0]['query_id']
session.query('diagnostic_flush', 'SYSTEM FLUSH LOGS')
native, _ = session.rows('diagnostic_failed_count',
    "SELECT query_id,toString(type) AS type,query_duration_ms,read_rows,read_bytes,memory_usage,"
    "exception_code,exception,lower(hex(SHA256(query))) AS sql_sha256,"
    "ProfileEvents['ExternalSortWritePart'] AS external_sort_parts,"
    "ProfileEvents['ExternalAggregationWritePart'] AS external_aggregation_parts "
    "FROM system.query_log WHERE query_id='" + query_id + "' AND type IN ('ExceptionBeforeStart','ExceptionWhileProcessing')")
if len(native) != 1:
    raise ValueError('exact native failure receipt missing')
parts, _ = session.rows('diagnostic_count_parts',
    "SELECT name,rows,bytes_on_disk FROM system.parts WHERE database='web10' AND table='counting_numbers' AND active ORDER BY name")
container = restore.command(session.compose, session.env, 'ps', '-q', 'clickhouse').decode().strip()
state = json.loads(restore.command(['docker'], session.env, 'inspect', '--format', '{{json .State}}', container))
report = {'kind': 'SATELLITE_COUNT_SETUP_FAILURE_DIAGNOSIS', 'utc': datetime.now(UTC).isoformat(),
          'droplet_id': session.host_id, 'envelope': envelope, 'failed_label': failed[0]['label'],
          'native': native[0], 'counting_parts': parts, 'clickhouse_container_state': state,
          'T1': 'NOT_ESTABLISHED', 'T2': 'NOT_RUN', 'new_build_started': False,
          'partial_main_comparisons': result['scopes'][0]['comparisons'],
          'partial_main_values_note': 'all checked main-scope values are zero; positive and shared-attachment fixtures not reached',
          'fanout': False, 'lease_extended': False}
(ROOT / 'counts/failure-diagnosis.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
