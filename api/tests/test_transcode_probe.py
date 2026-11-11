"""Phone rotation metadata must not kill the compatible-video transcode."""

import json
import shutil
import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest

from app.services import transcode


@pytest.mark.parametrize("rotation", [90, -90, 270, -270])
def test_probe_uses_display_dimensions_with_rotation_side_data(monkeypatch, rotation):
    stream = {
        "width": 1920,
        "height": 1080,
        "r_frame_rate": "120/1",
        "side_data_list": [{"side_data_type": "Display Matrix", "rotation": rotation}],
    }
    run = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps({"streams": [stream]}), ""))
    monkeypatch.setattr(transcode.subprocess, "run", run)
    assert transcode._probe_dimensions(Path("phone.mp4")) == (1080, 1920, 120)
    assert run.call_args.args[0][-3:] == ["-of", "json", "phone.mp4"]
    assert run.call_args.kwargs["timeout"] == 30


@pytest.mark.parametrize("rotation", [None, 0, 180, -180])
def test_probe_preserves_unrotated_or_half_turn_dimensions(monkeypatch, rotation):
    stream = {"width": 640, "height": 360, "r_frame_rate": "30000/1001"}
    if rotation is not None:
        stream["side_data_list"] = [{"rotation": rotation}]
    monkeypatch.setattr(
        transcode.subprocess,
        "run",
        Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps({"streams": [stream]}), "")),
    )
    assert transcode._probe_dimensions(Path("landscape.mp4")) == (640, 360, 30)


def test_probe_retains_unknown_frame_rate_fallback(monkeypatch):
    stream = {"width": 320, "height": 180, "r_frame_rate": "0/0"}
    monkeypatch.setattr(
        transcode.subprocess,
        "run",
        Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps({"streams": [stream]}), "")),
    )
    assert transcode._probe_dimensions(Path("unknown-fps.mp4")) == (320, 180, 30)


@pytest.mark.parametrize("streams", [[], [{"width": 0, "height": 1080, "r_frame_rate": "30/1"}]])
def test_probe_rejects_missing_video_or_invalid_dimensions(monkeypatch, streams):
    monkeypatch.setattr(
        transcode.subprocess,
        "run",
        Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps({"streams": streams}), "")),
    )
    with pytest.raises(RuntimeError, match="video|dimensions"):
        transcode._probe_dimensions(Path("invalid.mp4"))


def test_rotated_hevc_completes_real_worker_pipeline(tmp_path, monkeypatch):
    """Real probe/encode/upload/status, with only storage and document I/O fake."""
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("requires local ffmpeg/ffprobe")
    encoders = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True, check=True)
    if "libx265" not in encoders.stdout:
        pytest.skip("requires HEVC fixture encoder libx265")
    source = tmp_path / "source.mp4"
    phone = tmp_path / "phone.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=12",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440",
            "-t",
            "3",
            "-c:v",
            "libx265",
            "-x265-params",
            "log-level=error:pools=1",
            "-tag:v",
            "hvc1",
            "-c:a",
            "aac",
            str(source),
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )
    help_text = subprocess.run(["ffmpeg", "-hide_banner", "-h", "full"], capture_output=True, text=True, check=True)
    # FFmpeg 7+ exposes the input display-matrix override; older releases
    # write it through the output rotate tag. Exercise either installed tool.
    rotation_args = (
        ["-display_rotation", "90", "-i", str(source), "-c", "copy"]
        if "-display_rotation" in help_text.stdout
        else ["-i", str(source), "-c", "copy", "-metadata:s:v:0", "rotate=90"]
    )
    subprocess.run(["ffmpeg", "-v", "error", *rotation_args, str(phone)], check=True, capture_output=True, timeout=30)
    # This is the exact production parser failure, generated rather than mocked.
    legacy = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate",
            "-of",
            "csv=p=0",
            str(phone),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert len(legacy.stdout.strip().split(",")) > 3
    assert transcode._probe_dimensions(phone) == (180, 320, 12)

    stored = tmp_path / "stored"

    def upload(local, _bucket, key):
        target = stored / key
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local, target)

    s3 = Mock()
    s3.download_file.side_effect = lambda _bucket, _key, local: shutil.copyfile(phone, local)
    s3.upload_file.side_effect = upload
    monkeypatch.setattr(transcode.media_svc, "get_s3_client", lambda: s3)
    body = {"video": {"type": "minio", "value": "synthetic/phone.mp4"}}
    monkeypatch.setattr(transcode.ch, "get_document", lambda *_: {"body": body, "service": "media_metadata"})
    update = Mock()
    monkeypatch.setattr(transcode.ch, "update_document", update)
    monkeypatch.setattr(transcode.settings, "HLS_RENDITIONS", "320x180@1M")
    transcode._process_job("synthetic-phone", "synthetic")
    assert [c.kwargs["body"]["transcoding_settings"]["status"] for c in update.call_args_list] == ["processing", "done"]
    assert all(c.kwargs["service"] == "media_metadata" for c in update.call_args_list)
    variant = update.call_args.kwargs["body"]["transcoding_settings"]["variants"][0]
    assert (variant["width"], variant["height"], variant["codec"]) == (100, 180, "h264")
    assert transcode._probe_dimensions(stored / "synthetic/hls/180p/index.m3u8") == (100, 180, 12)
