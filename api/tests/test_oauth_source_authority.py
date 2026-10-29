"""L1-OAUTH-SOURCE-01: authorization must honor source certification."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.models.auth import Token
from app.services.auth import certify

TARGET = {"client_id": "target", "redirect_uris": ["https://target.example/callback"]}


def signed(*, signing_key=None, **claims):
    payload = {
        "username": "alice",
        "provider": settings.PROVIDER,
        "expires": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    return jwt.encode(payload | claims, signing_key or settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def authorize(token):
    return TestClient(app, raise_server_exceptions=False).post(
        "/v3/oauth/authorize",
        json={
            "token": token,
            "client_id": " TARGET ",
            "redirect_uri": TARGET["redirect_uris"][0],
            "state": "caller-state",
        },
    )


@pytest.mark.parametrize("source_id", ["missing-source", "revoked-source"])
def test_uncertifiable_source_cannot_mint_code(source_id):
    token = signed(client_id=source_id)
    with (
        patch(
            "app.v3.services.clickhouse.get_oauth_client", side_effect=lambda key: TARGET if key == "target" else None
        ),
        patch("app.v3.services.clickhouse.store_oauth_code") as store,
        patch("app.middleware.ch.client.insert"),
    ):
        with pytest.raises(Exception, match="^TOKEN$"):
            certify(Token(token=token))
        response = authorize(token)
    assert response.status_code == 401
    assert "code" not in response.json()
    store.assert_not_called()


@pytest.mark.parametrize("delegated", [False, True])
def test_certifiable_source_preserves_code_binding(delegated):
    token = signed(**({"client_id": "active-source"} if delegated else {}))
    with (
        patch(
            "app.v3.services.clickhouse.get_oauth_client",
            side_effect=lambda key: TARGET if key == "target" else {"client_id": "active-source"},
        ) as lookup,
        patch("app.v3.services.clickhouse.get_app_permissions") as permissions,
        patch("app.v3.services.clickhouse.has_permission") as permitted,
        patch("app.v3.services.clickhouse.store_oauth_code") as store,
        patch("app.middleware.ch.client.insert"),
    ):
        response = authorize(token)
    assert response.status_code == 200
    result = response.json()
    assert result["state"] == "caller-state"
    assert len(result["code"]) >= 43
    store.assert_called_once_with(result["code"], "target", "alice", TARGET["redirect_uris"][0], 60)
    assert ("active-source" in [call.args[0] for call in lookup.call_args_list]) is delegated
    permissions.assert_not_called()
    permitted.assert_not_called()


def test_source_revocation_between_requests_is_observed():
    source_active = True

    def lookup(key):
        if key == "target":
            return TARGET
        return {"client_id": "source"} if source_active else None

    token = signed(client_id="source")
    with (
        patch("app.v3.services.clickhouse.get_oauth_client", side_effect=lookup),
        patch("app.v3.services.clickhouse.store_oauth_code") as store,
        patch("app.middleware.ch.client.insert"),
    ):
        assert authorize(token).status_code == 200
        source_active = False
        assert authorize(token).status_code == 401
    assert store.call_count == 1


@pytest.mark.parametrize(
    "claims",
    [
        {"username": "anon"},
        {"username": None},
        {"expires": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
        {"expires": "malformed"},
        {"provider": "other-provider.example"},
    ],
)
def test_invalid_source_never_writes_code(claims):
    with (
        patch("app.v3.services.clickhouse.get_oauth_client", return_value=TARGET),
        patch("app.v3.services.clickhouse.store_oauth_code") as store,
        patch("app.middleware.ch.client.insert"),
    ):
        response = authorize(signed(**claims))
    assert response.status_code == 401
    store.assert_not_called()


@pytest.mark.parametrize("token", ["not-a-jwt", signed(signing_key="synthetic-wrong-signing-key-at-least-32-bytes")])
def test_unverified_source_never_writes_code(token):
    with (
        patch("app.v3.services.clickhouse.get_oauth_client", return_value=TARGET),
        patch("app.v3.services.clickhouse.store_oauth_code") as store,
        patch("app.middleware.ch.client.insert"),
    ):
        response = authorize(token)
    assert response.status_code == 401
    store.assert_not_called()
