"""Media object references are data, never authority over another owner's tree."""

import base64
import hashlib
import hmac
import json
import queue
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException

import app.settings as settings
from app.services import hls, transcode
from app.v3.endpoints import media
from app.v3.services import clickhouse as ch


@pytest.fixture(autouse=True)
def isolate_object_key_rules():
    # Signed HTTP delegation is exercised without auth mocks in
    # test_delegation_surfaces.py; these tests isolate storage/path safety.
    with patch.object(media, "require_app_permission"):
        yield


@pytest.fixture
def signing(monkeypatch):
    monkeypatch.setenv("HLS_SIGNING_KEY", "a-dedicated-hls-secret-at-least-32-bytes")


@pytest.mark.parametrize(
    "key",
    [
        "victim/id/raw.mp4",
        "alice2/id/raw.mp4",
        "alice/../victim/raw",
        "alice/id/../../raw",
        "alice//raw",
        "alice/id/raw\n",
        None,
        123,
    ],
)
def test_foreign_or_malformed_keys_denied(key):
    assert not hls.owns_object_key("alice", key)


def test_direct_read_does_not_sign_victim():
    with patch.object(media, "_user", return_value="alice"), patch.object(media, "get_s3_signing_client") as s3:
        with pytest.raises(HTTPException) as exc:
            media.read_url(SimpleNamespace(body={"object_key": "victim/id/raw.mp4"}))
    assert exc.value.status_code == 403
    s3.assert_not_called()


def test_upload_policy_bounds_bytes_and_exact_key():
    s3 = MagicMock()
    s3.generate_presigned_post.return_value = {"url": "upload", "fields": {}}
    with (
        patch.object(media, "_user", return_value="alice"),
        patch.object(media, "ensure_bucket"),
        patch.object(media, "get_s3_client"),
        patch.object(media, "get_s3_signing_client", return_value=s3),
    ):
        result = media.upload_url(SimpleNamespace(body={"filename": "raw.mp4"}))
    assert hls.owns_object_key("alice", result["object_key"])
    assert ["content-length-range", 1, hls.MAX_MEDIA_BYTES] in s3.generate_presigned_post.call_args.kwargs["Conditions"]


@pytest.mark.parametrize("name", ["../victim", "a/b", "a\\b", "..", "a\n"])
def test_upload_filename_cannot_escape(name):
    with patch.object(media, "_user", return_value="alice"):
        with pytest.raises(HTTPException):
            media.upload_url(SimpleNamespace(body={"filename": name}))


@pytest.mark.parametrize(
    "extra",
    [
        {"object_key": "victim/raw"},
        {"thumbnail_object_key": "victim/thumb"},
        {"video": {"type": "minio", "value": "victim/raw"}},
        {"transcoding_settings": {"variants": [{"url": {"type": "minio", "value": "victim/hls/index"}}]}},
    ],
)
def test_confirm_rejects_all_foreign_references(extra):
    with patch.object(ch, "client") as db:
        with pytest.raises(HTTPException):
            ch.confirm_media_upload("alice", {"object_key": "alice/id/raw", **extra})
        db.insert.assert_not_called()


@pytest.mark.parametrize("size", [0, hls.MAX_MEDIA_BYTES + 1])
def test_confirm_checks_actual_object_size(size):
    s3 = MagicMock()
    s3.head_object.return_value = {"ContentLength": size}
    with (
        patch.object(media, "_user", return_value="alice"),
        patch.object(media, "get_s3_client", return_value=s3),
        patch.object(ch, "confirm_media_upload") as confirm,
    ):
        with pytest.raises(HTTPException) as exc:
            media.confirm_media(SimpleNamespace(body={"object_key": "alice/id/raw"}))
    assert exc.value.status_code == 413
    confirm.assert_not_called()


def test_generic_document_minio_cannot_sign_foreign_key():
    body = {"video": {"type": "minio", "value": "victim/id/raw", "url": "stale"}}
    s3 = MagicMock()
    with patch.object(ch, "get_s3_signing_client", return_value=s3):
        result = ch.resolve_media_urls_in_docs([{"author_key": "alice", "body": body}])
    s3.generate_presigned_url.assert_not_called()
    assert "url" not in result[0]["body"]["video"]


def test_resolution_uses_canonical_author_not_reader():
    s3 = MagicMock()
    with patch.object(ch, "get_s3_signing_client", return_value=s3):
        ch.resolve_media_urls_in_docs(
            [{"author_key": "victim", "body": {"video": {"type": "minio", "value": "victim/id/raw"}}}]
        )
    assert s3.generate_presigned_url.call_args.kwargs["Params"]["Key"] == "victim/id/raw"


def test_forged_metadata_cannot_sign_victim():
    db = MagicMock()
    db.query.return_value.result_rows = [("m1", json.dumps({"object_key": "victim/raw"}), "media_metadata")]
    with patch.object(ch, "client", db), patch.object(ch, "get_s3_signing_client") as s3:
        result = ch.resolve_media_urls({"media_refs": ["m1"]}, "alice")
    s3.assert_not_called()
    assert result["media_refs"][0]["read_url"] is None


def test_worker_and_endpoint_reject_victim_before_io():
    doc = {
        "author_key": "alice",
        "service": "media_metadata",
        "body": {"video": {"type": "minio", "value": "victim/id/raw"}},
    }
    with (
        patch.object(ch, "get_document", return_value=doc),
        patch.object(transcode.media_svc, "get_s3_client") as s3,
        patch.object(media, "_user", return_value="alice"),
        patch.object(transcode, "submit_transcode_job") as submit,
    ):
        with pytest.raises(RuntimeError, match="not owned"):
            transcode._process_job("d1", "alice")
        with pytest.raises(HTTPException):
            media.transcode_media(SimpleNamespace(doc_id="d1"))
    s3.assert_not_called()
    submit.assert_not_called()


def test_queue_full_is_nonblocking():
    bounded = queue.Queue(maxsize=1)
    bounded.put(("d1", "alice"))
    with patch.object(transcode, "_job_queue", bounded), patch.object(transcode, "_ensure_started"):
        with pytest.raises(queue.Full):
            transcode.submit_transcode_job("d2", "alice")


def test_empty_secret_fails_closed(monkeypatch):
    monkeypatch.delenv("HLS_SIGNING_KEY", raising=False)
    monkeypatch.setattr(settings, "PRIVATE_KEY", "")
    with pytest.raises(ValueError, match="not configured"):
        hls.mint_sig("alice", "d1", "alice/id/hls")
    unsigned = jwt.encode(
        {"username": "alice", "doc_id": "d1", "prefix": "victim/id/hls"},
        "test-secret-32-bytes-long-for-forgery",
        algorithm="HS256",
    ).rsplit(".", 1)[0]
    forged = (
        unsigned
        + "."
        + base64.urlsafe_b64encode(hmac.new(b"", unsigned.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    )
    with pytest.raises(ValueError, match="not configured"):
        hls.verify_sig(forged, "d1")


def test_dedicated_secret_and_document_binding(signing, monkeypatch):
    monkeypatch.setattr(settings, "PRIVATE_KEY", "")
    sig = hls.mint_sig("bob", "d1", "alice/id/hls")
    assert hls.verify_sig(sig, "d1")["prefix"] == "alice/id/hls"
    with pytest.raises(ValueError, match="does not match"):
        hls.verify_sig(sig, "d2")
    doc = {"author_key": "alice", "body": {"video": {"value": "alice/other/raw"}}}
    with patch.object(media, "can_view_doc", return_value=doc):
        with pytest.raises(HTTPException, match="403"):
            media._hls_doc("d1", sig)


def test_variant_cannot_fetch_foreign_manifest(signing):
    sig = hls.mint_sig("bob", "d1", "alice/id/hls")
    doc = {
        "author_key": "alice",
        "body": {
            "video": {"value": "alice/id/raw"},
            "transcoding_settings": {"variants": [{"height": 360, "url": {"value": "victim/id/hls/360p/index.m3u8"}}]},
        },
    }
    with patch.object(media, "can_view_doc", return_value=doc), patch.object(media, "get_s3_client") as s3:
        with pytest.raises(HTTPException):
            media.hls_variant("d1", "360p", sig)
    s3.assert_not_called()


def test_membership_without_read_permission_denied():
    doc = {"author_key": "alice", "service": "media_metadata", "body": {}}
    with (
        patch.object(ch, "get_document_any_author", return_value=doc),
        patch.object(ch, "get_doc_groups", return_value=["g"]),
        patch.object(ch, "can_read_group", return_value=False),
        patch.object(ch, "can_read_carrier_post", return_value=False),
    ):
        assert hls.can_view_doc("d1", "bob", True) is None


def test_ffmpeg_disallows_network_protocols():
    with patch.object(transcode.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
        transcode._run_ffmpeg(["-i", "/tmp/raw", "/tmp/out.mp4"], "test")
    cmd = run.call_args.args[0]
    assert cmd[cmd.index("-protocol_whitelist") + 1] == "file,pipe"


def test_carrier_requires_canonical_read_and_current_refs():
    db = MagicMock()
    db.query.return_value.result_rows = [("carrier", "notes")]
    with (
        patch.object(ch, "client", db),
        patch.object(ch, "read_document_by_id", return_value=None) as read,
        patch.object(ch, "can_read_group") as gate,
    ):
        assert not ch.can_read_carrier_post("m1", "alice", "bob", True)
    read.assert_called_once_with("carrier", "bob", "notes", True)
    gate.assert_not_called()
    sql = db.query.call_args.args[0]
    assert sql.index("WHERE rn = 1") < sql.index("has(JSONExtractArrayRaw")


def test_carrier_uses_actual_service():
    db = MagicMock()
    db.query.return_value.result_rows = [("carrier", "notes")]
    with (
        patch.object(ch, "client", db),
        patch.object(ch, "read_document_by_id", return_value={"doc_id": "carrier"}),
        patch.object(ch, "get_doc_groups", return_value=["g"]),
        patch.object(ch, "can_read_group", return_value=True) as gate,
    ):
        assert ch.can_read_carrier_post("m1", "alice", "bob", True)
    gate.assert_called_once_with("g", "bob", "notes", True)


@pytest.mark.parametrize("variant,seg", [("360p\n", "seg1.ts"), ("360p", "seg1.ts\n")])
def test_segment_names_must_match_entire_component(variant, seg):
    with pytest.raises(ValueError):
        hls.segment_key("alice/id/hls", variant, seg)


def test_short_dedicated_key_cannot_fall_back(monkeypatch):
    monkeypatch.setenv("HLS_SIGNING_KEY", "short")
    monkeypatch.setattr(settings, "PRIVATE_KEY", "configured-legacy-secret-over-32-bytes")
    with pytest.raises(ValueError, match="at least 32"):
        hls.mint_sig("alice", "d1", "alice/id/hls")


def test_sig_requires_expiration(signing):
    sig = jwt.encode(
        {"username": "alice", "doc_id": "d1", "prefix": "alice/id/hls", "iat": 1},
        "a-dedicated-hls-secret-at-least-32-bytes",
        algorithm="HS256",
    )
    with pytest.raises(ValueError, match="invalid or expired"):
        hls.verify_sig(sig, "d1")
