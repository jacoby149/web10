"""Tests for the pure transformation & query-safety functions in services/documentdb.py."""

from unittest.mock import patch

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

    def test_id_passthrough(self):
        u = documentdb.u_t({"$set": {"_id": "x"}})
        assert u == {"$set": {"_id": "x"}}

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
