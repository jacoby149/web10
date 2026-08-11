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
        assert "pymongo.RETURN_AFTER" not in src, (
            "pymongo.RETURN_AFTER does not exist — use pymongo.ReturnDocument.AFTER"
        )
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
        # use_ssl is a client kwarg; the internal/signing clients feed it from
        # the S3_USE_SSL / S3_PUBLIC_USE_SSL flags.
        assert re.search(r"^\s*use_ssl\s*=\s*use_ssl", src, re.MULTILINE)
        assert "settings.S3_USE_SSL" in src and "settings.S3_PUBLIC_USE_SSL" in src

    def test_real_botocore_config_rejects_use_ssl(self):
        _real_contract(
            "from botocore.config import Config\n"
            "try:\n"
            "    Config(use_ssl=True)\n"
            "    raise SystemExit('Config accepted use_ssl — contract changed')\n"
            "except TypeError:\n"
            "    pass"
        )


class TestPresignedPostPolicy:
    """Regression for the prod upload 403 (CHANGELOG 1.0.134).

    Bug 3: `upload_url` passed Content-Type in `Fields` but not in
    `Conditions`. boto3 does NOT mirror Fields into the signed policy, and
    S3/minio reject any form field the policy doesn't cover — so every
    upload came back `403 AccessDenied ("Content-Type" not specified in
    the policy)`. Mocked tests were blind to it: the policy check happens
    server-side in minio, not in the client library.
    """

    def test_source_mirrors_fields_in_conditions(self):
        src = (_APP / "v3" / "endpoints" / "media.py").read_text()
        call = re.search(r"generate_presigned_post\((.*?)\n    \)", src, re.DOTALL)
        assert call is not None, "upload_url must presign via generate_presigned_post"
        block = call.group(1)
        assert 'Fields={"Content-Type": mime_type}' in block
        assert "Conditions" in block
        assert '{"Content-Type": mime_type}' in block.split("Conditions")[1], (
            "every Fields entry must also appear in Conditions — S3/minio 403 "
            "any form field the signed policy doesn't cover"
        )

    def test_real_boto3_does_not_mirror_fields_into_policy(self):
        # Presigning is offline — no network. Proves the contract the fix
        # relies on: Fields NOT repeated in Conditions are absent from the
        # signed policy (and would therefore be rejected server-side).
        _real_contract(
            "import base64, json, boto3\n"
            "c = boto3.client('s3', aws_access_key_id='k', aws_secret_access_key='s',\n"
            "                 region_name='us-east-1', endpoint_url='http://localhost:9000')\n"
            "p = c.generate_presigned_post('b', 'o', Fields={'Content-Type': 'image/png'},\n"
            "                              Conditions=[['content-length-range', 0, 10]])\n"
            "policy = json.loads(base64.b64decode(p['fields']['policy']))\n"
            "mirrored = any(isinstance(cond, dict) and 'Content-Type' in cond\n"
            "               for cond in policy['conditions'])\n"
            "assert not mirrored, 'boto3 now mirrors Fields into Conditions — simplify the fix'\n"
            "assert p['fields']['Content-Type'] == 'image/png'"
        )
