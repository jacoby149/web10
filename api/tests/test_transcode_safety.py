"""E22 storage, admission and subprocess seams; no delegated-authority claims."""

import io
import logging
import queue
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import transcode as tc
from app.v3.endpoints import media


def document(key="alice/id/raw.mp4"):
    return {"service": "media_metadata", "body": {"video": {"type": "minio", "value": key}}}


@pytest.mark.parametrize("key", ["victim/id/raw", "alice2/id/raw", "alice/../raw", 123, {"value": "alice/id/raw"}])
def test_foreign_worker_key_denied_before_state_or_io(key):
    with (
        patch.object(tc.ch, "get_document", return_value=document(key)),
        patch.object(tc, "_set_transcoding_settings") as state,
        patch.object(tc.media_svc, "get_s3_client") as storage,
    ):
        with pytest.raises(RuntimeError, match="source_not_owned"):
            tc._process_job("doc", "alice")
    state.assert_not_called()
    storage.assert_not_called()


@pytest.mark.parametrize("status", [None, "processing"])
def test_endpoint_checks_ownership_before_admission_or_processing(status):
    doc = document("victim/id/raw")
    doc["body"]["transcoding_settings"] = {"status": status}
    with (
        patch.object(media, "_user", return_value="alice"),
        patch.object(tc.ch, "get_document", return_value=doc),
        patch.object(tc, "submit_transcode_job") as submit,
    ):
        with pytest.raises(HTTPException) as error:
            media.transcode_media(SimpleNamespace(doc_id="doc"))
    assert error.value.status_code == 403
    submit.assert_not_called()


def test_queue_has_source_capacity():
    assert tc._job_queue.maxsize == 64


def test_admission_uses_nonblocking_put_and_propagates_full():
    jobs = MagicMock()
    jobs.put_nowait.side_effect = queue.Full
    with patch.object(tc, "_job_queue", jobs), patch.object(tc, "_ensure_started"):
        with pytest.raises(queue.Full):
            tc.submit_transcode_job("doc", "alice")
    jobs.put_nowait.assert_called_once_with(("doc", "alice"))
    jobs.put.assert_not_called()


def test_full_queue_endpoint_is_503_without_state_write():
    with (
        patch.object(media, "_user", return_value="alice"),
        patch.object(tc.ch, "get_document", return_value=document()),
        patch.object(tc.ch, "update_document") as update,
        patch.object(tc, "submit_transcode_job", side_effect=queue.Full),
    ):
        with pytest.raises(HTTPException) as error:
            media.transcode_media(SimpleNamespace(doc_id="doc"))
    assert error.value.status_code == 503
    assert error.value.detail == "transcode queue is full"
    update.assert_not_called()


@pytest.fixture
def job(monkeypatch, tmp_path):
    monkeypatch.setattr(tc, "MAX_MEDIA_BYTES", 8, raising=False)
    monkeypatch.setattr(tc.settings, "HLS_RENDITIONS", "640x360@1M")
    s3 = MagicMock()
    s3.head_object.return_value = {"ContentLength": 8}
    body = MagicMock(wraps=io.BytesIO(b"abcdefgh"))
    s3.get_object.return_value = {"ContentLength": 8, "Body": body}
    temporary = tmp_path / "job"
    temporary.mkdir()
    with (
        patch.object(tc.ch, "get_document", return_value=document()),
        patch.object(tc.ch, "update_document") as update,
        patch.object(tc.media_svc, "get_s3_client", return_value=s3),
        patch.object(tc.tempfile, "mkdtemp", return_value=str(temporary)) as temp,
        patch.object(tc, "_probe_duration", return_value=10.0) as duration,
        patch.object(tc, "_probe_dimensions", return_value=(320, 240, 30)) as dimensions,
        patch.object(tc, "_run_ffmpeg") as ffmpeg,
    ):
        yield SimpleNamespace(s3=s3, body=body, tmp=temporary, temp=temp, update=update,
                              duration=duration, dimensions=dimensions, ffmpeg=ffmpeg)


@pytest.mark.parametrize("size", [0, -1, 9, None, "8", True])
def test_head_rejects_invalid_or_oversize_before_download(job, size):
    job.s3.head_object.return_value = {"ContentLength": size}
    with pytest.raises(RuntimeError, match="source_size_invalid"):
        tc._process_job("doc", "alice")
    job.s3.get_object.assert_not_called()
    job.s3.download_file.assert_not_called()
    job.temp.assert_not_called()
    job.duration.assert_not_called()


@pytest.mark.parametrize("advertised", [0, 9, 7, None, "8", True])
def test_get_advertised_length_rejected_and_body_closed(job, advertised):
    job.s3.get_object.return_value["ContentLength"] = advertised
    with pytest.raises(RuntimeError, match="source_size_mismatch"):
        tc._process_job("doc", "alice")
    job.body.read.assert_not_called()
    job.body.close.assert_called_once()
    assert not job.tmp.exists()
    job.duration.assert_not_called()


@pytest.mark.parametrize("payload", [b"", b"abc", b"abcdefghi"])
def test_actual_length_mismatch_or_overflow_stops_before_probe(job, payload):
    body = MagicMock(wraps=io.BytesIO(payload))
    job.s3.get_object.return_value["Body"] = body
    with pytest.raises(RuntimeError, match="source_size_mismatch"):
        tc._process_job("doc", "alice")
    body.close.assert_called_once()
    assert all(0 < call.args[0] <= 1024 * 1024 for call in body.read.call_args_list)
    assert not job.tmp.exists()
    job.duration.assert_not_called()
    job.s3.upload_file.assert_not_called()


def test_overflow_chunk_not_written_and_no_further_reads(job):
    job.body.read.side_effect = [b"abcdefgh", b"x", AssertionError("must stop")]
    with patch("pathlib.Path.open", return_value=MagicMock()) as opened:
        with pytest.raises(RuntimeError, match="source_size_mismatch"):
            tc._process_job("doc", "alice")
    assert job.body.read.call_count == 2
    opened.return_value.__enter__.return_value.write.assert_called_once_with(b"abcdefgh")
    job.body.close.assert_called_once()


@pytest.mark.parametrize("stage", ["head", "get", "read", "probe", "upload"])
def test_failure_cleans_body_and_temp(job, stage):
    failure = RuntimeError("SECRET /private/path body contents")
    if stage == "head":
        job.s3.head_object.side_effect = failure
    elif stage == "get":
        job.s3.get_object.side_effect = failure
    elif stage == "read":
        job.body.read.side_effect = failure
    elif stage == "probe":
        job.duration.side_effect = failure
    else:
        job.s3.upload_file.side_effect = failure
    with pytest.raises(RuntimeError):
        tc._process_job("doc", "alice")
    if stage not in ("head", "get"):
        job.body.close.assert_called_once()
    if stage != "head":
        assert not job.tmp.exists()


def test_owned_at_limit_preserves_rendition_thumbnail_and_service(job):
    tc._process_job("doc", "alice")
    job.s3.download_file.assert_not_called()
    job.body.close.assert_called_once()
    job.duration.assert_called_once()
    ts = job.update.call_args.kwargs["body"]["transcoding_settings"]
    assert ts["status"] == "done" and ts["enabled"]
    assert job.update.call_args.kwargs["service"] == "media_metadata"
    assert [(v["width"], v["height"]) for v in ts["variants"]] == [(320, 240)]
    assert [t["timestamp_seconds"] for t in ts["thumbnails"]] == [0, 5]
    assert all((t["width"], t["height"]) == (480, 360) for t in ts["thumbnails"])
    assert not job.tmp.exists()


@pytest.mark.parametrize("operation", ["ffmpeg", "duration", "dimensions"])
def test_subprocess_protocols_and_timeouts(operation):
    outputs = ["N/A", "10"] if operation == "duration" else ["320,240,30/1"]
    with patch.object(tc.subprocess, "run", side_effect=[
        SimpleNamespace(returncode=0, stdout=value) for value in outputs
    ]) as run:
        if operation == "ffmpeg":
            tc._run_ffmpeg(["-i", "/private/raw", "/private/out"], "test")
        elif operation == "duration":
            assert tc._probe_duration(Path("/private/raw")) == 10
        else:
            assert tc._probe_dimensions(Path("/private/raw")) == (320, 240, 30)
    for call in run.call_args_list:
        cmd = call.args[0]
        assert cmd[cmd.index("-protocol_whitelist") + 1] == "file,pipe"
        assert cmd.index("-protocol_whitelist") < (cmd.index("-i") if "-i" in cmd else len(cmd) - 1)
        assert call.kwargs["timeout"] == (tc.settings.HLS_FFMPEG_TIMEOUT if operation == "ffmpeg" else 30)


@pytest.mark.parametrize("operation", ["ffmpeg", "duration", "dimensions"])
@pytest.mark.parametrize("failure", ["stderr", "timeout"])
def test_subprocess_failure_has_only_outcome_code(operation, failure, caplog):
    caplog.set_level(logging.INFO, logger="web10-transcode")
    with patch.object(tc.subprocess, "run") as run:
        if failure == "timeout":
            run.side_effect = subprocess.TimeoutExpired(["SECRET"], 30, stderr="SECRET")
        else:
            run.return_value = SimpleNamespace(returncode=1, stderr="SECRET", stdout="SECRET")
        with pytest.raises(RuntimeError) as error:
            if operation == "ffmpeg":
                tc._run_ffmpeg(["-i", "/private/raw"], "SECRET")
            elif operation == "duration":
                tc._probe_duration(Path("/private/raw"))
            else:
                tc._probe_dimensions(Path("/private/raw"))
    assert str(error.value) == ("ffmpeg_failed" if operation == "ffmpeg" else "probe_failed")
    assert "SECRET" not in caplog.text and "/private/raw" not in caplog.text


def test_worker_failure_diagnostic_sanitized_and_task_released(caplog):
    caplog.set_level(logging.INFO, logger="web10-transcode")
    jobs = MagicMock()
    jobs.get.side_effect = [("doc", "alice"), KeyboardInterrupt]
    with (
        patch.object(tc, "_job_queue", jobs),
        patch.object(tc, "_process_job", side_effect=RuntimeError("SECRET body /private/path")),
        patch.object(tc, "_mark_failed") as failed,
    ):
        with pytest.raises(KeyboardInterrupt):
            tc._worker_loop()
    failed.assert_called_once_with("doc", "alice", "job_failed")
    jobs.task_done.assert_called_once()
    assert "SECRET" not in caplog.text and "/private/path" not in caplog.text


def test_mark_failed_sanitizes_unknown_error_and_failure_logging(caplog):
    caplog.set_level(logging.INFO, logger="web10-transcode")
    with patch.object(tc.ch, "get_document", return_value=document()), patch.object(tc.ch, "update_document") as update:
        tc._mark_failed("doc", "alice", "SECRET body")
    assert update.call_args.kwargs["body"]["transcoding_settings"]["error"] == "job_failed"
    with patch.object(tc.ch, "get_document", side_effect=RuntimeError("SECRET body")):
        tc._mark_failed("doc", "alice", "job_failed")
    assert "SECRET" not in caplog.text
