"""One-shot ops repair: default read-only planning, bounded explicit application."""

import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app import settings
from app.services import transcode, upload_storage
from app.v3.services import clickhouse as ch

SCRIPT = Path(__file__).resolve().parents[2] / "ubuntu-deployment/scripts/heal-phone-videos.py"
spec = importlib.util.spec_from_file_location("heal_phone_videos", SCRIPT)
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
REAL_PROCESS, REAL_UPDATE = transcode._process_job, ch.update_document
ID = "00000000-0000-0000-0000-000000000001"


class Conflict(Exception):
    response = {"Error": {"Code": "PreconditionFailed"}}


@pytest.fixture
def env(monkeypatch):
    doc = {
        "doc_id": ID,
        "author_key": "alice",
        "service": "media_metadata",
        "deleted": False,
        "ref_value": "keep-ref",
        "tags": ["keep-tag"],
        "ad_mode": "creator",
        "ad_target": "keep-target",
        "created_at": "2026-11-11T00:00:00+00:00",
        "posted_by": "alice",
        "body": {
            "video": {"type": "minio", "value": "alice/upload/source"},
            "object_key": "alice/upload/source",
            "mime_type": "video/mp4",
            "alt_text": "keep",
            "transcoding_settings": {"status": "failed", "error": ops.PROBE_ERROR},
        },
    }
    query = Mock(return_value=SimpleNamespace(result_rows=[("alice", ID)]))
    monkeypatch.setattr(ch.client, "query", query)
    monkeypatch.setattr(ch, "get_document_version", lambda *_: copy.deepcopy(doc))
    monkeypatch.setattr(ch, "get_user", lambda _: {"username": "alice"})
    update = Mock(
        side_effect=lambda **kw: doc.update(
            body=kw["body"], **{k: kw[k] for k in ("ref_value", "tags", "ad_mode", "ad_target", "posted_by")}
        )
    )
    monkeypatch.setattr(ch, "update_document", update)

    def process(doc_id, owner):
        transcode._set_transcoding_settings(doc_id, owner, {}, {"status": "processing"}, "media_metadata")
        transcode._set_transcoding_settings(
            doc_id, owner, {}, {"status": "done", "enabled": True, "variants": [{"codec": "h264"}]}, "media_metadata"
        )

    worker = Mock(side_effect=process)
    monkeypatch.setattr(transcode, "_process_job", worker)
    private = Mock()
    monkeypatch.setattr(upload_storage, "ensure_private_state_bucket", private)
    claims = set()

    def put(**kw):
        assert kw["IfNoneMatch"] == "*" and kw["Bucket"] != settings.S3_BUCKET
        if kw["Key"] in claims:
            raise Conflict()
        claims.add(kw["Key"])

    s3 = Mock()
    s3.put_object.side_effect = put
    runtime = SimpleNamespace(settings=settings, ch=ch, worker=transcode, s3=Mock(return_value=s3))
    item = {"owner": "alice", "doc_id": ID, "source_sha256": ops.digest("alice/upload/source")}
    return SimpleNamespace(
        doc=doc,
        runtime=runtime,
        item=item,
        s3=s3,
        claims=claims,
        worker=worker,
        query=query,
        private=private,
        update=update,
    )


def test_default_dry_run_only_writes_exclusive_private_plan(env, tmp_path):
    path = tmp_path / "plan.json"
    assert ops.execute(env.runtime, path, settings.PROVIDER) == 0
    assert json.loads(path.read_text())["items"] == [env.item]
    assert path.stat().st_mode & 0o777 == 0o600
    assert "alice/upload/source" not in path.read_text()
    env.runtime.s3.assert_not_called()
    env.private.assert_not_called()
    env.worker.assert_not_called()
    with pytest.raises(FileExistsError):
        ops.execute(env.runtime, path, settings.PROVIDER)


def test_apply_uses_plan_without_rescan_and_restores_process_adapters(env, tmp_path):
    path = tmp_path / "plan.json"
    ops.execute(env.runtime, path, settings.PROVIDER)
    env.query.reset_mock()
    original = (ch.get_document, transcode._set_transcoding_settings)
    assert ops.execute(env.runtime, path, settings.PROVIDER, apply=True) == 0
    env.query.assert_not_called()
    assert env.doc["body"]["transcoding_settings"]["status"] == "done"
    assert (ch.get_document, transcode._set_transcoding_settings) == original
    assert env.update.call_args.kwargs["ref_value"] == "keep-ref"
    # A lost job/restart cannot repeat the same source after its claim was consumed.
    env.doc["body"]["transcoding_settings"] = {"status": "failed", "error": ops.PROBE_ERROR}
    assert ops.apply_one(env.runtime, env.item) == "already-claimed"
    env.worker.assert_called_once_with(ID, "alice")


@pytest.mark.parametrize(
    "change",
    [
        {"deleted": True},
        {"service": "posts"},
        {"author_key": "bob"},
        {"posted_by": "bob"},
        {"body": {"video": {"type": "minio", "value": "bob/raw"}, "object_key": "bob/raw"}},
        {"body": {"transcoding_settings": {"status": "done", "error": ops.PROBE_ERROR}}},
        {"body": {"transcoding_settings": {"status": "processing", "error": ops.PROBE_ERROR}}},
        {"body": {"transcoding_settings": {"status": "failed", "error": "other"}}},
        {"body": {"object_key": "alice/changed"}},
        {"body": {"mime_type": "audio/mp4"}},
    ],
)
def test_canonical_ineligible_media_is_untouched(env, change):
    change = copy.deepcopy(change)
    env.doc["body"].update(change.pop("body", {}))
    env.doc.update(change)
    assert ops.apply_one(env.runtime, env.item) == "obsolete"
    env.runtime.s3.assert_not_called()
    env.worker.assert_not_called()


def test_deleted_account_changed_plan_and_uncertain_claim_never_convert(env, monkeypatch):
    monkeypatch.setattr(ch, "get_user", lambda _: None)
    assert ops.apply_one(env.runtime, env.item) == "obsolete"
    monkeypatch.setattr(ch, "get_user", lambda _: {"username": "alice"})
    assert ops.apply_one(env.runtime, {**env.item, "source_sha256": "0" * 64}) == "obsolete"
    env.s3.put_object.side_effect = TimeoutError("unknown outcome")
    with pytest.raises(TimeoutError):
        ops.apply_one(env.runtime, env.item)
    env.worker.assert_not_called()


def test_public_state_bucket_or_missing_original_fails_closed(env):
    env.private.side_effect = ValueError("public state")
    with pytest.raises(ValueError):
        ops.apply_one(env.runtime, env.item)
    env.private.side_effect = None
    env.s3.head_object.side_effect = FileNotFoundError()
    with pytest.raises(FileNotFoundError):
        ops.apply_one(env.runtime, env.item)
    env.s3.put_object.assert_not_called()
    env.worker.assert_not_called()


@pytest.mark.parametrize("fail", [False, True])
def test_actual_insert_preserves_all_metadata_at_processing_and_terminal_state(env, monkeypatch, fail):
    monkeypatch.setattr(ch, "update_document", REAL_UPDATE)
    rows = []

    def insert(_table, data):
        row = data[0]
        rows.append(row)
        env.doc.update(
            body=json.loads(row[3]), ref_value=row[4], tags=row[5], ad_mode=row[9], ad_target=row[10], posted_by=row[11]
        )

    monkeypatch.setattr(ch.client, "insert", insert)
    if fail:

        def broken(doc_id, owner):
            transcode._set_transcoding_settings(doc_id, owner, {}, {"status": "processing"}, "media_metadata")
            raise RuntimeError("private-path-sentinel")

        env.worker.side_effect = broken
    assert ops.apply_one(env.runtime, env.item) == ("failed" if fail else "done")
    assert len(rows) == 2
    for row in rows:
        assert (row[4], row[5], row[9], row[10], row[11]) == (
            "keep-ref",
            ["keep-tag"],
            "creator",
            "keep-target",
            "alice",
        )
        assert json.loads(row[3])["alt_text"] == "keep"
    assert "private-path-sentinel" not in str(env.doc)


def test_deletion_after_claim_cannot_download_or_resurrect(env, monkeypatch):
    put = env.s3.put_object.side_effect

    def claim_then_delete(**kw):
        put(**kw)
        env.doc["deleted"] = True

    env.s3.put_object.side_effect = claim_then_delete
    monkeypatch.setattr(transcode, "_process_job", REAL_PROCESS)
    assert ops.apply_one(env.runtime, env.item) == "obsolete"
    env.update.assert_not_called()


def test_wrong_node_limits_and_nonfixed_worker_cannot_plan(env, tmp_path, monkeypatch):
    for provider, limit in [("other.example", 10), (settings.PROVIDER, 0), (settings.PROVIDER, 101)]:
        with pytest.raises(ValueError):
            ops.execute(env.runtime, tmp_path / "plan", provider, limit=limit)
    monkeypatch.setattr(ops.inspect, "getsource", lambda _: "old csv probe")
    with pytest.raises(ValueError):
        ops.execute(env.runtime, tmp_path / "plan", settings.PROVIDER)
    env.query.assert_not_called()


def test_discovery_is_bounded_latest_before_filter_and_rejects_overflow(env, tmp_path):
    env.query.return_value.result_rows *= 11
    with pytest.raises(ValueError):
        ops.execute(env.runtime, tmp_path / "plan", settings.PROVIDER)
    sql, parameters = env.query.call_args.args
    assert "PARTITION BY author_key, doc_id ORDER BY updated_at DESC, deleted DESC" in sql
    assert sql.index("rn = 1") < sql.index("deleted = 0") < sql.index("'media_metadata'")
    assert parameters["limit"] == 11 and "max_execution_time=5" in sql
    assert not (tmp_path / "plan").exists()


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.update(provider="foreign"),
        lambda p: p.update(node_binding="wrong"),
        lambda p: p["items"].append(p["items"][0]),
        lambda p: p["items"][0].update(owner="foreign/users/alice"),
    ],
)
def test_foreign_or_invalid_plan_never_touches_storage(env, tmp_path, mutate):
    path = tmp_path / "plan"
    ops.execute(env.runtime, path, settings.PROVIDER)
    plan = json.loads(path.read_text())
    mutate(plan)
    path.write_text(json.dumps(plan))
    with pytest.raises(ValueError):
        ops.execute(env.runtime, path, settings.PROVIDER, apply=True)
    env.runtime.s3.assert_not_called()
