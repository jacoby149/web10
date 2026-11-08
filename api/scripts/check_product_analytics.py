"""Disposable real-ClickHouse lifecycle/reconciliation receipt. No vendor writes.

Run from api/: uv run python scripts/check_product_analytics.py
Only the discover-enrollment calls and outbound vendor transport are substituted;
account inserts/updates, durable context, pending selection and acks use real SQL.
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
name = "web10-posthog-check-" + uuid4().hex[:10]
started = False
try:
    subprocess.run(
        [
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            name,
            "--memory=1g",
            "--cpus=1",
            "-p",
            "127.0.0.1::8123",
            "-e",
            "CLICKHOUSE_PASSWORD=synthetic-fixture",
            "clickhouse/clickhouse-server:24.8",
        ],
        check=True,
        capture_output=True,
    )
    started = True
    binding = subprocess.check_output(["docker", "port", name, "8123/tcp"], text=True).strip()
    os.environ.update(
        {
            "CLICKHOUSE_HOST": "127.0.0.1",
            "CLICKHOUSE_PORT": binding.rsplit(":", 1)[1],
            "CLICKHOUSE_USER": "default",
            "CLICKHOUSE_PASSWORD": "synthetic-fixture",
            "CLICKHOUSE_DATABASE": "default",
            "POSTHOG_IDENTITY_SECRET": "synthetic-independent-identity-secret-for-db-check",
        }
    )
    import clickhouse_connect

    for attempt in range(60):
        try:
            db = clickhouse_connect.get_client(
                host="127.0.0.1",
                port=int(os.environ["CLICKHOUSE_PORT"]),
                username="default",
                password="synthetic-fixture",
            )
            db.command("SELECT 1")
            break
        except Exception:
            if attempt == 59:
                raise
            time.sleep(1)
    from app.services import product_analytics as analytics
    from app.v3.services import clickhouse as ch

    schema = (ROOT / "clickhouse-init/001-init-v3-schema.sql.template").read_text()
    for table in ("users", "node_config"):
        sql = re.search(rf"CREATE TABLE IF NOT EXISTS {table} \(.*?;", schema, re.S).group()
        db.command(sql)
    ch.ensure_users_domain_schema()
    cfg = {
        "posthog_enabled": True,
        "posthog_project_key": "phc_synthetic_project",
        "posthog_host": "https://us.i.posthog.com",
        "posthog_capture_since": datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
    }
    ch.save_node_config(cfg)
    ticket = analytics.acquisition_context(None, {"utm_campaign": "pilot", "utm_content": "creator_a"})["ticket"]
    with patch.object(ch, "_ensure_discover_group_contract"), patch.object(ch, "add_group_member"):
        assert ch.create_user("synthetic-reader", "synthetic-hash", analytics_context=ticket)
        assert ch.create_user("synthetic-reader", "synthetic-hash", analytics_context=ticket) is None
    original = analytics.read_context("synthetic-reader")
    for mutate, args in [
        (ch.change_password, ("new-hash",)),
        (ch.change_phone, ("synthetic-phone",)),
        (ch.set_email, ("synthetic@example.invalid",)),
        (ch.verify_phone, ()),
        (ch.verify_email, ()),
        (ch.set_domain, ("example.invalid", 1)),
    ]:
        mutate("synthetic-reader", *args)
        assert analytics.read_context("synthetic-reader") == original
    response = MagicMock(status_code=200)
    with patch.object(analytics.requests, "post", return_value=response) as post:
        first = analytics.reconcile()
        second = analytics.reconcile()
        assert first["sent"] == 1 and first["failed"] == 0 and first["complete"] is True, first
        assert second["sent"] == 0 and post.call_count == 1, second
        payload = post.call_args.kwargs["json"]
        assert payload["properties"]["utm_content"] == "creator_a"
        assert "synthetic-reader" not in json.dumps(payload)
        assert payload["uuid"] == original["event_id"]
    receipt = {
        "scope": "Real ClickHouse account lifecycle and reconciliation; substituted enrollment and vendor transport; not whole auth/browser/vendor proof",
        "clickhouse": db.command("SELECT version()"),
        "context_preserved_by_six_writers": True,
        "duplicate_signup_denied": True,
        "first_pass": first,
        "fresh_pass": second,
        "vendor_persistence": False,
    }
finally:
    if started:
        subprocess.run(["docker", "rm", "-f", name], check=True, capture_output=True)
        assert subprocess.run(["docker", "inspect", name], capture_output=True).returncode != 0

receipt["owned_container_removed"] = True
out = ROOT / ".context/posthog"
out.mkdir(parents=True, exist_ok=True)
(out / "clickhouse-receipt.json").write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt, indent=2))
