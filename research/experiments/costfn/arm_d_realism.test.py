"""No-engine controls for the additive realism probe, not native evidence."""
import unittest

import arm_d_realism as probe
import arm_d_rewrite


class Controls(unittest.TestCase):
    def test_retained_warmup_fails_even_after_native_integer_normalization(self):
        import json
        from pathlib import Path
        root = Path(probe.__file__).parent / "evidence/arm-d-realism-20261115/arm-d-realism-r1"
        oracle = json.loads((root / "oracle.json").read_bytes())
        returned = json.loads((root / "warmup-0-rows.json").read_bytes())
        fields = ("likes", "dislikes", "comments", "reposts", "score")
        normalized = [{**row, **{key: int(row[key]) for key in fields}} for row in returned]
        self.assertEqual([row["doc_id"] for row in normalized], [row["doc_id"] for row in oracle["expected"]])
        self.assertEqual(len(normalized), 21)
        for row in normalized:
            self.assertEqual((row["likes"], row["comments"]), (15, 15))
            self.assertEqual(oracle["counts"].get(row["doc_id"], {}).get("likes", 0), 0)
            self.assertEqual(oracle["counts"].get(row["doc_id"], {}).get("comments", 0), 0)
        with self.assertRaisesRegex(ValueError, "wrong main aggregate: likes"):
            probe.smoke_realism.validate_rows(normalized, oracle["expected"], oracle["profiles"],
                                             oracle["attachments"], oracle["counts"])

    def test_preserved_realism_baseline_has_identical_compiled_shape(self):
        from pathlib import Path
        import re
        baseline = (Path(probe.__file__).parent / "evidence/arm-t-20261115/baseline-main.sql").read_text().strip()
        baseline = re.sub(r"\s+FORMAT\s+Native\s*$", "", baseline, flags=re.I)
        groups = arm_d_rewrite.compiled_group_order(baseline)
        compiled, _, _ = probe.treated_main(arm_d_rewrite._reader_literal(baseline), groups)
        self.assertEqual(len(groups), 21)
        self.assertEqual(compiled, baseline)

    def test_local_host_refuses_before_any_engine_command(self):
        import json
        from pathlib import Path
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            approval = Path(temp) / "approval.json"
            approval.write_text(json.dumps({}))
            with patch.object(probe.arm_t, "digitalocean_id", side_effect=ValueError("DO only")), \
                    patch.object(probe.restore, "command") as command:
                with self.assertRaisesRegex(ValueError, "DO only"):
                    probe.run(temp, approval)
                command.assert_not_called()

    def test_json_ddl_keeps_real_newlines_and_quotes(self):
        import json
        ddl = "CREATE TABLE web10.documents UUID 'fixture'\n(body String DEFAULT '')\nENGINE = ReplacingMergeTree(updated_at)\nORDER BY (author_key, doc_id)"
        decoded = json.loads(json.dumps({"data": [{"statement": ddl}]}))["data"][0]["statement"]
        own = probe.copy_ddl(decoded)
        self.assertIn("\n(body String DEFAULT '')\n", own)
        self.assertIn("CREATE TABLE web10.documents_d", own)
        self.assertNotIn("UUID", own)
        self.assertIn("ORDER BY (author_key, created_at, doc_id, updated_at)", own)

    def test_only_physical_table_differs_from_base_treatment(self):
        groups = [f"api.localhost/groups/users/fixture-{i}/followers" for i in range(21)]
        compiled, treated, authors = probe.treated_main("fixture-reader", groups)
        base = arm_d_rewrite.transform(compiled, "fixture-reader", groups, authors)
        self.assertEqual(treated.replace("FROM documents_d", "FROM documents"), base)
        self.assertEqual(treated.count("FROM documents_d"), 4)
        self.assertTrue(treated.endswith("LIMIT 21"))

    def test_non_followers_group_refused(self):
        with self.assertRaises(ValueError):
            probe.treated_main("reader", ["api.localhost/groups/web10/discover"])

    def test_all_three_trials_and_strict_limits(self):
        good = {"read_rows": 74000, "read_bytes": 2600000, "query_duration_ms": 36, "exception_code": 0}
        self.assertTrue(probe.target_pass([good] * 3))
        self.assertFalse(probe.target_pass([good] * 2))
        for field, value in (("read_bytes", 25000000), ("query_duration_ms", 500),
                             ("exception_code", 159), ("read_rows", 10000001)):
            with self.subTest(field=field):
                self.assertFalse(probe.target_pass([good, good, {**good, field: value}]))

    def test_spill_and_memory_are_explicit(self):
        self.assertEqual(probe.SPILL["max_memory_usage"], 22 * 1024**3)
        self.assertEqual(probe.SPILL["max_bytes_before_external_sort"], 2 * 1024**3)
        self.assertEqual(probe.SPILL["max_temporary_data_on_disk_size_for_query"], 100 * 1024**3)


if __name__ == "__main__":
    unittest.main()
