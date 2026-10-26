"""Tests for OAuth 2.0 client registration (D92, bite O1).

The client registry is the foundation for the delegated-access layer: one row
per *app* (not per user), storing the client_id, its secret, the display name,
and the exact-match redirect URIs. Admin-only registration; the consent flow
(O5) looks clients up by id without the secret.

Uses a mocked clickhouse-connect client — no real ClickHouse needed.
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.services import clickhouse as ch

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_result_rows(rows):
    mock = MagicMock()
    mock.result_rows = rows
    return mock


def _patch_client():
    mock_client = MagicMock()
    return patch.object(ch, "client", mock_client)


def _make_token(username="testuser", **extra):
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


# ---------------------------------------------------------------------------
# Schema self-heal
# ---------------------------------------------------------------------------


class TestEnsureAppsSchema:
    def test_creates_oauth_clients_for_pre_existing_volumes(self):
        with _patch_client() as mock_client:
            ch.ensure_apps_schema()
        commands = [c[0][0] for c in mock_client.command.call_args_list]
        assert any("CREATE TABLE IF NOT EXISTS oauth_clients" in c for c in commands)


# ---------------------------------------------------------------------------
# Service layer
# ---------------------------------------------------------------------------


class TestAddOauthClient:
    def test_inserts_row_and_returns_secret(self):
        with _patch_client() as mock_client:
            result = ch.add_oauth_client("muse-connector", "secret123", "Muse", ["https://muse.example.com/callback"])
        # One positional insert: [client_id, secret, name, uris, now, now, 0]
        args = mock_client.insert.call_args[0]
        assert args[0] == "oauth_clients"
        row = args[1][0]
        assert row[0] == "muse-connector"
        assert row[1] == "secret123"
        assert row[2] == "Muse"
        assert row[3] == ["https://muse.example.com/callback"]
        assert row[6] == 0  # not deleted
        assert result["client_id"] == "muse-connector"
        assert result["client_secret"] == "secret123"
        assert result["redirect_uris"] == ["https://muse.example.com/callback"]


class TestGetOauthClient:
    def test_returns_active_client(self):
        with _patch_client() as mock_client:
            created = datetime(2026, 1, 1)
            mock_client.query.return_value = _mock_result_rows(
                [("muse-connector", "secret123", "Muse", ["https://muse.example.com/callback"], created)]
            )
            result = ch.get_oauth_client("muse-connector")
        assert result["client_id"] == "muse-connector"
        assert result["client_secret"] == "secret123"
        assert result["client_name"] == "Muse"
        assert result["redirect_uris"] == ["https://muse.example.com/callback"]

    def test_returns_none_when_absent_or_tombstoned(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.get_oauth_client("ghost") is None


class TestListOauthClients:
    def test_never_returns_secret(self):
        with _patch_client() as mock_client:
            created = datetime(2026, 1, 1)
            mock_client.query.return_value = _mock_result_rows(
                [("muse-connector", "Muse", ["https://muse.example.com/callback"], created)]
            )
            result = ch.list_oauth_clients()
        assert len(result) == 1
        assert result[0]["client_id"] == "muse-connector"
        assert result[0]["client_name"] == "Muse"
        assert "client_secret" not in result[0]


class TestRevokeOauthClient:
    def test_tombstones_via_insert_select(self):
        with _patch_client() as mock_client:
            ch.revoke_oauth_client("muse-connector")
        sql = mock_client.command.call_args[0][0]
        assert "INSERT INTO oauth_clients" in sql
        assert "now64(6), 1" in sql  # tombstone: updated_at = now, deleted = 1
        assert mock_client.command.call_args[0][1] == {"client_id": "muse-connector"}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


class TestRegisterEndpoint:
    def test_admin_registers_client(self, client):
        with patch("app.services.config.is_admin", return_value=True), _patch_client():
            resp = client.post(
                "/v3/oauth/clients/register",
                json={
                    "token": _make_token("admin"),
                    "client_id": "muse-connector",
                    "client_name": "Muse",
                    "redirect_uris": ["https://muse.example.com/callback"],
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["client_id"] == "muse-connector"
        assert body["client_name"] == "Muse"
        assert body["redirect_uris"] == ["https://muse.example.com/callback"]
        # The secret is minted (256-bit urlsafe) and returned exactly once.
        assert len(body["client_secret"]) >= 43

    def test_non_admin_rejected(self):
        # raise_server_exceptions=False so the bare Exception("NOT_ADMIN")
        # runs through the production handler (→ 403) instead of re-raising.
        with TestClient(fastapi_app, raise_server_exceptions=False) as tc:
            with patch("app.services.config.is_admin", return_value=False):
                resp = tc.post(
                    "/v3/oauth/clients/register",
                    json={
                        "token": _make_token("randomuser"),
                        "client_id": "muse-connector",
                        "client_name": "Muse",
                        "redirect_uris": ["https://muse.example.com/callback"],
                    },
                )
        assert resp.status_code == 403

    def test_rejects_non_https_redirect_uri(self, client):
        with patch("app.services.config.is_admin", return_value=True), _patch_client():
            resp = client.post(
                "/v3/oauth/clients/register",
                json={
                    "token": _make_token("admin"),
                    "client_id": "muse-connector",
                    "client_name": "Muse",
                    "redirect_uris": ["http://muse.example.com/callback"],
                },
            )
        assert resp.status_code == 401  # exceptions.CRUD


class TestListEndpoint:
    def test_admin_lists_clients_without_secret(self, client):
        with patch("app.services.config.is_admin", return_value=True), _patch_client() as mock_client:
            created = datetime(2026, 1, 1)
            mock_client.query.return_value = _mock_result_rows(
                [("muse-connector", "Muse", ["https://muse.example.com/callback"], created)]
            )
            resp = client.post("/v3/oauth/clients/list", json={"token": _make_token("admin")})
        assert resp.status_code == 200
        clients = resp.json()["clients"]
        assert clients[0]["client_id"] == "muse-connector"
        assert "client_secret" not in clients[0]

    def test_non_admin_rejected(self):
        with TestClient(fastapi_app, raise_server_exceptions=False) as tc:
            with patch("app.services.config.is_admin", return_value=False):
                resp = tc.post("/v3/oauth/clients/list", json={"token": _make_token("randomuser")})
        assert resp.status_code == 403


class TestLookupEndpoint:
    def test_lookup_returns_public_fields(self, client):
        with _patch_client() as mock_client:
            created = datetime(2026, 1, 1)
            mock_client.query.return_value = _mock_result_rows(
                [("muse-connector", "secret123", "Muse", ["https://muse.example.com/callback"], created)]
            )
            resp = client.post("/v3/oauth/clients/lookup", json={"token": _make_token(), "client_id": "muse-connector"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["client_id"] == "muse-connector"
        assert body["client_name"] == "Muse"
        assert body["redirect_uris"] == ["https://muse.example.com/callback"]
        assert "client_secret" not in body

    def test_lookup_missing_client_is_404(self, client):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            resp = client.post("/v3/oauth/clients/lookup", json={"token": _make_token(), "client_id": "ghost"})
        assert resp.status_code == 404


class TestRevokeEndpoint:
    def test_admin_revokes_client(self, client):
        with patch("app.services.config.is_admin", return_value=True), _patch_client() as mock_client:
            resp = client.post(
                "/v3/oauth/clients/revoke", json={"token": _make_token("admin"), "client_id": "muse-connector"}
            )
        assert resp.status_code == 200
        assert resp.json() == {"status": "revoked"}
        sql = mock_client.command.call_args[0][0]
        assert "INSERT INTO oauth_clients" in sql

    def test_non_admin_rejected(self):
        with TestClient(fastapi_app, raise_server_exceptions=False) as tc:
            with patch("app.services.config.is_admin", return_value=False):
                resp = tc.post(
                    "/v3/oauth/clients/revoke", json={"token": _make_token("randomuser"), "client_id": "muse-connector"}
                )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Authorize + token (D92, O5/O6/O7) — the authorization-code flow
# ---------------------------------------------------------------------------


def _client_row(client_id="muse-connector", secret="s3cr3t", name="Muse", uris=None):
    uris = uris or ["https://muse.example.com/callback"]
    return (client_id, secret, name, uris, datetime(2026, 1, 1))


def _utc(*args):
    """Aware-UTC datetime (matches what ClickHouse DateTime64 returns)."""
    from datetime import UTC

    return datetime(*args, tzinfo=UTC)


class TestAuthorize:
    def test_mints_code_on_approval(self, client):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([_client_row()])
            resp = client.post(
                "/v3/oauth/authorize",
                json={
                    "token": _make_token("alice"),
                    "client_id": "muse-connector",
                    "redirect_uri": "https://muse.example.com/callback",
                    "response_type": "code",
                    "state": "xyz",
                },
            )
        assert resp.status_code == 200
        assert len(resp.json()["code"]) >= 43
        assert resp.json()["state"] == "xyz"
        # The code is stored (hash only) bound to the user + redirect_uri.
        code_inserts = [c for c in mock_client.insert.call_args_list if c[0][0] == "oauth_codes"]
        assert len(code_inserts) == 1
        row = code_inserts[0][0][1][0]
        assert row[1] == "muse-connector"
        assert row[2] == "alice"
        assert row[3] == "https://muse.example.com/callback"

    def test_unknown_client_rejected(self, client):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            resp = client.post(
                "/v3/oauth/authorize",
                json={
                    "token": _make_token("alice"),
                    "client_id": "ghost",
                    "redirect_uri": "https://muse.example.com/callback",
                    "response_type": "code",
                },
            )
        assert resp.status_code == 400

    def test_redirect_uri_mismatch_rejected(self, client):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([_client_row()])
            resp = client.post(
                "/v3/oauth/authorize",
                json={
                    "token": _make_token("alice"),
                    "client_id": "muse-connector",
                    "redirect_uri": "https://evil.example.com/callback",
                    "response_type": "code",
                },
            )
        assert resp.status_code == 400

    def test_implicit_grant_rejected(self, client):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([_client_row()])
            resp = client.post(
                "/v3/oauth/authorize",
                json={
                    "token": _make_token("alice"),
                    "client_id": "muse-connector",
                    "redirect_uri": "https://muse.example.com/callback",
                    "response_type": "token",
                },
            )
        assert resp.status_code == 400


class TestTokenAuthorizationCode:
    def test_exchanges_code_for_tokens(self, client):
        def fake_query(sql, params=None):
            if "client_secret" in sql:  # get_oauth_client (secret check)
                return _mock_result_rows([_client_row()])
            if "username, expires_at, client_id, redirect_uri" in sql:  # redeem (single query)
                return _mock_result_rows(
                    [("alice", _utc(2027, 1, 1, 0, 0, 1), "muse-connector", "https://muse.example.com/callback")]
                )
            return _mock_result_rows([])

        with _patch_client() as mock_client:
            mock_client.query.side_effect = fake_query
            resp = client.post(
                "/v3/oauth/token",
                json={
                    "grant_type": "authorization_code",
                    "client_id": "muse-connector",
                    "client_secret": "s3cr3t",
                    "code": "the-code",
                    "redirect_uri": "https://muse.example.com/callback",
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "Bearer"
        assert body["expires_in"] == settings.TOKEN_EXPIRE_MINUTES * 60
        assert len(body["refresh_token"]) >= 43
        # The access token is a web10 JWT carrying the client_id claim.
        claims = jwt.decode(body["access_token"], settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
        assert claims["username"] == "alice"
        assert claims["client_id"] == "muse-connector"

    def test_bad_client_secret_rejected(self, client):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([_client_row()])
            resp = client.post(
                "/v3/oauth/token",
                json={
                    "grant_type": "authorization_code",
                    "client_id": "muse-connector",
                    "client_secret": "wrong",
                    "code": "the-code",
                    "redirect_uri": "https://muse.example.com/callback",
                },
            )
        assert resp.status_code == 401

    def test_invalid_code_rejected(self, client):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([_client_row()]),
                _mock_result_rows([]),  # redeem → None (unknown code)
            ]
            resp = client.post(
                "/v3/oauth/token",
                json={
                    "grant_type": "authorization_code",
                    "client_id": "muse-connector",
                    "client_secret": "s3cr3t",
                    "code": "stale-code",
                    "redirect_uri": "https://muse.example.com/callback",
                },
            )
        assert resp.status_code == 400


class TestTokenRefresh:
    def test_rotates_refresh_token(self, client):
        with _patch_client() as mock_client:
            # secret check → client; get_refresh_token → active row (not deleted).
            mock_client.query.side_effect = [
                _mock_result_rows([_client_row()]),
                _mock_result_rows([("muse-connector", "alice", "fam-1", _utc(2026, 12, 1), 0)]),
            ]
            resp = client.post(
                "/v3/oauth/token",
                json={
                    "grant_type": "refresh_token",
                    "client_id": "muse-connector",
                    "client_secret": "s3cr3t",
                    "refresh_token": "old-refresh",
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["refresh_token"]) >= 43
        claims = jwt.decode(body["access_token"], settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
        assert claims["username"] == "alice"
        assert claims["client_id"] == "muse-connector"

    def test_replayed_token_invalidates_family(self, client):
        # A tombstoned (deleted=1) refresh token → the whole family is killed.
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([_client_row()]),
                _mock_result_rows([("muse-connector", "alice", "fam-1", _utc(2026, 12, 1), 1)]),  # deleted=1
            ]
            resp = client.post(
                "/v3/oauth/token",
                json={
                    "grant_type": "refresh_token",
                    "client_id": "muse-connector",
                    "client_secret": "s3cr3t",
                    "refresh_token": "stolen-refresh",
                },
            )
        assert resp.status_code == 400
        # The family invalidation ran (a tombstone INSERT by family_id).
        invalidate_calls = [c for c in mock_client.command.call_args_list if "family_id = %(family_id)s" in c[0][0]]
        assert invalidate_calls, "family invalidation did not run on replay"

    def test_unknown_refresh_token_rejected(self, client):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([_client_row()]),
                _mock_result_rows([]),  # get_refresh_token → None
            ]
            resp = client.post(
                "/v3/oauth/token",
                json={
                    "grant_type": "refresh_token",
                    "client_id": "muse-connector",
                    "client_secret": "s3cr3t",
                    "refresh_token": "never-existed",
                },
            )
        assert resp.status_code == 400
