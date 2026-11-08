import json
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.services import product_analytics as analytics
from app.v3.services import clickhouse as ch

CFG = {
    "posthog_enabled": True,
    "posthog_project_key": "phc_synthetic_project",
    "posthog_host": "https://us.i.posthog.com",
    "posthog_capture_since": "2026-11-01T00:00:00Z",
}
STAMP = datetime(2026, 11, 8, 12, 0, 0, 123000, tzinfo=UTC)


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "POSTHOG_IDENTITY_SECRET", "synthetic-separate-secret-for-tests-only-123456")


def test_pseudonym_is_provider_and_account_incarnation_scoped(monkeypatch):
    first = analytics.account_id("alice", STAMP)
    assert first == analytics.account_id("alice", "2026-11-08T12:00:00.123Z")
    assert first == analytics.account_id("alice", "2026-11-08T14:00:00.123+02:00")
    assert first != analytics.account_id("bob", STAMP)
    assert first != analytics.account_id("alice", STAMP + timedelta(days=1))
    monkeypatch.setattr(settings, "PROVIDER", "another-node.invalid")
    assert first != analytics.account_id("alice", STAMP)
    assert "alice" not in first


def test_signed_first_touch_is_bounded_and_grants_no_account_authority():
    with patch.object(analytics, "effective_config", return_value=CFG):
        a = analytics.acquisition_context(
            None, {"utm_campaign": "pilot", "utm_content": "creator_a", "username": "PRIVATE"}
        )
        b = analytics.acquisition_context(a["ticket"], {"utm_content": "creator_b"})
    assert a == b
    assert a["properties"] == {"utm_campaign": "pilot", "utm_content": "creator_a"}
    assert analytics.context_fields(a["ticket"] + "forged") == {}
    expired = jwt.encode(
        {
            "purpose": "acquisition",
            "iss": settings.PROVIDER,
            "aud": "web10-acquisition",
            "exp": datetime.now(UTC) - timedelta(seconds=1),
            "utm_campaign": "expired",
        },
        settings.POSTHOG_IDENTITY_SECRET,
        algorithm="HS256",
    )
    assert analytics.context_fields(expired) == {}
    assert analytics.campaign_fields({"utm_source": "alice@example.com", "utm_term": "PRIVATE"}) == {}


def test_signup_context_is_part_of_the_single_canonical_user_insert():
    with (
        patch.object(analytics, "effective_config", return_value=CFG),
        patch.object(ch, "client") as client,
        patch.object(ch, "_ensure_discover_group_contract"),
        patch.object(ch, "add_group_member"),
    ):
        client.query.return_value = MagicMock(result_rows=[(0,)])
        ticket = analytics.acquisition_context(None, {"utm_content": "creator_a"})["ticket"]
        result = ch.create_user("alice", "HASH", analytics_context=ticket)
        args = client.insert.call_args
        assert args.args[0] == "users"
        columns = args.kwargs["column_names"]
        context = json.loads(args.args[1][0][columns.index("analytics_context")])
        assert context["properties"] == {"utm_content": "creator_a"}
        assert result["username"] == "alice"
        assert context["distinct_id"].startswith("w10_")


def test_config_outage_does_not_break_signup_and_is_recoverable():
    with patch.object(analytics, "effective_config", side_effect=RuntimeError("down")):
        context = json.loads(analytics.signup_context("alice", STAMP, None))
    assert context["incomplete"] is True
    assert context["event_id"]
    assert context["distinct_id"] == analytics.account_id("alice", STAMP)


def test_enablement_requires_server_identity_key_but_disabling_remains_available(monkeypatch):
    monkeypatch.setattr(settings, "POSTHOG_IDENTITY_SECRET", "")
    token = jwt.encode(
        {
            "username": "alice",
            "provider": settings.PROVIDER,
            "site": "auth.localhost",
            "expires": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        },
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )
    client = TestClient(app, raise_server_exceptions=False)
    with (
        patch("app.endpoints.system.check_admin"),
        patch("app.endpoints.system.config_svc.get_config", return_value={}),
        patch("app.endpoints.system.config_svc.save_config") as save,
    ):
        response = client.post("/config/update", json={"token": {"token": token}, "update": {"posthog_enabled": True}})
        assert response.status_code == 422
        save.assert_not_called()
        response = client.post("/config/update", json={"token": {"token": token}, "update": {"posthog_enabled": False}})
        assert response.status_code == 200


def test_retry_after_vendor_acceptance_before_ack_reuses_event_identity():
    response = MagicMock(status_code=200)
    with patch.object(ch, "client") as client, patch.object(analytics.requests, "post", return_value=response) as post:
        client.query.return_value = MagicMock(result_rows=[(0,)])
        client.insert.side_effect = [RuntimeError("crash before ack"), None]
        with pytest.raises(RuntimeError):
            analytics.send_signup("alice", STAMP, {"properties": {"utm_content": "creator_a"}}, CFG)
        analytics.send_signup("alice", STAMP, {"properties": {"utm_content": "creator_a"}}, CFG)
        first, retry = [call.kwargs["json"] for call in post.call_args_list]
        assert first == retry
        assert first["event"] == "account_created"
        assert first["properties"]["capture_origin"] == "server"
        assert "alice" not in json.dumps(first)
        assert post.call_args.kwargs["allow_redirects"] is False


def test_acked_outcome_is_not_sent_again_and_failure_does_not_ack():
    with patch.object(ch, "client") as client, patch.object(analytics.requests, "post") as post:
        client.query.return_value = MagicMock(result_rows=[(1,)])
        assert analytics.send_signup("alice", STAMP, {}, CFG) is False
        post.assert_not_called()
        client.query.return_value = MagicMock(result_rows=[(0,)])
        post.return_value.status_code = 503
        with pytest.raises(RuntimeError):
            analytics.send_signup("alice", STAMP, {}, CFG)
        client.insert.assert_not_called()


@pytest.mark.parametrize(
    "mutation,args",
    [
        ("set_domain", ("alice", "example.com", 1)),
        ("change_password", ("alice", "HASH")),
        ("change_phone", ("alice", "phone")),
        ("set_email", ("alice", "email")),
        ("verify_phone", ("alice",)),
        ("verify_email", ("alice",)),
    ],
)
def test_every_user_version_writer_retains_the_durable_context(mutation, args):
    with patch.object(ch, "client") as client:
        getattr(ch, mutation)(*args)
    sql = client.command.call_args.args[0]
    assert sql.count("analytics_context") == 2


def test_identity_requires_verified_live_local_account_and_never_returns_credentials():
    token = jwt.encode(
        {
            "username": "alice",
            "provider": settings.PROVIDER,
            "site": "auth.localhost",
            "expires": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        },
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )
    client = TestClient(app, raise_server_exceptions=False)
    with (
        patch("app.endpoints.system.config_svc.effective_config", return_value=CFG),
        patch.object(ch, "get_user", return_value={"created_at": STAMP.isoformat()}),
        patch.object(
            analytics, "read_context", return_value={"properties": {"utm_content": "creator_a", "contact": "PRIVATE"}}
        ),
    ):
        response = client.post("/analytics/identity", json={"token": token, "username": "victim"})
    assert response.status_code == 200
    assert response.json()["distinct_id"] == analytics.account_id("alice", STAMP)
    assert response.json()["acquisition"] == {"utm_content": "creator_a"}
    assert "alice" not in response.text and "PRIVATE" not in response.text
    for payload in [{"token": "forged"}, {"token": token[:-4] + "fake"}]:
        assert client.post("/analytics/identity", json=payload).status_code != 200


def test_reconciliation_reads_current_canonical_accounts_and_retries_after_restart():
    context = json.dumps({"event_id": "synthetic-id", "properties": {"utm_content": "creator_a"}})
    with (
        patch.object(analytics, "effective_config", return_value=CFG),
        patch.object(ch, "client") as client,
        patch.object(analytics, "send_signup", return_value=True) as send,
    ):
        client.query.side_effect = [MagicMock(result_rows=[("alice", STAMP, context)]), MagicMock(result_rows=[])]
        health = analytics.reconcile()
        assert health["sent"] == 1 and health["complete"] is True
        assert send.call_args.args[0] == "alice"
        sql = client.query.call_args_list[0].args[0]
        assert "row_number() OVER (PARTITION BY username ORDER BY updated_at DESC, deleted DESC)" in sql
        assert "telemetry:delivered:" in sql
