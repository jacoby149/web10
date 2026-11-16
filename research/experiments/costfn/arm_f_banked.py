"""Immutable PR#1572 P comparator. Citation, never a new-host Step0 PASS."""
import hashlib
import json
from pathlib import Path
import tarfile

import arm_t

ARCHIVE_SHA256 = 'acc1508f07b7809fa27dab09b34ad15ea1e1fba5bff3390426fd927c3d3966c9'
BUILDERS = ('arm_satellite_batch.py', 'arm_satellite_batch_run.py', 'arm_satellite_counts.py',
    'arm_satellite_sql.py', 'arm_satellite_metadata.py', 'arm_satellite_presence.py',
    'arm_satellite_serve.py', 'arm_satellite_reconcile.py', 'arm_t.py')
NAMES = ('result.json', 'step0-stage-table.json', 'serve-probe/config-p.json',
    'counts-batch-p2/result.json', 'metadata/result.json', 'metadata-parity/result.json',
    'presence/result.json', 'profile/inventory.json', 'source-manifest.json')


def load(root):
    path = Path(root) / 'banked-P.tar.gz'
    if hashlib.sha256(path.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError('immutable banked PR#1572 archive hash differs')
    with tarfile.open(path) as archive:
        files = {}
        for name in NAMES:
            member = archive.getmember(name)
            if not member.isfile() or member.size > 2 * 1024**2:
                raise ValueError('bounded banked JSON receipt required')
            files[name] = json.load(archive.extractfile(member))
    if (files['result.json'].get('outcome') != 'P_STEP0_COMPLETE'
            or files['result.json'].get('P_T2') != 'PASS'
            or files['serve-probe/config-p.json'].get('T2') != 'PASS'
            or files['step0-stage-table.json'].get('complete_response_T2') != 'PASS'
            or files['counts-batch-p2/result.json'].get('T1') != 'PASS'
            or files['metadata-parity/result.json'].get('outcome') != 'PASS'
            or files['presence/result.json'].get('T1') != 'PASS'):
        raise ValueError('banked baseline/infrastructure checks incomplete')
    repository = Path(__file__).resolve().parents[3]
    sources = files['source-manifest.json']
    required = ['research/experiments/costfn/' + name for name in BUILDERS]
    required += ['api/app/v3/services/safe_query.py']
    for name in required:
        if hashlib.sha256((repository / name).read_bytes()).hexdigest() != sources.get(name):
            raise ValueError('banked infrastructure builder source differs: ' + name)
    return files


def citation(root):
    files = load(root)
    return dict(verified=True, status='CITED_NOT_REMEASURED', pull_request=1572,
        dataset_id=arm_t.DATASET, original_droplet_id=files['result.json']['droplet_id'],
        archive_sha256=ARCHIVE_SHA256, observations=files['result.json']['P_observations'],
        stage_table=files['step0-stage-table.json'], new_Step0_measurements=0)
