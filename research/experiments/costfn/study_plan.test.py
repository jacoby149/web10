#!/usr/bin/env python3
import copy
import json
import subprocess
import sys
import unittest

import study_plan as study


class StudyTests(unittest.TestCase):
    def setUp(self):
        self.wire = json.loads((study.HERE / "evidence/core-feed-wire-v2.json").read_bytes())

    def test_current_wire_is_valid_but_study_is_not_ready(self):
        result = study.audit(wire=self.wire)
        self.assertTrue(result["wire_capture_valid"])
        self.assertFalse(result["execution_authorized"])
        self.assertFalse(result["ready_to_run"])
        self.assertFalse(result["submission_ready"])
        self.assertIn("matched_baseline", {b["id"] for b in result["blockers"]})

    def test_pool_is_not_active_working_set(self):
        fixture = study.audit()["fixture"]
        self.assertEqual(fixture["pool_authors"], 1000000)
        self.assertEqual(fixture["following_candidate_author_span"], 1000)
        self.assertEqual(fixture["following_author_pool_coverage"], .001)
        self.assertEqual(fixture["authors_outside_followed_set"], 999000)
        self.assertIn("unmeasured", fixture["physical_rows_scanned"])

    def test_matrix_has_independent_repeats_and_correct_rates(self):
        points = study.matrix()
        self.assertEqual(len(points), 30)
        self.assertEqual(points, study.matrix())
        self.assertNotEqual(points, study.matrix(seed=43))
        keys = {(p["trial"], p["virtual_users"], p["locality"]) for p in points}
        self.assertEqual(len(keys), 30)
        self.assertTrue(all(p["dataset_id"] is None and p["candidate_groups"] == 1000 for p in points))
        high = next(p for p in points if p["virtual_users"] == 20000)
        self.assertAlmostEqual(high["target_feed_loads_per_second"], 333.3333333)
        self.assertEqual(high["target_query_calls_per_second"], 1000)
        self.assertAlmostEqual(high["target_content_views_calls_per_second"], 333.3333333)

    def test_budget_is_only_a_lower_bound(self):
        budget = study.audit()["budget"]
        self.assertEqual(budget["primary_phase_hours_lower_bound"], 2.5)
        self.assertEqual(budget["primary_compute_usd_lower_bound"], 1.875)
        self.assertIn("prep/import/session", budget["excludes"])

    def test_stale_source_or_lost_delivery_flag_blocks_capture(self):
        for kind in ("source", "flag", "rows", "token", "sql"):
            wire = copy.deepcopy(self.wire)
            if kind == "source": wire["sources"]["feed"]["sha256"] = "stale"
            if kind == "flag": del wire["requests"][0]["payload"]["surface"]
            if kind == "rows": wire["returned_rows_before_slice"] = 20
            if kind == "token": wire["requests"][0]["payload"]["token"] = "not-a-placeholder"
            if kind == "sql": wire["requests"][0]["payload"]["sql"] = "SELECT doc_id, body FROM posts LIMIT 21"
            with self.subTest(kind=kind):
                self.assertTrue(study.wire_errors(wire))

    def test_empty_feed_is_not_accepted_as_full_core(self):
        wire = copy.deepcopy(self.wire)
        wire["requests"] = wire["requests"][:1]
        self.assertTrue(study.wire_errors(wire))

    def test_planner_has_no_execute_mode(self):
        result = subprocess.run([sys.executable, str(study.HERE / "study_plan.py"), "--execute"], capture_output=True)
        self.assertEqual(result.returncode, 2)
        result = subprocess.run([sys.executable, str(study.HERE / "study_plan.py"), "--require-ready"], capture_output=True)
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
