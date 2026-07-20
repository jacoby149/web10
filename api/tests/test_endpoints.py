"""Endpoint-level permission-matrix suite — the wave-0 seatbelt.

Runs through the FastAPI app (TestClient) so we catch route-level bugs
the unit layer misses: star protection via routes, metering/billing,
forged-token rejection, cross-collection access, scoped-token enforcement.

All DB calls are patched — no real database needed.
"""

import json as _json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services import documentdb as db_module

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _token(payload: dict) -> str:
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _future(minutes: int = 60) -> str:
    return (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()


def _owner_token(username: str = "alice") -> str:
    return _token(
        {
            "username": username,
            "site": "auth.localhost",
            "target": settings.PROVIDER,
            "provider": settings.PROVIDER,
            "expires": _future(),
        }
    )


def _app_token(username: str, site: str, target: str = settings.PROVIDER) -> str:
    return _token(
        {
            "username": username,
            "site": site,
            "target": target,
            "provider": settings.PROVIDER,
            "expires": _future(),
        }
    )


def _forged_token(username: str = "alice") -> str:
    return jwt.encode(
        {
            "username": username,
            "site": "auth.localhost",
            "target": settings.PROVIDER,
            "provider": settings.PROVIDER,
            "expires": _future(),
        },
        "totally-different-secret",
        algorithm=settings.ALGORITHM,
    )


@pytest.fixture
def client():
    return TestClient(fastapi_app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Shared DB fixtures
# ---------------------------------------------------------------------------

MOCK_STAR = {
    "service": "*",
    "username": "alice",
    "hashed_password": "$2b$12$LJ3m4/rM3U5aR2KqB3xQJ.ao0cF5mN1qYXz6Gk8vH2jT9wR1sK2i",
    "phone_number": "+15551234567",
    "verified": True,
    "customer_id": None,
    "business_id": None,
    "credit_limit": 1000000,
    "space_limit": 1000000,
    "credits_spent": 0,
    "last_replenish": datetime(1997, 12, 28),
}

MOCK_TERM = {
    "service": "posts",
    "whitelist": [
        {
            "username": "alice",
            "provider": settings.PROVIDER,
            "read": True,
            "create": True,
            "update": True,
            "delete": True,
        },
        {"username": "bob", "provider": settings.PROVIDER, "read": True},
    ],
    "blacklist": [],
    "cross_origins": ["auth.localhost", "myapp.example.com"],
}


@pytest.fixture
def db_patched():
    with (
        patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
        patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
        patch("app.services.documentdb.user_collection_exists", return_value=True),
        patch("app.services.documentdb.get_collection_size", return_value=1),
        patch("app.services.documentdb.create") as m_create,
        patch("app.services.documentdb.read", return_value=[{"_id": "1", "title": "hello"}]),
        patch("app.services.documentdb.update", return_value={"matchedCount": 1, "modifiedCount": 1}),
        patch("app.services.documentdb.delete", return_value="successfully deleted"),
        patch("app.services.documentdb.charge"),
        patch("app.services.documentdb.replenish"),
        patch("app.services.documentdb.aggregate", return_value=[{"_id": "1", "title": "hello"}]),
        patch("app.services.documentdb.emit_event"),
    ):
        yield {"create": m_create}


# ---------------------------------------------------------------------------
# 1. AUTH FLOWS
# ---------------------------------------------------------------------------


class TestSignup:
    def test_signup_success(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=None),
            patch("app.services.documentdb.create_user") as m_create,
            patch("app.services.documentdb.set_phone_number"),
            patch("app.services.twilio.send_verification"),
        ):
            m_create.return_value = "successfully created a new user"
            resp = client.post(
                "/signup",
                json={
                    "username": "newuser",
                    "password": "pass123",
                    "phone": "+15550000000",
                },
            )
        assert resp.status_code == 200
        assert "successfully" in resp.json()

    def test_signup_reserved_username(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "web10",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "bad user!",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_duplicate(self, client):
        with patch("app.services.documentdb.get_star", return_value=MOCK_STAR):
            resp = client.post(
                "/signup",
                json={
                    "username": "alice",
                    "password": "pass123",
                    "phone": "+15550000000",
                },
            )
        assert resp.status_code == 401


class TestWeb10Token:
    def test_login_with_password(self, client):
        with patch("app.endpoints.auth.authenticate_user") as m_auth:
            m_auth.return_value = MagicMock(username="alice", hashed_password="x")
            resp = client.post(
                "/web10token",
                json={
                    "username": "alice",
                    "password": "secret",
                    "site": "myapp.example.com",
                    "target": settings.PROVIDER,
                },
            )
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_wrong_password(self, client):
        with patch("app.services.auth.authenticate_user") as m_auth:
            m_auth.side_effect = Exception("LOGIN")
            resp = client.post(
                "/web10token",
                json={
                    "username": "alice",
                    "password": "wrong",
                    "site": "myapp.example.com",
                    "target": settings.PROVIDER,
                },
            )
        assert resp.status_code == 401

    def test_login_no_creds(self, client):
        resp = client.post(
            "/web10token",
            json={
                "username": "alice",
                "site": "myapp.example.com",
                "target": settings.PROVIDER,
            },
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 2. CRUD ROUTES — end-to-end with permissions
# ---------------------------------------------------------------------------


class TestCreate:
    def test_create_authorized(self, client, db_patched):
        resp = client.post(
            "/alice/posts",
            json={"token": _owner_token("alice"), "query": {"title": "hi"}},
        )
        assert resp.status_code == 200

    def test_create_no_permission(self, client, db_patched):
        """Bob only has read permission on posts."""
        with patch("app.services.documentdb.get_term_record") as m:
            m.return_value = {
                "service": "posts",
                "whitelist": [{"username": "bob", "provider": settings.PROVIDER, "read": True}],
                "blacklist": [],
                "cross_origins": ["myapp.example.com"],
            }
            resp = client.post(
                "/alice/posts",
                json={"token": _app_token("bob", "myapp.example.com"), "query": {"title": "hi"}},
            )
        assert resp.status_code == 401

    def test_create_no_token(self, client, db_patched):
        resp = client.post(
            "/alice/posts",
            json={"query": {"title": "hi"}},
        )
        assert resp.status_code == 401

    def test_create_star_raises_dstar(self, client):
        """Creating a record with service='*' must be rejected."""
        mock_result = MagicMock()
        mock_result.inserted_id = "mock_oid"
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.insert_one.return_value = mock_result
            resp = client.post(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {"service": "*", "x": 1}},
            )
        assert resp.status_code == 401


class TestRead:
    def test_read_authorized(self, client, db_patched):
        resp = client.patch(
            "/alice/posts",
            json={"token": _owner_token("alice"), "query": {}},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_read_cross_origin(self, client, db_patched):
        """Bob has read permission via whitelist + cross_origins."""
        resp = client.patch(
            "/alice/posts",
            json={"token": _app_token("bob", "myapp.example.com"), "query": {}},
        )
        assert resp.status_code == 200

    def test_read_blacklisted(self, client, db_patched):
        with patch("app.services.documentdb.get_term_record") as m:
            m.return_value = {
                "service": "posts",
                "whitelist": [{"username": "banned", "provider": settings.PROVIDER, "read": True}],
                "blacklist": [{"username": "banned", "provider": settings.PROVIDER, "read": True}],
                "cross_origins": ["myapp.example.com"],
            }
            resp = client.patch(
                "/alice/posts",
                json={"token": _app_token("banned", "myapp.example.com"), "query": {}},
            )
        assert resp.status_code == 401


class TestUpdate:
    def test_update_authorized(self, client, db_patched):
        resp = client.put(
            "/alice/posts",
            json={"token": _owner_token("alice"), "query": {"_id": "1"}, "update": {"$set": {"title": "new"}}},
        )
        assert resp.status_code == 200

    def test_update_star_raises(self, client):
        """Updating the star record must be rejected."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.star_selected", return_value=True),
        ):
            resp = client.put(
                "/alice/services",
                json={"token": _owner_token("alice"), "query": {}, "update": {"$set": {"x": 1}}},
            )
        assert resp.status_code == 401


class TestDelete:
    def test_delete_authorized(self, client, db_patched):
        resp = client.request(
            "DELETE",
            "/alice/posts",
            content=_json.dumps({"token": _owner_token("alice"), "query": {"_id": "1"}}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 200

    def test_delete_star_raises(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.star_selected", return_value=True),
        ):
            resp = client.request(
                "DELETE",
                "/alice/services",
                content=_json.dumps({"token": _owner_token("alice"), "query": {"service": "*"}}),
                headers={"content-type": "application/json"},
            )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 3. AGGREGATE ENDPOINT
# ---------------------------------------------------------------------------


class TestAggregate:
    def test_aggregate_valid_pipeline(self, client, db_patched):
        resp = client.post(
            "/alice/posts/aggregate",
            json={"token": _owner_token("alice"), "pipeline": [{"$match": {"tags": "music"}}]},
        )
        assert resp.status_code == 200

    def test_aggregate_forbidden_stage(self, client):
        """Pipeline validation happens before DB — must reject $out."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
        ):
            resp = client.post(
                "/alice/posts/aggregate",
                json={"token": _owner_token("alice"), "pipeline": [{"$out": "otheruser"}]},
            )
        assert resp.status_code == 400

    def test_aggregate_no_permission(self, client, db_patched):
        with patch("app.services.documentdb.get_term_record") as m:
            m.return_value = {
                "service": "posts",
                "whitelist": [],
                "blacklist": [],
                "cross_origins": [],
            }
            resp = client.post(
                "/alice/posts/aggregate",
                json={"token": _app_token("bob", "myapp.example.com"), "pipeline": [{"$match": {}}]},
            )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 4. STAR PROTECTION (I3)
# ---------------------------------------------------------------------------


class TestStarProtection:
    def test_cannot_update_star_via_services(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.star_selected", return_value=True),
        ):
            resp = client.put(
                "/alice/services",
                json={"token": _owner_token("alice"), "query": {"service": "*"}, "update": {"$set": {"x": 1}}},
            )
        assert resp.status_code == 401

    def test_cannot_delete_star_via_services(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.star_selected", return_value=True),
        ):
            resp = client.request(
                "DELETE",
                "/alice/services",
                content=_json.dumps({"token": _owner_token("alice"), "query": {"service": "*"}}),
                headers={"content-type": "application/json"},
            )
        assert resp.status_code == 401

    def test_cannot_create_star_record(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.star_found", return_value=True),
        ):
            resp = client.post(
                "/alice/services",
                json={"token": _owner_token("alice"), "query": {"service": "*", "x": 1}},
            )
        assert resp.status_code == 401

    def test_cross_collection_impossible(self, client, db_patched):
        """Bob's token without permission cannot read alice's data."""
        with patch("app.services.documentdb.get_term_record") as m:
            m.return_value = {
                "service": "posts",
                "whitelist": [],
                "blacklist": [],
                "cross_origins": [],
            }
            resp = client.patch(
                "/alice/posts",
                json={"token": _app_token("bob", "myapp.example.com"), "query": {}},
            )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 5. FORGED TOKEN REJECTION (I1)
# ---------------------------------------------------------------------------


class TestForgedTokens:
    def test_forged_token_rejected_crud(self, client, db_patched):
        """A token signed with a different key must fail certify."""
        # is_permitted calls decode_token (unsigned) then certify (signed).
        # For a forged token with provider==PROVIDER, certify(private_key=True)
        # raises InvalidSignatureError → caught by jwt_error_handler → 401.
        resp = client.patch(
            "/alice/posts",
            json={"token": _forged_token("alice"), "query": {}},
        )
        assert resp.status_code == 401

    def test_forged_token_rejected_create(self, client, db_patched):
        resp = client.post(
            "/alice/posts",
            json={"token": _forged_token("alice"), "query": {"title": "hi"}},
        )
        assert resp.status_code == 401

    def test_forged_token_rejected_update(self, client, db_patched):
        resp = client.put(
            "/alice/posts",
            json={"token": _forged_token("alice"), "query": {"_id": "1"}, "update": {"$set": {"x": 1}}},
        )
        assert resp.status_code == 401

    def test_forged_token_rejected_delete(self, client, db_patched):
        resp = client.request(
            "DELETE",
            "/alice/posts",
            content=_json.dumps({"token": _forged_token("alice"), "query": {"_id": "1"}}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 401

    def test_forged_token_rejected_aggregate(self, client, db_patched):
        resp = client.post(
            "/alice/posts/aggregate",
            json={"token": _forged_token("alice"), "pipeline": [{"$match": {}}]},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 6. SCOPED TOKEN ENFORCEMENT (I5)
# ---------------------------------------------------------------------------


class TestScopedTokens:
    def test_scoped_token_cannot_exceed_scope(self, client, db_patched):
        """A token scoped to read-only cannot create."""
        with patch("app.services.documentdb.get_term_record") as m:
            m.return_value = {
                "service": "posts",
                "whitelist": [{"username": "limited", "provider": settings.PROVIDER, "read": True}],
                "blacklist": [],
                "cross_origins": ["myapp.example.com"],
            }
            resp = client.post(
                "/alice/posts",
                json={"token": _app_token("limited", "myapp.example.com"), "query": {"title": "hi"}},
            )
        assert resp.status_code == 401

    def test_scoped_token_read_works(self, client, db_patched):
        with patch("app.services.documentdb.get_term_record") as m:
            m.return_value = {
                "service": "posts",
                "whitelist": [{"username": "limited", "provider": settings.PROVIDER, "read": True}],
                "blacklist": [],
                "cross_origins": ["myapp.example.com"],
            }
            resp = client.patch(
                "/alice/posts",
                json={"token": _app_token("limited", "myapp.example.com"), "query": {}},
            )
        assert resp.status_code == 200

    def test_no_target_token_owner_access(self, client, db_patched):
        """Token with no target — owner can still access own data."""
        token = _token(
            {
                "username": "alice",
                "site": "myapp.example.com",
                "target": None,
                "provider": settings.PROVIDER,
                "expires": _future(),
            }
        )
        resp = client.patch(
            "/alice/posts",
            json={"token": token, "query": {}},
        )
        assert resp.status_code == 200

    def test_no_target_token_non_owner_denied(self, client, db_patched):
        """Token with no target — non-owner denied."""
        token = _token(
            {
                "username": "bob",
                "site": "myapp.example.com",
                "target": None,
                "provider": settings.PROVIDER,
                "expires": _future(),
            }
        )
        resp = client.patch(
            "/alice/posts",
            json={"token": token, "query": {}},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 7. METERING / QUOTAS
# ---------------------------------------------------------------------------


class TestMetering:
    def test_charge_called_on_create(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.create", return_value={"_id": "1", "title": "hi"}),
            patch("app.services.documentdb.charge") as m_charge,
            patch("app.services.documentdb.emit_event"),
        ):
            resp = client.post(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {"title": "hi"}},
            )
        assert resp.status_code == 200
        assert m_charge.called

    def test_charge_called_on_read(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.read", return_value=[{"_id": "1"}]),
            patch("app.services.documentdb.charge") as m_charge,
            patch("app.services.documentdb.emit_event"),
        ):
            resp = client.patch(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {}},
            )
        assert resp.status_code == 200
        assert m_charge.called

    def test_services_read_no_charge(self, client):
        """Reading 'services' should skip the metering check."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.read", return_value=[]),
            patch("app.services.documentdb.charge") as m_charge,
            patch("app.services.documentdb.emit_event") as m_emit,
        ):
            resp = client.patch(
                "/alice/services",
                json={"token": _owner_token("alice"), "query": {}},
            )
        assert resp.status_code == 200
        assert not m_charge.called
        assert not m_emit.called

    def test_out_of_credits_denied(self, client):
        with (
            patch("app.services.documentdb.get_star") as m_star,
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.read", return_value=[{"_id": "1"}]),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.subscription_update"),
            patch("app.services.documentdb.emit_event"),
            patch("app.endpoints.crud.settings") as m_settings,
        ):
            m_settings.VERIFY_REQUIRED = False
            m_star.return_value = {**MOCK_STAR, "credit_limit": 0, "credits_spent": 1}
            resp = client.patch(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {}},
            )
        assert resp.status_code == 401

    def test_out_of_space_denied(self, client):
        with (
            patch("app.services.documentdb.get_star") as m_star,
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1000),
            patch("app.services.documentdb.read", return_value=[{"_id": "1"}]),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.subscription_update"),
            patch("app.services.documentdb.emit_event"),
            patch("app.endpoints.crud.settings") as m_settings,
        ):
            m_settings.VERIFY_REQUIRED = False
            m_star.return_value = {**MOCK_STAR, "space_limit": 1}
            resp = client.patch(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {}},
            )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 10. METERING EVENTS
# ---------------------------------------------------------------------------


class TestMeteringEvents:
    def test_event_emitted_on_create(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.create", return_value={"_id": "1", "title": "hi"}),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event") as m_emit,
        ):
            resp = client.post(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {"title": "hi"}},
            )
        assert resp.status_code == 200
        assert m_emit.called
        call_args = m_emit.call_args[0]
        assert call_args[0] == "alice"
        assert call_args[1] == "create"
        assert call_args[2] == "posts"
        assert call_args[3] == "auth.localhost"

    def test_event_emitted_on_read(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.read", return_value=[{"_id": "1"}]),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event") as m_emit,
        ):
            resp = client.patch(
                "/alice/posts",
                json={"token": _app_token("bob", "myapp.example.com"), "query": {}},
            )
        assert resp.status_code == 200
        assert m_emit.called
        call_args = m_emit.call_args[0]
        assert call_args[0] == "alice"
        assert call_args[1] == "read"
        assert call_args[2] == "posts"
        assert call_args[3] == "myapp.example.com"

    def test_event_emitted_on_aggregate(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.aggregate", return_value=[{"_id": "1"}]),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event") as m_emit,
        ):
            resp = client.post(
                "/alice/posts/aggregate",
                json={"token": _owner_token("alice"), "pipeline": [{"$match": {}}]},
            )
        assert resp.status_code == 200
        assert m_emit.called
        assert m_emit.call_args[0][1] == "aggregate"

    def test_event_emitted_on_update(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.update", return_value={"matchedCount": 1, "modifiedCount": 1}),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event") as m_emit,
        ):
            resp = client.put(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {"_id": "1"}, "update": {"$set": {"x": 1}}},
            )
        assert resp.status_code == 200
        assert m_emit.called
        assert m_emit.call_args[0][1] == "update"

    def test_event_emitted_on_delete(self, client):
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.delete", return_value="successfully deleted"),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event") as m_emit,
        ):
            resp = client.request(
                "DELETE",
                "/alice/posts",
                content=_json.dumps({"token": _owner_token("alice"), "query": {"_id": "1"}}),
                headers={"content-type": "application/json"},
            )
        assert resp.status_code == 200
        assert m_emit.called
        assert m_emit.call_args[0][1] == "delete"


# ---------------------------------------------------------------------------
# 8. CERTIFY ENDPOINT
# ---------------------------------------------------------------------------


class TestCertify:
    def test_certify_valid_token(self, client):
        resp = client.post(
            "/certify",
            json={"token": _owner_token("alice")},
        )
        assert resp.status_code == 200
        assert resp.json() is True

    def test_certify_forged_token(self, client):
        resp = client.post(
            "/certify",
            json={"token": _forged_token("alice")},
        )
        assert resp.status_code == 401

    def test_certify_expired_token(self, client):
        expired = jwt.encode(
            {
                "username": "alice",
                "site": "auth.localhost",
                "target": settings.PROVIDER,
                "provider": settings.PROVIDER,
                "expires": (datetime.utcnow() - timedelta(hours=1)).isoformat(),
            },
            settings.PRIVATE_KEY,
            algorithm=settings.ALGORITHM,
        )
        resp = client.post(
            "/certify",
            json={"token": expired},
        )
        assert resp.status_code == 401

    def test_certify_no_token_returns_anon(self, client):
        resp = client.post(
            "/certify",
            json={"token": None},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 9. SYSTEM ENDPOINTS
# ---------------------------------------------------------------------------


class TestSystem:
    def test_stats(self, client):
        with (
            patch("app.services.documentdb.get_apps", return_value=[]),
            patch("app.services.documentdb.get_user_count", return_value=5),
            patch("app.services.documentdb.total_size", return_value=1024),
        ):
            resp = client.post("/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "apps" in data
        assert "users" in data
        assert "storage" in data
