"""Complete Config P reproduction with independent oracle and native stage table.

Runs after fresh restore/P setup, before any native F build. Original P adapter,
source capture, oracle and historic receipts are not edited or relabelled.
"""
import asyncio
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request

import arm_satellite_ad_parity as ads
import arm_satellite_probe as probe
import arm_satellite_runtime as runtime
import arm_satellite_sql as typed
import restore_dataset
import restore_realism as restore


def run(root):
    root = Path(root)
    session = runtime.Session(root)
    here = Path(__file__).parent
    reference = root / 'reference'
    reference.mkdir(mode=0o700, exist_ok=False)
    shutil.copyfile(root / 'profile/inventory.json', reference / 'profile.json')
    shutil.copyfile(here / 'evidence/arm-satellite-20261115/full-api-setup-stop/reference-container.py', reference / 'driver.py')
    command = [*session.compose, 'run', '--rm', '-T', '--no-deps', '-v', str(reference) + ':/satellite-reference',
               'api', 'uv', 'run', 'python', '/satellite-reference/driver.py']
    print('[arm-f Step0] independent canonical/prepare reference start', flush=True)
    completed = subprocess.run(command, env=session.env, capture_output=True, timeout=1200)
    (reference / 'process.stdout').write_bytes(completed.stdout)
    (reference / 'process.stderr').write_bytes(completed.stderr)
    if completed.returncode:
        raise RuntimeError('independent reference setup failed; private diagnostic retained')
    candidates, _ = session.rows('step0_ad_oracle_superset', ads.candidate_sql(), setup_seconds=180)
    heads, _ = session.rows('step0_ad_oracle_heads', ads.eligible_heads_sql([r['doc_id'] for r in candidates]), setup_seconds=180)
    payloads, _ = session.rows('step0_ad_oracle_payloads', ads.payload_sql([(r['author_key'], r['doc_id']) for r in heads]), setup_seconds=180)
    eligible = [{**r, 'body': json.loads(r['body'])} for r in payloads if json.loads(r['body']).get('status') == 'active']
    if not eligible or len(eligible) != len(heads):
        raise ValueError('empty/mixed inventory needs its independent placement oracle, not an omission')
    (reference / 'eligible-node-ads.json').write_text(json.dumps(eligible, sort_keys=True))
    state = root / 'serve-state'
    state.mkdir(mode=0o700, exist_ok=False)
    for name, relative in {'operation': 'evidence/operation.json', 'counts': 'counts-batch-p2/result.json',
        'metadata': 'metadata/result.json', 'parity': 'metadata-parity/result.json',
        'profile': 'profile/inventory.json', 'presence': 'presence/result.json'}.items():
        shutil.copyfile(root / relative, state / (name + '.json'))
    stages = root / 'step0-stages'
    stages.mkdir(mode=0o700, exist_ok=False)
    overlay = root / 'step0-stage.overlay.json'
    overlay.write_text(json.dumps({'services': {'api': {'volumes': [str(stages) + ':/fanout-stages'],
        'environment': {'FANOUT_STAGE_DIR': '/fanout-stages'},
        'command': ['uv', 'run', 'uvicorn', 'arm_f_profile_api:application', '--host', '0.0.0.0',
                    '--port', '80', '--no-access-log']}}}))
    env = {**session.env, 'SATELLITE_SERVE_STATE': str(state)}
    compose = session.compose[:-2] + ['-f', str(here / 'arm_satellite_serve.compose.yml'), '-f', str(overlay), *session.compose[-2:]]
    restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=180)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=3).status == 200,
                            'stage-observed original P API')
    print('[arm-f Step0] original Config P warmup plus three diagnostic sequences', flush=True)
    verdict = None
    try:
        verdict = asyncio.run(probe.probe(root))
    finally:
        # Correlated IDs, not arbitrary observer-window queries. Retrieve full SQL
        # only after measurement. Setup/reference queries never become read cost.
        observed = [json.loads(line) for path in sorted(stages.glob('*.jsonl')) for line in path.read_text().splitlines()]
        ids = [row['query_id'] for row in observed if row.get('query_id')]
        native = []
        if ids:
            session.query('step0_flush_native', 'SYSTEM FLUSH LOGS')
            native, _ = session.rows('step0_native_stages', 'SELECT query_id,query_duration_ms,read_rows,read_bytes,'
                'memory_usage,exception_code,query FROM system.query_log WHERE query_id IN ('
                + ','.join(typed.literal(qid) for qid in sorted(set(ids)))
                + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        lookup = {row['query_id']: row for row in native}
        table = {}
        for row in observed:
            if row.get('query_id') not in lookup:
                row['native_attribution'] = 'MISSING_OR_FAILED'
                continue
            detail = lookup[row['query_id']]
            raw = detail.pop('query') if 'query' in detail else None
            if raw is not None:
                digest = hashlib.sha256(raw.encode()).hexdigest()
                (stages / (digest + '.native.sql')).write_text(raw)
                detail['native_sql_sha256'] = digest
            row['native'] = detail
            scope = table.setdefault(row['request_id'], {})
            aggregate = scope.setdefault(row['stage'], dict(read_rows=0, read_bytes=0, native_ms=0, queries=0))
            for key in ('read_rows', 'read_bytes'):
                aggregate[key] += int(detail[key])
            aggregate['native_ms'] += int(detail['query_duration_ms'])
            aggregate['queries'] += 1
        receipt = dict(kind='CONFIG_P_STEP0_NATIVE_STAGE_ATTRIBUTION',
            complete_response_T2=verdict.get('T2') if verdict else 'NOT_ESTABLISHED', per_request=table,
            queries=observed, original_P_query_unchanged=True,
            mixed_stage_note='counts_embedded_in_resolution is exact mixed-query cost, not a fabricated counts-only split',
            sort_order_arm='PLANNED_NOT_ADMITTED', F_build_started=False)
        (root / 'step0-stage-table.json').write_text(json.dumps(receipt, indent=2) + '\n')
    if verdict['T2'] != 'PASS':
        raise ValueError('Step0 parity/native/safety stop; no F build')
    return verdict
