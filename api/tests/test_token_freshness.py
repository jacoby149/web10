"""D-01/D-02: signed principals must be fresh before reads/writes or code minting."""

from datetime import UTC, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.services.auth as auth
import app.settings as settings
from app.main import app
from app.v3.endpoints import auth_helper
from app.v3.endpoints.access import _check_token
from app.v3.services import clickhouse as ch

NOW = datetime(2030, 1, 2, tzinfo=UTC)
MISSING = object()
BAD_EXPIRIES = [MISSING, None, "", "not-a-date", 42, False, {}, [], "2020-01-01T00:00:00", NOW.isoformat()]
FUTURE = NOW + timedelta(days=1)


@pytest.fixture(autouse=True)
def isolated_key_and_clock():
    with (
        patch.object(settings, "PRIVATE_KEY", "synthetic-freshness-signing-key-at-least-32-bytes"),
        patch.object(auth, "datetime", wraps=datetime) as clock,
    ):
        clock.now.return_value = NOW
        clock.utcnow.return_value = NOW.replace(tzinfo=None)
        yield


def token(expires=MISSING, **extra):
    claims = {"username": "alice", "provider": settings.PROVIDER, "site": "web10", **extra}
    if expires is not MISSING:
        claims["expires"] = expires
    return jwt.encode(claims, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    # Certify's bare TOKEN exception is mapped by the outer HTTP error handler.
    with patch.object(ch, "client"), TestClient(app, raise_server_exceptions=False) as api:
        yield api


@pytest.mark.parametrize("expires", BAD_EXPIRIES)
@pytest.mark.parametrize("helper", [auth_helper.user, auth_helper.user_or_anon, auth_helper.client_id_of])
def test_signed_bad_expiry_cannot_produce_principal_or_delegation(expires, helper):
    with pytest.raises(jwt.InvalidTokenError):
        helper(SimpleNamespace(token=token(expires, client_id="fixture-client")))


@pytest.mark.parametrize("expires", BAD_EXPIRIES)
def test_session_oracle_rejects_bad_expiry_before_store_lookups(client, expires):
    with patch.object(ch, "get_user") as user, patch.object(ch, "get_app_permissions") as contract:
        response = client.post("/v3/access/verify", json={"token": token(expires), "services": ["posts"]})
    assert response.status_code == 200
    result = response.json()
    assert result["token"] == (
        "expired" if isinstance(expires, str) and expires.startswith(("2020", "2030")) else "invalid"
    )
    assert result["status"] == "invalid" and result["actions"] == ["reauth"]
    assert result["username"] is None and result["provider"] is None
    user.assert_not_called()
    contract.assert_not_called()


@pytest.mark.parametrize("expires", ["2020-01-01T00:00:00", None, "not-a-date"])
@pytest.mark.parametrize("route", ["set-email", "set_recovery_phone", "oauth/authorize"])
def test_http_rejects_stale_or_invalid_tokens_before_mutation(client, expires, route):
    with (
        patch.object(ch, "set_email") as email,
        patch.object(ch, "change_phone") as phone,
        patch.object(
            ch, "get_oauth_client", return_value={"client_id": "fixture", "redirect_uris": ["https://app.invalid/cb"]}
        ),
        patch.object(ch, "store_oauth_code") as code,
    ):
        body = {
            "token": token(expires),
            "email": "alice@example.invalid",
            "phone": "+15551234567",
            "client_id": "fixture",
            "redirect_uri": "https://app.invalid/cb",
        }
        response = client.post(f"/v3/{route}", json=body)
    assert response.status_code == 401 and response.json() == {"detail": "incorrect token"}
    email.assert_not_called()
    phone.assert_not_called()
    code.assert_not_called()


@pytest.mark.parametrize(
    "expires",
    [
        FUTURE.replace(tzinfo=None).isoformat(),
        FUTURE.isoformat().replace("+00:00", "Z"),
        (NOW + timedelta(microseconds=1)).astimezone(timezone(timedelta(hours=5, minutes=30))).isoformat(),
        FUTURE.astimezone(timezone(timedelta(hours=-7))).isoformat(),
    ],
)
def test_valid_naive_utc_and_offset_tokens_keep_principal_and_session_behavior(client, expires):
    encoded = token(expires)
    data = SimpleNamespace(token=encoded)
    assert auth.decode_token(encoded, private_key=True).expires == expires
    assert auth_helper.user(data) == auth_helper.user_or_anon(data) == "alice"
    assert auth_helper.client_id_of(data) is None
    assert auth.certify(data) is True
    with patch.object(ch, "get_user", return_value={"username": "alice"}):
        result = client.post("/v3/access/verify", json={"token": encoded}).json()
    assert result["token"] == "valid" and result["status"] == "ok"
    assert result["username"] == "alice" and result["actions"] == []


@pytest.mark.parametrize("expires", [MISSING, None, "2020-01-01T00:00:00", "not-a-date", 42])
def test_anonymous_custom_expiry_exemption_is_preserved(expires):
    data = SimpleNamespace(token=token(expires, username="anon"))
    assert auth_helper.user_or_anon(data) == "anon"
    assert auth.certify(data) is True
    assert auth_helper.user_or_anon(SimpleNamespace(token=None)) == "anon"


@pytest.mark.parametrize("expires", BAD_EXPIRIES)
def test_unsigned_metadata_decode_is_not_changed_or_promoted_to_authority(expires):
    decoded = auth.decode_token(token(expires), private_key=False)
    assert decoded.username == "alice"
    assert decoded.expires == (None if expires is MISSING else expires)


def test_invalid_signature_is_still_rejected_before_freshness():
    forged = jwt.encode(
        {"username": "alice", "expires": FUTURE.isoformat()},
        "different-synthetic-key-at-least-32-bytes",
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(jwt.InvalidSignatureError):
        auth.decode_token(forged, private_key=True)


@pytest.mark.parametrize("username", ["alice", "anon"])
def test_standard_jwt_exp_is_still_independently_enforced(username):
    with pytest.raises(jwt.ExpiredSignatureError):
        auth.decode_token(token(FUTURE.isoformat(), username=username, exp=0), private_key=True)


def test_expired_token_cannot_reach_profile_read(client):
    with patch.object(ch, "get_user_profile", return_value={"synthetic-private": True}) as read:
        response = client.post("/v3/profile", json={"token": token("2020-01-01T00:00:00")})
    assert response.status_code == 401
    read.assert_not_called()


@pytest.mark.parametrize("route", ["set-email", "set_recovery_phone", "oauth/authorize"])
def test_valid_token_still_reaches_intended_mutation(client, route):
    with (
        patch.object(ch, "set_email") as email,
        patch.object(ch, "change_phone") as phone,
        patch.object(
            ch, "get_oauth_client", return_value={"client_id": "fixture", "redirect_uris": ["https://app.invalid/cb"]}
        ),
        patch.object(ch, "store_oauth_code") as code,
    ):
        body = {
            "token": token(FUTURE.isoformat()),
            "email": "alice@example.invalid",
            "phone": "+15551234567",
            "client_id": "fixture",
            "redirect_uri": "https://app.invalid/cb",
            "state": "fixture-state",
        }
        response = client.post(f"/v3/{route}", json=body)
    assert response.status_code == 200
    assert (email.call_count, phone.call_count, code.call_count) == {
        "set-email": (1, 0, 0),
        "set_recovery_phone": (0, 1, 0),
        "oauth/authorize": (0, 0, 1),
    }[route]
    if route == "oauth/authorize":
        assert response.json()["state"] == "fixture-state"
        assert code.call_args.args[2] == "alice"


def test_valid_delegation_marker_and_expired_visit_attribution():
    data = SimpleNamespace(token=token(FUTURE.isoformat(), client_id="fixture-client"))
    assert auth_helper.client_id_of(data) == "fixture-client"
    with patch.object(ch, "get_oauth_client", return_value={"client_id": "fixture-client"}):
        assert auth.certify(data) is True
    assert ch._verified_username(token("2020-01-01T00:00:00")) is None
    assert ch._verified_username(token(FUTURE.isoformat())) == "alice"


@pytest.mark.parametrize("offset", [-12, -7, 0, 5.5, 14])
@pytest.mark.parametrize("microseconds", [-1, 0, 1])
def test_absolute_deadline_and_oracle_classification_across_offsets(offset, microseconds):
    expires = (NOW + timedelta(microseconds=microseconds)).astimezone(timezone(timedelta(hours=offset)))
    encoded = token(expires.isoformat())
    if microseconds <= 0:
        with pytest.raises(jwt.ExpiredSignatureError):
            auth.decode_token(encoded, private_key=True)
        assert _check_token(encoded) == ("expired", None, None)
    else:
        assert auth.decode_token(encoded, private_key=True).username == "alice"
        assert _check_token(encoded) == ("valid", "alice", settings.PROVIDER)


def test_future_standard_exp_does_not_replace_required_custom_expiry():
    standard_exp = int((datetime.now(UTC) + timedelta(days=1)).timestamp())
    with pytest.raises(jwt.InvalidTokenError):
        auth.decode_token(token(exp=standard_exp), private_key=True)
