"""No-network inventory payload controls; do not change the main's read scope."""
import unittest
import uuid

from arm_satellite_profile import stage_payload


class ProfileTests(unittest.TestCase):
    def test_main_keeps_following_groups_and_never_gets_reference_ids(self):
        groups = ["followed-group"]
        template = {"sql": "SELECT doc_id FROM posts LIMIT 21", "groups": ["old"]}
        result = stage_payload(template, "synthetic", groups, [str(uuid.uuid4())], "main")
        self.assertEqual(result["groups"], groups)
        self.assertEqual(result["sql"], template["sql"])
        self.assertEqual(template["groups"], ["old"])

    def test_followups_use_independent_ids_and_keep_normal_discover_scope(self):
        ids = [str(uuid.uuid4())]
        result = stage_payload({"sql": "SELECT ref_value FROM reactions WHERE ref_value IN (__POST_IDS__)"},
                               "synthetic", ["followed-group"], ids, "reactions")
        self.assertIn(ids[0], result["sql"])
        self.assertIn("followed-group", result["groups"])
        self.assertTrue(any(group.endswith("/discover") for group in result["groups"]))


if __name__ == "__main__":
    unittest.main()
