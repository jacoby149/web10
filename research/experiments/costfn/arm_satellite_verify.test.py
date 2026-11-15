"""Offline construction checks; actual metadata parity runs only on admitted DO."""
import unittest
import hashlib
import json
from pathlib import Path

import sqlglot

import arm_satellite_verify as verify


class VerifyTests(unittest.TestCase):
    def test_retained_native_gates_and_setup_stop_are_bound_without_performance_claim(self):
        base = Path(__file__).parent / "evidence/arm-satellite-20261115"
        for name in ("metadata-complete", "full-api-setup-stop"):
            root = base / name
            manifest = json.loads((root / "artifact-manifest.json").read_bytes())
            for file, digest in manifest["files_sha256"].items():
                self.assertEqual(hashlib.sha256((root / file).read_bytes()).hexdigest(), digest)
        metadata = json.loads((base / "metadata-complete/metadata-parity/result.json").read_bytes())
        self.assertEqual(metadata["outcome"], "PASS")
        self.assertTrue(all(item["mismatches"] == 0 for item in metadata["checks"].values()))
        presence = json.loads((base / "metadata-complete/presence/result.json").read_bytes())
        self.assertEqual(presence["T1"], "PASS")
        stopped = json.loads((base / "full-api-setup-stop/failure-summary.json").read_bytes())
        self.assertEqual(stopped["native_exception_code"], 159)
        self.assertFalse(stopped["feed_warmup_completed"])
        self.assertEqual(stopped["performance_observations"], [])

    def test_all_built_pointer_surfaces_get_exact_multiset_checks(self):
        checks = verify.checks()
        self.assertEqual(set(checks), {"identities", "profiles", "references", "inventory", "time"})
        for query in checks.values():
            sqlglot.parse_one(query, read="clickhouse")
            self.assertIn("UNION ALL", query)
            self.assertIn("sum(weight)", query)
            self.assertIn("HAVING delta!=0", query)
            self.assertIn("documents FINAL", query)
            self.assertNotIn("LIMIT", query)
            self.assertNotIn("counting_numbers", query)

    def test_multiset_check_does_not_collapse_duplicate_rows(self):
        sql = verify.difference("SELECT k FROM actual", "SELECT k FROM expected", ["k"])
        self.assertNotIn("DISTINCT", sql)
        self.assertIn("toInt8(-1)", sql)


if __name__ == "__main__":
    unittest.main()
