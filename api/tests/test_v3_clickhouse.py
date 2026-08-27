"""Tests for v3 ClickHouse service layer and endpoints.

Uses mocked clickhouse-connect client — no real ClickHouse needed.
"""

from datetime import datetime, timedelta
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
# Schema self-heal
# ---------------------------------------------------------------------------


class TestEnsureAppsSchema:
    def test_creates_app_visits_for_pre_existing_volumes(self):
        # Pre-existing dev/prod volumes predate the app_visits table (D49);
        # without the self-heal, the ingest gate and the /v3/stats macro
        # query a missing table on the first ping.
        with _patch_client() as mock_client:
            ch.ensure_apps_schema()
        commands = [c[0][0] for c in mock_client.command.call_args_list]
        assert any("CREATE TABLE IF NOT EXISTS app_visits" in c for c in commands)
        assert any("ALTER TABLE apps ADD COLUMN IF NOT EXISTS visits" in c for c in commands)
        assert any("CREATE TABLE IF NOT EXISTS node_config" in c for c in commands)


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

    def test_insert_with_ref_value(self):
        """The ref pattern: a reaction/comment points at its target via ref_value."""
        with _patch_client() as mock_client:
            result = ch.insert_document(
                author_key="bob",
                service="reactions",
                body={"type": "like"},
                ref_value="target-post-id",
            )
            assert result["ref_value"] == "target-post-id"
            row = mock_client.insert.call_args[0][1][0]
            # documents row: [doc_id, author, service, body, ref_value, tags, ...]
            assert row[4] == "target-post-id"


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
            mock_client.query.side_effect = [
                _mock_result_rows(
                    [
                        ("g1", "open", "admin"),
                    ]
                ),
                _mock_result_rows(
                    [
                        ("g1", 5),
                    ]
                ),
            ]
            groups = ch.get_user_groups("alice")
            assert len(groups) == 1
            assert groups[0]["group_id"] == "g1"
            assert groups[0]["my_role"] == "admin"
            assert groups[0]["member_count"] == 5


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
            # user-wide blacklist: dedup-then-filter anti-join (latest row
            # wins, tombstones included, then deleted = 0) — a raw
            # `deleted = 0` join would keep matching the stale pre-unblock
            # row until a background merge
            ub_part = sql[sql.index("LEFT ANTI JOIN (SELECT user_key, blocked_key") : sql.index(") ub ")]
            assert "FROM user_blacklist" in ub_part
            assert "rn = 1 AND deleted = 0" in ub_part
            # per-group blacklist: the author's content in the group is
            # hidden from the blocked member (one-directional)
            gb_part = sql[sql.index("LEFT ANTI JOIN (SELECT user_key, group_id, blocked_key") : sql.index(") gb ")]
            assert "FROM group_blacklist" in gb_part
            assert "rn = 1 AND deleted = 0" in gb_part
            assert "gb.group_id = pg.group_id" in sql
            assert "gb.blocked_key = %(member_key)s" in sql
            # sharing toggle: the author's content is hidden from members
            # when sharing is off, but the author's own reads are exempt
            ugs_part = sql[
                sql.index("LEFT ANTI JOIN (SELECT user_key, group_id, sharing_enabled") : sql.index(") ugs ")
            ]
            assert "FROM user_group_sharing" in ugs_part
            assert "rn = 1 AND deleted = 0" in ugs_part
            assert "ugs.sharing_enabled = 0" in sql
            assert "p.author_key != %(member_key)s" in sql
            # Verify hidden docs exclusion — dedup-then-filter anti-join
            # (latest row per (group_id, doc_id) wins, tombstones included,
            # then deleted = 0). A raw `deleted = 0` join would keep matching
            # the stale hide row after a restore (tombstone) until a merge.
            hd_part = sql[sql.index("LEFT ANTI JOIN (SELECT group_id, doc_id FROM") : sql.index(") hd ")]
            assert "FROM group_hidden_docs" in hd_part
            assert "rn = 1 AND deleted = 0" in hd_part
            assert "hd.doc_id = p.doc_id" in sql
            assert "hd.group_id = pg.group_id" in sql


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
            mock_client.query.side_effect = [
                _mock_result_rows(
                    [
                        (
                            "g1",
                            "open",
                            '[{"name": "admin", "services": ["*"], "permissions": ["readAll", "manageRoles"]}]',
                            "admin",
                        )
                    ]
                ),
                _mock_result_rows(
                    [
                        ("g1", 5),
                    ]
                ),
            ]
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 1
            assert groups[0]["group_id"] == "g1"
            assert groups[0]["member_count"] == 5

    def test_no_manage(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows(
                    [("g1", "open", '[{"name": "admin", "services": ["*"], "permissions": ["readAll"]}]', "admin")]
                ),
                _mock_result_rows([]),
            ]
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 0

    def test_empty(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 0

    def test_legacy_dict_format(self):
        """Backward compat: old dict-style roles still work."""
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([("g1", "open", '{"admin": {"permissions": ["manageRoles"]}}', "admin")]),
                _mock_result_rows(
                    [("g1", 3)],
                ),
            ]
            groups = ch.get_groups_manages("alice")
            assert len(groups) == 1
            assert groups[0]["group_id"] == "g1"
            assert groups[0]["member_count"] == 3


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


class TestResolveMinioTypes:
    def test_no_minio_types_unchanged(self):
        body = {"text": "hello", "age": {"type": "number", "value": 5}}
        with patch.object(ch, "get_s3_signing_client") as mock_signing:
            result = ch.resolve_minio_types(body)
            assert result == body
            mock_signing.assert_not_called()

    def test_resolves_minio_type(self):
        body = {"image": {"type": "minio", "value": "alice/cat.png"}}
        with patch.object(ch, "get_s3_signing_client") as mock_signing:
            mock_client = MagicMock()
            mock_client.generate_presigned_url.return_value = "http://minio/alice/cat.png?sig=abc"
            mock_signing.return_value = mock_client
            result = ch.resolve_minio_types(body)
            # type + value are kept, a fresh presigned url is added
            assert result["image"]["type"] == "minio"
            assert result["image"]["value"] == "alice/cat.png"
            assert result["image"]["url"] == "http://minio/alice/cat.png?sig=abc"
            # the input body is not mutated
            assert "url" not in body["image"]
            mock_client.generate_presigned_url.assert_called_once()

    def test_resolves_nested_and_array_minio_types(self):
        body = {
            "cat": {"type": "text", "value": "henry"},
            "cat-vids": [
                {"type": "minio", "value": "alice/henry.mp4"},
                {"type": "minio", "value": "alice/henry2.mp4"},
            ],
            "nested": {"deep": {"pic": {"type": "minio", "value": "alice/pic.jpg"}}},
        }
        with patch.object(ch, "get_s3_signing_client") as mock_signing:
            mock_client = MagicMock()
            mock_client.generate_presigned_url.side_effect = lambda *a, **k: f"http://minio/{k['Params']['Key']}?sig=x"
            mock_signing.return_value = mock_client
            result = ch.resolve_minio_types(body)
            assert result["cat-vids"][0]["url"] == "http://minio/alice/henry.mp4?sig=x"
            assert result["cat-vids"][1]["url"] == "http://minio/alice/henry2.mp4?sig=x"
            assert result["nested"]["deep"]["pic"]["url"] == "http://minio/alice/pic.jpg?sig=x"
            # non-minio types are left alone
            assert result["cat"] == {"type": "text", "value": "henry"}

    def test_resolve_media_urls_in_docs_resolves_minio(self):
        docs = [
            {"doc_id": "d1", "author_key": "alice", "body": {"image": {"type": "minio", "value": "alice/a.png"}}},
            {"doc_id": "d2", "author_key": "alice", "body": {"text": "no media"}},
        ]
        with patch.object(ch, "get_s3_signing_client") as mock_signing:
            mock_client = MagicMock()
            mock_client.generate_presigned_url.return_value = "http://minio/alice/a.png?sig=abc"
            mock_signing.return_value = mock_client
            result = ch.resolve_media_urls_in_docs(docs)
            assert result[0]["body"]["image"]["url"] == "http://minio/alice/a.png?sig=abc"
            # a doc with no minio types is passed through untouched
            assert result[1]["body"] == {"text": "no media"}
            # the input docs are not mutated
            assert "url" not in docs[0]["body"]["image"]


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
                _mock_result_rows([(3,)]),  # app_count
                _mock_result_rows([(1024,)]),  # storage (system.parts)
                _mock_result_rows([(7, 40, 90, 120)]),  # active_users 1d/30d/90d/1y
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", return_value=512):
                stats = ch.get_node_stats()
            assert stats["users"] == 42
            assert stats["documents"] == 100
            assert stats["groups"] == 5
            assert stats["app_count"] == 3
            assert stats["active_users"] == {"users_1d": 7, "users_30d": 40, "users_90d": 90, "users_1y": 120}
            assert stats["storage"] == 1536  # 1024 clickhouse + 512 s3
            assert "apps" not in stats  # per-app list moved to list_store_apps

    def test_stats_no_visits_no_storage(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([(10,)]),  # users
                _mock_result_rows([(50,)]),  # documents
                _mock_result_rows([(2,)]),  # groups
                _mock_result_rows([(0,)]),  # app_count
                _mock_result_rows([(None,)]),  # storage — null
                _mock_result_rows([]),  # active_users — no rows
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", return_value=0):
                stats = ch.get_node_stats()
            assert stats["users"] == 10
            assert stats["app_count"] == 0
            assert stats["active_users"] == {"users_1d": 0, "users_30d": 0, "users_90d": 0, "users_1y": 0}
            assert stats["storage"] == 0

    def test_stats_storage_exception(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([(1,)]),  # users
                _mock_result_rows([(1,)]),  # documents
                _mock_result_rows([(1,)]),  # groups
                _mock_result_rows([(0,)]),  # app_count
                Exception("ClickHouse unavailable"),  # storage — error
                _mock_result_rows([(0, 0, 0, 0)]),  # active_users
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", return_value=256):
                stats = ch.get_node_stats()
            assert stats["users"] == 1
            assert stats["storage"] == 256  # S3 bytes survive CH failure

    def test_stats_s3_exception(self):
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([(1,)]),  # users
                _mock_result_rows([(1,)]),  # documents
                _mock_result_rows([(1,)]),  # groups
                _mock_result_rows([(0,)]),  # app_count
                _mock_result_rows([(2048,)]),  # storage
                _mock_result_rows([(0, 0, 0, 0)]),  # active_users
            ]
            with patch("app.v3.services.clickhouse.total_s3_size", side_effect=Exception("S3 down")):
                stats = ch.get_node_stats()
            assert stats["users"] == 1
            assert stats["storage"] == 2048  # CH bytes survive S3 failure


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


class TestCreateUser:
    def test_create(self):
        with _patch_client() as mock_client:
            # query 1: existing-user count (0 = new); query 2: get_group
            # (empty = group missing, so the contract is created first).
            mock_client.query.side_effect = [
                _mock_result_rows([(0,)]),
                _mock_result_rows([]),
            ]
            result = ch.create_user("alice", "hash123", phone="+1234")
            assert result["username"] == "alice"
            # inserts: users row, then the discover-group auto-enrollment
            # (group contract + membership).
            insert_tables = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "users" in insert_tables
            assert "group_members" in insert_tables
            # the membership row enrolls the new user in the discover group
            member_insert = next(c for c in mock_client.insert.call_args_list if c[0][0] == "group_members")
            row = member_insert[0][1][0]
            assert row[0] == ch.DISCOVER_GROUP_ID
            assert row[1] == "alice"
            assert row[2] == "member"

    def test_create_group_already_exists(self):
        with _patch_client() as mock_client:
            # group contract already present (boot pass ran) — no re-create.
            group_row = (
                ch.DISCOVER_GROUP_ID,
                "[]",
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
            mock_client.query.side_effect = [
                _mock_result_rows([(0,)]),
                _mock_result_rows([group_row]),
            ]
            ch.create_user("alice", "hash123")
            insert_tables = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "group_contracts" not in insert_tables  # not re-created
            assert "group_members" in insert_tables  # still enrolled

    def test_duplicate(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(1,)])
            assert ch.create_user("alice", "hash123") is None
            mock_client.insert.assert_not_called()


class TestListUsers:
    def test_list(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([("alice",), ("bob",)])
            users = ch.list_users()
            assert users == [{"username": "alice"}, {"username": "bob"}]

    def test_empty(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.list_users() == []


class TestGetGroupMemberKeys:
    def test_keys(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([("anon",), ("alice",)])
            assert ch.get_group_member_keys("g") == ["anon", "alice"]

    def test_empty(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.get_group_member_keys("g") == []


class TestEnsureDiscoverGroup:
    """The node-default universal public board (KB: social-contracts.md §1)."""

    def test_creates_group_anon_and_backfills(self):
        with _patch_client() as mock_client:
            # query sequence: get_group (missing), member keys (empty),
            # list_users (two pre-existing accounts).
            mock_client.query.side_effect = [
                _mock_result_rows([]),  # get_group → missing
                _mock_result_rows([]),  # get_group_member_keys → nobody yet
                _mock_result_rows([("alice",), ("bob",)]),  # list_users
            ]
            ch.ensure_discover_group()
            insert_tables = [c[0][0] for c in mock_client.insert.call_args_list]
            # group contract created once
            assert insert_tables.count("group_contracts") == 1
            # anon + both users enrolled
            member_rows = [c[0][1][0] for c in mock_client.insert.call_args_list if c[0][0] == "group_members"]
            enrolled = {r[1] for r in member_rows}
            assert enrolled == {"anon", "alice", "bob"}

    def test_idempotent_when_populated(self):
        with _patch_client() as mock_client:
            group_row = (
                ch.DISCOVER_GROUP_ID,
                "[]",
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
            # get_group → exists; member keys → anon + alice already in;
            # list_users → alice (already a member, no re-add).
            mock_client.query.side_effect = [
                _mock_result_rows([group_row]),
                _mock_result_rows([("anon",), ("alice",)]),
                _mock_result_rows([("alice",)]),
            ]
            ch.ensure_discover_group()
            # nothing to do — no inserts at all
            mock_client.insert.assert_not_called()

    def test_backfills_only_missing_users(self):
        with _patch_client() as mock_client:
            group_row = (
                ch.DISCOVER_GROUP_ID,
                "[]",
                "open",
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
            # group exists; anon + alice already members; bob is new.
            mock_client.query.side_effect = [
                _mock_result_rows([group_row]),
                _mock_result_rows([("anon",), ("alice",)]),
                _mock_result_rows([("alice",), ("bob",)]),
            ]
            ch.ensure_discover_group()
            member_rows = [c[0][1][0] for c in mock_client.insert.call_args_list if c[0][0] == "group_members"]
            # only bob is added — anon + alice are already members
            assert [r[1] for r in member_rows] == ["bob"]


class TestGetHiddenDocs:
    def test_lists_hidden_with_author(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [
                    (
                        "doc-1",
                        "admin1",
                        datetime(2026, 1, 2),
                        "alice",
                        '{"text":"bad post"}',
                    ),
                ]
            )
            rows = ch.get_hidden_docs("g")
            assert rows[0]["doc_id"] == "doc-1"
            assert rows[0]["author_key"] == "alice"
            assert rows[0]["moderator_key"] == "admin1"
            assert rows[0]["body"]["text"] == "bad post"

    def test_empty(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            assert ch.get_hidden_docs("g") == []


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
    def test_register_normalizes_url_anon_no_visit(self):
        """D49 / #4: canonical url; anon (no token) creates the apps row but
        records NO visit (anon dropped at ingest)."""
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            result = ch.register_app({"url": "https://myapp.com", "name": "My App"})
            assert result["url"] == "https://myapp.com/"  # canonical
            tables = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "apps" in tables
            assert "app_visits" not in tables

    def test_register_repeat_no_metadata_no_append(self):
        """D49: a repeat url-only ping does NOT append to apps — apps is a
        stable registration record, not a per-ping log."""
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("https://myapp.com/", "My App", "", "", "[]", 1, "approved", 1, 47)]
            )
            result = ch.register_app({"url": "https://myapp.com/"})
            assert result["review_state"] == "approved"
            mock_client.command.assert_not_called()
            tables = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "apps" not in tables

    def test_register_metadata_change_appends(self):
        """A repeat ping with changed metadata appends a new apps row
        (metadata_version bumped) — the only repeat case that touches apps."""
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("https://myapp.com/", "Old", "", "", "[]", 1, "approved", 1, 47)]
            )
            ch.register_app({"url": "https://myapp.com/", "name": "New"})
            mock_client.command.assert_called_once()
            assert "metadata_version + 1" in mock_client.command.call_args[0][0]


class TestCanonicalAppUrlIndexHtml:
    """D47: the canonicalizer folds a trailing /index.html to the directory.
    #683 covers the bare form; this pins the trailing-slash form (.../index.html/)
    that rows registered between hardening #4 and #683 carry — the migration
    relies on it to re-home every stored spelling."""

    def test_bare_index_html(self):
        assert (
            ch._canonical_app_url("https://dev.web10.app/docs/media/index.html") == "https://dev.web10.app/docs/media/"
        )

    def test_index_html_with_trailing_slash(self):
        assert (
            ch._canonical_app_url("https://dev.web10.app/docs/media/index.html/") == "https://dev.web10.app/docs/media/"
        )

    def test_root_index_html(self):
        assert ch._canonical_app_url("https://myapp.com/index.html") == "https://myapp.com/"

    def test_real_file_not_stripped(self):
        """Only a TRAILING index.html is a server detail — a non-index file
        keeps its name."""
        assert ch._canonical_app_url("https://myapp.com/docs/notes.html") == "https://myapp.com/docs/notes.html/"


class TestMigrateFileIndexAppRows:
    """The one-time boot migration: re-home demo apps registered under their
    directory-index file URLs onto their directory URLs (preserving approval),
    and tombstone the file rows. #683 fixed NEW registrations; this cleans the
    rows already stored under file URLs (icon-less duplicate store cards).
    Idempotent + safe under concurrent workers."""

    # Source-query row shape: url, name, description, icon_url, screenshots,
    # visits, approved, review_state, metadata_version, created_at
    FILE_ROW = (
        "https://dev.web10.app/docs/media/index.html",
        "Media (HLS)",
        "desc",
        "",
        "[]",
        0,
        1,  # approved
        "approved",
        3,
        "2026-01-01T00:00:00",
    )

    def test_no_file_index_rows_noop(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            ch._migrate_file_index_app_rows()
        mock_client.insert.assert_not_called()
        mock_client.command.assert_not_called()

    def test_rehomes_file_row_to_directory_and_tombstones(self):
        """A live file-index row with no directory counterpart is re-homed
        (state carried over) and the file row is tombstoned."""
        with _patch_client() as mock_client:
            # call 1 = source query (the file row), call 2 = get_app(directory)
            # → no live directory row yet.
            mock_client.query.side_effect = [
                _mock_result_rows([self.FILE_ROW]),
                _mock_result_rows([]),
            ]
            ch._migrate_file_index_app_rows()
        # Re-home insert under the directory URL, approval carried over.
        mock_client.insert.assert_called_once()
        args = mock_client.insert.call_args[0]
        assert args[0] == "apps"
        values = args[1][0]
        assert values[0] == "https://dev.web10.app/docs/media/"  # url
        assert values[1] == "Media (HLS)"  # name carried over
        assert values[6] == 1  # approved carried over
        assert values[11] == 0  # deleted = 0
        # Tombstone the file row.
        mock_client.command.assert_called_once()
        assert "deleted" in mock_client.command.call_args[0][0]
        assert mock_client.command.call_args[0][1]["url"] == self.FILE_ROW[0]

    def test_directory_row_exists_skips_insert_but_tombstones(self):
        """If a live directory row already exists (a post-#683 visit
        registered it), keep that row — just drop the stale file row."""
        with _patch_client() as mock_client:
            mock_client.query.side_effect = [
                _mock_result_rows([self.FILE_ROW]),
                _mock_result_rows(
                    [("https://dev.web10.app/docs/media/", "Media (HLS)", "", "", "[]", 1, "approved", 1, 47)]
                ),
            ]
            ch._migrate_file_index_app_rows()
        mock_client.insert.assert_not_called()  # no duplicate directory row
        mock_client.command.assert_called_once()  # file row still tombstoned

    def test_source_query_only_considers_live_rows(self):
        """Idempotency hinge: the source query filters rn=1 AND deleted=0, so
        once the file rows are tombstoned the migration finds nothing on the
        next boot."""
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])
            ch._migrate_file_index_app_rows()
        source_sql = mock_client.query.call_args[0][0]
        assert "rn = 1 AND deleted = 0" in source_sql
        assert "LIKE '%/index.html'" in source_sql


class TestCountAppVisit:
    """The D49 ingest gate: one counted visit per (app, user) per 3h."""

    def test_first_visit_inserts(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([])  # no prior row
            ch._count_app_visit("https://a.com/", "alice")
            mock_client.insert.assert_called_once()
            assert mock_client.insert.call_args[0][0] == "app_visits"

    def test_within_window_gated(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(datetime.utcnow() - timedelta(hours=1),)])
            ch._count_app_visit("https://a.com/", "alice")
            mock_client.insert.assert_not_called()  # within 3h — gated out

    def test_outside_window_inserts(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows([(datetime.utcnow() - timedelta(hours=4),)])
            ch._count_app_visit("https://a.com/", "alice")
            mock_client.insert.assert_called_once()  # >3h — counted


class TestListApps:
    def test_list(self):
        with _patch_client() as mock_client:
            mock_client.query.return_value = _mock_result_rows(
                [("https://a.com", "App A", "", "", "[]", 47, "approved", 1)]
            )
            result = ch.list_apps()
            assert len(result) == 1
            assert result[0]["url"] == "https://a.com"
            assert result[0]["visits"] == 47


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
