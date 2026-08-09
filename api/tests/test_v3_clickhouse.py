"""Tests for v3 ClickHouse service layer and endpoints.

Uses mocked clickhouse-connect client — no real ClickHouse needed.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.v3.services import clickhouse as ch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_result_rows(rows):
    """Build a mock query result with result_rows()."""
    mock = MagicMock()
    mock.result_rows.return_value = rows
    return mock


def _patch_client():
    """Patch the clickhouse client for the duration of the test."""
    mock_client = MagicMock()
    return patch.object(ch, "client", mock_client)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class TestInsertDocument:
    def test_insert_and_return(self):
        with _patch_client() as mock_client:
            result = ch.insert_document(
                doc_id="doc-1",
                author_key="alice",
                collection_name="posts",
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


class TestGetDocument:
    def test_found(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([
                ("doc-1", "alice", "posts", '{"text":"hello"}', "", ["test"], datetime(2026, 1, 1), datetime(2026, 1, 1)),
            ])
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
            mock_client.query.return_value = _mock_result_rows([
                ("doc-1", "alice", "posts", '{"text":"old"}', "", [], original_created, datetime(2026, 1, 1, 12, 0, 0)),
            ])
            result = ch.update_document(
                doc_id="doc-1",
                author_key="alice",
                collection_name="posts",
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
            mock_client.query.return_value = _mock_result_rows([
                ("doc-1", "alice", "posts", '{"text":"hello"}', "", [], datetime(2026, 1, 1), datetime(2026, 1, 1)),
            ])
            results = ch.read_documents(author_key="alice", collection_name="posts")
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
            mock_client.query.return_value = _mock_result_rows([
                ("g1", '{"roles":[]}', "open", datetime(2026, 1, 1), datetime(2026, 1, 1)),
            ])
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
            mock_client.query.return_value = _mock_result_rows([
                ("alice", "admin", datetime(2026, 1, 1)),
                ("bob", "member", datetime(2026, 1, 2)),
            ])
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
            mock_client.query.return_value = _mock_result_rows([
                ("g1", "open", "admin", 5),
            ])
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
            mock_client.query.return_value = _mock_result_rows([
                ("alice", "pending", datetime(2026, 1, 1)),
            ])
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
# Service Contracts
# ---------------------------------------------------------------------------


class TestServiceContracts:
    def test_add(self):
        with _patch_client() as mock_client:
            result = ch.add_service_contract("alice", "posts", "myapp.com")
            assert result["service_name"] == "posts"
            assert result["allowed_origin"] == "myapp.com"

    def test_get(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([
                ("posts", "myapp.com"),
            ])
            contracts = ch.get_service_contracts("alice")
            assert len(contracts) == 1
            assert contracts[0]["service_name"] == "posts"

    def test_is_origin_allowed_true(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.is_origin_allowed("alice", "posts", "myapp.com") is True

    def test_is_origin_allowed_false(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(0,)])
            assert ch.is_origin_allowed("alice", "posts", "evil.com") is False

    def test_revoke(self):
        with _patch_client() as mock_client:
            ch.revoke_service_contract("alice", "myapp.com")
            mock_client.command.assert_called_once()

    def test_revoke_all(self):
        with _patch_client() as mock_client:
            ch.revoke_all_service_contracts("alice")
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
            assert len(call_args[1][0]) == 4  # user_key, group_id, blocked_key, created_at

    def test_unblock(self):
        with _patch_client() as mock_client:
            ch.unblock_user_in_group("alice", "g1", "bob")
            mock_client.command.assert_called_once()
            sql = mock_client.command.call_args[0][0]
            assert "DELETE FROM group_blacklist" in sql


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
            mock_client.query.return_value = _mock_result_rows([
                ("doc-1", "bob", '{"text":"hello"}', ["test"], datetime(2026, 1, 1), ""),
            ])
            results = ch.read_documents_in_groups(
                group_ids=["g1"],
                member_key="alice",
                collection_name="posts",
            )
            assert len(results) == 1
            assert results[0]["doc_id"] == "doc-1"
            assert results[0]["author_key"] == "bob"
            # Verify blacklist filter is author-controlled (author blocks reader)
            mock_client.query.assert_called_once()
            sql = mock_client.query.call_args[0][0]
            assert "user_key = p.author_key" in sql
            assert "blocked_key = %(member_key)s" in sql
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
            mock_client.query.return_value = _mock_result_rows([
                ("doc-1", 3),
                ("doc-2", 7),
            ])
            counts = ch.get_ref_counts(["doc-1", "doc-2"])
            assert counts["doc-1"] == 3
            assert counts["doc-2"] == 7

    def test_ref_counts_empty(self):
        assert ch.get_ref_counts([]) == {}
