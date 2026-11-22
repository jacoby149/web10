"""No-engine controls for live-canonical Config P SQL construction."""
from pathlib import Path
import unittest

import sqlglot
from sqlglot import exp

import arm_satellite_serve as serve


class ServingTests(unittest.TestCase):
    def setUp(self):
        self.sql = (Path(__file__).parent / "evidence/arm-d-compiled-main-golden-20261109.sql").read_text()

    def test_canonical_identity_narrowing_keeps_history_windows_and_all_policy_gates(self):
        tree = sqlglot.parse_one(self.sql, read="clickhouse")
        boundary = next(cte.this for cte in tree.args["with_"].expressions if cte.alias == "posts")
        scoped = serve.bounded(boundary, [("another-author", "shared-doc")])
        self.assertEqual(len(list(scoped.find_all(exp.Window))), len(list(boundary.find_all(exp.Window))))
        for name in ("user_blacklist", "group_blacklist", "user_group_sharing", "group_hidden_docs", "banned_users"):
            self.assertIn(name, scoped.sql())
        for table in scoped.find_all(exp.Table):
            if table.name == "documents":
                self.assertIn("(author_key, doc_id)", table.find_ancestor(exp.Select).args["where"].sql())

    def test_main_retains_original_projections_profile_choice_and_attachment_identity(self):
        original = sqlglot.parse_one(self.sql, read="clickhouse")
        sql = serve.main_sql(self.sql, [{"author_key": "a", "doc_id": "d", "group_id": "g"}], [("a", "profile")], "a" * 64)
        result = sqlglot.parse_one(sql, read="clickhouse")
        self.assertEqual([item.sql() for item in result.expressions], [item.sql() for item in original.expressions])
        self.assertIn("counting_numbers_p2", sql)
        self.assertIn("p.group_id", result.args["where"].sql())
        self.assertIn("QUALIFY", sql)
        self.assertNotIn("documents_d", sql)

    def test_candidates_use_request_bound_and_original_filter_not_fixed_page(self):
        for limit in (2, 22, 76):
            sql = serve.candidate_sql(self.sql, "group", None, limit)
            self.assertTrue(sql.endswith("LIMIT " + str(limit)))
            self.assertIn("NOT has(t.tags", sql)
            self.assertNotIn("documents ", sql)
            sqlglot.parse_one(sql, read="clickhouse")
        grouped = sqlglot.parse_one(self.sql, read="clickhouse")
        grouped.group_by("p.doc_id", copy=False)
        with self.assertRaises(ValueError):
            serve.candidate_sql(grouped.sql(dialect="clickhouse"), "group", None, 22)

    def test_zero_valued_reaction_group_is_kept_by_exact_presence_not_fake_events(self):
        select = sqlglot.parse_one("SELECT ref_value,countIf(JSONExtractString(body,'type')='like') AS like_count,"
            "countIf(JSONExtractString(body,'type')='dislike') AS dislike_count FROM reactions "
            "WHERE ref_value IN ('d') GROUP BY ref_value LIMIT 1", read="clickhouse")
        sql = serve.counter_query(select, "a" * 64, ["d"], "b" * 64)
        self.assertIn("GROUP BY doc_id", sql)
        self.assertNotIn("HAVING", sql)
        self.assertIn("7265616374696f6e733a70726573656e74", sql)
        self.assertTrue(sql.endswith("LIMIT 1"))

    def test_unknown_aggregate_or_added_filter_refuses_instead_of_changing_semantics(self):
        for sql in ("SELECT ref_value,sum(1) AS like_count FROM reactions GROUP BY ref_value",
                    "SELECT ref_value,countIf(JSONExtractString(body,'type')='like') AS like_count FROM reactions WHERE author_key='hidden' GROUP BY ref_value"):
            with self.assertRaises(ValueError):
                serve.counter_query(sqlglot.parse_one(sql, read="clickhouse"), "a" * 64, ["d"])

    def test_helper_parameters_are_encoded_before_parsing(self):
        sql = serve.bound_sql("SELECT * FROM doc_groups WHERE group_id=%(g)s", {"g": "quote'\\value"})
        sqlglot.parse_one(sql, read="clickhouse")
        self.assertNotIn("quote'", sql)


if __name__ == "__main__":
    unittest.main()
