"""Construction only; native rebuild/parity remains a separate gate."""
import unittest

import sqlglot

import arm_satellite_metadata as metadata


class MetadataTests(unittest.TestCase):
    def test_derived_tables_contain_identity_pointers_not_bodies(self):
        for ddl in (metadata.STRINGS_DDL, metadata.TIMESTAMPS_DDL):
            self.assertNotIn("body ", ddl)
            self.assertNotIn("feed", ddl)
            sqlglot.parse_one(ddl, read="clickhouse")
        sqlglot.parse_one(metadata.TRANSPOSE_BUILD, read="clickhouse")
        sqlglot.parse_one(metadata.TRANSPOSE_CHECK, read="clickhouse")

    def test_application_names_are_recipe_values_and_inventory_does_not_assume_empty(self):
        builds = metadata.identity_builds("notes-app", "identity-app", "parent-id", discover="public-group")
        self.assertEqual(set(builds), {"profile_identity", "reference_identity", "inventory_identity", "shared_time"})
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
