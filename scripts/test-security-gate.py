"""Exercise the gate's path scope and size limit with synthetic Git diff output."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
RECORD = "knowledge-base/security/security-record.md"


class SecurityGateTests(unittest.TestCase):
    def run_gate(self, paths, code_lines=10):
        with tempfile.TemporaryDirectory(prefix="web10-gate-") as directory:
            git = Path(directory) / "git"
            git.write_text(
                "#!/usr/bin/env python3\n"
                "import os, sys\n"
                "if sys.argv[1:3] == ['diff', '--name-only']:\n"
                "    print(os.environ['GATE_FILES'])\n"
                "elif sys.argv[1:3] == ['diff', '--numstat']:\n"
                "    print(os.environ['GATE_NUMSTAT'])\n"
                "else:\n"
                "    raise SystemExit('unexpected git command')\n"
            )
            git.chmod(0o755)
            env = dict(os.environ)
            env.update(
                PATH=directory + os.pathsep + env["PATH"],
                PR_BODY="",
                GATE_FILES="\n".join(paths),
                GATE_NUMSTAT=f"{code_lines}\t0\t{paths[0]}",
            )
            return subprocess.run(
                ["bash", str(ROOT / "scripts/security-gate.sh"), "base"],
                cwd=ROOT, env=env, capture_output=True, text=True, check=False,
            )

    def test_nested_lookalike_paths_do_not_touch_node_or_authenticator(self):
        result = self.run_gate([
            "marketing/marketing-api/app/main.py",
            "marketing/marketing-ui/src/pages/Links.tsx",
            "examples/api/app/services/auth.py",
            "api/app/main.py.backup",
        ], code_lines=5000)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("no trust-boundary change", result.stdout)

    def test_actual_root_paths_still_enforce_the_size_limit(self):
        for path in (
            "api/app/main.py", "api/app/services/auth.py",
            "api/app/v3/endpoints/documents.py", "api/rtc/index.ts",
            "sdk/src/browser.ts", "ui/src/App.tsx",
        ):
            with self.subTest(path=path):
                result = self.run_gate([path, RECORD, "example.test.ts"], code_lines=501)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("501 lines of code+test (limit 500)", result.stdout)

    def test_bounded_root_change_requires_record_and_test(self):
        for extra_paths, expected in (([], 1), ([RECORD], 1), ([RECORD, "example.test.ts"], 0)):
            with self.subTest(extra_paths=extra_paths):
                result = self.run_gate(["sdk/src/browser.ts", *extra_paths])
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
