"""L1-J-01: preserve durable job logs without copying another execution's stream."""

import logging
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest

from app.v3.services import import_worker as iw


@pytest.fixture
def events(caplog):
    rows = []
    lock = threading.Lock()

    def insert(table, data, column_names=None):
        assert table == "import_events"
        with lock:
            rows.extend(data)

    with (
        patch.object(iw.ch.client, "insert", side_effect=insert),
        patch.object(iw, "_event_seq", {}),
        caplog.at_level(logging.INFO, logger=iw.logger.name),
    ):
        yield rows


def test_overlapping_jobs_and_unowned_thread_do_not_share_trace_rows(events, caplog):
    barrier = threading.Barrier(3)

    def run(job):
        with iw._with_job_logging(job):
            barrier.wait(timeout=5)
            iw.logger.info("synthetic-private-%s", job)
            barrier.wait(timeout=5)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, job) for job in ("trace-A", "trace-B")]
        barrier.wait(timeout=5)
        iw.logger.info("synthetic-unowned-background")
        barrier.wait(timeout=5)
        for future in futures:
            future.result(timeout=5)
    assert sorted((r[0], r[2], r[3], r[4]) for r in events) == [
        (job, "log", "info", f"INFO synthetic-private-{job}") for job in ("trace-A", "trace-B")
    ]
    assert "synthetic-unowned-background" in caplog.text
    assert not any(isinstance(h, iw._JobLogHandler) for h in iw.logger.handlers)


def test_nested_context_restores_outer_attribution_after_exception(events):
    with iw._with_job_logging("trace-outer"):
        iw.logger.info("outer-before")
        with pytest.raises(ValueError, match="synthetic failure"):
            with iw._with_job_logging("trace-inner"):
                iw.logger.error("inner-only")
                raise ValueError("synthetic failure")
        iw.logger.info("outer-after")
    iw.logger.info("after-all-contexts")
    assert [(r[0], r[4]) for r in events] == [
        ("trace-outer", "INFO outer-before"),
        ("trace-inner", "ERROR inner-only"),
        ("trace-outer", "INFO outer-after"),
    ]
    assert not any(isinstance(h, iw._JobLogHandler) for h in iw.logger.handlers)


def test_same_job_nested_context_does_not_duplicate_records(events):
    with iw._with_job_logging("same-job"):
        with iw._with_job_logging("same-job"):
            iw.logger.info("one-inner-event")
        iw.logger.info("one-outer-event")
    assert [r[4] for r in events] == ["INFO one-inner-event", "INFO one-outer-event"]
    assert [r[1] for r in events] == [1, 2]


@pytest.mark.parametrize("fail", [False, True])
def test_actual_thumbnail_pool_keeps_job_context_and_results(events, fail):
    parent_thread = threading.get_ident()
    threads = []
    barrier = threading.Barrier(2)

    def upload(*args):
        threads.append(threading.get_ident())
        barrier.wait(timeout=3)
        if fail:
            try:
                raise ValueError("synthetic-thumbnail-error")
            except ValueError:
                iw.logger.exception("thumbnail-failed")
                raise
        iw.logger.info("thumbnail-uploaded")
        return f"synthetic-media-{args[2]}"

    records = [
        {
            "service": "staging_posts",
            "origin_id": oid,
            "media_url": "https://fixture.invalid/thumb",
            "body": {"text": "synthetic title"},
        }
        for oid in ("v1", "v2")
    ]
    with (
        patch.object(iw, "_existing_origin_ids", return_value=(set(), {})),
        patch.object(iw, "_upload_thumbnail", side_effect=upload),
        patch.object(iw.ch, "insert_document", return_value={"doc_id": "synthetic-post"}) as write,
        patch.object(iw.ch, "attach_doc_to_groups"),
        iw._with_job_logging("thumbnail-job"),
    ):
        written, skipped, errors = iw._write_records("thumbnail-job", "alice", records, "synthetic-group")
    assert len(set(threads)) == 2 and all(thread != parent_thread for thread in threads)
    assert (written, skipped) == ((2, 2) if fail else (4, 0))
    assert bool(errors) is fail
    assert [call.kwargs["body"].get("media_refs") for call in write.call_args_list] == (
        [None, None] if fail else [["synthetic-media-v1"], ["synthetic-media-v2"]]
    )
    assert len(events) == 2
    for event in events:
        assert event[0] == "thumbnail-job"
        assert ("Traceback" in event[4]) is fail
        assert ("synthetic-thumbnail-error" in event[4]) is fail


def test_pool_thread_reuse_does_not_keep_previous_job_context(events):
    # Only explicitly owned tasks inherit a scope; a later raw task is unowned.
    with ThreadPoolExecutor(max_workers=1) as pool:
        with iw._with_job_logging("owner-job"):
            pool.submit(iw.copy_context().run, iw.logger.info, "owned-pool-record").result(timeout=5)
            pool.submit(iw.logger.info, "unowned-pool-record").result(timeout=5)
            iw.logger.info("owned-parent-record")
    assert [(r[0], r[4]) for r in events] == [
        ("owner-job", "INFO owned-pool-record"),
        ("owner-job", "INFO owned-parent-record"),
    ]


def test_event_store_failure_is_not_recursively_captured_and_scope_recovers(events, caplog):
    with iw._with_job_logging("recovery-job"):
        with patch.object(iw.ch.client, "insert", side_effect=RuntimeError("synthetic-store-down")) as insert:
            iw.logger.error("original-job-diagnostic")
        assert insert.call_count == 1
        iw.logger.info("store-recovered")
    assert [(r[0], r[4]) for r in events] == [("recovery-job", "INFO store-recovered")]
    assert "original-job-diagnostic" in caplog.text
    assert sum("event record failed" in r.getMessage() for r in caplog.records) == 1


def test_concurrent_event_store_failures_do_not_deadlock():
    # A regression can leave logging locks held. Isolate it so even logging's
    # interpreter-shutdown cleanup cannot hang the pytest process.
    code = """
import logging, os, runpy, threading
from unittest.mock import patch
runpy.run_path('tests/conftest.py')
from app.v3.services import import_worker as iw
iw.logger = logging.Logger('isolated-import-trace', logging.INFO)
ready = threading.Event()
b_insert = threading.Event()
both = threading.Barrier(2)
done = []
def insert(table, rows, **kwargs):
    if rows[0][0] == 'B': b_insert.set()
    both.wait(timeout=3)
    raise RuntimeError('synthetic-concurrent-store-failure')
def a():
    with iw._with_job_logging('A'):
        ready.set()
        if not b_insert.wait(timeout=3): return
        iw.logger.info('A-owned')
    done.append('A')
def b():
    if not ready.wait(timeout=3): return
    with iw._with_job_logging('B'):
        iw.logger.info('B-owned')
    done.append('B')
with patch.object(iw.ch.client, 'insert', side_effect=insert) as store:
    threads = [threading.Thread(target=f, daemon=True) for f in (a, b)]
    for thread in threads: thread.start()
    for thread in threads: thread.join(timeout=4)
    ok = sorted(done) == ['A', 'B'] and store.call_count == 2
os._exit(0 if ok else 2)
"""
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=12)
    assert result.returncode == 0


def test_process_job_preserves_stages_and_cleanup_without_leaking_background_logs(events, caplog):
    barrier = threading.Barrier(2)

    def job(job_id):
        return {
            "job_id": job_id,
            "user_key": job_id,
            "platform": "fixture",
            "phase": iw.QUEUED,
            "object_keys": [job_id],
            "target_group_id": "synthetic-group",
        }

    def download(keys, path):
        barrier.wait(timeout=5)
        iw.logger.info("download-%s", keys[0])
        barrier.wait(timeout=5)

    with (
        patch.object(iw, "get_import_job", side_effect=job),
        patch.dict(iw.PARSERS, {"fixture": lambda entries: [{"synthetic": True}]}),
        patch.object(iw, "completed_stages", return_value=set()),
        patch.object(iw, "update_import_job"),
        patch.object(iw, "_download_parts", side_effect=download),
        patch.object(iw, "_write_records", return_value=(1, 0, [])),
        patch.object(iw.settings, "KEEP_IMPORT_EXPORTS", False),
        patch.object(iw, "_delete_parts", side_effect=lambda keys: iw.logger.info("cleanup-%s", keys[0])) as cleanup,
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        futures = [pool.submit(iw._process_job, name) for name in ("pipeline-A", "pipeline-B")]
        for future in futures:
            future.result(timeout=10)
    assert cleanup.call_count == 2
    for name in ("pipeline-A", "pipeline-B"):
        owned = [r for r in events if r[0] == name]
        assert [(r[2], r[3]) for r in owned] == [
            ("log", "info"),
            ("download", "ok"),
            ("parse", "ok"),
            ("write", "ok"),
            ("complete", "ok"),
        ]
        assert owned[0][4] == f"INFO download-{name}"
        assert f"cleanup-{name}" in caplog.text
