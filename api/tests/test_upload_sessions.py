import io
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.services.upload_sessions import (
    MAX_RECORD_BYTES,
    SessionConflict,
    SessionCorrupt,
    SessionExpired,
    SessionMissing,
    UploadIntent,
    UploadOwner,
    UploadSessionStore,
)


class StorageError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}


class S3:
    def __init__(self):
        self.objects, self.writes, self.race = {}, [], False

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise StorageError("NoSuchKey")
        body, etag = self.objects[Key]
        self.body = io.BytesIO(body)
        return {"Body": self.body, "ETag": etag}

    def put_object(self, **args):
        self.writes.append(args)
        key = args["Key"]
        if self.race:
            body, _ = self.objects[key]
            self.objects[key] = body, "concurrent-etag"
            self.race = False
        if args.get("IfNoneMatch") == "*" and key in self.objects:
            raise StorageError("PreconditionFailed")
        if "IfMatch" in args and self.objects[key][1] != args["IfMatch"]:
            raise StorageError("PreconditionFailed")
        assert "IfNoneMatch" in args or "IfMatch" in args, "unconditional write"
        self.objects[key] = args["Body"], uuid4().hex


@pytest.fixture
def context():
    s3, now = S3(), [1000]
    store = UploadSessionStore(s3, "private-state", media_bucket="media", lifetime_seconds=60, clock=lambda: now[0])
    owner = UploadOwner(node="node-a", issuer="issuer-a", username="alice", app_id="app-a")
    intent = UploadIntent(filename="../movie.mp4", mime_type="video/mp4", size_bytes=514619769)
    return store, s3, now, owner, intent, uuid4().hex


def test_reservation_replay_is_stable_and_changed_intent_conflicts(context):
    store, s3, _, owner, intent, sid = context
    first = store.reserve(owner, sid, intent)
    assert store.reserve(owner, sid, intent) == first
    assert first.object_key.startswith("alice/") and first.object_key.endswith("/source")
    assert "movie" not in first.object_key and ".." not in first.object_key
    with pytest.raises(SessionConflict):
        store.reserve(owner, sid, intent.model_copy(update={"size_bytes": 1}))
    assert all(write["Bucket"] == "private-state" for write in s3.writes)


@pytest.mark.parametrize("field", ["node", "issuer", "username", "app_id"])
def test_owner_partition_cannot_read_or_mutate_namesake_session(context, field):
    store, _, _, owner, intent, sid = context
    record = store.reserve(owner, sid, intent)
    other = owner.model_copy(update={field: "other"})
    with pytest.raises(SessionMissing):
        store.get(other, sid)
    with pytest.raises(SessionMissing):
        store.advance(other, sid, record.revision, "aborted")
    theirs = store.reserve(other, sid, intent)
    assert theirs.object_key != record.object_key
    assert store.get(owner, sid) == record


def test_cas_race_and_old_revision_cannot_both_win(context):
    store, s3, _, owner, intent, sid = context
    record = store.reserve(owner, sid, intent)
    active = store.advance(owner, sid, record.revision, "uploading", upload_id="actual-upload")
    with pytest.raises(SessionConflict):
        store.advance(owner, sid, record.revision, "aborted")
    s3.race = True
    with pytest.raises(SessionConflict):
        store.advance(owner, sid, active.revision, "completing")
    assert store.get(owner, sid).phase == "uploading"
    completing = store.advance(owner, sid, active.revision, "completing")
    with pytest.raises(SessionConflict):
        store.advance(owner, sid, active.revision, "aborting")
    completed = store.advance(owner, sid, completing.revision, "completed", object_etag='"verified-object"')
    assert UploadSessionStore(s3, "private-state", media_bucket="media").get(owner, sid) == completed
    assert store.reserve(owner, sid, intent) == completed
    with pytest.raises(SessionConflict):
        store.advance(owner, sid, completed.revision, "aborted")


def test_exact_deadline_blocks_new_work_but_retains_status_and_abort(context):
    store, _, now, owner, intent, sid = context
    record = store.reserve(owner, sid, intent)
    now[0] = record.expires_at
    assert store.get(owner, sid) == record
    with pytest.raises(SessionExpired):
        store.reserve(owner, sid, intent)
    with pytest.raises(SessionExpired):
        store.advance(owner, sid, record.revision, "uploading", upload_id="mpu")
    aborted = store.advance(owner, sid, record.revision, "aborted")
    assert store.reserve(owner, sid, intent) == aborted
    with pytest.raises(SessionConflict):
        store.advance(owner, sid, aborted.revision, "uploading", upload_id="mpu")


def test_bound_upload_id_and_required_completion_result(context):
    store, _, _, owner, intent, sid = context
    record = store.reserve(owner, sid, intent)
    with pytest.raises(ValidationError):
        store.advance(owner, sid, record.revision, "uploading")
    active = store.advance(owner, sid, record.revision, "uploading", upload_id="mpu")
    with pytest.raises(SessionConflict):
        store.advance(owner, sid, active.revision, "completing", upload_id="different")
    completing = store.advance(owner, sid, active.revision, "completing")
    with pytest.raises(ValidationError):
        store.advance(owner, sid, completing.revision, "completed")


@pytest.mark.parametrize(
    "corruption", ["owner", "session_id", "object_key", "schema_version", "oversized", "invalid-json"]
)
def test_corrupt_or_misplaced_records_fail_closed_and_close_stream(context, corruption):
    store, s3, _, owner, intent, sid = context
    store.reserve(owner, sid, intent)
    key = next(iter(s3.objects))
    raw, etag = s3.objects[key]
    data = json.loads(raw)
    if corruption == "owner":
        data["owner"]["username"] = "bob"
    elif corruption == "session_id":
        data["session_id"] = uuid4().hex
    elif corruption == "object_key":
        data["object_key"] = "bob/stolen/source"
    elif corruption == "schema_version":
        data["schema_version"] = 2
    raw = (
        b"x" * (MAX_RECORD_BYTES + 1)
        if corruption == "oversized"
        else b"{"
        if corruption == "invalid-json"
        else json.dumps(data).encode()
    )
    s3.objects[key] = raw, etag
    with pytest.raises(SessionCorrupt):
        store.get(owner, sid)
    assert s3.body.closed


def test_limits_and_unsafe_bucket_are_rejected_before_writes(context):
    store, s3, _, owner, intent, sid = context
    with pytest.raises(ValueError):
        UploadSessionStore(s3, "media", media_bucket="media")
    with pytest.raises(ValueError):
        store.reserve(owner, sid, intent.model_copy(update={"size_bytes": 524288001}))
    with pytest.raises(ValidationError):
        UploadIntent(filename="film", mime_type="video/mp4", size_bytes=True)
    with pytest.raises(ValidationError):
        UploadOwner(node="node", issuer="issuer", username="alice/path", app_id="app")
    assert not s3.writes


def test_unknown_storage_errors_never_fall_back_to_unconditional_write(context, monkeypatch):
    store, s3, _, owner, intent, sid = context

    def unsupported(**kwargs):
        raise StorageError("NotImplemented")

    monkeypatch.setattr(s3, "put_object", unsupported)
    with pytest.raises(StorageError):
        store.reserve(owner, sid, intent)
    assert not s3.objects


def test_encoded_record_limit_is_enforced_before_storage_write(context):
    store, s3, _, _, _, sid = context
    owner = UploadOwner(node="😀" * 512, issuer="😀" * 512, username="😀" * 128, app_id="😀" * 512)
    intent = UploadIntent(filename="😀" * 255, mime_type="😀" * 127, size_bytes=100)
    record = store.reserve(owner, sid, intent)
    before = len(s3.writes)
    with pytest.raises(ValueError, match="encoded limit"):
        store.advance(owner, sid, record.revision, "uploading", upload_id="😀" * 2048)
    assert len(s3.writes) == before
    assert store.get(owner, sid) == record


def test_expiry_blocks_new_work_but_not_observation_of_already_completed_storage(context):
    store, _, now, owner, intent, sid = context
    record = store.reserve(owner, sid, intent)
    active = store.advance(owner, sid, record.revision, "uploading", upload_id="mpu")
    completing = store.advance(owner, sid, active.revision, "completing")
    now[0] = completing.expires_at
    with pytest.raises(SessionExpired):
        store.advance(owner, sid, completing.revision, "completed", object_etag="verified")
    completed = store.reconcile_completed(owner, sid, completing.revision, object_etag="verified")
    assert store.get(owner, sid) == completed
    assert completed.phase == "completed"
    with pytest.raises(SessionConflict):
        store.reconcile_completed(owner, sid, completed.revision, object_etag="different")


@pytest.mark.parametrize("phase", ["reserved", "uploading", "completed"])
def test_lowered_server_limit_does_not_destroy_existing_operation_replay(context, phase):
    store, s3, now, owner, intent, sid = context
    record = store.reserve(owner, sid, intent)
    if phase != "reserved":
        record = store.advance(owner, sid, record.revision, "uploading", upload_id="mpu")
    if phase == "completed":
        record = store.advance(owner, sid, record.revision, "completing")
        record = store.advance(owner, sid, record.revision, "completed", object_etag="verified")
    reduced = UploadSessionStore(
        s3, "private-state", media_bucket="media", max_size=intent.size_bytes - 1, clock=lambda: now[0]
    )
    assert reduced.get(owner, sid) == record
    assert reduced.reserve(owner, sid, intent) == record
    with pytest.raises(ValueError):
        reduced.reserve(owner, uuid4().hex, intent)
    with pytest.raises(SessionConflict):
        reduced.reserve(owner, sid, intent.model_copy(update={"filename": "changed.mp4"}))


@pytest.mark.parametrize("upload_chars, accepted", [(1600, False), (1300, True)])
def test_bound_upload_reserves_space_for_largest_encoded_completion_result(context, upload_chars, accepted):
    store, _, _, _, _, sid = context
    owner = UploadOwner(node="😀" * 512, issuer="😀" * 512, username="😀" * 128, app_id="😀" * 512)
    intent = UploadIntent(filename="😀" * 255, mime_type="😀" * 127, size_bytes=100)
    record = store.reserve(owner, sid, intent)
    if not accepted:
        with pytest.raises(ValueError, match="encoded limit"):
            store.advance(owner, sid, record.revision, "uploading", upload_id="😀" * upload_chars)
        assert store.get(owner, sid) == record
    else:
        active = store.advance(owner, sid, record.revision, "uploading", upload_id="😀" * upload_chars)
        completing = store.advance(owner, sid, active.revision, "completing")
        completed = store.advance(owner, sid, completing.revision, "completed", object_etag="\x00" * 256)
        assert store.get(owner, sid) == completed


def test_server_generated_raw_key_obeys_s3_encoded_byte_limit(context):
    store, s3, _, owner, intent, sid = context
    with pytest.raises(ValueError):
        store.reserve(owner.model_copy(update={"username": "😀" * 256}), sid, intent)
    assert not s3.writes
