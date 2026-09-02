"""Tests for the Phase 2 phone-recovery flow: the get_users_by_phone service
function and the three unauthenticated /v3/recovery/* endpoints.

The security properties that matter:
  - no existence oracle (request answers the same whether or not the number is
    registered),
  - the account list is only returned after a valid code,
  - complete re-verifies the code AND re-checks the username against the phone
    (a forged username can't sign in as / reset someone else),
  - the phone match is format-insensitive (the stored format varies).
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import app.exceptions as exceptions
from app.main import app as fastapi_app
from app.v3.services import clickhouse as ch


@pytest.fixture
def client():
    with patch.object(ch, "client"):
        yield TestClient(fastapi_app)


def _accounts(*usernames):
    return [{"username": u, "phone": "+1555", "phone_verified": True, "email": f"{u}@x.com"} for u in usernames]


# ── get_users_by_phone (the service function) ────────────────────────────────


class TestGetUsersByPhone:
    def test_returns_all_accounts_on_the_phone(self):
        with patch.object(ch, "client") as mock_ch:
            mock_ch.query.return_value = MagicMock(
                result_rows=[
                    ("alice", "+1555111", 1, "a@x.com"),
                    ("bob", "1555111", 0, "b@x.com"),  # different stored format
                ]
            )
            rows = ch.get_users_by_phone("+1 555-111")
        assert [r["username"] for r in rows] == ["alice", "bob"]
        # The query normalizes the input to digits.
        assert mock_ch.query.call_args[0][1]["digits"] == "1555111"

    def test_empty_phone_returns_nothing_without_querying(self):
        with patch.object(ch, "client") as mock_ch:
            assert ch.get_users_by_phone("") == []
            assert ch.get_users_by_phone("   ") == []
            mock_ch.query.assert_not_called()


# ── /v3/recovery/request ─────────────────────────────────────────────────────


class TestRecoveryRequest:
    def test_registered_sends_and_returns_sent(self, client):
        with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice")):
            with patch("app.services.twilio.send_verification") as send:
                resp = client.post("/v3/recovery/request", json={"phone": "+15551234567"})
        assert resp.status_code == 200
        assert resp.json() == {"sent": True}
        send.assert_called_once_with("15551234567", "alice")  # digits, first username

    def test_unregistered_no_send_same_response(self, client):
        with patch.object(ch, "get_users_by_phone", return_value=[]):
            with patch("app.services.twilio.send_verification") as send:
                resp = client.post("/v3/recovery/request", json={"phone": "+15550000000"})
        # No existence oracle — identical response, but no SMS was sent.
        assert resp.status_code == 200
        assert resp.json() == {"sent": True}
        send.assert_not_called()

    def test_bad_phone(self, client):
        resp = client.post("/v3/recovery/request", json={"phone": "not-a-number"})
        assert resp.status_code == 401


# ── /v3/recovery/verify ──────────────────────────────────────────────────────


class TestRecoveryVerify:
    def test_valid_code_returns_account_list(self, client):
        with patch("app.services.twilio.check_verification") as check:
            with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice", "bob")):
                resp = client.post("/v3/recovery/verify", json={"phone": "+15551234567", "code": "123456"})
        assert resp.status_code == 200
        assert [a["username"] for a in resp.json()["accounts"]] == ["alice", "bob"]
        check.assert_called_once_with("15551234567", "123456")

    def test_wrong_code(self, client):
        with patch("app.services.twilio.check_verification", side_effect=exceptions.WRONG_CODE):
            resp = client.post("/v3/recovery/verify", json={"phone": "+15551234567", "code": "000000"})
        assert resp.status_code == 401

    def test_valid_code_but_no_accounts(self, client):
        with patch("app.services.twilio.check_verification"):
            with patch.object(ch, "get_users_by_phone", return_value=[]):
                resp = client.post("/v3/recovery/verify", json={"phone": "+15551234567", "code": "123456"})
        assert resp.status_code == 401


# ── /v3/recovery/complete ────────────────────────────────────────────────────


class TestRecoveryComplete:
    def _body(self, username="alice", new_password=None):
        body = {"phone": "+15551234567", "code": "123456", "username": username}
        if new_password is not None:
            body["new_password"] = new_password
        return body

    def test_signs_in_with_token(self, client):
        with patch("app.services.twilio.check_verification"):
            with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice", "bob")):
                resp = client.post("/v3/recovery/complete", json=self._body())
        assert resp.status_code == 200
        assert resp.json()["username"] == "alice"
        assert "token" in resp.json()

    def test_forged_username_rejected(self, client):
        # "eve" is not on this phone — can't sign in as / reset her.
        with patch("app.services.twilio.check_verification"):
            with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice", "bob")):
                resp = client.post("/v3/recovery/complete", json=self._body(username="eve"))
        assert resp.status_code == 401

    def test_wrong_code_rejected(self, client):
        with patch("app.services.twilio.check_verification", side_effect=exceptions.WRONG_CODE):
            resp = client.post("/v3/recovery/complete", json=self._body())
        assert resp.status_code == 401

    def test_new_password_resets(self, client):
        with patch("app.services.twilio.check_verification"):
            with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice")):
                with patch.object(ch, "change_password") as change:
                    with patch("app.v3.endpoints.recovery.get_password_hash", return_value="newhash"):
                        resp = client.post("/v3/recovery/complete", json=self._body(new_password="brand-new"))
        assert resp.status_code == 200
        change.assert_called_once_with("alice", "newhash")

    def test_empty_new_password_rejected(self, client):
        with patch("app.services.twilio.check_verification"):
            with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice")):
                resp = client.post("/v3/recovery/complete", json=self._body(new_password="   "))
        assert resp.status_code == 401

    def test_no_new_password_still_signs_in(self, client):
        # The reset is an offer, not a gate — no new_password still returns a token.
        with patch("app.services.twilio.check_verification"):
            with patch.object(ch, "get_users_by_phone", return_value=_accounts("alice")):
                with patch.object(ch, "change_password") as change:
                    resp = client.post("/v3/recovery/complete", json=self._body())
        assert resp.status_code == 200
        change.assert_not_called()
