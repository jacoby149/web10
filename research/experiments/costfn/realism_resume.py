"""Reverify completed preparation stages; never turn a partial file into success."""
import json
from pathlib import Path
import uuid

from realism_contract import FORMAT, identity, sha

HERE=Path(__file__).resolve().parent
TABLES=('users','documents','doc_groups','group_contracts','group_members',
        'app_contracts','content_events','population','cohorts')


def generation(directory,spec,floor_receipts, *, skip_floor_gates=False):
    directory=Path(directory)
    marker=directory/'manifest.json'
    if not marker.exists():
        if directory.exists():
            raise ValueError('partial generation has no completion witness; preserve it, do not overwrite')
        return None
    manifest=json.loads(marker.read_bytes())
    skipped=manifest.get('floor_admission',{}).get('mode')=='operator-skipped'
    if skipped!=skip_floor_gates or (skip_floor_gates and floor_receipts):
        raise ValueError('floor admission mode differs; explicit skip required for waived preparation')
    if (manifest.get('format')!=FORMAT or manifest.get('dataset_id')!=identity(manifest)
            or manifest.get('contract')!=spec or manifest.get('recipe')!=spec['recipe']
            or manifest.get('generator_sha256')!=sha(HERE/'realism_dataset.py')
            or manifest.get('contract_sha256')!=sha(HERE/'realism_contract.py')
            or manifest.get('floor_receipts')!=[sha(p) for p in floor_receipts]):
        raise ValueError('completed generation source/contract/identity is stale; do not reuse')
    if set(manifest['files'])!=set(TABLES):
        raise ValueError('completed generation table set changed')
    if {p.name for p in directory.iterdir()}!={'manifest.json',*(t+'.parquet' for t in TABLES)}:
        raise ValueError('unexpected files in completed generation')
    for table in TABLES:
        path=directory/(table+'.parquet')
        info=manifest['files'][table]
        if (path.is_symlink() or info['name']!=path.name or path.stat().st_size!=info['bytes']
                or sha(path)!=info['sha256']):
            raise ValueError('completed generation bytes changed; refuse reuse: '+table)
        print('[cloud-prep] resume verified table='+table,flush=True)
    return manifest


def validation(receipt,directory,manifest):
    receipt=Path(receipt)
    if not receipt.exists():
        return None
    proof=json.loads(receipt.read_bytes())
    dataset_id=manifest['dataset_id']
    checks=proof.get('checks',{})
    if (proof.get('complete') is True and proof.get('dataset_id')==dataset_id
            and proof.get('format')==FORMAT and proof.get('accounts')==manifest['recipe']['accounts']
            and (receipt.resolve().parent/proof.get('dataset_directory','')).resolve()==Path(directory).resolve()
            and proof.get('validator_sha256')==sha(HERE/'realism_validate.py')
            and checks and all(v is True for v in checks.values())):
        return proof
    # Preserve deterministic failure evidence and require a repair/operator
    # decision, not a blind unchanged retry that might hide the failed gate.
    if proof.get('validator_sha256')==sha(HERE/'realism_validate.py') and proof.get('dataset_id')==dataset_id:
        raise ValueError('same-source validation previously failed; retain it and repair the stage before retry')
    archived=receipt.with_name(receipt.name+'.stale-'+uuid.uuid4().hex[:12])
    receipt.rename(archived)
    return None
