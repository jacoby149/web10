"""Bounded maintenance, not reader-supplied conversion authority."""

import copy
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.services import transcode
from app.services import transcode_recovery as recovery

REAL_PROCESS_JOB = transcode._process_job


class Conflict(Exception):
    response = {"Error": {"Code": "PreconditionFailed"}}


@pytest.fixture
def env(monkeypatch):
    doc = {
        "doc_id": "media-1",
        "author_key": "alice",
        "service": "media_metadata",
        "deleted": False,
        "posted_by": "",
        "body": {
            "video": {"type": "minio", "value": "alice/upload/source"},
            "object_key": "alice/upload/source",
            "mime_type": "video/mp4",
            "alt_text": "keep",
            "transcoding_settings": {"status": "failed", "error": recovery.PROBE_ERROR},
        },
    }
    monkeypatch.setattr(recovery.settings, "HLS_RECOVERY_ENABLED", True)
    monkeypatch.setattr(recovery, "_cursor", ("", ""))
    monkeypatch.setattr(transcode, "_pending", set())
    query = Mock(return_value=SimpleNamespace(result_rows=[("alice", "media-1")]))
    monkeypatch.setattr(recovery.ch.client, "query", query)
    monkeypatch.setattr(recovery.ch, "get_document_version", lambda *_: copy.deepcopy(doc))
    monkeypatch.setattr(recovery.ch, "get_user", lambda name: {"username": name})
    private = Mock()
    monkeypatch.setattr(recovery, "ensure_private_state_bucket", private)
    claims = set()

    def put(**kw):
        assert kw["IfNoneMatch"] == "*"
        assert kw["Bucket"] != recovery.settings.S3_BUCKET
        if kw["Key"] in claims:
            raise Conflict()
        claims.add(kw["Key"])

    s3 = Mock()
    s3.put_object.side_effect = put
    monkeypatch.setattr(recovery.media_svc, "get_s3_client", lambda: s3)
    process = Mock()
    monkeypatch.setattr(transcode, "_process_job", process)
    mark = Mock()
    monkeypatch.setattr(transcode, "_mark_failed", mark)
    return SimpleNamespace(doc=doc, s3=s3, claims=claims, process=process, query=query, private=private, mark=mark)


def test_disabled_means_no_database_storage_or_conversion(env, monkeypatch):
    monkeypatch.setattr(recovery.settings, "HLS_RECOVERY_ENABLED", False)
    recovery.recover_one()
    env.query.assert_not_called()
    env.s3.put_object.assert_not_called()
    env.process.assert_not_called()


def test_known_failure_heals_once_across_process_restarts(env, monkeypatch):
    recovery.recover_one()
    env.process.assert_called_once_with("media-1", "alice", recovery_source="alice/upload/source")
    assert not transcode._pending
    # Fresh scanner/process state, same durable object-store claims.
    monkeypatch.setattr(recovery, "_cursor", ("", ""))
    monkeypatch.setattr(transcode, "_pending", set())
    recovery.recover_one()
    assert env.process.call_count == 1
    assert len(env.claims) == 1


@pytest.mark.parametrize(
    "change",
    [
        {"deleted": True},
        {"service": "posts"},
        {"author_key": "bob"},
        {"posted_by": "bob"},
        {"body": {"video": {"type": "minio", "value": "bob/raw"}, "object_key": "bob/raw"}},
        {"body": {"transcoding_settings": {"status": "done", "error": recovery.PROBE_ERROR}}},
        {"body": {"transcoding_settings": {"status": "processing", "error": recovery.PROBE_ERROR}}},
        {"body": {"transcoding_settings": {"status": "failed", "error": "invalid input"}}},
        {"body": {"object_key": "alice/different"}},
        {"body": {"mime_type": "audio/mp4"}},
    ],
)
def test_ineligible_canonical_media_has_no_side_effects(env, change):
    change = copy.deepcopy(change)
    env.doc["body"].update(change.pop("body", {}))
    env.doc.update(change)
    recovery.recover_one()
    env.s3.put_object.assert_not_called()
    env.process.assert_not_called()


def test_deleted_account_and_qualified_foreign_principals_cannot_heal(env, monkeypatch):
    monkeypatch.setattr(recovery.ch, "get_user", lambda _: None)
    recovery.recover_one()
    env.process.assert_not_called()
    assert recovery.eligible_source(env.doc, "foreign.example/users/alice") is None


def test_untrusted_bucket_and_uncertain_claim_fail_closed(env):
    env.private.side_effect = ValueError("public bucket")
    with pytest.raises(ValueError):
        recovery.recover_one()
    env.s3.put_object.assert_not_called()
    env.private.side_effect = None
    env.s3.put_object.side_effect = TimeoutError("unknown write outcome")
    with pytest.raises(TimeoutError):
        recovery.recover_one()
    env.process.assert_not_called()
    assert not transcode._pending


def test_failed_retry_does_not_loop_or_expose_raw_error(env):
    env.process.side_effect = RuntimeError("private-path-sentinel")
    recovery.recover_one()
    recovery.recover_one()
    assert env.process.call_count == 1
    assert "private-path-sentinel" not in str(env.mark.call_args)
    assert env.mark.call_args.kwargs["recovery_source"] == "alice/upload/source"


def test_queued_or_running_upload_is_not_duplicated(env):
    transcode._pending.add(("media-1", "alice"))
    recovery.recover_one()
    env.s3.put_object.assert_not_called()
    env.process.assert_not_called()
    assert ("media-1", "alice") in transcode._pending


def test_scan_ranks_before_tombstone_service_and_status_filters_and_keyset_pages(env):
    recovery.recover_one()
    sql, params = env.query.call_args.args
    assert "PARTITION BY author_key, doc_id ORDER BY updated_at DESC, deleted DESC" in sql
    assert sql.index("rn = 1") < sql.index("deleted = 0") < sql.index("'media_metadata'")
    assert "LIMIT 1" in sql and "max_execution_time=5" in sql
    assert params["cursor_author"] == ""
    env.query.return_value.result_rows = []
    recovery.recover_one()
    assert env.query.call_args.args[1]["cursor_author"] == "alice"
    assert recovery._cursor == ("", "")


@pytest.mark.parametrize(
    "change",
    [
        {"deleted": True},
        {"service": "posts"},
        {"body": {"video": {"type": "minio", "value": "bob/raw"}}},
        {"body": {"transcoding_settings": {"status": "done"}}},
    ],
)
def test_status_write_rechecks_live_media_and_never_resurrects_or_replaces_it(env, monkeypatch, change):
    env.doc["body"].update(change.get("body", {}))
    env.doc.update({k: v for k, v in change.items() if k != "body"})
    update = Mock()
    monkeypatch.setattr(transcode.ch, "update_document", update)
    with pytest.raises(transcode.RecoveryObsolete):
        transcode._set_transcoding_settings(
            "media-1", "alice", {}, {"status": "done"}, "media_metadata", recovery_source="alice/upload/source"
        )
    update.assert_not_called()


@pytest.mark.parametrize("status", ["processing", "done", "failed"])
def test_recovery_status_merges_current_metadata_not_old_snapshot(env, monkeypatch, status):
    env.doc["body"]["alt_text"] = "newer caption"
    env.doc["body"]["thumbnail_object_key"] = "alice/picked-cover"
    env.doc.update(
        ref_value="keep-ref",
        tags=["keep-tag"],
        ad_mode="creator",
        ad_target="keep-target",
        created_at="2026-11-11T00:00:00+00:00",
        posted_by="alice",
    )
    monkeypatch.setattr(transcode.ch, "get_document", lambda *_: env.doc)
    insert = Mock()
    monkeypatch.setattr(transcode.ch.client, "insert", insert)
    transcode._set_transcoding_settings(
        "media-1",
        "alice",
        {"alt_text": "stale"},
        {"status": status},
        "media_metadata",
        recovery_source="alice/upload/source",
    )
    row = insert.call_args.args[1][0]
    assert (row[4], row[5], row[9], row[10], row[11]) == ("keep-ref", ["keep-tag"], "creator", "keep-target", "alice")
    assert json.loads(row[3])["alt_text"] == "newer caption"
    assert json.loads(row[3])["thumbnail_object_key"] == "alice/picked-cover"


def test_media_deleted_after_claim_never_downloads_or_gets_failure_write(env, monkeypatch):
    put = env.s3.put_object.side_effect

    def claim_and_delete(**kw):
        put(**kw)
        env.doc["deleted"] = True

    env.s3.put_object.side_effect = claim_and_delete
    monkeypatch.setattr(transcode, "_process_job", REAL_PROCESS_JOB)
    recovery.recover_one()
    env.s3.download_file.assert_not_called()
    env.mark.assert_not_called()
    assert len(env.claims) == 1


def test_idle_worker_runs_healing_but_disabled_worker_only_waits(monkeypatch):
    import queue

    class StopWorker(BaseException):
        pass

    jobs = Mock()
    jobs.get.side_effect = [queue.Empty(), StopWorker()]
    heal = Mock()
    monkeypatch.setattr(transcode, "_job_queue", jobs)
    monkeypatch.setattr(recovery, "recover_one", heal)
    monkeypatch.setattr(recovery.settings, "HLS_RECOVERY_ENABLED", True)
    with pytest.raises(StopWorker):
        transcode._worker_loop()
    heal.assert_called_once_with()
    assert jobs.get.call_args.kwargs["timeout"] == 60
    jobs.get.side_effect = StopWorker()
    monkeypatch.setattr(recovery.settings, "HLS_RECOVERY_ENABLED", False)
    with pytest.raises(StopWorker):
        transcode._worker_loop()
    assert jobs.get.call_args.kwargs["timeout"] is None
