#!/usr/bin/env python3
from pathlib import Path
import unittest

import dataset
import provenance
import readiness_v2
import run_core_point
import topology


class ReadinessTests(unittest.TestCase):
    def test_missing_live_receipt_or_published_fixture_never_prepared(self):
        result = readiness_v2.audit({}, [])
        self.assertFalse(result["software_and_inputs_ready"])
        self.assertEqual(len(result["primary_points"]), 30)
        self.assertTrue(all(p["dataset_id"] is None for p in result["primary_points"]))

    def test_receipts_fill_schedule_without_authorizing_cloud_or_submission(self):
        publications = [{"recipe": {"locality": locality, "creators": 1000000, "readers": 20000, "follow": 1000},
            "complete": True, "dataset_id": identity, "download_verified": {"dataset_id": identity},
            "generator_sha256": dataset.digest(Path(__file__).with_name("dataset_v2.py"))}
            for locality, identity in (("hot", "a" * 64), ("dispersed", "b" * 64))]
        accepted = {"local_acceptance": True, "sources": provenance.sources()}
        result = readiness_v2.audit(accepted, publications)
        self.assertTrue(result["software_and_inputs_ready"])
        self.assertEqual({p["dataset_id"] for p in result["primary_points"]}, {"a" * 64, "b" * 64})
        self.assertFalse(result["cloud_execution_authorized"])
        self.assertFalse(result["submission_ready"])
        accepted["sources"] = {}
        self.assertFalse(readiness_v2.audit(accepted, publications)["software_and_inputs_ready"])

    def test_unverified_download_not_a_published_input(self):
        publication = {"recipe": {"locality": "hot"}, "complete": True, "dataset_id": "a" * 64}
        self.assertFalse(readiness_v2.audit({}, [publication])["software_and_inputs_ready"])


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.receipt = {"project": "web10-costfn-frozen-test", "api": "http://10.20.0.2:6091", "correctness": {"sources": provenance.sources()}}
        self.approval = {"purpose": "synthetic-core-feed-study", "execution_authorized": True,
            "cleanup_watchdog_verified": True, "project": self.receipt["project"], "sources": provenance.sources(),
            "api_origin": self.receipt["api"],
            "hosts": [{"role": role, "identity": role + "-synthetic-test", "region": "test", "cpu": 8,
                "ram_gb": 16, "software": "test", "hourly_usd": .25} for role in ("api", "db", "generator")],
            "max_usd": 10, "resource_started_epoch": 1000, "hard_stop_epoch": 5000, "cleanup_reserve_seconds": 300}

    def test_explicit_approval_has_remaining_bounded_lifetime(self):
        self.assertEqual(run_core_point.check_approval(self.approval, self.receipt, now=1100), 3600)

    def test_denied_without_approval_watchdog_specs_or_budget(self):
        for change in ({"execution_authorized": False}, {"cleanup_watchdog_verified": False}, {"max_usd": 11},
                       {"hard_stop_epoch": 1200}, {"sources": {}}, {"hosts": []}, {"api_origin": "https://api.web10.app"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                run_core_point.check_approval({**self.approval, **change}, self.receipt, now=1100)


class TopologyTests(unittest.TestCase):
    def setUp(self):
        self.config = {"project": "web10-costfn-frozen-test", "api_port": 6091,
            "docker_contexts": {"api": "costfn-api", "db": "costfn-db"},
            "api_private_ip": "10.20.0.2", "db_private_ip": "10.20.0.3", "api_repo_directory": "/opt/web10"}

    def test_separate_contexts_fixed_files_and_private_environment(self):
        api = topology.commands(self.config)
        db = topology.commands(self.config, "db")
        self.assertEqual(api[:4], ["docker", "--context", "costfn-api", "compose"])
        self.assertEqual(db[:4], ["docker", "--context", "costfn-db", "compose"])
        self.assertEqual(api[-2:], ["-p", self.config["project"]])
        self.assertTrue(any(p.endswith("distributed.compose.yml") for p in api))
        self.assertEqual(topology.environment(self.config, {})["COSTFN_DB_IP"], "10.20.0.3")

    def test_public_bind_same_host_arbitrary_context_and_path_denied(self):
        for change in ({"db_private_ip": "8.8.8.8"}, {"db_private_ip": "10.20.0.2"},
                       {"api_repo_directory": "/opt/../private"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                topology.environment({**self.config, **change}, {})
        config = {**self.config, "docker_contexts": {"api": "default", "db": "costfn-db"}}
        with self.assertRaises(ValueError):
            topology.commands(config)

    def test_local_default_does_not_gain_distributed_binds(self):
        config = {"project": "web10-costfn-frozen-test", "api_port": 6091}
        command = topology.commands(config)
        self.assertEqual(command[:2], ["docker", "compose"])
        self.assertFalse(any(p.endswith("distributed.compose.yml") for p in command))


if __name__ == "__main__":
    unittest.main()
