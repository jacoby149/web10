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
        resp = client.patch(
            "/public/entries",
            json={"token": None},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_query_filter_by_schema_id(self, client, mock_public_col):
        mock_public_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/public/entries",
            json={"token": None, "query": {"schema_id": "api.localhost.uuid6:reactions"}},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_query_filter_by_target(self, client, mock_public_col):
        mock_public_col.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
        resp = client.patch(
            "/public/entries",
            json={"token": None, "query": {"target": "alice/posts/123"}},
        )
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
    def test_suggested_users(self, client, mock_discovery_col):
        mock_discovery_col.find.return_value = []
        resp = client.patch(
            "/discover/users",
            json={"token": None},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_suggested_users_anon_ok(self, client, mock_discovery_col):
        mock_discovery_col.find.return_value = []
        resp = client.patch(
            "/discover/users",
            json={},
        )
        assert resp.status_code == 200

    def test_suggested_users_bodyless(self, client, mock_discovery_col):
        """Regression: bodyless PATCH with URL param must not 422."""
        mock_discovery_col.find.return_value = []
        resp = client.patch("/discover/users?limit=5")
        assert resp.status_code == 200
        assert resp.json() == []


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
            "service": "posts",
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
            "/discover/post/alice/posts/123",
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
            "service": "posts",
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
            "/discover/post/alice/posts/456",
            json={"token": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["engagement_score"] == 35  # 10*1 + 5*3 + 2*5


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
