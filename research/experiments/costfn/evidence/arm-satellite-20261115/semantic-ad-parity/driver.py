"""New operator-approved ad comparator; preserve both earlier invalid attempts."""
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
import arm_satellite_ad_parity as ads
import arm_satellite_counts as counts
import arm_satellite_probe as probe
import arm_satellite_runtime as runtime
import restore_dataset
import restore_realism as restore

original = runtime.Session(BASE)
if (original.deadline - datetime.now(UTC)).total_seconds() < 780:
    raise ValueError('insufficient original window; no extension')
ROOT = BASE / 'serve-semantic3'
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
    raise ValueError('original private reference changed; do not rewrite it')
try:
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned semantic-gate ClickHouse')
    envelope = session.verify_envelope()
    generation, _ = counts.generation(session)
    if generation != json.loads((ROOT / 'counts-batch-p2/result.json').read_bytes())['canonical_generation']:
        raise ValueError('source changed; no reference reuse')
    candidates, candidate_id = session.rows('ad_oracle_superset', ads.candidate_sql(), setup_seconds=180)
    ids = [row['doc_id'] for row in candidates]
    if not ids:
        raise ValueError('expected nonempty inventory; do not bypass')
    heads, heads_id = session.rows('ad_oracle_current_heads', ads.eligible_heads_sql(ids), setup_seconds=180)
    payloads, payload_id = session.rows('ad_oracle_canonical_payloads', ads.payload_sql([(row['author_key'], row['doc_id']) for row in heads]), setup_seconds=180)
    eligible = []
    for row in payloads:
        body = json.loads(row['body'])
        if isinstance(body, dict) and body.get('status') == 'active':
            eligible.append({**row, 'body': body})
    if not eligible or len(eligible) != len(heads):
        raise ValueError('mixed/empty active pool needs separate placement gate; do not assume omissions valid')
    raw = json.dumps(eligible, sort_keys=True).encode()
    (ROOT / 'reference/eligible-node-ads.json').write_bytes(raw)
    (ROOT / 'ad-ruling.json').write_text(json.dumps({
        'kind': 'OPERATOR_AD_SEMANTIC_PARITY_RULING', 'quote': 'the validator just has to check that all ads were appropriate / proper, no ones that shouldnt have been attached getting attached',
        'original_fail_preserved': True, 'production_ordering_changed': False,
        'canonical_generation': generation, 'eligible_payload_sha256': hashlib.sha256(raw).hexdigest(),
        'candidate_count': len(candidates), 'eligible_at_cutoff_with_ties': len(eligible), 'all_candidates_at_cutoff_active': True,
        'native_oracle_query_ids': [candidate_id, heads_id, payload_id], 'envelope': envelope,
        'scope': 'exact core/pinned/placement; canonical active current linked node-ad payloads, no creative identity equality',
        'deadline_utc': session.operation['deadline_utc'], 'fanout': False}, indent=2) + '\n')
    closing, _ = counts.generation(session)
    if closing != generation:
        raise ValueError('source changed during eligibility setup')
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
                            'semantic-ad Config P API')
    print('[satellite-semantic3] independent eligible inventory built; full API sequence starts', flush=True)
    result = asyncio.run(probe.probe(ROOT))
    print(json.dumps({key: result.get(key) for key in ('outcome', 'T2', 'diagnostic_targets_met', 'performance_observations')}, indent=2), flush=True)
    if result['T2'] != 'PASS':
        raise RuntimeError('new parity/native safety stop; no next step')
finally:
    restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
    print('[satellite-semantic3] all owned containers stopped', flush=True)
