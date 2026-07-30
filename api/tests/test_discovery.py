"""Discovery API test suite — schema registry, public ledger, discovery endpoints.

Covers the permission matrix:
- Discovery endpoints: anon can read (no token or anon token)
- Schema registry: anon can fetch, auth can register, author-only update/delete
- Public ledger: anon can query, auth can create, author-only update/delete
"""

import json as _json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services import documentdb as db_module

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _token(payload: dict) -> str:
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _future(minutes: int = 60) -> str:
    return (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()


def _owner_token(username: str = "alice") -> str:
    return _token(
        {
            "username": username,
            "site": "auth.localhost",
            "target": settings.PROVIDER,
            "provider": settings.PROVIDER,
            "expires": _future(),
        }
    )


@pytest.fixture
def client():
    return TestClient(fastapi_app, raise_server_exceptions=False)


@pytest.fixture
def mock_discovery_col():
    """Mock the discovery_posts collection."""
    mock_col = MagicMock()
    mock_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    mock_col.find_one.return_value = None
    mock_col.aggregate.return_value = []
    mock_col.create_index.return_value = "idx"
    with (
        patch.object(db_module.db["web10"], "list_collection_names", return_value=["discovery_posts"]),
        patch.object(db_module.db["web10"], "__getitem__") as mock_getitem,
    ):
        mock_getitem.return_value = mock_col
        yield mock_col


@pytest.fixture
def mock_schemas_col():
    """Mock the schemas collection."""
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    mock_col.find_one_and_update.return_value = None
    mock_col.delete_one.return_value = MagicMock(deleted_count=0)
    with (
        patch.object(db_module.db["web10"], "list_collection_names", return_value=["schemas"]),
        patch.object(db_module.db["web10"], "__getitem__") as mock_getitem,
    ):
        mock_getitem.return_value = mock_col
        yield mock_col


@pytest.fixture
def mock_public_col():
    """Mock the public ledger collection."""
    mock_col = MagicMock()
    mock_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    mock_col.find_one.return_value = None
    mock_col.find_one_and_update.return_value = None
    mock_col.delete_one.return_value = MagicMock(deleted_count=0)
    mock_col.aggregate.return_value = []
    with (
        patch.object(db_module.db["web10"], "list_collection_names", return_value=["public"]),
        patch.object(db_module.db["web10"], "__getitem__") as mock_getitem,
    ):
        mock_getitem.return_value = mock_col
        yield mock_col


@pytest.fixture
def mock_discovery_and_public():
    """Mock both discovery_posts and public collections simultaneously."""
    mock_discovery = MagicMock()
    mock_discovery.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    mock_discovery.find_one.return_value = None
    mock_discovery.aggregate.return_value = []
    mock_discovery.create_index.return_value = "idx"

    mock_public = MagicMock()
    mock_public.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    mock_public.find_one.return_value = None
    mock_public.aggregate.return_value = []
    mock_public.create_index.return_value = "idx"

    def _getitem(key):
        if key == "discovery_posts":
            return mock_discovery
        if key == "public":
            return mock_public
        return MagicMock()

    with (
        patch.object(
            db_module.db["web10"],
            "list_collection_names",
            return_value=["discovery_posts", "public"],
        ),
        patch.object(db_module.db["web10"], "__getitem__", side_effect=_getitem),
    ):
        yield mock_discovery, mock_public


# ---------------------------------------------------------------------------
# SCHEMA REGISTRY
# ---------------------------------------------------------------------------


class TestSchemaRegister:
    def test_register_success(self, client, mock_schemas_col):
        mock_schemas_col.insert_one.return_value = MagicMock(inserted_id="test-id")
        resp = client.post(
            "/schemas/register",
            json={
                "token": _owner_token("alice"),
                "query": {
                    "name": "Reaction",
                    "schema": {"type": "object", "required": ["action"], "properties": {"action": {"type": "string"}}},
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["author"] == "alice"
        assert data["name"] == "Reaction"

    def test_register_no_token(self, client, mock_schemas_col):
        resp = client.post(
            "/schemas/register",
            json={"query": {"name": "Test", "schema": {}}},
        )
        assert resp.status_code == 401

    def test_register_missing_fields(self, client, mock_schemas_col):
        resp = client.post(
            "/schemas/register",
            json={"token": _owner_token("alice"), "query": {"name": "Test"}},
        )
        assert resp.status_code == 400


class TestSchemaFetch:
    def test_fetch_success(self, client, mock_schemas_col):
        mock_schemas_col.find_one.return_value = {
            "_id": "api.localhost.uuid6:123",
            "author": "alice",
            "name": "Reaction",
            "schema": {"type": "object"},
        }
        resp = client.patch(
            "/schemas/api.localhost.uuid6:123",
            json={"token": None},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Reaction"

    def test_fetch_not_found(self, client, mock_schemas_col):
        mock_schemas_col.find_one.return_value = None
        resp = client.patch(
            "/schemas/nonexistent",
            json={"token": None},
        )
        assert resp.status_code == 404

    def test_fetch_anon_ok(self, client, mock_schemas_col):
        mock_schemas_col.find_one.return_value = {
            "_id": "api.localhost.uuid6:123",
            "author": "alice",
            "name": "Reaction",
            "schema": {},
        }
        resp = client.patch(
            "/schemas/api.localhost.uuid6:123",
            json={},
        )
        assert resp.status_code == 200


class TestSchemaUpdate:
    def test_update_success(self, client, mock_schemas_col):
        mock_schemas_col.find_one_and_update.return_value = {
            "_id": "api.localhost.uuid6:123",
            "author": "alice",
            "name": "Reaction v2",
        }
        resp = client.put(
            "/schemas/api.localhost.uuid6:123",
            json={"token": _owner_token("alice"), "update": {"name": "Reaction v2"}},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Reaction v2"

    def test_update_not_author(self, client, mock_schemas_col):
        mock_schemas_col.find_one_and_update.return_value = None
        resp = client.put(
            "/schemas/api.localhost.uuid6:123",
            json={"token": _owner_token("bob"), "update": {"name": "Hacked"}},
        )
        assert resp.status_code == 403

    def test_update_no_token(self, client, mock_schemas_col):
        resp = client.put(
            "/schemas/api.localhost.uuid6:123",
            json={"update": {"name": "Test"}},
        )
        assert resp.status_code == 401


class TestSchemaDelete:
    def test_delete_success(self, client, mock_schemas_col):
        mock_schemas_col.delete_one.return_value = MagicMock(deleted_count=1)
        resp = client.request(
            "DELETE",
            "/schemas/api.localhost.uuid6:123",
            content=_json.dumps({"token": _owner_token("alice")}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    def test_delete_not_author(self, client, mock_schemas_col):
        mock_schemas_col.delete_one.return_value = MagicMock(deleted_count=0)
        resp = client.request(
            "DELETE",
            "/schemas/api.localhost.uuid6:123",
            content=_json.dumps({"token": _owner_token("bob")}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 403

    def test_delete_no_token(self, client, mock_schemas_col):
        resp = client.request(
            "DELETE",
            "/schemas/api.localhost.uuid6:123",
            content=_json.dumps({}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PUBLIC LEDGER
# ---------------------------------------------------------------------------


class TestPublicCreateEntry:
    def test_create_success(self, client, mock_public_col, mock_schemas_col):
        mock_schemas_col.find_one.return_value = {
            "_id": "api.localhost.uuid6:schema1",
            "schema": {"type": "object", "required": ["action"], "properties": {"action": {"type": "string"}}},
        }
        mock_public_col.insert_one.return_value = MagicMock(inserted_id="entry-id")
        resp = client.post(
            "/public/entries",
            json={
                "token": _owner_token("bob"),
                "query": {
                    "schema_id": "api.localhost.uuid6:schema1",
                    "target": "alice/posts/123",
                    "payload": {"action": "like"},
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["author"] == "bob"
        assert data["schema_id"] == "api.localhost.uuid6:schema1"

    def test_create_no_token(self, client, mock_public_col, mock_schemas_col):
        mock_schemas_col.find_one.return_value = {"_id": "x", "schema": {}}
        resp = client.post(
            "/public/entries",
            json={"query": {"schema_id": "x", "payload": {}}},
        )
        assert resp.status_code == 401

    def test_create_schema_not_found(self, client, mock_public_col, mock_schemas_col):
        mock_schemas_col.find_one.return_value = None
        resp = client.post(
            "/public/entries",
            json={
                "token": _owner_token("bob"),
                "query": {"schema_id": "nonexistent", "payload": {}},
            },
        )
        assert resp.status_code == 404

    def test_create_validates_required_fields(self, client, mock_public_col, mock_schemas_col):
        mock_schemas_col.find_one.return_value = {
            "_id": "api.localhost.uuid6:schema1",
            "schema": {"type": "object", "required": ["action"], "properties": {"action": {"type": "string"}}},
        }
        resp = client.post(
            "/public/entries",
            json={
                "token": _owner_token("bob"),
                "query": {
                    "schema_id": "api.localhost.uuid6:schema1",
                    "payload": {},
                },
            },
        )
        assert resp.status_code == 400

    def test_create_missing_schema_id(self, client, mock_public_col, mock_schemas_col):
        resp = client.post(
            "/public/entries",
            json={
                "token": _owner_token("bob"),
                "query": {"payload": {"action": "like"}},
            },
        )
        assert resp.status_code == 400


class TestPublicQueryEntries:
    def test_query_anon_ok(self, client, mock_public_col):
        mock_public_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = [
            {"_id": "e1", "author": "bob", "schema_id": "s1", "payload": {"action": "like"}},
        ]
        resp = client.patch("/public/entries")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_query_filter_by_schema_id(self, client, mock_public_col):
        mock_public_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch("/public/entries?schema_id=api.localhost.uuid6:reactions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_query_filter_by_target(self, client, mock_public_col):
        mock_public_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch("/public/entries?target=alice/posts/123")
        assert resp.status_code == 200


class TestPublicUpdateEntry:
    def test_update_success(self, client, mock_public_col):
        mock_public_col.find_one_and_update.return_value = {
            "_id": "e1",
            "author": "bob",
            "payload": {"action": "like", "updated": True},
        }
        resp = client.put(
            "/public/entries/e1",
            json={"token": _owner_token("bob"), "update": {"payload": {"action": "like", "updated": True}}},
        )
        assert resp.status_code == 200

    def test_update_not_author(self, client, mock_public_col):
        mock_public_col.find_one_and_update.return_value = None
        resp = client.put(
            "/public/entries/e1",
            json={"token": _owner_token("alice"), "update": {"payload": {}}},
        )
        assert resp.status_code == 403

    def test_update_no_token(self, client, mock_public_col):
        resp = client.put(
            "/public/entries/e1",
            json={"update": {"payload": {}}},
        )
        assert resp.status_code == 401


class TestPublicDeleteEntry:
    def test_delete_success(self, client, mock_public_col):
        mock_public_col.delete_one.return_value = MagicMock(deleted_count=1)
        resp = client.request(
            "DELETE",
            "/public/entries/e1",
            content=_json.dumps({"token": _owner_token("bob")}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    def test_delete_not_author(self, client, mock_public_col):
        mock_public_col.delete_one.return_value = MagicMock(deleted_count=0)
        resp = client.request(
            "DELETE",
            "/public/entries/e1",
            content=_json.dumps({"token": _owner_token("alice")}),
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DISCOVERY ENDPOINTS
# ---------------------------------------------------------------------------


class TestDiscoverPosts:
    def test_posts_recent(self, client, mock_discovery_col, mock_public_col):
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/discover/posts",
            json={"token": None},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_posts_trending(self, client, mock_discovery_col, mock_public_col):
        mock_discovery_col.find.return_value.limit.return_value = []
        resp = client.patch(
            "/discover/posts",
            json={"token": None, "query": {"sort": "trending"}},
        )
        assert resp.status_code == 200

    def test_posts_anon_ok(self, client, mock_discovery_col, mock_public_col):
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/discover/posts",
            json={},
        )
        assert resp.status_code == 200

    def test_posts_with_limit(self, client, mock_discovery_col, mock_public_col):
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/discover/posts",
            json={"token": None, "query": {"limit": 10}},
        )
        assert resp.status_code == 200

    def test_posts_bodyless_patch(self, client, mock_discovery_col, mock_public_col):
        """Regression (feed empty): the social feed sends a bodyless PATCH with
        query in the URL. The endpoint must not require a JSON body — it used
        to 422 'body required', which feed.ts swallowed into an empty feed."""
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch("/discover/posts?sort=recent&limit=20")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_posts_url_params_trending(self, client, mock_discovery_col, mock_public_col):
        """URL query params are honored (sort=trending via the URL, no body)."""
        mock_discovery_col.find.return_value.limit.return_value = []
        resp = client.patch("/discover/posts?sort=trending&limit=5")
        assert resp.status_code == 200


class TestDiscoverUsers:
    def test_suggested_users(self, client, mock_discovery_and_public):
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find.return_value = []
        resp = client.patch(
            "/discover/users",
            json={"token": None},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_suggested_users_anon_ok(self, client, mock_discovery_and_public):
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find.return_value = []
        resp = client.patch(
            "/discover/users",
            json={},
        )
        assert resp.status_code == 200

    def test_suggested_users_bodyless(self, client, mock_discovery_and_public):
        """Regression: bodyless PATCH with URL param must not 422."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find.return_value = []
        resp = client.patch("/discover/users?limit=5")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_suggested_users_returns_followers_count(self, client, mock_discovery_and_public):
        """A14: /discover/users must return followers_count per user."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find.return_value = [
            {
                "author": "alice",
                "service": "public_posts",
                "post_id": "p1",
                "body_text": "Hello",
                "tags": [],
                "created_at": "2026-01-01T00:00:00",
            },
            {
                "author": "bob",
                "service": "public_posts",
                "post_id": "p2",
                "body_text": "World",
                "tags": [],
                "created_at": "2026-01-02T00:00:00",
            },
        ]
        mock_public.aggregate.return_value = []  # no engagement
        # Patch _count_followers to return different values per author
        with patch.object(db_module, "_count_followers", side_effect=lambda u: {"alice": 2, "bob": 0}.get(u, 0)):
            resp = client.patch(
                "/discover/users",
                json={"token": None},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        alice_entry = [u for u in data if u["username"] == "alice"][0]
        bob_entry = [u for u in data if u["username"] == "bob"][0]
        assert "followers_count" in alice_entry
        assert "followers_count" in bob_entry
        assert alice_entry["followers_count"] == 2
        assert bob_entry["followers_count"] == 0

    def test_suggested_users_followers_count_zero_when_no_follows(self, client, mock_discovery_and_public):
        """A14: followers_count is 0 when no follow entries exist."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find.return_value = [
            {
                "author": "charlie",
                "service": "public_posts",
                "post_id": "p3",
                "body_text": "Test",
                "tags": [],
                "created_at": "2026-01-03T00:00:00",
            },
        ]
        mock_public.aggregate.return_value = []
        with patch.object(db_module, "_count_followers", return_value=0):
            resp = client.patch(
                "/discover/users",
                json={"token": None},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["username"] == "charlie"
        assert data[0]["followers_count"] == 0

    def test_suggested_users_followers_count_matches_ledger(self, client, mock_discovery_and_public):
        """A14: followers_count matches the ledger for seeded personas."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find.return_value = [
            {
                "author": "solar-flare-69",
                "service": "public_posts",
                "post_id": "p1",
                "body_text": "Post",
                "tags": [],
                "created_at": "2026-01-01T00:00:00",
            },
        ]
        mock_public.aggregate.return_value = []
        with patch.object(db_module, "_count_followers", return_value=3):
            resp = client.patch(
                "/discover/users",
                json={"token": None},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["username"] == "solar-flare-69"
        assert data[0]["followers_count"] == 3

    def test_count_followers_queries_correct_target(self):
        """A14: _count_followers queries the ledger with the correct target key."""
        mock_col = MagicMock()
        mock_col.aggregate.return_value = [{"followers": 5}]
        with (
            patch.object(db_module.db["web10"], "__getitem__", return_value=mock_col),
            patch.object(db_module.db, "list_collection_names", return_value=["web10.public"]),
        ):
            result = db_module._count_followers("alice")
        assert result == 5
        call_args = mock_col.aggregate.call_args[0][0]
        match_stage = call_args[0]
        assert match_stage["$match"]["target"] == "follow:alice@api.localhost"
        assert match_stage["$match"]["payload.action"] == "follow"

    def test_count_followers_returns_zero_when_empty(self):
        """A14: _count_followers returns 0 when no follow entries match."""
        mock_col = MagicMock()
        mock_col.aggregate.return_value = []
        with (
            patch.object(db_module.db["web10"], "__getitem__", return_value=mock_col),
            patch.object(db_module.db, "list_collection_names", return_value=["web10.public"]),
        ):
            result = db_module._count_followers("nobody")
        assert result == 0


class TestDiscoverSearch:
    def test_search_with_query(self, client, mock_discovery_col):
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {"q": "hello world"}},
        )
        assert resp.status_code == 200

    def test_search_no_query(self, client, mock_discovery_col):
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {}},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_anon_ok(self, client, mock_discovery_col):
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/discover/search",
            json={"query": {"q": "test"}},
        )
        assert resp.status_code == 200

    def test_search_url_param(self, client, mock_discovery_col):
        """Regression: bodyless PATCH with q in the URL must not 422."""
        mock_discovery_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch("/discover/search?q=hello")
        assert resp.status_code == 200

    def test_search_substring_body_match(self, client, mock_discovery_col):
        """Hard acceptance: searching 'yo' returns the 'yoyoyo' posts."""
        doc = {
            "_id": "post1",
            "author": "alice",
            "service": "public_posts",
            "post_id": "1",
            "body_text": "yoyoyo this is a test post",
            "tags": [],
            "created_at": "2026-07-29T00:00:00",
        }
        # Build chainable find mocks: find() → sort() → iterable
        mock_find_text = MagicMock()
        mock_find_text.sort.return_value = iter([])  # $text: no match
        mock_find_regex = MagicMock()
        mock_find_regex.sort.return_value = iter([doc])  # regex: matches
        mock_discovery_col.find.side_effect = [mock_find_text, mock_find_regex]
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {"q": "yo"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["body_text"] == "yoyoyo this is a test post"

    def test_search_author_handle_match(self, client, mock_discovery_col):
        """Searching an author handle returns their posts."""
        doc = {
            "_id": "post2",
            "author": "coolguydavid",
            "service": "public_posts",
            "post_id": "2",
            "body_text": "check out my new setup",
            "tags": ["#tech"],
            "created_at": "2026-07-28T00:00:00",
        }
        mock_find_text = MagicMock()
        mock_find_text.sort.return_value = iter([])
        mock_find_regex = MagicMock()
        mock_find_regex.sort.return_value = iter([doc])
        mock_discovery_col.find.side_effect = [mock_find_text, mock_find_regex]
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {"q": "coolguy"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["author"] == "coolguydavid"

    def test_search_dedup_text_and_regex(self, client, mock_discovery_col):
        """A doc matched by both $text and regex appears only once."""
        doc = {
            "_id": "post3",
            "author": "alice",
            "service": "public_posts",
            "post_id": "3",
            "body_text": "hello world testing",
            "tags": ["#hello"],
            "created_at": "2026-07-29T00:00:00",
        }
        mock_find_text = MagicMock()
        mock_find_text.sort.return_value = iter([doc])
        mock_find_regex = MagicMock()
        mock_find_regex.sort.return_value = iter([doc])
        mock_discovery_col.find.side_effect = [mock_find_text, mock_find_regex]
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {"q": "hello"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1  # deduplicated

    def test_search_long_query_skips_regex(self, client, mock_discovery_col):
        """Queries with more than 2 words skip the regex fallback."""
        mock_find_text = MagicMock()
        mock_find_text.sort.return_value = iter([])
        mock_discovery_col.find.side_effect = [mock_find_text]
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {"q": "one two three four"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data == []
        # find() called exactly once ($text only, no regex fallback)
        assert mock_discovery_col.find.call_count == 1

    def test_search_regex_special_chars_escaped(self, client, mock_discovery_col):
        """User input with regex metachars is escaped, not interpreted."""
        doc = {
            "_id": "post4",
            "author": "alice",
            "service": "public_posts",
            "post_id": "4",
            "body_text": "price is $10.00",
            "tags": [],
            "created_at": "2026-07-29T00:00:00",
        }
        mock_find_text = MagicMock()
        mock_find_text.sort.return_value = iter([])
        mock_find_regex = MagicMock()
        mock_find_regex.sort.return_value = iter([doc])
        mock_discovery_col.find.side_effect = [mock_find_text, mock_find_regex]
        resp = client.patch(
            "/discover/search",
            json={"token": None, "query": {"q": "$10"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1


class TestDiscoverTopics:
    def test_trending_topics(self, client, mock_discovery_col):
        mock_discovery_col.aggregate.return_value = [
            {"_id": "#web10", "count": 42},
            {"_id": "#social", "count": 10},
        ]
        resp = client.patch(
            "/discover/topics",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["topic"] == "#web10"
        assert data[0]["count"] == 42

    def test_trending_topics_anon_ok(self, client, mock_discovery_col):
        mock_discovery_col.aggregate.return_value = []
        resp = client.patch(
            "/discover/topics",
            json={},
        )
        assert resp.status_code == 200

    def test_trending_topics_bodyless(self, client, mock_discovery_col):
        """Regression: bodyless PATCH must not 422."""
        mock_discovery_col.aggregate.return_value = []
        resp = client.patch("/discover/topics")
        assert resp.status_code == 200


class TestDiscoverPost:
    def test_lookup_found(self, client, mock_discovery_and_public):
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "posts",
            "post_id": "123",
            "body_text": "Hello world",
            "tags": ["#test"],
            "created_at": "2026-01-01T00:00:00",
        }
        mock_public.aggregate.return_value = []
        resp = client.patch(
            "/discover/post/alice/posts/123",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["author"] == "alice"
        assert data["body_text"] == "Hello world"

    def test_lookup_not_found(self, client, mock_discovery_col):
        mock_discovery_col.find_one.return_value = None
        resp = client.patch(
            "/discover/post/alice/posts/nonexistent",
            json={"token": None},
        )
        assert resp.status_code == 404

    def test_lookup_anon_ok(self, client, mock_discovery_and_public):
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "posts",
            "post_id": "123",
            "body_text": "Hello",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        mock_public.aggregate.return_value = []
        resp = client.patch(
            "/discover/post/alice/posts/123",
            json={},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# ENGAGEMENT DERIVED FROM LEDGER
# ---------------------------------------------------------------------------


class TestEngagementFromLedger:
    def test_engagement_counts_derived(self, client, mock_discovery_and_public):
        """Verify that engagement counts come from the ledger, not cached."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "123",
            "body_text": "Hello",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        mock_public.aggregate.return_value = [
            {"_id": "like", "count": 5},
            {"_id": "comment", "count": 2},
        ]
        resp = client.patch(
            "/discover/post/alice/public_posts/123",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement"]["likes"] == 5
        assert data["engagement"]["comments"] == 2
        assert data["engagement"]["reposts"] == 0
        assert data["engagement_score"] == 11  # 5*1 + 2*3 + 0*5

    def test_engagement_score_formula(self, client, mock_discovery_and_public):
        """likes*1 + comments*3 + reposts*5."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "456",
            "body_text": "Test",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        mock_public.aggregate.return_value = [
            {"_id": "like", "count": 10},
            {"_id": "comment", "count": 5},
            {"_id": "repost", "count": 2},
        ]
        resp = client.patch(
            "/discover/post/alice/public_posts/456",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement_score"] == 35  # 10*1 + 5*3 + 2*5

    def test_engagement_target_is_canonical_post_key(self, client, mock_discovery_and_public):
        """The canonical ledger target is ``{author}/{service}/{post_id}``.

        The aggregation must $match the raw post_key directly — no conversion.
        An entry written with target ``alice/public_posts/123`` counts toward
        post alice/public_posts/123.
        """
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "123",
            "body_text": "Hello",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        mock_public.aggregate.return_value = [
            {"_id": "comment", "count": 3},
        ]
        resp = client.patch(
            "/discover/post/alice/public_posts/123",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement"]["comments"] == 3
        # Verify the aggregate was called with the canonical target, NOT a conversion
        call_args = mock_public.aggregate.call_args
        pipeline = call_args[0][0]
        assert pipeline[0] == {"$match": {"target": "alice/public_posts/123"}}

    def test_engagement_legacy_posts_format_not_matched(self, client, mock_discovery_and_public):
        """A ledger entry with the legacy ``posts:123`` target is NOT matched.

        The social client historically wrote ``posts:{post_id}`` (hardcoded,
        wrong service name). The API does NOT try to match these — they are
        documented as orphaned. The client-side fix (D-engagement-target-client)
        writes the canonical format going forward.
        """
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "123",
            "body_text": "Hello",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        # Ledger has entries under the legacy format, but we match canonical
        mock_public.aggregate.return_value = []  # no matches for canonical target
        resp = client.patch(
            "/discover/post/alice/public_posts/123",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement"]["comments"] == 0
        # The $match must be for the canonical target, not the legacy format
        call_args = mock_public.aggregate.call_args
        pipeline = call_args[0][0]
        assert pipeline[0] == {"$match": {"target": "alice/public_posts/123"}}

    def test_engagement_n_comments_via_ledger_assert_count(self, client, mock_discovery_and_public):
        """Write N comment ledger entries → discovery post comment_count == N."""
        N = 5
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "bob",
            "service": "public_posts",
            "post_id": "abc",
            "body_text": "Test post",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        mock_public.aggregate.return_value = [
            {"_id": "comment", "count": N},
        ]
        resp = client.patch(
            "/discover/post/bob/public_posts/abc",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement"]["comments"] == N
        # Verify canonical target match
        call_args = mock_public.aggregate.call_args
        pipeline = call_args[0][0]
        assert pipeline[0] == {"$match": {"target": "bob/public_posts/abc"}}

    def test_engagement_deleted_comment_decrements(self, client, mock_discovery_and_public):
        """After a comment is deleted from the ledger, the count decrements."""
        mock_discovery, mock_public = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "123",
            "body_text": "Hello",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        # Initially 3 comments
        mock_public.aggregate.return_value = [
            {"_id": "comment", "count": 3},
        ]
        resp = client.patch(
            "/discover/post/alice/public_posts/123",
            json={"token": None},
        )
        assert resp.status_code == 200
        assert resp.json()["engagement"]["comments"] == 3

        # After deleting one comment, ledger now has 2
        mock_public.aggregate.return_value = [
            {"_id": "comment", "count": 2},
        ]
        resp2 = client.patch(
            "/discover/post/alice/public_posts/123",
            json={"token": None},
        )
        assert resp2.status_code == 200
        assert resp2.json()["engagement"]["comments"] == 2

    def test_engagement_post_id_with_slash_unit(self):
        """post_ids containing slashes are matched as-is in the canonical target.

        The canonical target ``{author}/{service}/{post_id}`` handles slashes
        in post_ids because _discovery_post_to_dict builds the key from the
        three separate fields, and _ledger_engagement_for_post matches it
        directly with no parsing.
        """
        doc = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "sub/123",
            "body_text": "Nested",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        # _discovery_post_to_dict builds the post_key from the three fields
        post_key = f"{doc['author']}/{doc['service']}/{doc['post_id']}"
        assert post_key == "alice/public_posts/sub/123"
        # The function should match this target directly — no parsing needed
        mock_col = MagicMock()
        mock_col.aggregate.return_value = [
            {"_id": "comment", "count": 2},
        ]
        with (
            patch.object(db_module.db["web10"], "__getitem__", return_value=mock_col),
            patch.object(db_module.db, "list_collection_names", return_value=["web10.public"]),
        ):
            result = db_module._ledger_engagement_for_post(post_key)
        assert result["comments"] == 2
        call_args = mock_col.aggregate.call_args[0][0]
        assert call_args[0] == {"$match": {"target": "alice/public_posts/sub/123"}}


# ---------------------------------------------------------------------------
# CRUD HOOK — background indexing
# ---------------------------------------------------------------------------


class TestCrudIndexingHook:
    def test_create_hooks_index(self, client):
        """Verify that creating a record triggers the discovery index hook."""
        with (
            patch(
                "app.services.documentdb.get_star",
                return_value={
                    "service": "*",
                    "username": "alice",
                    "hashed_password": "x",
                    "verified": True,
                    "credit_limit": 1000000,
                    "space_limit": 1000000,
                    "credits_spent": 0,
                    "last_replenish": datetime(1997, 12, 28),
                },
            ),
            patch(
                "app.services.documentdb.get_term_record",
                return_value={
                    "service": "posts",
                    "whitelist": [
                        {"username": "alice", "provider": settings.PROVIDER, "create": True, "read": True},
                        {"username": "anon", "all": True},
                    ],
                    "blacklist": [],
                    "cross_origins": ["auth.localhost"],
                },
            ),
            patch("app.services.documentdb.user_collection_exists", return_value=True),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.create", return_value={"_id": "new123", "text": "hello"}),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.documentdb.background_index_post") as m_index,
        ):
            resp = client.post(
                "/alice/posts",
                json={"token": _owner_token("alice"), "query": {"text": "hello"}},
            )
        assert resp.status_code == 200
        assert m_index.called
        assert m_index.call_args[0] == ("alice", "posts", {"_id": "new123", "text": "hello"})

    def test_delete_hooks_remove(self, client):
        """Verify that deleting a record triggers the discovery remove hook."""
        with (
            patch(
                "app.services.documentdb.get_star",
                return_value={
                    "service": "*",
                    "username": "alice",
                    "hashed_password": "x",
                    "verified": True,
                    "credit_limit": 1000000,
                    "space_limit": 1000000,
                    "credits_spent": 0,
                    "last_replenish": datetime(1997, 12, 28),
                },
            ),
            patch(
                "app.services.documentdb.get_term_record",
                return_value={
                    "service": "posts",
                    "whitelist": [
                        {"username": "alice", "provider": settings.PROVIDER, "delete": True},
                    ],
                    "blacklist": [],
                    "cross_origins": ["auth.localhost"],
                },
            ),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.delete", return_value="successfully deleted"),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.documentdb.background_remove_post") as m_remove,
        ):
            resp = client.request(
                "DELETE",
                "/alice/posts",
                content=_json.dumps({"token": _owner_token("alice"), "query": {"_id": "post123"}}),
                headers={"content-type": "application/json"},
            )
        assert resp.status_code == 200
        assert m_remove.called
        assert m_remove.call_args[0] == ("alice", "posts", "post123")

    def test_update_hooks_reindex(self, client):
        """Verify that updating a record re-indexes it."""
        with (
            patch(
                "app.services.documentdb.get_star",
                return_value={
                    "service": "*",
                    "username": "alice",
                    "hashed_password": "x",
                    "verified": True,
                    "credit_limit": 1000000,
                    "space_limit": 1000000,
                    "credits_spent": 0,
                    "last_replenish": datetime(1997, 12, 28),
                },
            ),
            patch(
                "app.services.documentdb.get_term_record",
                return_value={
                    "service": "posts",
                    "whitelist": [
                        {"username": "alice", "provider": settings.PROVIDER, "update": True},
                    ],
                    "blacklist": [],
                    "cross_origins": ["auth.localhost"],
                },
            ),
            patch("app.services.documentdb.get_collection_size", return_value=1),
            patch("app.services.documentdb.update", return_value={"_id": "post123", "text": "updated"}),
            patch("app.services.documentdb.charge"),
            patch("app.services.documentdb.emit_event"),
            patch("app.services.documentdb.background_index_post") as m_index,
        ):
            resp = client.put(
                "/alice/posts",
                json={
                    "token": _owner_token("alice"),
                    "query": {"_id": "post123"},
                    "update": {"$set": {"text": "updated"}},
                },
            )
        assert resp.status_code == 200
        assert m_index.called
        assert m_index.call_args[0] == ("alice", "posts", {"_id": "post123", "text": "updated"})


# ---------------------------------------------------------------------------
# service_allows_anon — the discovery-indexing gate (regression)
# ---------------------------------------------------------------------------


class TestServiceAllowsAnon:
    """The gate that decides whether a created post is indexed into discovery.

    Regression: the app whitelists anon read on public_posts via the regex
    `.*` (matching how get_approved matches), but the old gate did an exact
    `username == "anon"` compare, so real users' public posts were never
    indexed — anon-readable yet invisible on the discover board.
    """

    def _term(self, whitelist):
        return {"service": "public_posts", "whitelist": whitelist}

    def test_regex_dotstar_with_read_allows_anon(self):
        # The canonical app whitelist — this is the regression case.
        term = self._term([{"username": ".*", "provider": ".*", "read": True}])
        with patch.object(db_module, "get_term_record", return_value=term):
            assert db_module.service_allows_anon("alice", "public_posts") is True

    def test_literal_anon_with_read_allows_anon(self):
        # The seed script's shape — must keep working.
        term = self._term([{"username": "anon", "provider": ".*", "read": True}])
        with patch.object(db_module, "get_term_record", return_value=term):
            assert db_module.service_allows_anon("alice", "public_posts") is True

    def test_all_flag_allows_anon(self):
        term = self._term([{"username": ".*", "provider": ".*", "all": True}])
        with patch.object(db_module, "get_term_record", return_value=term):
            assert db_module.service_allows_anon("alice", "public_posts") is True

    def test_dotstar_without_read_does_not_allow_anon(self):
        # e.g. an anon create-only whitelist must NOT trigger indexing.
        term = self._term([{"username": ".*", "provider": ".*", "create": True}])
        with patch.object(db_module, "get_term_record", return_value=term):
            assert db_module.service_allows_anon("alice", "public_posts") is False

    def test_no_term_record_denies(self):
        with patch.object(db_module, "get_term_record", return_value=None):
            assert db_module.service_allows_anon("alice", "private_posts") is False

    def test_owner_only_service_denies(self):
        # private_posts ships no whitelist — owner only, never indexed.
        with patch.object(db_module, "get_term_record", return_value={"service": "private_posts"}):
            assert db_module.service_allows_anon("alice", "private_posts") is False


# ---------------------------------------------------------------------------
# A13: public_posts term provisioning at signup
# ---------------------------------------------------------------------------


class TestSignupProvisionsPublicPostsTerm:
    """A13: every new account gets the canonical public_posts anon-read term."""

    def test_create_user_inserts_public_posts_term(self):
        """create_user should insert the public_posts term record."""
        mock_col = MagicMock()
        mock_phone = MagicMock()
        mock_phone.find_one.return_value = None

        with (
            patch.object(db_module, "db") as mock_db,
            patch.object(db_module, "get_star", return_value=None),
            patch.object(db_module.records, "star_record", return_value={"service": "*", "username": "newuser"}),
            patch.object(
                db_module.records,
                "services_record",
                return_value={"service": "services", "whitelist": [], "blacklist": []},
            ),
            patch.object(
                db_module.records,
                "public_posts_term",
                return_value={
                    "service": "public_posts",
                    "whitelist": [{"username": ".*", "provider": ".*", "read": True}],
                    "blacklist": [],
                },
            ),
            patch.object(db_module, "to_db", side_effect=lambda d, s: {"service": s, "body": d}),
            patch.object(db_module, "set_phone_number"),
        ):
            mock_db.__getitem__ = MagicMock(side_effect=lambda k: mock_col if k == "newuser" else mock_phone)
            mock_db.__getitem__.return_value = mock_col
            mock_col.insert_one.return_value = MagicMock(inserted_id="id1")

            form_data = MagicMock(username="newuser", password="pass", phone="+1234")
            db_module.create_user(form_data, lambda p: "hashed")

        # Should have inserted: star + services + public_posts + 5 core terms = 8
        assert mock_col.insert_one.call_count == 8
        calls = [c.args[0] for c in mock_col.insert_one.call_args_list]
        services = [c for c in calls if c.get("service") == "services"]
        # One is the general services record, one is the public_posts term, five are core terms
        public_posts_calls = [c for c in services if c.get("body", {}).get("service") == "public_posts"]
        assert len(public_posts_calls) == 1
        body = public_posts_calls[0]["body"]
        assert body["whitelist"] == [{"username": ".*", "provider": ".*", "read": True}]
        core_services = {c.get("body", {}).get("service") for c in services if c.get("body", {}).get("service")}
        core_services.discard("services")
        core_services.discard("public_posts")
        core_services.discard("*")  # star record also wrapped by to_db mock
        assert core_services == {"follows", "inbox", "reactions", "comments", "dms"}


# ---------------------------------------------------------------------------
# A13: migrate_public_posts_terms
# ---------------------------------------------------------------------------


class TestMigratePublicPostsTerms:
    """A13: one-shot migration to provision public_posts terms for existing accounts."""

    def test_migrates_accounts_without_term(self):
        """Accounts without a public_posts term should get one created."""
        mock_alice_col = MagicMock()
        mock_alice_col.find_one.return_value = None  # no term record
        mock_bob_col = MagicMock()
        mock_bob_col.find_one.return_value = None  # no term record

        def _getitem(key):
            if key == "alice":
                return mock_alice_col
            if key == "bob":
                return mock_bob_col
            return MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice", "bob"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "to_db", side_effect=lambda d, s: {"service": s, "body": d}),
        ):
            result = db_module.migrate_public_posts_terms()

        assert result["migrated"] == 2
        assert result["skipped"] == 0
        mock_alice_col.insert_one.assert_called_once()
        mock_bob_col.insert_one.assert_called_once()

    def test_skips_accounts_with_existing_anon_term(self):
        """Accounts that already have an anon-read public_posts term should be skipped."""
        mock_alice_col = MagicMock()
        existing_term = {
            "service": "public_posts",
            "whitelist": [{"username": ".*", "provider": ".*", "read": True}],
            "blacklist": [],
        }
        mock_alice_col.find_one.return_value = {"_id": "x", "body": existing_term}

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
        ):
            result = db_module.migrate_public_posts_terms()

        assert result["skipped"] == 1
        assert result["migrated"] == 0
        mock_alice_col.insert_one.assert_not_called()

    def test_skips_system_collections(self):
        """System collections (web10.*) should not be processed as user accounts."""
        with (
            patch.object(
                db_module.db, "list_collection_names", return_value=["web10.discovery_posts", "web10.public", "alice"]
            ),
            patch.object(db_module.db, "__getitem__", return_value=MagicMock()),
        ):
            result = db_module.migrate_public_posts_terms()

        # Only alice should be processed
        assert result["migrated"] == 1 or result["skipped"] == 1
        assert result["migrated"] + result["skipped"] == 1

    def test_updates_existing_term_without_anon(self):
        """An existing public_posts term that lacks anon read should be updated."""
        mock_alice_col = MagicMock()
        # Existing term with no whitelist (owner-only)
        mock_alice_col.find_one.return_value = {
            "_id": "x",
            "body": {"service": "public_posts", "whitelist": [], "blacklist": []},
        }

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
        ):
            result = db_module.migrate_public_posts_terms()

        assert result["migrated"] == 1
        mock_alice_col.update_one.assert_called_once()
        call_args = mock_alice_col.update_one.call_args
        assert call_args[0][1]["$set"]["body.whitelist"] == [{"username": ".*", "provider": ".*", "read": True}]


# ---------------------------------------------------------------------------
# A13: backfill_discovery
# ---------------------------------------------------------------------------


class TestBackfillDiscovery:
    """A13: one-shot backfill of existing public_posts into the discovery index."""

    def test_backfills_posts(self):
        """All public_posts from user collections should be upserted into discovery."""
        mock_alice_col = MagicMock()
        mock_alice_col.find.return_value = [
            {"_id": "post1", "service": "public_posts", "body": {"text": "hello", "created_at": "2026-01-01T00:00:00"}},
            {"_id": "post2", "service": "public_posts", "body": {"text": "world", "created_at": "2026-01-02T00:00:00"}},
        ]

        def _getitem(key):
            if key == "alice":
                return mock_alice_col
            return MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "upsert_discovery_post") as m_upsert,
            patch.object(db_module, "_ensure_discovery_collection"),
        ):
            result = db_module.backfill_discovery()

        assert result["total"] == 2
        assert result["per_user"]["alice"] == 2
        assert m_upsert.call_count == 2
        # Verify first call has correct args
        assert m_upsert.call_args_list[0][0] == (
            "alice",
            "public_posts",
            {"_id": "post1", "text": "hello", "created_at": "2026-01-01T00:00:00"},
        )

    def test_backfill_empty(self):
        """Users with no public_posts should not generate any upserts."""
        mock_alice_col = MagicMock()
        mock_alice_col.find.return_value = []

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "upsert_discovery_post") as m_upsert,
            patch.object(db_module, "_ensure_discovery_collection"),
        ):
            result = db_module.backfill_discovery()

        assert result["total"] == 0
        assert result["per_user"] == {}
        m_upsert.assert_not_called()

    def test_backfill_skips_system_collections(self):
        """System collections should not be iterated for backfill."""
        with (
            patch.object(db_module.db, "list_collection_names", return_value=["web10.discovery_posts", "web10.public"]),
            patch.object(db_module, "upsert_discovery_post") as m_upsert,
            patch.object(db_module, "_ensure_discovery_collection"),
        ):
            result = db_module.backfill_discovery()

        assert result["total"] == 0
        m_upsert.assert_not_called()


# ---------------------------------------------------------------------------
# A13: admin discovery endpoints
# ---------------------------------------------------------------------------


class TestAdminDiscoveryEndpoints:
    """A13: admin-only endpoints for triggering migration and backfill."""

    def test_migrate_terms_requires_admin(self, client):
        resp = client.post(
            "/admin/discovery/migrate_terms",
            json={"token": _owner_token("regular_user")},
        )
        assert resp.status_code == 403

    def test_migrate_terms_no_token(self, client):
        resp = client.post("/admin/discovery/migrate_terms", json={})
        assert resp.status_code == 403

    def test_backfill_requires_admin(self, client):
        resp = client.post(
            "/admin/discovery/backfill",
            json={"token": _owner_token("regular_user")},
        )
        assert resp.status_code == 403

    def test_backfill_no_token(self, client):
        resp = client.post("/admin/discovery/backfill", json={})
        assert resp.status_code == 403

    def test_migrate_terms_admin_success(self, client):
        mock_col = MagicMock()
        mock_col.find_one.return_value = None

        def _getitem(key):
            return mock_col if key == "alice" else MagicMock()

        with (
            patch("app.services.config.is_admin", return_value=True),
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "to_db", side_effect=lambda d, s: {"service": s, "body": d}),
        ):
            resp = client.post(
                "/admin/discovery/migrate_terms",
                json={"token": _owner_token("admin_user")},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "migrated" in data
        assert "skipped" in data

    def test_backfill_admin_success(self, client):
        mock_alice_col = MagicMock()
        mock_alice_col.find.return_value = [
            {"_id": "p1", "service": "public_posts", "body": {"text": "hello"}},
        ]

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch("app.services.config.is_admin", return_value=True),
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "upsert_discovery_post"),
            patch.object(db_module, "_ensure_discovery_collection"),
        ):
            resp = client.post(
                "/admin/discovery/backfill",
                json={"token": _owner_token("admin_user")},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert data["total"] == 1


# ---------------------------------------------------------------------------
# Admin board moderation (remove/restore/list-removed)
# ---------------------------------------------------------------------------


def _mod_body(username: str = "admin_user", **overrides) -> dict:
    body = {
        "token": _owner_token(username),
        "author": "alice",
        "service": "public_posts",
        "post_id": "p1",
        "reason": "spam",
    }
    body.update(overrides)
    return body


class TestAdminBoardModeration:
    """Admin can hide/restore posts on the public discovery board."""

    def test_remove_requires_admin(self, client):
        resp = client.post("/admin/discovery/remove", json=_mod_body("regular_user"))
        assert resp.status_code == 403

    def test_remove_no_token(self, client):
        resp = client.post("/admin/discovery/remove", json=_mod_body(token=""))
        assert resp.status_code == 403

    def test_restore_requires_admin(self, client):
        resp = client.post("/admin/discovery/restore", json=_mod_body("regular_user"))
        assert resp.status_code == 403

    def test_removed_list_requires_admin(self, client):
        resp = client.post("/admin/discovery/removed", json={"token": _owner_token("regular_user")})
        assert resp.status_code == 403

    def test_remove_rejects_protected_service(self, client):
        with patch("app.services.config.is_admin", return_value=True):
            resp = client.post("/admin/discovery/remove", json=_mod_body(service="*"))
        assert resp.status_code == 400

    def test_remove_admin_success(self, client, mock_discovery_col):
        mock_discovery_col.update_one.return_value = MagicMock(matched_count=1)
        with patch("app.services.config.is_admin", return_value=True):
            resp = client.post("/admin/discovery/remove", json=_mod_body())
        assert resp.status_code == 200
        data = resp.json()
        assert data == {
            "matched": 1,
            "author": "alice",
            "service": "public_posts",
            "post_id": "p1",
            "removed": True,
        }
        # Sticky moderation fields are $set on the index document
        key, update = mock_discovery_col.update_one.call_args[0]
        assert key == {"post_id": "p1", "author": "alice", "service": "public_posts"}
        assert update["$set"]["removed"] is True
        assert update["$set"]["removed_by"] == "admin_user"
        assert update["$set"]["removal_reason"] == "spam"
        assert "removed_at" in update["$set"]

    def test_remove_not_found(self, client, mock_discovery_col):
        mock_discovery_col.update_one.return_value = MagicMock(matched_count=0)
        with patch("app.services.config.is_admin", return_value=True):
            resp = client.post("/admin/discovery/remove", json=_mod_body())
        assert resp.status_code == 404

    def test_restore_admin_success(self, client, mock_discovery_col):
        mock_discovery_col.update_one.return_value = MagicMock(matched_count=1)
        with patch("app.services.config.is_admin", return_value=True):
            resp = client.post("/admin/discovery/restore", json=_mod_body())
        assert resp.status_code == 200
        assert resp.json()["removed"] is False
        _, update = mock_discovery_col.update_one.call_args[0]
        assert set(update["$unset"].keys()) == {
            "removed",
            "removed_by",
            "removed_at",
            "removal_reason",
        }

    def test_removed_list_admin_success(self, client):
        mock_col = MagicMock()
        mock_col.create_index.return_value = "idx"
        mock_col.find.return_value.sort.return_value.limit.return_value = [
            {
                "author": "alice",
                "service": "public_posts",
                "post_id": "p1",
                "body_text": "bad post",
                "tags": [],
                "created_at": "2026-07-27T00:00:00",
                "removed": True,
                "removed_by": "admin_user",
                "removed_at": "2026-07-27T01:00:00",
                "removal_reason": "spam",
            }
        ]
        mock_col.aggregate.return_value = []
        with (
            patch("app.services.config.is_admin", return_value=True),
            patch.object(
                db_module.db["web10"],
                "list_collection_names",
                return_value=["discovery_posts", "public"],
            ),
            patch.object(db_module.db["web10"], "__getitem__", return_value=mock_col),
        ):
            resp = client.post("/admin/discovery/removed", json={"token": _owner_token("admin_user")})
        assert resp.status_code == 200
        removed = resp.json()["removed"]
        assert len(removed) == 1
        assert removed[0]["post_id"] == "p1"
        assert removed[0]["removed_by"] == "admin_user"
        assert removed[0]["removal_reason"] == "spam"

    def test_feed_excludes_removed(self, client, mock_discovery_and_public):
        mock_discovery, _ = mock_discovery_and_public
        resp = client.patch("/discover/posts")
        assert resp.status_code == 200
        query = mock_discovery.find.call_args[0][0]
        assert query == {"removed": {"$ne": True}}

    def test_search_excludes_removed(self, client, mock_discovery_and_public):
        mock_discovery, _ = mock_discovery_and_public
        resp = client.patch("/discover/search?q=hello")
        assert resp.status_code == 200
        query = mock_discovery.find.call_args[0][0]
        assert query["removed"] == {"$ne": True}

    def test_lookup_hides_removed(self, client, mock_discovery_and_public):
        mock_discovery, _ = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "p1",
            "removed": True,
        }
        resp = client.patch("/discover/post/alice/public_posts/p1")
        # a removed post is indistinguishable from a nonexistent one
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# A17: discovery media projection (media_refs, has_media, first_attachment_mime)
# ---------------------------------------------------------------------------


class TestDiscoveryMediaProjection:
    """A17: upsert_discovery_post projects media fields; _discovery_post_to_dict returns them."""

    def test_upsert_post_with_media_refs(self):
        """A post with media_refs indexes them + has_media=true + first attachment mime."""
        mock_discovery = MagicMock()
        mock_web10_db = MagicMock()
        mock_web10_db.list_collection_names.return_value = ["discovery_posts"]
        mock_web10_db.__getitem__ = MagicMock(return_value=mock_discovery)

        mock_user_db = MagicMock()
        mock_media_rec = {
            "_id": "507f1f77bcf86cd799439011",
            "service": "media",
            "body": {"mime_type": "image/jpeg", "url": "https://..."},
        }
        mock_user_db.find_one.return_value = mock_media_rec

        def _getitem_db(key):
            if key == "web10":
                return mock_web10_db
            if key == "alice":
                return mock_user_db
            return MagicMock()

        post = {
            "_id": "post123",
            "text": "sunset photo",
            "media_refs": ["507f1f77bcf86cd799439011"],
            "tags": ["#photography"],
            "created_at": "2026-07-27T00:00:00",
        }

        with patch.object(db_module.db, "__getitem__", side_effect=_getitem_db):
            db_module.upsert_discovery_post("alice", "public_posts", post)

        # Verify the upsert carried media fields
        call_args = mock_discovery.update_one.call_args
        update_doc = call_args[0][1]["$set"]
        assert update_doc["media_refs"] == ["507f1f77bcf86cd799439011"]
        assert update_doc["has_media"] is True
        assert update_doc["first_attachment_mime"] == "image/jpeg"

    def test_upsert_text_only_post(self):
        """A text-only post indexes has_media=false and no media_refs."""
        mock_discovery = MagicMock()
        mock_web10_db = MagicMock()
        mock_web10_db.list_collection_names.return_value = ["discovery_posts"]
        mock_web10_db.__getitem__ = MagicMock(return_value=mock_discovery)

        def _getitem_db(key):
            if key == "web10":
                return mock_web10_db
            return MagicMock()

        post = {
            "_id": "textonly",
            "text": "just words",
            "tags": [],
            "created_at": "2026-07-27T00:00:00",
        }

        with patch.object(db_module.db, "__getitem__", side_effect=_getitem_db):
            db_module.upsert_discovery_post("bob", "public_posts", post)

        call_args = mock_discovery.update_one.call_args
        update_doc = call_args[0][1]["$set"]
        assert update_doc["media_refs"] == []
        assert update_doc["has_media"] is False
        assert "first_attachment_mime" not in update_doc

    def test_upsert_media_refs_not_in_db(self):
        """When media records aren't found, has_media is still true but mime is absent."""
        mock_discovery = MagicMock()
        mock_web10_db = MagicMock()
        mock_web10_db.list_collection_names.return_value = ["discovery_posts"]
        mock_web10_db.__getitem__ = MagicMock(return_value=mock_discovery)

        mock_user_db = MagicMock()
        mock_user_db.find_one.return_value = None  # media record not found

        def _getitem_db(key):
            if key == "web10":
                return mock_web10_db
            if key == "alice":
                return mock_user_db
            return MagicMock()

        post = {
            "_id": "post456",
            "text": "photo",
            "media_refs": ["nonexistent"],
            "created_at": "2026-07-27T00:00:00",
        }

        with patch.object(db_module.db, "__getitem__", side_effect=_getitem_db):
            db_module.upsert_discovery_post("alice", "public_posts", post)

        call_args = mock_discovery.update_one.call_args
        update_doc = call_args[0][1]["$set"]
        assert update_doc["media_refs"] == ["nonexistent"]
        assert update_doc["has_media"] is True
        assert "first_attachment_mime" not in update_doc

    def test_discovery_post_to_dict_returns_media_fields(self):
        """_discovery_post_to_dict returns media_refs, has_media, first_attachment_mime."""
        doc = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "p1",
            "body_text": "hello",
            "tags": ["#test"],
            "created_at": "2026-07-27T00:00:00",
            "media_refs": ["m1", "m2"],
            "has_media": True,
            "first_attachment_mime": "image/png",
        }
        with patch.object(
            db_module, "_ledger_engagement_for_post", return_value={"likes": 0, "comments": 0, "reposts": 0}
        ):
            result = db_module._discovery_post_to_dict(doc)

        assert result["media_refs"] == ["m1", "m2"]
        assert result["has_media"] is True
        assert result["first_attachment_mime"] == "image/png"

    def test_discovery_post_to_dict_defaults_for_legacy_docs(self):
        """Legacy index docs without media fields get sensible defaults."""
        doc = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "legacy",
            "body_text": "old post",
            "tags": [],
            "created_at": "2026-01-01T00:00:00",
        }
        with patch.object(
            db_module, "_ledger_engagement_for_post", return_value={"likes": 0, "comments": 0, "reposts": 0}
        ):
            result = db_module._discovery_post_to_dict(doc)

        assert result["media_refs"] == []
        assert result["has_media"] is False
        assert result["first_attachment_mime"] is None

    def test_feed_endpoint_returns_media_fields(self, client, mock_discovery_and_public):
        """PATCH /discover/posts returns media fields in the response."""
        mock_discovery, _ = mock_discovery_and_public
        mock_discovery.find.return_value.sort.return_value.skip.return_value.limit.return_value = [
            {
                "author": "alice",
                "service": "public_posts",
                "post_id": "p1",
                "body_text": "photo post",
                "tags": ["#photo"],
                "created_at": "2026-07-27T00:00:00",
                "media_refs": ["m1"],
                "has_media": True,
                "first_attachment_mime": "image/jpeg",
            },
            {
                "author": "bob",
                "service": "public_posts",
                "post_id": "p2",
                "body_text": "text only",
                "tags": [],
                "created_at": "2026-07-27T01:00:00",
                "media_refs": [],
                "has_media": False,
            },
        ]

        with patch.object(
            db_module, "_ledger_engagement_for_post", return_value={"likes": 0, "comments": 0, "reposts": 0}
        ):
            resp = client.patch("/discover/posts")

        assert resp.status_code == 200
        posts = resp.json()
        assert len(posts) == 2
        assert posts[0]["has_media"] is True
        assert posts[0]["media_refs"] == ["m1"]
        assert posts[0]["first_attachment_mime"] == "image/jpeg"
        assert posts[1]["has_media"] is False
        assert posts[1]["media_refs"] == []
        assert posts[1]["first_attachment_mime"] is None

    def test_lookup_endpoint_returns_media_fields(self, client, mock_discovery_and_public):
        """PATCH /discover/post/:user/:service/:id returns media fields."""
        mock_discovery, _ = mock_discovery_and_public
        mock_discovery.find_one.return_value = {
            "author": "alice",
            "service": "public_posts",
            "post_id": "p1",
            "body_text": "sunset",
            "tags": [],
            "created_at": "2026-07-27T00:00:00",
            "media_refs": ["m1"],
            "has_media": True,
            "first_attachment_mime": "image/jpeg",
        }

        with patch.object(
            db_module, "_ledger_engagement_for_post", return_value={"likes": 0, "comments": 0, "reposts": 0}
        ):
            resp = client.patch("/discover/post/alice/public_posts/p1")

        assert resp.status_code == 200
        data = resp.json()
        assert data["has_media"] is True
        assert data["media_refs"] == ["m1"]
        assert data["first_attachment_mime"] == "image/jpeg"

    def test_upsert_media_refs_non_list_ignored(self):
        """media_refs that is not a list is treated as empty."""
        mock_discovery = MagicMock()
        mock_web10_db = MagicMock()
        mock_web10_db.list_collection_names.return_value = ["discovery_posts"]
        mock_web10_db.__getitem__ = MagicMock(return_value=mock_discovery)

        def _getitem_db(key):
            if key == "web10":
                return mock_web10_db
            return MagicMock()

        post = {
            "_id": "post789",
            "text": "weird post",
            "media_refs": "not-a-list",  # should be treated as empty
            "created_at": "2026-07-27T00:00:00",
        }

        with patch.object(db_module.db, "__getitem__", side_effect=_getitem_db):
            db_module.upsert_discovery_post("alice", "public_posts", post)

        call_args = mock_discovery.update_one.call_args
        update_doc = call_args[0][1]["$set"]
        assert update_doc["media_refs"] == []
        assert update_doc["has_media"] is False

    def test_upsert_media_lookup_exception_non_fatal(self):
        """A crash in media lookup doesn't prevent the post from being indexed."""
        mock_discovery = MagicMock()
        mock_web10_db = MagicMock()
        mock_web10_db.list_collection_names.return_value = ["discovery_posts"]
        mock_web10_db.__getitem__ = MagicMock(return_value=mock_discovery)

        mock_user_db = MagicMock()
        mock_user_db.find_one.side_effect = Exception("DB connection lost")

        def _getitem_db(key):
            if key == "web10":
                return mock_web10_db
            if key == "alice":
                return mock_user_db
            return MagicMock()

        post = {
            "_id": "postCrash",
            "text": "photo",
            "media_refs": ["m1"],
            "created_at": "2026-07-27T00:00:00",
        }

        with patch.object(db_module.db, "__getitem__", side_effect=_getitem_db):
            # Should not raise
            db_module.upsert_discovery_post("alice", "public_posts", post)

        call_args = mock_discovery.update_one.call_args
        update_doc = call_args[0][1]["$set"]
        assert update_doc["media_refs"] == ["m1"]
        assert update_doc["has_media"] is True
        # first_attachment_mime absent because lookup failed
        assert "first_attachment_mime" not in update_doc


# Core services terms migration (follows persistence fix)
# ---------------------------------------------------------------------------


class TestMigrateFollowsTerms:
    """Provision core app service terms for existing accounts."""

    def test_migrates_accounts_without_terms(self):
        """Accounts without core service terms should get them created."""
        mock_alice_col = MagicMock()
        mock_alice_col.find_one.return_value = None

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "to_db", side_effect=lambda d, s: {"service": s, "body": d}),
        ):
            result = db_module.migrate_follows_terms()

        # 5 core services × 1 account = 5 inserts
        assert result["migrated"] == 5
        assert result["skipped"] == 0
        assert mock_alice_col.insert_one.call_count == 5

    def test_skips_accounts_with_existing_terms(self):
        """Accounts that already have a term should be skipped."""
        mock_alice_col = MagicMock()
        mock_alice_col.find_one.return_value = {"_id": "x", "body": {"service": "follows"}}

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
        ):
            result = db_module.migrate_follows_terms()

        # All 5 services exist → all skipped
        assert result["skipped"] == 5
        assert result["migrated"] == 0
        mock_alice_col.insert_one.assert_not_called()

    def test_partial_migration(self):
        """If some terms exist and others don't, only missing ones are created."""
        mock_alice_col = MagicMock()

        # The actual query is {"service": "services", "body.service": svc}
        def find_one_side_effect(query):
            if query.get("body.service") == "follows":
                return {"_id": "x", "body": {"service": "follows"}}
            return None

        mock_alice_col.find_one.side_effect = find_one_side_effect

        def _getitem(key):
            return mock_alice_col if key == "alice" else MagicMock()

        with (
            patch.object(db_module.db, "list_collection_names", return_value=["alice"]),
            patch.object(db_module.db, "__getitem__", side_effect=_getitem),
            patch.object(db_module, "to_db", side_effect=lambda d, s: {"service": s, "body": d}),
        ):
            result = db_module.migrate_follows_terms()

        assert result["migrated"] == 4  # inbox, reactions, comments, dms
        assert result["skipped"] == 1  # follows
        assert mock_alice_col.insert_one.call_count == 4

    def test_skips_system_collections(self):
        """System collections (web10.*) should not be processed."""
        with (
            patch.object(db_module.db, "list_collection_names", return_value=["web10.discovery_posts", "web10.public"]),
        ):
            result = db_module.migrate_follows_terms()

        assert result["migrated"] == 0
        assert result["skipped"] == 0
