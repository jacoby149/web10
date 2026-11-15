"""No-engine adapter seam controls; never import the real API or open a network."""
import contextvars
import hashlib
import importlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
import arm_satellite_runtime as runtime
import arm_t


class AdapterTests(unittest.TestCase):
    def load(self, directory):
        root = Path(directory)
        values = {"operation": {}, "counts": {"T1": "PASS", "droplet_id": 123, "canonical_generation": "g"},
                  "metadata": {"droplet_id": 123, "canonical_generation": "g"},
                  "parity": {"outcome": "PASS", "droplet_id": 123, "canonical_generation": "g"},
                  "profile": {"droplet_id": 123, "reader": "alice"},
                  "presence": {"T1": "PASS", "droplet_id": 123, "canonical_generation": "g"}}
        for name in values:
            if name == "metadata":
                values[name]["count_receipt_sha256"] = hashlib.sha256((root / "counts.json").read_bytes()).hexdigest()
            if name == "parity":
                values[name]["metadata_sha256"] = hashlib.sha256((root / "metadata.json").read_bytes()).hexdigest()
            (root / (name + ".json")).write_text(json.dumps(values[name]))
        client = SimpleNamespace()
        calls = []

        def query(query, parameters=None, settings=None):
            calls.append({"sql": query, "parameters": parameters, "settings": settings})
            return SimpleNamespace(summary={"read_rows": str(client.rows), "read_bytes": "10"}, query_id="native-id",
                                   column_names=("author_key", "doc_id"), result_rows=[("author", "doc")])

        client.query, client.rows = query, 1

        def execute(sql, settings=None):
            result = client.query(sql, settings=settings)
            return list(result.column_names), list(result.result_rows)

        ch = SimpleNamespace(client=client, execute_query=execute, get_active_node_ads=Mock(), content_event_views_for_docs=Mock())
        observer = SimpleNamespace(original_compile=Mock(), current=contextvars.ContextVar("adapter-test", default={"request_id": "a" * 32}), application=Mock())
        real_import = importlib.import_module

        def imports(name):
            return {"research_api": observer, "app.v3.services.clickhouse": ch}.get(name) or real_import(name)

        spec = importlib.util.spec_from_file_location("isolated_satellite_adapter", Path(__file__).with_name("arm_satellite_api.py"))
        module = importlib.util.module_from_spec(spec)
        with (patch.dict(os.environ, SATELLITE_SERVE_STATE=str(root), SATELLITE_CONFIG_P="1", COSTFN_ARM_D="0", COSTFN_SATELLITE="0", COSTFN_VIEWS_TREAT="0"), patch.object(runtime, "admitted"),
              patch.object(arm_t, "digitalocean_id", return_value=123), patch.object(importlib, "import_module", side_effect=imports)):
            spec.loader.exec_module(module)
        module.admitted = Mock()
        return module, client, observer, calls

    def test_marked_feed_reads_keep_ten_second_and_22gib_caps(self):
        with tempfile.TemporaryDirectory() as directory:
            module, _, _, calls = self.load(directory)
            module.query("SELECT 1", settings={"max_execution_time": 900})
            self.assertEqual(calls[-1]["settings"]["max_execution_time"], 10)
            self.assertEqual(calls[-1]["settings"]["max_memory_usage"], 22 * 1024**3)

    def test_unlabelled_discovery_keeps_original_setup_timeout_and_memory_envelope(self):
        with tempfile.TemporaryDirectory() as directory:
            module, _, observer, calls = self.load(directory)
            observer.current.set({"request_id": "unlabelled"})
            module.query("SELECT 1")
            self.assertNotIn("max_execution_time", calls[-1]["settings"])
            self.assertEqual(calls[-1]["settings"]["max_memory_usage"], 22 * 1024**3)
            module.query("SELECT 1", settings={"max_execution_time": 30})
            self.assertEqual(calls[-1]["settings"]["max_execution_time"], 30)

    def test_over_10m_read_sets_stop_and_prevents_another_query(self):
        with tempfile.TemporaryDirectory() as directory:
            module, client, observer, calls = self.load(directory)
            client.rows = 10_000_001
            with self.assertRaises(HTTPException):
                module.query("SELECT 1")
            self.assertEqual(observer.current.get()["arm_p_stop"], "single_read_over_10M")
            with self.assertRaises(HTTPException):
                module.query("SELECT 2")
            self.assertEqual(len(calls), 1)

    def test_private_live_result_is_request_owned_single_use_and_never_in_observer(self):
        with tempfile.TemporaryDirectory() as directory:
            module, _, observer, _ = self.load(directory)
            with self.assertRaises(HTTPException):
                module.execute_query(module.MARKER)
            observer.current.set({"request_id": "b" * 32})
            module._pending.set(("b" * 32, ["body"], [("private-body",)]))
            self.assertNotIn("private-body", str(observer.current.get()))
            self.assertEqual(module.execute_query(module.MARKER), (["body"], [("private-body",)]))
            with self.assertRaises(HTTPException):
                module.execute_query(module.MARKER)

    def test_inventory_pointer_lookup_does_not_recurse_and_preserves_original_history(self):
        with tempfile.TemporaryDirectory() as directory:
            module, _, _, calls = self.load(directory)
            token = module._inventory.set(True)
            try:
                module.query("SELECT doc_id,author_key FROM (SELECT doc_id,author_key,deleted,updated_at,"
                    "row_number() OVER (PARTITION BY doc_id,author_key ORDER BY updated_at DESC) AS rn FROM documents) "
                    "WHERE rn=1 AND deleted=0 AND doc_id IN (SELECT doc_id FROM doc_groups WHERE group_id=%(discover)s) "
                    "ORDER BY updated_at DESC LIMIT 20", {"discover": "public"})
            finally:
                module._inventory.reset(token)
            self.assertEqual(len(calls), 2)
            self.assertIn("FROM strings", calls[0]["sql"])
            self.assertIn("row_number()", calls[1]["sql"])
            self.assertIn("author_key, doc_id", calls[1]["sql"])
            self.assertIsNone(calls[1]["parameters"])


if __name__ == "__main__":
    unittest.main()
