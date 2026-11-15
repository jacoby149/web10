import copy
import unittest

from arm_satellite_ad_parity import validate_main
import arm_satellite_ad_parity as parity
import sqlglot


def ad(doc, author):
    return {"doc_id": doc, "author_key": author, "posted_by": author,
            "body": {"text": doc, "status": "active"}, "tags": ["ad", "node_ad"]}


class AdParityTests(unittest.TestCase):
    def test_independent_eligibility_uses_canonical_history_not_satellites(self):
        for query in (parity.candidate_sql(), parity.eligible_heads_sql(["doc"]), parity.payload_sql([("author", "doc")])):
            sqlglot.parse_one(query, read="clickhouse")
            self.assertNotIn("strings", query)
            self.assertNotIn("counting_numbers", query)
        self.assertNotIn("deleted=0", parity.candidate_sql())
        self.assertIn("WITH TIES", parity.eligible_heads_sql(["doc"]))
        self.assertIn("ORDER BY updated_at DESC,deleted DESC", parity.payload_sql([("author", "doc")]))

    def test_different_proper_creative_passes_without_changing_content_or_placement(self):
        first, second = ad("a", "owner-a"), ad("b", "owner-b")
        expected = [{"doc_id": "post", "likes": 1, "node_ad": first}]
        actual = [{"doc_id": "post", "likes": 1, "node_ad": second}]
        proof = validate_main(actual, expected, [first, second])
        self.assertEqual(proof["canonical_node_ads_checked"], 1)
        self.assertFalse(proof["creative_identity_equality_required"])

    def test_ineligible_owner_payload_status_or_unverified_media_does_not_pass(self):
        canonical = ad("a", "owner")
        expected = [{"doc_id": "post", "node_ad": canonical}]
        changes = ({"doc_id": "not-certified"}, {"posted_by": "forged"},
                   {"body": {"text": "wrong", "status": "active"}},
                   {"body": {"text": "a", "status": "paused"}}, {"read_url": "unverified"})
        for change in changes:
            actual = [{"doc_id": "post", "node_ad": {**copy.deepcopy(canonical), **change}}]
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_main(actual, expected, [canonical])

    def test_core_creator_ad_or_placement_changes_still_fail(self):
        canonical = ad("a", "owner")
        expected = [{"doc_id": "post", "likes": 1, "node_ad": canonical}]
        for actual in ([{"doc_id": "post", "likes": 2, "node_ad": canonical}],
                       [{"doc_id": "post", "likes": 1}],
                       [{"doc_id": "post", "likes": 1, "ad": canonical, "node_ad": canonical}]):
            with self.assertRaises(ValueError):
                validate_main(actual, expected, [canonical])
        with self.assertRaises(ValueError):
            validate_main([{"doc_id": "post", "node_ad": {}}], [{"doc_id": "post"}], [canonical])


if __name__ == "__main__":
    unittest.main()
