"""Mocked orchestration faults, not browser or IAM evidence."""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


class DomainHookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("tested_domain_hooks", Path(__file__).with_name("hooks.py"))
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_only_frontends_receive_loopback_ports_and_browser_bridge(self):
        with tempfile.TemporaryDirectory() as tmp:
            services = {}
            for node in ("a", "b"):
                for kind in ("api", "db", "store", "tls"):
                    services[f"{kind}-{node}"] = {"networks": {"lab": {}}, "volumes": []}
            self.module.configure(services, Path(tmp), "synthetic-image", Path(tmp))
            for name, service in services.items():
                if name.startswith("tls-") or name == "domain-dns":
                    self.assertIn("browser", service["networks"])
                    self.assertTrue(all(value.startswith("127.0.0.1::") for value in service["ports"]))
                else:
                    self.assertNotIn("browser", service["networks"])
                    self.assertNotIn("ports", service)
            public_config = (Path(tmp) / "client-config.json").read_text()
            self.assertNotIn((Path(tmp) / "domain-control").read_text(), public_config)

    def test_browser_failures_deadlines_and_barrier_failures_are_not_success(self):
        for fault in ("browser", "deadline", "stop", "restore"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as tmp:
                private = Path(tmp) / "private"
                out = Path(tmp) / "out"
                private.mkdir()
                out.mkdir()
                (private / "domain-control").write_text("synthetic-control")
                if fault in ("stop", "restore"):
                    (private / f"{fault}-a.request").write_text("request")
                child = MagicMock()
                child.returncode = 1 if fault == "browser" else None
                child.poll.side_effect = lambda: child.returncode
                child.terminate.side_effect = lambda: setattr(child, "returncode", 143)

                def dc(*args, **kwargs):
                    if args[0] in ("stop", "start"):
                        raise RuntimeError("synthetic fixture barrier failure")
                    text = "127.0.0.1:18080" if args[0] == "port" else ""
                    return subprocess.CompletedProcess(args, 0, text, "")

                ready = MagicMock()
                ready.__enter__.return_value.status = 200
                clock = [0, 1000] if fault == "deadline" else None
                with (
                    patch.object(self.module, "urlopen", return_value=ready),
                    patch.object(self.module.subprocess, "Popen", return_value=child),
                    patch.object(self.module.time, "monotonic", side_effect=clock, return_value=0),
                ):
                    with self.assertRaises((AssertionError, TimeoutError, RuntimeError)):
                        self.module.execute(dc, ["synthetic-docker"], private, out, Path(tmp))
                if fault != "browser":
                    child.terminate.assert_called_once()
                    child.wait.assert_called_once()


if __name__ == "__main__":
    unittest.main()
