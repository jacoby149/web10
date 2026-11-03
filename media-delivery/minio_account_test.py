"""Offline regression for the exact MinIO status-update policy removal semantics."""

import copy
import hashlib
import json
import unittest

from minio_account import get_only_policy, policy_matches, update_restricted_account

BUCKET = "web10-cdn-smoke-20261103-0123456789abcdef"
NAME = "cdn-smoke-" + hashlib.sha256(BUCKET.encode()).hexdigest()[:16]
KEY = "SYNTHETICKEY12345"


class VulnerableServer:
    def __init__(self):
        self.policy = get_only_policy(BUCKET)
        self.status = "off"
        self.name = NAME
        self.calls = []
        self.corrupt = False

    def get_service_account(self, key):
        assert key == KEY
        return json.dumps(
            {
                "name": self.name,
                "accountStatus": self.status,
                "impliedPolicy": self.policy is None,
                "policy": self.policy,
            }
        )

    def update_service_account(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs))
        self.status = kwargs["status"]
        # Exact server behavior: omitted session policy removes an embedded one.
        self.policy = None if self.corrupt else kwargs.get("policy")


class PolicyUpdateTests(unittest.TestCase):
    def test_status_only_reproduces_policy_removal(self):
        server = VulnerableServer()
        server.update_service_account(access_key=KEY, status="on")
        self.assertIsNone(server.policy)
        self.assertEqual(server.status, "on")

    def test_atomic_updates_preserve_policy_through_disable_enable(self):
        server = VulnerableServer()
        for status in ("off", "on", "off", "on"):
            self.assertTrue(
                update_restricted_account(server, KEY, NAME, BUCKET, status)[
                    "policyVerified"
                ]
            )
            self.assertTrue(policy_matches(server.policy, BUCKET))
        self.assertTrue(
            all(call["policy"] == get_only_policy(BUCKET) for call in server.calls)
        )

    def test_repairs_inherited_account_while_disabled_first(self):
        server = VulnerableServer()
        server.policy = None
        update_restricted_account(server, KEY, NAME, BUCKET, "off")
        self.assertEqual(server.status, "off")
        self.assertTrue(policy_matches(server.policy, BUCKET))

    def test_wrong_account_or_scope_never_mutates(self):
        server = VulnerableServer()
        for bucket, name, status in [
            ("production", NAME, "on"),
            (BUCKET, "wrong", "on"),
            (BUCKET, NAME, "invalid"),
        ]:
            with self.assertRaises(ValueError):
                update_restricted_account(server, KEY, name, bucket, status)
        server.name = "unrelated"
        with self.assertRaises(ValueError):
            update_restricted_account(server, KEY, NAME, BUCKET, "on")
        self.assertEqual(server.calls, [])

    def test_failed_postcheck_requests_restricted_disable(self):
        server = VulnerableServer()
        server.corrupt = True
        with self.assertRaises(RuntimeError):
            update_restricted_account(server, KEY, NAME, BUCKET, "on")
        self.assertEqual(server.status, "off")
        self.assertTrue(
            all(call.get("policy") == get_only_policy(BUCKET) for call in server.calls)
        )

    def test_empty_broad_or_extra_authority_policy_rejected(self):
        self.assertFalse(policy_matches({"Statement": None}, BUCKET))
        for field, value in [
            ("Action", ["s3:*"]),
            ("Resource", ["*"]),
            ("NotAction", "s3:DeleteObject"),
        ]:
            policy = get_only_policy(BUCKET)
            policy["Statement"][0][field] = value
            self.assertFalse(policy_matches(policy, BUCKET))


if __name__ == "__main__":
    unittest.main()
