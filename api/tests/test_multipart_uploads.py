import base64
import hashlib
from uuid import uuid4

import pytest

from app.services import multipart_uploads as module
from app.services.upload_sessions import (
    SessionConflict,
    SessionExpired,
    SessionMissing,
    UploadIntent,
    UploadOwner,
    UploadSessionStore,
)
from tests.multipart_support import MultipartS3


@pytest.fixture
def transfer(monkeypatch):
    monkeypatch.setattr(module, "PART_SIZE", 8)
    s3, now = MultipartS3(), [1000]
    store = UploadSessionStore(s3, "state", media_bucket="media", lifetime_seconds=60, clock=lambda: now[0])
    transport = module.MultipartUploads(store, s3, clock=lambda: now[0])
    owner = UploadOwner(node="node", issuer="node", username="alice", app_id="app")
    data = b"a full feature film"
    intent = UploadIntent(
        filename="film.mp4",
        mime_type="video/mp4",
        size_bytes=len(data),
        checksum_sha256=hashlib.sha256(data).hexdigest(),
    )
    record = transport.start(owner, uuid4().hex, intent)
    return transport, s3, now, owner, intent, record, data


def upload(transfer):
    transport, s3, _, _, _, record, data = transfer
    for index in range(0, len(data), module.PART_SIZE):
        s3.add_part(record.upload_id, index // module.PART_SIZE + 1, data[index : index + module.PART_SIZE])
    return transport.parts(record)


def test_start_is_idempotent_and_resume_lists_only_confirmed_parts(transfer):
    transport, s3, _, owner, intent, record, data = transfer
    assert transport.start(owner, record.session_id, intent) == record
    assert len(s3.uploads) == 1
    s3.add_part(record.upload_id, 1, data[:8])
    assert transport.parts(record)[0]["Size"] == 8
    assert len(transport.parts(record)) == 1
    assert transport.store.get(owner, record.session_id).object_key == record.object_key


def test_part_signature_binds_native_id_key_size_checksum_and_both_deadlines(transfer):
    transport, s3, now, owner, _, record, data = transfer
    checksum = base64.b64encode(hashlib.sha256(data[:8]).digest()).decode()
    result = transport.sign_part(owner, record.session_id, 1, checksum, credential_deadline=1007)
    assert result["expires"] == 7
    args, request = s3.signatures[-1]
    assert args == ("upload_part",)
    assert request["Params"] == {
        "Bucket": "media",
        "Key": record.object_key,
        "UploadId": record.upload_id,
        "PartNumber": 1,
        "ContentLength": 8,
        "ChecksumSHA256": checksum,
    }
    now[0] = record.expires_at
    with pytest.raises(SessionExpired):
        transport.sign_part(owner, record.session_id, 1, checksum, credential_deadline=2000)
    assert len(s3.signatures) == 1


@pytest.mark.parametrize("number, checksum", [(0, "bad"), (4, "bad"), (True, "bad"), (1, "invalid"), (1, "YQ==")])
def test_invalid_parts_never_receive_a_url(transfer, number, checksum):
    transport, s3, _, owner, _, record, _ = transfer
    with pytest.raises(ValueError):
        transport.sign_part(owner, record.session_id, number, checksum, credential_deadline=2000)
    assert not s3.signatures


def test_full_completion_verifies_bytes_and_replay_preserves_one_result(transfer):
    transport, s3, _, owner, _, record, data = transfer
    upload(transfer)
    result = transport.complete(owner, record.session_id)
    assert result.phase == "completed"
    assert s3.finals[record.object_key]["body"] == data
    assert transport.complete(owner, record.session_id) == result
    assert not s3.uploads
    with pytest.raises(SessionConflict):
        transport.abort(owner, record.session_id)


@pytest.mark.parametrize("corruption", ["missing", "wrong-size", "wrong-bytes"])
def test_incomplete_or_corrupted_upload_never_becomes_completed(transfer, corruption):
    transport, s3, _, owner, _, record, data = transfer
    upload(transfer)
    if corruption == "missing":
        s3.uploads[record.upload_id]["parts"].pop(2)
    elif corruption == "wrong-size":
        s3.uploads[record.upload_id]["parts"][2] = b"x"
    else:
        s3.uploads[record.upload_id]["parts"][1] = b"x" * 8
    with pytest.raises(SessionConflict):
        transport.complete(owner, record.session_id)
    assert transport.store.get(owner, record.session_id).phase != "completed"


def test_lost_native_completion_response_recovers_the_same_verified_object(transfer):
    transport, s3, _, owner, _, record, _ = transfer
    upload(transfer)
    s3.lost_completion = True
    completed = transport.complete(owner, record.session_id)
    assert completed.phase == "completed"
    assert transport.complete(owner, record.session_id) == completed


def test_expired_already_completed_object_is_observed_without_new_native_completion(transfer):
    transport, s3, now, owner, _, record, _ = transfer
    parts = upload(transfer)
    claimed = transport.store.advance(owner, record.session_id, record.revision, "completing")
    s3.complete_multipart_upload(
        Bucket="media", Key=record.object_key, UploadId=record.upload_id, MultipartUpload={"Parts": parts}
    )
    now[0] = claimed.expires_at
    assert transport.complete(owner, record.session_id).phase == "completed"


def test_abort_is_durable_idempotent_and_denies_new_parts(transfer):
    transport, s3, _, owner, _, record, _ = transfer
    aborted = transport.abort(owner, record.session_id)
    assert aborted.phase == "aborted" and not s3.uploads
    assert transport.abort(owner, record.session_id) == aborted
    with pytest.raises(SessionConflict):
        transport.complete(owner, record.session_id)
    with pytest.raises(SessionConflict):
        transport.sign_part(owner, record.session_id, 1, "x", credential_deadline=2000)


def test_foreign_scope_cannot_sign_complete_or_abort(transfer):
    transport, s3, _, owner, _, record, _ = transfer
    other = owner.model_copy(update={"username": "bob"})
    for operation in [
        lambda: transport.complete(other, record.session_id),
        lambda: transport.abort(other, record.session_id),
        lambda: transport.sign_part(other, record.session_id, 1, "x", credential_deadline=2000),
    ]:
        with pytest.raises(SessionMissing):
            operation()
    assert record.upload_id in s3.uploads and not s3.signatures
