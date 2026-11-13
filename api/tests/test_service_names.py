"""Service identity and invalid-name rejection at the API/compiler boundary."""

import json
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.services.deferred_store import CreateIntent
from app.v3.endpoints import documents
from app.v3.endpoints.deferred import OperationRequest
from app.v3.endpoints.multipart import SessionRequest
from app.v3.models.contracts import AddAppContract
from app.v3.models.documents import CreateDocument, ReadDocuments
from app.v3.models.groups import CreateGroup, ListMyGroups
from app.v3.models.query import QueryRequest
from app.v3.models.session import VerifySession
from app.v3.services import clickhouse as ch
from app.v3.services import safe_query as sq


@pytest.mark.parametrize(
    "name",
    [
        "",
        " posts",
        "posts ",
        "post.name",
        "post/name",
        "x' OR 1=1 --",
        "x\n",
        "pöst",
        "İtems",
        "1posts",
        "_posts",
        "a" * 65,
        "*",
        "group",
        "documents",
        "group_meta",
        None,
        12,
    ],
)
def test_invalid_service_denied_before_api_work(name, monkeypatch):
    app = FastAPI()
    app.include_router(documents.router)
    actor = MagicMock(return_value="alice")
    monkeypatch.setattr(documents, "_user", actor)
    monkeypatch.setattr(documents, "client_id_of", lambda _: None)
    monkeypatch.setattr(documents, "_check_app_permission", MagicMock())
    storage = MagicMock()
    monkeypatch.setattr(ch, "client", storage)
    response = TestClient(app).post("/create", json={"token": "synthetic", "service": name, "body": {}})
    assert response.status_code == 422
    actor.assert_not_called()
    storage.insert.assert_not_called()


def test_case_equivalent_models_and_exact_grants(monkeypatch):
    app = FastAPI()
    app.include_router(documents.router)
    monkeypatch.setattr(documents, "_user", lambda _: "alice")
    monkeypatch.setattr(documents, "client_id_of", lambda _: None)
    grant = AddAppContract(token="synthetic", allowed_origin="https://app.invalid", permissions={"PoStS": ["create"]})
    assert grant.permissions == {"posts": ["create"]}
    monkeypatch.setattr(ch, "get_app_permissions", lambda *a, **k: grant.permissions)
    storage = MagicMock()
    monkeypatch.setattr(ch, "client", storage)
    client = TestClient(app)
    for service in ["posts", "Posts", "POSTS"]:
        response = client.post(
            "/create",
            json={"token": "synthetic", "service": service, "body": {"Case": "Keep ME"}},
            headers={"origin": "https://app.invalid"},
        )
        assert response.status_code == 200
        assert response.json()["service"] == "posts"
        assert storage.insert.call_args.args[1][0][2] == "posts"
        assert json.loads(storage.insert.call_args.args[1][0][3]) == {"Case": "Keep ME"}
    denied = client.post(
        "/create",
        json={"token": "synthetic", "service": "Contacts", "body": {}},
        headers={"origin": "https://app.invalid"},
    )
    assert denied.status_code == 403
    assert storage.insert.call_count == 3
    assert ReadDocuments(service="Posts").service == "posts"


def test_other_ingress_and_reserved_group_metadata():
    assert QueryRequest(sql="SELECT 1", content_service="Posts").content_service == "posts"
    assert VerifySession(services=["Posts", "public_MEDIA"]).services == ["posts", "public_media"]
    assert SessionRequest(token="synthetic", session_id="0" * 32, service="MEDIA").service == "media"
    assert OperationRequest(token="synthetic", operation_id="0" * 32, service="Posts").service == "posts"
    assert CreateIntent(service="Posts", body={}, groups=["group-id"]).service == "posts"
    assert ListMyGroups(token="synthetic").service == "*"
    roles = [{"name": "Owner", "permissions": {"*": ["readAll"], "GROUP": ["manageRoles"], "Posts": ["create"]}}]
    group = CreateGroup(token="synthetic", name="KeepName", roles=roles, members=[])
    assert group.roles[0] == {
        "name": "Owner",
        "permissions": {"*": ["readAll"], "group": ["manageRoles"], "posts": ["create"]},
    }


@pytest.mark.parametrize(
    "permissions",
    [{"posts": ["readAll"], "Posts": ["create"]}, {"bad'key": ["create"]}, {"*": ["readAll"]}, {"group": ["create"]}],
)
def test_app_permission_keys_rejected(permissions):
    with pytest.raises(ValidationError):
        AddAppContract(token="synthetic", allowed_origin="https://app.invalid", permissions=permissions)


def test_group_collision_denied_and_legacy_services_normalized():
    with pytest.raises(ValidationError):
        CreateGroup(
            token="synthetic",
            name="g",
            roles=[{"name": "owner", "permissions": {"posts": ["readAll"], "Posts": ["create"]}}],
            members=[],
        )
    group = CreateGroup(
        token="synthetic",
        name="g",
        roles=[{"name": "Owner", "services": ["PoStS", "*"], "permissions": ["readAll"]}],
        members=[],
    )
    assert group.roles[0]["services"] == ["posts", "*"]


def test_query_case_binding_preserves_qualifiers_literals_and_caller_ctes():
    sql = 'WITH "MiXeD" AS (SELECT Posts.doc_id FROM Posts WHERE body = \'KeepCase\') SELECT * FROM "MiXeD"'
    assert sq.query_services(sql, {"posts"}) == {"posts"}
    compiled = sq.build_safe_query(sql, {"posts": ["allowed-group"]}, allowed_services={"posts"})
    assert "collection_name = 'posts'" in compiled
    assert "collection_name = 'Posts'" not in compiled
    assert "Posts.doc_id" in compiled and "KeepCase" in compiled and "MiXeD" in compiled
    assert "'allowed-group'" in compiled


@pytest.mark.parametrize("name", ["bad name", "bad.name", "x' OR 1=1 --", "pöst", "a" * 65, "DoCuMeNtS"])
def test_quoted_query_services_cannot_bypass_name_validation(name):
    sql = f'SELECT * FROM "{name}"'
    with pytest.raises(sq.UnsafeQueryError):
        sq.query_services(sql)


def test_valid_symbols_and_length():
    for name in ["p", "POSTS2", "App_V2", "web10-social", "a" * 64]:
        assert CreateDocument(token="synthetic", service=name, body={}).service == name.lower()


def test_grant_helpers_and_internal_writers_share_the_rule(monkeypatch):
    storage = MagicMock()
    monkeypatch.setattr(ch, "client", storage)
    monkeypatch.setattr(ch, "get_app_permissions", lambda *a, **k: {"posts": ["readAll"]})
    assert ch.has_permission("alice", "app", "Posts", "readAll")
    assert ch._effective_allows({"posts": ["readAll"]}, "Posts", "readAll")
    assert not ch._effective_allows({"*": ["readAll"]}, "bad/name", "readAll")
    for writer in [ch.add_app_contract, ch.grant_delegated_contract]:
        result = writer("alice", "app", {"Posts": ["readAll"]})
        assert result["permissions"] == {"posts": ["readAll"]}
        storage.reset_mock()
        with pytest.raises(ValueError):
            writer("alice", "app", {"posts": ["readAll"], "Posts": ["create"]})
        storage.insert.assert_not_called()
    with pytest.raises(ValueError):
        ch.insert_document("alice", "bad'name", {})
    storage.insert.assert_not_called()


def test_query_scope_collision_and_reserved_set_parity():
    from app.v3.service_names import RESERVED

    assert sq.RAW_TABLES <= RESERVED
    with pytest.raises(sq.UnsafeQueryError):
        sq.build_safe_query("SELECT * FROM posts", {"posts": ["a"], "Posts": ["b"]})
    with pytest.raises(sq.UnsafeQueryError):
        sq.query_services("SELECT * FROM Contacts", {"posts"})
    with pytest.raises(sq.UnsafeQueryError):
        sq.query_services("SELECT * FROM posts", {"Posts"})  # legacy grants are not silently migrated
    compiled = sq.build_safe_query('SELECT * FROM "SELECT"', {"select": []})
    assert "collection_name = 'select'" in compiled


def test_database_qualified_tables_are_not_service_references():
    for sql in ["SELECT * FROM system.settings", "SELECT * FROM other.posts", "SELECT * FROM catalog.db.posts"]:
        with pytest.raises(sq.UnsafeQueryError):
            sq.build_safe_query(sql, {"posts": ["allowed"], "settings": ["allowed"]})
