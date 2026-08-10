"""Endpoint-level permission-matrix suite — the wave-0 seatbelt.

Runs through the FastAPI app (TestClient) so we catch route-level bugs
the unit layer misses: star protection via routes, metering/billing,
forged-token rejection, cross-collection access, scoped-token enforcement.

All DB calls are patched — no real database needed.
"""

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

    def test_signup_bad_username_uppercase(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "Alice",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username_unicode(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "Ω",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username_leading_hyphen(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "-alice",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username_trailing_hyphen(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "alice-",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username_bare_hyphen(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "-",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username_over_length(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "a" * 31,
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_bad_username_empty(self, client):
        resp = client.post(
            "/signup",
            json={
                "username": "",
                "password": "pass123",
                "phone": "+15550000000",
            },
        )
        assert resp.status_code == 401

    def test_signup_hyphenated_persona_ok(self, client):
        """Hyphenated persona-style names must still sign up."""
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
                    "username": "solar-flare-69",
                    "password": "pass123",
                    "phone": "+15550000000",
                },
            )
        assert resp.status_code == 200

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

    def test_mint_tiered_token(self, client):
        """The consent handoff: an auth-site login token mints a token for an app.

        Regression: the minted TokenData never had its provider set, so
        can_mint's provider comparison always raised MINT.
        """
        login_token = _token(
            {
                "username": "alice",
                "site": "auth.localhost",  # a CORS_SERVICE_MANAGERS site
                "target": None,
                "provider": settings.PROVIDER,
                "expires": _future(),
            }
        )
        resp = client.post(
            "/web10token",
            json={
                "username": "alice",
                "token": login_token,
                "site": "social.example.com",
                "target": settings.PROVIDER,
            },
        )
        assert resp.status_code == 200
        minted = jwt.decode(resp.json()["token"], settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
        assert minted["username"] == "alice"
        assert minted["site"] == "social.example.com"
        assert minted["provider"] == settings.PROVIDER

    def test_mint_rejected_for_other_user(self, client):
        """A token for bob cannot mint a token for alice."""
        login_token = _token(
            {
                "username": "bob",
                "site": "auth.localhost",
                "target": None,
                "provider": settings.PROVIDER,
                "expires": _future(),
            }
        )
        resp = client.post(
            "/web10token",
            json={
                "username": "alice",
                "token": login_token,
                "site": "social.example.com",
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
        resp = client.post(
            "/alice/posts/read",
            json={"token": _owner_token("alice"), "query": {}},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_read_cross_origin(self, client, db_patched):
        """Bob has read permission via whitelist + cross_origins."""
        resp = client.post(
            "/alice/posts/read",
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
            resp = client.post(
                "/alice/posts/read",
                json={"token": _app_token("banned", "myapp.example.com"), "query": {}},
            )
        assert resp.status_code == 401


class TestUpdate:
    def test_update_authorized(self, client, db_patched):
        resp = client.post(
            "/alice/posts/update",
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
            resp = client.post(
                "/alice/services/update",
                json={"token": _owner_token("alice"), "query": {}, "update": {"$set": {"x": 1}}},
            )
        assert resp.status_code == 401


class TestDelete:
    def test_delete_authorized(self, client, db_patched):
        resp = client.post(
            "/alice/posts/delete",
            json={"token": _owner_token("alice"), "query": {"_id": "1"}},
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
            resp = client.post(
                "/alice/services/delete",
                json={"token": _owner_token("alice"), "query": {"service": "*"}},
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
            resp = client.post(
                "/alice/services/update",
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
            resp = client.post(
                "/alice/services/delete",
                json={"token": _owner_token("alice"), "query": {"service": "*"}},
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
            resp = client.post(
                "/alice/posts/read",
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
        resp = client.post(
            "/alice/posts/read",
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
        resp = client.post(
            "/alice/posts/update",
            json={"token": _forged_token("alice"), "query": {"_id": "1"}, "update": {"$set": {"x": 1}}},
        )
        assert resp.status_code == 401

    def test_forged_token_rejected_delete(self, client, db_patched):
        resp = client.post(
            "/alice/posts/delete",
            json={"token": _forged_token("alice"), "query": {"_id": "1"}},
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
            resp = client.post(
                "/alice/posts/read",
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
        resp = client.post(
            "/alice/posts/read",
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
        resp = client.post(
            "/alice/posts/read",
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
            resp = client.post(
                "/alice/posts/read",
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
            resp = client.post(
                "/alice/services/read",
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
            resp = client.post(
                "/alice/posts/read",
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
            resp = client.post(
                "/alice/posts/read",
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
            resp = client.post(
                "/alice/posts/read",
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
            resp = client.post(
                "/alice/posts/update",
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
            resp = client.post(
                "/alice/posts/delete",
                json={"token": _owner_token("alice"), "query": {"_id": "1"}},
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
            patch("app.v3.services.clickhouse.get_node_stats", return_value={"users": 5, "documents": 10, "groups": 3}),
            patch(
                "app.v3.services.clickhouse.list_apps",
                return_value=[
                    {"url": "https://a.com", "name": "A", "description": "", "icon_url": None, "screenshots": []}
                ],
            ),
        ):
            resp = client.post("/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "apps" in data
        assert "users" in data
        assert "storage" in data
        assert data["users"] == 5
        assert len(data["apps"]) == 1

    def test_stats_clickhouse_error_returns_zeros(self, client):
        """When ClickHouse is unreachable, stats returns zeros gracefully."""
        with (
            patch("app.v3.services.clickhouse.get_node_stats", side_effect=Exception("connection refused")),
            patch("app.v3.services.clickhouse.list_apps", side_effect=Exception("connection refused")),
        ):
            resp = client.post("/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["users"] == 0
        assert data["apps"] == []
        assert data["storage"] == 0

    def test_stats_apps_returned(self, client):
        """Stats returns approved apps from ClickHouse."""
        with (
            patch("app.v3.services.clickhouse.get_node_stats", return_value={"users": 1, "documents": 0, "groups": 0}),
            patch(
                "app.v3.services.clickhouse.list_apps",
                return_value=[
                    {
                        "url": "https://social.web10.app",
                        "name": "web10 social",
                        "description": "Social app",
                        "icon_url": None,
                        "screenshots": [],
                    },
                    {
                        "url": "https://auth.web10.app",
                        "name": "auth",
                        "description": "Auth app",
                        "icon_url": None,
                        "screenshots": [],
                    },
                ],
            ),
        ):
            resp = client.post("/stats")
        data = resp.json()
        assert len(data["apps"]) == 2
        assert data["apps"][0]["name"] == "web10 social"


class TestNodeConfig:
    """Node Config is admin-only. It loads via POST /config (regression: the
    endpoint used to be GET while the UI POSTed, so it always 405'd). check_admin
    enforces the config.admins list — being the collection owner is NOT enough,
    since the config is node-global.
    """

    # a saved config whose admin list contains "alice"
    _CFG = {"provider": "api.localhost", "private_key": "SUPERSECRET", "brand_text": "web10", "admins": ["alice"]}

    def test_config_get_not_allowed(self, client):
        resp = client.get("/config")
        assert resp.status_code in (405, 422)

    def test_config_post_returns_config_for_admin(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post("/config", json={"token": _owner_token("alice")})
        assert resp.status_code == 200
        body = resp.json()
        assert body["brand_text"] == "web10"
        assert body["admins"] == ["alice"]
        assert "private_key" not in body  # secrets never leave the node

    def test_config_post_denied_for_non_admin(self, client):
        # bob is a valid, signed-in user but not on the admin list → 403
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post("/config", json={"token": _owner_token("bob")})
        assert resp.status_code == 403

    def test_config_post_denied_without_token(self, client):
        resp = client.post("/config", json={})
        assert resp.status_code == 403

    def test_am_admin_true_for_admin(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post("/am_admin", json={"token": _owner_token("alice")})
        assert resp.status_code == 200
        assert resp.json() == {"admin": True}

    def test_am_admin_false_for_non_admin(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post("/am_admin", json={"token": _owner_token("bob")})
        assert resp.status_code == 200
        assert resp.json() == {"admin": False}

    def test_default_admin_bootstrap(self, client):
        # with no saved admins, DEFAULT_ADMINS (jacoby149) is the bootstrap admin
        with patch("app.services.config.get_config", return_value={"brand_text": "web10"}):
            resp = client.post("/am_admin", json={"token": _owner_token("jacoby149")})
        assert resp.json() == {"admin": True}


class TestAppStoreCuration:
    """Any app can register, but only admin-approved apps reach the public
    storefront (POST /stats). /apps/admin lists everything with approval
    state; /apps/approve toggles it. Both are admin-only (check_admin)."""

    _CFG = {"provider": "api.localhost", "admins": ["alice"]}

    def test_stats_only_returns_approved_apps(self, client):
        # public storefront filters approved=True in clickhouse.list_apps,
        # but the endpoint is thin — the contract is "apps is a list".
        with (
            patch("app.v3.services.clickhouse.get_node_stats", return_value={"users": 3, "documents": 0, "groups": 0}),
            patch(
                "app.v3.services.clickhouse.list_apps",
                return_value=[
                    {"url": "https://a", "name": "A", "description": "", "icon_url": None, "screenshots": []}
                ],
            ),
        ):
            resp = client.post("/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["apps"]) == 1
        assert data["apps"][0]["url"] == "https://a"

    def test_apps_admin_lists_for_admin(self, client):
        apps = [
            {"url": "https://a", "visits": 5, "approved": True, "name": "A", "registered_at": None},
            {"url": "https://b", "visits": 0, "approved": False, "name": "B", "registered_at": None},
        ]
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.list_apps_admin", return_value=apps),
        ):
            resp = client.post("/apps/admin", json={"token": _owner_token("alice")})
        assert resp.status_code == 200
        body = resp.json()
        assert body["apps"] == apps
        assert body["pending"] == 1

    def test_apps_admin_denied_for_non_admin(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post("/apps/admin", json={"token": _owner_token("bob")})
        assert resp.status_code == 403

    def test_apps_approve_toggles_for_admin(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.set_app_approval") as mock_set,
        ):
            resp = client.post(
                "/apps/approve",
                json={"token": _owner_token("alice"), "url": "https://a", "approved": True},
            )
        assert resp.status_code == 200
        assert resp.json() == {"status": "updated", "url": "https://a", "approved": True}
        mock_set.assert_called_once_with("https://a", True, "")

    def test_apps_approve_denied_for_non_admin(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/apps/approve",
                json={"token": _owner_token("bob"), "url": "https://a", "approved": True},
            )
        assert resp.status_code == 403

    def test_apps_rating_valid(self, client):
        """A valid rating creates a ledger entry."""
        with patch("app.services.documentdb.create_app_rating") as mock_rate:
            mock_rate.return_value = {
                "_id": "test.id",
                "author": "alice",
                "target": "system/web10_apps/app_abc123",
                "payload": {"action": "rating", "rating": 4, "target_app_id": "app_abc123"},
            }
            resp = client.post(
                "/apps/rating",
                json={"token": _owner_token("alice"), "target_app_id": "app_abc123", "rating": 4},
            )
        assert resp.status_code == 200
        mock_rate.assert_called_once_with(
            author="alice", target_app_id="app_abc123", rating=4, provider="api.localhost"
        )

    def test_apps_rating_out_of_range(self, client):
        """Rating outside 1-5 is rejected."""
        resp = client.post(
            "/apps/rating",
            json={"token": _owner_token("alice"), "target_app_id": "app_abc123", "rating": 0},
        )
        assert resp.status_code == 400

        resp = client.post(
            "/apps/rating",
            json={"token": _owner_token("alice"), "target_app_id": "app_abc123", "rating": 6},
        )
        assert resp.status_code == 400

    def test_apps_rating_no_token(self, client):
        """Rating requires authentication."""
        resp = client.post(
            "/apps/rating",
            json={"token": "", "target_app_id": "app_abc123", "rating": 4},
        )
        assert resp.status_code == 401

    def test_apps_ratings_read(self, client):
        """Reading ratings returns entries from the ledger."""
        with patch("app.services.documentdb.query_app_ratings") as mock_query:
            mock_query.return_value = [
                {"_id": "e1", "author": "alice", "payload": {"rating": 5}},
                {"_id": "e2", "author": "bob", "payload": {"rating": 3}},
            ]
            resp = client.post("/apps/ratings/app_abc123")
        assert resp.status_code == 200
        assert len(resp.json()) == 2
        mock_query.assert_called_once_with("app_abc123")

    def test_apps_approve_with_reviewer_note(self, client):
        """Approve endpoint accepts reviewer_note."""
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.set_app_approval") as mock_set,
        ):
            resp = client.post(
                "/apps/approve",
                json={
                    "token": _owner_token("alice"),
                    "url": "https://a",
                    "approved": True,
                    "reviewer_note": "Looks good",
                },
            )
        assert resp.status_code == 200
        mock_set.assert_called_once_with("https://a", True, "Looks good")


# ---------------------------------------------------------------------------
# 11. I6 — Immutable server-side metadata
# ---------------------------------------------------------------------------


class TestI6MetadataInjection:
    """I6: _author, _source_node, _created_at are injected by the server on create,
    immutable on update, and exposed on read. The client cannot forge them."""

    def test_create_injects_author_from_token(self, client):
        """Server injects _author from the token's username, not from client data."""
        mock_result = MagicMock()
        mock_result.inserted_id = "mock_oid"
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.insert_one.return_value = mock_result
            # Client tries to forge _author
            resp = client.post(
                "/alice/posts",
                json={
                    "token": _owner_token("alice"),
                    "query": {"title": "hi", "_author": "someone-else"},
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        # Server value wins: token username, not client's forged value
        assert body.get("_author") == "alice"
        assert body.get("_author") != "someone-else"

    def test_create_injects_source_node_from_token(self, client):
        """Server injects _source_node from the token's provider."""
        mock_result = MagicMock()
        mock_result.inserted_id = "mock_oid"
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.insert_one.return_value = mock_result
            resp = client.post(
                "/alice/posts",
                json={
                    "token": _owner_token("alice"),
                    "query": {"title": "hi", "_source_node": "fake-node"},
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("_source_node") == settings.PROVIDER
        assert body.get("_source_node") != "fake-node"

    def test_create_injects_created_at(self, client):
        """Server injects _created_at (server time), ignoring client value."""
        mock_result = MagicMock()
        mock_result.inserted_id = "mock_oid"
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.insert_one.return_value = mock_result
            resp = client.post(
                "/alice/posts",
                json={
                    "token": _owner_token("alice"),
                    "query": {"title": "hi", "_created_at": "2000-01-01T00:00:00"},
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "_created_at" in body
        assert body["_created_at"] != "2000-01-01T00:00:00"

    def test_update_cannot_change_author(self, client):
        """I6: PUT/PATCH with $set _author is silently dropped."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.documentdb.star_selected", return_value=False),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.find_one_and_update.return_value = {
                "_id": "1",
                "service": "posts",
                "body": {"title": "new", "_author": "alice", "_source_node": settings.PROVIDER},
            }
            resp = client.post(
                "/alice/posts/update",
                json={
                    "token": _owner_token("alice"),
                    "query": {"_id": "1"},
                    "update": {"$set": {"title": "new", "_author": "hacker"}},
                },
            )
        assert resp.status_code == 200
        # The update returned from the DB still has the original author
        body = resp.json()
        assert body.get("_author") == "alice"
        assert body.get("_author") != "hacker"

    def test_update_cannot_change_source_node(self, client):
        """I6: update cannot change _source_node."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.documentdb.star_selected", return_value=False),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.find_one_and_update.return_value = {
                "_id": "1",
                "service": "posts",
                "body": {"title": "new", "_source_node": settings.PROVIDER},
            }
            resp = client.post(
                "/alice/posts/update",
                json={
                    "token": _owner_token("alice"),
                    "query": {"_id": "1"},
                    "update": {"$set": {"title": "new", "_source_node": "fake"}},
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("_source_node") == settings.PROVIDER

    def test_update_cannot_change_created_at(self, client):
        """I6: update cannot change _created_at."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.documentdb.star_selected", return_value=False),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            mock_col.return_value.find_one_and_update.return_value = {
                "_id": "1",
                "service": "posts",
                "body": {"title": "new"},
            }
            resp = client.post(
                "/alice/posts/update",
                json={
                    "token": _owner_token("alice"),
                    "query": {"_id": "1"},
                    "update": {"$set": {"title": "new", "_created_at": "2000-01-01"}},
                },
            )
        assert resp.status_code == 200

    def test_read_returns_metadata_fields(self, client):
        """I6: read returns _author, _source_node, _created_at on every record."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch(
                "app.services.documentdb.read",
                return_value=[
                    {
                        "_id": "1",
                        "title": "hello",
                        "_author": "alice",
                        "_source_node": settings.PROVIDER,
                        "_created_at": "2026-01-01T00:00:00",
                    }
                ],
            ),
        ):
            resp = client.post(
                "/alice/posts/read",
                json={"token": _owner_token("alice"), "query": {}},
            )
        assert resp.status_code == 200
        records = resp.json()
        assert len(records) == 1
        rec = records[0]
        assert "_author" in rec
        assert "_source_node" in rec
        assert "_created_at" in rec

    def test_cross_node_source_node(self, client):
        """I6: a record created via a remote provider token has the correct _source_node
        (the remote provider, not our PROVIDER)."""
        mock_result = MagicMock()
        mock_result.inserted_id = "mock_oid"
        remote_provider = "remote.web10.app"
        remote_token = _token(
            {
                "username": "remote-user",
                "site": "auth.remote.web10.app",
                "target": settings.PROVIDER,
                "provider": remote_provider,
                "expires": _future(),
            }
        )
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record") as m_term,
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.auth.certify_with_remote_provider", return_value=True),
            patch.object(db_module.db, "__getitem__") as mock_col,
        ):
            m_term.return_value = {
                "service": "posts",
                "whitelist": [
                    {
                        "username": "remote-user",
                        "provider": remote_provider,
                        "create": True,
                    }
                ],
                "blacklist": [],
                "cross_origins": ["auth.remote.web10.app"],
            }
            mock_col.return_value.insert_one.return_value = mock_result
            resp = client.post(
                "/alice/posts",
                json={
                    "token": remote_token,
                    "query": {"title": "remote-post"},
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        # The remote user's username is the author
        assert body.get("_author") == "remote-user"
        # The source node is the REMOTE provider, not our PROVIDER
        assert body.get("_source_node") == remote_provider
        assert body.get("_source_node") != settings.PROVIDER


# ---------------------------------------------------------------------------
# 12. PUBLIC MEDIA SERVICE — permission matrix (A12 / D35)
# ---------------------------------------------------------------------------


class TestPublicMediaServiceAllowlist:
    """The service field on MetadataCreate and ReadRequest is validated
    against exactly {"media", "public_media"}. Any other value is rejected
    at the Pydantic layer (422), not passed to is_permitted."""

    def test_metadata_create_default_service_is_media(self, client):
        """Default service for upload-confirm is 'media'."""
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=MOCK_TERM),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.create_media_record") as m_create,
        ):
            m_create.return_value = {"_id": "1", "url": "https://s3/x.jpg"}
            resp = client.post(
                "/v3/media/alice/upload/confirm",
                json={
                    "token": _owner_token("alice"),
                    "url": "https://s3/x.jpg",
                    "filename": "x.jpg",
                },
            )
        assert resp.status_code == 200
        call_kwargs = m_create.call_args[1]
        assert call_kwargs.get("service") == "media"

    def test_metadata_create_public_media_service(self, client):
        """Explicit service='public_media' passes through to DB."""
        mock_term_public = {
            "service": "public_media",
            "whitelist": [
                {
                    "username": "alice",
                    "provider": settings.PROVIDER,
                    "create": True,
                }
            ],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term_public),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.create_media_record") as m_create,
        ):
            m_create.return_value = {"_id": "2", "url": "https://s3/y.jpg"}
            resp = client.post(
                "/v3/media/alice/upload/confirm",
                json={
                    "token": _owner_token("alice"),
                    "url": "https://s3/y.jpg",
                    "filename": "y.jpg",
                    "service": "public_media",
                },
            )
        assert resp.status_code == 200
        call_kwargs = m_create.call_args[1]
        assert call_kwargs.get("service") == "public_media"

    def test_metadata_create_arbitrary_service_rejected(self, client):
        """service='posts' must be rejected at the model level (422)."""
        resp = client.post(
            "/v3/media/alice/upload/confirm",
            json={
                "token": _owner_token("alice"),
                "url": "https://s3/z.jpg",
                "filename": "z.jpg",
                "service": "posts",
            },
        )
        assert resp.status_code == 422

    def test_metadata_create_arbitrary_collection_rejected(self, client):
        """service='arbitrary_collection' must be rejected (422)."""
        resp = client.post(
            "/v3/media/alice/upload/confirm",
            json={
                "token": _owner_token("alice"),
                "url": "https://s3/z.jpg",
                "filename": "z.jpg",
                "service": "arbitrary_collection",
            },
        )
        assert resp.status_code == 422

    def test_read_request_arbitrary_service_rejected(self, client):
        """ReadRequest with service='anything' must be rejected (422)."""
        resp = client.post(
            "/v3/media/alice/read",
            json={
                "token": _owner_token("alice"),
                "object_key": "alice/abc/photo.jpg",
                "service": "anything",
            },
        )
        assert resp.status_code == 422


class TestPublicMediaPresignPermission:
    """Non-owner presign on public_media is allowed once terms grant it,
    still denied on 'media'. Star protection untouched."""

    def test_non_owner_presign_media_denied(self, client):
        """Bob has no read permission on alice's 'media' — presign denied."""
        mock_term_media = {
            "service": "media",
            "whitelist": [
                {
                    "username": "alice",
                    "provider": settings.PROVIDER,
                    "read": True,
                }
            ],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term_media),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.endpoints.media.get_s3_client"),
            patch("app.endpoints.media.get_s3_signing_client") as m_sign,
        ):
            m_sign.return_value.generate_presigned_url.return_value = "https://presigned"
            resp = client.post(
                "/v3/media/alice/read",
                json={
                    "token": _app_token("bob", "myapp.example.com"),
                    "object_key": "alice/abc/photo.jpg",
                },
            )
        assert resp.status_code == 401

    def test_non_owner_presign_public_media_allowed(self, client):
        """Bob has read permission on alice's 'public_media' — presign OK."""
        mock_term_public = {
            "service": "public_media",
            "whitelist": [
                {
                    "username": "bob",
                    "provider": settings.PROVIDER,
                    "read": True,
                }
            ],
            "blacklist": [],
            "cross_origins": ["myapp.example.com"],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term_public),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.endpoints.media.get_s3_client"),
            patch("app.endpoints.media.get_s3_signing_client") as m_sign,
        ):
            m_sign.return_value.generate_presigned_url.return_value = "https://presigned"
            resp = client.post(
                "/v3/media/alice/read",
                json={
                    "token": _app_token("bob", "myapp.example.com"),
                    "object_key": "alice/abc/photo.jpg",
                    "service": "public_media",
                },
            )
        assert resp.status_code == 200
        assert "read_url" in resp.json()

    def test_non_owner_presign_public_media_denied_without_term(self, client):
        """Bob has no whitelist on 'public_media' — presign denied."""
        mock_term_public = {
            "service": "public_media",
            "whitelist": [],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term_public),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.endpoints.media.get_s3_client"),
            patch("app.endpoints.media.get_s3_signing_client"),
        ):
            resp = client.post(
                "/v3/media/alice/read",
                json={
                    "token": _app_token("bob", "myapp.example.com"),
                    "object_key": "alice/abc/photo.jpg",
                    "service": "public_media",
                },
            )
        assert resp.status_code == 401

    def test_owner_presign_public_media_always_ok(self, client):
        """Owner can always presign their own public_media."""
        mock_term_public = {
            "service": "public_media",
            "whitelist": [],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term_public),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.endpoints.media.get_s3_client"),
            patch("app.endpoints.media.get_s3_signing_client") as m_sign,
        ):
            m_sign.return_value.generate_presigned_url.return_value = "https://presigned"
            resp = client.post(
                "/v3/media/alice/read",
                json={
                    "token": _owner_token("alice"),
                    "object_key": "alice/abc/photo.jpg",
                    "service": "public_media",
                },
            )
        assert resp.status_code == 200

    def test_owner_presign_media_always_ok(self, client):
        """Owner can always presign their own media (default service)."""
        mock_term_media = {
            "service": "media",
            "whitelist": [],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term_media),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.endpoints.media.get_s3_client"),
            patch("app.endpoints.media.get_s3_signing_client") as m_sign,
        ):
            m_sign.return_value.generate_presigned_url.return_value = "https://presigned"
            resp = client.post(
                "/v3/media/alice/read",
                json={
                    "token": _owner_token("alice"),
                    "object_key": "alice/abc/photo.jpg",
                },
            )
        assert resp.status_code == 200


class TestPublicMediaListPermission:
    """List route respects the service field for permission checks."""

    def test_list_default_service_media(self, client):
        """Default list uses 'media' service."""
        mock_term = {
            "service": "media",
            "whitelist": [
                {
                    "username": "alice",
                    "provider": settings.PROVIDER,
                    "read": True,
                }
            ],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.read_media_records") as m_read,
        ):
            m_read.return_value = [{"_id": "1", "url": "https://s3/x.jpg"}]
            resp = client.post(
                "/v3/media/alice/list",
                json={"token": _owner_token("alice")},
            )
        assert resp.status_code == 200
        call_kwargs = m_read.call_args[1]
        assert call_kwargs.get("service") == "media"

    def test_list_public_media_service(self, client):
        """Explicit service='public_media' on list."""
        mock_term = {
            "service": "public_media",
            "whitelist": [
                {
                    "username": "alice",
                    "provider": settings.PROVIDER,
                    "read": True,
                }
            ],
            "blacklist": [],
            "cross_origins": [],
        }
        with (
            patch("app.services.documentdb.get_star", return_value=MOCK_STAR),
            patch("app.services.documentdb.get_term_record", return_value=mock_term),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.read_media_records") as m_read,
        ):
            m_read.return_value = [{"_id": "2", "url": "https://s3/y.jpg"}]
            resp = client.post(
                "/v3/media/alice/list",
                json={"token": _owner_token("alice"), "service": "public_media"},
            )
        assert resp.status_code == 200
        call_kwargs = m_read.call_args[1]
        assert call_kwargs.get("service") == "public_media"

    def test_list_arbitrary_service_rejected(self, client):
        """List with service='posts' rejected at model level (422)."""
        resp = client.post(
            "/v3/media/alice/list",
            json={"token": _owner_token("alice"), "service": "posts"},
        )
        assert resp.status_code == 422


class TestPublicMediaStarProtection:
    """Star protection is untouched — media endpoints don't expose the
    star record, and the service allowlist prevents naming '*'."""

    def test_service_star_rejected(self, client):
        """service='*' must be rejected at the model level."""
        resp = client.post(
            "/v3/media/alice/upload/confirm",
            json={
                "token": _owner_token("alice"),
                "url": "https://s3/x.jpg",
                "filename": "x.jpg",
                "service": "*",
            },
        )
        assert resp.status_code == 422

    def test_read_service_star_rejected(self, client):
        """ReadRequest with service='*' rejected."""
        resp = client.post(
            "/v3/media/alice/read",
            json={
                "token": _owner_token("alice"),
                "object_key": "alice/abc/photo.jpg",
                "service": "*",
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 13. EMAIL VERIFICATION (A20 bite a)
# ---------------------------------------------------------------------------


class TestEmailSet:
    """Owner can set their own email; non-owner cannot set another user's email."""

    _CFG = {"provider": "api.localhost", "admins": ["alice", "bob"]}

    def test_owner_sets_email(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.get_star", return_value={**MOCK_STAR, "email": None}),
            patch("app.services.documentdb.get_email_record", return_value=None),
            patch("app.services.documentdb.set_email"),
            patch("app.services.documentdb.register_email"),
            patch("app.services.email.send_verification_code") as m_send,
        ):
            m_send.return_value = "123456"
            resp = client.post(
                "/set_email",
                json={
                    "token": _owner_token("alice"),
                    "query": {"email": "alice@example.com"},
                },
            )
        assert resp.status_code == 200
        assert resp.json()["code"] == "123456"

    def test_non_owner_cannot_set_another_user_email(self, client):
        """Bob cannot set alice's email — check_admin ensures only the
        token's user acts on their own account."""
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.get_star", return_value={**MOCK_STAR, "username": "bob", "email": None}),
            patch("app.services.documentdb.get_email_record", return_value=None),
            patch("app.services.documentdb.set_email") as m_set,
            patch("app.services.documentdb.register_email") as m_reg,
            patch("app.services.email.send_verification_code"),
        ):
            resp = client.post(
                "/set_email",
                json={
                    "token": _owner_token("bob"),
                    "query": {"email": "alice@example.com"},
                },
            )
        # Bob's token decodes to bob, so set_email is called for bob, not alice
        assert resp.status_code == 200
        m_set.assert_called_once_with("alice@example.com", "bob")
        m_reg.assert_called_once_with("alice@example.com", "bob")

    def test_non_admin_cannot_set_email(self, client):
        """Non-admin token is rejected."""
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/set_email",
                json={
                    "token": _owner_token("charlie"),
                    "query": {"email": "charlie@example.com"},
                },
            )
        assert resp.status_code == 403

    def test_bad_email_rejected(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/set_email",
                json={
                    "token": _owner_token("alice"),
                    "query": {"email": "not-an-email"},
                },
            )
        assert resp.status_code == 400

    def test_email_taken_by_another_user(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.get_star", return_value={**MOCK_STAR, "email": None}),
            patch(
                "app.services.documentdb.get_email_record",
                return_value={"email": "taken@example.com", "username": "bob"},
            ),
        ):
            resp = client.post(
                "/set_email",
                json={
                    "token": _owner_token("alice"),
                    "query": {"email": "taken@example.com"},
                },
            )
        assert resp.status_code == 409


class TestEmailGet:
    """Owner can read their own email; non-owner cannot read another user's email."""

    _CFG = {"provider": "api.localhost", "admins": ["alice"]}

    def test_owner_gets_own_email(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch(
                "app.services.documentdb.get_star",
                return_value={**MOCK_STAR, "email": "alice@example.com", "email_verified": True},
            ),
            patch("app.services.documentdb.get_email", return_value="alice@example.com"),
            patch("app.services.documentdb.is_email_verified", return_value=True),
        ):
            resp = client.post(
                "/get_email",
                json={"token": _owner_token("alice")},
            )
        assert resp.status_code == 200
        assert resp.json()["email"] == "alice@example.com"
        assert resp.json()["email_verified"] is True

    def test_owner_no_email_returns_404(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.get_email", return_value=None),
        ):
            resp = client.post(
                "/get_email",
                json={"token": _owner_token("alice")},
            )
        assert resp.status_code == 404

    def test_non_owner_reads_own_email_not_others(self, client):
        """Bob's token returns bob's email, not alice's — the endpoint
        reads the token's username, not a target parameter."""
        mock_bob_star = {**MOCK_STAR, "username": "bob", "email": "bob@example.com"}
        with (
            patch("app.services.config.get_config", return_value={"provider": "api.localhost", "admins": ["bob"]}),
            patch("app.services.documentdb.get_star", return_value=mock_bob_star),
            patch("app.services.documentdb.get_email", return_value="bob@example.com"),
            patch("app.services.documentdb.is_email_verified", return_value=False),
        ):
            resp = client.post(
                "/get_email",
                json={"token": _owner_token("bob")},
            )
        assert resp.status_code == 200
        assert resp.json()["email"] == "bob@example.com"

    def test_non_admin_cannot_get_email(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/get_email",
                json={"token": _owner_token("charlie")},
            )
        assert resp.status_code == 403


class TestEmailVerify:
    """Owner can verify their email with a code; non-owner cannot verify another user's email."""

    _CFG = {"provider": "api.localhost", "admins": ["alice"]}

    def test_owner_verifies_email(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.get_star", return_value={**MOCK_STAR, "email": "alice@example.com"}),
            patch("app.services.documentdb.get_email", return_value="alice@example.com"),
            patch("app.services.email.check_verification", return_value=True),
            patch("app.services.documentdb.set_email_verified"),
        ):
            resp = client.post(
                "/verify_email",
                json={
                    "token": _owner_token("alice"),
                    "query": {"email": "alice@example.com", "code": "123456"},
                },
            )
        assert resp.status_code == 200
        assert resp.json()["verified"] is True

    def test_wrong_email_rejected(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.get_email", return_value="alice@example.com"),
        ):
            resp = client.post(
                "/verify_email",
                json={
                    "token": _owner_token("alice"),
                    "query": {"email": "other@example.com", "code": "123456"},
                },
            )
        assert resp.status_code == 400

    def test_missing_code_rejected(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/verify_email",
                json={
                    "token": _owner_token("alice"),
                    "query": {"email": "alice@example.com"},
                },
            )
        assert resp.status_code == 400

    def test_non_admin_cannot_verify_email(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/verify_email",
                json={
                    "token": _owner_token("charlie"),
                    "query": {"email": "charlie@example.com", "code": "123456"},
                },
            )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 14. RECOVERY PHONE (B9 bite a-fix)
# ---------------------------------------------------------------------------


class TestSetRecoveryPhone:
    """Owner can set their own recovery phone; a token can only ever write to
    its OWN user's star record (non-owner pin); non-admins rejected; rate
    limited per user."""

    _CFG = {"provider": "api.localhost", "admins": ["alice", "bob"]}

    @pytest.fixture(autouse=True)
    def _clear_rate_limit(self):
        from app.endpoints import auth as auth_endpoints

        auth_endpoints._recovery_phone_attempts.clear()
        yield
        auth_endpoints._recovery_phone_attempts.clear()

    def test_owner_sets_recovery_phone(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.set_phone_number") as m_set,
        ):
            resp = client.post(
                "/set_recovery_phone",
                json={
                    "token": _owner_token("alice"),
                    "query": {"phone": "+15559876543"},
                },
            )
        assert resp.status_code == 200
        assert resp.json()["phone_number"] == "+15559876543"
        m_set.assert_called_once_with("+15559876543", "alice")

    def test_non_owner_cannot_set_another_users_phone(self, client):
        """Bob's token writes to bob's star record — there is no target
        parameter, so a non-owner can never name another user."""
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.set_phone_number") as m_set,
        ):
            resp = client.post(
                "/set_recovery_phone",
                json={
                    "token": _owner_token("bob"),
                    "query": {"phone": "+15559876543"},
                },
            )
        assert resp.status_code == 200
        m_set.assert_called_once_with("+15559876543", "bob")

    def test_non_admin_user_can_set_own_phone(self, client):
        """The B9 nudge targets EVERY user — unlike /set_email there is no
        admin gate; any certified token sets its own user's phone."""
        with patch("app.services.documentdb.set_phone_number") as m_set:
            resp = client.post(
                "/set_recovery_phone",
                json={
                    "token": _owner_token("charlie"),
                    "query": {"phone": "+15559876543"},
                },
            )
        assert resp.status_code == 200
        m_set.assert_called_once_with("+15559876543", "charlie")

    def test_anon_token_rejected(self, client):
        resp = client.post(
            "/set_recovery_phone",
            json={"token": None, "query": {"phone": "+15559876543"}},
        )
        assert resp.status_code == 401

    def test_forged_token_rejected(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/set_recovery_phone",
                json={
                    "token": _forged_token("alice"),
                    "query": {"phone": "+15559876543"},
                },
            )
        assert resp.status_code == 401

    def test_bad_phone_rejected(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/set_recovery_phone",
                json={
                    "token": _owner_token("alice"),
                    "query": {"phone": "abc"},
                },
            )
        assert resp.status_code == 401  # BAD_NUM

    def test_missing_phone_rejected(self, client):
        with patch("app.services.config.get_config", return_value=dict(self._CFG)):
            resp = client.post(
                "/set_recovery_phone",
                json={"token": _owner_token("alice"), "query": {}},
            )
        assert resp.status_code == 401  # BAD_NUM

    def test_rate_limited_after_five_saves(self, client):
        with (
            patch("app.services.config.get_config", return_value=dict(self._CFG)),
            patch("app.services.documentdb.set_phone_number") as m_set,
        ):
            for i in range(5):
                resp = client.post(
                    "/set_recovery_phone",
                    json={
                        "token": _owner_token("alice"),
                        "query": {"phone": f"+1555987654{i}"},
                    },
                )
                assert resp.status_code == 200
            resp = client.post(
                "/set_recovery_phone",
                json={
                    "token": _owner_token("alice"),
                    "query": {"phone": "+15559876540"},
                },
            )
        assert resp.status_code == 429
        assert m_set.call_count == 5


class TestEmailService:
    """Unit tests for the email verification service."""

    def test_generate_code_is_six_digits(self):
        from app.services.email import generate_code

        code = generate_code()
        assert len(code) == 6
        assert code.isdigit()

    def test_send_verification_code_valid(self):
        from app.services.email import send_verification_code

        with patch("app.services.email.db") as mock_db:
            mock_db.list_collection_names.return_value = []
            mock_db.create_collection.return_value = None
            mock_web10 = MagicMock()
            mock_col = MagicMock()
            mock_web10.__getitem__.return_value = mock_col
            mock_db.__getitem__.return_value = mock_web10
            code = send_verification_code("test@example.com")
        assert len(code) == 6
        assert code.isdigit()
        mock_col.update_one.assert_called_once()

    def test_send_verification_code_invalid_email(self):
        from app.services.email import send_verification_code

        with pytest.raises(Exception):
            send_verification_code("not-an-email")

    def test_check_verification_correct_code(self):
        from app.services.email import check_verification, send_verification_code

        with patch("app.services.email.db") as mock_db:
            mock_db.list_collection_names.return_value = ["web10.email_verification_codes"]
            mock_web10 = MagicMock()
            mock_col = MagicMock()
            mock_web10.__getitem__.return_value = mock_col
            mock_db.__getitem__.return_value = mock_web10
            code = send_verification_code("test@example.com")
            mock_col.find_one.return_value = {
                "email": "test@example.com",
                "code": code,
                "expires_at": datetime.utcnow() + timedelta(minutes=5),
            }
            result = check_verification("test@example.com", code)
        assert result is True

    def test_check_verification_wrong_code(self):
        from app.services.email import check_verification

        with patch("app.services.email.db") as mock_db:
            mock_db.list_collection_names.return_value = ["web10.email_verification_codes"]
            mock_web10 = MagicMock()
            mock_col = MagicMock()
            mock_web10.__getitem__.return_value = mock_col
            mock_db.__getitem__.return_value = mock_web10
            mock_col.find_one.return_value = {
                "email": "test@example.com",
                "code": "123456",
                "expires_at": datetime.utcnow() + timedelta(minutes=5),
            }
            with pytest.raises(Exception):
                check_verification("test@example.com", "000000")

    def test_check_verification_expired_code(self):
        from app.services.email import check_verification

        with patch("app.services.email.db") as mock_db:
            mock_db.list_collection_names.return_value = ["web10.email_verification_codes"]
            mock_web10 = MagicMock()
            mock_col = MagicMock()
            mock_web10.__getitem__.return_value = mock_col
            mock_db.__getitem__.return_value = mock_web10
            mock_col.find_one.return_value = {
                "email": "test@example.com",
                "code": "123456",
                "expires_at": datetime.utcnow() - timedelta(minutes=5),
            }
            with pytest.raises(Exception):
                check_verification("test@example.com", "123456")


class TestEmailStarRecord:
    """The star record template includes email fields."""

    def test_star_record_has_email_fields(self):
        from app.services.records import star_record

        rec = star_record()
        assert "email" in rec
        assert "email_verified" in rec
        assert rec["email"] is None
        assert rec["email_verified"] is False
