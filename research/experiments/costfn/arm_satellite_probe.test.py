"""No-network full-sequence gate refusal controls."""
import copy
import unittest

import arm_satellite_probe as probe


def evidence():
    samples = [{"success": True, "native_totals": {"exception_codes": []}, "native_queries": [{"query_id": str(i), "read_rows": "100"}]} for i in range(4)]
    requests = [{"request_id": str(i), "kind": "main"} for i in range(4)]
    observations = [{"request_id": str(i), "arm_p": {"canonical_body_reads": True}} for i in range(4)]
    hashes = {str(i): "canonical-response-sha" for i in range(4)}
    return samples, requests, observations, hashes


class ProbeTests(unittest.TestCase):
    def test_complete_native_correlated_canonical_sequence_can_pass(self):
        self.assertTrue(probe.assess(*evidence()))

    def test_partial_untreated_uncompared_native_exception_or_row_stop_cannot_pass(self):
        cases = []
        value = evidence()
        value[0][0]["success"] = False
        cases.append(value)
        value = evidence()
        value[2][0]["arm_p"] = {}
        cases.append(value)
        value = evidence()
        value[3].pop("0")
        cases.append(value)
        value = evidence()
        value[0][0]["native_totals"]["exception_codes"] = [159]
        cases.append(value)
        value = evidence()
        value[0][0]["native_queries"][0]["read_rows"] = "10000001"
        cases.append(value)
        value = evidence()
        value[2][0]["arm_p_stop"] = "safety"
        cases.append(value)
        value = evidence()
        value[2][0]["delivery_failures"] = 1
        cases.append(value)
        for item in cases:
            self.assertFalse(probe.assess(*copy.deepcopy(item)))


if __name__ == "__main__":
    unittest.main()
