"""Object-tree safety, independent of delegated auth and query provenance."""

import copy
import json
from datetime import datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException

import app.settings as settings
from app.services import hls
from app.v3.endpoints import media
from app.v3.models import ConfirmMedia, ReadUrlRequest, UploadUrlRequest
from app.v3.services import clickhouse as ch


@pytest.fixture
def token():
    return jwt.encode(
        {
            "username": "alice",
            "site": "auth.localhost",
            "provider": settings.PROVIDER,
            "target": settings.PROVIDER,
            "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
        },
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )


@pytest.fixture
def storage():
    with (
        patch.object(media, "ensure_bucket") as bucket,
        patch.object(media, "get_s3_client") as internal,
        patch.object(media, "get_s3_signing_client") as signer,
    ):
        internal.return_value.head_object.return_value = {"ContentLength": 123}
        signer.return_value.generate_presigned_post.return_value = {"url": "synthetic-upload", "fields": {}}
        signer.return_value.generate_presigned_url.return_value = "synthetic-read"
        yield bucket, internal, signer


@pytest.mark.parametrize(
    "key",
    ["victim/id/raw", "alice2/id/raw", "alice/../raw", "alice/id/../../raw", "alice//raw", "alice/raw\n",
     "alice/id\\raw", "alice/./raw", "alice/raw/", None, 123],
)
def test_object_tree_rejects_foreign_and_malformed_keys(key):
    assert not hls.owns_object_key("alice", key)


def test_object_tree_accepts_owned_opaque_key():
    assert hls.owns_object_key("alice", "alice/id/a file.mp4")
    assert not hls.owns_object_key("", "alice/id/raw")


@pytest.mark.parametrize("key", ["victim/id/raw", "alice2/id/raw", "alice/../raw", "alice/raw\n", 123])
def test_raw_read_rejects_unsafe_key_before_storage(token, storage, key):
    bucket, internal, signer = storage
    with pytest.raises(HTTPException) as exc:
        media.read_url(ReadUrlRequest(token=token, body={"object_key": key}))
    assert exc.value.status_code == 403
    bucket.assert_not_called()
    internal.assert_not_called()
    signer.assert_not_called()


def test_owned_raw_read_needs_no_metadata_record(token, storage):
    _, _, signer = storage
    with patch.object(ch, "client") as db:
        response = media.read_url(ReadUrlRequest(token=token, body={"object_key": "alice/id/raw"}))
    assert response["read_url"] == "synthetic-read"
    assert signer.return_value.generate_presigned_url.call_args.kwargs["Params"]["Key"] == "alice/id/raw"
    db.query.assert_not_called()


@pytest.mark.parametrize("filename", ["../raw", "a/b", "a\\b", ".", "..", "a\n", "", None, 123])
def test_upload_rejects_filename_before_storage(token, storage, filename):
    bucket, internal, signer = storage
    with pytest.raises(HTTPException) as exc:
        media.upload_url(UploadUrlRequest(token=token, body={"filename": filename}))
    assert exc.value.status_code == 400
    bucket.assert_not_called()
    internal.assert_not_called()
    signer.assert_not_called()


@pytest.mark.parametrize("service", ["notes", "", None, 123, []])
def test_upload_rejects_non_media_service(token, storage, service):
    with pytest.raises(HTTPException) as exc:
        media.upload_url(UploadUrlRequest(token=token, body={"filename": "raw", "service": service}))
    assert exc.value.status_code == 400
    storage[2].assert_not_called()


@pytest.mark.parametrize("service", [None, "media_metadata", "public_media"])
def test_upload_policy_has_owned_key_and_byte_bounds(token, storage, service):
    body = {"filename": "raw.mp4", "mime_type": "video/mp4"}
    if service is not None:
        body["service"] = service
    response = media.upload_url(UploadUrlRequest(token=token, body=body))
    assert hls.owns_object_key("alice", response["object_key"])
    call = storage[2].return_value.generate_presigned_post.call_args
    assert call.args == (settings.S3_BUCKET, response["object_key"])
    assert call.kwargs["Conditions"] == [
        {"Content-Type": "video/mp4"}, ["content-length-range", 1, hls.MAX_MEDIA_BYTES]
    ]
    assert hls.MAX_MEDIA_BYTES == max(1, min(settings.MAX_UPLOAD_SIZE, 1024 * 1024 * 1024))


@pytest.mark.parametrize(
    "extra",
    [
        {"object_key": "victim/raw"},
        {"thumbnail_object_key": "victim/thumb"},
        {"video": {"type": "minio", "value": "victim/raw"}},
        {"nested": [{"variants": [{"url": {"type": "minio", "value": "victim/hls/index"}}]}]},
        {"object_key": None},
    ],
)
def test_confirm_rejects_foreign_metadata_before_head_or_insert(token, storage, extra):
    with patch.object(ch, "client") as db:
        with pytest.raises(HTTPException) as exc:
            media.confirm_media(ConfirmMedia(token=token, body={"object_key": "alice/id/raw", **extra}))
    assert exc.value.status_code == 403
    storage[1].assert_not_called()
    db.insert.assert_not_called()


def test_confirmation_service_layer_also_rejects_foreign_nested_key():
    with patch.object(ch, "client") as db:
        with pytest.raises(HTTPException):
            ch.confirm_media_upload("alice", {"object_key": "alice/raw", "video": {"type": "minio", "value": "bob/raw"}})
    db.insert.assert_not_called()


@pytest.mark.parametrize("size", [0, min(settings.MAX_UPLOAD_SIZE, 1024 * 1024 * 1024) + 1])
@pytest.mark.parametrize("thumbnail", [False, True])
def test_confirm_rejects_actual_size_before_insert(token, storage, size, thumbnail):
    body = {"object_key": "alice/id/raw"}
    if thumbnail:
        body["thumbnail_object_key"] = "alice/id/thumb"
    storage[1].return_value.head_object.side_effect = (
        [{"ContentLength": 123}, {"ContentLength": size}] if thumbnail else [{"ContentLength": size}]
    )
    with patch.object(ch, "client") as db:
        with pytest.raises(HTTPException) as exc:
            media.confirm_media(ConfirmMedia(token=token, body=body))
    assert exc.value.status_code == 413
    db.insert.assert_not_called()


@pytest.mark.parametrize("thumbnail", [False, True])
def test_confirm_missing_object_does_not_echo_storage_error(token, storage, thumbnail):
    body = {"object_key": "alice/id/raw"}
    if thumbnail:
        body["thumbnail_object_key"] = "alice/id/thumb"
    storage[1].return_value.head_object.side_effect = (
        [{"ContentLength": 123}, RuntimeError("private-storage-error")]
        if thumbnail else RuntimeError("private-storage-error")
    )
    with patch.object(ch, "client") as db:
        with pytest.raises(HTTPException) as exc:
            media.confirm_media(ConfirmMedia(token=token, body=body))
    assert exc.value.status_code == 400
    assert "private-storage-error" not in exc.value.detail
    db.insert.assert_not_called()


@pytest.mark.parametrize("size", [1, min(settings.MAX_UPLOAD_SIZE, 1024 * 1024 * 1024)])
def test_confirm_valid_objects_preserves_document_envelope(token, storage, size):
    storage[1].return_value.head_object.return_value = {"ContentLength": size}
    body = {"object_key": "alice/id/raw", "thumbnail_object_key": "alice/id/thumb", "width": 640}
    with patch.object(ch, "client") as db:
        response = media.confirm_media(ConfirmMedia(token=token, body=body))
    assert response["author_key"] == "alice"
    assert response["service"] == "media_metadata"
    assert response["body"] == body
    assert response["doc_id"] and response["created_at"] and response["updated_at"]
    assert len(db.insert.call_args.args[1][0]) == 11
    assert [call.kwargs["Key"] for call in storage[1].return_value.head_object.call_args_list] == [
        "alice/id/raw", "alice/id/thumb"
    ]


@pytest.mark.parametrize("slot", ["body", "ad", "node_ad"])
def test_recursive_resolution_rejects_foreign_keys_and_strips_stale_url(slot):
    body = {"nested": [{"video": {"type": "minio", "value": "victim/id/raw", "url": "stale"}}]}
    doc = {"author_key": "alice", "body": body if slot == "body" else {}}
    if slot != "body":
        doc[slot] = {"author_key": "alice", "body": body}
    original = copy.deepcopy(doc)
    with patch.object(ch, "get_s3_signing_client") as signer:
        response = ch.resolve_media_urls_in_docs([doc])[0]
    resolved = response["body"] if slot == "body" else response[slot]["body"]
    assert "url" not in resolved["nested"][0]["video"]
    signer.return_value.generate_presigned_url.assert_not_called()
    assert doc == original


def test_nested_ads_resolve_against_their_own_author():
    doc = {"author_key": "alice", "body": {"video": {"type": "minio", "value": "alice/raw"}}}
    for slot, author in [("ad", "bob"), ("node_ad", "operator")]:
        doc[slot] = {"author_key": author, "body": {"video": {"type": "minio", "value": author + "/raw"}}}
    with patch.object(ch, "get_s3_signing_client") as signer:
        ch.resolve_media_urls_in_docs([doc])
    assert [call.kwargs["Params"]["Key"] for call in signer.return_value.generate_presigned_url.call_args_list] == [
        "alice/raw", "bob/raw", "operator/raw"
    ]


@pytest.mark.parametrize("slot", ["body", "ad", "node_ad"])
def test_resolved_metadata_rejects_foreign_nested_keys(slot):
    body = {"media_refs": ["m1"]}
    doc = {"author_key": "alice", "body": body if slot == "body" else {}}
    if slot != "body":
        doc[slot] = {"author_key": "alice", "body": body}
    metadata = {"object_key": "alice/raw", "nested": [{"type": "minio", "value": "victim/raw"}]}
    with patch.object(ch, "client") as db, patch.object(ch, "get_s3_signing_client") as signer:
        db.query.return_value.result_rows = [("m1", json.dumps(metadata), "media_metadata")]
        response = ch.resolve_media_urls_in_docs([doc])[0]
    resolved = response["body"] if slot == "body" else response[slot]["body"]
    assert resolved["media_refs"][0]["read_url"] is None
    signer.assert_not_called()


def test_legacy_url_only_metadata_still_resolves_without_signing():
    with patch.object(ch, "client") as db, patch.object(ch, "get_s3_signing_client") as signer:
        db.query.return_value.result_rows = [("m1", json.dumps({"url": "legacy-image"}), "media_metadata")]
        response = ch.resolve_media_urls({"media_refs": ["m1"]}, "alice")
    assert response["media_refs"][0]["read_url"] == "legacy-image"
    signer.assert_not_called()


def test_missing_author_cannot_sign_nested_object():
    with patch.object(ch, "get_s3_signing_client") as signer:
        response = ch.resolve_minio_types({"video": {"type": "minio", "value": "alice/raw", "url": "stale"}}, None)
    assert "url" not in response["video"]
    signer.return_value.generate_presigned_url.assert_not_called()


def test_owned_referenced_metadata_signs_object_and_thumbnail():
    metadata = {"object_key": "alice/raw", "thumbnail_object_key": "alice/thumb", "width": 640}
    with patch.object(ch, "client") as db, patch.object(ch, "get_s3_signing_client") as signer:
        db.query.return_value.result_rows = [("m1", json.dumps(metadata), "media_metadata")]
        signer.return_value.generate_presigned_url.side_effect = ["synthetic-raw", "synthetic-thumb"]
        response = ch.resolve_media_urls({"media_refs": ["m1"]}, "alice")
    assert [call.kwargs["Params"]["Key"] for call in signer.return_value.generate_presigned_url.call_args_list] == [
        "alice/raw", "alice/thumb"
    ]
    ref = response["media_refs"][0]
    assert ref["read_url"] == "synthetic-raw"
    assert ref["thumbnail_url"] == "synthetic-thumb"
    assert ref["width"] == 640
