"""Tests for v3 ClickHouse service layer and endpoints.

Uses mocked clickhouse-connect client — no real ClickHouse needed.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

from app.v3.services import clickhouse as ch

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_result_rows(rows):
    """Build a mock query result with result_rows property (clickhouse_connect 1.6+)."""
    mock = MagicMock()
    mock.result_rows = rows
    return mock


def _patch_client():
    """Patch the clickhouse client for the duration of the test."""
    mock_client = MagicMock()
    return patch.object(ch, "client", mock_client)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class TestInsertDocument:
    def test_insert_with_explicit_id(self):
        with _patch_client() as mock_client:
            result = ch.insert_document(
                doc_id="doc-1",
                author_key="alice",
                service="posts",
                body={"text": "hello"},
                tags=["test"],
            )
            assert result["doc_id"] == "doc-1"
            assert result["body"]["text"] == "hello"
            assert result["tags"] == ["test"]
            mock_client.insert.assert_called_once()
            call_args = mock_client.insert.call_args[0]
            assert call_args[0] == "documents"
            row = call_args[1][0]
            assert row[0] == "doc-1"
            assert row[1] == "alice"
            assert row[2] == "posts"

    def test_insert_generates_id(self):
        with _patch_client() as mock_client:
            result = ch.insert_document(
                author_key="alice",
                service="posts",
                body={"text": "hello"},
            )
            assert result["doc_id"] is not None
            assert len(result["doc_id"]) == 36  # uuid7 string
            mock_client.insert.assert_called_once()


class TestGetDocument:
    def test_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    (
                        "doc-1",
                        "alice",
                        "posts",
                        '{"text":"hello"}',
                        "",
                        ["test"],
                        datetime(2026, 1, 1),
                        datetime(2026, 1, 1),
                    ),
                ]
            )
            result = ch.get_document("doc-1", "alice")
            assert result["doc_id"] == "doc-1"
            assert result["body"]["text"] == "hello"
            assert result["author_key"] == "alice"

    def test_not_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.get_document("doc-1", "alice") is None


class TestUpdateDocument:
    def test_preserves_created_at(self):
        with _patch_client() as mock_client:
            original_created = datetime(2026, 1, 1, 12, 0, 0)
            mock_client.query.return_value = _mock_result_rows(
                [
                    (
                        "doc-1",
                        "alice",
                        "posts",
                        '{"text":"old"}',
                        "",
                        [],
                        original_created,
                        datetime(2026, 1, 1, 12, 0, 0),
                    ),
                ]
            )
            result = ch.update_document(
                doc_id="doc-1",
                author_key="alice",
                service="posts",
                body={"text": "updated"},
            )
            assert result["created_at"] == "2026-01-01 12:00:00"
            assert result["updated_at"] != result["created_at"]
            # Verify the insert uses the original created_at
            insert_call = mock_client.insert.call_args[0]
            row = insert_call[1][0]
            assert row[6] == original_created  # created_at position

    def test_returns_none_when_not_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            result = ch.update_document("doc-1", "alice", "posts", {"text": "x"})
            assert result is None


class TestDeleteDocument:
    def test_tombstone(self):
        with _patch_client() as mock_client:
            ch.delete_document("doc-1", "alice", "posts")
            mock_client.command.assert_called_once()
            sql = mock_client.command.call_args[0][0]
            assert "deleted = 0" in sql
            assert "INSERT INTO documents" in sql


class TestReadDocuments:
    def test_read_by_author(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("doc-1", "alice", "posts", '{"text":"hello"}', "", [], datetime(2026, 1, 1), datetime(2026, 1, 1)),
                ]
            )
            results = ch.read_documents(author_key="alice", service="posts")
            assert len(results) == 1
            assert results[0]["doc_id"] == "doc-1"


# ---------------------------------------------------------------------------
# Doc Groups
# ---------------------------------------------------------------------------


class TestAttachDocToGroups:
    def test_attach(self):
        with _patch_client() as mock_client:
            ch.attach_doc_to_groups("doc-1", ["g1", "g2"])
            mock_client.insert.assert_called_once()
            call_args = mock_client.insert.call_args[0]
            assert call_args[0] == "doc_groups"
            assert len(call_args[1]) == 2


class TestDetachDocFromGroups:
    def test_detach(self):
        with _patch_client() as mock_client:
            ch.detach_doc_from_groups("doc-1")
            mock_client.command.assert_called_once()
            sql = mock_client.command.call_args[0][0]
            assert "doc_groups" in sql


class TestGetDocGroups:
    def test_get_groups(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([("g1",), ("g2",)])
            groups = ch.get_doc_groups("doc-1")
            assert groups == ["g1", "g2"]


# ---------------------------------------------------------------------------
# Group Contracts
# ---------------------------------------------------------------------------


class TestCreateGroup:
    def test_create(self):
        with _patch_client() as mock_client:
            result = ch.create_group("web10.app/groups/alice/test", [{"name": "member"}], "open")
            assert result["group_id"] == "web10.app/groups/alice/test"
            assert result["join_policy"] == "open"
            mock_client.insert.assert_called_once()


class TestGetGroup:
    def test_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("g1", '{"roles":[]}', "open", datetime(2026, 1, 1), datetime(2026, 1, 1)),
                ]
            )
            result = ch.get_group("g1")
            assert result["group_id"] == "g1"
            assert result["join_policy"] == "open"

    def test_not_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.get_group("g1") is None


# ---------------------------------------------------------------------------
# Group Members
# ---------------------------------------------------------------------------


class TestAddGroupMember:
    def test_add(self):
        with _patch_client() as mock_client:
            result = ch.add_group_member("g1", "alice", "member")
            assert result["group_id"] == "g1"
            assert result["member_key"] == "alice"
            mock_client.insert.assert_called_once()


class TestRemoveGroupMember:
    def test_remove(self):
        with _patch_client() as mock_client:
            ch.remove_group_member("g1", "alice")
            mock_client.command.assert_called_once()


class TestGetGroupMembers:
    def test_get_members(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("alice", "admin", datetime(2026, 1, 1)),
                    ("bob", "member", datetime(2026, 1, 2)),
                ]
            )
            members = ch.get_group_members("g1")
            assert len(members) == 2
            assert members[0]["member_key"] == "alice"
            assert members[0]["role"] == "admin"


class TestIsGroupMember:
    def test_member(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([("alice", "member", datetime(2026, 1, 1))])
            assert ch.is_group_member("g1", "alice") is True

    def test_not_member(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.is_group_member("g1", "alice") is False


class TestGetUserGroups:
    def test_user_groups(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("g1", "open", "admin", 5),
                ]
            )
            groups = ch.get_user_groups("alice")
            assert len(groups) == 1
            assert groups[0]["group_id"] == "g1"
            assert groups[0]["my_role"] == "admin"


# ---------------------------------------------------------------------------
# Group Join Requests
# ---------------------------------------------------------------------------


class TestCreateJoinRequest:
    def test_create(self):
        with _patch_client() as mock_client:
            result = ch.create_join_request("g1", "alice")
            assert result["status"] == "pending"
            mock_client.insert.assert_called_once()


class TestResolveJoinRequest:
    def test_resolve(self):
        with _patch_client() as mock_client:
            ch.resolve_join_request("g1", "alice", "approved")
            mock_client.command.assert_called_once()


class TestGetPendingRequests:
    def test_pending(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("alice", "pending", "", datetime(2026, 1, 1)),
                ]
            )
            requests = ch.get_pending_requests("g1")
            assert len(requests) == 1
            assert requests[0]["requester_key"] == "alice"


# ---------------------------------------------------------------------------
# Group Hidden Docs
# ---------------------------------------------------------------------------


class TestHideDocFromGroup:
    def test_hide(self):
        with _patch_client() as mock_client:
            ch.hide_doc_from_group("g1", "doc-1", "moderator")
            mock_client.insert.assert_called_once()
            call_args = mock_client.insert.call_args[0]
            assert call_args[0] == "group_hidden_docs"


class TestUnhideDocFromGroup:
    def test_unhide(self):
        with _patch_client() as mock_client:
            ch.unhide_doc_from_group("g1", "doc-1")
            mock_client.command.assert_called_once()


# ---------------------------------------------------------------------------
# App Contracts
# ---------------------------------------------------------------------------


class TestAppContracts:
    def test_add(self):
        with _patch_client():
            result = ch.add_app_contract("alice", "myapp.com", {"posts": ["readAll", "create"]})
            assert result["allowed_origin"] == "myapp.com"
            assert "posts" in result["permissions"]

    def test_get(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("myapp.com", '{"posts": ["readAll"], "playlists": ["readAll", "create"]}'),
                ]
            )
            contracts = ch.get_app_contracts("alice")
            assert len(contracts) == 1
            assert contracts[0]["allowed_origin"] == "myapp.com"
            assert "posts" in contracts[0]["permissions"]

    def test_is_origin_allowed_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.is_origin_allowed("alice", "myapp.com") is True

    def test_is_origin_allowed_false(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(0,)])
            assert ch.is_origin_allowed("alice", "evil.com") is False

    def test_has_permission_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([('{"posts": ["readAll", "create"]}',)])
            assert ch.has_permission("alice", "myapp.com", "posts", "readAll") is True

    def test_has_permission_false(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([('{"posts": ["readAll"]}',)])
            assert ch.has_permission("alice", "myapp.com", "posts", "create") is False

    def test_revoke(self):
        with _patch_client() as mock_client:
            ch.revoke_app_contract("alice", "myapp.com")
            mock_client.command.assert_called_once()

    def test_revoke_all(self):
        with _patch_client() as mock_client:
            ch.revoke_all_app_contracts("alice")
            mock_client.command.assert_called_once()


# ---------------------------------------------------------------------------
# Blacklists
# ---------------------------------------------------------------------------


class TestBlockUser:
    def test_block(self):
        with _patch_client() as mock_client:
            ch.block_user("alice", "bob")
            mock_client.insert.assert_called_once()
            call_args = mock_client.insert.call_args[0]
            assert call_args[0] == "user_blacklist"
            assert len(call_args[1][0]) == 5  # user_key, blocked_key, created_at, updated_at, deleted

    def test_unblock(self):
        with _patch_client() as mock_client:
            ch.unblock_user("alice", "bob")
            mock_client.command.assert_called_once()
            sql = mock_client.command.call_args[0][0]
            assert "INSERT INTO user_blacklist" in sql
            assert "deleted = 0" in sql

    def test_is_blocked_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.is_user_blocked("alice", "bob") is True

    def test_is_blocked_false(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(0,)])
            assert ch.is_user_blocked("alice", "bob") is False


class TestBlockUserInGroup:
    def test_block(self):
        with _patch_client() as mock_client:
            ch.block_user_in_group("alice", "g1", "bob")
            mock_client.insert.assert_called_once()
            call_args = mock_client.insert.call_args[0]
            assert call_args[0] == "group_blacklist"
            assert len(call_args[1][0]) == 6  # user_key, group_id, blocked_key, created_at, updated_at, deleted

    def test_unblock_tombstone(self):
        with _patch_client() as mock_client:
            ch.unblock_user_in_group("alice", "g1", "bob")
            mock_client.command.assert_called_once()
            sql = mock_client.command.call_args[0][0]
            assert "INSERT INTO group_blacklist" in sql
            assert "deleted = 0" in sql


# ---------------------------------------------------------------------------
# User Group Sharing
# ---------------------------------------------------------------------------


class TestUserGroupSharing:
    def test_set_sharing(self):
        with _patch_client() as mock_client:
            ch.set_user_group_sharing("alice", "g1", False)
            mock_client.insert.assert_called_once()

    def test_sharing_enabled_default_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.is_sharing_enabled("alice", "g1") is True

    def test_sharing_enabled_explicit_false(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(0,)])
            assert ch.is_sharing_enabled("alice", "g1") is False

    def test_sharing_enabled_explicit_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.is_sharing_enabled("alice", "g1") is True


# ---------------------------------------------------------------------------
# Discover Query
# ---------------------------------------------------------------------------


class TestReadDocumentsInGroups:
    def test_empty_groups(self):
        assert ch.read_documents_in_groups([], "alice", "posts") == []

    def test_discover_query(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("doc-1", "bob", '{"text":"hello"}', ["test"], datetime(2026, 1, 1), ""),
                ]
            )
            results = ch.read_documents_in_groups(
                group_ids=["g1"],
                member_key="alice",
                service="posts",
            )
            assert len(results) == 1
            assert results[0]["doc_id"] == "doc-1"
            assert results[0]["author_key"] == "bob"
            # Verify blacklist filter is author-controlled (author blocks reader)
            mock_client.query.assert_called_once()
            sql = mock_client.query.call_args[0][0]
            assert "user_key = p.author_key" in sql
            assert "blocked_key = %(member_key)s" in sql
            # Verify blacklist filter includes deleted = 0 (tombstone-respecting)
            assert "SELECT 1 FROM user_blacklist" in sql
            blacklist_part = sql[sql.index("SELECT 1 FROM user_blacklist") :]
            assert "deleted = 0" in blacklist_part
            # Verify hidden docs exclusion
            assert "group_hidden_docs" in sql


# ---------------------------------------------------------------------------
# Ref Counts
# ---------------------------------------------------------------------------


class TestRefCounts:
    def test_ref_count(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(5,)])
            count = ch.get_ref_count("doc-1")
            assert count == 5

    def test_ref_counts_multiple(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("doc-1", 3),
                    ("doc-2", 7),
                ]
            )
            counts = ch.get_ref_counts(["doc-1", "doc-2"])
            assert counts["doc-1"] == 3
            assert counts["doc-2"] == 7

    def test_ref_counts_empty(self):
        assert ch.get_ref_counts([]) == {}


# ---------------------------------------------------------------------------
# Read by doc_id
# ---------------------------------------------------------------------------


class TestReadDocumentById:
    def test_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("doc-1", "bob", '{"text":"hello"}', ["tag1"], datetime(2026, 1, 1), ""),
                ]
            )
            doc = ch.read_document_by_id("doc-1", "alice", "posts")
            assert doc["doc_id"] == "doc-1"
            assert doc["author_key"] == "bob"
            assert doc["body"]["text"] == "hello"

    def test_not_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.read_document_by_id("doc-1", "alice", "posts") is None


# ---------------------------------------------------------------------------
# Groups: manages
# ---------------------------------------------------------------------------


class TestGetGroupsManages:
    def test_has_manage(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([
                ("g1", "open", '{"admin": {"permissions": ["manageRoles"]}}', "admin", 5)
            ])
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 1
            assert groups[0]["group_id"] == "g1"

    def test_no_manage(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([
                ("g1", "open", '{"admin": {"permissions": ["readAll"]}}', "admin", 5)
            ])
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 0

    def test_empty(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 0


# ---------------------------------------------------------------------------
# Provider service contracts
# ---------------------------------------------------------------------------


class TestProviderServiceContracts:
    def test_add(self):
        with _patch_client():
            result = ch.add_provider_service_contract("provider1", "myapp.com")
            assert result["provider_key"] == "provider1"
            assert result["allowed_origin"] == "myapp.com"

    def test_get(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([("myapp.com",)])
            contracts = ch.get_provider_service_contracts("provider1")
            assert len(contracts) == 1
            assert contracts[0]["allowed_origin"] == "myapp.com"

    def test_is_allowed_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.is_provider_origin_allowed("provider1", "myapp.com") is True

    def test_is_allowed_false(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(0,)])
            assert ch.is_provider_origin_allowed("provider1", "evil.com") is False

    def test_revoke(self):
        with _patch_client() as mock_client:
            ch.revoke_provider_service_contract("provider1", "myapp.com")
            mock_client.command.assert_called_once()


# ---------------------------------------------------------------------------
# Media resolution
# ---------------------------------------------------------------------------


class TestResolveMediaUrls:
    def test_no_media_refs(self):
        body = {"text": "hello"}
        assert ch.resolve_media_urls(body, "alice") == body

    def test_resolve_media(self):
        body = {"text": "hello", "media_refs": ["img-1"]}
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    (
                        "img-1",
                        '{"url":"http://example.com/img.png","mime_type":"image/png","filename":"img.png","size_bytes":1024}',
                        "media_metadata",
                    ),
                ]
            )
            result = ch.resolve_media_urls(body, "alice")
            assert len(result["media_refs"]) == 1
            assert result["media_refs"][0]["read_url"] == "http://example.com/img.png"

    def test_resolve_multiple_refs(self):
        body = {"text": "hello", "media_refs": ["img-1", "img-2"]}
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    (
                        "img-1",
                        '{"url":"http://a.png","mime_type":"image/png","filename":"a.png","size_bytes":100}',
                        "media_metadata",
                    ),
                    (
                        "img-2",
                        '{"url":"http://b.jpg","mime_type":"image/jpeg","filename":"b.jpg","size_bytes":200}',
                        "public_media",
                    ),
                ]
            )
            result = ch.resolve_media_urls(body, "alice")
            assert len(result["media_refs"]) == 2
            assert result["media_refs"][0]["read_url"] == "http://a.png"
            assert result["media_refs"][1]["read_url"] == "http://b.jpg"


# ---------------------------------------------------------------------------
# Node stats
# ---------------------------------------------------------------------------


class TestNodeStats:
    def test_stats(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([(42,)]),  # users
                _mock_result_rows([(100,)]),  # documents
                _mock_result_rows([(5,)]),  # groups
                _mock_result_rows([("https://a.com", "App A", "", "", "[]", "approved", 1)]),  # list_apps
                _mock_result_rows([(1024,)]),  # storage (system.parts)
            ]
            stats = ch.get_node_stats()
            assert stats["users"] == 42
            assert stats["documents"] == 100
            assert stats["groups"] == 5
            assert len(stats["apps"]) == 1
            assert stats["apps"][0]["url"] == "https://a.com"
            assert stats["apps"][0]["visits"] == 0
            assert stats["storage"] == 1024

    def test_stats_no_apps_no_storage(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([(10,)]),  # users
                _mock_result_rows([(50,)]),  # documents
                _mock_result_rows([(2,)]),  # groups
                _mock_result_rows([]),  # list_apps — empty
                _mock_result_rows([(None,)]),  # storage — null
            ]
            stats = ch.get_node_stats()
            assert stats["users"] == 10
            assert stats["documents"] == 50
            assert stats["groups"] == 2
            assert stats["apps"] == []
            assert stats["storage"] == 0

    def test_stats_storage_exception(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([(1,)]),  # users
                _mock_result_rows([(1,)]),  # documents
                _mock_result_rows([(1,)]),  # groups
                _mock_result_rows([]),  # list_apps — empty
                Exception("ClickHouse unavailable"),  # storage — error
            ]
            stats = ch.get_node_stats()
            assert stats["users"] == 1
            assert stats["storage"] == 0


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


class TestCreateUser:
    def test_create(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(0,)])
            result = ch.create_user("alice", "hash123", phone="+1234")
            assert result["username"] == "alice"
            mock_client.insert.assert_called_once()

    def test_duplicate(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.create_user("alice", "hash123") is None


class TestGetUser:
    def test_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("alice", "hash123", "+1234", 1, "a@b.com", 0, datetime(2026, 1, 1))]
            )
            user = ch.get_user("alice")
            assert user["username"] == "alice"
            assert user["phone_verified"] is True

    def test_not_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.get_user("alice") is None


class TestAuthenticateUser:
    def test_correct(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("alice", "$2b$12$hash123", "", 0, "", 0, datetime(2026, 1, 1))]
            )
            with patch("app.services.auth.verify_password", return_value=True):
                assert ch.authenticate_user("alice", "secret") is True

    def test_wrong(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("alice", "$2b$12$hash123", "", 0, "", 0, datetime(2026, 1, 1))]
            )
            with patch("app.services.auth.verify_password", return_value=False):
                assert ch.authenticate_user("alice", "wrong") is False


class TestChangePassword:
    def test_change(self):
        with _patch_client() as mock_client:
            ch.change_password("alice", "new_hash")
            mock_client.command.assert_called_once()


class TestChangePhone:
    def test_change(self):
        with _patch_client() as mock_client:
            ch.change_phone("alice", "+999")
            mock_client.command.assert_called_once()


class TestSetEmail:
    def test_set(self):
        with _patch_client() as mock_client:
            ch.set_email("alice", "a@b.com")
            mock_client.command.assert_called_once()


class TestVerifyPhone:
    def test_verify(self):
        with _patch_client() as mock_client:
            ch.verify_phone("alice")
            mock_client.command.assert_called_once()


class TestMedia:
    def test_confirm_upload(self):
        with _patch_client() as mock_client:
            result = ch.confirm_media_upload("alice", {"url": "http://x", "filename": "a.png"})
            assert result["filename"] == "a.png"
            mock_client.insert.assert_called_once()

    def test_list_media(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("doc-1", '{"filename":"a.png"}', datetime(2026, 1, 1))]
            )
            result = ch.list_media("alice")
            assert len(result) == 1
            assert result[0]["doc_id"] == "doc-1"

    def test_delete_media(self):
        with _patch_client() as mock_client:
            ch.delete_media("alice", "doc-1")
            mock_client.command.assert_called_once()


# ---------------------------------------------------------------------------
# App Store
# ---------------------------------------------------------------------------


class TestRegisterApp:
    def test_register(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            result = ch.register_app({"url": "https://myapp.com", "name": "My App"})
            assert result["url"] == "https://myapp.com"
            mock_client.insert.assert_called_once()

    def test_register_duplicate(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("https://myapp.com", "My App", "", "", "[]", 1, "approved", 1)]
            )
            result = ch.register_app({"url": "https://myapp.com"})
            assert result["review_state"] == "approved"
            mock_client.insert.assert_not_called()


class TestListApps:
    def test_list(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("https://a.com", "App A", "", "", "[]", "approved", 1)]
            )
            result = ch.list_apps()
            assert len(result) == 1
            assert result[0]["url"] == "https://a.com"


class TestCreateAppRating:
    def test_rating(self):
        with _patch_client() as mock_client:
            result = ch.create_app_rating("alice", "https://a.com", 5, "api.web10.app")
            assert result["rating"] == 5
            mock_client.insert.assert_called_once()


class TestGetAppRatings:
    def test_ratings(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([("alice", 5, "api.web10.app", datetime(2026, 1, 1))])
            result = ch.get_app_ratings("https://a.com")
            assert len(result) == 1
            assert result[0]["rating"] == 5
