"""Tests for contact-anchored auth (D61) — the recovery endpoints."""

from datetime import datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.endpoints import recovery


def _make_verify_token(contact="+15551234567", kind="phone", minutes=5, purpose="recovery"):
    return jwt.encode(
        {
            "contact": contact,
            "kind": kind,
            "purpose": purpose,
            "exp": datetime.utcnow() + timedelta(minutes=minutes),
        },
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )


@pytest.fixture(autouse=True)
def _clear_send_log():
    recovery._send_log.clear()
    yield
    recovery._send_log.clear()


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


# ---------------------------------------------------------------------------
# _contact_kind
# ---------------------------------------------------------------------------


class TestContactKind:
    def test_phone(self):
        assert recovery._contact_kind("+15551234567") == "phone"

    def test_phone_no_plus(self):
        assert recovery._contact_kind("15551234567") == "phone"

    def test_email(self):
        assert recovery._contact_kind("user@example.com") == "email"

    def test_invalid_raises(self):
        with pytest.raises(Exception):
            recovery._contact_kind("not a contact")

    def test_empty_raises(self):
        with pytest.raises(Exception):
            recovery._contact_kind("")


# ---------------------------------------------------------------------------
# /v3/recovery/request
# ---------------------------------------------------------------------------


class TestRequest:
    def test_request_phone_sends_code(self, client):
        with patch("app.services.twilio.send_verification", return_value="VA123") as m:
            resp = client.post("/v3/recovery/request", json={"contact": "+15551234567"})
        assert resp.status_code == 200
        assert resp.json() == {"sent": True, "kind": "phone"}
        m.assert_called_once_with("+15551234567", "")

    def test_request_email_sends_code(self, client):
        with patch("app.services.twilio.send_verification", return_value="VA123") as m:
            resp = client.post("/v3/recovery/request", json={"contact": "user@example.com"})
        assert resp.status_code == 200
        assert resp.json() == {"sent": True, "kind": "email"}
        m.assert_called_once_with("user@example.com", "")

    def test_request_bad_contact(self, client):
        resp = client.post("/v3/recovery/request", json={"contact": "nope"})
        assert resp.status_code == 400
        assert "valid phone" in resp.json()["detail"]

    def test_request_rate_limited(self, client):
        """A second send within the 60s min-gap is rate-limited."""
        with patch("app.services.twilio.send_verification", return_value="VA123"):
            assert client.post("/v3/recovery/request", json={"contact": "+15551234567"}).status_code == 200
            resp = client.post("/v3/recovery/request", json={"contact": "+15551234567"})
            assert resp.status_code == 429


# ---------------------------------------------------------------------------
# /v3/recovery/verify
# ---------------------------------------------------------------------------


class TestVerify:
    def test_verify_returns_accounts_and_token(self, client):
        with (
            patch("app.services.twilio.check_verification", return_value="VC123"),
            patch(
                "app.v3.services.clickhouse.get_users_by_contact",
                return_value=[
                    {
                        "username": "alice",
                        "phone": "+15551234567",
                        "email": "a@x.com",
                        "phone_verified": True,
                        "email_verified": False,
                    },
                    {
                        "username": "bob",
                        "phone": "+15551234567",
                        "email": "",
                        "phone_verified": True,
                        "email_verified": False,
                    },
                ],
            ),
        ):
            resp = client.post("/v3/recovery/verify", json={"contact": "+15551234567", "code": "123456"})
        assert resp.status_code == 200
        body = resp.json()
        assert [a["username"] for a in body["accounts"]] == ["alice", "bob"]
        assert body["verify_token"]
        payload = jwt.decode(body["verify_token"], settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
        assert payload["contact"] == "+15551234567"
        assert payload["kind"] == "phone"

    def test_verify_empty_accounts_is_valid(self, client):
        """No account on the contact yet -> empty list (the sign-up path)."""
        with (
            patch("app.services.twilio.check_verification", return_value="VC123"),
            patch("app.v3.services.clickhouse.get_users_by_contact", return_value=[]),
        ):
            resp = client.post("/v3/recovery/verify", json={"contact": "+15550000000", "code": "123456"})
        assert resp.status_code == 200
        assert resp.json()["accounts"] == []
        assert resp.json()["verify_token"]

    def test_verify_wrong_code(self, client):
        from app.exceptions import WRONG_CODE

        with patch("app.services.twilio.check_verification", side_effect=WRONG_CODE):
            resp = client.post("/v3/recovery/verify", json={"contact": "+15551234567", "code": "000000"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /v3/recovery/complete
# ---------------------------------------------------------------------------


class TestComplete:
    def test_complete_signs_in_existing_account(self, client):
        token = _make_verify_token("+15551234567", "phone")
        with patch(
            "app.v3.services.clickhouse.get_user",
            return_value={
                "username": "alice",
                "phone": "+15551234567",
                "email": "",
                "phone_verified": False,
                "email_verified": False,
            },
        ):
            with patch("app.v3.services.clickhouse.verify_phone") as vp:
                resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "alice"})
        assert resp.status_code == 200
        assert resp.json()["token"]
        vp.assert_called_once_with("alice")

    def test_complete_creates_new_account_with_contact(self, client):
        token = _make_verify_token("+15551234567", "phone")
        with patch("app.v3.services.clickhouse.get_user", return_value=None):
            with patch(
                "app.v3.services.clickhouse.create_user",
                return_value={"username": "newbie", "phone": "+15551234567", "email": ""},
            ) as cu:
                with patch("app.v3.services.clickhouse.verify_phone") as vp:
                    resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "newbie"})
        assert resp.status_code == 200
        assert resp.json()["token"]
        assert cu.call_args[0][0] == "newbie"
        assert cu.call_args[1]["phone"] == "+15551234567"
        assert cu.call_args[1]["email"] == ""
        vp.assert_called_once_with("newbie")

    def test_complete_new_account_with_password_and_email(self, client):
        token = _make_verify_token("user@example.com", "email")
        with patch("app.v3.services.clickhouse.get_user", return_value=None):
            with patch(
                "app.v3.services.clickhouse.create_user",
                return_value={"username": "newbie", "phone": "", "email": "user@example.com"},
            ) as cu:
                with patch("app.v3.services.clickhouse.verify_email") as ve:
                    resp = client.post(
                        "/v3/recovery/complete",
                        json={"verify_token": token, "username": "newbie", "new_password": "s3cret"},
                    )
        assert resp.status_code == 200
        assert cu.call_args[1]["email"] == "user@example.com"
        assert cu.call_args[1]["phone"] == ""
        ve.assert_called_once_with("newbie")

    def test_complete_changes_password_on_existing(self, client):
        token = _make_verify_token("+15551234567", "phone")
        with patch(
            "app.v3.services.clickhouse.get_user",
            return_value={
                "username": "alice",
                "phone": "+15551234567",
                "email": "",
                "phone_verified": True,
                "email_verified": False,
            },
        ):
            with patch("app.v3.services.clickhouse.change_password") as cp:
                with patch("app.v3.services.clickhouse.verify_phone"):
                    resp = client.post(
                        "/v3/recovery/complete",
                        json={"verify_token": token, "username": "alice", "new_password": "newpass"},
                    )
        assert resp.status_code == 200
        cp.assert_called_once()

    def test_complete_contact_mismatch(self, client):
        """A verify_token for phone X can't sign in to an account without X."""
        token = _make_verify_token("+15551234567", "phone")
        with patch(
            "app.v3.services.clickhouse.get_user",
            return_value={
                "username": "mallory",
                "phone": "+19998887777",
                "email": "",
                "phone_verified": True,
                "email_verified": False,
            },
        ):
            resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "mallory"})
        assert resp.status_code == 401
        assert "isn't linked" in resp.json()["detail"]

    def test_complete_phone_format_normalized(self, client):
        """A stored phone without the leading + still matches the contact."""
        token = _make_verify_token("+15551234567", "phone")
        with patch(
            "app.v3.services.clickhouse.get_user",
            return_value={
                "username": "alice",
                "phone": "15551234567",
                "email": "",
                "phone_verified": False,
                "email_verified": False,
            },
        ):
            with patch("app.v3.services.clickhouse.verify_phone"):
                resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "alice"})
        assert resp.status_code == 200

    def test_complete_bad_verify_token(self, client):
        with patch("app.v3.services.clickhouse.get_user", return_value=None):
            resp = client.post("/v3/recovery/complete", json={"verify_token": "garbage", "username": "alice"})
        assert resp.status_code == 401

    def test_complete_wrong_purpose_token(self, client):
        """A token minted for a different purpose can't be used as a verify_token."""
        token = _make_verify_token("+15551234567", "phone", purpose="login")
        with patch("app.v3.services.clickhouse.get_user", return_value=None):
            resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "alice"})
        assert resp.status_code == 401

    def test_complete_expired_verify_token(self, client):
        token = _make_verify_token("+15551234567", "phone", minutes=-5)
        with patch("app.v3.services.clickhouse.get_user", return_value=None):
            resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "alice"})
        assert resp.status_code == 401

    def test_complete_bad_username_on_create(self, client):
        token = _make_verify_token("+15551234567", "phone")
        with patch("app.v3.services.clickhouse.get_user", return_value=None):
            resp = client.post("/v3/recovery/complete", json={"verify_token": token, "username": "Bad Username!"})
        assert resp.status_code == 401
        assert "username" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# /v3/signup — the require_contact gate (D10)
# ---------------------------------------------------------------------------


class TestSignupContactGate:
    def test_signup_requires_contact_when_flag_on(self, client):
        with patch("app.v3.endpoints.auth.effective_config", return_value={"require_contact": True}):
            resp = client.post("/v3/signup", json={"username": "newbie", "password": "s3cret"})
        assert resp.status_code == 401
        assert "requires a phone" in resp.json()["detail"]

    def test_signup_ok_with_phone_when_flag_on(self, client):
        with patch("app.v3.endpoints.auth.effective_config", return_value={"require_contact": True}):
            with patch(
                "app.v3.services.clickhouse.create_user",
                return_value={"username": "newbie", "phone": "+15551234567", "email": ""},
            ):
                resp = client.post(
                    "/v3/signup", json={"username": "newbie", "password": "s3cret", "phone": "+15551234567"}
                )
        assert resp.status_code == 200

    def test_signup_ok_without_contact_when_flag_off(self, client):
        with patch("app.v3.endpoints.auth.effective_config", return_value={"require_contact": False}):
            with patch(
                "app.v3.services.clickhouse.create_user",
                return_value={"username": "newbie", "phone": "", "email": ""},
            ):
                resp = client.post("/v3/signup", json={"username": "newbie", "password": "s3cret"})
        assert resp.status_code == 200
