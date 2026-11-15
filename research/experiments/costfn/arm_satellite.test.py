"""No-engine controls. These are preparation tests, never native T1–T8 proof."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import arm_satellite as arm


def budget():
    return {"kind": "SATELLITE_ARM_CONFIG_P_BUDGET", "dataset_id": arm.DATASET,
            "configuration": "P", "k": 20,
            "t1_count_parity": "PASS", "t2_complete_response_parity": "PASS",
            "trials": [{"trial_id": str(i), "samples": [{
                "parity": True, "complete_response": True, "elapsed_ms": 100,
                "all_native_reads_attributed": True,
                "native_reads": [{"query_id": str(i), "read_rows": 100,
                                  "read_bytes": 1000, "exception_code": 0}]}]}
                       for i in range(3)]}


class InventoryTests(unittest.TestCase):
    def test_native_count_setup_memory_stop_is_not_t1_or_fanout_admission(self):
        root = arm.HERE / "evidence/arm-satellite-20261115/counts-stopped"
        report = json.loads((root / "report.json").read_bytes())
        for name, digest in report["artifact_sha256"].items():
            self.assertEqual(arm.sha(root / name), digest)
        self.assertEqual(report["failed_query"]["exception_code"], 241)
        self.assertEqual(report["T1"], "NOT_ESTABLISHED")
        self.assertFalse(report["partial_rows_are_serveable"])
        self.assertFalse(report["clickhouse_oom_killed_before_stop"])
        self.assertFalse(report["retry_started"])
        self.assertTrue(all(row["State"] == "exited" for row in report["owned_containers"]))
        self.assertEqual(arm.fanout_gate(report)["verdict"], "HOLD")

    def test_untreated_native_report_retains_failures_and_cannot_pass_config_p_gate(self):
        root = arm.HERE / "evidence/arm-satellite-20261115/untreated"
        report = json.loads((root / "report.json").read_bytes())
        inventory = json.loads((root / "inventory.json").read_bytes())
        for name, digest in report["artifacts_sha256"].items():
            self.assertEqual(arm.sha(root / name), digest)
        for stage in inventory["stages"]:
            self.assertEqual(stage["read_rows"], sum(int(row["read_rows"]) for row in stage["native_queries"]))
            self.assertEqual(stage["read_bytes"], sum(int(row["read_bytes"]) for row in stage["native_queries"]))
        self.assertEqual([stage["http_completed"] for stage in report["stages"]], [False, False, False, True])
        self.assertEqual(report["complete_sequence_parity"], "NOT_ESTABLISHED")
        self.assertIn("without an explicit", report["views_read_deadline_caveat"])
        self.assertEqual(arm.fanout_gate(report)["verdict"], "HOLD")

    def test_source_bound_inventory_does_not_claim_live_profile_or_build(self):
        receipt = arm.inventory()
        self.assertFalse(receipt["engine_executed"])
        self.assertFalse(receipt["fresh_realism_profile"])
        self.assertFalse(receipt["builds_started"])
        self.assertEqual(receipt["fanout"], "GATED_OFF")
        self.assertEqual(receipt["configuration"], "P")
        for group in ("source_sha256", "evidence_sha256"):
            for filename, digest in receipt[group].items():
                self.assertEqual(arm.sha(arm.ROOT / filename), digest)
        self.assertEqual(len(receipt["preserved_native_main_split"]), 4)
        for native in receipt["preserved_native_main_split"]:
            self.assertEqual(native["main_read_rows"], 1_720_364)
            self.assertEqual(native["main_read_bytes"], 156_463_443)

    def test_all_required_satellites_stay_in_inventory(self):
        stages = {name: kind for name, kind, _ in arm.STAGES}
        for name in ("group_time_selection", "engagement_main_and_followups", "repost_metadata",
                     "profile_resolution", "ad_inventory", "views", "shared_time_and_ranking"):
            self.assertEqual(stages[name], "S")
        self.assertNotIn("written_feed", stages)
        self.assertEqual(stages["winner_access"], "C")

    def test_audit_captures_fixed_limits_and_corrects_inventory_claim(self):
        receipt = arm.inventory()
        findings = receipt["reviewed_findings"]
        self.assertTrue(any("not empty bypass" in row["finding"] for row in findings))
        self.assertTrue(any("four-boundary" in row["finding"] for row in findings))
        census = receipt["literal_census"]
        self.assertTrue(any(row["preview"] == "21" for rows in census.values() for row in rows))
        self.assertTrue(all(row["lines"] for row in findings))

    def test_schema_proves_documents_only_omits_required_sources(self):
        schema = (arm.ROOT / "clickhouse-init/001-init-v3-schema.sql.template").read_text()
        documents = schema.split("CREATE TABLE IF NOT EXISTS documents (", 1)[1].split(
            ") ENGINE", 1)[0]
        for field in ("group_id", "member_key", "event_type"):
            self.assertNotIn(field, documents)
        for table in ("doc_groups", "group_members", "content_events"):
            self.assertIn("CREATE TABLE IF NOT EXISTS " + table, schema)
        # Same documents, two legal attachment states, different correct counts.
        engagement_ids = {"same-author-reaction", "same-author-comment"}
        links_a = {(doc, "discover") for doc in engagement_ids}
        links_b = links_a | {(doc, "following") for doc in engagement_ids}
        def count(links, group):
            return len({doc for doc, scope in links if scope == group})
        self.assertEqual(count(links_a, "following"), 0)
        self.assertEqual(count(links_b, "following"), 2)
        self.assertEqual(count(links_a, "discover"), 2)

    def test_group_totals_cannot_be_summed_for_distinct_scope_union(self):
        links = {("reaction", "a"), ("reaction", "b")}
        self.assertEqual(sum(len({d for d, g in links if g == scope}) for scope in ("a", "b")), 2)
        self.assertEqual(len({d for d, g in links if g in {"a", "b"}}), 1)

    def test_cli_preserves_existing_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "inventory.json"
            command = [sys.executable, str(Path(arm.__file__)), "inventory", "--out", str(output)]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            original = output.read_bytes()
            self.assertEqual(json.loads(original)["configuration"], "P")
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(output.read_bytes(), original)


class GateTests(unittest.TestCase):
    def test_pass_defers_fanout(self):
        result = arm.fanout_gate(budget())
        self.assertEqual(result["verdict"], "DEFER_FANOUT")
        self.assertFalse(result["fanout_build_authorized"])

    def test_count_and_complete_sequence_parity_are_prerequisites(self):
        for gate in ("t1_count_parity", "t2_complete_response_parity"):
            for status, want in (("FAIL", "INVALID_STOP"), ("NOT_RUN", "HOLD"), (None, "HOLD")):
                receipt = budget()
                receipt[gate] = status
                self.assertEqual(arm.fanout_gate(receipt)["verdict"], want)

    def test_failure_requires_whole_sequence_bytes_not_per_stage(self):
        receipt = budget()
        for index, trial in enumerate(receipt["trials"]):
            sample = trial["samples"][0]
            sample["native_reads"][0]["read_bytes"] = 13_000_000
            sample["native_reads"].append({"query_id": "extra-" + str(index),
                "read_rows": 100, "read_bytes": 13_000_000, "exception_code": 0})
        result = arm.fanout_gate(receipt)
        self.assertEqual(result["verdict"], "COST_GATE_FIRED")
        self.assertEqual(result["max_total_read_bytes"], 26_000_000)
        self.assertFalse(result["fanout_build_authorized"])

    def test_exact_budget_boundaries_fail(self):
        for field, value in (("elapsed_ms", 500), ("read_bytes", 25_000_000)):
            receipt = budget()
            sample = receipt["trials"][0]["samples"][0]
            (sample if field == "elapsed_ms" else sample["native_reads"][0])[field] = value
            self.assertEqual(arm.fanout_gate(receipt)["verdict"], "COST_GATE_FIRED")

    def test_parity_and_row_stop_never_open_fanout(self):
        for field, value, want in (("parity", False, "INVALID_STOP"),
                                    ("read_rows", 10_000_001, "STOP")):
            receipt = budget()
            sample = receipt["trials"][0]["samples"][0]
            (sample if field == "parity" else sample["native_reads"][0])[field] = value
            result = arm.fanout_gate(receipt)
            self.assertEqual(result["verdict"], want)
            self.assertFalse(result["fanout_build_authorized"])

    def test_missing_sequence_and_native_exception_hold_gate(self):
        for field, value in (("complete_response", False), ("parity", None),
                              ("all_native_reads_attributed", False), ("native_reads", [])):
            receipt = budget()
            receipt["trials"][0]["samples"][0][field] = value
            self.assertEqual(arm.fanout_gate(receipt)["verdict"], "HOLD")
        receipt = budget()
        receipt["trials"][0]["samples"][0]["native_reads"][0]["exception_code"] = 159
        self.assertEqual(arm.fanout_gate(receipt)["verdict"], "HOLD")

    def test_nonfinite_negative_bool_and_string_metrics_are_not_evidence(self):
        for value in (float("nan"), float("inf"), -1, True, "100"):
            receipt = budget()
            receipt["trials"][0]["samples"][0]["elapsed_ms"] = value
            self.assertEqual(arm.fanout_gate(receipt)["verdict"], "HOLD")

    def test_wrong_source_config_k_and_trial_replay_hold_gate(self):
        for field, value in (("dataset_id", "wrong"), ("configuration", "F"),
                              ("k", 20.0), ("trials", [])):
            receipt = budget()
            receipt[field] = value
            self.assertEqual(arm.fanout_gate(receipt)["verdict"], "HOLD")
        receipt = budget()
        receipt["trials"][1] = copy.deepcopy(receipt["trials"][0])
        self.assertEqual(arm.fanout_gate(receipt)["verdict"], "HOLD")
        for invalid in (None, [], {}, {"kind": None}):
            self.assertEqual(arm.fanout_gate(invalid)["verdict"], "HOLD")

    def test_k1000_cost_failure_asks_operator_not_automatic_config_f(self):
        receipt = budget()
        receipt["k"] = 1000
        receipt["trials"][0]["samples"][0]["elapsed_ms"] = 501
        self.assertEqual(arm.fanout_gate(receipt)["verdict"], "ASK_JACOB_K1000")


if __name__ == "__main__":
    unittest.main()
