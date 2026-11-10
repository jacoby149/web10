#!/usr/bin/env python3
"""Offline regression for the Arm D treatment transform.

Pins the golden compiled SQL (the pinned app/SDK main query compiled with
the merged dev compiler against the 20-group K=20 readable set): the
transform must succeed on it, refuse on any drift, and produce the exact
declared author-set shape. No ClickHouse, no network.
"""
import unittest

import arm_d_rewrite

HERE = arm_d_rewrite.__file__ and __import__("pathlib").Path(arm_d_rewrite.__file__).resolve().parent
GOLDEN = (HERE / "evidence/arm-d-compiled-main-golden-20261109.sql").read_text().strip()
GROUPS = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(20)]
AUTHORS = [arm_d_rewrite.owner_of_group(g) for g in GROUPS]
READER = "c42-reader"


class ArmDTests(unittest.TestCase):
    def test_transform_on_golden(self):
        rw = arm_d_rewrite.transform(GOLDEN, READER, GROUPS, AUTHORS)
        self.assertIn("author_key IN ('c42-c000000'", rw)
        self.assertNotIn("doc_groups", rw)
        for gate in ("group_blacklist", "user_group_sharing", "group_hidden_docs"):
            self.assertNotIn(gate, rw)
        for gate in ("user_blacklist", "banned_users"):
            self.assertIn(gate, rw)
        self.assertIn("(CASE d.author_key WHEN 'c42-c000000' THEN 'api.localhost/groups/users/c42-c000000/followers'", rw)
        self.assertTrue(rw.rstrip().endswith("LIMIT 21"))
        import sqlglot
        sqlglot.parse_one(rw, read="clickhouse")

    def test_refuses_compiler_drift(self):
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform(GOLDEN.replace("ORDER BY updated_at DESC", "ORDER BY updated_at ASC", 1),
                                    READER, GROUPS, AUTHORS)

    def test_refuses_wrong_reader(self):
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform(GOLDEN.replace("blocked_key = 'c42-reader'", "blocked_key = 'c42-evil'", 1),
                                    READER, GROUPS, AUTHORS)

    def test_refuses_group_mismatch(self):
        import re
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform(re.sub(r"c42-c000005/followers", "c42-c000099/followers", GOLDEN, count=1),
                                    READER, GROUPS, AUTHORS)

    def test_refuses_reader_argument_mismatch(self):
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform(GOLDEN, "c42-r000001", GROUPS, AUTHORS)

    def test_owner_parsing(self):
        # Non-follower groups are refused. (A foreign provider's group path is
        # shape-indistinguishable from a local one; locality is enforced by the
        # byte-exact pin + the verification queries, not by this parser.)
        with self.assertRaises(ValueError):
            arm_d_rewrite.owner_of_group("api.localhost/groups/web10/discover")
        self.assertEqual(arm_d_rewrite.owner_of_group("api.localhost/groups/users/c42-c000000/followers"),
                         "c42-c000000")

    def test_verify_sql_shapes(self):
        checks = arm_d_rewrite.verify_sql(READER, GROUPS, AUTHORS)
        self.assertEqual(len(checks), 3)
        self.assertEqual(checks[0][1], 20)
        self.assertEqual(checks[1][1], 20)
        self.assertEqual(checks[2][1], 0)
        self.assertIn("count(DISTINCT group_id)", checks[0][0])
        self.assertIn("role = 'owner'", checks[1][0])



RE_GOLDEN = (HERE / "evidence/arm-d-compiled-followup-reactions-golden-20261110.sql").read_text().strip()
CM_GOLDEN = (HERE / "evidence/arm-d-compiled-followup-comments-golden-20261110.sql").read_text().strip()
FOLLOWUP_GROUPS = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(20)] + ["api.localhost/groups/web10/discover"]


class ArmDFollowupTests(unittest.TestCase):
    def test_transform_followup(self):
        rw = arm_d_rewrite.transform_followup(RE_GOLDEN, READER, "reactions")
        self.assertIsNotNone(rw)
        self.assertIn("ref_value IN ('c42-doc-0'", rw)
        self.assertNotIn("doc_groups", rw)
        self.assertIn("NULL AS group_id", rw)
        rw2 = arm_d_rewrite.transform_followup(CM_GOLDEN, READER, "comments")
        self.assertIsNotNone(rw2)
        self.assertIn("ref_value IN ('c42-doc-0'", rw2)

    def test_returns_none_on_non_followup_shape(self):
        self.assertIsNone(arm_d_rewrite.transform_followup(GOLDEN, READER, "reactions"))

    def test_refuses_drift(self):
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform_followup(RE_GOLDEN.replace("ORDER BY updated_at DESC", "ORDER BY updated_at ASC", 1),
                                             READER, "reactions")
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform_followup(RE_GOLDEN, READER, "profile")

    def test_verify_sql_shapes(self):
        ids = arm_d_rewrite.followup_ids(RE_GOLDEN)
        checks = arm_d_rewrite.followup_verify_sql(READER, ids, FOLLOWUP_GROUPS)
        self.assertEqual([c[1] for c in checks], [20, 1, 0])
        self.assertIn("count(DISTINCT doc_id)", checks[0][0])
        self.assertIn("discover", checks[1][0])




class ArmDSatelliteTests(unittest.TestCase):
    def test_satellite_sql_shapes(self):
        ids = [f"c42-doc-{i}" for i in range(20)]
        re_sql = arm_d_rewrite.satellite_followup_sql("reactions", ids)
        cm_sql = arm_d_rewrite.satellite_followup_sql("comments", ids)
        import sqlglot
        sqlglot.parse_one(re_sql, read="clickhouse")
        sqlglot.parse_one(cm_sql, read="clickhouse")
        self.assertIn("counting_numbers", re_sql)
        self.assertIn("'reactions:like'", re_sql)
        self.assertIn("'reactions:dislike'", re_sql)
        self.assertIn("coalesce", re_sql)
        self.assertIn("'comments'", cm_sql)
        self.assertNotIn("documents", re_sql)
        self.assertNotIn("doc_groups", re_sql)

    def test_satellite_transform_pins_golden(self):
        rw = arm_d_rewrite.transform_followup_satellite(RE_GOLDEN, READER, "reactions")
        self.assertIsNotNone(rw)
        self.assertIn("counting_numbers", rw)
        rw2 = arm_d_rewrite.transform_followup_satellite(CM_GOLDEN, READER, "comments")
        self.assertIsNotNone(rw2)

    def test_satellite_transform_refuses_drift(self):
        with self.assertRaises(ValueError):
            arm_d_rewrite.transform_followup_satellite(RE_GOLDEN.replace("ORDER BY updated_at DESC", "ORDER BY updated_at ASC", 1),
                                                       READER, "reactions")
        self.assertIsNone(arm_d_rewrite.transform_followup_satellite(GOLDEN, READER, "reactions"))  # main SQL: not the follow-up shape -> None
    def test_satellite_refuses_wrong_service(self):
        with self.assertRaises(ValueError):
            arm_d_rewrite.satellite_followup_sql("posts", ["a"])


if __name__ == "__main__":
    unittest.main()
