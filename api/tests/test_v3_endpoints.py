"""Tests for v3 endpoints — all POST, action in URL."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app


def _make_token(username="testuser", **extra):
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + __import__("datetime").timedelta(minutes=60)).isoformat(),
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


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


class TestCreate:
    def test_create_with_groups(self, client, token):
        with patch("app.v3.services.clickhouse._gen_doc_id", return_value="doc-1"):
            resp = client.post(
                "/v3/create",
                json={
                    "token": token,
                    "collection": "posts",
                    "body": {"text": "hello"},
                    "groups": ["g1"],
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["doc_id"] == "doc-1"
        assert data["groups"] == ["g1"]

    def test_create_no_groups(self, client, token):
        with patch("app.v3.services.clickhouse._gen_doc_id", return_value="doc-2"):
            resp = client.post(
                "/v3/create",
                json={
                    "token": token,
                    "collection": "posts",
                    "body": {"text": "private"},
                },
            )
        assert resp.status_code == 200
        assert "groups" not in resp.json()

    def test_no_body(self, client, token):
        resp = client.post("/v3/create", json={"token": token, "collection": "posts"})
        assert resp.status_code == 401


class TestRead:
    def test_personal_read(self, client, token):
        mock_rows = [
            ("doc-1", "testuser", "posts", '{"text":"mine"}', "", [], datetime(2026, 1, 1), datetime(2026, 1, 1)),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post(
                "/v3/read",
                json={
                    "token": token,
                    "collection": "posts",
                    "groups": ["me"],
                    "limit": 10,
                },
            )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_group_read(self, client, token):
        mock_rows = [
            ("doc-1", "bob", '{"text":"shared"}', [], datetime(2026, 1, 1), ""),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post(
                "/v3/read",
                json={
                    "token": token,
                    "collection": "posts",
                    "groups": ["g1"],
                },
            )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_no_token(self, client):
        resp = client.post("/v3/read", json={"token": None, "groups": ["me"]})
        assert resp.status_code == 401


class TestUpdate:
    def test_update_preserves_created_at(self, client, token):
        original_created = datetime(2026, 1, 1)
        mock_rows = [
            ("doc-1", "testuser", "posts", '{"text":"old"}', "", [], original_created, original_created),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post(
                "/v3/update",
                json={
                    "token": token,
                    "doc_id": "doc-1",
                    "body": {"text": "updated"},
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created_at"] == "2026-01-01 00:00:00"
        assert data["updated_at"] != data["created_at"]

    def test_update_not_found(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: [])
            resp = client.post(
                "/v3/update",
                json={
                    "token": token,
                    "doc_id": "doc-1",
                    "body": {"text": "x"},
                },
            )
        assert resp.status_code == 404


class TestDelete:
    def test_delete(self, client, token):
        mock_rows = [
            ("doc-1", "testuser", "posts", '{"text":"x"}', "", [], datetime(2026, 1, 1), datetime(2026, 1, 1)),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/delete", json={"token": token, "doc_id": "doc-1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------


class TestCreateGroup:
    def test_create(self, client, token):
        resp = client.post(
            "/v3/groups/create",
            json={
                "token": token,
                "name": "Test Group",
                "join_policy": "open",
                "roles": [{"name": "member", "services": ["posts"], "permissions": ["readAll"]}],
                "members": [{"member_key": "testuser", "role": "member"}],
            },
        )
        assert resp.status_code == 200
        assert "group_id" in resp.json()

    def test_missing_fields(self, client, token):
        resp = client.post("/v3/groups/create", json={"token": token, "name": "Test"})
        assert resp.status_code == 401


class TestListGroups:
    def test_get(self, client, token):
        mock_rows = [("g1", "open", "admin", 5)]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/groups/list", json={"token": token})
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestJoinGroup:
    def test_open_join(self, client, token):
        mock_rows = [("g1", '{"roles":[]}', "open", datetime(2026, 1, 1), datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/groups/join", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "member"

    def test_request_join(self, client, token):
        mock_rows = [("g1", '{"roles":[]}', "request", datetime(2026, 1, 1), datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/groups/join", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    def test_invite_only_join(self, client, token):
        mock_rows = [("g1", '{"roles":[]}', "invite_only", datetime(2026, 1, 1), datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/groups/join", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 401


class TestAcceptInvite:
    def test_accept(self, client, token):
        with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=True):
            resp = client.post("/v3/groups/accept-invite", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "member"

    def test_no_invite(self, client, token):
        with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=False):
            resp = client.post("/v3/groups/accept-invite", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 401


class TestDeclineInvite:
    def test_decline(self, client, token):
        with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=True):
            resp = client.post("/v3/groups/decline-invite", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "declined"

    def test_no_invite(self, client, token):
        with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=False):
            resp = client.post("/v3/groups/decline-invite", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 401


class TestLeaveGroup:
    def test_leave(self, client, token):
        resp = client.post("/v3/groups/leave", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "left"


class TestInviteMember:
    def test_invite(self, client, token):
        mock_rows = [("testuser", "admin", datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post(
                "/v3/groups/invite",
                json={
                    "token": token,
                    "group_id": "g1",
                    "member_key": "bob",
                    "role": "member",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["invited_key"] == "bob"
        assert data["status"] == "invited"


# ---------------------------------------------------------------------------
# Service Contracts
# ---------------------------------------------------------------------------


class TestServiceContracts:
    def test_add(self, client, token):
        resp = client.post(
            "/v3/service-contracts/add",
            json={
                "token": token,
                "service_name": "posts",
                "allowed_origin": "myapp.com",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["service_name"] == "posts"

    def test_list(self, client, token):
        mock_rows = [("posts", "myapp.com")]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/service-contracts/list", json={"token": token})
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# Blocking
# ---------------------------------------------------------------------------


class TestBlocking:
    def test_block(self, client, token):
        resp = client.post("/v3/block", json={"token": token, "blocked_key": "bob"})
        assert resp.status_code == 200
        assert resp.json()["blocked_key"] == "bob"

    def test_unblock(self, client, token):
        resp = client.post("/v3/unblock", json={"token": token, "blocked_key": "bob"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Sharing
# ---------------------------------------------------------------------------


class TestSharing:
    def test_disable_sharing(self, client, token):
        resp = client.post(
            "/v3/sharing/set",
            json={
                "token": token,
                "group_id": "g1",
                "enabled": False,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["sharing_enabled"] is False

    def test_enable_sharing(self, client, token):
        resp = client.post(
            "/v3/sharing/set",
            json={
                "token": token,
                "group_id": "g1",
                "enabled": True,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["sharing_enabled"] is True


# ---------------------------------------------------------------------------
# Read by doc_id
# ---------------------------------------------------------------------------


class TestReadById:
    def test_read_by_id(self, client, token):
        mock_rows = [
            ("doc-1", "bob", '{"text":"hello"}', [], datetime(2026, 1, 1), ""),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post(
                "/v3/read-by-id",
                json={
                    "token": token,
                    "doc_id": "doc-1",
                    "collection": "posts",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["doc_id"] == "doc-1"

    def test_read_by_id_not_found(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: [])
            resp = client.post(
                "/v3/read-by-id",
                json={
                    "token": token,
                    "doc_id": "doc-1",
                    "collection": "posts",
                },
            )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Groups: manages
# ---------------------------------------------------------------------------


class TestGroupsManages:
    def test_manages(self, client, token):
        mock_rows = [("g1", "open", "admin", 5)]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_rows),
                MagicMock(result_rows=lambda: [('{"roles":[{"name":"admin","permissions":["manageRoles"]}]}',)]),
            ]
            resp = client.post("/v3/groups/manages", json={"token": token})
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# Groups: members list (getMembers)
# ---------------------------------------------------------------------------


class TestGroupMembersList:
    def test_list_members(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_members = [("alice", "member", datetime(2026, 1, 1)), ("bob", "member", datetime(2026, 1, 2))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_members),
            ]
            resp = client.post("/v3/groups/members/list", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# Block in group
# ---------------------------------------------------------------------------


class TestBlockInGroup:
    def test_block_in_group(self, client, token):
        resp = client.post(
            "/v3/block-in-group",
            json={
                "token": token,
                "group_id": "g1",
                "blocked_key": "bob",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["blocked_key"] == "bob"
        assert resp.json()["group_id"] == "g1"

    def test_unblock_in_group(self, client, token):
        resp = client.post(
            "/v3/unblock-in-group",
            json={
                "token": token,
                "group_id": "g1",
                "blocked_key": "bob",
            },
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Node stats
# ---------------------------------------------------------------------------


class TestNodeStats:
    def test_stats(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: [(42,)]),
                MagicMock(result_rows=lambda: [(100,)]),
                MagicMock(result_rows=lambda: [(5,)]),
            ]
            resp = client.post("/v3/stats", json={"token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert data["users"] == 42
        assert data["documents"] == 100
        assert data["groups"] == 5
