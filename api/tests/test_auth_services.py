"""Tests for auth service: certify, certify_with_remote_provider, check_admin."""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

import app.settings as settings
from app.models.auth import Token, TokenData
from app.services.auth import (
    certify,
    certify_with_remote_provider,
    check_admin,
    get_password_hash,
    verify_password,
)


def _future_iso(minutes: int = 60) -> str:
    return (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()


class TestCertify:
    """certify() — the canonical token gate. The OAuth delegation check (D92):
    a token carrying a client_id must reference an active (non-tombstoned)
    client; tokens without a client_id skip the check (today's behavior)."""

    def test_normal_token_no_client_id_passes(self):
        # No client_id claim → the delegation check is skipped entirely.
        token = Token(token="t")
        with patch(
            "app.services.auth.decode_token",
            return_value=TokenData(username="alice", provider=settings.PROVIDER, expires=_future_iso(), client_id=None),
        ):
            assert certify(token) is True

    def test_delegated_token_active_client_passes(self):
        token = Token(token="t")
        with (
            patch(
                "app.services.auth.decode_token",
                return_value=TokenData(
                    username="alice", provider=settings.PROVIDER, expires=_future_iso(), client_id="muse-connector"
                ),
            ),
            patch("app.v3.services.clickhouse.get_oauth_client", return_value={"client_id": "muse-connector"}),
        ):
            assert certify(token) is True

    def test_delegated_token_missing_client_raises(self):
        token = Token(token="t")
        with (
            patch(
                "app.services.auth.decode_token",
                return_value=TokenData(
                    username="alice", provider=settings.PROVIDER, expires=_future_iso(), client_id="ghost"
                ),
            ),
            patch("app.v3.services.clickhouse.get_oauth_client", return_value=None),
        ):
            with pytest.raises(Exception, match="TOKEN"):
                certify(token)

    def test_delegated_token_tombstoned_client_raises(self):
        # A tombstoned client is absent from get_oauth_client (the dedup-then-
        # filter read returns None) → the delegated token is rejected.
        token = Token(token="t")
        with (
            patch(
                "app.services.auth.decode_token",
                return_value=TokenData(
                    username="alice", provider=settings.PROVIDER, expires=_future_iso(), client_id="revoked-app"
                ),
            ),
            patch("app.v3.services.clickhouse.get_oauth_client", return_value=None),
        ):
            with pytest.raises(Exception, match="TOKEN"):
                certify(token)

    def test_expired_token_still_rejected(self):
        # The expiry check is unchanged — an expired token fails before the
        # delegation check is even reached.
        token = Token(token="t")
        with patch(
            "app.services.auth.decode_token",
            return_value=TokenData(
                username="alice", provider=settings.PROVIDER, expires=_future_iso(-60), client_id=None
            ),
        ):
            with pytest.raises(Exception, match="TOKEN"):
                certify(token)


class TestCertifyWithRemoteProvider:
    def test_remote_certifies(self):
        token = Token(token="remote_token")
        mock_response = MagicMock()
        mock_response.status_code = 200
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            with patch("app.services.auth.requests.post", return_value=mock_response):
                result = certify_with_remote_provider(token)
                assert result is True

    def test_remote_fails(self):
        token = Token(token="remote_token")
        mock_response = MagicMock()
        mock_response.status_code = 401
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            with patch("app.services.auth.requests.post", return_value=mock_response):
                result = certify_with_remote_provider(token)
                assert result is False

    def test_remote_request_exception(self):
        token = Token(token="remote_token")
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            with patch("app.services.auth.requests.post", side_effect=Exception("timeout")):
                with pytest.raises(Exception):
                    certify_with_remote_provider(token)


class TestCheckAdmin:
    def test_admin_permitted(self):
        token = Token(token="admin_token")
        with (
            patch("app.services.auth.certify", return_value=True),
            patch(
                "app.services.auth.decode_token", return_value=TokenData(username="alice", provider=settings.PROVIDER)
            ),
            patch("app.services.config.is_admin", return_value=True),
        ):
            check_admin(token)  # returns True on success, no exception raised

    def test_non_admin_raises(self):
        token = Token(token="user_token")
        with (
            patch("app.services.auth.certify", return_value=True),
            patch("app.services.auth.decode_token", return_value=TokenData(username="bob", provider=settings.PROVIDER)),
            patch("app.services.config.is_admin", return_value=False),
        ):
            with pytest.raises(Exception):
                check_admin(token)

    def test_no_token_raises(self):
        with pytest.raises(Exception):
            check_admin(Token(token=None))


class TestPasswordHash:
    def test_hash_produces_bcrypt_string(self):
        h = get_password_hash("mysecret")
        assert h.startswith("$2")

    def test_hash_differs_for_different_passwords(self):
        h1 = get_password_hash("pass1")
        h2 = get_password_hash("pass2")
        assert h1 != h2

    def test_verify_matches_hash(self):
        h = get_password_hash("mysecret")
        assert verify_password("mysecret", h) is True

    def test_verify_fails_wrong_password(self):
        h = get_password_hash("mysecret")
        assert verify_password("wrong", h) is False

    def test_verify_malformed_hash_returns_false(self):
        assert verify_password("mysecret", "not-a-bcrypt-hash") is False

    def test_long_password_truncates_to_72_bytes(self):
        # bcrypt only consumes the first 72 bytes; hashing must not raise and
        # must match a password truncated to the same prefix.
        long_pw = "a" * 100
        h = get_password_hash(long_pw)
        assert verify_password(long_pw, h) is True
        assert verify_password("a" * 72, h) is True
