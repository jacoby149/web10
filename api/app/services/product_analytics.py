"""D103: PostHog integration, not an analytics/reporting engine.

Account creation is the durable event source. An immutable JSON context travels
with every version of the users row; delivery acknowledgements use private node
config rows. Crash/retry reuses a deterministic vendor event UUID. No saved JWT.
"""

import hashlib
import hmac
import json
import logging
import threading
import time
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

import jwt
import requests

from app import settings
from app.services.config import effective_config

log = logging.getLogger(__name__)
HOSTS = {"https://us.i.posthog.com", "https://eu.i.posthog.com"}
CAMPAIGNS = {"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_id"}
_started = False
_lock = threading.Lock()


def _secret() -> str:
    secret = settings.POSTHOG_IDENTITY_SECRET
    return secret if len(secret) >= 32 else ""


def campaign_fields(value: dict) -> dict:
    import re

    return {
        k: v
        for k, v in value.items()
        if k in CAMPAIGNS and isinstance(v, str) and re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", v)
    }


def context_fields(ticket: str | None) -> dict:
    if not _secret() or not ticket:
        return {}
    try:
        data = jwt.decode(
            ticket, _secret(), algorithms=["HS256"], audience="web10-acquisition", issuer=settings.PROVIDER
        )
        return campaign_fields(data) if data.get("purpose") == "acquisition" else {}
    except Exception:
        return {}


def acquisition_context(ticket: str | None, campaign: dict) -> dict:
    cfg = effective_config()
    if cfg.get("posthog_enabled") is not True or not _secret():
        return {"ticket": None, "properties": {}}
    # A valid first touch wins. Direct/internal traffic does not overwrite it.
    properties = context_fields(ticket) or campaign_fields(campaign)
    if not properties:
        return {"ticket": None, "properties": {}}
    if context_fields(ticket):
        return {"ticket": ticket, "properties": properties}
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            **properties,
            "purpose": "acquisition",
            "iss": settings.PROVIDER,
            "aud": "web10-acquisition",
            "iat": now,
            "exp": now + timedelta(days=7),
        },
        _secret(),
        algorithm="HS256",
    )
    return {"ticket": token, "properties": properties}


def account_id(username: str, created_at) -> str:
    # Separate operator-provisioned secret; NEVER reuse auth/JWT signing keys.
    if not _secret():
        raise ValueError("PostHog identity secret is not configured")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    epoch_ms = int(created_at.timestamp()) * 1000 + created_at.microsecond // 1000
    subject = json.dumps(["web10-analytics-v1", settings.PROVIDER, username, epoch_ms], separators=(",", ":"))
    return "w10_" + hmac.new(_secret().encode(), subject.encode(), hashlib.sha256).hexdigest()


def signup_context(username: str, created_at: datetime, ticket: str | None) -> str:
    if not _secret():
        return "{}"
    subject = account_id(username, created_at)
    base = {
        "distinct_id": subject,
        "event_id": str(uuid5(NAMESPACE_URL, subject + ":account_created")),
        "schema_version": 1,
    }
    try:
        cfg = effective_config()
        if cfg.get("posthog_enabled") is not True:
            return "{}"
        return json.dumps({**base, "properties": context_fields(ticket)})
    except Exception:
        # Account creation still succeeds. Reconciliation recovers an
        # unattributed outcome from canonical users after a config outage.
        log.warning("[telemetry] signup context unavailable; reconciliation required")
        return json.dumps({**base, "incomplete": True})


def read_context(username: str) -> dict:
    from app.v3.services import clickhouse as ch

    result = ch.client.query(
        "SELECT analytics_context FROM (SELECT analytics_context, deleted FROM users "
        "WHERE username = %(username)s ORDER BY updated_at DESC, deleted DESC LIMIT 1) WHERE deleted = 0",
        {"username": username},
    )
    return json.loads(result.result_rows[0][0] or "{}") if result.result_rows else {}


def send_signup(username: str, created_at, context: dict, cfg: dict) -> bool:
    from app.v3.services import clickhouse as ch

    subject = account_id(username, created_at)
    event_id = str(uuid5(NAMESPACE_URL, subject + ":account_created"))
    marker = "telemetry:delivered:" + event_id
    delivered = ch.client.query(
        "SELECT count() FROM node_config WHERE config_id = %(id)s AND deleted = 0", {"id": marker}
    )
    if delivered.result_rows[0][0]:
        return False
    properties = {
        **campaign_fields(context.get("properties", {})),
        "distinct_id": subject,
        "$insert_id": event_id,
        "$process_person_profile": True,
        "capture_origin": "server",
        "schema_version": 1,
        "attribution_status": "attributed" if context.get("properties") else "unattributed",
        "measurement_incomplete": context.get("incomplete") is True,
    }
    stamp = created_at.replace(tzinfo=UTC) if created_at.tzinfo is None else created_at.astimezone(UTC)
    # Exact allowed HTTPS destinations only. Never follow an ingest redirect.
    response = requests.post(
        cfg["posthog_host"] + "/capture/",
        json={
            "api_key": cfg["posthog_project_key"],
            "event": "account_created",
            "uuid": event_id,
            "properties": properties,
            "timestamp": stamp.isoformat(),
        },
        timeout=(3, 8),
        allow_redirects=False,
    )
    if not 200 <= response.status_code < 300:
        raise RuntimeError("PostHog ingest rejected")
    ch.client.insert(
        "node_config",
        [[marker, json.dumps({"delivered_at": datetime.now(UTC).isoformat()}), datetime.now(UTC), 0]],
        column_names=["config_id", "body", "updated_at", "deleted"],
    )
    return True


def _reconcile() -> dict:
    from app.v3.services import clickhouse as ch

    cfg = effective_config()
    health = {"sent": 0, "failed": 0, "scanned": 0, "complete": False}
    if not _secret() or cfg.get("posthog_enabled") is not True or cfg.get("posthog_host") not in HOSTS:
        return {**health, "disabled": True}
    import re

    if not re.fullmatch(r"phc_[A-Za-z0-9_-]{8,200}", cfg.get("posthog_project_key", "")):
        return {**health, "disabled": True}
    since = cfg.get("posthog_capture_since")
    if not since:
        return {**health, "reason": "capture_start_missing"}
    # Bounded pass, keyset continuation. All current accounts since activation
    # are revisited on the next pass; ack markers prevent new vendor outcomes.
    cursor_time, cursor_name = since, ""
    deadline = time.monotonic() + 20
    for _ in range(100):
        rows = ch.client.query(
            "SELECT username, created_at, analytics_context FROM (SELECT username, created_at, analytics_context, deleted, "
            "row_number() OVER (PARTITION BY username ORDER BY updated_at DESC, deleted DESC) rn FROM users) "
            "WHERE rn = 1 AND deleted = 0 AND created_at >= parseDateTime64BestEffort(%(since)s) "
            "AND JSONExtractString(analytics_context, 'event_id') != '' "
            "AND concat('telemetry:delivered:', JSONExtractString(analytics_context, 'event_id')) NOT IN "
            "(SELECT config_id FROM node_config WHERE deleted = 0 AND config_id LIKE 'telemetry:delivered:%%') "
            "AND (created_at, username) > (parseDateTime64BestEffort(%(cursor)s), %(name)s) "
            "ORDER BY created_at, username LIMIT 100",
            {"since": since, "cursor": cursor_time, "name": cursor_name},
        ).result_rows
        if not rows:
            health["complete"] = health["failed"] == 0
            break
        for username, created_at, raw_context in rows:
            if time.monotonic() >= deadline:
                return health
            health["scanned"] += 1
            try:
                context = json.loads(raw_context or "{}")
                # An explicit off-state row is not backfilled when re-enabled.
                if context:
                    health["sent"] += int(send_signup(username, created_at, context, cfg))
            except Exception:
                health["failed"] += 1
                log.warning("[telemetry] canonical outcome delivery pending")
        cursor_time = (
            rows[-1][1].replace(tzinfo=UTC).isoformat() if rows[-1][1].tzinfo is None else rows[-1][1].isoformat()
        )
        cursor_name = rows[-1][0]
    log.info("[telemetry] reconciliation completed %s", health)
    return health


def reconcile() -> dict:
    from app.v3.services import clickhouse as ch

    try:
        health = _reconcile()
    except Exception:
        health = {"complete": False, "failed": 1, "reason": "reconciliation_unavailable"}
    health["checked_at"] = datetime.now(UTC).isoformat()
    if not health.get("disabled"):
        try:
            ch.client.insert(
                "node_config",
                [["telemetry:health", json.dumps(health), datetime.now(UTC), 0]],
                column_names=["config_id", "body", "updated_at", "deleted"],
            )
        except Exception:
            log.warning("[telemetry] health persistence unavailable")
    return health


def start_workers() -> None:
    global _started
    if not _secret():
        return
    with _lock:
        if _started:
            return
        _started = True

    def run():
        while True:
            try:
                reconcile()
            except Exception:
                log.warning("[telemetry] reconciliation unavailable")
            threading.Event().wait(30)

    threading.Thread(target=run, name="posthog-outcomes", daemon=True).start()
