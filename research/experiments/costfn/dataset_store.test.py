#!/usr/bin/env python3
import io
import json
from pathlib import Path
import tempfile
import unittest

from botocore.exceptions import ClientError

import dataset_store as store
import dataset_v2


class MemoryS3:
    def __init__(self):
        self.objects = {}
        self.writes = []

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, **kwargs):
        key = kwargs["Key"]
        if key in self.objects:
            raise ClientError({"Error": {"Code": "PreconditionFailed"}}, "PutObject")
        assert kwargs["IfNoneMatch"] == "*"
        self.objects[key] = kwargs["Body"].read()
        self.writes.append(key)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.data = self.root / "data"
        self.manifest = dataset_v2.build(self.data, {"creators": 2, "readers": 1, "follow": 2, "seed": 42, "locality": "hot"})
        self.client = MemoryS3()
        self.prefix = "research/costfn/datasets"
        self.identity = self.manifest["dataset_id"]

    def publish(self):
        return store.publish(self.client, "bucket", self.prefix, self.data, self.identity)

    def test_manifest_last_and_verified_download(self):
        receipt = self.publish()
        self.assertTrue(receipt["complete"])
        self.assertFalse(receipt["public_policy_changed"])
        self.assertTrue(self.client.writes[-1].endswith("/manifest.json"))
        result = store.download(self.client, "bucket", self.prefix, self.root / "download", self.identity)
        self.assertEqual(result["dataset_id"], self.identity)

    def test_idempotent_without_overwrites(self):
        self.publish()
        writes = list(self.client.writes)
        self.publish()
        self.assertEqual(self.client.writes, writes)

    def test_existing_different_object_denied(self):
        key = store.prefix_for(self.prefix, self.identity) + "users.jsonl.gz"
        self.client.objects[key] = b"foreign content"
        with self.assertRaisesRegex(ValueError, "different bytes"):
            self.publish()
        self.assertEqual(self.client.writes, [])

    def test_wrong_approved_identity_refused_before_upload(self):
        with self.assertRaises(ValueError):
            store.publish(self.client, "bucket", self.prefix, self.data, "a" * 64)
        self.assertEqual(self.client.writes, [])

    def test_racing_conflicting_write_is_not_overwritten_or_committed(self):
        original = self.client.put_object

        def race(**kwargs):
            self.client.objects[kwargs["Key"]] = b"racing different object"
            return original(**kwargs)

        self.client.put_object = race
        with self.assertRaisesRegex(ValueError, "uploaded bytes differ"):
            self.publish()
        self.assertFalse(any(k.endswith("manifest.json") for k in self.client.objects))

    def test_wrong_remote_manifest_refused(self):
        self.publish()
        key = store.prefix_for(self.prefix, self.identity) + "manifest.json"
        value = json.loads(self.client.objects[key])
        value["recipe"]["creators"] = 300
        self.client.objects[key] = json.dumps(value).encode()
        with self.assertRaises(ValueError):
            store.download(self.client, "bucket", self.prefix, self.root / "download", self.identity)

    def test_remote_corruption_refused(self):
        self.publish()
        key = store.prefix_for(self.prefix, self.identity) + "documents.jsonl.gz"
        self.client.objects[key] = b"corrupt"
        with self.assertRaises(ValueError):
            store.download(self.client, "bucket", self.prefix, self.root / "download", self.identity)

    def test_nonresearch_prefix_and_traversal_refused(self):
        for prefix in ("media", "research/../media", "research/a//b", "/research/a", "research/a?b"):
            with self.subTest(prefix=prefix), self.assertRaises(ValueError):
                store.prefix_for(prefix, self.identity)


if __name__ == "__main__":
    unittest.main()
