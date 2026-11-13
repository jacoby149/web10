"""Independent semantic controls, no engine, network or generated dataset."""
import copy
import unittest

import smoke_realism as smoke


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.raw = {"doc_id": "doc", "author_key": "author", "posted_by": "author", "tags": [],
                    "ref_value": "", "ad_mode": "none", "ad_target": "", "body": '{"text":"post"}',
                    "created_ms": 1735689600000}
        self.row = {k: v for k, v in self.raw.items() if k != "created_ms"}
        self.row.update(body={"text": "post"}, created_at="2025-01-01T00:00:00Z", group_id="g",
                        profile_body={"display_name": "Name"}, likes=0, dislikes=0, comments=0, reposts=0, score=0)

    def check(self, row):
        smoke.validate_rows([row], [self.raw], {"author": {"display_name": "Name"}}, {"doc": ["g"]}, {})

    def test_all_projected_values_checked_not_only_ids(self):
        self.check(self.row)
        for key, bad in (("body", {"text": "wrong"}), ("author_key", "other"), ("likes", 99),
                         ("profile_body", {}), ("created_at", "2025-01-02T00:00:00Z"), ("group_id", "wrong")):
            row = copy.deepcopy(self.row)
            row[key] = bad
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check(row)

    def test_live_views_exact_not_lower_bound(self):
        followups = [{"rows": []}, {"rows": []}, {"doc": {"impressions": 3, "reach": 2}}]
        smoke.validate_followups(["doc"], followups, {}, {"doc": {"impressions": 3, "reach": 2}})
        with self.assertRaisesRegex(ValueError, "views"):
            smoke.validate_followups(["doc"], followups, {}, {"doc": {"impressions": 2, "reach": 2}})

    def test_duplicate_and_unrequested_followups_denied(self):
        row = {"ref_value": "doc", "like_count": 1, "dislike_count": 0}
        for rows in ([row, row], [{**row, "ref_value": "other"}]):
            with self.assertRaises(ValueError):
                smoke.validate_followups(["doc"], [{"rows": rows}, {"rows": []}, {}], {}, {})

    def test_identifier_interpolation_refuses_escape(self):
        for values in ([], ["x' OR 1"], ["x\\y"], [1]):
            with self.assertRaises(ValueError):
                smoke.literals(values)


if __name__ == '__main__':
    unittest.main()
