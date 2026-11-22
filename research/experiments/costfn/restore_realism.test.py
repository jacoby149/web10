"""Offline gates for the Parquet research restore; no engine/network calls."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import restore_realism as restore
from realism_contract import FORMAT, identity, sha


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        files = {}
        for table in (*restore.TABLES, "population", "cohorts"):
            path = self.root / (table + ".parquet")
            path.write_bytes(b"synthetic test bytes, not real Parquet")
            files[table] = {"name": path.name, "bytes": path.stat().st_size, "sha256": sha(path), "rows": 1}
        self.manifest = {"format": FORMAT, "files": files}
        self.manifest["dataset_id"] = identity(self.manifest)
        (self.root / "manifest.json").write_text(json.dumps(self.manifest))
        self.receipt = self.root / "validation.json"
        self.write_receipt()

    def write_receipt(self, **changes):
        self.receipt.write_text(json.dumps({"dataset_id": self.manifest["dataset_id"],
            "complete": True, "checks": {"a": True}, **changes}))

    def verify(self):
        return restore.verified_input(self.root, self.receipt, self.manifest["dataset_id"], sha(self.receipt))

    def test_all_bound_files_pass(self):
        self.assertEqual(self.verify(), self.manifest)

    def test_changed_input_denied(self):
        (self.root / "documents.parquet").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "digest"):
            self.verify()

    def test_false_and_empty_checks_denied(self):
        for checks in ({"a": False}, {}, {"a": 1}):
            self.write_receipt(checks=checks)
            with self.assertRaises(ValueError):
                self.verify()

    def test_unapproved_receipt_denied(self):
        with self.assertRaisesRegex(ValueError, "receipt hash"):
            restore.verified_input(self.root, self.receipt, self.manifest["dataset_id"], "0" * 64)

    def test_project_gate_and_normal_envelope(self):
        with self.assertRaises(ValueError):
            restore.commands("production", 6095, self.root / "overlay.json")
        cmd = restore.commands("web10-costfn-frozen-rd-smoke", 6095, self.root / "overlay.json")
        self.assertTrue(any(s.endswith("realism.compose.yml") for s in cmd))
        self.assertEqual(cmd[-2:], ["-p", "web10-costfn-frozen-rd-smoke"])

    def test_existing_project_refused_before_docker_writes(self):
        with patch.object(restore, "verified_input", return_value=self.manifest), \
             patch.object(restore.subprocess, "check_output", return_value=b"existing"), \
             patch.object(restore.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "existing project"):
                restore.restore(self.root, self.receipt, self.manifest["dataset_id"], sha(self.receipt),
                    "web10-costfn-frozen-rd-smoke", 6095, self.root / "restore.json")
            run.assert_not_called()

    def test_startup_connection_failure_is_retryable_by_existing_waiter(self):
        failure = subprocess.CompletedProcess(["docker"], 210, b"", b"Connection refused")
        with patch.object(restore.subprocess, "run", return_value=failure), self.assertRaises(subprocess.CalledProcessError):
            restore.command(["docker", "compose"], {}, "exec")

    def test_temporary_initialization_server_is_not_readiness(self):
        with patch.object(restore, "command", return_value=b"bash\n"), patch.object(restore, "query") as query:
            self.assertFalse(restore.server_ready([], {}))
            query.assert_not_called()
        with patch.object(restore, "command", return_value=b"clickhouse-serv\n"), \
             patch.object(restore, "query", return_value="1\n"):
            self.assertTrue(restore.server_ready([], {}))


if __name__ == "__main__":
    unittest.main()
