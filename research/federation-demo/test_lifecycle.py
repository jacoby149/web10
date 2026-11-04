"""Fault injection for runner cleanup only; never a simulated IAM result."""

import runpy
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


class CleanupTests(unittest.TestCase):
    def test_diagnostic_failure_still_tears_down_and_exits_failed(self):
        calls = []

        def fake_run(command, **kwargs):
            calls.append(command)
            output = ""
            if command[:3] == ["docker", "context", "inspect"]:
                output = "unix:///synthetic-unit-test.sock"
            elif command[:3] == ["git", "rev-parse", "HEAD"]:
                output = "synthetic-unit-test"
            elif "inspect" in command:
                raise subprocess.CalledProcessError(1, command)
            elif command[-1] == "/demo/scenario.py":
                output = '{"result":"synthetic-cleanup-test-only"}'
            elif command[-1] == "/tmp/certify.log":
                output = "POST /certify 200\nPOST /certify 401\n"
            elif command[-2:] == ["ps", "-aq"]:
                output = "synthetic-container"
            return subprocess.CompletedProcess(command, 0, output, "")

        with patch.dict("os.environ", {}, clear=True), patch("subprocess.run", side_effect=fake_run):
            with self.assertRaises(AssertionError):
                runpy.run_path(str(Path(__file__).with_name("run.py")), run_name="__main__")
        self.assertTrue(any("down" in call for call in calls))
        self.assertTrue(any(call[-2:] == ["image", "rm"] or "rm" in call for call in calls))


if __name__ == "__main__":
    unittest.main()
