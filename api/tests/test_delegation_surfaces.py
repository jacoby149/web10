"""Delegation cannot gain extra authority through alternate HTTP surfaces."""

from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.services import config
from app.v3.services import clickhouse as ch

ORIGIN = "https://notes.example"


def session(kind="app", username="alice"):
    from app.services.auth import encode_token

    return encode_token(
        {
            "username": username,
            "provider": settings.PROVIDER,
            "credential_kind": kind,
            "expires": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            **({"app_origin": ORIGIN} if kind == "app" else {}),
        }
    )


@pytest.fixture
def boundary():
    with ExitStack() as stack:
        stack.enter_context(patch.object(ch, "client"))
        active = stack.enter_context(patch.object(ch, "is_origin_allowed", return_value=True))
        permissions = stack.enter_context(patch.object(ch, "get_app_permissions", return_value={"notes": ["readAll"]}))
        doc = {
            "doc_id": "d1",
            "author_key": "alice",
            "service": "media_metadata",
            "tags": [],
            "body": {"object_key": "alice/id/raw", "video": {"type": "minio", "value": "alice/id/raw"}},
        }
        get_doc = stack.enter_context(patch.object(ch, "get_document", return_value=doc))
        stack.enter_context(patch.object(ch, "get_document_any_author", return_value=doc))
        stack.enter_context(patch.object(ch, "get_doc_groups", return_value=["g1"]))
        role = stack.enter_context(patch.object(ch, "can_read_group", return_value=True))
        get_key = stack.enter_context(patch.object(ch, "get_media_by_object_key", return_value=doc))
        stack.enter_context(patch("app.v3.endpoints.media.ensure_bucket"))
        s3 = stack.enter_context(patch("app.v3.endpoints.media.get_s3_client"))
        s3.return_value.head_object.return_value = {"ContentLength": 123}
        signer = stack.enter_context(patch("app.v3.endpoints.media.get_s3_signing_client"))
        signer.return_value.generate_presigned_post.return_value = {"url": "upload", "fields": {}}
        signer.return_value.generate_presigned_url.return_value = "read"
        mutations = {}
        for name, result in (
            ("confirm_media_upload", doc),
            ("list_media", []),
            ("delete_media", None),
            ("resolve_media_urls", {}),
            ("insert_document", {"doc_id": "new"}),
            ("update_document", {"doc_id": "d1"}),
            ("delete_document", None),
            ("attach_doc_to_groups", None),
            ("replace_doc_groups", None),
            ("detach_doc_from_groups", None),
        ):
            mutations[name] = stack.enter_context(patch.object(ch, name, return_value=result))
        submit = stack.enter_context(patch("app.v3.endpoints.media.transcode.submit_transcode_job"))
        admin = stack.enter_context(patch("app.services.config.is_admin", return_value=True))
        yield TestClient(app), permissions, active, doc, get_doc, get_key, role, signer, mutations, submit, admin


MEDIA_ROUTES = [
    ("upload-url", "create", {"body": {"filename": "raw.mp4"}}),
    ("confirm", "create", {"body": {"object_key": "alice/id/raw"}}),
    ("read-url", "readAll", {"body": {"object_key": "alice/id/raw"}}),
    ("list", "readAll", {}),
    ("delete", "deleteOwn", {"doc_id": "d1"}),
    ("thumbnail", "readAll", {"doc_id": "d1"}),
    ("transcode", "updateOwn", {"doc_id": "d1"}),
]


@pytest.mark.parametrize("route,operation,payload", MEDIA_ROUTES)
@pytest.mark.parametrize("case", ["notes-only", "granted", "wrong-operation", "revoked", "spoofed", "self", "wildcard"])
def test_media_http_permissions(boundary, route, operation, payload, case):
    client, permissions, active, _, _, _, _, signer, mutations, submit, _ = boundary
    permissions.return_value = {"media_metadata": [operation]}
    if case == "notes-only":
        permissions.return_value = {"notes": ["readAll"]}
    if case == "wrong-operation":
        permissions.return_value = {"media_metadata": ["readAll" if operation != "readAll" else "create"]}
    if case == "wildcard":
        permissions.return_value = {"*": [operation]}
    active.return_value = case != "revoked"
    response = client.post(
        "/v3/media/" + route,
        json={"token": session("self" if case == "self" else "app"), **payload},
        headers={"origin": "https://evil.example"} if case == "spoofed" else {},
    )
    assert response.status_code == (200 if case in ("self", "granted", "wildcard") else 403), response.text
    if response.status_code != 200:
        signer.return_value.generate_presigned_post.assert_not_called()
        signer.return_value.generate_presigned_url.assert_not_called()
        submit.assert_not_called()
        for mutation in mutations.values():
            mutation.assert_not_called()


@pytest.mark.parametrize("service", ["media_metadata", "public_media"])
@pytest.mark.parametrize("route,operation,payload", [MEDIA_ROUTES[2], MEDIA_ROUTES[4], MEDIA_ROUTES[6]])
def test_actual_media_service_not_caller_hint(boundary, service, route, operation, payload):
    client, permissions, _, doc, _, _, _, _, _, _, _ = boundary
    doc["service"] = service
    wrong = "public_media" if service == "media_metadata" else "media_metadata"
    permissions.return_value = {wrong: [operation]}
    request = {"token": session(), **payload}
    if "body" in request:
        request["body"] = {**request["body"], "service": wrong}
    assert client.post("/v3/media/" + route, json=request).status_code == 403
    permissions.return_value = {service: [operation]}
    assert client.post("/v3/media/" + route, json=request).status_code == 200


def test_media_list_filters_before_storage_pagination(boundary):
    client, permissions, _, _, _, _, _, _, mutations, _, _ = boundary
    permissions.return_value = {"public_media": ["readAll"]}
    assert client.post("/v3/media/list", json={"token": session(), "limit": 1}).status_code == 200
    assert mutations["list_media"].call_args.kwargs["services"] == ["public_media"]


@pytest.mark.parametrize("kind", ["app", "self"])
def test_media_delete_never_tombstones_arbitrary_service(boundary, kind):
    client, permissions, _, doc, _, _, _, _, mutations, _, _ = boundary
    permissions.return_value = {"*": ["deleteOwn"]}
    doc["service"] = "notes"
    assert client.post("/v3/media/delete", json={"token": session(kind), "doc_id": "d1"}).status_code == 404
    mutations["delete_media"].assert_not_called()


@pytest.mark.parametrize("service", ["notes", "media_metadata", "public_media"])
def test_transcode_requires_actual_update_permission(boundary, service):
    client, permissions, _, doc, _, _, _, _, _, submit, _ = boundary
    doc["service"] = service
    permissions.return_value = {service: ["create"]}
    assert client.post("/v3/media/transcode", json={"token": session(), "doc_id": "d1"}).status_code == 403
    submit.assert_not_called()


def test_raw_key_requires_owner_and_current_metadata(boundary):
    client, permissions, _, _, _, key, _, signer, _, _, _ = boundary
    permissions.return_value = {"media_metadata": ["readAll"]}
    assert (
        client.post("/v3/media/read-url", json={"token": session(), "body": {"object_key": "bob/id/raw"}}).status_code
        == 403
    )
    key.assert_not_called()
    key.return_value = None
    assert (
        client.post("/v3/media/read-url", json={"token": session(), "body": {"object_key": "alice/id/raw"}}).status_code
        == 404
    )
    signer.return_value.generate_presigned_url.assert_not_called()


@pytest.mark.parametrize(
    "route,payload",
    [
        ("/v3/imports", {"platform": "youtube", "parts": [{"filename": "export.zip"}]}),
        ("/v3/imports/start", {"job_id": "j1"}),
        ("/v3/imports/status", {"job_id": "j1"}),
        ("/v3/apps/rating", {"body": {"target_app_id": "notes", "rating": 5}}),
        ("/v3/block", {"blocked_key": "bob"}),
        ("/v3/unblock", {"blocked_key": "bob"}),
    ],
)
@pytest.mark.parametrize("active", [True, False])
def test_sensitive_surfaces_reject_without_reserved_grants(boundary, route, payload, active):
    client, permissions, contract, _, _, _, _, _, _, _, _ = boundary
    contract.return_value = active
    permissions.return_value = {
        "*": ["create", "readAll", "updateOwn", "deleteOwn", "blockUsers"],
        "group": ["createGroup", "manageRoles", "assignRoles", "blockMembers"],
        "node": ["manageMonetization", "moderate"],
    }
    with (
        patch("app.v3.services.import_worker.get_import_job") as job,
        patch.object(ch, "create_app_rating") as rating,
        patch.object(ch, "block_user") as block,
        patch.object(ch, "unblock_user") as unblock,
        patch("app.v3.services.import_worker.create_import_job") as create,
    ):
        response = client.post(route, json={"token": session(), **payload})
    assert response.status_code == 403, response.text
    for mutation in (job, rating, block, unblock, create):
        mutation.assert_not_called()


@pytest.mark.parametrize("route", ["block", "unblock"])
def test_self_can_still_change_user_blocking(boundary, route):
    client = boundary[0]
    with patch.object(ch, route + "_user") as mutation:
        assert client.post("/v3/" + route, json={"token": session("self"), "blocked_key": "bob"}).status_code == 200
    mutation.assert_called_once_with("alice", "bob")


@pytest.mark.parametrize("case", ["missing-grant", "no-role", "granted", "revoked", "spoofed", "self"])
def test_group_detail_posts_require_both_boundaries(boundary, case):
    client, permissions, active, _, _, _, role, _, _, _, _ = boundary
    permissions.return_value = {"posts": ["readAll"]} if case != "missing-grant" else {"notes": ["readAll"]}
    active.return_value = case != "revoked"
    role.return_value = case != "no-role"
    with (
        patch.object(
            ch, "get_group", return_value={"group_id": "g1", "roles": [], "join_policy": "open", "discoverable": False}
        ),
        patch.object(ch, "is_group_member", return_value=True),
        patch.object(ch, "_get_group_member_counts", return_value={}),
        patch.object(ch, "read_documents_in_groups", return_value=[]) as read,
    ):
        response = client.get(
            "/v3/groups/detail",
            params={"group_id": "g1", "token": session("self" if case == "self" else "app")},
            headers={"origin": "https://evil.example"} if case == "spoofed" else {},
        )
    assert response.status_code == (200 if case in ("granted", "self") else 403)
    assert read.called == (case in ("granted", "self"))


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
@pytest.mark.parametrize("case", ["missing", "nonadmin", "granted", "self", "wildcard", "revoked", "spoofed"])
def test_node_inventory_designation_requires_node_authority(boundary, operation, case):
    client, permissions, active, doc, _, _, _, _, mutations, _, admin = boundary
    crud = {"create": "create", "update": "updateOwn", "delete": "deleteOwn"}[operation]
    permissions.return_value = {"notes": [crud]}
    if case != "missing":
        permissions.return_value["*" if case == "wildcard" else "node"] = ["manageMonetization"]
    admin.return_value = case != "nonadmin"
    active.return_value = case != "revoked"
    doc["service"] = "notes"
    doc["tags"] = ["ad", "node_ad"]
    payload = {"token": session("self" if case == "self" else "app")}
    if operation == "create":
        payload.update(service="notes", body={"tags": ["ad", "node_ad"], "status": "active"})
    elif operation == "update":
        payload.update(doc_id="d1", body={"tags": [], "status": "paused"})
    else:
        payload.update(doc_id="d1")
    response = client.post(
        "/v3/" + operation, json=payload, headers={"origin": "https://evil.example"} if case == "spoofed" else {}
    )
    assert response.status_code == (200 if case in ("granted", "self") else 403), response.text
    mutation = mutations[
        {"create": "insert_document", "update": "update_document", "delete": "delete_document"}[operation]
    ]
    assert mutation.called == (case in ("granted", "self"))


def test_update_cannot_add_designation_with_ordinary_crud(boundary):
    client, permissions, _, doc, _, _, _, _, mutations, _, _ = boundary
    permissions.return_value = {"notes": ["updateOwn"]}
    doc.update(service="notes", tags=[], body={})
    assert (
        client.post("/v3/update", json={"token": session(), "doc_id": "d1", "body": {"tags": ["node_ad"]}}).status_code
        == 403
    )
    mutations["update_document"].assert_not_called()


def test_media_mutations_cannot_bypass_node_designation(boundary):
    client, permissions, _, doc, _, _, _, _, mutations, submit, _ = boundary
    permissions.return_value = {"media_metadata": ["deleteOwn", "updateOwn"]}
    doc["tags"] = ["node_ad"]
    for route in ("delete", "transcode"):
        assert client.post("/v3/media/" + route, json={"token": session(), "doc_id": "d1"}).status_code == 403
    mutations["delete_media"].assert_not_called()
    submit.assert_not_called()


def test_media_delete_service_layer_rejects_non_media():
    with (
        patch.object(ch, "get_document", return_value={"service": "notes"}),
        patch.object(ch, "delete_document") as delete,
    ):
        with pytest.raises(HTTPException):
            ch.delete_media("alice", "d1")
    delete.assert_not_called()


@pytest.mark.parametrize(
    "saved,expected",
    [({}, ["operator", "other"]), ({"admins": ["saved"]}, ["saved"]), ({"admins": []}, []), ({"admins": None}, [])],
)
def test_admin_source_replaces_bootstrap(monkeypatch, saved, expected):
    monkeypatch.setattr(settings, "DEFAULT_ADMINS", "operator, other")
    with patch.object(config, "get_config", return_value=saved):
        assert config.list_admins() == expected
        assert not config.is_admin("o")


@pytest.mark.parametrize("username,expected", [("o", 403), ("operator", 200)])
def test_bootstrap_string_never_grants_character_admin_http(monkeypatch, username, expected):
    client = TestClient(app)
    monkeypatch.setattr(settings, "DEFAULT_ADMINS", "operator, other")
    with (
        patch.object(ch, "client"),
        patch.object(config, "get_config", return_value={}),
        patch.object(config, "effective_config", return_value={}),
    ):
        assert client.post("/config", json={"token": session("self", username)}).status_code == expected


def test_inventory_author_filter_precedes_limit_and_latest_tags():
    with patch.object(ch, "client") as db, patch.object(config, "list_admins", return_value=["operator"]):
        db.query.return_value = MagicMock(result_rows=[])
        ch.get_active_node_ads()
    sql, params = db.query.call_args.args
    assert params["admins"] == ["operator"]
    assert sql.index("author_key IN %(admins)s") < sql.index("LIMIT 20")
    assert sql.index("rn = 1") < sql.index("has(tags, 'node_ad')") < sql.index("LIMIT 20")


def test_inventory_saturation_cannot_crowd_out_operator():
    candidates = [(f"forged-{i}", "outsider", '{"status":"active"}', ["ad", "node_ad"]) for i in range(100)]
    candidates.append(("operator-ad", "operator", '{"status":"active"}', ["ad", "node_ad"]))

    def query(sql, params):
        assert "WHERE author_key IN %(admins)s" in sql.split("LIMIT 20")[0]
        rows = [row for row in candidates if row[1] in params["admins"]][:20]
        return MagicMock(result_rows=rows)

    with patch.object(ch, "client") as db, patch.object(config, "list_admins", return_value=["operator"]):
        db.query.side_effect = query
        assert [ad["doc_id"] for ad in ch.get_active_node_ads()] == ["operator-ad"]


@pytest.mark.parametrize(
    "case", ["granted", "missing", "wrong-operation", "wildcard", "revoked", "spoofed", "matching-origin", "self"]
)
def test_rating_exact_user_grant_signed_http(boundary, case):
    client, permissions, active, _, _, _, _, _, _, _, _ = boundary
    permissions.return_value = {"user": ["rateApps"]}
    if case == "missing":
        permissions.return_value = {}
    elif case == "wrong-operation":
        permissions.return_value = {"user": ["blockUsers"]}
    elif case == "wildcard":
        permissions.return_value = {"*": ["rateApps"]}
    active.return_value = case != "revoked"
    headers = (
        {"origin": "https://evil.example"}
        if case == "spoofed"
        else {"origin": ORIGIN}
        if case == "matching-origin"
        else {}
    )
    with (
        patch.object(ch, "create_app_rating", return_value={"rating": 5}) as rating,
        patch.object(config, "is_admin", side_effect=AssertionError("Rating must not require admin authority")),
    ):
        response = client.post(
            "/v3/apps/rating",
            json={
                "token": session("self" if case == "self" else "app"),
                "body": {"target_app_id": "https://notes.example/", "rating": 5, "comment": "Useful"},
            },
            headers=headers,
        )
    allowed = case in ("granted", "matching-origin", "self")
    assert response.status_code == (200 if allowed else 403), response.text
    if allowed:
        rating.assert_called_once_with(
            author="alice",
            target_app_id="https://notes.example/",
            rating=5,
            provider=settings.PROVIDER,
            comment="Useful",
        )
    else:
        rating.assert_not_called()


def test_rating_self_session_needs_no_app_contract(boundary):
    client, permissions, active, _, _, _, _, _, _, _, _ = boundary
    permissions.return_value = {}
    active.return_value = False
    with patch.object(ch, "create_app_rating", return_value={"rating": 5}):
        response = client.post(
            "/v3/apps/rating",
            json={
                "token": session("self"),
                "body": {
                    "target_app_id": "https://notes.example/",
                    "rating": 5,
                },
            },
        )
    assert response.status_code == 200
    active.assert_not_called()
    permissions.assert_not_called()
