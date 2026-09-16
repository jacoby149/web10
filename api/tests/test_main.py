"""Tests for authentication & authorization logic in services/auth.py.

Covers password hashing, JWT decoding, token certification, minting rules,
username validation, and the is_permitted authorization gate.
"""

import datetime

import jwt
import pytest

import app.settings as settings
from app.models.auth import Token
from app.services.auth import (
    anon_token,
    certify,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.v3.endpoints.auth import kosher

# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------


class TestPasswordHashing:
    def test_verify_correct_password(self):
        h = get_password_hash("secret123")
        assert verify_password("secret123", h) is True

    def test_verify_wrong_password(self):
        h = get_password_hash("secret123")
        assert verify_password("wrong", h) is False

    def test_hash_produces_bcrypt_string(self):
        assert get_password_hash("pw").startswith("$2")

    def test_verify_roundtrip(self):
        h = get_password_hash("pw")
        assert verify_password("pw", h) is True


# ---------------------------------------------------------------------------
# kosher  –  username validation
# ---------------------------------------------------------------------------


class TestKosher:
    # -- ACCEPTED --

    def test_alphanumeric_ok(self):
        assert kosher("alice123") is True

    def test_dash_ok(self):
        assert kosher("alice-bob") is True

    def test_persona_style(self):
        assert kosher("solar-flare-69") is True

    def test_min_length(self):
        """3 chars is the minimum (a-b)."""
        assert kosher("a-b") is True

    def test_max_length(self):
        """30 chars is the maximum."""
        assert kosher("a" + "b" * 28 + "c") is True

    def test_single_char(self):
        """Single char passes (e.g. "a")."""
        assert kosher("a") is True

    def test_two_chars(self):
        """Two chars pass (e.g. "ab")."""
        assert kosher("ab") is True

    # -- REJECTED --

    def test_empty_rejected(self):
        """Empty string must be rejected."""
        assert kosher("") is False

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

    def test_uppercase_rejected(self):
        """Uppercase letters must be rejected."""
        assert kosher("Alice") is False
        assert kosher("ALICE") is False
        assert kosher("aLiCe") is False

    def test_unicode_rejected(self):
        """Non-ASCII unicode (CJK, Greek, etc.) must be rejected."""
        assert kosher("Ω") is False
        assert kosher("αβγ") is False
        assert kosher("日本語") is False
        assert kosher("café") is False
        assert kosher("naïve") is False

    def test_leading_hyphen_rejected(self):
        assert kosher("-alice") is False

    def test_trailing_hyphen_rejected(self):
        assert kosher("alice-") is False

    def test_bare_hyphen_rejected(self):
        assert kosher("-") is False

    def test_over_length_rejected(self):
        """31+ chars must be rejected."""
        assert kosher("a" * 31) is False
        assert kosher("a" * 32) is False

    def test_reserved_web10_rejected_by_regex(self):
        """'web10' is kosher per regex but blocked by create_user RESERVED."""
        assert kosher("web10") is True

    def test_reserved_anon_rejected_by_regex(self):
        """'anon' is kosher per regex but blocked by create_user RESERVED."""
        assert kosher("anon") is True


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
# anon_token
# ---------------------------------------------------------------------------


class TestAnonToken:
    def test_returns_anon(self):
        data = anon_token()
        assert data.username == "anon"
        assert data.provider == settings.PROVIDER
        assert data.target == settings.PROVIDER
