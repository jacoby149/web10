"""Construction checks; actual count parity belongs to the DO T1 receipts."""
import unittest

import sqlglot

import arm_satellite_counts as counts
import arm_satellite_sql as typed


class CountConstructionTests(unittest.TestCase):
    def test_independent_oracle_retains_original_tables_and_reader_policies(self):
        query = counts.oracle_boundary("arbitrary-service", ["group-a", "group-b"], "reader")
        sqlglot.parse_one(query, read="clickhouse")
        for table in ("documents", "doc_groups", "user_blacklist", "group_blacklist",
                      "user_group_sharing", "group_hidden_docs", "banned_users"):
            self.assertIn(table, query)
        self.assertNotIn("counting_numbers", query)
        self.assertNotIn("doc_groups_t", query)
        self.assertNotIn("documents_d", query)
        self.assertNotIn("LIMIT", query)

    def test_captured_recipes_preserve_comment_body_reference_and_row_multiplicity(self):
        comments = next(counter for counter in counts.RECIPES if counter.name == "comments")
        self.assertEqual(comments.target_body_key, "post_id")
        self.assertTrue(all(not counter.distinct for counter in counts.RECIPES))
        for counter in counts.RECIPES:
            counter.validate()

    def test_hyphenated_app_service_is_data_not_an_extra_table_type(self):
        counter = typed.Counter("app-choice", "notes-app", target_column="doc_id")
        scope = typed.scope_key("reader", {"notes-app": ["group"]}, "generation", [counter])
        query = typed.build_counts({"notes-app": "SELECT doc_id,body FROM canonical_input"}, scope, [counter])[0]
        self.assertTrue(query.startswith("INSERT INTO counting_numbers"))
        self.assertNotIn("CREATE TABLE notes", query)
        sqlglot.parse_one(query, read="clickhouse")


if __name__ == "__main__":
    unittest.main()
