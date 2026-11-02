"""B-8: settings diagnostics must not copy configuration into stdout/stderr."""

import subprocess
import sys
import unittest
from pathlib import Path

API = Path(__file__).resolve().parents[1]
FIELDS = (
    "PRIVATE_KEY",
    "TWILIO_AUTH_TOKEN",
    "STRIPE_TEST_KEY",
    "STRIPE_LIVE_KEY",
    "CLICKHOUSE_PASSWORD",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "PROVIDER",
    "CORS_SERVICE_MANAGERS",
)
SYNTHETIC = {name: f"SYNTHETIC_{name}_NOT_A_CREDENTIAL" for name in FIELDS}


class TestSettingsDiagnostics(unittest.TestCase):
    def test_query_eval_environment_keeps_parsed_types(self):
        for value, enabled in (("0", False), ("false", False), ("1", True), ("true", True)):
            with self.subTest(value=value):
                probe = f"""
import app.settings as s
assert s.QUERY_EVAL_NO_POLICY is {enabled!r}
assert s.QUERY_EVAL_STUB_EXECUTE is {enabled!r}
assert s.QUERY_EVAL_STUB_ROWS == 7
assert isinstance(s.QUERY_EVAL_STUB_ROWS, int)
assert s.QUERY_EVAL_READABLE_MODE == 'batched'
"""
                result = subprocess.run(
                    [sys.executable, "-c", probe],
                    cwd=API,
                    env={
                        "QUERY_EVAL_NO_POLICY": value,
                        "QUERY_EVAL_STUB_EXECUTE": value,
                        "QUERY_EVAL_STUB_ROWS": "7",
                        "QUERY_EVAL_READABLE_MODE": "BATCHED",
                    },
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_cli_never_prints_values_or_globals(self):
        for args in ([str(API / "app/settings.py")], ["-m", "app.settings"]):
            for env in ({}, SYNTHETIC):
                with self.subTest(entry=args[-1], injected=bool(env)):
                    result = subprocess.run(
                        [sys.executable, *args], cwd=API, env=env, capture_output=True, text=True, timeout=10
                    )
                    self.assertEqual(result.returncode, 0)
                    # Assert booleans, never include captured configuration in failure output.
                    self.assertFalse(any(value in result.stdout + result.stderr for value in SYNTHETIC.values()))
                    self.assertTrue(result.stdout == "Settings loaded; configuration values omitted.\n")
                    self.assertTrue(result.stderr == "")

    def test_import_preserves_overrides_and_derived_settings_without_output(self):
        probe = f"""
import app.settings as s
import os
assert all(getattr(s, key) == os.environ[key] for key in {FIELDS!r} if key != 'CORS_SERVICE_MANAGERS')
assert s.CORS_SERVICE_MANAGERS == [os.environ['CORS_SERVICE_MANAGERS']]
assert s.COST == {{'create': s.COST_CREATE, 'read': s.COST_READ, 'update': s.COST_UPDATE,
                  'delete': s.COST_DELETE, 'aggregate': s.COST_AGGREGATE}}
assert s.KEEP_IMPORT_EXPORTS is False
"""
        result = subprocess.run(
            [sys.executable, "-c", probe], cwd=API, env=SYNTHETIC, capture_output=True, text=True, timeout=10
        )
        self.assertEqual(result.returncode, 0)
        self.assertTrue(result.stdout == "")
        self.assertTrue(result.stderr == "")
