"""Restart gates do not reopen leases or infer durable infrastructure from logs."""
import json
from pathlib import Path
import tempfile
import unittest

import realism_cloud_lease as lease
from realism_readiness import require_readiness


def proof():
    return {'format':'web10-realism-restart-readiness-v1','run_id':'a123456789ab','account_uuid':'account','checked_epoch':200,
            **{name:True for name in ('controller_survives_session_loss','controller_survives_workstation_loss','remote_stop_before_cleanup',
                'final_receipt_recovery_verified','recovery_readback_after_host_loss',
                'archive_before_validation','archive_before_cleanup','failed_archive_stops_new_work',
                'hard_cleanup_retained','unvalidated_recovery_never_counts_as_acceptance')},
            'archive_probe':{'endpoint':'https://storage.example.invalid','private':True,
                             'recovery_class':'unvalidated-quarantine','independent_of_prep_host':True,
                             'sha256':'a'*64,'readback_sha256':'a'*64,'bytes':123,'readback_bytes':123}}


class ReadinessTests(unittest.TestCase):
    def test_missing_receipt_refuses_creation_but_not_cleanup_validation(self):
        row={'run_id':'a123456789ab','name':'web10-realism-prep-a123456789ab',
             'tag':'web10-realism-prep-a123456789ab','size':'s-8vcpu-32gb-amd',
             'created_epoch':100,'deadline':14500,'max_usd':5,'account_uuid':'account'}
        lease.validate(row)
        with self.assertRaisesRegex(ValueError,'restart blocked'):
            lease.admits_creation(row,now=201)

    def test_recent_metadata_is_accepted_but_never_reopens_closed_lease(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'readiness.json'
            p.write_text(json.dumps(proof()))
            row={'run_id':'a123456789ab','account_uuid':'account','workflow_readiness_receipt':str(p)}
            require_readiness(row,201)
            full={**row,'name':'web10-realism-prep-a123456789ab','tag':'web10-realism-prep-a123456789ab',
                  'size':'s-8vcpu-32gb-amd','created_epoch':100,'deadline':14500,'max_usd':5,'account_uuid':'account'}
            lease.admits_creation(full,now=201)
            for flag in ('cancelled','cleanup_verified'):
                with self.assertRaisesRegex(ValueError,'irreversibly closed'):
                    lease.admits_creation({**full,flag:True},now=201)
            for now in (199,501):
                with self.assertRaises(ValueError):
                    require_readiness(row,now)

    def test_incomplete_wrong_run_public_or_unverified_receipts_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'readiness.json'
            row={'run_id':'a123456789ab','account_uuid':'account','workflow_readiness_receipt':str(p)}
            mutations=[{'run_id':'another'},{'account_uuid':'another'},{'controller_survives_session_loss':False},
                       {'controller_survives_workstation_loss':False},{'final_receipt_recovery_verified':False},
                       {'recovery_readback_after_host_loss':False},
                       {'archive_before_cleanup':False},{'hard_cleanup_retained':False},
                       {'checked_epoch':True}]
            mutations += [{'archive_probe':{**proof()['archive_probe'],**change}} for change in
                          ({'private':False},{'endpoint':'https://user:secret@example.invalid'},
                           {'endpoint':'http://example.invalid'},{'readback_sha256':'b'*64},
                           {'readback_bytes':122},{'independent_of_prep_host':False},
                           {'recovery_class':'validated-input'})]
            for change in mutations:
                with self.subTest(change=change),self.assertRaises(ValueError):
                    p.write_text(json.dumps({**proof(),**change}))
                    require_readiness(row,201)


if __name__=='__main__':
    unittest.main()
