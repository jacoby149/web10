"""Tests for mongo CRUD operations, media helpers, and user/phone functions."""

from unittest.mock import MagicMock, patch

import pytest

from app.services import mongo
import app.exceptions as exceptions


class TestCreate:

    def test_create_returns_doc_with_id(self):
        mock_result = MagicMock()
        mock_result.inserted_id = "mock_oid"
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.insert_one.return_value = mock_result
            data = {"title": "hello"}
            result = mongo.create("alice", "posts", data)
            assert result["_id"] == "mock_oid"
            assert result["title"] == "hello"

    def test_create_star_raises(self):
        with pytest.raises(Exception):
            mongo.create("alice", "posts", {"service": "*", "x": 1})


class TestRead:

    def test_read_basic(self):
        mock_records = [
            {"_id": "a", "service": "posts", "body": {"title": "hi"}},
        ]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.skip.return_value.limit.return_value = mock_records
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find.return_value = mock_cursor
            results = mongo.read("alice", "posts", {})
            assert len(results) == 1
            assert results[0]["_id"] == "a"

    def test_read_services_no_charge(self):
        """Reading 'services' should work without errors."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.skip.return_value.limit.return_value = []
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find.return_value = mock_cursor
            results = mongo.read("alice", "services", {})
            assert results == []


class TestUpdate:

    def test_update_basic(self):
        mock_response = MagicMock()
        mock_response.matched_count = 1
        mock_response.modified_count = 1
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.update_one.return_value = mock_response
            with patch.object(mongo, "star_selected", return_value=False):
                result = mongo.update("alice", "posts", {"_id": "a"}, {"$set": {"title": "new"}})
                assert result["matchedCount"] == 1
                assert result["modifiedCount"] == 1

    def test_update_star_raises(self):
        with patch.object(mongo, "star_selected", return_value=True):
            with pytest.raises(Exception):
                mongo.update("alice", "services", {}, {"$set": {"title": "x"}})

    def test_update_dstar_raises(self):
        with patch.object(mongo, "star_selected", return_value=False):
            with patch.object(mongo.db, "__getitem__"):
                with pytest.raises(Exception):
                    mongo.update("alice", "posts", {}, {"$set": {"service": "*"}})


class TestDelete:

    def test_delete_basic(self):
        with patch.object(mongo.db, "__getitem__") as mock_col:
            with patch.object(mongo, "star_selected", return_value=False):
                result = mongo.delete("alice", "posts", {})
                assert result == "successfully deleted"

    def test_delete_star_raises(self):
        with patch.object(mongo, "star_selected", return_value=True):
            with pytest.raises(Exception):
                mongo.delete("alice", "services", {})


class TestCreateMediaRecord:

    def test_create_media_record(self):
        mock_result = MagicMock()
        mock_result.inserted_id = "media_oid"
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.insert_one.return_value = mock_result
            record = {"url": "https://s3/x.jpg", "filename": "x.jpg"}
            result = mongo.create_media_record("alice", record)
            assert result["_id"] == "media_oid"
            assert result["url"] == "https://s3/x.jpg"


class TestReadMediaRecords:

    def test_read_media_records(self):
        mock_records = [
            {"_id": "a", "service": "media", "body": {"url": "u1", "filename": "f1"}},
            {"_id": "b", "service": "media", "body": {"url": "u2", "filename": "f2"}},
        ]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_records
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find.return_value = mock_cursor
            results = mongo.read_media_records("alice")
            assert len(results) == 2
            assert results[0]["_id"] == "a"
            assert results[1]["_id"] == "b"

    def test_read_media_records_with_query(self):
        mock_records = [
            {"_id": "a", "service": "media", "body": {"url": "u1", "filename": "f1"}},
        ]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_records
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find.return_value = mock_cursor
            results = mongo.read_media_records("alice", {"filename": "f1"})
            assert len(results) == 1


class TestDeleteMediaRecords:

    def test_delete_media_records(self):
        mock_result = MagicMock()
        mock_result.deleted_count = 2
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.delete_many.return_value = mock_result
            count = mongo.delete_media_records("alice", {})
            assert count == 2

    def test_delete_media_by_id(self):
        mock_result = MagicMock()
        mock_result.deleted_count = 1
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.delete_many.return_value = mock_result
            count = mongo.delete_media_records("alice", {"_id": "abc123"})
            assert count == 1


class TestUserCollectionExists:

    def test_user_exists(self):
        with patch.object(mongo.db, "list_collection_names", return_value=["alice", "bob"]):
            assert mongo.user_collection_exists("alice") is True
            assert mongo.user_collection_exists("charlie") is False


class TestGetApproved:

    def test_owner_approved(self):
        with patch.object(mongo, "get_term_record", return_value={"service": "s", "whitelist": [], "blacklist": []}):
            assert mongo.get_approved("alice", "api.localhost", "alice", "posts", "read") is True

    def test_no_record(self):
        with patch.object(mongo, "get_term_record", return_value=None):
            assert mongo.get_approved("alice", "p", "bob", "s", "read") is False


class TestIsInCrossOrigins:

    def test_match(self):
        with patch.object(mongo, "get_term_record", return_value={"cross_origins": ["auth.localhost"]}):
            assert mongo.is_in_cross_origins("auth.localhost", "alice", "posts") is True

    def test_no_match(self):
        with patch.object(mongo, "get_term_record", return_value={"cross_origins": ["auth.localhost"]}):
            assert mongo.is_in_cross_origins("evil.com", "alice", "posts") is False

    def test_no_record(self):
        with patch.object(mongo, "get_term_record", return_value=None):
            assert mongo.is_in_cross_origins("anything", "alice", "posts") is False


class TestGetStar:

    def test_get_star(self):
        mock_doc = {"_id": "a", "service": "*", "body": {"username": "alice"}}
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find_one.return_value = mock_doc
            result = mongo.get_star("alice")
            assert result["username"] == "alice"


class TestGetTermRecord:

    def test_get_term_record(self):
        mock_doc = {"_id": "a", "service": "posts", "body": {"whitelist": []}}
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find_one.return_value = mock_doc
            result = mongo.get_term_record("alice", "posts")
            assert result["whitelist"] == []

    def test_get_term_record_none(self):
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find_one.return_value = None
            result = mongo.get_term_record("alice", "posts")
            assert result is None


class TestToDbField:

    def test_regular_field(self):
        assert mongo.to_db_field("name") == "body.name"

    def test_id_passthrough(self):
        assert mongo.to_db_field("_id") == "_id"


class TestQTransform:

    def test_basic(self):
        q = mongo.q_t({"title": "hi"}, "posts")
        assert q == {"service": "posts", "body.title": "hi"}

    def test_dollar_fields_stripped(self):
        q = mongo.q_t({"$skip": 0, "title": "hi"}, "posts")
        assert "$skip" not in q
        assert "body.$skip" not in q


class TestUTransform:

    def test_basic_set(self):
        u = mongo.u_t({"$set": {"title": "new"}})
        assert u == {"$set": {"body.title": "new"}}


class TestSortTransform:

    def test_basic(self):
        assert mongo.sort_t({"a": 1}) == [("a", 1)]


class TestGetPull:

    def test_array_index_pull(self):
        u = {"$unset": {"tags.0": 1}}
        pull = mongo.get_pull(u)
        assert pull == {"$pull": {"tags": None}}


class TestStarFound:

    def test_star_present(self):
        assert mongo.star_found([{"service": "*"}]) is True

    def test_star_absent(self):
        assert mongo.star_found([{"service": "posts"}]) is False


class TestStarSelected:

    def test_services_star_selected(self):
        mock_records = [{"_id": "a", "service": "services", "body": {"service": "*"}}]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.skip.return_value.limit.return_value = mock_records
        with patch.object(mongo.db, "__getitem__") as mock_col:
            mock_col.return_value.find.return_value = mock_cursor
            assert mongo.star_selected("alice", "services", {}) is True

    def test_non_services_returns_false(self):
        assert mongo.star_selected("alice", "posts", {}) is False