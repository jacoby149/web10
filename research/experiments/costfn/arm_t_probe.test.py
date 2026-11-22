"""Offline parity-receipt classification, not connected execution."""
import copy
import asyncio
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import arm_t
import arm_t_probe
import httpx


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.samples = [{"phase": p, "success": True, "exact_projected_rows": True, "exact_followups": True}
                        for p in ("warmup", "measured", "measured", "measured")]
        self.requests = [{"kind": "main", "request_id": str(i)} for i in range(4)]
        self.observed = [{"request_id": str(i), "arm_t": {
            "snapshot": "build", "selection_cost_is_main_request_cost": True}} for i in range(4)]

    def check(self):
        return arm_t_probe.verdict(self.samples, self.requests, self.observed, "build")

    def test_all_exact_treated_sequences_establish_diagnostic_parity_only(self):
        self.assertEqual(self.check(), "PASS")

    def test_semantic_failure_is_invalid_not_a_slow_sample(self):
        self.samples[1].update(success=False, failure_class="semantic_failure")
        self.assertEqual(self.check(), "INVALID")

    def test_adapter_detected_undefined_tie_order_is_invalid_even_if_http_failed(self):
        self.observed[0]["arm_t"]["invalid_reason"] = "ambiguous captured Newest timestamp tie"
        self.samples[0].update(success=False, failure_class="http_failure")
        self.assertEqual(self.check(), "INVALID")

    def test_http_failure_or_missing_projection_never_establishes_parity(self):
        saved = copy.deepcopy(self.samples)
        for changes in ({"success": False, "failure_class": "http_failure"}, {"exact_projected_rows": False},
                        {"exact_followups": False}):
            self.samples = copy.deepcopy(saved)
            self.samples[1].update(changes)
            self.assertEqual(self.check(), "NOT_ESTABLISHED")
        self.samples = saved[:3]
        self.assertEqual(self.check(), "NOT_ESTABLISHED")

    def test_untreated_missing_or_wrong_snapshot_observations_refuse(self):
        saved = copy.deepcopy(self.observed)
        for observations in ([], saved[:3], [{**saved[0], "arm_t": {}}, *saved[1:]],
                             [{**saved[0], "arm_t": {"snapshot": "other"}}, *saved[1:]]):
            self.observed = observations
            with self.assertRaises(ValueError):
                self.check()

    def test_invalid_http_response_stops_after_first_attempt_and_restores_request(self):
        async def request(*args, **kwargs):
            response = httpx.Response(400, headers={"x-arm-t-invalid": "1"}, request=httpx.Request("POST", "http://test.invalid"))
            response.raise_for_status()

        original = AsyncMock(side_effect=request)
        core = types.SimpleNamespace(request=original)

        async def diagnostic():
            with arm_t_probe.stop_on_invalid(core):
                for _ in range(4):
                    try:
                        await core.request()
                    except ValueError:
                        break  # The unchanged smoke's semantic-failure stop.

        asyncio.run(diagnostic())
        self.assertEqual(original.await_count, 1)
        self.assertIs(core.request, original)

    def test_ordinary_native_timeouts_remain_http_failures_not_invalid_semantics(self):
        response = httpx.Response(400, request=httpx.Request("POST", "http://test.invalid"))
        error = httpx.HTTPStatusError("synthetic timeout", request=response.request, response=response)
        core = types.SimpleNamespace(request=AsyncMock(side_effect=error))

        async def diagnostic():
            with arm_t_probe.stop_on_invalid(core):
                with self.assertRaises(httpx.HTTPStatusError):
                    await core.request()

        asyncio.run(diagnostic())

    def test_mismatched_build_admission_stops_before_any_oracle_work(self):
        import smoke_realism

        with tempfile.TemporaryDirectory() as root, \
             patch.object(arm_t, "digitalocean_id", return_value=222), \
             patch.object(arm_t, "admission"), \
             patch.object(arm_t, "read_build", return_value={"admission_sha256": "different-admission"}), \
             patch.object(arm_t, "runtime_admission", side_effect=ValueError("mismatched admission")), \
             patch.object(smoke_realism, "smoke", new_callable=AsyncMock) as smoke:
            with self.assertRaisesRegex(ValueError, "mismatched admission"):
                asyncio.run(arm_t_probe.probe("input", "restore", "build", "admission", Path(root) / "out"))
            smoke.assert_not_called()


if __name__ == "__main__":
    unittest.main()
