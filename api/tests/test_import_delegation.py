"""Signed scope survives import admission, queueing and actual worker writes."""

import json
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.services.auth import decode_token, encode_token
from app.v3.services import import_worker as iw

ORIGIN = "https://import.example"


def token(kind="app", origin=ORIGIN):
    return encode_token(
        {
            "username": "alice",
            "provider": settings.PROVIDER,
            "credential_kind": kind,
            "expires": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
            **({"app_origin": origin} if kind == "app" else {}),
        }
    )


def job():
    return {
        "job_id": "j1",
        "user_key": "alice",
        "platform": "youtube",
        "phase": iw.PENDING,
        "target_group_id": "",
        "object_keys": ["imports/alice/j1/part-000.zip"],
        "total_records": 0,
        "written_records": 0,
        "skipped_records": 0,
        "progress": 0,
        "errors": [],
        "message": "",
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
        "authorization": {"credential_kind": "app", "app_origin": ORIGIN, "expires": "2099-01-01T00:00:00Z"},
    }


@pytest.fixture
def storage():
    with ExitStack() as stack:
        db = stack.enter_context(patch.object(iw.ch, "client"))
        db.query.return_value = MagicMock(result_rows=[])
        contract = stack.enter_context(patch.object(iw.ch, "is_origin_allowed", return_value=True))
        permissions = iw.import_permissions("")
        permissions["imports"].append("read")
        grants = stack.enter_context(patch.object(iw.ch, "get_app_permissions", return_value=permissions))
        stack.enter_context(patch.object(iw.ch, "get_group", return_value={"roles": iw.FOLLOWER_ROLES}))
        member = stack.enter_context(patch.object(iw.ch, "get_group_member", return_value={"role": "owner"}))
        role = stack.enter_context(patch.object(iw.ch, "has_mgmt_permission", return_value=True))
        write = stack.enter_context(patch.object(iw.ch, "can_write_group", return_value=True))
        stored = job()
        stack.enter_context(patch.object(iw, "get_import_job", side_effect=lambda _: stored))

        def update(_, **fields):
            stored.update(fields)
            return stored

        stack.enter_context(patch.object(iw, "update_import_job", side_effect=update))
        yield TestClient(app), stored, contract, grants, member, role, write


@pytest.mark.parametrize(
    "case",
    ["granted", "missing", "revoked", "wildcard", "missing-service", "missing-group", "nonowner", "spoofed", "self"],
)
def test_signed_import_admission(storage, case):
    client, _, contract, grants, member, _, _ = storage
    contract.return_value = case != "revoked"
    if case == "missing":
        grants.return_value = {}
    elif case == "wildcard":
        grants.return_value = {"*": ["create", "readAll", "createGroup", "manageRoles", "assignRoles"]}
    elif case == "missing-service":
        grants.return_value.pop("comments")
    elif case == "missing-group":
        grants.return_value.pop("group")
    elif case == "nonowner":
        member.return_value = {"role": "member"}
    with (
        patch("app.v3.endpoints.imports.ensure_bucket"),
        patch("app.v3.endpoints.imports.get_s3_client"),
        patch("app.v3.endpoints.imports.get_s3_signing_client") as signer,
        patch.object(iw, "create_import_job") as create,
    ):
        signer.return_value.generate_presigned_post.return_value = {"url": "upload", "fields": {}}
        session = token("self" if case == "self" else "app")
        response = client.post(
            "/v3/imports",
            json={"token": session, "platform": "youtube", "parts": [{"filename": "export.zip"}]},
            headers={"origin": "https://evil.example"} if case == "spoofed" else {},
        )
    assert response.status_code == (200 if case in ("granted", "self") else 403), response.text
    if case in ("granted", "self"):
        recorded = create.call_args.kwargs["authorization"]
        assert recorded["expires"] == decode_token(session).expires
        assert "token" not in recorded
        assert recorded["app_origin"] == (ORIGIN if case == "granted" else None)
    else:
        create.assert_not_called()
        signer.return_value.generate_presigned_post.assert_not_called()


@pytest.mark.parametrize("route,op", [("start", "create"), ("status", "read")])
@pytest.mark.parametrize("case", ["granted", "other-app", "revoked", "missing-grant", "no-group-authority"])
def test_signed_import_job_boundaries(storage, route, op, case):
    client, _, contract, grants, _, role, _ = storage
    contract.return_value = case != "revoked"
    if case == "missing-grant":
        grants.return_value["imports"] = []
    if case == "no-group-authority":
        role.return_value = False
    with patch("app.v3.endpoints.imports.get_s3_client") as s3, patch.object(iw, "submit_import_job") as submit:
        s3.return_value.head_object.return_value = {"ContentLength": 123}
        response = client.post(
            "/v3/imports/" + route,
            json={"token": token(origin="https://other.example" if case == "other-app" else ORIGIN), "job_id": "j1"},
        )
    allowed = case == "granted" or (route == "status" and case == "no-group-authority")
    assert response.status_code == (200 if allowed else 403), response.text
    assert submit.called == (route == "start" and allowed)


def revoke(storage, failure):
    _, stored, contract, grants, member, role, write = storage
    if failure == "expired":
        stored["authorization"]["expires"] = "2000-01-01T00:00:00Z"
    elif failure == "revoked":
        contract.return_value = False
    elif failure == "service-reduced":
        grants.return_value.pop("staging_posts")
    elif failure == "group-reduced":
        grants.return_value["group"] = ["createGroup"]
    elif failure == "role-revoked":
        member.return_value = {"role": "member"}
    elif failure == "write-revoked":
        write.return_value = False
    else:
        stored["authorization"] = None


@pytest.mark.parametrize(
    "failure", ["expired", "revoked", "service-reduced", "group-reduced", "role-revoked", "write-revoked", "legacy"]
)
def test_worker_rechecks_before_any_io(storage, failure):
    revoke(storage, failure)
    with patch.object(iw, "_download_parts") as download, patch.object(iw.ch, "insert_document") as insert:
        with pytest.raises(HTTPException):
            iw._process_job("j1")
    download.assert_not_called()
    insert.assert_not_called()


@pytest.mark.parametrize("failure", ["revoked", "service-reduced", "role-revoked", "expired", None])
def test_actual_worker_rechecks_after_parse(storage, failure):
    def parse(_):
        if failure:
            revoke(storage, failure)
        return [{"service": "staging_posts", "origin_id": "one", "body": {"text": "note"}}]

    with (
        patch.object(iw, "_download_parts"),
        patch.object(iw, "_extract_data_entries", return_value=[]),
        patch.dict(iw.PARSERS, youtube=parse),
        patch.object(iw, "_delete_parts"),
        patch.object(iw.ch, "insert_document", return_value={"doc_id": "new"}) as insert,
        patch.object(iw.ch, "attach_doc_to_groups") as attach,
    ):
        if failure:
            with pytest.raises(HTTPException):
                iw._process_job("j1")
            insert.assert_not_called()
            attach.assert_not_called()
        else:
            iw._process_job("j1")
            insert.assert_called_once()
            attach.assert_called_once()
            assert storage[1]["phase"] == iw.COMPLETE


def test_worker_rechecks_between_document_and_attachment(storage):
    records = [{"service": "staging_posts", "origin_id": "one", "body": {"text": "note"}}]

    def insert(**_):
        revoke(storage, "revoked")
        return {"doc_id": "new"}

    with (
        patch.object(iw, "_download_parts"),
        patch.object(iw, "_extract_data_entries", return_value=[]),
        patch.dict(iw.PARSERS, youtube=lambda _: records),
        patch.object(iw, "_delete_parts"),
        patch.object(iw.ch, "insert_document", side_effect=insert) as mutation,
        patch.object(iw.ch, "attach_doc_to_groups") as attach,
    ):
        with pytest.raises(HTTPException):
            iw._process_job("j1")
    mutation.assert_called_once()
    attach.assert_not_called()


def test_scope_is_persisted_and_preserved_by_status_updates():
    stored = job()
    with patch.object(iw.ch, "client") as db, patch.object(iw, "get_import_job", return_value=stored):
        iw.create_import_job("j1", "alice", "youtube", [], authorization=stored["authorization"])
        values = dict(zip(db.insert.call_args.kwargs["column_names"], db.insert.call_args.args[1][0]))
        assert json.loads(values["authorization"]) == stored["authorization"]
        iw.update_import_job("j1", progress=10)
        values = dict(zip(db.insert.call_args.kwargs["column_names"], db.insert.call_args.args[1][0]))
        assert json.loads(values["authorization"]) == stored["authorization"]


def test_scope_is_rehydrated_from_storage():
    stored = job()
    row = (
        "j1",
        "alice",
        "youtube",
        iw.QUEUED,
        "[]",
        "",
        0,
        0,
        0,
        0,
        "[]",
        "",
        datetime.now(),
        datetime.now(),
        json.dumps(stored["authorization"]),
    )
    with patch.object(iw.ch, "client") as db:
        db.query.return_value = MagicMock(result_rows=[row])
        assert iw.get_import_job("j1")["authorization"] == stored["authorization"]


@pytest.mark.parametrize("granted", [False, True])
def test_page_import_requires_actual_identity_service(storage, granted):
    _, stored, _, grants, _, _, _ = storage
    stored["target_group_id"] = "g1"
    grants.return_value = iw.import_permissions("g1")
    if not granted:
        grants.return_value.pop(iw.GROUP_IDENTITY_SERVICE)
        with pytest.raises(HTTPException):
            iw.authorize_import_job(stored)
    else:
        iw.authorize_import_job(stored)


def test_thumbnail_scope_rechecked_after_download_before_upload(storage):
    _, stored, contract, _, _, _, _ = storage

    def download(*args, **kwargs):
        contract.return_value = False
        return MagicMock(content=b"thumbnail")

    with (
        patch.object(iw.requests, "get", side_effect=download),
        patch.object(iw.media_svc, "get_s3_client") as s3,
        patch.object(iw.ch, "confirm_media_upload") as confirm,
    ):
        with pytest.raises(HTTPException):
            iw._upload_thumbnail(
                "alice", "https://example.com/image", "one", "title", lambda: iw.authorize_import_job(stored)
            )
    s3.assert_not_called()
    confirm.assert_not_called()


@pytest.mark.parametrize("route", ["block", "unblock"])
@pytest.mark.parametrize("case", ["granted", "missing", "wildcard", "group-only", "revoked", "spoofed", "self"])
def test_user_blocking_exact_reserved_grant(storage, route, case):
    client, _, contract, grants, _, _, _ = storage
    grants.return_value = {"user": ["blockUsers"]}
    if case == "missing":
        grants.return_value = {}
    elif case == "wildcard":
        grants.return_value = {"*": ["blockUsers"]}
    elif case == "group-only":
        grants.return_value = {"group": ["blockMembers"]}
    contract.return_value = case != "revoked"
    with patch.object(iw.ch, route + "_user") as mutation:
        response = client.post(
            "/v3/" + route,
            json={"token": token("self" if case == "self" else "app"), "blocked_key": "bob"},
            headers={"origin": "https://evil.example"} if case == "spoofed" else {},
        )
    assert response.status_code == (200 if case in ("granted", "self") else 403)
    assert mutation.called == (case in ("granted", "self"))
