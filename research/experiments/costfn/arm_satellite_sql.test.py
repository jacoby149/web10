"""Pure construction and scope controls, not native satellite parity evidence."""
from dataclasses import replace
import unittest

import sqlglot

import arm_satellite_sql as sql

RECIPE = sql.Counter("arbitrary-counter", "reactions", match_body_key="type", match_value="like")
GROUPS = {"reactions": ["g-a", "g-b"]}


class SqlTests(unittest.TestCase):
    def test_scope_depends_on_reader_groups_generation_and_aggregation_semantics(self):
        original = sql.scope_key("reader", GROUPS, "generation1", [RECIPE])
        self.assertEqual(original, sql.scope_key("reader", {"reactions": ["g-b", "g-a"]}, "generation1", [RECIPE]))
        cases = [("other", GROUPS, "generation1", [RECIPE]),
                 ("reader", {"reactions": ["g-a"]}, "generation1", [RECIPE]),
                 ("reader", GROUPS, "generation2", [RECIPE]),
                 ("reader", GROUPS, "generation1", [replace(RECIPE, distinct=True)]),
                 ("reader", GROUPS, "generation1", [replace(RECIPE, target_body_key="other-ref")])]
        for args in cases:
            self.assertNotEqual(original, sql.scope_key(*args))

    def test_main_multiplicity_and_followup_distinct_are_not_conflated(self):
        scope = sql.scope_key("r", GROUPS, "v1", [RECIPE])
        boundary = "SELECT doc_id,ref_value,body FROM canonical_authorized_input"
        for distinct, function in ((False, "countIf("), (True, "uniqExactIf(")):
            query = sql.build_counts({"reactions": boundary}, scope, [replace(RECIPE, distinct=distinct)])[0]
            self.assertIn(boundary, query)
            self.assertIn(function, query)
            self.assertNotIn("LIMIT", query)
            self.assertNotIn("documents_d", query)
            sqlglot.parse_one(query, read="clickhouse")

    def test_read_requires_built_fresh_scope_and_is_only_point_keys(self):
        scope = sql.scope_key("r", GROUPS, "v1", [RECIPE])
        options = {"built_scope": scope, "built_counter_names": ["custom:name"],
                   "current_generation": "v1", "built_generation": "v1"}
        query = sql.read_counts(scope, ["doc'\\id"], ["custom:name"], **options)
        self.assertNotIn("GROUP BY", query)
        self.assertNotIn("documents", query)
        sqlglot.parse_one(query, read="clickhouse")
        for change in ({"built_scope": "missing"}, {"current_generation": "v2"}):
            with self.assertRaises(ValueError):
                sql.read_counts(scope, ["doc"], ["custom:name"], **{**options, **change})
        with self.assertRaises(ValueError):
            sql.read_counts(scope, ["doc"], ["not-built"], **options)

    def test_duplicate_groups_names_or_missing_service_are_refused(self):
        for groups, recipes in (({"reactions": ["g", "g"]}, [RECIPE]),
                                (GROUPS, [RECIPE, RECIPE]), ({"other": ["g"]}, [RECIPE])):
            with self.assertRaises(ValueError):
                sql.scope_key("r", groups, "v1", recipes)

    def test_page_limit_is_derived_and_full_cursor_has_no_fixed_bound(self):
        for page in (1, 20, 21, 75, 1000):
            query = sql.group_slice("group", "arbitrary-service", page, before=(123, "doc", "author"))
            self.assertTrue(query.endswith("LIMIT " + str(page + 1)))
            self.assertIn("(created_at,doc_id,author_key)<", query)
            sqlglot.parse_one(query, read="clickhouse")
        for page in (0, -1, True, 1.5):
            with self.assertRaises(ValueError):
                sql.slice_limit(page)

    def test_strings_cannot_change_sql_structure(self):
        for value in ("quote'", "back\\slash", "x'); DROP TABLE documents; --", "עברית"):
            encoded = sql.literal(value)
            self.assertEqual(bytes.fromhex(encoded[7:-2]).decode(), value)
        with self.assertRaises(ValueError):
            sql.identifier("service;drop")


if __name__ == "__main__":
    unittest.main()
