#!/usr/bin/env python3
"""Offline restore/measure guards, separate from the real-stack acceptance gate."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import dataset
import measure_dataset as measurement
import restore_dataset as restore


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "data"
        self.manifest = dataset.build(self.data, {"creators": 2, "follow": 2, "readers": 2, "seed": 42})
        self.receipt = self.root / "restored.json"
        self.verified = dataset.validate(self.data)
        self.receipt.write_text(json.dumps({**self.verified, "complete": True,
            "project": "web10-costfn-frozen-test", "api_port": 6090,
            "api": "http://127.0.0.1:6090", "preparation_seconds": 12.0}))

    def test_only_disposable_projects(self):
        for project in ["web10", "prod", "web10-costfn", "web10-costfn-frozen-a;rm", "../prod"]:
            with self.subTest(project=project), self.assertRaises(ValueError):
                restore.compose_command(project, 6090)
        self.assertIn(str(restore.HERE / "compose.yml"), restore.compose_command("web10-costfn-frozen-test", 6090))
        with self.assertRaises(ValueError):
            restore.compose_command("web10-costfn-frozen-test", 80)

    def test_corruption_denied_before_docker(self):
        (self.data / "users.jsonl.gz").write_bytes(b"bad")
        with patch.object(restore, "run") as run, self.assertRaises(ValueError):
            restore.restore(self.data, "web10-costfn-frozen-test", 6090, self.root / "new-receipt")
        run.assert_not_called()

    def test_existing_accounts_refused_without_delete(self):
        with patch.object(restore, "counts", return_value={"users": 1, "documents": 0, "doc_groups": 0}), patch.object(restore, "ch") as query:
            with self.assertRaisesRegex(ValueError, "refusing to merge"):
                restore.check_empty_target([], {})
            query.assert_not_called()

    def test_substituted_valid_dataset_refused_before_docker(self):
        with patch.object(restore, "run") as run, self.assertRaisesRegex(ValueError, "approved/pinned"):
            restore.restore(self.data, "web10-costfn-frozen-test", 6090, self.root / "new-receipt", expected_id="another-approved-id")
        run.assert_not_called()

    def test_existing_project_refused_before_start_or_stop(self):
        with patch.object(restore, "run", return_value=b"existing-volume") as run:
            with self.assertRaisesRegex(ValueError, "already has resources"):
                restore.restore(self.data, "web10-costfn-frozen-test", 6090, self.root / "new-receipt")
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][:3], ["docker", "volume", "ls"])

    def test_unknown_group_refused(self):
        with patch.object(restore, "counts", return_value=dict.fromkeys(dataset.TABLES, 0)), patch.object(restore, "ch", return_value=b"1"):
            with self.assertRaisesRegex(ValueError, "non-boot groups"):
                restore.check_empty_target([], {})

    def test_table_injection_refused_before_process(self):
        with patch.object(restore.subprocess, "Popen") as process, self.assertRaises(ValueError):
            restore.import_table([], {}, self.data, "users; DROP DATABASE web10")
        process.assert_not_called()

    def test_measure_only_calls_bench_with_port_and_identity(self):
        out = self.root / "trial"
        with patch.object(measurement.subprocess, "run") as run:
            measurement.measure(self.data, self.receipt, out, [1, 2], 20, 3, 42)
        args, kwargs = run.call_args
        self.assertTrue(args[0][1].endswith("bench.py"))
        self.assertEqual(kwargs["env"]["API_PORT"], "6090")
        self.assertNotIn("seed.py", " ".join(args[0]))
        self.assertNotIn("restore_dataset.py", " ".join(args[0]))
        provenance = json.loads((out / "frozen-input.json").read_bytes())
        self.assertEqual(provenance["dataset_id"], self.manifest["dataset_id"])
        self.assertNotIn("password", provenance)

    def test_measure_refuses_wrong_incomplete_or_remote_receipt(self):
        original = json.loads(self.receipt.read_bytes())
        for change in [{"complete": False}, {"dataset_id": "wrong"}, {"api": "https://production.example"}]:
            self.receipt.write_text(json.dumps({**original, **change}))
            with patch.object(measurement.subprocess, "run") as run, self.assertRaises(ValueError):
                measurement.measure(self.data, self.receipt, self.root / "trial", [1], 20, 3, 42)
            run.assert_not_called()
            self.assertFalse((self.root / "trial").exists())

    def test_correctness_rejects_wrong_rows(self):
        with patch.object(restore, "api_json", side_effect=[{"token": "not-logged"}, {"rows": []}]):
            with self.assertRaisesRegex(ValueError, "different rows"):
                restore.correctness("http://localhost", self.manifest)

    def test_correctness_uses_real_endpoint_body_serialization(self):
        expected = []
        for user in self.manifest["followed"]:
            row = next(dataset.post_rows(user, self.manifest["creator_groups"][user], f"post 0 by {user}"))[1]
            expected.append({"doc_id": row["doc_id"], "body": json.loads(row["body"])})
        expected.sort(key=lambda row: row["doc_id"])
        with patch.object(restore, "api_json", side_effect=[{"token": "not-logged"}, {"rows": expected}]):
            result = restore.correctness("http://localhost", self.manifest)
        self.assertEqual(result["ordered_public_query_rows"], 2)


if __name__ == "__main__":
    unittest.main()
