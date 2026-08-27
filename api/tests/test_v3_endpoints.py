"""Tests for v3 endpoints — all POST, action in URL."""

from datetime import datetime
from functools import partial
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.services.clickhouse import _power_mean_score, read_documents_in_groups


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

    def test_create_with_ref_value(self, client, token):
        """A reaction/comment references its target post via ref_value."""
        captured = {}

        def fake_insert(author_key, service, body, ref_value="", tags=None, doc_id=None):
            captured["ref_value"] = ref_value
            return {"doc_id": "doc-3", "ref_value": ref_value}

        with patch("app.v3.services.clickhouse.insert_document", side_effect=fake_insert):
            resp = client.post(
                "/v3/create",
                json={
                    "token": token,
                    "service": "reactions",
                    "body": {"type": "like"},
                    "ref_value": "target-post",
                },
            )
        assert resp.status_code == 200
        assert captured["ref_value"] == "target-post"


class TestRead:
    def test_personal_read(self, client, token):
        mock_groups = [("g1", "open", "member")]
        mock_counts = [("g1", 3)]
        mock_docs = [("doc-1", "bob", '{"text":"mine"}', [], datetime(2026, 1, 1), "")]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=mock_groups),
                MagicMock(result_rows=mock_counts),
                MagicMock(result_rows=mock_docs),
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
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
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
        mock_groups = [("g1", "open", "member")]
        mock_counts = [("g1", 3)]
        mock_docs = [("doc-1", "bob", '{"text":"hello"}', [], datetime(2026, 1, 1), "")]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=mock_groups),
                MagicMock(result_rows=mock_counts),
                MagicMock(result_rows=mock_docs),
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
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
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
            mock_ch.query.return_value = MagicMock(result_rows=[])
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
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
            resp = client.post("/v3/delete", json={"token": token, "doc_id": "doc-1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------


class TestCreateGroup:
    def test_create(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_group", return_value=None),
            patch("app.v3.services.clickhouse.get_group_member", return_value=None),
        ):
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

    def test_create_is_idempotent(self, client, token):
        """Re-creating an existing group must not re-insert its contract/members."""
        created = {
            "group_id": "g1",
            "roles": [],
            "join_policy": "open",
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        }
        with (
            patch("app.v3.services.clickhouse.get_group", return_value=created),
            patch(
                "app.v3.services.clickhouse.get_group_member",
                return_value={"member_key": "testuser", "role": "member", "joined_at": "2026-01-01"},
            ),
            patch("app.v3.services.clickhouse.create_group") as mock_create,
            patch("app.v3.services.clickhouse.add_group_member") as mock_add,
        ):
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
        assert resp.json()["group_id"].endswith("test-group")
        mock_create.assert_not_called()
        mock_add.assert_not_called()

    def test_missing_fields(self, client, token):
        resp = client.post("/v3/groups/create", json={"token": token, "name": "Test"})
        assert resp.status_code == 422


class TestListGroups:
    def test_get(self, client, token):
        mock_rows = [("g1", "open", "admin", 5)]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
            resp = client.post("/v3/groups/list", json={"token": token})
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestJoinGroup:
    def test_open_join(self, client, token):
        mock_rows = [("g1", '{"roles":[]}', "open", datetime(2026, 1, 1), datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
            resp = client.post("/v3/groups/join", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "member"

    def test_request_join(self, client, token):
        mock_rows = [("g1", '{"roles":[]}', "request", datetime(2026, 1, 1), datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
            resp = client.post("/v3/groups/join", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    def test_invite_only_join(self, client, token):
        mock_rows = [("g1", '{"roles":[]}', "invite_only", datetime(2026, 1, 1), datetime(2026, 1, 1))]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
                MagicMock(result_rows=mock_requests),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_group),
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
            headers={"Origin": "https://auth.localhost"},
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
            headers={"Origin": "https://auth.localhost"},
        )
        assert resp.status_code == 422

    def test_add_rejected_non_authenticator(self, client, token):
        resp = client.post(
            "/v3/app-contracts/add",
            json={
                "token": token,
                "allowed_origin": "myapp.com",
                "permissions": {"posts": ["readAll"]},
            },
            headers={"Origin": "https://malicious.example.com"},
        )
        assert resp.status_code == 403

    def test_list(self, client, token):
        mock_rows = [("myapp.com", '{"posts": ["readAll"]}')]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
            resp = client.post("/v3/app-contracts/list", json={"token": token})
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["allowed_origin"] == "myapp.com"

    def test_revoke_by_origin(self, client, token):
        resp = client.post(
            "/v3/app-contracts/revoke",
            json={"token": token, "allowed_origin": "myapp.com"},
            headers={"Origin": "https://auth.localhost"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "revoked"

    def test_revoke_all(self, client, token):
        resp = client.post(
            "/v3/app-contracts/revoke",
            json={"token": token},
            headers={"Origin": "https://auth.localhost"},
        )
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
            mock_ch.query.return_value = MagicMock(result_rows=mock_rows)
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
            mock_ch.query.return_value = MagicMock(result_rows=[])
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
        mock_rows = [
            (
                "g1",
                "open",
                '[{"name": "admin", "services": ["*"], "permissions": ["readAll", "manageRoles"]}]',
                "admin",
            )
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=mock_rows),
                MagicMock(result_rows=[("g1", 5)]),
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
                MagicMock(result_rows=mock_member),
                MagicMock(result_rows=mock_members),
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
        """D49 shape: user/doc/group counts, storage, app_count, and the
        node-wide active-user set (the store's metric, macro). No per-app
        array — that moved to /v3/apps/list (paginated)."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=[(42,)]),  # users
                MagicMock(result_rows=[(100,)]),  # documents
                MagicMock(result_rows=[(5,)]),  # groups
                MagicMock(result_rows=[(3,)]),  # app_count
                MagicMock(result_rows=[(1024,)]),  # storage
                MagicMock(result_rows=[(7, 40, 90, 120)]),  # active_users 1d/30d/90d/1y
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", return_value=512):
                resp = client.post("/v3/stats", json={"token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert data["users"] == 42
        assert data["documents"] == 100
        assert data["groups"] == 5
        assert data["app_count"] == 3
        assert data["active_users"] == {"users_1d": 7, "users_30d": 40, "users_90d": 90, "users_1y": 120}
        assert data["storage"] == 1536  # 1024 clickhouse + 512 s3
        assert "apps" not in data  # per-app list moved to /v3/apps/list

    def test_stats_macro_active_users_all_zero_when_no_visits(self, client, token):
        """No app_visits rows → the macro active-user set is all zeros (not an error)."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=[(1,)]),  # users
                MagicMock(result_rows=[(1,)]),  # documents
                MagicMock(result_rows=[(1,)]),  # groups
                MagicMock(result_rows=[(0,)]),  # app_count
                MagicMock(result_rows=[(0,)]),  # storage
                MagicMock(result_rows=[]),  # active_users — no rows
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", return_value=0):
                resp = client.post("/v3/stats", json={"token": token})
        assert resp.status_code == 200
        assert resp.json()["active_users"] == {"users_1d": 0, "users_30d": 0, "users_90d": 0, "users_1y": 0}

    def test_stats_survives_object_store_outage(self, client, token):
        """Anti-test for the v3 brick: /v3/stats must not hang or 500 when
        the object store is unreachable. storage = ClickHouse bytes + MinIO
        scan; the scan failing degrades to ClickHouse-only, response still lands."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = [
                MagicMock(result_rows=[(42,)]),  # users
                MagicMock(result_rows=[(100,)]),  # documents
                MagicMock(result_rows=[(5,)]),  # groups
                MagicMock(result_rows=[(3,)]),  # app_count
                MagicMock(result_rows=[(1024,)]),  # storage
                MagicMock(result_rows=[(0, 0, 0, 0)]),  # active_users
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", side_effect=ConnectionError("minio down")):
                resp = client.post("/v3/stats", json={"token": token})
        assert resp.status_code == 200
        assert resp.json()["storage"] == 1024  # ClickHouse bytes only


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestSignup:
    def test_signup(self, client):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            # create_user makes two queries: the existing-user count, then
            # get_group (the discover-group auto-enroll guard). Return a valid
            # group row for the second so the contract is treated as present.
            group_row = (
                "web10.app/groups/web10/discover",
                "[]",
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
            mock_ch.query.side_effect = [
                MagicMock(result_rows=[(0,)]),
                MagicMock(result_rows=[group_row]),
            ]
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
                result_rows=[("alice", "hash123", "", 0, "", 0, datetime(2026, 1, 1))]
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


class TestPwaListing:
    """GET /pwa_listing — the store's manifest proxy (D47: a path is an app)."""

    def _ok_manifest(self, payload: dict | None = None):
        import json as _json

        fake = MagicMock()
        # pwa_listing uses requests.get(..., stream=True) as a context manager
        # and reads via iter_content (hardening #7 byte cap).
        fake.__enter__ = MagicMock(return_value=fake)
        fake.__exit__ = MagicMock(return_value=False)
        fake.raise_for_status = MagicMock()
        fake.iter_content = MagicMock(return_value=iter([_json.dumps(payload or {"name": "Notes"}).encode()]))
        return fake

    def test_manifest_url_with_trailing_slash(self, client):
        with patch("app.endpoints.system.requests.get", return_value=self._ok_manifest()) as mock_get:
            resp = client.get("/pwa_listing", params={"url": "https://host/docs/notes/"})
        assert resp.status_code == 200
        assert resp.json() == {"name": "Notes"}
        assert mock_get.call_args[0][0] == "https://host/docs/notes/manifest.json"

    def test_manifest_url_without_trailing_slash(self, client):
        """A registered path without a trailing slash resolves the same."""
        with patch("app.endpoints.system.requests.get", return_value=self._ok_manifest()) as mock_get:
            resp = client.get("/pwa_listing", params={"url": "https://host/docs/notes"})
        assert resp.status_code == 200
        assert mock_get.call_args[0][0] == "https://host/docs/notes/manifest.json"

    def test_manifest_url_root(self, client):
        with patch("app.endpoints.system.requests.get", return_value=self._ok_manifest()) as mock_get:
            resp = client.get("/pwa_listing", params={"url": "https://host.example.com/"})
        assert resp.status_code == 200
        assert mock_get.call_args[0][0] == "https://host.example.com/manifest.json"

    def test_oversized_manifest_rejected(self, client):
        """Hardening #7: a manifest over the byte cap → NO_PWA (no memory spike)."""
        import json as _json

        fake = MagicMock()
        fake.__enter__ = MagicMock(return_value=fake)
        fake.__exit__ = MagicMock(return_value=False)
        fake.raise_for_status = MagicMock()
        # two chunks that together exceed the 256 KiB cap
        big = _json.dumps({"name": "x", "pad": "a" * (140 * 1024)}).encode()
        fake.iter_content = MagicMock(return_value=iter([big, big]))
        with patch("app.endpoints.system.requests.get", return_value=fake):
            resp = client.get("/pwa_listing", params={"url": "https://host/docs/notes/"})
        assert resp.status_code == 401  # NO_PWA

    def test_no_manifest_returns_no_pwa(self, client):
        import requests as req

        with patch(
            "app.endpoints.system.requests.get",
            side_effect=req.exceptions.RequestException("down"),
        ):
            resp = client.get("/pwa_listing", params={"url": "https://host/docs/notes/"})
        assert resp.status_code == 401  # NO_PWA — the store falls back to the registered name


class TestAppsRegister:
    def test_register_normalizes_url(self, client, token):
        """D49 / hardening #4: identity is canonical — one trailing slash,
        lowercase host, no query/fragment. app.com / app.com/ / APP.com → one row."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post("/v3/apps/register", json={"body": {"url": "https://myapp.com"}})
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://myapp.com/"

    def test_register_anonymous_creates_app_no_visit(self, client):
        """Anon ping (no token) registers the app but records NO visit —
        anon is dropped at ingest (D49). The app row is created; app_visits is not touched."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post("/v3/apps/register", json={"body": {"url": "https://myapp.com"}})
        assert resp.status_code == 200
        tables = [c[0][0] for c in mock_ch.insert.call_args_list]
        assert "apps" in tables
        assert "app_visits" not in tables

    def test_register_verified_user_counts_visit(self, client, token):
        """A verified token records a counted visit in app_visits (D49), keyed
        by the canonical url + the token's username."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post(
                "/v3/apps/register",
                json={"body": {"url": "https://myapp.com", "token": token}},
            )
        assert resp.status_code == 200
        visit_inserts = [c for c in mock_ch.insert.call_args_list if c[0][0] == "app_visits"]
        assert len(visit_inserts) == 1
        row = visit_inserts[0][0][1][0]
        assert row[0] == "https://myapp.com/"  # canonical url
        assert row[1] == "testuser"  # the token's username

    def test_register_forged_token_is_anon(self, client):
        """I2: a forged/unsigned token yields no username → no visit row.
        An app cannot fake another user's visit."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post(
                "/v3/apps/register",
                json={"body": {"url": "https://myapp.com", "token": "garbage.not.a.jwt"}},
            )
        assert resp.status_code == 200
        tables = [c[0][0] for c in mock_ch.insert.call_args_list]
        assert "app_visits" not in tables

    def test_register_collapses_index_html_to_directory(self, client):
        """Canonical app identity (D47): a trailing /index.html is the
        server's way of serving the directory app, not a distinct app.
        Loading a demo via its /index.html link must not fork the identity
        into a second store entry whose manifest lookup 404s (icon-less,
        name-less card in the store)."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post(
                "/v3/apps/register",
                json={"body": {"url": "https://myapp.com/docs/notes/index.html"}},
            )
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://myapp.com/docs/notes/"
        apps_inserts = [c for c in mock_ch.insert.call_args_list if c[0][0] == "apps"]
        assert apps_inserts[0][0][1][0][0] == "https://myapp.com/docs/notes/"

    def test_register_plain_url_unchanged(self, client):
        """Normalization only touches the /index.html suffix — everything
        else registers byte-for-byte as sent."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post(
                "/v3/apps/register",
                json={"body": {"url": "https://myapp.com/docs/notes/"}},
            )
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://myapp.com/docs/notes/"

    def test_register_repeat_no_metadata_no_append(self, client, token):
        """D49: a repeat url-only ping does NOT append to apps — apps is a
        stable registration record, not a per-ping log (that piled on ClickHouse)."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(
                result_rows=[
                    (
                        "https://myapp.com/",
                        "My App",
                        "A web10 app",
                        "",
                        "[]",
                        1,
                        "approved",
                        3,
                        47,
                        "2026-01-01 00:00:00",
                    ),
                ]
            )
            resp = client.post("/v3/apps/register", json={"body": {"url": "https://myapp.com/"}})
        assert resp.status_code == 200
        assert resp.json()["review_state"] == "approved"
        mock_ch.command.assert_not_called()  # no metadata-change append
        tables = [c[0][0] for c in mock_ch.insert.call_args_list]
        assert "apps" not in tables  # no new apps row

    def test_register_metadata_change_appends(self, client, token):
        """A repeat ping WITH changed metadata appends a new apps row
        (metadata_version bumped) — the only repeat case that touches apps."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(
                result_rows=[
                    (
                        "https://myapp.com/",
                        "Old Name",
                        "A web10 app",
                        "",
                        "[]",
                        1,
                        "approved",
                        3,
                        47,
                        "2026-01-01 00:00:00",
                    ),
                ]
            )
            resp = client.post(
                "/v3/apps/register",
                json={"body": {"url": "https://myapp.com/", "name": "New Name"}},
            )
        assert resp.status_code == 200
        mock_ch.command.assert_called_once()  # the metadata-change append
        sql = mock_ch.command.call_args[0][0]
        assert "metadata_version + 1" in sql
        assert "visits + 1" not in sql  # D49: no per-ping visit bump on apps


class TestAppsList:
    def test_list(self, client, token):
        resp = client.post("/v3/apps/list", json={"token": token})
        assert resp.status_code == 200


class TestAppsDetail:
    """GET /v3/apps/detail — the product page payload (D52)."""

    _NODE = {
        "users": 579,
        "documents": 100,
        "groups": 5,
        "app_count": 12,
        "active_users": {"users_1d": 1, "users_30d": 10, "users_90d": 20, "users_1y": 30},
        "storage": 1234,
    }

    def test_detail_composes_app_metrics_ratings_node(self, client):
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            patch("app.v3.services.clickhouse.get_node_stats", return_value=self._NODE),
        ):
            mock_ch.query.side_effect = [
                # get_app (canonical url, approved)
                MagicMock(
                    result_rows=[
                        (
                            "https://myapp.com/",
                            "My App",
                            "A web10 app",
                            "",
                            "[]",
                            1,
                            "approved",
                            1,
                            47,
                            "2026-01-01 00:00:00",
                        ),
                    ]
                ),
                # get_app_metrics
                MagicMock(result_rows=[("https://myapp.com/", 47, 4, 128, 301, 512)]),
                # get_app_ratings
                MagicMock(
                    result_rows=[
                        ("alice", 5, "fast.", "api.web10.app", "2026-08-01 12:00:00"),
                        ("bob", 3, "", "api.web10.app", "2026-08-02 12:00:00"),
                    ]
                ),
            ]
            resp = client.get("/v3/apps/detail", params={"url": "https://myapp.com"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://myapp.com/"  # canonical
        assert data["name"] == "My App"
        assert data["metrics"] == {"visits": 47, "users_1d": 4, "users_30d": 128, "users_90d": 301, "users_1y": 512}
        assert data["rating"] == {"average": 4.0, "count": 2}
        assert data["ratings"][0] == {
            "author": "alice",
            "rating": 5,
            "comment": "fast.",
            "provider": "api.web10.app",
            "created_at": "2026-08-01 12:00:00",
        }
        assert data["node"] == {
            "users": 579,
            "app_count": 12,
            "active_users": self._NODE["active_users"],
            "storage": 1234,
        }

    def test_detail_is_a_pure_read(self, client):
        """No app_visits row is written — a product-page view is not an app
        visit (usage rows come only from SDK pings with a verified token)."""
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            patch("app.v3.services.clickhouse.get_node_stats", return_value=self._NODE),
        ):
            mock_ch.query.side_effect = [
                MagicMock(
                    result_rows=[
                        ("https://myapp.com/", "My App", "", "", "[]", 1, "approved", 1, 0, "2026-01-01 00:00:00"),
                    ]
                ),
                MagicMock(result_rows=[]),  # no metrics rows → zeros
                MagicMock(result_rows=[]),  # no ratings
            ]
            resp = client.get("/v3/apps/detail", params={"url": "https://myapp.com"})
        assert resp.status_code == 200
        assert resp.json()["metrics"] == {"visits": 0, "users_1d": 0, "users_30d": 0, "users_90d": 0, "users_1y": 0}
        assert resp.json()["rating"] == {"average": None, "count": 0}
        # no usage row — the only inserts allowed are the request log's
        tables = [c[0][0] for c in mock_ch.insert.call_args_list]
        assert "app_visits" not in tables

    def test_detail_unknown_url_404(self, client):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.get("/v3/apps/detail", params={"url": "https://nowhere.com"})
        assert resp.status_code == 404

    def test_detail_unapproved_404(self, client):
        """The product page is a store surface — the store lists approved
        only, so a pending app's page 404s (no existence leak beyond the URL)."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(
                result_rows=[
                    ("https://myapp.com/", "My App", "", "", "[]", 0, "pending", 1, 0, "2026-01-01 00:00:00"),
                ]
            )
            resp = client.get("/v3/apps/detail", params={"url": "https://myapp.com"})
        assert resp.status_code == 404

    def test_detail_normalizes_url(self, client):
        """Identity is canonical (D49 / hardening #4) — the lookup runs on
        the canonical form, so any spelling reaches the same page."""
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            patch("app.v3.services.clickhouse.get_node_stats", return_value=self._NODE),
        ):
            mock_ch.query.side_effect = [
                MagicMock(
                    result_rows=[
                        ("https://myapp.com/", "My App", "", "", "[]", 1, "approved", 1, 0, "2026-01-01 00:00:00"),
                    ]
                ),
                MagicMock(result_rows=[]),
                MagicMock(result_rows=[]),
            ]
            resp = client.get("/v3/apps/detail", params={"url": "WWW.MyApp.com?x=1"})
        assert resp.status_code == 200
        # the get_app lookup ran on the canonical url (params are positional)
        first_query_params = mock_ch.query.call_args_list[0][0][1].get("url")
        assert first_query_params == "https://myapp.com/"


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

    def test_rating_with_comment(self, client, token):
        """D52: a review is a rating with words — the comment rides along
        and is echoed back."""
        resp = client.post(
            "/v3/apps/rating",
            json={
                "token": token,
                "body": {"target_app_id": "https://myapp.com", "rating": 5, "comment": "fast."},
            },
        )
        assert resp.status_code == 200
        assert resp.json()["comment"] == "fast."

    def test_rating_comment_over_cap_rejected(self, client, token):
        """A review is a paragraph, not a document — over the cap → rejected."""
        resp = client.post(
            "/v3/apps/rating",
            json={
                "token": token,
                "body": {"target_app_id": "https://myapp.com", "rating": 5, "comment": "a" * 1001},
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


# ---------------------------------------------------------------------------
# Discover board — the universal public board (anon-readable)
# ---------------------------------------------------------------------------


class TestDiscoverBoardAnonRead:
    """The public board is the discover group, read via the normal /v3/read
    path as anon (no token). Discovery IS a group read in v3 — no separate
    discover endpoint."""

    def test_board_anon_readable(self, client):
        """No token → reads as anon → the discover group's docs come back."""
        mock_docs = [("doc-1", "alice", '{"text":"hello"}', [], datetime(2026, 1, 1), "")]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            # read_documents_in_groups is a single query
            mock_ch.query.return_value = MagicMock(result_rows=mock_docs)
            resp = client.post(
                "/v3/read",
                json={
                    "service": "posts",
                    "groups": ["web10.app/groups/web10/discover"],
                    "limit": 10,
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["doc_id"] == "doc-1"
        assert body[0]["author_key"] == "alice"
        # the read ran as anon (member_key = "anon") — first query is the
        # group read; params are positional (call_args[0][1]).
        read_params = mock_ch.query.call_args_list[0][0][1]
        assert read_params["member_key"] == "anon"

    def test_board_anon_empty_is_ok(self, client):
        """An empty board is a valid (empty) result for anon, not a 403."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=[])
            resp = client.post(
                "/v3/read",
                json={
                    "service": "posts",
                    "groups": ["web10.app/groups/web10/discover"],
                },
            )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_real_user_not_anon(self, client, token):
        """A token read uses the real username, not anon — the anon bypass
        only applies to token-less reads."""
        with (
            patch("app.v3.endpoints.documents._check_app_permission"),
            patch("app.v3.services.clickhouse.read_documents_in_groups", return_value=[]) as mock_read,
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", return_value=[]),
        ):
            resp = client.post(
                "/v3/read",
                json={"token": token, "service": "posts", "groups": ["g"]},
            )
        assert resp.status_code == 200
        assert mock_read.call_args[1]["member_key"] == "testuser"


# ---------------------------------------------------------------------------
# Power-mean ranking — the feed knobs, server-side (D36, feed-lens-integration)
# ---------------------------------------------------------------------------


class TestPowerMeanScore:
    """The scoring math mirrors marketing-ui/src/lib/powerMean.ts so client
    and server rank identically. Pure function — no I/O, no mocks."""

    def test_recency_only_shortcut_is_reverse_chron(self):
        # "Newest" preset: recency weight only → pure reverse-chron, so a newer
        # post wins regardless of engagement.
        sort = {"recency": 1.0, "likes": 0.0, "comments": 0.0, "half_life_ms": 0, "character": 0.0}
        newer = _power_mean_score(1_000, 9999, 9999, sort)  # 1s old, huge engagement
        older = _power_mean_score(100_000, 0, 0, sort)  # 100s old, no engagement
        assert newer > older

    def test_most_loved_ignores_age(self):
        # "Most loved · all time": likes weight only, half_life 0 (no decay) →
        # an ancient post with huge likes beats a new post with one like.
        sort = {"recency": 0.0, "likes": 1.0, "comments": 0.0, "half_life_ms": 0, "character": 0.0}
        loved_old = _power_mean_score(10**12, 9999, 0, sort)
        unloved_new = _power_mean_score(1_000, 1, 0, sort)
        assert loved_old > unloved_new

    def test_geometric_mean_at_p_zero(self):
        # p = 0 → weighted geometric mean: a post with a dead signal scores
        # lower than one where every weighted signal is high.
        sort = {"recency": 1.0, "likes": 1.0, "comments": 0.0, "half_life_ms": 10**9, "character": 0.0}
        balanced = _power_mean_score(0, 9999, 9999, sort)
        one_dead = _power_mean_score(0, 9999, 0, sort)  # comments dead (but weight 0)
        # recency=1 for both (age 0); likes high for both; the dead comment is
        # weight-0 so it's excluded — scores are equal.
        assert balanced == one_dead

    def test_strict_p_penalizes_dead_weighted_signal(self):
        # p = -5 (strict): a post with a dead WEIGHTED signal scores lower than
        # one where every weighted signal is high.
        sort = {"recency": 1.0, "likes": 1.0, "comments": 1.0, "half_life_ms": 10**9, "character": -5.0}
        all_high = _power_mean_score(0, 9999, 9999, sort)
        dead_comments = _power_mean_score(0, 9999, 0, sort)
        assert all_high > dead_comments

    def test_zero_weight_signal_excluded(self):
        # A zero-weighted signal is excluded from both numerator and
        # denominator — it can't drag the score down even at strict p.
        sort = {"recency": 0.0, "likes": 1.0, "comments": 0.0, "half_life_ms": 0, "character": -5.0}
        with_dead_comments = _power_mean_score(0, 9999, 0, sort)
        with_comments = _power_mean_score(0, 9999, 9999, sort)
        assert with_dead_comments == with_comments


class TestPowerMeanRead:
    """read_documents_in_groups with a `sort` config ranks the full group
    membership by the feed knobs, then pages (the discover board's
    "your algorithm" — D36)."""

    def _fake_query(self, sql, params=None, posts=None, reactions=None, comments=None):
        coll = params.get("coll") if params else None
        if coll == "posts":
            return MagicMock(result_rows=posts or [])
        if coll == "reactions":
            return MagicMock(result_rows=reactions or [])
        if coll == "comments":
            return MagicMock(result_rows=comments or [])
        return MagicMock(result_rows=[])

    def test_most_loved_ranks_by_engagement_not_age(self):
        # doc-old is ancient but has 9999 reactions; doc-new is fresh with none.
        # A "most loved" sort (likes only, no decay) puts doc-old first.
        posts = [
            ("doc-new", "bob", '{"text":"new"}', [], datetime(2026, 1, 1), ""),
            ("doc-old", "alice", '{"text":"old"}', [], datetime(2025, 1, 1), ""),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = partial(
                self._fake_query,
                posts=posts,
                reactions=[("doc-old", 9999)],
                comments=[],
            )
            docs = read_documents_in_groups(
                group_ids=["web10.app/groups/web10/discover"],
                member_key="anon",
                service="posts",
                limit=10,
                sort={"recency": 0.0, "likes": 1.0, "comments": 0.0, "half_life_ms": 0, "character": 0.0},
            )
        assert [d["doc_id"] for d in docs] == ["doc-old", "doc-new"]

    def test_newest_ranks_by_recency_not_engagement(self):
        # A "newest" sort (recency only) puts the fresh post first regardless
        # of the older post's huge engagement.
        posts = [
            ("doc-new", "bob", '{"text":"new"}', [], datetime(2026, 1, 1), ""),
            ("doc-old", "alice", '{"text":"old"}', [], datetime(2025, 1, 1), ""),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = partial(
                self._fake_query,
                posts=posts,
                reactions=[("doc-old", 9999)],
                comments=[],
            )
            docs = read_documents_in_groups(
                group_ids=["web10.app/groups/web10/discover"],
                member_key="anon",
                service="posts",
                limit=10,
                sort={"recency": 1.0, "likes": 0.0, "comments": 0.0, "half_life_ms": 0, "character": 0.0},
            )
        assert [d["doc_id"] for d in docs] == ["doc-new", "doc-old"]

    def test_no_sort_is_chronological(self):
        # Without a sort config, the read is chronological (newest first) —
        # the existing behavior is unchanged.
        posts = [
            ("doc-new", "bob", '{"text":"new"}', [], datetime(2026, 1, 1), ""),
            ("doc-old", "alice", '{"text":"old"}', [], datetime(2025, 1, 1), ""),
        ]
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.side_effect = partial(self._fake_query, posts=posts)
            docs = read_documents_in_groups(
                group_ids=["web10.app/groups/web10/discover"],
                member_key="anon",
                service="posts",
                limit=10,
            )
        assert [d["doc_id"] for d in docs] == ["doc-new", "doc-old"]

    def test_endpoint_passes_sort_to_ranking(self, client, token):
        # The /v3/read endpoint forwards the `sort` config to the ranking.
        with (
            patch("app.v3.endpoints.documents._check_app_permission"),
            patch("app.v3.services.clickhouse.read_documents_in_groups", return_value=[]) as mock_read,
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", return_value=[]),
        ):
            resp = client.post(
                "/v3/read",
                json={
                    "token": token,
                    "service": "posts",
                    "groups": ["web10.app/groups/web10/discover"],
                    "sort": {"recency": 1.0, "likes": 1.0, "half_life_ms": 86_400_000, "character": -1.0},
                },
            )
        assert resp.status_code == 200
        assert mock_read.call_args[1]["sort"] == {
            "recency": 1.0,
            "likes": 1.0,
            "comments": 0.0,
            "half_life_ms": 86_400_000,
            "character": -1.0,
        }


class TestGroupModeration:
    """Board moderation as a group op — hide content from a group's discover
    (KB: groups/overview.md "Moderation"). Gated by `hideAll` OR node admin."""

    def test_hide(self, client, token):
        with (
            patch("app.v3.endpoints.groups._require_moderation"),
            patch("app.v3.services.clickhouse.hide_doc_from_group") as mock_hide,
        ):
            resp = client.post(
                "/v3/groups/hide",
                json={"token": token, "group_id": "g1", "doc_id": "doc-1"},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "hidden"
        assert mock_hide.call_args[0][1] == "doc-1"

    def test_unhide(self, client, token):
        with (
            patch("app.v3.endpoints.groups._require_moderation"),
            patch("app.v3.services.clickhouse.unhide_doc_from_group") as mock_unhide,
        ):
            resp = client.post("/v3/groups/unhide", json={"token": token, "group_id": "g1", "doc_id": "doc-1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "restored"
        assert mock_unhide.call_args[0][1] == "doc-1"

    def test_hidden_list(self, client, token):
        with (
            patch("app.v3.endpoints.groups._require_moderation"),
            patch(
                "app.v3.services.clickhouse.get_hidden_docs",
                return_value=[
                    {
                        "doc_id": "doc-1",
                        "moderator_key": "admin1",
                        "hidden_at": "2026-01-02",
                        "author_key": "alice",
                        "body": {"text": "bad"},
                    }
                ],
            ),
        ):
            resp = client.post("/v3/groups/hidden", json={"token": token, "group_id": "g1"})
        assert resp.status_code == 200
        hidden = resp.json()["hidden"]
        assert hidden[0]["doc_id"] == "doc-1"
        assert hidden[0]["author_key"] == "alice"
        assert hidden[0]["body"]["text"] == "bad"

    def test_hide_requires_moderation(self, client, token):
        """The gate runs before the hide — a non-moderator never reaches it."""
        with (
            patch(
                "app.v3.endpoints.groups._require_moderation",
                side_effect=Exception("NOT_ADMIN"),
            ) as mock_gate,
            patch("app.v3.services.clickhouse.hide_doc_from_group") as mock_hide,
        ):
            with pytest.raises(Exception, match="NOT_ADMIN"):
                client.post(
                    "/v3/groups/hide",
                    json={"token": token, "group_id": "g1", "doc_id": "doc-1"},
                )
        mock_gate.assert_called_once()
        mock_hide.assert_not_called()
