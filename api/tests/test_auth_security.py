"""Auth trust boundary: verified local identities, expiry and key migration."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.settings as settings
from app.models.auth import Token
from app.services.auth import decode_token, encode_token, public_jwks
from app.v3.endpoints import auth, recovery
from app.v3.endpoints.access import _check_token
from app.v3.endpoints.auth_helper import user, user_or_anon


@pytest.fixture
def local_key(monkeypatch):
    monkeypatch.setattr(settings, "PRIVATE_KEY", "test-only-secret-not-for-deployment-123456")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")
    monkeypatch.setattr(settings, "AUTH_SIGNING_KEY", "")
    monkeypatch.setattr(settings, "AUTH_LEGACY_VERIFY_UNTIL", "")


@pytest.fixture
def rsa_key():
    return (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        .decode()
    )


def claims(**overrides):
    return dict(
        username="alice",
        credential_kind="self",
        provider=settings.PROVIDER,
        site="web10",
        expires=(datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        **overrides,
    )


@pytest.mark.parametrize("value", [None, "bad", "", 123, "2000-01-01T00:00:00", "2000-01-01T00:00:00Z"])
def test_bad_expiry_all_live_helpers(local_key, value):
    payload = claims()
    payload["expires"] = value
    token = encode_token(payload)
    for check in (decode_token, lambda t: user(Token(token=t)), lambda t: user_or_anon(Token(token=t))):
        with pytest.raises(jwt.InvalidTokenError):
            check(token)
    assert _check_token(token)[0] in ("invalid", "expired")


def test_missing_expiry(local_key):
    payload = claims()
    del payload["expires"]
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(encode_token(payload))


@pytest.mark.parametrize("field", ["provider", "iss"])
def test_foreign_issuer_cannot_impersonate_local_user(local_key, field):
    payload = claims()
    payload[field] = "evil.example"
    with patch("requests.get") as get, patch("requests.post") as post:
        with pytest.raises(jwt.InvalidTokenError):
            user(Token(token=jwt.encode(payload, settings.PRIVATE_KEY, algorithm="HS256")))
        get.assert_not_called()
        post.assert_not_called()


def test_timezone_and_legacy_naive_expiry(local_key):
    for expiry in ("2099-01-01T00:00:00", "2099-01-01T00:00:00Z", "2099-01-01T00:00:00+09:00"):
        payload = claims()
        payload["expires"] = expiry
        assert decode_token(encode_token(payload)).username == "alice"


def test_rsa_roundtrip_public_jwks_and_endpoint(local_key, rsa_key, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SIGNING_KEY", rsa_key)
    token = encode_token(claims())
    assert decode_token(token).username == "alice"
    app = FastAPI()
    app.include_router(auth.router, prefix="/v3")
    jwks = TestClient(app).get("/v3/.well-known/jwks.json").json()
    assert "d" not in jwks["keys"][0]
    key = jwt.PyJWK.from_dict(jwks["keys"][0]).key
    assert jwt.decode(token, key, algorithms=["RS256"])["username"] == "alice"
    assert public_jwks() == jwks


def test_bounded_dual_verify(local_key, rsa_key, monkeypatch):
    old = encode_token(claims())
    monkeypatch.setattr(settings, "AUTH_SIGNING_KEY", rsa_key)
    for cutoff in ("", "bad", "2000-01-01T00:00:00Z"):
        monkeypatch.setattr(settings, "AUTH_LEGACY_VERIFY_UNTIL", cutoff)
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(old)
    monkeypatch.setattr(settings, "AUTH_LEGACY_VERIFY_UNTIL", "2099-01-01T00:00:00Z")
    assert decode_token(old).username == "alice"
    assert jwt.get_unverified_header(encode_token(claims()))["alg"] == "RS256"


def test_unknown_kid_and_algorithm_confusion(local_key, rsa_key, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SIGNING_KEY", rsa_key)
    bad = jwt.encode(claims(), rsa_key, algorithm="RS256", headers={"kid": "attacker", "jku": "http://localhost/"})
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(bad)
    public = jwt.PyJWK.from_dict(public_jwks()["keys"][0]).key.public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    forged = jwt.encode(claims(), public, algorithm="HS256")
    monkeypatch.setattr(settings, "AUTH_LEGACY_VERIFY_UNTIL", "2099-01-01T00:00:00Z")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(forged)


def test_unconfigured_keys_fail_closed(local_key, monkeypatch):
    token = encode_token(claims())
    monkeypatch.setattr(settings, "PRIVATE_KEY", "")
    with pytest.raises(RuntimeError):
        encode_token(claims())
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token)


def test_published_old_default_is_not_a_migration_credential(local_key, monkeypatch, rsa_key):
    token = jwt.encode(claims(), "8cbec8.....", algorithm="HS256")
    monkeypatch.setattr(settings, "PRIVATE_KEY", "8cbec8.....")
    with pytest.raises(RuntimeError):
        encode_token(claims())
    monkeypatch.setattr(settings, "AUTH_SIGNING_KEY", rsa_key)
    monkeypatch.setattr(settings, "AUTH_LEGACY_VERIFY_UNTIL", "2099-01-01T00:00:00Z")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token)


@pytest.mark.parametrize(
    "field,value",
    [("username", None), ("username", 1), ("username", ""), ("target", "foreign.example"), ("purpose", "recovery")],
)
def test_invalid_session_claims(local_key, field, value):
    payload = claims()
    payload[field] = value
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(encode_token(payload))


def test_recovery_requires_expiry_and_cannot_be_session(local_key):
    token = recovery._mint_verify_token("alice@example.com", "email")
    assert recovery._check_verify_token(token)["contact"] == "alice@example.com"
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token)
    payload = dict(purpose="recovery", contact="alice@example.com", kind="email")
    with pytest.raises(Exception):
        recovery._check_verify_token(encode_token(payload))


def test_login_and_recovery_mint_asymmetric(local_key, rsa_key, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SIGNING_KEY", rsa_key)
    with patch("app.v3.endpoints.auth.ch.authenticate_user", return_value=True):
        from app.v3.models import Login

        token = auth.login(Login(username="Alice", password="secret"))["token"]
    assert decode_token(token).username == "alice"
    assert decode_token(recovery._mint_login_token("alice")).username == "alice"
    assert recovery._check_verify_token(recovery._mint_verify_token("alice@example.com", "email"))["kind"] == "email"
