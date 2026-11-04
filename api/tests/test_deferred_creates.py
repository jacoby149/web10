import json
import os
import time
from datetime import UTC, datetime
from unittest.mock import Mock
from uuid import uuid4

import pytest

import app.settings as settings
from app.services.deferred_store import CreateIntent, DeferredStore
from app.services.deferred_worker import process_job
from app.services.upload_sessions import SessionConflict, UploadOwner
from app.v3.services import clickhouse as ch
from tests.test_upload_sessions import S3


@pytest.fixture
def deferred(monkeypatch):
    monkeypatch.setattr(settings, "PROVIDER", "node")
    s3, store = S3(), None
    store = DeferredStore(s3, "state")
    owner = UploadOwner(
        node="node", issuer="node", username="alice", app_id=json.dumps(["origin", "https://app", "notes"])
    )
    intent = CreateIntent(
        service="notes", body={"text": "Wait for the recording", "media_refs": ["media"]}, groups=["destination"]
    )
    documents, attachments, state, authority = {}, {}, {}, {"app": True, "group": True}
    media = {
        "doc_id": "media",
        "author_key": "alice",
        "service": "media_metadata",
        "body": {"transcoding_settings": state, "video": {"type": "minio", "value": "alice/upload/video.mp4"}},
    }
    monkeypatch.setattr(ch, "get_user", lambda _: {"username": "alice"})
    monkeypatch.setattr(ch, "has_permission", lambda *args, **kwargs: authority["app"])
    monkeypatch.setattr(
        ch,
        "get_document",
        lambda doc_id, author: media if doc_id == "media" and author == "alice" else documents.get((doc_id, author)),
    )
    monkeypatch.setattr(ch, "get_doc_groups", lambda doc_id: attachments.get(doc_id, []))
    monkeypatch.setattr(ch, "get_document_version", lambda doc_id, author: ch.get_document(doc_id, author))
    from app.services import transcode

    monkeypatch.setattr(transcode, "submit_transcode_job", Mock())
    can_write = Mock(side_effect=lambda *args: authority["group"])
    monkeypatch.setattr(ch, "can_write_group", can_write)

    def insert(**kwargs):
        doc = {"doc_id": kwargs["doc_id"], **kwargs}
        documents[(doc["doc_id"], doc["author_key"])] = doc
        return doc

    inserted = Mock(side_effect=insert)
    monkeypatch.setattr(ch, "insert_document", inserted)
    monkeypatch.setattr(
        ch, "attach_doc_to_groups", lambda doc_id, groups, **kwargs: attachments.update({doc_id: groups})
    )
    job = store.submit(owner, uuid4().hex, intent, ["media"])
    return store, owner, job, state, authority, documents, attachments, inserted, can_write


def ready(state):
    state.update(status="done", enabled=True, variants=[{"height": 360}])


def test_waits_for_hls_then_creates_one_generic_document_without_a_browser_or_token(deferred):
    store, owner, job, state, _, _, _, inserted, _ = deferred
    assert process_job(store, job).phase == "waiting"
    inserted.assert_not_called()
    ready(state)
    done = process_job(store, store.get(owner, job.operation_id))
    assert done.phase == "done"
    assert process_job(store, done) == done
    inserted.assert_called_once()
    assert inserted.call_args.kwargs["posted_by"] == "alice"
    assert inserted.call_args.kwargs["service"] == "notes"  # not a social-only primitive
    assert inserted.call_args.kwargs["doc_id"] == job.doc_id
    assert inserted.call_args.kwargs["version_time"].tzinfo is not None
    assert "token" not in store.get(owner, job.operation_id).model_dump_json()


@pytest.mark.parametrize("leg", ["app", "group"])
def test_current_authority_loss_blocks_without_personal_or_audience_fallback(deferred, leg):
    store, owner, job, state, authority, _, _, inserted, _ = deferred
    ready(state)
    authority[leg] = False
    blocked = process_job(store, job)
    assert blocked.phase == "blocked"
    inserted.assert_not_called()
    authority[leg] = True
    retried = store.change(blocked, "waiting")
    assert process_job(store, retried).phase == "done"


def test_group_author_uses_its_own_external_grants_and_keeps_the_human_audit_actor(deferred, monkeypatch):
    store, owner, _, state, _, _, _, inserted, can_write = deferred
    monkeypatch.setattr(ch, "get_group", lambda _: {"group_id": "team"})
    monkeypatch.setattr(ch, "effective_role_perms", lambda *args, **kwargs: {"notes": ["create"]})
    monkeypatch.setattr(
        ch, "_effective_allows", lambda permissions, service, operation: operation in permissions.get(service, [])
    )
    intent = CreateIntent(service="notes", body={}, groups=["team", "external"], author_as="team")
    job = store.submit(owner, uuid4().hex, intent, ["media"])
    ready(state)
    assert process_job(store, job).phase == "done"
    assert ("external", "team", "notes") in [call.args for call in can_write.call_args_list]
    assert inserted.call_args.kwargs["author_key"] == "team"
    assert inserted.call_args.kwargs["posted_by"] == "alice"


def test_cancel_before_admission_and_late_worker_cannot_resurrect_the_operation(deferred):
    store, owner, job, state, _, _, _, inserted, _ = deferred
    ready(state)
    store.cancel(owner, job.operation_id)
    with pytest.raises(SessionConflict):
        process_job(store, job)
    inserted.assert_not_called()
    operation = uuid4().hex
    tombstone = store.cancel(owner, operation)
    assert store.submit(owner, operation, job.intent, job.dependencies) == tombstone
    assert process_job(store, tombstone).phase == "cancelled"


def test_restart_after_document_write_observes_the_same_result_and_never_overwrites_edits(deferred, monkeypatch):
    store, owner, job, state, _, documents, _, inserted, _ = deferred
    ready(state)
    original = store.change

    def lost_result(record, phase, **kwargs):
        if phase == "done":
            raise ConnectionError("simulated interruption before result recording")
        return original(record, phase, **kwargs)

    monkeypatch.setattr(store, "change", lost_result)
    with pytest.raises(ConnectionError):
        process_job(store, job)
    existing = documents[(job.doc_id, "alice")]
    existing["body"] = {"text": "A newer human edit"}
    monkeypatch.setattr(store, "change", original)
    done = process_job(store, store.get(owner, job.operation_id))
    assert done.phase == "done" and done.doc_id == job.doc_id
    assert existing["body"]["text"] == "A newer human edit"
    inserted.assert_called_once()


def test_partial_existing_publication_requires_review_without_reattaching_groups(deferred):
    store, _, job, state, _, documents, attachments, inserted, _ = deferred
    ready(state)
    creating = store.change(job, "creating")
    documents[(job.doc_id, "alice")] = {"doc_id": job.doc_id, "service": "notes", "posted_by": "alice"}
    attachments[job.doc_id] = []
    result = process_job(store, creating)
    assert result.phase == "blocked" and result.error == "existing_result_requires_review"
    assert attachments[job.doc_id] == []
    inserted.assert_not_called()


def test_dependency_failure_and_expiry_are_observable_without_creating_a_placeholder(deferred, monkeypatch):
    store, owner, job, state, _, _, _, inserted, _ = deferred
    state["status"] = "failed"
    result = process_job(store, job)
    assert result.phase == "failed" and result.error == "media_preparation_failed"
    expired = store.submit(owner, uuid4().hex, job.intent, job.dependencies)
    from app.services import deferred_worker

    clock = Mock(wraps=datetime)
    clock.now.return_value = expired.expires_at
    monkeypatch.setattr(deferred_worker, "datetime", clock)
    result = process_job(store, expired)
    assert result.phase == "failed" and result.error == "operation_expired"
    inserted.assert_not_called()


def test_reused_operation_id_with_different_intent_conflicts_and_owner_changes_hide_it(deferred):
    store, owner, job, _, _, _, _, _, _ = deferred
    assert store.submit(owner, job.operation_id, job.intent, job.dependencies) == job
    with pytest.raises(SessionConflict):
        store.submit(
            owner, job.operation_id, job.intent.model_copy(update={"body": {"different": True}}), job.dependencies
        )
    from app.services.upload_sessions import SessionMissing

    with pytest.raises(SessionMissing):
        store.get(owner.model_copy(update={"username": "bob"}), job.operation_id)


def test_claim_cannot_be_cancelled_via_another_workers_failure(deferred, monkeypatch):
    from app.v3.endpoints import documents as endpoints

    store, owner, job, state, _, _, _, inserted, _ = deferred
    ready(state)
    create = endpoints.create_as
    outcomes = []

    def interleaved(*args, **kwargs):
        state["status"] = "failed"
        failed = process_job(store, store.get(owner, job.operation_id))
        assert failed.phase == "failed"
        try:
            store.cancel(owner, job.operation_id)
            outcomes.append("cancelled")
        except SessionConflict:
            outcomes.append("claim_already_won")
        return create(*args, **kwargs)

    monkeypatch.setattr(endpoints, "create_as", interleaved)
    with pytest.raises(SessionConflict):
        process_job(store, job)
    assert outcomes == ["claim_already_won"]
    assert store.get(owner, job.operation_id).phase != "cancelled"
    inserted.assert_called_once()
    # Nor can retrying the failed claimed operation reopen cancellation.
    waiting = store.change(store.get(owner, job.operation_id), "waiting")
    with pytest.raises(SessionConflict):
        store.change(waiting, "cancelled")


def test_publication_epoch_does_not_shift_with_process_timezone(deferred):
    store, _, job, state, _, _, _, inserted, _ = deferred
    ready(state)
    previous = os.environ.get("TZ")
    try:
        os.environ["TZ"] = "America/Los_Angeles"
        time.tzset()
        done = process_job(store, job)
        stamp = inserted.call_args.kwargs["version_time"]
        assert stamp.timestamp() == done.publish_at.timestamp()
        assert stamp.utcoffset() == UTC.utcoffset(stamp)
    finally:
        if previous is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = previous
        time.tzset()


@pytest.mark.parametrize("target", ["dependency", "result"])
def test_latest_tombstone_is_not_ready_media_or_a_result_to_recreate(deferred, monkeypatch, target):
    store, _, job, state, _, _, _, inserted, _ = deferred
    ready(state)
    getter = ch.get_document
    if target == "result":
        job = store.change(job, "creating")

    def latest(doc_id, author):
        if doc_id == ("media" if target == "dependency" else job.doc_id):
            return {"deleted": True}
        return getter(doc_id, author)

    monkeypatch.setattr(ch, "get_document_version", latest, raising=False)
    result = process_job(store, job)
    assert result.phase == ("failed" if target == "dependency" else "blocked")
    inserted.assert_not_called()


def test_lost_transcode_queue_is_recovered_from_durable_pending_dependency(deferred, monkeypatch):
    from app.services import transcode

    store, _, job, state, _, _, _, inserted, _ = deferred
    state.update(status="processing", enabled=False)
    enqueue = Mock()
    monkeypatch.setattr(transcode, "submit_transcode_job", enqueue)
    for _ in range(3):
        assert process_job(store, job).phase == "waiting"
    assert enqueue.call_args.args == ("media", "alice")
    inserted.assert_not_called()


@pytest.mark.parametrize("same_timestamp", [False, True])
def test_canonical_version_sql_ranks_deletion_before_filtering(monkeypatch, same_timestamp):
    import sqlite3
    from types import SimpleNamespace

    connection = sqlite3.connect(":memory:")
    connection.execute(
        "CREATE TABLE documents (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, ad_mode, ad_target, posted_by, deleted)"
    )
    row = ["id", "alice", "media_metadata", "{}", "", "", "2026-11-03", "2026-11-03T12:00:00", "none", "", "alice", 0]
    connection.execute("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
    row[-1] = 1
    if not same_timestamp:
        row[7] = "2026-11-03T12:00:01"
    connection.execute("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row)

    def query(sql, params):
        sql = sql.replace("%(doc_id)s", ":doc_id").replace("%(author_key)s", ":author_key")
        return SimpleNamespace(result_rows=connection.execute(sql, params).fetchall())

    monkeypatch.setattr(ch, "client", SimpleNamespace(query=query))
    assert ch.get_document_version("id", "alice")["deleted"] is True
    assert ch.get_document_version("id", "bob") is None
    connection.close()


def test_recovery_enqueue_deduplicates_queued_and_running_work_but_not_fresh_process(monkeypatch):
    import queue

    from app.services import transcode

    monkeypatch.setattr(transcode, "_ensure_started", lambda: None)
    monkeypatch.setattr(transcode, "_job_queue", queue.Queue())
    monkeypatch.setattr(transcode, "_pending", set())
    for _ in range(3):
        transcode.submit_transcode_job("media", "alice")
    assert transcode._job_queue.qsize() == 1
    transcode._job_queue.get()  # a worker is running, still in _pending
    transcode.submit_transcode_job("media", "alice")
    assert transcode._job_queue.qsize() == 0
    monkeypatch.setattr(transcode, "_pending", set())  # fresh-process boundary
    transcode.submit_transcode_job("media", "alice")
    assert transcode._job_queue.qsize() == 1
