import unittest
from unittest.mock import patch
import realism_cloud_lease as lease


def example():
    return {"run_id":"a123456789ab","name":"web10-realism-prep-a123456789ab",
            "tag":"web10-realism-prep-a123456789ab","size":"s-8vcpu-32gb-amd",
            "created_epoch":100,"deadline":14500,"max_usd":5,"key_fingerprint":"ephemeral-only","account_uuid":"account"}


def empty_account(*args):
    return [{"uuid":"account"}] if args==("account","get") else []


class LeaseTests(unittest.TestCase):
    def test_expired_cancelled_and_verified_cannot_create(self):
        for change in ({"cancelled":True},{"cleanup_verified":True},{}):
            row={**example(),**change}
            with self.assertRaises(ValueError):
                lease.admits_creation(row,now=14501 if not change else 101)

    def test_exact_ownership_never_matches_unrelated_resources(self):
        row=example()
        d={"id":7,"name":row["name"],"tags":[row["tag"]],"size_slug":row["size"]}
        self.assertTrue(lease.owned_droplet(d,row))
        for change in ({"name":"production"},{"tags":[]},{"size_slug":"another"}):
            self.assertFalse(lease.owned_droplet({**d,**change},row))
        self.assertFalse(lease.owned_key({"name":row["name"],"fingerprint":"unrelated"},row))
        self.assertFalse(lease.owned_firewall({"name":row["name"],"tags":[row["tag"],"production"]},row))

    def test_uncertain_creation_does_not_close_on_empty_listing(self):
        row={**example(),"creation_uncertain":True}
        with patch.object(lease,"api",side_effect=empty_account):
            lease.cleanup(row)
        self.assertTrue(row["cancelled"])
        self.assertFalse(row.get("cleanup_verified",False))
        self.assertIn("uncertain",row["cleanup_pending"])

    def test_mismatched_tagged_droplet_is_not_deleted(self):
        row=example()
        with patch.object(lease,"api",side_effect=lambda *a: empty_account(*a) if a==("account","get") else [{"name":"production","tags":[row['tag']]}]) as api:
            with self.assertRaises(ValueError):
                lease.cleanup(row)
        self.assertEqual(api.call_count,2)

    def test_known_complete_empty_creation_can_verify_cleanup(self):
        row={**example(),"creation_complete":True}
        with patch.object(lease,"api",side_effect=empty_account):
            lease.cleanup(row)
        self.assertTrue(row["cleanup_verified"])

    def test_account_switch_never_reports_absence_or_deletes(self):
        row={**example(),"creation_complete":True}
        with patch.object(lease,"api",return_value=[{"uuid":"another-account"}]) as api:
            with self.assertRaises(ValueError):
                lease.cleanup(row)
        self.assertEqual(api.call_count,1)
        self.assertFalse(row.get("cleanup_verified",False))

    def test_known_host_with_removed_tag_never_becomes_false_empty(self):
        row={**example(),"droplet_id":7,"creation_complete":True}
        changed={'id':7,'name':row['name'],'tags':[],'size_slug':row['size']}
        with patch.object(lease,'api',side_effect=lambda *a: empty_account(*a) if a==('account','get') else [changed]):
            with self.assertRaisesRegex(ValueError,'ownership mismatch'):
                lease.cleanup(row)
        self.assertFalse(row.get('cleanup_verified',False))

    def test_six_hours_requires_recorded_operator_approval_and_cannot_reopen(self):
        row=example()
        original=row['deadline']
        row['deadline']+=7200
        with self.assertRaises(ValueError):
            lease.validate(row)
        row['operator_extension']={'hours':2,'original_deadline':original,'approved_epoch':200}
        lease.validate(row)
        row['cancelled']=True
        with self.assertRaises(ValueError):
            lease.admits_creation(row,now=300)

    def test_extension_never_grants_unbounded_time_or_wrong_original_clock(self):
        row=example()
        row['operator_extension']={'hours':2,'original_deadline':row['deadline'],'approved_epoch':200}
        row['deadline']+=7201
        with self.assertRaises(ValueError):
            lease.validate(row)
        row['deadline']-=1
        row['operator_extension']['original_deadline']-=1
        with self.assertRaises(ValueError):
            lease.validate(row)

    def test_followthrough_requires_both_bounded_approvals_and_cannot_reopen(self):
        row=example()
        row['operator_extension']={'hours':2,'original_deadline':row['deadline'],'approved_epoch':200}
        row['deadline']+=7200
        row['operator_followthrough_extension']={'hours':8,'previous_deadline':row['deadline'],'approved_epoch':300}
        row['deadline']+=8*3600
        lease.validate(row)
        for change in ({'hours':9},{'previous_deadline':14500},{'approved_epoch':199},{'approved_epoch':21701}):
            with self.subTest(change=change),self.assertRaises(ValueError):
                lease.validate({**row,'operator_followthrough_extension':{**row['operator_followthrough_extension'],**change}})
        with self.assertRaises(ValueError):
            lease.validate({**row,'deadline':row['deadline']+1})
        with self.assertRaises(ValueError):
            lease.validate({**row,'operator_extension':None})
        for flag in ('cancelled','cleanup_verified'):
            with self.assertRaises(ValueError):
                lease.admits_creation({**row,flag:True},now=400)


if __name__=="__main__":
    unittest.main()
