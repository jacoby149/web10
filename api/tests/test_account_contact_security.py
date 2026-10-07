"""Contact ownership gates on the real account/recovery routes."""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app.exceptions as exceptions
import app.settings as settings
from app.main import app
from app.services.auth import encode_token
from app.v3.endpoints import recovery


def session(site="web10", username="alice"):
    return encode_token(
        {
            "username": username,
            "provider": settings.PROVIDER,
            "site": site,
            "credential_kind": "self" if site in ("web10", settings.PROVIDER) else "app",
            **({"app_origin": "https://app.example.com"} if site not in ("web10", settings.PROVIDER) else {}),
            "expires": (datetime.utcnow() + timedelta(minutes=5)).isoformat(),
        }
    )


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(app)


@pytest.mark.parametrize(
    "route,extra",
    [
        ("change-phone", {"phone": "+15551234567"}),
        ("set_recovery_phone", {"phone": "+15551234567"}),
        ("set-email", {"email": "a@example.com"}),
        ("verify-phone", {"code": "123456"}),
        ("verify-email", {"code": "123456"}),
        ("send_code", {}),
    ],
)
@pytest.mark.parametrize("site,username", [("app.example.com", "alice"), (None, "alice"), ("web10", "anon")])
def test_contact_routes_reject_non_self_sessions(client, route, extra, site, username):
    with patch("app.v3.endpoints.account.ch") as ch, patch("app.services.twilio.check_verification") as otp:
        response = client.post("/v3/" + route, json={"token": session(site, username), **extra})
    assert response.status_code == 401
    assert ch.mock_calls == []
    otp.assert_not_called()


@pytest.mark.parametrize("site", ["web10", settings.PROVIDER])
@pytest.mark.parametrize(
    "route,field,value,mutator",
    [
        ("change-phone", "phone", "+15551234567", "change_phone"),
        ("set_recovery_phone", "phone", "+15551234567", "change_phone"),
        ("set-email", "email", "a@example.com", "set_email"),
    ],
)
def test_self_session_stages_contact_without_verifying(client, site, route, field, value, mutator):
    with patch("app.v3.endpoints.account.ch") as ch:
        response = client.post("/v3/" + route, json={"token": session(site), field: value})
    assert response.status_code == 200
    getattr(ch, mutator).assert_called_once_with("alice", value)
    ch.verify_phone.assert_not_called()
    ch.verify_email.assert_not_called()


@pytest.mark.parametrize("kind,contact", [("phone", "+1 (555) 123-4567"), ("email", "a@example.com")])
@pytest.mark.parametrize("approved", [False, True])
def test_account_verification_checks_bound_contact_before_marking(client, kind, contact, approved):
    with (
        patch("app.v3.endpoints.account.ch") as ch,
        patch("app.services.twilio.check_verification", side_effect=None if approved else exceptions.WRONG_CODE) as otp,
    ):
        ch.get_phone_number.return_value = contact
        ch.get_user_profile.return_value = {"email": contact}
        response = client.post("/v3/verify-" + kind, json={"token": session(), "code": "123456"})
    otp.assert_called_once_with("15551234567" if kind == "phone" else contact, "123456")
    assert response.status_code == (200 if approved else 401)
    if approved:
        getattr(ch, "verify_" + kind).assert_called_once_with("alice")
    else:
        ch.verify_phone.assert_not_called()
        ch.verify_email.assert_not_called()


@pytest.mark.parametrize("kind", ["phone", "email"])
def test_missing_contact_does_not_check_or_mark(client, kind):
    with patch("app.v3.endpoints.account.ch") as ch, patch("app.services.twilio.check_verification") as otp:
        ch.get_phone_number.return_value = None
        ch.get_user_profile.return_value = {"email": ""}
        response = client.post("/v3/verify-" + kind, json={"token": session(), "code": "123456"})
    assert response.status_code in (400, 401)
    otp.assert_not_called()
    ch.verify_phone.assert_not_called()
    ch.verify_email.assert_not_called()


@pytest.mark.parametrize("kind", ["phone", "email"])
def test_contact_changed_during_otp_check_is_not_verified(client, kind):
    with patch("app.v3.endpoints.account.ch") as ch, patch("app.services.twilio.check_verification"):
        ch.get_phone_number.side_effect = ["15551234567", "15557654321"]
        ch.get_user_profile.side_effect = [{"email": "old@example.com"}, {"email": "new@example.com"}]
        response = client.post("/v3/verify-" + kind, json={"token": session(), "code": "123456"})
    assert response.status_code == 401
    ch.verify_phone.assert_not_called()
    ch.verify_email.assert_not_called()


@pytest.mark.parametrize("kind,contact", [("phone", "+15551234567"), ("email", "a@example.com")])
@pytest.mark.parametrize("password", [None, "attacker-password"])
def test_pending_contact_cannot_login_or_reset_existing_account(client, kind, contact, password):
    user = {"username": "alice", kind: contact, kind + "_verified": False, "email": "a@example.com"}
    with patch("app.v3.endpoints.recovery.ch") as ch, patch("app.services.twilio.check_verification"):
        ch.get_users_by_contact.return_value = [user]
        ch.get_user.return_value = user
        verified = client.post("/v3/recovery/verify", json={"contact": contact, "code": "123456"})
        assert verified.status_code == 200
        assert verified.json()["accounts"] == []
        response = client.post(
            "/v3/recovery/complete",
            json={
                "verify_token": verified.json()["verify_token"],
                "username": "alice",
                "new_password": password,
            },
        )
    assert response.status_code == 401
    ch.change_password.assert_not_called()
    ch.verify_phone.assert_not_called()
    ch.verify_email.assert_not_called()
    ch.create_user.assert_not_called()


@pytest.mark.parametrize("kind,contact", [("phone", "+15551234567"), ("email", "a@example.com")])
def test_previously_verified_contact_token_cannot_recover_after_replacement(client, kind, contact):
    token = recovery._mint_verify_token(contact, kind)
    with patch("app.v3.endpoints.recovery.ch") as ch:
        ch.get_user.return_value = {
            kind: "different@example.com" if kind == "email" else "19998887777",
            kind + "_verified": True,
        }
        response = client.post(
            "/v3/recovery/complete",
            json={
                "verify_token": token,
                "username": "alice",
                "new_password": "attacker-password",
            },
        )
    assert response.status_code == 401
    ch.change_password.assert_not_called()


@pytest.mark.parametrize("kind,contact", [("phone", "+15551234567"), ("email", "a@example.com")])
@pytest.mark.parametrize("status", ["approved", "pending", "canceled"])
def test_real_twilio_adapter_gates_account_verification(client, kind, contact, status):
    with (
        patch("app.v3.endpoints.account.ch") as ch,
        patch("app.services.twilio.client") as twilio,
        patch("app.settings.TWILIO_E2E", ""),
    ):
        ch.get_phone_number.return_value = contact
        ch.get_user_profile.return_value = {"email": contact}
        check = twilio.verify.services.return_value.verification_checks.create
        check.return_value.status = status
        response = client.post("/v3/verify-" + kind, json={"token": session(), "code": "654321"})
    check.assert_called_once_with(to=contact, code="654321")
    assert response.status_code == (200 if status == "approved" else 401)
    assert getattr(ch, "verify_" + kind).call_count == (1 if status == "approved" else 0)


@pytest.mark.parametrize("prefix", ["/v3", "/v3/recovery"])
def test_recovery_aliases_use_real_twilio_approval(client, prefix):
    with (
        patch("app.v3.endpoints.recovery.ch") as ch,
        patch("app.services.twilio.client") as twilio,
        patch("app.settings.TWILIO_E2E", ""),
    ):
        check = twilio.verify.services.return_value.verification_checks.create
        check.return_value.status = "pending"
        response = client.post(prefix + "/verify", json={"contact": "+15551234567", "code": "000000"})
    assert response.status_code == 401
    check.assert_called_once_with(to="+15551234567", code="000000")
    ch.get_users_by_contact.assert_not_called()


@pytest.mark.parametrize("token_kind", ["malformed", "expired", "recovery"])
def test_contact_replacement_requires_valid_session(client, token_kind):
    token = "garbage"
    if token_kind == "expired":
        token = encode_token(
            {
                "username": "alice",
                "provider": settings.PROVIDER,
                "site": "web10",
                "expires": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
            }
        )
    elif token_kind == "recovery":
        token = recovery._mint_verify_token("+15551234567", "phone")
    with patch("app.v3.endpoints.account.ch") as ch:
        response = client.post("/v3/set_recovery_phone", json={"token": token, "phone": "+15551234567"})
    assert response.status_code == 401
    assert ch.mock_calls == []
