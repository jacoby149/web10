"""B-3-DEFAULT: verified by default; deliberate metadata is not authority."""

from inspect import signature
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest

import app.services.auth as auth
import app.settings as settings
from app.endpoints import system
from app.models.auth import Token
from app.v3.services import bugbot, clickhouse


@pytest.fixture(autouse=True)
def synthetic_key(monkeypatch):
    monkeypatch.setattr(settings, "PRIVATE_KEY", "synthetic-default-signing-key-at-least-32-bytes")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")


@pytest.fixture
def claims():
    return {"username": "alice", "provider": settings.PROVIDER, "site": "web10", "expires": "2099-01-01T00:00:00"}


@pytest.mark.parametrize("verification", [{}, {"private_key": True}], ids=["default", "explicit-true"])
@pytest.mark.parametrize(
    "attack", ["wrong-key", "none", "expired", "missing", "null", "malformed", "exp-user", "exp-anon"]
)
def test_rejects_unverified_or_stale_claims(claims, attack, verification):
    key, algorithm = settings.PRIVATE_KEY, settings.ALGORITHM
    error = jwt.InvalidTokenError
    if attack == "wrong-key":
        claims["username"] = "forged-victim"
        key = "attacker-controlled-synthetic-key-at-least-32-bytes"
        error = jwt.InvalidSignatureError
    elif attack == "none":
        key, algorithm = None, "none"
        error = jwt.InvalidAlgorithmError
    elif attack == "missing":
        del claims["expires"]
    elif attack in ("expired", "null", "malformed"):
        claims["expires"] = {"expired": "2000-01-01T00:00:00", "null": None, "malformed": "invalid"}[attack]
    else:
        claims.update(exp=0, username="anon" if attack == "exp-anon" else "alice")
        error = jwt.ExpiredSignatureError
    encoded = jwt.encode(claims, key, algorithm=algorithm)
    with pytest.raises(error):
        auth.decode_token(encoded, **verification)


@pytest.mark.parametrize("username,expires", [("alice", "2099-01-01T00:00:00"), ("anon", None), ("anon", "invalid")])
def test_default_accepts_local_and_anonymous_custom_expiry_exemption(claims, username, expires):
    claims.update(username=username, expires=expires)
    assert auth.decode_token(jwt.encode(claims, settings.PRIVATE_KEY, algorithm="HS256")).username == username


@pytest.mark.parametrize("expires", [None, "invalid", "2000-01-01T00:00:00", "2099-01-01T00:00:00"])
def test_explicit_false_keeps_wrong_key_and_expired_metadata(claims, expires):
    claims.update(expires=expires, exp=0)
    encoded = jwt.encode(claims, "metadata-only-synthetic-foreign-key-at-least-32-bytes", algorithm="HS256")
    decoded = auth.decode_token(encoded, private_key=False)
    assert (decoded.username, decoded.expires) == ("alice", expires)


def test_existing_signature_defaults_to_verification():
    assert signature(auth.decode_token).parameters["private_key"].default is True


@pytest.mark.parametrize("status", [200, 401])
def test_remote_helper_keeps_unsigned_destination_metadata(claims, status):
    claims.update(provider="https://remote.example.invalid", expires="2000-01-01T00:00:00", exp=0)
    encoded = jwt.encode(claims, "remote-metadata-synthetic-key-at-least-32-bytes", algorithm="HS256")
    request = Token(token=encoded)
    with patch.object(auth.requests, "post", return_value=SimpleNamespace(status_code=status)) as post:
        assert auth.certify_with_remote_provider(request) is (status == 200)
    post.assert_called_once_with("https://remote.example.invalid/certify", json=request.model_dump(), timeout=10)


@pytest.mark.parametrize("username,attribution", [("alice", "alice"), ("anon", "")])
def test_public_bug_handler_keeps_untrusted_attribution(claims, username, attribution):
    claims.update(username=username, expires="2000-01-01T00:00:00", exp=0)
    encoded = jwt.encode(claims, "bug-metadata-synthetic-foreign-key-at-least-32-bytes", algorithm="HS256")
    with (
        patch.object(system.ch, "submit_bug_report", return_value={"report_id": "synthetic"}) as store,
        patch.object(bugbot, "deliver_bug_report") as deliver,
    ):
        assert system.submit_bug_report({"description": "synthetic report", "token": encoded}) == {
            "report_id": "synthetic"
        }
    assert store.call_args.kwargs["username"] == attribution
    assert deliver.call_args.args[0]["username"] == attribution


@pytest.mark.parametrize("gate", ["provider", "missing-client", "active-client"])
def test_default_decode_is_not_provider_or_client_certification(claims, gate):
    if gate == "provider":
        claims["provider"] = "foreign.example.invalid"
    else:
        claims["client_id"] = "synthetic-client"
    encoded = jwt.encode(claims, settings.PRIVATE_KEY, algorithm="HS256")
    assert auth.decode_token(encoded).username == "alice"
    with patch.object(clickhouse, "get_oauth_client", return_value={} if gate == "active-client" else None) as lookup:
        if gate == "active-client":
            assert auth.certify(Token(token=encoded)) is True
        else:
            with pytest.raises(Exception, match="^TOKEN$"):
                auth.certify(Token(token=encoded))
    if gate == "provider":
        lookup.assert_not_called()
    else:
        lookup.assert_called_once_with("synthetic-client")
