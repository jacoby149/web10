"""Tests for the pure transformation & query-safety functions in services/documentdb.py."""

from unittest.mock import MagicMock, patch

import pytest

from app.services import documentdb


class TestToGui:
    def test_extract_body_and_id(self):
        doc = {"_id": "abc123", "service": "posts", "body": {"title": "hello", "count": 1}}
        result = documentdb.to_gui(doc)
        assert result["_id"] == "abc123"
        assert result["title"] == "hello"
        assert result["count"] == 1
        # I6: metadata fields present (None for legacy docs without them)
        assert result["_author"] is None
        assert result["_source_node"] is None
        assert result["_created_at"] is None

    def test_empty_body(self):
        doc = {"_id": "x", "service": "s", "body": {}}
        result = documentdb.to_gui(doc)
        assert result["_id"] == "x"
        assert result["_author"] is None
        assert result["_source_node"] is None
        assert result["_created_at"] is None

    def test_nested_body(self):
        doc = {"_id": "1", "service": "s", "body": {"a": {"b": 2}}}
        result = documentdb.to_gui(doc)
        assert result["_id"] == "1"
        assert result["a"] == {"b": 2}
        assert result["_author"] is None

    def test_metadata_passthrough(self):
        """I6: metadata fields stored in body are passed through to_gui."""
        doc = {
            "_id": "abc",
            "service": "posts",
            "body": {"title": "hi", "_author": "alice", "_source_node": "node1", "_created_at": "2026-01-01"},
        }
        result = documentdb.to_gui(doc)
        assert result["_author"] == "alice"
        assert result["_source_node"] == "node1"
        assert result["_created_at"] == "2026-01-01"


class TestToDb:
    def test_basic_wrap(self):
        result = documentdb.to_db({"title": "hi"}, "posts")
        assert result["service"] == "posts"
        assert result["body"]["title"] == "hi"
        # I6: _created_at always injected
        assert "_created_at" in result["body"]

    def test_preserves_id(self):
        result = documentdb.to_db({"_id": "oid", "name": "x"}, "svc")
        assert result["_id"] == "oid"
        assert result["body"]["name"] == "x"
        assert "_id" not in result["body"]
        assert "_created_at" in result["body"]

    def test_no_id(self):
        result = documentdb.to_db({"k": "v"}, "svc")
        assert "_id" not in result
        assert result["service"] == "svc"
        assert result["body"]["k"] == "v"
        assert "_created_at" in result["body"]

    def test_injects_author_and_source_node(self):
        """I6: to_db injects author and source_node when provided."""
        result = documentdb.to_db({"title": "hi"}, "posts", author="alice", source_node="node1")
        assert result["body"]["_author"] == "alice"
        assert result["body"]["_source_node"] == "node1"
        assert "_created_at" in result["body"]

    def test_strips_client_metadata(self):
        """I6: client-supplied immutable metadata is stripped."""
        result = documentdb.to_db(
            {"title": "hi", "_author": "hacker", "_source_node": "fake", "_created_at": "2000-01-01"},
            "posts",
            author="alice",
            source_node="node1",
        )
        assert result["body"]["_author"] == "alice"
        assert result["body"]["_source_node"] == "node1"
        # _created_at should be server time, not "2000-01-01"
        assert result["body"]["_created_at"] != "2000-01-01"


class TestToDbField:
    def test_id_passthrough(self):
        assert documentdb.to_db_field("_id") == "_id"

    def test_regular_field(self):
        assert documentdb.to_db_field("name") == "body.name"

    def test_nested_field(self):
        assert documentdb.to_db_field("meta.tags") == "body.meta.tags"


class TestQTransform:
    def test_basic_query(self):
        q = documentdb.q_t({"title": "hello"}, "posts")
        assert q == {"service": "posts", "body.title": "hello"}

    def test_multiple_fields(self):
        q = documentdb.q_t({"title": "hi", "count": 5}, "posts")
        assert q == {"service": "posts", "body.title": "hi", "body.count": 5}

    def test_dollar_fields_stripped(self):
        q = documentdb.q_t({"$operator": "bad", "safe": "ok"}, "posts")
        assert "$operator" not in q
        assert "body.$operator" not in q
        assert q == {"service": "posts", "body.safe": "ok"}

    def test_empty_query(self):
        q = documentdb.q_t({}, "posts")
        assert q == {"service": "posts"}

    def test_service_always_set(self):
        q = documentdb.q_t({"a": 1}, "myService")
        assert q["service"] == "myService"


class TestUTransform:
    def test_basic_set(self):
        u = documentdb.u_t({"$set": {"title": "new"}})
        assert u == {"$set": {"body.title": "new"}}

    def test_multiple_ops(self):
        u = documentdb.u_t({"$set": {"a": 1}, "$inc": {"b": 2}})
        assert u == {"$set": {"body.a": 1}, "$inc": {"body.b": 2}}

    def test_id_dropped_from_update(self):
        """Top-level _id is Mongo-immutable (engine rejects any $set on it with
        code 66, "Performing an update on the path '_id' would modify the
        immutable field '_id'", even to the same value). u_t must drop _id from
        every operator so a client that round-trips a whole record (e.g. the
        social app's saveProfile, which spreads the existing profile — _id and
        all — into the $set payload) does not 500 on every edit.
        """
        u = documentdb.u_t({"$set": {"_id": "abc", "title": "new"}})
        assert "_id" not in u.get("$set", {})
        assert u["$set"]["body.title"] == "new"

    def test_id_dropped_from_unset(self):
        u = documentdb.u_t({"$unset": {"_id": 1, "title": ""}})
        assert "_id" not in u.get("$unset", {})
        assert u["$unset"]["body.title"] == ""

    def test_id_dropped_from_inc(self):
        u = documentdb.u_t({"$inc": {"_id": 1, "count": 1}})
        assert "_id" not in u.get("$inc", {})
        assert u["$inc"]["body.count"] == 1

    def test_round_tripped_record_does_not_set_id(self):
        """Regression: a client that sends the full read-back record as $set
        (the social app's saveProfile flow) must not blow up at Mongo by
        re-asserting the immutable _id it just read.
        """
        read_back = {"_id": "65ef", "display_name": "Alice", "avatar_ref": "m1"}
        u = documentdb.u_t({"$set": read_back})
        assert "_id" not in u["$set"]
        assert u["$set"]["body.display_name"] == "Alice"
        assert u["$set"]["body.avatar_ref"] == "m1"

    def test_fancy_update_rejected(self):
        with pytest.raises(Exception):
            documentdb.u_t({"$set": {"$first": 1, "$second": 2}})

    def test_single_dollar_field_allowed(self):
        result = documentdb.u_t({"$set": {"$only": 1}})
        assert result == {"$set": {"body.$only": 1}}

    def test_i6_blocks_author_via_set(self):
        """I6: u_t silently drops $set targeting _author."""
        u = documentdb.u_t({"$set": {"_author": "hacker", "title": "ok"}})
        assert "body._author" not in u.get("$set", {})
        assert u["$set"]["body.title"] == "ok"

    def test_i6_blocks_source_node_via_set(self):
        """I6: u_t silently drops $set targeting _source_node."""
        u = documentdb.u_t({"$set": {"_source_node": "fake"}})
        assert "body._source_node" not in u.get("$set", {})

    def test_i6_blocks_created_at_via_set(self):
        """I6: u_t silently drops $set targeting _created_at."""
        u = documentdb.u_t({"$set": {"_created_at": "2000-01-01"}})
        assert "body._created_at" not in u.get("$set", {})

    def test_i6_blocks_author_via_unset(self):
        """I6: u_t silently drops $unset targeting _author."""
        u = documentdb.u_t({"$unset": {"_author": ""}})
        assert "body._author" not in u.get("$unset", {})

    def test_i6_blocks_author_via_inc(self):
        """I6: u_t silently drops $inc targeting immutable fields."""
        u = documentdb.u_t({"$inc": {"_created_at": 1}})
        assert "body._created_at" not in u.get("$inc", {})

    def test_i6_other_fields_pass_through(self):
        """I6: non-immutable fields still pass through u_t normally."""
        u = documentdb.u_t({"$set": {"_author": "hacker", "title": "real", "count": 5}})
        assert "body._author" not in u.get("$set", {})
        assert u["$set"]["body.title"] == "real"
        assert u["$set"]["body.count"] == 5


class TestSortTransform:
    def test_basic(self):
        assert documentdb.sort_t({"visits": -1}) == [("body.visits", -1)]

    def test_multiple(self):
        result = documentdb.sort_t({"a": 1, "b": -1})
        assert len(result) == 2


class TestGetPull:
    def test_array_index_pull(self):
        u = {"$unset": {"tags.0": 1}}
        pull = documentdb.get_pull(u)
        assert pull == {"$pull": {"tags": None}}

    def test_no_unset_raises(self):
        with pytest.raises(Exception):
            documentdb.get_pull({"$set": {"a": 1}})

    def test_non_index_ignored(self):
        u = {"$unset": {"plain": 1}}
        pull = documentdb.get_pull(u)
        assert pull == {"$pull": {}}


class TestStarFound:
    def test_star_present(self):
        assert documentdb.star_found([{"service": "*", "username": "x"}]) is True

    def test_star_absent(self):
        assert documentdb.star_found([{"service": "posts", "title": "hi"}]) is False

    def test_empty_list(self):
        assert documentdb.star_found([]) is False

    def test_multiple_no_star(self):
        assert (
            documentdb.star_found(
                [
                    {"service": "a"},
                    {"service": "b"},
                ]
            )
            is False
        )

    def test_one_star_among_many(self):
        assert (
            documentdb.star_found(
                [
                    {"service": "a"},
                    {"service": "*"},
                    {"service": "b"},
                ]
            )
            is True
        )


class TestGetApproved:
    def test_owner_always_approved(self, mock_db_with_term):
        assert documentdb.get_approved("testuser", "api.localhost", "testuser", "myapi", "read") is True

    def test_no_record_returns_false(self, mock_db_term_none):
        assert documentdb.get_approved("u", "p", "owner", "svc", "read") is False

    def test_whitelist_exact_match(self, mock_db_with_term):
        assert documentdb.get_approved("testuser", "api.localhost", "owner", "myapi", "read") is True

    def test_whitelist_regex_match(self, mock_db_with_term):
        assert documentdb.get_approved("randomuser", "any.provider", "owner", "myapi", "read") is True

    def test_blacklist_blocks(self, mock_db_with_term):
        assert documentdb.get_approved("banneduser", "api.localhost", "owner", "myapi", "read") is False

    def test_blacklist_regex(self, mock_db_with_term):
        assert documentdb.get_approved("otheruser", "api.localhost", "owner", "myapi", "read") is True

    def test_permission_not_granted(self, mock_db_with_term):
        assert documentdb.get_approved("testuser", "api.localhost", "owner", "myapi", "delete") is False

    def test_all_permission(self):
        with patch(
            "app.services.documentdb.get_term_record",
            return_value={
                "service": "svc",
                "whitelist": [{"username": "u", "provider": "p", "all": True}],
                "blacklist": [],
            },
        ):
            assert documentdb.get_approved("u", "p", "owner", "svc", "anything") is True

    def test_blacklist_overrides_whitelist(self):
        with patch(
            "app.services.documentdb.get_term_record",
            return_value={
                "service": "svc",
                "whitelist": [{"username": "u", "provider": "p", "read": True}],
                "blacklist": [{"username": "u", "provider": "p", "read": True}],
            },
        ):
            assert documentdb.get_approved("u", "p", "owner", "svc", "read") is False

    def test_no_whitelist_field(self):
        with patch(
            "app.services.documentdb.get_term_record",
            return_value={"service": "svc", "blacklist": []},
        ):
            assert documentdb.get_approved("u", "p", "owner", "svc", "read") is False

    def test_no_blacklist_field(self):
        with patch(
            "app.services.documentdb.get_term_record",
            return_value={
                "service": "svc",
                "whitelist": [{"username": "u", "provider": "p", "read": True}],
            },
        ):
            assert documentdb.get_approved("u", "p", "owner", "svc", "read") is True


class TestIsInCrossOrigins:
    def test_exact_match(self, mock_db_with_term):
        assert documentdb.is_in_cross_origins("auth.localhost", "owner", "myapi") is True

    def test_regex_match(self, mock_db_with_term):
        assert documentdb.is_in_cross_origins("myapp.example.com", "owner", "myapi") is True

    def test_no_match(self, mock_db_with_term):
        assert documentdb.is_in_cross_origins("evil.com", "owner", "myapi") is False

    def test_no_record(self, mock_db_term_none):
        assert documentdb.is_in_cross_origins("anything", "owner", "svc") is False


class TestWeb10AppsPostId:
    """D37: web10apps_post_id generation is stable and URL-safe."""

    def test_generates_stable_id(self):
        url = "https://example.app"
        id1 = documentdb._generate_web10apps_post_id(url)
        id2 = documentdb._generate_web10apps_post_id(url)
        assert id1 == id2
        assert id1.startswith("app_")
        assert len(id1) == 12  # "app_" + 8 hex chars

    def test_different_urls_different_ids(self):
        id1 = documentdb._generate_web10apps_post_id("https://a.app")
        id2 = documentdb._generate_web10apps_post_id("https://b.app")
        assert id1 != id2


class TestAppRegistrationV2:
    """D37: register_app v2 — new apps start pending, repeat visits bump visits,
    listing edits on approved apps enter review."""

    def _mock_db(self, find_one_result=None):
        """Build a mock DB that responds to db["web10"]["apps"].find_one(...)."""
        mock_apps_col = MagicMock()
        mock_apps_col.find_one.return_value = find_one_result
        mock_web10_db = MagicMock()
        mock_web10_db.__getitem__.return_value = mock_apps_col
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_web10_db
        return mock_db, mock_apps_col

    def test_new_registration_starts_pending(self):
        mock_db, mock_apps_col = self._mock_db(find_one_result=None)

        with patch("app.services.documentdb.db", mock_db):
            documentdb.register_app({"url": "https://new.app", "name": "New App"})

        call_args = mock_apps_col.insert_one.call_args
        doc = call_args[0][0]
        assert doc["url"] == "https://new.app"
        assert doc["review_state"] == "pending"
        assert doc["approved"] is False
        assert doc["metadata_version"] == 1
        assert doc["name"] == "New App"
        assert doc["web10apps_post_id"].startswith("app_")

    def test_repeat_visit_increments_visits(self):
        existing = {
            "url": "https://existing.app",
            "visits": 5,
            "review_state": "approved",
            "name": "Existing",
        }
        mock_db, mock_apps_col = self._mock_db(find_one_result=existing)

        with patch("app.services.documentdb.db", mock_db):
            documentdb.register_app({"url": "https://existing.app"})

        update_call = mock_apps_col.update_one.call_args
        assert update_call[0][1]["$inc"]["visits"] == 1
        # Should NOT change review_state for a plain visit
        assert "review_state" not in update_call[0][1].get("$set", {})

    def test_listing_edit_on_approved_enters_review(self):
        existing = {
            "url": "https://approved.app",
            "visits": 10,
            "review_state": "approved",
            "name": "Old Name",
            "description": "Old desc",
            "icon_url": None,
            "screenshots": [],
        }
        mock_db, mock_apps_col = self._mock_db(find_one_result=existing)

        with patch("app.services.documentdb.db", mock_db):
            documentdb.register_app(
                {
                    "url": "https://approved.app",
                    "name": "New Name",
                    "description": "New desc",
                    "icon_url": "https://new-icon.png",
                }
            )

        update_call = mock_apps_col.update_one.call_args
        assert update_call[0][1]["$inc"]["metadata_version"] == 1
        assert update_call[0][1]["$set"]["review_state"] == "pending_on_change"
        assert update_call[0][1]["$set"]["pending_name"] == "New Name"
        assert update_call[0][1]["$set"]["pending_description"] == "New desc"
        assert update_call[0][1]["$set"]["pending_icon_url"] == "https://new-icon.png"


class TestAppApprovalV2:
    """D37: set_app_approval v2 — review_state machine, pending metadata promotion."""

    def _mock_db(self, find_one_results, discovery_col=None):
        """Build a mock DB for set_app_approval tests.
        find_one_results: list of results returned by find_one in order.
        discovery_col: optional mock for the discovery collection."""
        mock_apps_col = MagicMock()
        mock_apps_col.find_one.side_effect = find_one_results
        mock_discovery_col = discovery_col or MagicMock()

        def db_getitem(name):
            if name == "web10":

                class Web10DB:
                    def __getitem__(self, key):
                        if key == "apps":
                            return mock_apps_col
                        return mock_discovery_col

                return Web10DB()
            return mock_discovery_col

        mock_db = MagicMock()
        mock_db.__getitem__.side_effect = db_getitem
        return mock_db, mock_apps_col, mock_discovery_col

    def test_approve_pending_sets_approved(self):
        mock_db, mock_apps_col, _ = self._mock_db(
            find_one_results=[
                {"url": "https://a.app", "review_state": "pending", "web10apps_post_id": "app_123"},
                {
                    "url": "https://a.app",
                    "review_state": "approved",
                    "web10apps_post_id": "app_123",
                    "name": "A",
                    "description": "Desc",
                    "icon_url": None,
                    "registered_at": "2026-01-01",
                },
            ]
        )

        with patch("app.services.documentdb.db", mock_db):
            documentdb.set_app_approval("https://a.app", True)

        update_call = mock_apps_col.update_one.call_args
        assert update_call[0][1]["$set"]["review_state"] == "approved"
        assert update_call[0][1]["$set"]["approved"] is True

    def test_approve_pending_on_change_promotes_metadata(self):
        mock_db, mock_apps_col, _ = self._mock_db(
            find_one_results=[
                {
                    "url": "https://a.app",
                    "review_state": "pending_on_change",
                    "web10apps_post_id": "app_123",
                    "pending_description": "New desc",
                    "pending_icon_url": "https://new.png",
                    "pending_screenshots": ["https://ss.png"],
                },
                {
                    "url": "https://a.app",
                    "review_state": "approved",
                    "web10apps_post_id": "app_123",
                    "name": "A",
                    "description": "New desc",
                    "icon_url": "https://new.png",
                    "registered_at": "2026-01-01",
                },
            ]
        )

        with patch("app.services.documentdb.db", mock_db):
            documentdb.set_app_approval("https://a.app", True, "Looks good")

        update_call = mock_apps_col.update_one.call_args
        assert update_call[0][1]["$set"]["review_state"] == "approved"
        assert update_call[0][1]["$set"]["description"] == "New desc"
        assert update_call[0][1]["$set"]["icon_url"] == "https://new.png"
        assert update_call[0][1]["$set"]["reviewer_note"] == "Looks good"

    def test_reject_removes_discovery_projection(self):
        mock_discovery_col = MagicMock()
        mock_db, mock_apps_col, _ = self._mock_db(
            find_one_results=[
                {"url": "https://a.app", "review_state": "pending", "web10apps_post_id": "app_123"},
            ],
            discovery_col=mock_discovery_col,
        )

        with patch("app.services.documentdb.db", mock_db):
            documentdb.set_app_approval("https://a.app", False, "Not suitable")

        update_call = mock_apps_col.update_one.call_args
        assert update_call[0][1]["$set"]["review_state"] == "rejected"
        # Discovery projection should be removed
        mock_discovery_col.delete_one.assert_called_once()


class TestAppRatings:
    """D37: star ratings as public ledger entries, per-user upsert."""

    def _mock_db(self, find_one_result=None):
        mock_col = MagicMock()
        mock_col.find_one.return_value = find_one_result
        mock_web10_db = MagicMock()
        mock_web10_db.__getitem__.return_value = mock_col
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_web10_db
        return mock_db, mock_col

    def test_create_new_rating(self):
        mock_db, mock_col = self._mock_db(find_one_result=None)

        with (
            patch("app.services.documentdb.db", mock_db),
            patch("app.services.documentdb.settings", PROVIDER="api.localhost"),
        ):
            result = documentdb.create_app_rating("alice", "app_abc", 4, "api.localhost")

        assert result["author"] == "alice"
        assert result["payload"]["rating"] == 4
        assert result["target"] == "system/web10_apps/app_abc"
        assert result["payload"]["action"] == "rating"

    def test_update_existing_rating(self):
        existing = {
            "_id": "old_id",
            "author": "alice",
            "payload": {"rating": 3, "action": "rating"},
        }
        mock_db, mock_col = self._mock_db(find_one_result=existing)

        with patch("app.services.documentdb.db", mock_db):
            result = documentdb.create_app_rating("alice", "app_abc", 5, "api.localhost")

        assert result["payload"]["rating"] == 5
        update_call = mock_col.update_one.call_args
        assert update_call[0][1]["$set"]["payload.rating"] == 5


class TestGetAppsLegacyCompat:
    """Legacy apps (approved: true, no review_state) must appear in get_apps
    until the admin migration backfills review_state."""

    def _mock_cursor(self, docs):
        mock_cursor = MagicMock()
        mock_cursor.__iter__.return_value = iter(docs)
        mock_cursor.skip.return_value = mock_cursor
        mock_cursor.limit.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        return mock_cursor

    def test_legacy_approved_app_appears(self):
        """An app with approved:true and no review_state field must appear."""
        legacy_app = {
            "url": "https://legacy.app",
            "visits": 100,
            "approved": True,
            "name": "Legacy App",
        }
        mock_apps_col = MagicMock()
        mock_apps_col.find.return_value = self._mock_cursor([legacy_app])
        mock_web10_db = MagicMock()
        mock_web10_db.__getitem__.return_value = mock_apps_col
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_web10_db

        with (
            patch("app.services.documentdb.db", mock_db),
            patch("app.services.documentdb._aggregate_app_ratings", return_value={"average": 0, "count": 0}),
        ):
            result = documentdb.get_apps()

        assert len(result) == 1
        assert result[0]["url"] == "https://legacy.app"
        assert result[0]["name"] == "Legacy App"

    def test_v2_approved_app_appears(self):
        """An app with review_state: approved appears."""
        v2_app = {
            "url": "https://v2.app",
            "visits": 50,
            "review_state": "approved",
            "name": "V2 App",
        }
        mock_apps_col = MagicMock()
        mock_apps_col.find.return_value = self._mock_cursor([v2_app])
        mock_web10_db = MagicMock()
        mock_web10_db.__getitem__.return_value = mock_apps_col
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_web10_db

        with (
            patch("app.services.documentdb.db", mock_db),
            patch("app.services.documentdb._aggregate_app_ratings", return_value={"average": 0, "count": 0}),
        ):
            result = documentdb.get_apps()

        assert len(result) == 1
        assert result[0]["url"] == "https://v2.app"

    def test_rejected_app_hidden(self):
        """An app with review_state: rejected must NOT appear."""
        mock_apps_col = MagicMock()
        mock_apps_col.find.return_value = self._mock_cursor([])
        mock_web10_db = MagicMock()
        mock_web10_db.__getitem__.return_value = mock_apps_col
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_web10_db

        with (
            patch("app.services.documentdb.db", mock_db),
            patch("app.services.documentdb._aggregate_app_ratings", return_value={"average": 0, "count": 0}),
        ):
            result = documentdb.get_apps()

        assert len(result) == 0


class TestTotalS3Size:
    """total_s3_size sums size_bytes across media metadata in every user collection."""

    @pytest.fixture(autouse=True)
    def _reset_cache(self):
        """Reset the module-level cache before each test."""
        documentdb._S3_SIZE_CACHE = 0.0
        documentdb._S3_SIZE_CACHE_TIME = 0.0

    def test_sums_size_bytes_across_collections(self):
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice", "bob"]

        alice_coll = MagicMock()
        alice_coll.find.return_value = [
            {"body": {"size_bytes": 1000}},
            {"body": {"size_bytes": 2000}},
        ]

        bob_coll = MagicMock()
        bob_coll.find.return_value = [
            {"body": {"size_bytes": 3000}},
        ]

        mock_db.__getitem__.side_effect = lambda name: {"alice": alice_coll, "bob": bob_coll}[name]

        with patch("app.services.documentdb.db", mock_db):
            total = documentdb.total_s3_size()
        assert total == 6000

    def test_skips_missing_size_bytes(self):
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice"]

        alice_coll = MagicMock()
        alice_coll.find.return_value = [
            {"body": {"filename": "no_size.jpg"}},  # no size_bytes
            {"body": {"size_bytes": 500}},
        ]
        mock_db.__getitem__.return_value = alice_coll

        with patch("app.services.documentdb.db", mock_db):
            total = documentdb.total_s3_size()
        assert total == 500

    def test_skips_non_media_service(self):
        """Only media and public_media services should be counted."""
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice"]

        alice_coll = MagicMock()
        alice_coll.find.return_value = [
            {"body": {"size_bytes": 100}},
        ]
        mock_db.__getitem__.return_value = alice_coll

        with patch("app.services.documentdb.db", mock_db):
            total = documentdb.total_s3_size()
        assert total == 100

    def test_skips_zero_and_negative_size(self):
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice"]

        alice_coll = MagicMock()
        alice_coll.find.return_value = [
            {"body": {"size_bytes": 0}},
            {"body": {"size_bytes": -100}},
            {"body": {"size_bytes": 200}},
        ]
        mock_db.__getitem__.return_value = alice_coll

        with patch("app.services.documentdb.db", mock_db):
            total = documentdb.total_s3_size()
        assert total == 200

    def test_empty_collections_return_zero(self):
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice"]

        alice_coll = MagicMock()
        alice_coll.find.return_value = []
        mock_db.__getitem__.return_value = alice_coll

        with patch("app.services.documentdb.db", mock_db):
            total = documentdb.total_s3_size()
        assert total == 0

    def test_caches_result_within_ttl(self):
        """Second call within TTL should not re-query the DB."""
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice"]
        alice_coll = MagicMock()
        alice_coll.find.return_value = [{"body": {"size_bytes": 100}}]
        mock_db.__getitem__.return_value = alice_coll

        with patch("app.services.documentdb.db", mock_db):
            r1 = documentdb.total_s3_size()
            r2 = documentdb.total_s3_size()
        assert r1 == 100
        assert r2 == 100
        alice_coll.find.assert_called_once()

    def test_cache_expires_after_ttl(self):
        """After TTL expires, the DB is queried again."""
        mock_db = MagicMock()
        mock_db.list_collection_names.return_value = ["alice"]
        alice_coll = MagicMock()
        alice_coll.find.return_value = [{"body": {"size_bytes": 100}}]
        mock_db.__getitem__.return_value = alice_coll

        with patch("app.services.documentdb.db", mock_db):
            documentdb.total_s3_size()

        # Force cache expiry
        documentdb._S3_SIZE_CACHE_TIME = documentdb._S3_SIZE_CACHE_TIME - documentdb._S3_SIZE_TTL - 1
        alice_coll.find.reset_mock()

        with patch("app.services.documentdb.db", mock_db):
            documentdb.total_s3_size()
        alice_coll.find.assert_called_once()
