"""Render real Compose with synthetic values; never deploy or read host secrets."""

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "ubuntu-deployment"
DEFAULTS = {
    "MEDIA_DELIVERY_ENABLED": "false",
    "MEDIA_DELIVERY_BASE": "",
    "MEDIA_DELIVERY_ISSUER": "",
    "MEDIA_DELIVERY_AUDIENCE": "",
    "MEDIA_DELIVERY_KID": "",
    "MEDIA_DELIVERY_PRIVATE_KEY": "",
    "MEDIA_DELIVERY_TTL": "60",
}


@pytest.fixture(scope="module", autouse=True)
def compose_available():
    if shutil.which("docker"):
        result = subprocess.run(["docker", "compose", "version"], capture_output=True, timeout=15)
        if result.returncode == 0:
            return
    if os.environ.get("CI"):
        pytest.fail("Docker Compose v2 is required for deployment configuration tests")
    pytest.skip("Docker Compose v2 is not installed")


@pytest.fixture(scope="module")
def synthetic_pem():
    return (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        .decode()
    )


def isolated_env():
    # Do not inherit real MEDIA_*, dotenv paths or deployment credentials.
    return {name: os.environ[name] for name in ("PATH", "HOME") if name in os.environ}


def render(tmp_path, example, overrides=None, omitted=False):
    text = (DEPLOY / example).read_text()
    if omitted:
        text = "\n".join(line for line in text.splitlines() if not line.startswith("MEDIA_DELIVERY_"))
    values = {"MINIO_PASSWORD": "synthetic-compose-password", **(overrides or {})}
    for name, value in values.items():
        assert "'" not in value  # Quoted dotenv PEM uses literal newlines, not shell escaping.
        text += f"\n{name}='{value}'\n"
    env_file = tmp_path / "synthetic.env"
    env_file.write_text(text)
    env_file.chmod(0o600)
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--project-directory",
            str(DEPLOY),
            "--env-file",
            str(env_file),
            "-f",
            str(DEPLOY / "docker-compose.ecosystem.yml"),
            "config",
            "--format",
            "json",
        ],
        env=isolated_env(),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, "synthetic Compose configuration did not render"
    return json.loads(result.stdout)


def runtime(environment):
    code = """
import hashlib,json
import app.settings as s
from app.services.media_delivery import get_url,validate_configuration
try:
    validate_configuration()
except ValueError:
    raise SystemExit(3)
class Legacy:
    def generate_presigned_url(self,*args,**kwargs): return 'synthetic-legacy-delivery'
print(json.dumps({'enabled':s.MEDIA_DELIVERY_ENABLED,'ttl':s.MEDIA_DELIVERY_TTL,
    'key_hash':hashlib.sha256(s.MEDIA_DELIVERY_PRIVATE_KEY.encode()).hexdigest(),
    'legacy':get_url('synthetic/file',Legacy())=='synthetic-legacy-delivery' if not s.MEDIA_DELIVERY_ENABLED else False}))
"""
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=ROOT / "api",
        env={**isolated_env(), **environment},
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.mark.parametrize("example", ["env.dev.example", "env.prod.example"])
@pytest.mark.parametrize("mode", [None, "batched", "per-group"])
def test_readable_resolver_default_and_rollback_are_api_only(tmp_path, example, mode):
    config = render(tmp_path, example, {"READABLE_RESOLUTION_MODE": mode} if mode else {})
    api = config["services"]["api"]["environment"]
    assert api["READABLE_RESOLUTION_MODE"] == (mode or "batched")
    assert "QUERY_EVAL_NO_POLICY" not in api and "QUERY_EVAL_STUB_EXECUTE" not in api
    assert "READABLE_RESOLUTION_MODE" not in json.dumps({k: v for k, v in config["services"].items() if k != "api"})


@pytest.mark.parametrize("example", ["env.dev.example", "env.prod.example"])
@pytest.mark.parametrize("omitted", [True, False], ids=["old-env-file", "documented-defaults"])
def test_disabled_defaults_keep_existing_delivery(tmp_path, example, omitted):
    environment = render(tmp_path, example, omitted=omitted)["services"]["api"]["environment"]
    assert {key: environment.get(key) for key in DEFAULTS} == DEFAULTS
    result = runtime(environment)
    assert result.returncode == 0
    assert json.loads(result.stdout)["legacy"] is True


@pytest.mark.parametrize("example", ["env.dev.example", "env.prod.example"])
def test_enabled_pem_runtime_and_rollback(tmp_path, example, synthetic_pem):
    values = {
        "MEDIA_DELIVERY_ENABLED": "true",
        "MEDIA_DELIVERY_BASE": "https://media.acceptance.invalid",
        "MEDIA_DELIVERY_ISSUER": "synthetic-issuer",
        "MEDIA_DELIVERY_AUDIENCE": "synthetic-media",
        "MEDIA_DELIVERY_KID": "synthetic-key",
        "MEDIA_DELIVERY_PRIVATE_KEY": synthetic_pem,
        "MEDIA_DELIVERY_TTL": "42",
    }
    config = render(tmp_path, example, values)
    environment = config["services"]["api"]["environment"]
    assert {key: environment.get(key) for key in values if key != "MEDIA_DELIVERY_PRIVATE_KEY"} == {
        key: value for key, value in values.items() if key != "MEDIA_DELIVERY_PRIVATE_KEY"
    }
    key_hash = hashlib.sha256(synthetic_pem.encode()).hexdigest()
    assert hashlib.sha256(environment.get("MEDIA_DELIVERY_PRIVATE_KEY", "").encode()).hexdigest() == key_hash
    for name, service in config["services"].items():
        if name != "api":
            assert "MEDIA_DELIVERY_PRIVATE_KEY" not in service.get("environment", {})
            assert synthetic_pem not in json.dumps(service)
        assert "MEDIA_DELIVERY_PRIVATE_KEY" not in (service.get("build") or {}).get("args", {})
    result = runtime(environment)
    assert result.returncode == 0
    assert json.loads(result.stdout) == {
        "enabled": True,
        "ttl": 42,
        "legacy": False,
        "key_hash": hashlib.sha256(synthetic_pem.encode()).hexdigest(),
    }
    rolled_back = render(tmp_path, example, {**values, "MEDIA_DELIVERY_ENABLED": "false"})
    result = runtime(rolled_back["services"]["api"]["environment"])
    assert result.returncode == 0 and json.loads(result.stdout)["legacy"] is True
    missing_key = render(tmp_path, example, {**values, "MEDIA_DELIVERY_PRIVATE_KEY": ""})
    assert runtime(missing_key["services"]["api"]["environment"]).returncode == 3


def test_private_stack_env_files_are_ignored():
    paths = ["ubuntu-deployment/env.dev", "ubuntu-deployment/env.prod"]
    result = subprocess.run(
        ["git", "check-ignore", "--no-index", "--", *paths],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0
    assert set(result.stdout.splitlines()) == set(paths)
