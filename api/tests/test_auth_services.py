"""Tests for auth service: certify, certify_with_remote_provider, check_admin."""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

import app.settings as settings
from app.models.auth import Token, TokenData
from app.services.auth import (
    certify,
    certify_with_remote_provider,
    check_admin,
    clear_remote_certify_cache,
    get_password_hash,
    verify_password,
)


def _future_iso(minutes: int = 60) -> str:
    return (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()


@pytest.fixture(autouse=True)
def _clean_remote_cache():
    clear_remote_certify_cache()
    yield
    clear_remote_certify_cache()


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


class TestCertifyCrossNode:
    """Cross-node certification (D84 Phase B, the live /certify model): a
    token whose provider is not this node is certified at its home node.
    The remote answer certifies IDENTITY ONLY — the expiry is re-checked
    locally, and every access decision still runs in the caller's checks.
    Yeses are cached until the token's own expiry; noes get a short TTL."""

    def _foreign_decode(self, provider="https://node-a.example", username="alice"):
        return TokenData(username=username, provider=provider, expires=_future_iso(60), client_id=None)

    def test_foreign_token_certified_by_home_node(self):
        token = Token(token="foreign_jwt")
        with (
            patch("app.services.auth.decode_token", side_effect=[self._foreign_decode(), self._foreign_decode()]),
            patch("app.services.auth.certify_with_remote_provider", return_value=True) as remote,
        ):
            assert certify(token) is True
            remote.assert_called_once_with(token)

    def test_foreign_token_denied_by_home_node(self):
        token = Token(token="foreign_jwt")
        with (
            patch("app.services.auth.decode_token", side_effect=[self._foreign_decode(), self._foreign_decode()]),
            patch("app.services.auth.certify_with_remote_provider", return_value=False),
        ):
            with pytest.raises(Exception, match="TOKEN"):
                certify(token)

    def test_foreign_token_remote_error_raises(self):
        # A home node that is unreachable (timeout / connection error) is a
        # denial — never a silent pass.
        token = Token(token="foreign_jwt")
        with (
            patch("app.services.auth.decode_token", side_effect=[self._foreign_decode(), self._foreign_decode()]),
            patch("app.services.auth.certify_with_remote_provider", side_effect=Exception("timeout")),
        ):
            with pytest.raises(Exception):
                certify(token)

    def test_yes_cached_until_token_expiry(self):
        token = Token(token="foreign_jwt")
        with (
            patch("app.services.auth.decode_token", side_effect=[self._foreign_decode(), self._foreign_decode()]),
            patch("app.services.auth.certify_with_remote_provider", return_value=True) as remote,
        ):
            assert certify(token) is True
        # Second certify of the SAME token: the cache answers, no remote call.
        with patch("app.services.auth.decode_token", return_value=self._foreign_decode()):
            assert certify(token) is True
        remote.assert_called_once()

    def test_negative_cached_briefly(self):
        token = Token(token="foreign_jwt")
        with (
            patch("app.services.auth.decode_token", side_effect=[self._foreign_decode(), self._foreign_decode()]),
            patch("app.services.auth.certify_with_remote_provider", return_value=False) as remote,
        ):
            with pytest.raises(Exception, match="TOKEN"):
                certify(token)
        # The no is cached: the immediate retry does not re-hit the home node.
        with patch("app.services.auth.decode_token", return_value=self._foreign_decode()):
            with pytest.raises(Exception, match="TOKEN"):
                certify(token)
        remote.assert_called_once()

    def test_different_tokens_not_cross_cached(self):
        t1 = Token(token="jwt_one")
        t2 = Token(token="jwt_two")
        with (
            patch("app.services.auth.decode_token", side_effect=[self._foreign_decode() for _ in range(4)]),
            patch("app.services.auth.certify_with_remote_provider", return_value=True) as remote,
        ):
            assert certify(t1) is True
            assert certify(t2) is True
        assert remote.call_count == 2

    def test_local_token_never_hits_remote(self):
        token = Token(token="local_jwt")
        with (
            patch(
                "app.services.auth.decode_token",
                return_value=TokenData(username="alice", provider=settings.PROVIDER, expires=_future_iso()),
            ),
            patch("app.services.auth.certify_with_remote_provider") as remote,
        ):
            assert certify(token) is True
            remote.assert_not_called()


class TestCertifyWithRemoteProvider:
    def test_remote_certifies(self, mock_certify_post):
        token = Token(token="remote_token")
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            assert certify_with_remote_provider(token) is True

    def test_remote_fails(self, mock_certify_post):
        token = Token(token="remote_token")
        mock_certify_post.return_value.status = 401
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            assert certify_with_remote_provider(token) is False

    def test_remote_request_exception(self, mock_certify_post):
        token = Token(token="remote_token")
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            mock_certify_post.side_effect = Exception("timeout")
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
