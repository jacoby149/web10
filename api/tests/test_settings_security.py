"""Configuration defaults have no reusable credentials or bootstrap admin."""

import json
import os
import subprocess
import sys


def read_settings(**overrides):
    names = [
        "PRIVATE_KEY",
        "AUTH_SIGNING_KEY",
        "DEFAULT_ADMINS",
        "TWILIO_AUTH_TOKEN",
        "STRIPE_TEST_KEY",
        "STRIPE_LIVE_KEY",
        "CLICKHOUSE_PASSWORD",
        "S3_SECRET_KEY",
        "TOKEN_EXPIRE_MINUTES",
        "CLICKHOUSE_PORT",
        "CLICKHOUSE_SECURE",
        "BETA_REQUIRED",
    ]
    env = {k: v for k, v in os.environ.items() if k not in names}
    env.update(overrides)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            f"import json; import app.settings as s; print(json.dumps({{k: getattr(s, k) for k in {names!r}}}))",
        ],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_no_secret_or_admin_defaults():
    values = read_settings()
    for name in (
        "PRIVATE_KEY",
        "AUTH_SIGNING_KEY",
        "TWILIO_AUTH_TOKEN",
        "STRIPE_TEST_KEY",
        "STRIPE_LIVE_KEY",
        "CLICKHOUSE_PASSWORD",
        "S3_SECRET_KEY",
    ):
        assert values[name] == ""
    assert values["DEFAULT_ADMINS"] == []


def test_explicit_local_environment_preserves_types():
    values = read_settings(
        PRIVATE_KEY="local-explicit-key",
        DEFAULT_ADMINS="local-admin",
        TOKEN_EXPIRE_MINUTES="60",
        CLICKHOUSE_PORT="8123",
        CLICKHOUSE_SECURE="false",
        BETA_REQUIRED="true",
    )
    assert values["PRIVATE_KEY"] == "local-explicit-key"
    assert values["DEFAULT_ADMINS"] == ["local-admin"]
    assert values["TOKEN_EXPIRE_MINUTES"] == 60
    assert values["CLICKHOUSE_PORT"] == 8123
    assert values["CLICKHOUSE_SECURE"] is False
    assert values["BETA_REQUIRED"] is True
