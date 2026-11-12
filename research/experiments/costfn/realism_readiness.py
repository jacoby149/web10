"""Fail-closed restart admission from recent, operator-owned drill receipts.

This checks evidence metadata, not live infrastructure. Only a real connected
drill may issue the receipt; this module cannot provision, upload or fabricate
one. Cleanup never depends on passing this gate.
"""
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit


def require_readiness(lease, now):
    marker=lease.get('workflow_readiness_receipt')
    if not marker:
        raise ValueError('restart blocked: durable-controller/archive drill receipt required before paid preparation')
    path=Path(marker)
    if path.is_symlink() or not path.is_file() or path.stat().st_size>65536:
        raise ValueError('invalid workflow readiness receipt file')
    proof=json.loads(path.read_bytes())
    checked=proof.get('checked_epoch')
    if (proof.get('format')!='web10-realism-restart-readiness-v1'
            or proof.get('run_id')!=lease['run_id']
            or proof.get('account_uuid')!=lease.get('account_uuid') or not lease.get('account_uuid')
            or type(checked) not in (int,float) or not math.isfinite(checked)
            or not 0<=now-checked<=300):
        raise ValueError('readiness receipt is stale or belongs to another run')
    required=('controller_survives_session_loss','controller_survives_workstation_loss','remote_stop_before_cleanup',
              'archive_before_validation','archive_before_cleanup',
              'final_receipt_recovery_verified','recovery_readback_after_host_loss',
              'failed_archive_stops_new_work','hard_cleanup_retained',
              'unvalidated_recovery_never_counts_as_acceptance')
    if any(proof.get(name) is not True for name in required):
        raise ValueError('restart safety drill is incomplete')
    archive=proof.get('archive_probe',{})
    origin=urlsplit(archive.get('endpoint',''))
    if (origin.scheme!='https' or not origin.hostname or origin.username or origin.password
            or origin.query or origin.fragment or origin.path not in ('','/')
            or archive.get('private') is not True
            or archive.get('recovery_class')!='unvalidated-quarantine'
            or archive.get('independent_of_prep_host') is not True):
        raise ValueError('private independent recovery store required')
    digest=archive.get('sha256','')
    if (not isinstance(digest,str) or not re.fullmatch(r'[a-f0-9]{64}',digest)
            or archive.get('readback_sha256')!=digest
            or type(archive.get('bytes')) is not int or archive['bytes']<=0
            or archive.get('readback_bytes')!=archive['bytes']):
        raise ValueError('archive probe lacks exact size/digest readback evidence')
    print('[realism-preflight] recent run-bound readiness receipt admitted; connected drill remains the evidence source',flush=True)
