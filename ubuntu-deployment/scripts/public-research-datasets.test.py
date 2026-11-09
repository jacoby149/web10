#!/usr/bin/env python3
"""Offline scope and fail-closed controls; no storage credentials required."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("public_research", HERE / "public-research-datasets.py")
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
ROOT = HERE.parents[1]
RECEIPTS = [json.loads((ROOT / "research/experiments/costfn/evidence" / name).read_bytes())
            for name in ("v2-hot-publication.json", "v2-dispersed-publication.json")]


class Client:
    def __init__(self):
        self.policy = {"Version": "2012-10-17", "Statement": []}
        self.reads = self.writes = 0

    def get_bucket_policy(self, **kwargs):
        return {"Policy": json.dumps(self.policy)}

    def put_bucket_policy(self, **kwargs):
        self.policy = json.loads(kwargs["Policy"])
        self.writes += 1

    def get_object(self, **kwargs):
        self.reads += 1
        return {"Body": io.BytesIO(b"corrupt")}


class PolicyTests(unittest.TestCase):
    def test_only_fourteen_exact_get_resources(self):
        objects = policy.pinned_objects(RECEIPTS)
        result = policy.proposed_policy({"Statement": []}, objects)["Statement"][0]
        self.assertEqual(result["Action"], ["s3:GetObject"])
        self.assertEqual(len(result["Resource"]), 14)
        self.assertTrue(all("*" not in r for r in result["Resource"]))
        self.assertNotIn("arn:aws:s3:::web10-media", result["Resource"])

    def test_preserves_existing_statements_without_mutating_input(self):
        before = {"Version": "2012-10-17", "Statement": [{"Sid": "ExistingDeny", "Effect": "Deny"}]}
        result = policy.proposed_policy(before, policy.pinned_objects(RECEIPTS))
        self.assertEqual(result["Statement"][:-1], before["Statement"])
        self.assertEqual(len(before["Statement"]), 1)
        self.assertEqual(policy.proposed_policy(result, policy.pinned_objects(RECEIPTS)), result)

    def test_broadened_or_unverified_receipt_denied(self):
        for mutate in (
            lambda r: r[0].update(dataset_id="a" * 64),
            lambda r: r[0].update(bucket="other"),
            lambda r: r[0].update(complete=False),
            lambda r: r[0]["objects"][0].update(key="research/costfn/datasets/*"),
            lambda r: r[0]["objects"].append(r[0]["objects"][0]),
            lambda r: r[0].update(download_verified={}),
        ):
            receipts = copy.deepcopy(RECEIPTS)
            mutate(receipts)
            with self.assertRaises(ValueError):
                policy.pinned_objects(receipts)

    def test_conflicting_sid_refused(self):
        with self.assertRaises(ValueError):
            policy.proposed_policy({"Statement": [{"Sid": policy.SID}]}, policy.pinned_objects(RECEIPTS))

    def test_dry_run_never_reads_objects_or_writes(self):
        client = Client()
        policy.configure(client, RECEIPTS)
        self.assertEqual((client.reads, client.writes), (0, 0))

    def test_corrupt_object_denies_policy_write_and_keeps_private_backup(self):
        client = Client()
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / "policy.json"
            with self.assertRaises(ValueError):
                policy.configure(client, RECEIPTS, apply=True, backup=backup)
            self.assertEqual(client.writes, 0)
            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(backup.read_bytes()), client.policy)

    def test_apply_requires_backup(self):
        with self.assertRaises(ValueError):
            policy.configure(Client(), RECEIPTS, apply=True)

    def test_verified_apply_and_idempotent_reapply(self):
        client = Client()
        objects = [{**item, "bytes": 7, "sha256": __import__("hashlib").sha256(b"corrupt").hexdigest()}
                   for item in policy.pinned_objects(RECEIPTS)]
        with tempfile.TemporaryDirectory() as directory, patch.object(policy, "pinned_objects", return_value=objects):
            result = policy.configure(client, RECEIPTS, apply=True, backup=Path(directory) / "before.json")
            self.assertTrue(result["changed"])
            self.assertEqual(client.writes, 1)
            result = policy.configure(client, RECEIPTS, apply=True, backup=Path(directory) / "again.json")
            self.assertFalse(result["changed"])
            self.assertEqual(client.writes, 1)

    def test_concurrent_policy_change_refuses_write(self):
        client = Client()
        objects = [{**item, "bytes": 7, "sha256": __import__("hashlib").sha256(b"corrupt").hexdigest()}
                   for item in policy.pinned_objects(RECEIPTS)]
        original = client.get_object

        def racing_read(**kwargs):
            client.policy["Statement"] = [{"Sid": "ConcurrentChange"}]
            return original(**kwargs)

        client.get_object = racing_read
        with tempfile.TemporaryDirectory() as directory, patch.object(policy, "pinned_objects", return_value=objects):
            with self.assertRaisesRegex(ValueError, "policy changed"):
                policy.configure(client, RECEIPTS, apply=True, backup=Path(directory) / "before.json")
        self.assertEqual(client.writes, 0)

    def test_storage_resource_reordering_is_verified_and_reapply_is_noop(self):
        client = Client()
        original = client.put_bucket_policy

        def reorder(**kwargs):
            original(**kwargs)
            client.policy["Statement"][-1]["Resource"].reverse()

        client.put_bucket_policy = reorder
        objects = [{**item, "bytes": 7, "sha256": __import__("hashlib").sha256(b"corrupt").hexdigest()}
                   for item in policy.pinned_objects(RECEIPTS)]
        with tempfile.TemporaryDirectory() as directory, patch.object(policy, "pinned_objects", return_value=objects):
            first = policy.configure(client, RECEIPTS, apply=True, backup=Path(directory) / "first.json")
            second = policy.configure(client, RECEIPTS, apply=True, backup=Path(directory) / "second.json")
        self.assertTrue(first["policy_readback_verified"])
        self.assertFalse(second["changed"])
        self.assertEqual(client.writes, 1)


if __name__ == "__main__":
    unittest.main()
