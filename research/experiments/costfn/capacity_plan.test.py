#!/usr/bin/env python3
"""Arithmetic tests only; green does not mean a capacity experiment ran."""
import unittest
import capacity_plan as capacity


class PlanTests(unittest.TestCase):
    def test_funnel(self):
        scenarios = capacity.plan()["scenarios"]
        self.assertEqual([[x["concurrent_users"] for x in s["session_concurrency"]]
                          for s in scenarios], [[1000, 3000], [3125, 9375], [18750]])

    def test_rate(self):
        rate = capacity.request_rates(10000, 60)
        self.assertAlmostEqual(rate["feed_loads_per_second"], 166.6666667)
        self.assertEqual(rate["query_calls_per_second"], 500)
        self.assertAlmostEqual(rate["core_requests_per_second"], 666.6666667)
        self.assertEqual(capacity.request_rates(10000, 30)["query_calls_per_second"], 1000)

    def test_levels(self):
        rows = capacity.plan()["stepped_offered_load"]
        self.assertEqual(len(rows), 10)
        self.assertEqual({r["virtual_users"] for r in rows}, {1000, 3000, 5000, 10000, 20000})

    def test_invalid_rate(self):
        for users, interval in [(-1, 60), (10000, 0), (10000, -30)]:
            with self.assertRaises(ValueError):
                capacity.request_rates(users, interval)

    def test_not_evidence(self):
        self.assertEqual(capacity.plan()["status"], "PLANNED_NOT_MEASURED")
        self.assertEqual(capacity.plan()["seeded_authors_target"], 1000000)


if __name__ == "__main__":
    unittest.main()
