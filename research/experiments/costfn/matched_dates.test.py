import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx

import date_case
import dataset_v2
import matched_dates as matched


class MatchedDateTests(unittest.TestCase):
    def test_startup_connection_errors_are_bounded_readiness_not_arm_failure(self):
        with patch.object(matched.httpx, "get", side_effect=httpx.ConnectError("not ready")):
            self.assertFalse(matched.api_ready("http://127.0.0.1:6098"))

    def test_balanced_orders_and_source_built_treatments(self):
        self.assertEqual([sorted(order) for order in matched.ORDERS], [["A", "B", "C"]] * 3)
        for column in zip(*matched.ORDERS):
            self.assertEqual(set(column), {"A", "B", "C"})
        a, b, c = [matched.capture(arm) for arm in ("A", "B", "C")]
        self.assertNotIn("p.created_at >=", a["requests"][0]["payload"]["sql"])
        self.assertIn(str(date_case.CUTOFF_MS), b["requests"][0]["payload"]["sql"])
        self.assertEqual(b, c)
        self.assertEqual(a["requests"][1:], b["requests"][1:])

    def test_validated_input_reuses_proof_only_for_identical_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent, dated = Path(temporary) / "parent", Path(temporary) / "dated"
            dataset_v2.build(parent, {"creators": 1000, "follow": 1000, "readers": 2, "seed": 42, "locality": "dispersed"})
            date_case.derive(parent, dated)
            verified = {**date_case.validate(dated), "complete": True}
            guard = matched.ValidatedInput(dated, verified)
            self.assertEqual(guard.validate(dated)["dataset_id"], verified["dataset_id"])
            with (dated / "documents.jsonl.gz").open("ab") as target:
                target.write(b"corrupt")
            with self.assertRaisesRegex(ValueError, "bytes changed"):
                guard.validate(dated)
            manifest = json.loads((dated / "manifest.json").read_bytes())
            manifest["date_contract"]["recent_percent"] = 99
            (dated / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                matched.ValidatedInput(dated, verified)

    def test_exact_native_attribution_includes_failed_main(self):
        request = {"request_id": "a" * 32, "kind": "main", "phase": "measured", "reader_index": 0,
                   "status": 400, "client_ms": 10010, "server": {"date_plan_applied": True,
                   "date_pruning_enabled": True, "compiled_query_sha256s": ["hash"],
                   "native_queries": [{"query_id": "b" * 32, "sql_sha256": "hash"}]}}
        terminal = [{"query_id": "b" * 32, "exception_code": 159, "read_rows": "123", "read_bytes": "456"}]
        result = matched.native_attribution({"observations": [request]}, terminal, "C")
        self.assertEqual(result["requests"][0]["compiled_main"]["exception_code"], 159)
        for arm, rows in (("B", terminal), ("C", []), ("C", terminal * 2)):
            with self.assertRaises(ValueError):
                matched.native_attribution({"observations": [request]}, rows, arm)
        bad = copy.deepcopy(request)
        bad["server"]["native_query_observation_skipped"] = 1
        with self.assertRaises(ValueError):
            matched.native_attribution({"observations": [bad]}, terminal, "C")
        with self.assertRaises(ValueError):
            matched.native_attribution({"observations": [request], "missing_ids": ["c" * 32]}, terminal, "C")
        wrong = [{**terminal[0], "exception_code": 47}]
        with self.assertRaises(ValueError):
            matched.native_attribution({"observations": [request]}, wrong, "C")

    def test_active_compose_overlay_is_pinned(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "memory.compose.yml"
            path.write_text("services: {}\n")
            initial = matched.active_compose_hashes([path])
            path.write_text("services: {api: {cpus: 1}}\n")
            self.assertNotEqual(initial, matched.active_compose_hashes([path]))


class ImmediateMainTests(unittest.IsolatedAsyncioTestCase):
    async def test_main_semantics_are_checked_before_failed_or_missing_followups(self):
        request = AsyncMock(return_value={"rows": [{"doc_id": "wrong-main-row"}]})

        def reject(reader, rows):
            raise ValueError("invalid main before follow-ups")

        with patch.object(matched.core_feed, "request", request):
            with self.assertRaisesRegex(ValueError, "invalid main before follow-ups"):
                await matched.core_feed.feed(None, matched.capture("B"), "synthetic-token", ["group"], [], "measured", 0,
                                            main_checker=reject)
        self.assertEqual(request.await_count, 1)


if __name__ == "__main__":
    unittest.main()
