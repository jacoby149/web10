"""Regression tests for the profile-picture-upload 500s (CHANGELOG 1.0.128).

Two unrelated driver-contract bugs took down every write and every upload on
prod, and the existing suite was blind to both because `conftest.py` replaces
`pymongo`, `bson`, and `boto3` with `MagicMock` (a mock accepts `.RETURN_AFTER`
and `Config(use_ssl=...)` without complaint — the same blind spot that hid the
DB-handle bug in 1.0.115). So the mocked end-to-end path can't catch these.

These tests close the gap two ways:
  1. assert the app source no longer references the invalid symbols, and
  2. assert against the REAL installed pymongo/botocore, run in a subprocess
     (a fresh interpreter that never loads conftest's mocks) so the test also
     fails if a future library version flips the contract.

Bug 1: `documentdb.update()` (+ schema/public updates) passed
        `return_document=pymongo.RETURN_AFTER` — no such attribute; the constant
        is `pymongo.ReturnDocument.AFTER`. Raised AttributeError → 500 on every
        post/profile write.
Bug 2: `media.get_s3_client()` passed `use_ssl` inside `botocore.Config(...)`,
        but `use_ssl` is a `boto3.client()` kwarg — `Config(use_ssl=...)` raises
        TypeError → 500 on every upload (getUploadUrl).
"""

import re
import subprocess
import sys
from pathlib import Path

_APP = Path(__file__).resolve().parent.parent / "app"


def _real_contract(snippet: str):
    """Run a check against the REAL libraries in a fresh interpreter (no mocks)."""
    result = subprocess.run([sys.executable, "-c", snippet], capture_output=True, text=True)
    assert result.returncode == 0, f"real-library contract check failed:\n{result.stderr}"


class TestPymongoReturnDocument:
    def test_source_uses_valid_constant(self):
        src = (_APP / "services" / "documentdb.py").read_text()
        assert "pymongo.RETURN_AFTER" not in src, "pymongo.RETURN_AFTER does not exist — use pymongo.ReturnDocument.AFTER"
        assert "pymongo.ReturnDocument.AFTER" in src

    def test_real_pymongo_contract(self):
        _real_contract(
            "import pymongo; "
            "assert not hasattr(pymongo, 'RETURN_AFTER'), 'RETURN_AFTER never existed'; "
            "assert pymongo.ReturnDocument.AFTER is not None"
        )


class TestS3ClientConfig:
    def test_source_puts_use_ssl_on_client_not_config(self):
        src = (_APP / "services" / "media.py").read_text()
        # Inspect the actual `config=Config(...)` call (not the explanatory comment):
        # use_ssl must NOT sit inside Config(), and MUST appear as a client kwarg.
        config_block = re.search(r"config\s*=\s*Config\((.*?)\)", src, re.DOTALL)
        assert config_block is not None
        assert "use_ssl" not in config_block.group(1), "use_ssl belongs on boto3.client(), not botocore.Config()"
        assert re.search(r"^\s*use_ssl\s*=\s*settings\.S3_USE_SSL", src, re.MULTILINE)

    def test_real_botocore_config_rejects_use_ssl(self):
        _real_contract(
            "from botocore.config import Config\n"
            "try:\n"
            "    Config(use_ssl=True)\n"
            "    raise SystemExit('Config accepted use_ssl — contract changed')\n"
            "except TypeError:\n"
            "    pass"
        )
