"""Synthetic provider/S3 controls. No Google/Twilio/SendGrid requests."""

import base64
import hashlib
import io
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.services import contact_delivery as delivery
from app.services import contact_state as state


class ClientError(Exception):
    def __init__(self, response, operation):
        self.response = response


class PrivateS3:
    def __init__(self):
        self.records, self.lock = {}, threading.Lock()

    def get_object(self, *, Bucket, Key):
        with self.lock:
            if Key not in self.records:
                raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
            raw, etag = self.records[Key]
            return {"Body": io.BytesIO(raw), "ETag": etag}

    def put_object(self, *, Bucket, Key, Body, ContentType, IfMatch=None, IfNoneMatch=None):
        with self.lock:
            current = self.records.get(Key)
            if (IfNoneMatch == "*" and current) or (IfMatch and (not current or current[1] != IfMatch)):
                raise ClientError({"Error": {"Code": "PreconditionFailed"}}, "PutObject")
            assert IfMatch or IfNoneMatch == "*"
            self.records[Key] = (Body, hashlib.sha256(Body).hexdigest())


@pytest.fixture
def environment(monkeypatch):
    s3 = PrivateS3()
    monkeypatch.setattr(settings, "CONTACT_DELIVERY_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "CONTACT_DELIVERY_STATE_BUCKET", "private-contact-tests")
    monkeypatch.setattr(settings, "CONTACT_AUTH_URL", "https://auth.example.com")
    monkeypatch.setattr(settings, "PROVIDER", "api.example.com")
    monkeypatch.setattr(settings, "GMAIL_CLIENT_ID", "synthetic-client")
    monkeypatch.setattr(settings, "GMAIL_CLIENT_SECRET", "synthetic-client-secret")
    monkeypatch.setattr(settings, "GMAIL_REDIRECT_URI", "https://api.example.com/admin/contact/gmail/callback")
    monkeypatch.setattr(state, "get_s3_client", lambda: s3)
    monkeypatch.setattr(delivery, "request_json", Mock(return_value={}))
    return s3


def sendgrid():
    delivery.configure("sendgrid", "support@example.com", "synthetic-sendgrid-secret", "", "", "")


def email_challenge(monkeypatch):
    captured = []
    monkeypatch.setattr(delivery, "send_email", lambda *args, **kw: captured.append(args))
    delivery.send_code("person@example.net")
    body = captured[0][2]
    return re.search(r"code is ([0-9]{6})", body)[1], re.search(r"#recovery=([\w-]+)", body)[1]


def stage_gmail(token="admin-token"):
    flow = delivery.start_gmail(token)
    delivery.request_json.side_effect = [
        {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh", "scope": delivery.GMAIL_SCOPE},
        {"email": "support@example.com", "email_verified": True},
    ]
    destination = delivery.gmail_callback(flow["flow"], "synthetic-code")
    delivery.request_json.side_effect = None
    return flow, destination


def test_state_is_encrypted_and_conditional(environment):
    state.replace("test", lambda _: {"secret": "private-sentinel"})
    assert b"private-sentinel" not in next(iter(environment.records.values()))[0]
    record, etag = state.load("test")
    assert record == {"secret": "private-sentinel"}
    assert not state.save("test", {"secret": "stale"}, None)
    assert state.save("test", {"secret": "fresh"}, etag)
    assert not state.save("test", {}, etag)


def test_secrets_never_in_status_and_blank_updates_preserve(environment):
    sendgrid()
    delivery.configure("sendgrid", "", "", "ACsynthetic", "twilio-secret", "VAsynthetic")
    result = delivery.configure("sendgrid", "", "", "", "", "")
    assert result["sendgrid_configured"] and result["twilio_configured"]
    assert "synthetic-sendgrid-secret" not in json.dumps(result)
    assert "twilio-secret" not in json.dumps(result)
    assert state.load("settings")[0]["sendgrid_key"] == "synthetic-sendgrid-secret"


def test_gmail_is_pkce_send_only_staged_and_owned(environment):
    flow, destination = stage_gmail()
    params = parse_qs(urlsplit(flow["url"]).query)
    assert params["scope"] == ["openid email " + delivery.GMAIL_SCOPE]
    verifier = delivery.request_json.call_args_list[0].kwargs["data"]["code_verifier"]
    assert params["code_challenge"] == [
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    ]
    assert destination == "https://auth.example.com/?mode=config#gmail=" + flow["flow"]
    assert not delivery.status()["gmail_connected"]
    with pytest.raises(HTTPException):
        delivery.finish_gmail(flow["flow"], "other-login")
    assert delivery.finish_gmail(flow["flow"], "admin-token")["gmail_connected"]
    assert delivery.status()["email_provider"] == "legacy"
    with pytest.raises(HTTPException):
        delivery.finish_gmail(flow["flow"], "admin-token")
    with pytest.raises(HTTPException):
        delivery.gmail_callback(flow["flow"], "replayed-code")


def test_disconnect_invalidates_old_handoff_and_does_not_fallback(environment, monkeypatch):
    flow, _ = stage_gmail()
    delivery.disconnect_gmail()
    with pytest.raises(HTTPException):
        delivery.finish_gmail(flow["flow"], "admin-token")
    flow, _ = stage_gmail()
    delivery.finish_gmail(flow["flow"], "admin-token")
    delivery.configure("gmail", "", "", "", "", "")
    delivery.disconnect_gmail()
    fallback = Mock()
    monkeypatch.setattr("app.services.twilio.send_verification", fallback)
    with pytest.raises(HTTPException):
        delivery.send_code("person@example.net")
    fallback.assert_not_called()


def test_gmail_expired_or_wrong_callback_is_denied(environment, monkeypatch):
    flow = delivery.start_gmail("admin")
    monkeypatch.setattr(delivery.time, "time", lambda: 9999999999)
    with pytest.raises(HTTPException):
        delivery.gmail_callback(flow["flow"], "code")
    delivery.request_json.assert_not_called()


def test_missing_key_never_falls_back(environment, monkeypatch):
    sendgrid()
    monkeypatch.setattr(settings, "CONTACT_DELIVERY_KEY", "")
    fallback = Mock()
    monkeypatch.setattr("app.services.twilio.send_verification", fallback)
    with pytest.raises(HTTPException):
        delivery.send_code("person@example.net")
    fallback.assert_not_called()


@pytest.mark.parametrize("method", ["code", "link"])
def test_email_code_and_link_are_single_use_and_share_consumption(environment, monkeypatch, method):
    sendgrid()
    code, link = email_challenge(monkeypatch)
    if method == "link":
        assert delivery.check_link(link) == "person@example.net"
    else:
        delivery.check_code("PERSON@example.net", code)
    with pytest.raises(HTTPException):
        delivery.check_link(link)
    with pytest.raises(HTTPException):
        delivery.check_code("person@example.net", code)


def test_wrong_attempt_limit_and_expiry(environment, monkeypatch):
    sendgrid()
    code, link = email_challenge(monkeypatch)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        with pytest.raises(HTTPException):
            delivery.check_code("person@example.net", wrong)
    with pytest.raises(HTTPException):
        delivery.check_link(link)
    state.replace("budget/" + state.digest("email:person@example.net"), lambda _: {})
    code, link = email_challenge(monkeypatch)
    monkeypatch.setattr(delivery.time, "time", lambda: 9999999999)
    with pytest.raises(HTTPException):
        delivery.check_link(link)


def test_resend_supersedes_previous_and_two_workers_cannot_consume(environment, monkeypatch):
    sendgrid()
    old_code, old_link = email_challenge(monkeypatch)
    state.replace("budget/" + state.digest("email:person@example.net"), lambda _: {})
    code, link = email_challenge(monkeypatch)
    with pytest.raises(HTTPException):
        delivery.check_link(old_link)
    barrier = threading.Barrier(2)

    def verify(_):
        barrier.wait()
        try:
            return delivery.check_link(link)
        except HTTPException:
            return "denied"

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(verify, range(2)))
    assert sorted(results) == ["denied", "person@example.net"]


def test_send_failure_keeps_challenge_inactive(environment, monkeypatch):
    sendgrid()
    monkeypatch.setattr(delivery, "send_email", Mock(side_effect=state.unavailable()))
    with pytest.raises(HTTPException):
        delivery.send_code("person@example.net")
    record = state.load("challenge/" + state.digest("email:person@example.net"))[0]
    assert not record["active"]


def test_consumed_old_link_cannot_exhaust_replacement_attempts(environment, monkeypatch):
    sendgrid()
    _, old_link = email_challenge(monkeypatch)
    assert delivery.check_link(old_link) == "person@example.net"
    state.replace("budget/" + state.digest("email:person@example.net"), lambda _: {})
    new_code, new_link = email_challenge(monkeypatch)
    for _ in range(6):
        with pytest.raises(HTTPException):
            delivery.check_link(old_link)
    record = state.load("challenge/" + state.digest("email:person@example.net"))[0]
    assert record["attempts"] == 0
    assert delivery.check_link(new_link) == "person@example.net"


def test_hourly_and_minute_limits_are_shared(environment):
    sendgrid()
    delivery.budget("same-contact", 5, 60)
    with pytest.raises(HTTPException) as error:
        delivery.budget("same-contact", 5, 60)
    assert error.value.status_code == 429
    for _ in range(100):
        delivery.budget("node", 100)
    with pytest.raises(HTTPException):
        delivery.budget("node", 100)


def test_provider_wire_and_no_secret_errors(environment, monkeypatch):
    sendgrid()
    response = Mock(status_code=202)
    response.iter_content.return_value = []
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    request = Mock(return_value=response)
    monkeypatch.setattr(delivery, "request_json", delivery_request_json)
    monkeypatch.setattr(delivery.requests, "request", request)
    delivery.send_email("person@example.net", "Subject", "Body")
    assert request.call_args.args == ("POST", "https://api.sendgrid.com/v3/mail/send")
    assert request.call_args.kwargs["allow_redirects"] is False
    response.status_code = 302
    with pytest.raises(HTTPException) as error:
        delivery.send_email("person@example.net", "Subject", "Body")
    assert "synthetic-sendgrid-secret" not in str(error.value)


delivery_request_json = delivery.request_json


def token(username="admin", **extra):
    return jwt.encode(
        {
            "username": username,
            "site": "web10",
            "provider": settings.PROVIDER,
            "expires": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
            **extra,
        },
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )


def test_registered_admin_routes_deny_nonadmin_and_delegated(environment, monkeypatch):
    monkeypatch.setattr("app.services.config.is_admin", lambda username: username == "admin")
    client = TestClient(app, raise_server_exceptions=False)
    assert client.post("/admin/contact/status", json={"token": token("reader")}).status_code == 403
    assert client.post("/admin/contact/status", json={"token": token(client_id="delegated")}).status_code == 403
    assert client.post("/admin/contact/status", json={"token": token()}).status_code == 200
    assert client.get("/admin/contact/gmail/callback?state=private-sentinel&error=denied").status_code == 400


def test_real_email_link_to_existing_password_reset(environment, monkeypatch):
    sendgrid()
    code, link = email_challenge(monkeypatch)
    monkeypatch.setattr(
        "app.v3.services.clickhouse.get_users_by_contact", lambda contact: [{"username": "alice", "email": contact}]
    )
    monkeypatch.setattr(
        "app.v3.services.clickhouse.get_user",
        lambda username: {"username": "alice", "email": "person@example.net", "phone": ""},
    )
    changed = Mock()
    monkeypatch.setattr("app.v3.services.clickhouse.change_password", changed)
    monkeypatch.setattr("app.v3.services.clickhouse.verify_email", Mock())
    client = TestClient(app)
    # Mail-preview GET is not a verification seam.
    assert client.get("/v3/recovery/link").status_code == 405
    verified = client.post("/v3/recovery/link", json={"link": link})
    assert verified.status_code == 200
    reset = client.post(
        "/v3/recovery/complete",
        json={"verify_token": verified.json()["verify_token"], "username": "alice", "new_password": "fresh-password"},
    )
    assert reset.status_code == 200
    from app.services.auth import verify_password

    assert verify_password("fresh-password", changed.call_args.args[1])
    assert client.post("/v3/recovery/link", json={"link": link}).status_code == 401
