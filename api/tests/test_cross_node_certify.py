"""Cross-node certification tests (D84 Phase B — the live /certify model).

A token minted by node A, presented to node B: B asks A's /certify (with a
cached yes), derives the canonical principal ``{provider}/users/{username}``,
and runs B's own permission checks against it. The remote answer certifies
IDENTITY ONLY (I6) — access is decided locally, always.

Covers:
- auth_helper.principal(): local canonical form, foreign certify + form,
  anon/invalid rejection, the certify-once-then-cache behavior.
- The /v3/query endpoint: a foreign reader's candidates + readable set +
  boundary CTE member_key all use the canonical principal.
- The /v3/read endpoint: the same canonical-principal threading.
"""

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services import auth as auth_svc
from app.v3.endpoints import auth_helper

REMOTE_PROVIDER = "https://node-a.example"
NODE_A_KEY = "node-a-private-signing-key-32b!!"


def _foreign_token(username="alice", provider=REMOTE_PROVIDER, minutes=60):
    """A token minted by a FOREIGN node: signed with node A's key, so the
    local decode fails on signature and the home node becomes the authority
    (the live /certify model — B never holds A's key)."""
    payload = {
        "username": username,
        "site": "auth.node-a.example",
        "target": provider,
        "provider": provider,
        "expires": (datetime.utcnow() + timedelta(minutes=minutes)).isoformat(),
    }
    return jwt.encode(payload, NODE_A_KEY, algorithm=settings.ALGORITHM)


def _local_token(username="testuser"):
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture(autouse=True)
def _clean_remote_cache():
    auth_svc.clear_remote_certify_cache()
    yield
    auth_svc.clear_remote_certify_cache()


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app, raise_server_exceptions=False)


class TestPrincipalDerivation:
    def test_local_token_retains_existing_key(self):
        data = SimpleNamespace(token=_local_token("alice"))
        assert auth_helper.principal(data) == "alice"

    def test_foreign_token_certifies_then_canonical_form(self):
        data = SimpleNamespace(token=_foreign_token("alice"))
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=True) as remote,
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
        ):
            assert auth_helper.principal(data) == f"{REMOTE_PROVIDER}/users/alice"
            remote.assert_called_once()

    def test_foreign_token_denied_raises_token(self):
        data = SimpleNamespace(token=_foreign_token("alice"))
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=False),
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
        ):
            with pytest.raises(Exception):
                auth_helper.principal(data)

    def test_foreign_token_remote_error_raises_token(self):
        data = SimpleNamespace(token=_foreign_token("alice"))
        with patch(
            "app.services.auth.certify_with_remote_provider",
            side_effect=Exception("timeout"),
        ):
            with pytest.raises(Exception):
                auth_helper.principal(data)

    def test_foreign_token_certified_once_then_cached(self):
        token = _foreign_token("alice")
        data = SimpleNamespace(token=token)
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=True) as remote,
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
        ):
            assert auth_helper.principal(data) == f"{REMOTE_PROVIDER}/users/alice"
            # Same token again: the cache answers, no second remote call.
            assert auth_helper.principal(data) == f"{REMOTE_PROVIDER}/users/alice"
        remote.assert_called_once()

    def test_expired_foreign_token_rejected_after_certify(self):
        # The home node says yes, but the token's own expiry has passed —
        # expiry is re-checked locally (a valid signature alone never makes
        # it fresh).
        data = SimpleNamespace(token=_foreign_token("alice", minutes=-60))
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=True),
            patch("app.v3.endpoints.auth_helper._check_token_expiry", side_effect=Exception("expired")),
        ):
            with pytest.raises(Exception):
                auth_helper.principal(data)

    def test_anon_token_raises(self):
        payload = {
            "username": "anon",
            "site": None,
            "target": settings.PROVIDER,
            "provider": settings.PROVIDER,
            "expires": None,
        }
        token = jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(Exception):
            auth_helper.principal(SimpleNamespace(token=token))

    def test_missing_token_raises(self):
        with pytest.raises(Exception):
            auth_helper.principal(SimpleNamespace(token=None))

    def test_local_user_helper_unchanged(self):
        # user() still returns the bare username (the app-contract +
        # user-lookup key) — only the permission principal changed shape.
        data = SimpleNamespace(token=_local_token("alice"))
        assert auth_helper.user(data) == "alice"


class TestQueryEndpointForeignReader:
    def test_foreign_reader_uses_canonical_principal(self, client):
        """A foreign reader's query: the readable set is resolved for the
        canonical principal and the boundary CTE is built with it as
        member_key."""
        token = _foreign_token("alice")
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=True),
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
            patch("app.v3.services.clickhouse.get_user_groups") as groups,
            patch("app.v3.services.clickhouse.readable_groups") as readable,
            patch(
                "app.v3.services.clickhouse.execute_query",
                return_value=(["doc_id"], [("d1",)]),
            ) as execute,
        ):
            resp = client.post(
                "/v3/query",
                json={"token": token, "sql": "SELECT doc_id FROM posts", "groups": ["g1"], "withGroupMeta": False},
            )
        assert resp.status_code == 200
        canonical = f"{REMOTE_PROVIDER}/users/alice"
        # Explicit groups → no membership lookup needed.
        groups.assert_not_called()
        readable.assert_called_once_with(canonical, "posts", True, ["g1"])
        # The boundary CTE is built with the canonical principal as member_key.
        compiled_sql = execute.call_args[0][0]
        assert canonical in compiled_sql

    def test_foreign_reader_me_path_uses_canonical_memberships(self, client):
        """No explicit groups → the reader's own groups, looked up under the
        canonical principal."""
        token = _foreign_token("alice")
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=True),
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]) as groups,
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]) as readable,
            patch(
                "app.v3.services.clickhouse.execute_query",
                return_value=(["doc_id"], []),
            ),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id FROM posts"})
        assert resp.status_code == 200
        canonical = f"{REMOTE_PROVIDER}/users/alice"
        groups.assert_called_once_with(canonical)
        readable.assert_called_once_with(canonical, "posts", True, ["g1"])

    def test_local_reader_existing_principal_end_to_end(self, client):
        """Local keys stay aligned with existing writers until Phase A."""
        token = _local_token("testuser")
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]) as groups,
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]) as readable,
            patch(
                "app.v3.services.clickhouse.execute_query",
                return_value=(["doc_id"], []),
            ),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id FROM posts"})
        assert resp.status_code == 200
        groups.assert_called_once_with("testuser")
        readable.assert_called_once_with("testuser", "posts", True, ["g1"])


class TestReadEndpointForeignReader:
    def test_foreign_reader_group_read_canonical(self, client):
        token = _foreign_token("alice")
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=True),
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
            patch("app.v3.endpoints.documents._check_app_permission"),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["g1"]),
            patch("app.v3.services.clickhouse.readable_groups") as readable,
            patch("app.v3.services.clickhouse.read_documents_in_groups", return_value=[]),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
        ):
            resp = client.post(
                "/v3/read",
                json={"token": token, "service": "posts", "groups": ["g1"]},
            )
        assert resp.status_code == 200
        readable.assert_called_once_with(f"{REMOTE_PROVIDER}/users/alice", "posts", True, ["g1"])

    def test_foreign_reader_denied_gets_401(self, client):
        token = _foreign_token("alice")
        with (
            patch("app.services.auth.certify_with_remote_provider", return_value=False),
            patch("app.v3.endpoints.auth_helper._check_token_expiry"),
        ):
            resp = client.post(
                "/v3/read",
                json={"token": token, "service": "posts", "groups": ["g1"]},
            )
        assert resp.status_code == 401
