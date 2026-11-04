import base64
import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app
from app.services import multipart_uploads
from app.services.upload_sessions import UploadSessionStore
from app.v3.endpoints import multipart
from tests.multipart_support import MultipartS3


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(settings, "RESUMABLE_UPLOADS_ENABLED", True)
    monkeypatch.setattr(settings, "PRIVATE_KEY", "multipart-route-synthetic-secret-key")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")
    monkeypatch.setattr(multipart_uploads, "PART_SIZE", 8)
    monkeypatch.setattr(multipart, "PART_SIZE", 8)
    s3, authority = MultipartS3(), {"grant": True, "user": True, "client": True}
    store = UploadSessionStore(s3, "state", media_bucket="media")
    transport = multipart_uploads.MultipartUploads(store, s3)
    factory = Mock(return_value=transport)
    monkeypatch.setattr(multipart, "_transport", factory)
    permission = Mock(side_effect=lambda *args, **kwargs: authority["grant"])
    monkeypatch.setattr(multipart.ch, "has_permission", permission)
    monkeypatch.setattr(multipart.ch, "get_user", lambda _: {"username": "available"} if authority["user"] else None)
    monkeypatch.setattr(multipart.ch, "get_oauth_client", lambda _: {} if authority["client"] else None)

    def token(**patch):
        payload = {
            "username": "alice",
            "provider": settings.PROVIDER,
            "site": "auth.localhost",
            "expires": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        }
        return jwt.encode({**payload, **patch}, settings.PRIVATE_KEY, algorithm="HS256")

    content = b"a full feature film"
    body = {
        "token": token(),
        "session_id": uuid4().hex,
        "service": "public_media",
        "filename": "movie.mp4",
        "mime_type": "video/mp4",
        "size_bytes": len(content),
        "checksum_sha256": hashlib.sha256(content).hexdigest(),
    }
    return TestClient(app), s3, authority, factory, permission, token, body, content


def post(api, operation, body=None, origin="https://social.example"):
    client, _, _, _, _, _, initial, _ = api
    payload = body or {key: initial[key] for key in ("token", "session_id", "service")}
    return client.post(f"/v3/media/uploads/{operation}", json=payload, headers={"Origin": origin} if origin else {})


def test_registered_routes_upload_status_complete_replay_and_abort_other_task(api):
    client, s3, _, factory, permission, _, body, content = api
    started = post(api, "start", body)
    assert started.status_code == 200, started.text
    record = started.json()
    assert permission.call_args.args == ("alice", "https://social.example", "public_media", "create")
    assert record["phase"] == "uploading" and record["object_key"].startswith("alice/")
    for index in range(0, len(content), 8):
        s3.add_part(record["upload_id"], index // 8 + 1, content[index : index + 8])
    status = post(api, "status").json()
    assert status["uploaded_bytes"] == len(content) and len(status["parts"]) == 3
    assert post(api, "complete").json()["phase"] == "completed"
    assert post(api, "complete").json()["object_key"] == record["object_key"]
    assert post(api, "abort").status_code == 409
    assert client.get("/v3/media/uploads/capabilities").json()["enabled"] is True


@pytest.mark.parametrize(
    "case", ["bad-signature", "expired", "no-expiry", "anon", "foreign", "deleted", "revoked-client"]
)
def test_invalid_identity_denies_before_any_storage(api, case):
    _, _, authority, factory, _, token, body, _ = api
    if case == "bad-signature":
        body["token"] = body["token"][:-6] + "broken"
    elif case == "expired":
        body["token"] = token(expires="2000-01-01T00:00:00Z")
    elif case == "no-expiry":
        body["token"] = token(expires=None)
    elif case == "anon":
        body["token"] = token(username="anon", expires=None)
    elif case == "foreign":
        body["token"] = token(provider="foreign.example")
    elif case == "deleted":
        authority["user"] = False
    else:
        body["token"] = token(client_id="revoked")
        authority["client"] = False
    assert post(api, "start", body).status_code == 401
    factory.assert_not_called()


@pytest.mark.parametrize(
    "origin",
    [None, "null", "https://social.example/path", "https://user@social.example", "https://social.example?other=1"],
)
def test_invalid_or_absent_browser_origin_denies_before_storage(api, origin):
    assert post(api, "start", api[6], origin=origin).status_code == 403
    api[3].assert_not_called()


def test_oauth_uses_verified_active_client_and_ignores_spoofed_origin(api):
    _, _, _, _, permission, token, body, _ = api
    body["token"] = token(client_id="client-a")
    assert post(api, "start", body, origin="https://not-the-client.example").status_code == 200
    assert permission.call_args.args == ("alice", "", "public_media", "create")
    assert permission.call_args.kwargs == {"client_id": "client-a"}


@pytest.mark.parametrize("operation", ["status", "sign-part", "complete", "abort"])
def test_revoked_app_cannot_read_sign_complete_or_cancel_existing_session(api, operation):
    assert post(api, "start", api[6]).status_code == 200
    api[3].reset_mock()
    api[2]["grant"] = False
    body = {key: api[6][key] for key in ("token", "session_id", "service")}
    if operation == "sign-part":
        body.update(part_number=1, checksum_sha256=base64.b64encode(hashlib.sha256(b"x").digest()).decode())
    assert post(api, operation, body).status_code == 403
    api[3].assert_not_called()


@pytest.mark.parametrize("change", ["account", "app", "service"])
def test_same_uuid_does_not_borrow_another_account_app_or_service_session(api, change):
    assert post(api, "start", api[6]).status_code == 200
    body = {key: api[6][key] for key in ("token", "session_id", "service")}
    origin = "https://social.example"
    if change == "account":
        body["token"] = api[5](username="bob")
    elif change == "app":
        origin = "https://another-app.example"
    else:
        body["service"] = "media"
    assert post(api, "status", body, origin).status_code == 404


def test_disabled_feature_and_client_selected_storage_are_denied(api, monkeypatch):
    body = {**api[6], "object_key": "bob/private", "upload_id": "foreign", "bucket": "state"}
    assert post(api, "start", body).status_code == 422
    api[3].assert_not_called()
    monkeypatch.setattr(settings, "RESUMABLE_UPLOADS_ENABLED", False)
    assert post(api, "start", api[6]).status_code == 404
    assert api[0].get("/v3/media/uploads/capabilities").json()["enabled"] is False
    api[3].assert_not_called()


def test_status_survives_a_crash_after_native_completion_before_result_recording(api):
    started = post(api, "start", api[6]).json()
    transport = api[3].return_value
    s3, content = api[1], api[7]
    owner = next(iter(s3.objects.values()))[0]
    from app.services.upload_sessions import UploadSession

    session = UploadSession.model_validate_json(owner)
    for index in range(0, len(content), 8):
        s3.add_part(started["upload_id"], index // 8 + 1, content[index : index + 8])
    parts = transport.parts(session)
    transport.store.advance(session.owner, session.session_id, session.revision, "completing")
    s3.complete_multipart_upload(
        Bucket="media", Key=session.object_key, UploadId=session.upload_id, MultipartUpload={"Parts": parts}
    )
    response = post(api, "status")
    assert response.status_code == 200
    assert response.json()["phase"] == "completing"
    assert post(api, "complete").json()["phase"] == "completed"


def test_known_final_checksum_failure_has_a_durable_observable_disposition(api):
    started = post(api, "start", api[6]).json()
    content = b"x" * len(api[7])
    for index in range(0, len(content), 8):
        api[1].add_part(started["upload_id"], index // 8 + 1, content[index : index + 8])
    assert post(api, "complete").status_code == 409
    status = post(api, "status")
    assert status.status_code == 200
    assert status.json()["phase"] == "failed"
    assert status.json()["failure_code"] == "verification_failed"


def test_confirmation_has_one_canonical_media_id_and_only_queues_owned_verified_source(api, monkeypatch):
    started = post(api, "start", api[6]).json()
    content = api[7]
    for index in range(0, len(content), 8):
        api[1].add_part(started["upload_id"], index // 8 + 1, content[index : index + 8])
    assert post(api, "complete").status_code == 200
    records = {}
    monkeypatch.setattr(multipart.ch, "get_document_version", lambda doc_id, author: records.get((doc_id, author)))

    def materialize(user, metadata, doc_id=None, version_time=None):
        doc = {"doc_id": doc_id, "author_key": user, "service": "media_metadata", "body": metadata}
        records[(doc_id, user)] = doc
        return doc

    confirm = Mock(side_effect=materialize)
    queue = Mock()
    monkeypatch.setattr(multipart.ch, "confirm_media_upload", confirm)
    monkeypatch.setattr(multipart.transcode, "submit_transcode_job", queue)
    first = post(api, "confirm").json()
    second = post(api, "confirm").json()
    assert first["doc_id"] == second["doc_id"] == started["object_key"].split("/")[1]
    confirm.assert_called_once()
    assert first["body"]["video"] == {"type": "minio", "value": started["object_key"]}
    assert first["body"]["checksum_sha256"] == hashlib.sha256(content).hexdigest()
    assert all(call.args == (first["doc_id"], "alice") for call in queue.call_args_list)
    # A later canonical tombstone must not recover an older ready version or
    # recreate confirmation under the original stable ID.
    records[(first["doc_id"], "alice")]["deleted"] = True
    assert post(api, "confirm").status_code == 409
    assert post(api, "retry-transcode").status_code == 404
    confirm.assert_called_once()


def test_unverified_upload_cannot_be_materialized_as_a_media_document(api, monkeypatch):
    assert post(api, "start", api[6]).status_code == 200
    confirm = Mock()
    monkeypatch.setattr(multipart.ch, "confirm_media_upload", confirm)
    assert post(api, "confirm").status_code == 409
    confirm.assert_not_called()


@pytest.mark.parametrize("later_change", ["deleted", "transcoded"])
def test_delayed_confirmation_cannot_outrank_a_later_canonical_change(api, monkeypatch, later_change):
    import json
    from types import SimpleNamespace

    started = post(api, "start", api[6]).json()
    for index in range(0, len(api[7]), 8):
        api[1].add_part(started["upload_id"], index // 8 + 1, api[7][index : index + 8])
    assert post(api, "complete").status_code == 200
    history = []
    inside = False
    queue = Mock()
    monkeypatch.setattr(multipart.transcode, "submit_transcode_job", queue)

    def latest(doc_id, author):
        if not history:
            return None
        row = max(history, key=lambda row: (row[7], row[8]))
        return {
            "doc_id": row[0],
            "author_key": row[1],
            "service": row[2],
            "body": json.loads(row[3]),
            "deleted": bool(row[8]),
        }

    def insert(table, rows):
        nonlocal inside
        if not inside:
            inside = True
            # A has observed absence and reached the actual insert sink. B
            # creates the same ID, then a later owner/worker edit lands.
            assert post(api, "confirm").status_code == 200
            changed = list(history[-1])
            changed[7] = datetime.now(UTC)
            if later_change == "deleted":
                changed[8] = 1
            else:
                body = json.loads(changed[3])
                body["transcoding_settings"] = {"enabled": True, "status": "done", "variants": [{"height": 360}]}
                changed[3] = json.dumps(body)
            history.append(changed)
        history.extend(rows)

    monkeypatch.setattr(multipart.ch, "get_document_version", latest)
    monkeypatch.setattr(multipart.ch, "client", SimpleNamespace(insert=insert))
    delayed = post(api, "confirm")
    canonical = latest(None, None)
    if later_change == "deleted":
        assert canonical["deleted"] is True
        assert delayed.status_code == 409
    else:
        assert canonical["body"]["transcoding_settings"]["status"] == "done"
        assert delayed.json()["body"]["transcoding_settings"]["status"] == "done"
    initial_rows = [row for row in history if row[8] == 0 and "transcoding_settings" not in json.loads(row[3])]
    assert len(initial_rows) == 2
    assert initial_rows[0][7] == initial_rows[1][7]
