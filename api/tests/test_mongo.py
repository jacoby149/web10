"""Tests for the pure transformation & query-safety functions in mongo.py.

These functions form the security boundary between user input and MongoDB.
"""

from unittest.mock import patch

import pytest

import app.mongo as mongo
import app.exceptions as exceptions


# ---------------------------------------------------------------------------
# to_gui / to_db  –  doc transformation
# ---------------------------------------------------------------------------

class TestToGui:

    def test_extract_body_and_id(self):
        doc = {"_id": "abc123", "service": "posts", "body": {"title": "hello", "count": 1}}
        result = mongo.to_gui(doc)
        assert result == {"_id": "abc123", "title": "hello", "count": 1}

    def test_empty_body(self):
        doc = {"_id": "x", "service": "s", "body": {}}
        result = mongo.to_gui(doc)
        assert result == {"_id": "x"}

    def test_nested_body(self):
        doc = {"_id": "1", "service": "s", "body": {"a": {"b": 2}}}
        result = mongo.to_gui(doc)
        assert result == {"_id": "1", "a": {"b": 2}}


class TestToDb:

    def test_basic_wrap(self):
        result = mongo.to_db({"title": "hi"}, "posts")
        assert result == {"service": "posts", "body": {"title": "hi"}}

    def test_preserves_id(self):
        result = mongo.to_db({"_id": "oid", "name": "x"}, "svc")
        assert result["_id"] == "oid"
        assert result["body"] == {"name": "x"}
        assert "_id" not in result["body"]

    def test_no_id(self):
        result = mongo.to_db({"k": "v"}, "svc")
        assert "_id" not in result
        assert result == {"service": "svc", "body": {"k": "v"}}


class TestToDbField:

    def test_id_passthrough(self):
        assert mongo.to_db_field("_id") == "_id"

    def test_regular_field(self):
        assert mongo.to_db_field("name") == "body.name"

    def test_nested_field(self):
        assert mongo.to_db_field("meta.tags") == "body.meta.tags"


# ---------------------------------------------------------------------------
# q_t  –  query transformation (security boundary)
# ---------------------------------------------------------------------------

class TestQTransform:

    def test_basic_query(self):
        q = mongo.q_t({"title": "hello"}, "posts")
        assert q == {"service": "posts", "body.title": "hello"}

    def test_multiple_fields(self):
        q = mongo.q_t({"title": "hi", "count": 5}, "posts")
        assert q == {"service": "posts", "body.title": "hi", "body.count": 5}

    def test_dollar_fields_stripped(self):
        """Fields starting with $ must be stripped – they are MongoDB operators."""
        q = mongo.q_t({"$operator": "bad", "safe": "ok"}, "posts")
        assert "$operator" not in q
        assert "body.$operator" not in q
        assert q == {"service": "posts", "body.safe": "ok"}

    def test_empty_query(self):
        q = mongo.q_t({}, "posts")
        assert q == {"service": "posts"}

    def test_service_always_set(self):
        q = mongo.q_t({"a": 1}, "myService")
        assert q["service"] == "myService"


# ---------------------------------------------------------------------------
# u_t  –  update transformation (security boundary)
# ---------------------------------------------------------------------------

class TestUTransform:

    def test_basic_set(self):
        u = mongo.u_t({"$set": {"title": "new"}})
        assert u == {"$set": {"body.title": "new"}}

    def test_multiple_ops(self):
        u = mongo.u_t({"$set": {"a": 1}, "$inc": {"b": 2}})
        assert u == {"$set": {"body.a": 1}, "$inc": {"body.b": 2}}

    def test_id_passthrough(self):
        u = mongo.u_t({"$set": {"_id": "x"}})
        assert u == {"$set": {"_id": "x"}}

    def test_fancy_update_rejected(self):
        """u_t rejects when a $-prefixed field follows another $ field in the same op."""
        with pytest.raises(Exception):
            mongo.u_t({"$set": {"$first": 1, "$second": 2}})

    def test_single_dollar_field_allowed(self):
        """A single $-prefixed field doesn't trigger the guard (first field check passes)."""
        result = mongo.u_t({"$set": {"$only": 1}})
        assert result == {"$set": {"body.$only": 1}}


# ---------------------------------------------------------------------------
# sort_t
# ---------------------------------------------------------------------------

class TestSortTransform:

    def test_basic(self):
        assert mongo.sort_t({"visits": -1}) == [("visits", -1)]

    def test_multiple(self):
        result = mongo.sort_t({"a": 1, "b": -1})
        assert len(result) == 2


# ---------------------------------------------------------------------------
# get_pull
# ---------------------------------------------------------------------------

class TestGetPull:

    def test_array_index_pull(self):
        u = {"$unset": {"tags.0": 1}}
        pull = mongo.get_pull(u)
        assert pull == {"$pull": {"tags": None}}

    def test_no_unset_raises(self):
        with pytest.raises(Exception):
            mongo.get_pull({"$set": {"a": 1}})

    def test_non_index_ignored(self):
        u = {"$unset": {"plain": 1}}
        pull = mongo.get_pull(u)
        # "plain" doesn't end with a digit, so nothing gets pulled
        assert pull == {"$pull": {}}


# ---------------------------------------------------------------------------
# star_found
# ---------------------------------------------------------------------------

class TestStarFound:

    def test_star_present(self):
        assert mongo.star_found([{"service": "*", "username": "x"}]) is True

    def test_star_absent(self):
        assert mongo.star_found([{"service": "posts", "title": "hi"}]) is False

    def test_empty_list(self):
        assert mongo.star_found([]) is False

    def test_multiple_no_star(self):
        assert mongo.star_found([
            {"service": "a"},
            {"service": "b"},
        ]) is False

    def test_one_star_among_many(self):
        assert mongo.star_found([
            {"service": "a"},
            {"service": "*"},
            {"service": "b"},
        ]) is True


# ---------------------------------------------------------------------------
# get_approved  –  whitelist / blacklist ACL logic
# ---------------------------------------------------------------------------

class TestGetApproved:

    def test_owner_always_approved(self, mock_db_with_term):
        """The account owner with the local provider is always approved."""
        assert mongo.get_approved("testuser", "api.localhost", "testuser", "myapi", "read") is True

    def test_no_record_returns_false(self, mock_db_term_none):
        assert mongo.get_approved("u", "p", "owner", "svc", "read") is False

    def test_whitelist_exact_match(self, mock_db_with_term):
        assert mongo.get_approved("testuser", "api.localhost", "owner", "myapi", "read") is True

    def test_whitelist_regex_match(self, mock_db_with_term):
        """wildcard .* in whitelist should match any username."""
        assert mongo.get_approved("randomuser", "any.provider", "owner", "myapi", "read") is True

    def test_blacklist_blocks(self, mock_db_with_term):
        """banneduser is on the blacklist for read."""
        assert mongo.get_approved("banneduser", "api.localhost", "owner", "myapi", "read") is False

    def test_blacklist_regex(self, mock_db_with_term):
        """Blacklist entry uses exact match; non-matching user passes."""
        assert mongo.get_approved("otheruser", "api.localhost", "owner", "myapi", "read") is True

    def test_permission_not_granted(self, mock_db_with_term):
        """testuser has read+create but NOT delete."""
        # The wildcard .* entry only grants read, so delete should fail
        assert mongo.get_approved("testuser", "api.localhost", "owner", "myapi", "delete") is False

    def test_all_permission(self):
        """An 'all' key grants every action."""
        with patch(
            "app.mongo.get_term_record",
            return_value={
                "service": "svc",
                "whitelist": [{"username": "u", "provider": "p", "all": True}],
                "blacklist": [],
            },
        ):
            assert mongo.get_approved("u", "p", "owner", "svc", "anything") is True

    def test_blacklist_overrides_whitelist(self):
        """Being on both lists means blacklist wins."""
        with patch(
            "app.mongo.get_term_record",
            return_value={
                "service": "svc",
                "whitelist": [{"username": "u", "provider": "p", "read": True}],
                "blacklist": [{"username": "u", "provider": "p", "read": True}],
            },
        ):
            assert mongo.get_approved("u", "p", "owner", "svc", "read") is False

    def test_no_whitelist_field(self):
        """Missing whitelist key means not on whitelist."""
        with patch(
            "app.mongo.get_term_record",
            return_value={"service": "svc", "blacklist": []},
        ):
            assert mongo.get_approved("u", "p", "owner", "svc", "read") is False

    def test_no_blacklist_field(self):
        """Missing blacklist key means not on blacklist."""
        with patch(
            "app.mongo.get_term_record",
            return_value={
                "service": "svc",
                "whitelist": [{"username": "u", "provider": "p", "read": True}],
            },
        ):
            assert mongo.get_approved("u", "p", "owner", "svc", "read") is True


# ---------------------------------------------------------------------------
# is_in_cross_origins
# ---------------------------------------------------------------------------

class TestIsInCrossOrigins:

    def test_exact_match(self, mock_db_with_term):
        assert mongo.is_in_cross_origins("auth.localhost", "owner", "myapi") is True

    def test_regex_match(self, mock_db_with_term):
        assert mongo.is_in_cross_origins("myapp.example.com", "owner", "myapi") is True

    def test_no_match(self, mock_db_with_term):
        assert mongo.is_in_cross_origins("evil.com", "owner", "myapi") is False

    def test_no_record(self, mock_db_term_none):
        assert mongo.is_in_cross_origins("anything", "owner", "svc") is False
