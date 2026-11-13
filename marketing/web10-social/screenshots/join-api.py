"""Isolated real node for join-connected.mjs; no media or background workers."""

import os
import secrets
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
NAME = os.environ["JOIN_TEST_CONTAINER"]


def docker(*args, **kwargs):
    return subprocess.run(["docker", *args], check=True, capture_output=True, text=True, **kwargs).stdout.strip()


try:
    docker(
        "run",
        "-d",
        "--name",
        NAME,
        "--label",
        "web10-test=social-join",
        "-p",
        "127.0.0.1::8123",
        "-e",
        "CLICKHOUSE_USER=web10",
        "-e",
        "CLICKHOUSE_PASSWORD=web10",
        "-e",
        "CLICKHOUSE_DB=web10",
        "--ulimit",
        "nofile=262144:262144",
        "clickhouse/clickhouse-server:24.8.14.39",
    )
    port = docker("port", NAME, "8123/tcp").rsplit(":", 1)[1]
    os.environ.update(
        CLICKHOUSE_HOST="127.0.0.1",
        CLICKHOUSE_PORT=port,
        CLICKHOUSE_DATABASE="web10",
        CLICKHOUSE_USER="web10",
        CLICKHOUSE_PASSWORD="web10",
        PROVIDER="api.localhost",
        PRIVATE_KEY=secrets.token_hex(32),
        VERIFY_REQUIRED="false",
        BETA_REQUIRED="false",
        STRIPE_STATUS="test",
        S3_ENDPOINT="http://127.0.0.1:1",
        S3_PUBLIC_ENDPOINT="http://127.0.0.1:1",
    )
    for schema in sorted((ROOT / "clickhouse-init").glob("*.template")):
        for attempt in range(150):
            try:
                docker(
                    "exec",
                    "-i",
                    NAME,
                    "clickhouse-client",
                    "--user",
                    "web10",
                    "--password",
                    "web10",
                    "--database",
                    "web10",
                    "--multiquery",
                    input=schema.read_text(),
                )
                break
            except subprocess.CalledProcessError:
                if attempt == 149:
                    raise
                time.sleep(0.2)

    import uvicorn

    from app.main import app
    from app.services import config
    from app.services.auth import get_password_hash
    from app.v3.services import clickhouse as ch

    ch.ensure_apps_schema()
    ch.ensure_users_domain_schema()
    ch.ensure_discover_group()
    # This disposable node has no live verification vendor. Signup/login and
    # consent are real; phone/email delivery and production policy are not tested.
    config.save_config(
        {
            "provider": "api.localhost",
            "verify_required": False,
            "require_contact": False,
            "beta_required": False,
            "pay_required": False,
        }
    )
    ch.create_user("join-test-admin", get_password_hash(secrets.token_urlsafe(32)))
    uvicorn.run(app, host="127.0.0.1", port=4592, lifespan="off", log_level="warning", access_log=False)
finally:
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
