"""Tests for POST /v3/session/verify — the confirmatory session-health oracle.

Pins every verdict code and the decisive-vs-unknown rule: a store that is
UNREADABLE yields `unknown` (no action), a store that is readable and EMPTY
yields the decisive negative (action). This is the definite-NO-vs-UNKNOWN
split that keeps a deploy window from churning every user into a re-auth loop.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app


def _make_token(username="testuser", expired=False, **extra):
    delta = -60 if expired else 60
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=delta)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


@pytest.fixture
def token():
    return _make_token()


FOLLOWERS = f"{settings.PROVIDER}/groups/users/testuser/followers"


def _verify(client, token, services=None, operations=None, origin="http://social.localhost"):
    body = {"token": token}
    if services is not None:
        body["services"] = services
    if operations is not None:
        body["operations"] = operations
    headers = {"Origin": origin} if origin else {}
    return client.post("/v3/session/verify", json=body, headers=headers)


_DEFAULT = object()


def _healthy_store(get_user=_DEFAULT, get_app_permissions=_DEFAULT, get_group=_DEFAULT, is_group_member=_DEFAULT):
    """Patch the four store checks. Omit a param for a healthy default; pass an
    explicit value (including None) to force that state."""
    gu = {"username": "testuser"} if get_user is _DEFAULT else get_user
    gap = (
        {"posts": ["readAll", "create"], "profile": ["readAll"]}
        if get_app_permissions is _DEFAULT
        else get_app_permissions
    )
    gg = {"group_id": FOLLOWERS} if get_group is _DEFAULT else get_group
    igm = True if is_group_member is _DEFAULT else is_group_member
    return (
        patch("app.v3.services.clickhouse.get_user", return_value=gu),
        patch("app.v3.services.clickhouse.get_app_permissions", return_value=gap),
        patch("app.v3.services.clickhouse.get_group", return_value=gg),
        patch("app.v3.services.clickhouse.is_group_member", return_value=igm),
    )


def _enter(*patches):
    started = [p.start() for p in patches]
    return started


class TestTokenStates:
    def test_missing_token_is_invalid(self, client):
        resp = _verify(client, None)
        assert resp.status_code == 200
        data = resp.json()
        assert data["token"] == "missing"
        assert data["status"] == "invalid"
        assert data["actions"] == ["reauth"]

    def test_expired_token_is_invalid(self, client):
        resp = _verify(client, _make_token(expired=True))
        data = resp.json()
        assert data["token"] == "expired"
        assert data["status"] == "invalid"
        assert data["actions"] == ["reauth"]
        # A dead token can't be checked further — the store fields stay unknown.
        assert data["user"] == "unknown"
        assert data["contract"]["state"] == "not_checked" or data["contract"]["state"] == "unknown"

    def test_malformed_token_is_invalid(self, client):
        resp = _verify(client, "not-a-real-jwt")
        data = resp.json()
        assert data["token"] == "invalid"
        assert data["status"] == "invalid"
        assert data["actions"] == ["reauth"]

    def test_bad_signature_token_is_invalid(self, client):
        # A well-formed JWT signed with the WRONG key.
        forged = jwt.encode(
            {
                "username": "testuser",
                "site": "auth.localhost",
                "target": settings.PROVIDER,
                "provider": settings.PROVIDER,
                "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
            },
            "wrong-secret",
            algorithm=settings.ALGORITHM,
        )
        data = _verify(client, forged).json()
        assert data["token"] == "invalid"
        assert data["status"] == "invalid"


class TestHealthySession:
    def test_ok(self, client, token):
        p = _healthy_store()
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts", "profile"]).json()
            assert data["status"] == "ok"
            assert data["token"] == "valid"
            assert data["user"] == "exists"
            assert data["contract"]["state"] == "granted"
            assert data["contract"]["missing_services"] == []
            assert data["groups"]["followers"] == "ok"
            assert data["actions"] == []
            assert data["username"] == "testuser"
        finally:
            for x in p:
                x.stop()

    def test_no_services_is_a_health_probe_not_inconclusive(self, client, token):
        # Declaring no services = a health probe; the unchecked contract must
        # not taint the verdict.
        p = _healthy_store()
        _enter(*p)
        try:
            data = _verify(client, token).json()
            assert data["contract"]["state"] == "not_checked"
            assert data["status"] == "ok"
            assert data["actions"] == []
        finally:
            for x in p:
                x.stop()


class TestUserStates:
    def test_user_not_found_is_invalid_signout(self, client, token):
        p = _healthy_store(get_user=None)
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["user"] == "not_found"
            assert data["status"] == "invalid"
            # Re-auth can't resurrect a deleted account — terminal sign-out,
            # NOT reauth.
            assert data["actions"] == ["signout"]
        finally:
            for x in p:
                x.stop()


class TestContractStates:
    def test_contract_missing_is_degraded_reauth(self, client, token):
        p = _healthy_store(get_app_permissions={})
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts", "profile"]).json()
            assert data["contract"]["state"] == "missing"
            assert data["contract"]["missing_services"] == ["posts", "profile"]
            assert data["status"] == "degraded"
            assert data["actions"] == ["reauth"]
        finally:
            for x in p:
                x.stop()

    def test_contract_partial_is_degraded_reauth(self, client, token):
        # Grants posts but not profile → partial, profile is the missing one.
        p = _healthy_store(get_app_permissions={"posts": ["readAll", "create"]})
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts", "profile"]).json()
            assert data["contract"]["state"] == "partial"
            assert data["contract"]["missing_services"] == ["profile"]
            assert data["status"] == "degraded"
            assert data["actions"] == ["reauth"]
        finally:
            for x in p:
                x.stop()

    def test_contract_requires_all_declared_operations(self, client, token):
        # Grants readAll but the app also needs create → the service is missing.
        p = _healthy_store(get_app_permissions={"posts": ["readAll"]})
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"], operations=["readAll", "create"]).json()
            assert data["contract"]["state"] == "missing"
            assert data["contract"]["missing_services"] == ["posts"]
        finally:
            for x in p:
                x.stop()


class TestGroupStates:
    def test_group_not_member_is_degraded_heal(self, client, token):
        p = _healthy_store(is_group_member=False)
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["groups"]["followers"] == "not_member"
            assert data["status"] == "degraded"
            assert data["actions"] == ["heal_followers_group"]
        finally:
            for x in p:
                x.stop()

    def test_group_missing_is_degraded_heal(self, client, token):
        p = _healthy_store(get_group=None)
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["groups"]["followers"] == "missing"
            assert data["status"] == "degraded"
            assert data["actions"] == ["heal_followers_group"]
        finally:
            for x in p:
                x.stop()


class TestUnknownVsDecisive:
    """The load-bearing rule: unreadable store → unknown (no action), not the
    decisive negative. A deploy window must not look like 'contract missing'."""

    def test_contract_store_unreadable_is_unknown_not_missing(self, client, token):
        p = (
            patch("app.v3.services.clickhouse.get_user", return_value={"username": "testuser"}),
            patch("app.v3.services.clickhouse.get_app_permissions", side_effect=ConnectionError("store down")),
            patch("app.v3.services.clickhouse.get_group", return_value={"group_id": FOLLOWERS}),
            patch("app.v3.services.clickhouse.is_group_member", return_value=True),
        )
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["contract"]["state"] == "unknown"
            assert data["contract"]["missing_services"] == []
            # inconclusive (a check couldn't run), NOT degraded — no action.
            assert data["status"] == "inconclusive"
            assert data["actions"] == []
        finally:
            for x in p:
                x.stop()

    def test_user_store_unreadable_is_unknown(self, client, token):
        p = (
            patch("app.v3.services.clickhouse.get_user", side_effect=ConnectionError("store down")),
            patch("app.v3.services.clickhouse.get_app_permissions", return_value={"posts": ["readAll"]}),
            patch("app.v3.services.clickhouse.get_group", return_value={"group_id": FOLLOWERS}),
            patch("app.v3.services.clickhouse.is_group_member", return_value=True),
        )
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["user"] == "unknown"
            assert data["status"] == "inconclusive"
            assert data["actions"] == []
        finally:
            for x in p:
                x.stop()

    def test_group_store_unreadable_is_unknown(self, client, token):
        p = (
            patch("app.v3.services.clickhouse.get_user", return_value={"username": "testuser"}),
            patch("app.v3.services.clickhouse.get_app_permissions", return_value={"posts": ["readAll"]}),
            patch("app.v3.services.clickhouse.get_group", side_effect=ConnectionError("store down")),
            patch("app.v3.services.clickhouse.is_group_member", return_value=True),
        )
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["groups"]["followers"] == "unknown"
            assert data["status"] == "inconclusive"
            assert data["actions"] == []
        finally:
            for x in p:
                x.stop()


class TestActionOrdering:
    def test_reauth_before_heal_when_both_needed(self, client, token):
        # Contract missing AND group broken → reauth first (heal needs a live
        # session), then the local heal.
        p = _healthy_store(get_app_permissions={}, is_group_member=False)
        _enter(*p)
        try:
            data = _verify(client, token, services=["posts"]).json()
            assert data["status"] == "degraded"
            assert data["actions"] == ["reauth", "heal_followers_group"]
        finally:
            for x in p:
                x.stop()

    def test_expired_token_does_not_also_heal_group(self, client):
        # A dead token can't check the group, so no heal action is emitted —
        # reauth first, the next verify re-checks the group.
        data = _verify(client, _make_token(expired=True), services=["posts"]).json()
        assert data["actions"] == ["reauth"]
        assert data["groups"]["followers"] == "unknown"
