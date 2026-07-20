"""Tests for authentication & authorization logic in services/auth.py.

Covers password hashing, JWT decoding, token certification, minting rules,
username validation, and the is_permitted authorization gate.
"""

import datetime

import jwt
import pytest

import app.settings as settings
from app.endpoints.auth import kosher
from app.models.auth import Token, TokenData
from app.services.auth import (
    anon_token,
    can_mint,
    certify,
    decode_token,
    get_password_hash,
    is_permitted,
    pwd_context,
    verify_password,
)

# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------


class TestPasswordHashing:
    def test_verify_correct_password(self, mocker):
        mocker.patch.object(pwd_context, "verify", return_value=True)
        assert verify_password("secret123", "fake_hash") is True

    def test_verify_wrong_password(self, mocker):
        mocker.patch.object(pwd_context, "verify", return_value=False)
        assert verify_password("wrong", "fake_hash") is False

    def test_hash_delegates_to_context(self, mocker):
        mocker.patch.object(pwd_context, "hash", return_value="hashed")
        assert get_password_hash("pw") == "hashed"

    def test_verify_delegates_to_context(self, mocker):
        mocker.patch.object(pwd_context, "verify", return_value=True)
        assert verify_password("pw", "h") is True


# ---------------------------------------------------------------------------
# kosher  –  username validation
# ---------------------------------------------------------------------------


class TestKosher:
    def test_alphanumeric_ok(self):
        assert kosher("alice123") is True

    def test_dash_ok(self):
        assert kosher("alice-bob") is True

    def test_empty_ok(self):
        """Empty string is technically kosher (the regex allows it)."""
        assert kosher("") is True

    def test_underscore_rejected(self):
        assert kosher("alice_bob") is False

    def test_space_rejected(self):
        assert kosher("alice bob") is False

    def test_special_chars_rejected(self):
        assert kosher("alice@bob") is False

    def test_slash_rejected(self):
        assert kosher("alice/bob") is False

    def test_dot_rejected(self):
        assert kosher("alice.bob") is False


# ---------------------------------------------------------------------------
# decode_token
# ---------------------------------------------------------------------------


class TestDecodeToken:
    def test_decode_without_verification(self):
        payload = {
            "username": "u1",
            "site": "s1",
            "target": "t1",
            "provider": "p1",
            "expires": "2099-01-01T00:00:00",
        }
        token = jwt.encode(payload, "any-key", algorithm="HS256")
        data = decode_token(token, private_key=False)
        assert data.username == "u1"
        assert data.site == "s1"
        assert data.target == "t1"
        assert data.provider == "p1"

    def test_decode_with_private_key(self, valid_token, valid_token_payload):
        data = decode_token(valid_token, private_key=True)
        assert data.username == valid_token_payload["username"]
        assert data.provider == valid_token_payload["provider"]

    def test_decode_wrong_key_raises(self):
        token = jwt.encode({"sub": "x"}, "wrong-key", algorithm="HS256")
        with pytest.raises(Exception):
            decode_token(token, private_key=True)


# ---------------------------------------------------------------------------
# can_mint
# ---------------------------------------------------------------------------


class TestCanMint:
    def test_same_username_service_manager(self, service_manager_token):
        sub_data = decode_token(service_manager_token)
        mint_data = TokenData(
            username="testuser",
            site="myapp.example.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        assert can_mint(sub_data, mint_data) is True

    def test_same_username_same_site(self):
        sub = TokenData(
            username="u",
            site="same.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        mint = TokenData(
            username="u",
            site="same.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        assert can_mint(sub, mint) is True

    def test_different_username_raises(self):
        sub = TokenData(
            username="alice",
            site="auth.localhost",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        mint = TokenData(
            username="bob",
            site="auth.localhost",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        with pytest.raises(Exception):
            can_mint(sub, mint)

    def test_no_site_raises(self):
        sub_data = decode_token(
            jwt.encode(
                {
                    "username": "u",
                    "site": None,
                    "target": settings.PROVIDER,
                    "provider": settings.PROVIDER,
                    "expires": "2099-01-01T00:00:00",
                },
                settings.PRIVATE_KEY,
                algorithm=settings.ALGORITHM,
            )
        )
        mint = TokenData(
            username="u",
            site="x.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        with pytest.raises(Exception):
            can_mint(sub_data, mint)

    def test_different_site_not_manager_raises(self):
        sub = TokenData(
            username="u",
            site="other.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        mint = TokenData(
            username="u",
            site="different.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        with pytest.raises(Exception):
            can_mint(sub, mint)

    def test_remote_provider_raises(self):
        sub = TokenData(
            username="u",
            site="auth.localhost",
            target=settings.PROVIDER,
            provider="remote.provider",
        )
        mint = TokenData(
            username="u",
            site="x.com",
            target=settings.PROVIDER,
            provider=settings.PROVIDER,
        )
        with pytest.raises(Exception):
            can_mint(sub, mint)


# ---------------------------------------------------------------------------
# certify
# ---------------------------------------------------------------------------


class TestCertify:
    def test_valid_token_certifies(self, valid_token):
        assert certify(Token(token=valid_token)) is True

    def test_expired_token_fails(self, expired_token):
        with pytest.raises(Exception):
            certify(Token(token=expired_token))

    def test_none_token_certifies_as_anon(self):
        """A None token should certify as anonymous."""
        assert certify(Token(token=None)) is True

    def test_bad_token_fails(self):
        with pytest.raises(Exception):
            certify(Token(token="not-a-jwt"))

    def test_wrong_provider_fails(self):
        """Token from a remote provider should fail local certification."""
        payload = {
            "username": "u",
            "site": "s",
            "target": "remote.provider",
            "provider": "remote.provider",
            "expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat(),
        }
        token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(Exception):
            certify(Token(token=token))

    def test_anon_token_certifies(self, anon_token):
        assert certify(Token(token=anon_token)) is True


# ---------------------------------------------------------------------------
# is_permitted
# ---------------------------------------------------------------------------


class TestIsPermitted:
    def test_none_token_is_anon(self, mock_db_with_term):
        """A request with no token acts as anon: the .* whitelist grants read."""
        result = is_permitted(Token(token=None), "owner", "myapi", "read")
        assert result is True

    def test_valid_token_with_permission(self, valid_token, mock_db_with_term):
        """A certified token with whitelist entry should be permitted."""
        result = is_permitted(Token(token=valid_token), "owner", "myapi", "read")
        assert result is True

    def test_banned_user_denied(self, valid_token, mock_db_with_term):
        """If the decoded username matches a blacklist entry, deny."""
        import jwt as _jwt

        payload = {
            "username": "banneduser",
            "site": "auth.localhost",
            "target": settings.PROVIDER,
            "provider": settings.PROVIDER,
            "expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat(),
        }
        banned_token = _jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        result = is_permitted(Token(token=banned_token), "owner", "myapi", "read")
        assert result is False

    def test_wrong_target_denied(self, mock_db_with_term):
        """Token not targeted to this provider should be denied."""
        payload = {
            "username": "u",
            "site": "s.com",
            "target": "wrong.provider",
            "provider": settings.PROVIDER,
            "expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat(),
        }
        token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        result = is_permitted(Token(token=token), "owner", "myapi", "read")
        assert result is False

    def test_no_target_owner_allowed(self, mock_db_with_term):
        """If target is None and username == owner with local provider, allow."""
        payload = {
            "username": "owner",
            "site": "s.com",
            "target": None,
            "provider": settings.PROVIDER,
            "expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat(),
        }
        token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        result = is_permitted(Token(token=token), "owner", "myapi", "read")
        assert result is True

    def test_no_target_non_owner_denied(self, mock_db_with_term):
        """If target is None and username != owner, deny."""
        payload = {
            "username": "someone",
            "site": "s.com",
            "target": None,
            "provider": settings.PROVIDER,
            "expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat(),
        }
        token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        result = is_permitted(Token(token=token), "owner", "myapi", "read")
        assert result is False


# ---------------------------------------------------------------------------
# anon_token
# ---------------------------------------------------------------------------


class TestAnonToken:
    def test_returns_anon(self):
        data = anon_token()
        assert data.username == "anon"
        assert data.provider == settings.PROVIDER
        assert data.target == settings.PROVIDER
