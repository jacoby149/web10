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
                    "service": "posts",
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
                    "service": "posts",
                    "body": {"text": "private"},
                },
            )
        assert resp.status_code == 200
        assert "groups" not in resp.json()

    def test_no_body(self, client, token):
        resp = client.post("/v3/create", json={"token": token, "service": "posts"})
        assert resp.status_code == 422


class TestRead:
    def test_personal_read(self, client, token):
        mock_groups = [("g1", "open", "member", 3)]
        mock_docs = [("doc-1", "bob", '{"text":"mine"}', [], datetime(2026, 1, 1), "")]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_groups),
                MagicMock(result_rows=lambda: mock_docs),
            ]
            resp = client.post(
                "/v3/read",
                json={
                    "token": token,
                    "service": "posts",
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
                    "service": "posts",
                    "groups": ["g1"],
                },
            )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_no_token(self, client):
        resp = client.post("/v3/read", json={"token": None, "groups": ["me"]})
        assert resp.status_code == 422

    def test_me_shorthand(self, client, token):
        mock_groups = [("g1", "open", "member", 3)]
        mock_docs = [("doc-1", "bob", '{"text":"hello"}', [], datetime(2026, 1, 1), "")]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_groups),
                MagicMock(result_rows=lambda: mock_docs),
            ]
            resp = client.post(
                "/v3/read",
                json={
                    "token": token,
                    "service": "posts",
                    "groups": ["me"],
                },
            )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


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
        assert resp.status_code == 422


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
        with (
            patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=True),
            patch(
                "app.v3.services.clickhouse.get_pending_requests",
                return_value=[
                    {"requester_key": "testuser", "status": "invited", "role": "editor", "requested_at": "2026-01-01"}
                ],
            ),
        ):
            resp = client.post("/v3/groups/accept-invite", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "editor"

    def test_accept_no_role_uses_member(self, client, token):
        with (
            patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=True),
            patch(
                "app.v3.services.clickhouse.get_pending_requests",
                return_value=[
                    {"requester_key": "testuser", "status": "invited", "role": "", "requested_at": "2026-01-01"}
                ],
            ),
        ):
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


class TestJoinRequests:
    """Join request approval/denial endpoints (owner/moderator only)."""

    def test_list_join_requests(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"admin","permissions":["assignRoles"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        mock_requests = [("bob", "pending", "", datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
                MagicMock(result_rows=lambda: mock_requests),
            ]
            resp = client.post("/v3/groups/requests/join/list", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()[0]["requester_key"] == "bob"

    def test_list_join_requests_no_permission(self, client, token):
        mock_member = [("testuser", "member", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"member","permissions":["readAll"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
            resp = client.post("/v3/groups/requests/join/list", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 401

    def test_approve_join_request(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"admin","permissions":["assignRoles"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
            with (
                patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=True),
                patch(
                    "app.v3.services.clickhouse.get_pending_requests",
                    return_value=[
                        {"requester_key": "bob", "status": "invited", "role": "editor", "requested_at": "2026-01-01"}
                    ],
                ),
            ):
                resp = client.post(
                    "/v3/groups/requests/join/approve",
                    json={"token": token, "group_id": "g1", "requester_key": "bob"},
                )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"
        assert resp.json()["role"] == "editor"

    def test_approve_no_request(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"admin","permissions":["assignRoles"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
            with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=False):
                resp = client.post(
                    "/v3/groups/requests/join/approve",
                    json={"token": token, "group_id": "g1", "requester_key": "bob"},
                )
        assert resp.status_code == 401

    def test_deny_join_request(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"admin","permissions":["assignRoles"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
            with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=True):
                resp = client.post(
                    "/v3/groups/requests/join/deny",
                    json={"token": token, "group_id": "g1", "requester_key": "bob"},
                )
        assert resp.status_code == 200
        assert resp.json()["status"] == "denied"

    def test_deny_no_request(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"admin","permissions":["assignRoles"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
            with patch("app.v3.services.clickhouse.has_pending_or_invited_request", return_value=False):
                resp = client.post(
                    "/v3/groups/requests/join/deny",
                    json={"token": token, "group_id": "g1", "requester_key": "bob"},
                )
        assert resp.status_code == 401


class TestInviteMember:
    def test_invite(self, client, token):
        mock_member = [("testuser", "admin", datetime(2026, 1, 1))]
        mock_group = [
            (
                "g1",
                '[{"name":"admin","permissions":["assignRoles"]}]',
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
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

    def test_invite_no_permission(self, client, token):
        mock_member = [("testuser", "member", datetime(2026, 1, 1))]
        mock_group = [
            ("g1", '[{"name":"member","permissions":[]}]', "open", datetime(2026, 1, 1), datetime(2026, 1, 1))
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=lambda: mock_member),
                MagicMock(result_rows=lambda: mock_group),
            ]
            resp = client.post(
                "/v3/groups/invite",
                json={
                    "token": token,
                    "group_id": "g1",
                    "member_key": "bob",
                    "role": "member",
                },
            )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# App Contracts
# ---------------------------------------------------------------------------


class TestAppContracts:
    def test_add(self, client, token):
        resp = client.post(
            "/v3/app-contracts/add",
            json={
                "token": token,
                "allowed_origin": "myapp.com",
                "permissions": {"posts": ["readAll", "create"], "playlists": ["readAll"]},
            },
        )
        assert resp.status_code == 200
        assert resp.json()["allowed_origin"] == "myapp.com"
        assert "posts" in resp.json()["permissions"]

    def test_add_missing_permissions(self, client, token):
        resp = client.post(
            "/v3/app-contracts/add",
            json={
                "token": token,
                "allowed_origin": "myapp.com",
            },
        )
        assert resp.status_code == 422

    def test_list(self, client, token):
        mock_rows = [("myapp.com", '{"posts": ["readAll"]}')]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
            resp = client.post("/v3/app-contracts/list", json={"token": token})
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["allowed_origin"] == "myapp.com"

    def test_revoke_by_origin(self, client, token):
        resp = client.post(
            "/v3/app-contracts/revoke",
            json={"token": token, "allowed_origin": "myapp.com"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "revoked"

    def test_revoke_all(self, client, token):
        resp = client.post("/v3/app-contracts/revoke", json={"token": token})
        assert resp.status_code == 200
        assert resp.json()["status"] == "revoked"


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
            "/v3/groups/sharing/set",
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
            "/v3/groups/sharing/set",
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
                "/v3/read",
                json={
                    "token": token,
                    "doc_id": "doc-1",
                    "service": "posts",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["doc_id"] == "doc-1"

    def test_read_by_id_not_found(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: [])
            resp = client.post(
                "/v3/read",
                json={
                    "token": token,
                    "doc_id": "doc-1",
                    "service": "posts",
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
            mock_ch.query.return_value = MagicMock(result_rows=lambda: mock_rows)
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
            "/v3/groups/block",
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
            "/v3/groups/unblock",
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


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestSignup:
    def test_signup(self, client):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: [(0,)])
            with patch("app.v3.endpoints.auth.get_password_hash", return_value="hash123"):
                resp = client.post(
                    "/v3/signup",
                    json={
                        "username": "alice",
                        "password": "secret",
                        "phone": "+1234567890",
                    },
                )
        assert resp.status_code == 200
        assert resp.json()["username"] == "alice"

    def test_signup_no_password(self, client):
        resp = client.post(
            "/v3/signup",
            json={"username": "alice"},
        )
        assert resp.status_code == 422


class TestLogin:
    def test_login(self, client):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(
                result_rows=lambda: [("alice", "hash123", "", 0, "", 0, datetime(2026, 1, 1))]
            )
            with patch("app.v3.endpoints.auth.get_password_hash", return_value="hash123"):
                with patch("app.v3.services.clickhouse.authenticate_user", return_value=True):
                    resp = client.post(
                        "/v3/login",
                        json={"username": "alice", "password": "test123"},
                    )
        assert resp.status_code == 200
        assert "token" in resp.json()


class TestChangePass:
    def test_change_pass(self, client, token):
        with patch("app.v3.services.clickhouse.authenticate_user", return_value=True):
            with patch("app.v3.endpoints.auth.get_password_hash", return_value="new_hash"):
                resp = client.post(
                    "/v3/change-pass",
                    json={"token": token, "password": "old", "new_pass": "new"},
                )
        assert resp.status_code == 200


class TestChangePhone:
    def test_change_phone(self, client, token):
        resp = client.post(
            "/v3/change-phone",
            json={"token": token, "phone": "+1987654321"},
        )
        assert resp.status_code == 200
        assert resp.json()["phone"] == "+1987654321"


class TestSetEmail:
    def test_set_email(self, client, token):
        resp = client.post(
            "/v3/set-email",
            json={"token": token, "email": "a@b.com"},
        )
        assert resp.status_code == 200


class TestVerifyPhone:
    def test_verify_phone(self, client, token):
        resp = client.post(
            "/v3/verify-phone",
            json={"token": token, "code": "123456"},
        )
        assert resp.status_code == 200


class TestProfile:
    def test_profile(self, client, token):
        resp = client.post("/v3/profile", json={"token": token})
        assert resp.status_code == 200


class TestSendCode:
    def test_send_code_no_phone(self, client, token):
        """User with no phone should get PHONE_NUMBER_MISSING (401)."""
        with patch("app.v3.services.clickhouse.get_phone_number", return_value=None):
            resp = client.post("/v3/send_code", json={"token": token})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "phone number missing"

    def test_send_code_with_phone(self, client, token):
        """User with a phone should succeed (Twilio mocked)."""
        with patch("app.v3.endpoints.ch.get_phone_number", return_value="+15551234567"):
            with patch("app.services.twilio.send_verification", return_value={"sent": True}):
                resp = client.post("/v3/send_code", json={"token": token})
        assert resp.status_code == 200


class TestSetRecoveryPhone:
    def test_set_recovery_phone_success(self, client, token):
        resp = client.post(
            "/v3/set_recovery_phone",
            json={"token": token, "phone": "+15559876543"},
        )
        assert resp.status_code == 200
        assert resp.json()["phone_number"] == "+15559876543"

    def test_set_recovery_phone_bad_number(self, client, token):
        resp = client.post(
            "/v3/set_recovery_phone",
            json={"token": token, "phone": "abc"},
        )
        assert resp.status_code == 401  # BAD_NUM is 401

    def test_set_recovery_phone_no_token(self, client):
        resp = client.post(
            "/v3/set_recovery_phone",
            json={"token": None, "phone": "+15559876543"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


class TestMediaConfirm:
    def test_confirm(self, client, token):
        resp = client.post(
            "/v3/media/confirm",
            json={
                "token": token,
                "body": {"filename": "a.png", "url": "http://x", "mime_type": "image/png"},
            },
        )
        assert resp.status_code == 200
        assert resp.json()["filename"] == "a.png"


class TestMediaList:
    def test_list(self, client, token):
        resp = client.post("/v3/media/list", json={"token": token})
        assert resp.status_code == 200


class TestMediaDelete:
    def test_delete(self, client, token):
        resp = client.post(
            "/v3/media/delete",
            json={"token": token, "doc_id": "doc-1"},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# App Store
# ---------------------------------------------------------------------------


class TestAppsRegister:
    def test_register(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=lambda: [])
            resp = client.post(
                "/v3/apps/register",
                json={
                    "token": token,
                    "body": {
                        "url": "https://myapp.com",
                        "name": "My App",
                        "description": "A web10 app",
                    },
                },
            )
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://myapp.com"


class TestAppsList:
    def test_list(self, client, token):
        resp = client.post("/v3/apps/list", json={"token": token})
        assert resp.status_code == 200


class TestAppsRating:
    def test_rating(self, client, token):
        resp = client.post(
            "/v3/apps/rating",
            json={
                "token": token,
                "body": {"target_app_id": "https://myapp.com", "rating": 5},
            },
        )
        assert resp.status_code == 200
        assert resp.json()["rating"] == 5

    def test_invalid_rating(self, client, token):
        resp = client.post(
            "/v3/apps/rating",
            json={
                "token": token,
                "body": {"target_app_id": "https://myapp.com", "rating": 6},
            },
        )
        assert resp.status_code == 401


class TestAppsRatings:
    def test_ratings(self, client, token):
        resp = client.post(
            "/v3/apps/ratings",
            json={
                "token": token,
                "body": {"target_app_id": "https://myapp.com"},
            },
        )
        assert resp.status_code == 200
