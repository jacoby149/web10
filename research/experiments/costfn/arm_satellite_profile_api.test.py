"""No-engine observer controls: exact SQL passes through, no token/body capture."""
import contextvars
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import arm_satellite_runtime as runtime
import arm_t


class ObserverTests(unittest.TestCase):
    def load(self, root, compile_query):
        operation = root / "operation.json"
        operation.write_text("{}")
        observer = SimpleNamespace(original_compile=compile_query,
            current=contextvars.ContextVar("scope-test", default={"request_id": "a" * 32}), application=object())
        spec = importlib.util.spec_from_file_location("isolated_profile_observer", Path(__file__).with_name("arm_satellite_profile_api.py"))
        module = importlib.util.module_from_spec(spec)
        with (patch.dict(os.environ, SATELLITE_OPERATION=str(operation), SATELLITE_SCOPES_DIR=str(root)),
              patch.dict("sys.modules", {"research_api": observer}),
              patch.object(runtime, "admitted") as admitted, patch.object(arm_t, "digitalocean_id", return_value=123)):
            spec.loader.exec_module(module)
            admitted.assert_called_once_with({}, 123)
        return module, observer

    def test_compiler_result_and_actual_unequal_service_scopes_survive_exactly(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            compile_query = Mock(return_value="EXACT ORIGINAL SQL")
            module, _ = self.load(root, compile_query)
            readable = {"notes": ["private-group"], "music": []}
            result = module.capture_actual_scopes("private query text", readable, member_key="reader")
            self.assertEqual(result, "EXACT ORIGINAL SQL")
            compile_query.assert_called_once_with("private query text", readable, member_key="reader")
            record = json.loads((root / ("a" * 32 + ".jsonl")).read_text())
            self.assertEqual(record["readable"], readable)
            self.assertEqual(set(record), {"request_id", "reader", "readable"})
            self.assertNotIn("private query text", json.dumps(record))

    def test_failed_original_compilation_is_not_observed_or_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module, _ = self.load(root, Mock(side_effect=ValueError("original refusal")))
            with self.assertRaisesRegex(ValueError, "original refusal"):
                module.capture_actual_scopes("invalid", {"notes": ["g"]}, member_key="r")
            self.assertEqual(list(root.glob("*.jsonl")), [])


if __name__ == "__main__":
    unittest.main()
