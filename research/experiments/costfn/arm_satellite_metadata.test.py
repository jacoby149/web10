"""Construction only; native rebuild/parity remains a separate gate."""
import unittest
from unittest.mock import Mock
import json
from pathlib import Path
import tempfile

import sqlglot

import arm_satellite_metadata as metadata


class MetadataTests(unittest.TestCase):
    def test_metadata_uses_explicit_passing_batch_receipt_not_failed_default(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "counts").mkdir()
            (root / "counts/result.json").write_text('{"T1":"NOT_RUN"}')
            receipt = root / "p2.json"
            value = {"kind": "SATELLITE_BATCH_COUNT_BUILD_T1", "T1": "PASS", "droplet_id": 123,
                     "dataset_id": metadata.arm_t.DATASET, "final_table": "counting_numbers_p2",
                     "scopes": [{"label": label, "complete": True, "parity": "PASS"}
                                for label in ("fixture", "main", "reactions", "comments")]}
            receipt.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                metadata.count_receipt(root, 123)
            self.assertEqual(metadata.count_receipt(root, 123, receipt)["final_table"], "counting_numbers_p2")
            for key, item in (("T1", "FAIL"), ("droplet_id", 456), ("final_table", "counting_numbers")):
                receipt.write_text(json.dumps({**value, key: item}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    metadata.count_receipt(root, 123, receipt)

    def test_default_metadata_path_does_not_read_or_build_view_counters(self):
        session, execute = Mock(), Mock()
        result = {}
        metadata.build_view_snapshots(session, execute, result)
        session.rows.assert_not_called()
        execute.assert_not_called()
        self.assertEqual(result["view_treatment"], "PHASE_1_6_CONFLICT_OPEN_NOT_ACTIVATED")

    def test_explicit_view_exploration_cannot_claim_feed_acceptance(self):
        session, execute = Mock(), Mock()
        session.rows.return_value = ([{"name": "part", "rows": 1, "data_version": 1}], "query")
        result = {}
        metadata.build_view_snapshots(session, execute, result, explore=True)
        self.assertEqual(execute.call_count, 2)
        self.assertEqual(result["view_acceptance_eligible"], False)
        self.assertIn("snapshot only", result["view_freshness"])

    def test_derived_tables_contain_identity_pointers_not_bodies(self):
        for ddl in (metadata.STRINGS_DDL, metadata.TIMESTAMPS_DDL):
            self.assertNotIn("body ", ddl)
            self.assertNotIn("feed", ddl)
            sqlglot.parse_one(ddl, read="clickhouse")
        sqlglot.parse_one(metadata.TRANSPOSE_BUILD, read="clickhouse")
        sqlglot.parse_one(metadata.TRANSPOSE_CHECK, read="clickhouse")

    def test_application_names_are_recipe_values_and_inventory_does_not_assume_empty(self):
        builds = metadata.identity_builds("notes-app", "identity-app", "parent-id", discover="public-group")
        self.assertEqual(set(builds), {"document_identity", "profile_identity", "reference_identity", "inventory_identity", "shared_time"})
        self.assertNotIn("row_number", builds["profile_identity"])
        self.assertIn("doc_id,concat('document:',collection_name)", builds["document_identity"])
        self.assertIn("has(tags,'node_ad')", builds["inventory_identity"])
        self.assertIn("doc_groups FINAL", builds["inventory_identity"])
        self.assertNotIn("LIMIT 20", builds["inventory_identity"])
        self.assertNotIn("body,", builds["inventory_identity"])
        for query in builds.values():
            sqlglot.parse_one(query, read="clickhouse")

    def test_reach_is_exact_distinct_reader_state_not_sum_of_group_counts(self):
        scope, queries = metadata.view_builds("arbitrary-service", "source-v1")
        changed, _ = metadata.view_builds("arbitrary-service", "source-v2")
        self.assertNotEqual(scope, changed)
        self.assertEqual(len(queries), 2)
        self.assertIn("uniqExact(reader_key)", queries[1])
        self.assertIn("count()", queries[0])
        for query in queries:
            sqlglot.parse_one(query, read="clickhouse")


if __name__ == "__main__":
    unittest.main()
