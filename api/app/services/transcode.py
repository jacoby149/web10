"""In-process HLS transcode worker (D44).

Upload → worker → ffmpeg (subprocess) → HLS renditions + thumbnails →
MinIO → document updated with `transcoding_settings`.

In-process by design: the node targets a one-container deploy, and v3-scale
upload volume doesn't need a distributed queue. The worker runs on its own
daemon threads — NOT the FastAPI request pool (a transcode must not starve
request handling), with bounded concurrency (settings.HLS_WORKER_CONCURRENCY).
If a node ever outgrows this, the interface (job in, manifest out) doesn't
change — the queue becomes a separate service.

The document is the status surface: `transcoding_settings.status` goes
`processing` → `done` | `failed`. Clients poll by reading the document.
"""

import logging
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import app.settings as settings
from app.services import media as media_svc
from app.services.hls import hls_prefix
from app.v3.services import clickhouse as ch

logger = logging.getLogger("web10-transcode")

_job_queue: queue.Queue = queue.Queue()
_start_lock = threading.Lock()
_started = False


def submit_transcode_job(doc_id: str, author_key: str) -> None:
    """Enqueue a transcode job. Idempotent enough for v3: the endpoint
    checks the document's status before submitting, so a double-submit just
    re-runs the worker (last write wins on the document)."""
    _ensure_started()
    logger.info("[transcode] job queued — doc_id=%s author=%s queue_size=%s", doc_id, author_key, _job_queue.qsize())
    _job_queue.put((doc_id, author_key))


def start_workers() -> None:
    """Start the worker threads at app boot (idempotent)."""
    _ensure_started()


def _ensure_started() -> None:
    global _started
    with _start_lock:
        if _started:
            return
        for i in range(max(1, settings.HLS_WORKER_CONCURRENCY)):
            t = threading.Thread(target=_worker_loop, daemon=True, name=f"hls-transcode-worker-{i}")
            t.start()
        _started = True
        logger.info("[transcode] worker started — concurrency=%s", settings.HLS_WORKER_CONCURRENCY)


def _worker_loop() -> None:
    while True:
        doc_id, author_key = _job_queue.get()
        started = time.time()
        try:
            _process_job(doc_id, author_key)
            logger.info("[transcode] job done — doc_id=%s in %.1fs", doc_id, time.time() - started)
        except Exception as e:
            logger.exception("[transcode] job FAILED — doc_id=%s: %s", doc_id, e)
            _mark_failed(doc_id, author_key, str(e))
        finally:
            _job_queue.task_done()


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------


def _find_video_ref(body: dict) -> dict:
    """The document's video reference: body['video'] as a minio type."""
    video = body.get("video")
    if isinstance(video, dict) and video.get("type") == "minio" and video.get("value"):
        return video
    raise RuntimeError(f"document has no video minio ref (body.video={video!r})")


def _set_transcoding_settings(doc_id: str, author_key: str, base_body: dict, ts: dict) -> None:
    """Merge transcoding_settings into the document body (new version)."""
    merged = {**base_body, "transcoding_settings": ts}
    ch.update_document(doc_id=doc_id, author_key=author_key, service="media", body=merged)
    logger.info("[transcode] document updated — doc_id=%s status=%s", doc_id, ts.get("status"))


def _mark_failed(doc_id: str, author_key: str, error: str) -> None:
    try:
        doc = ch.get_document(doc_id, author_key)
        if doc:
            _set_transcoding_settings(doc_id, author_key, doc["body"], {"enabled": False, "status": "failed", "error": error})
    except Exception:
        logger.exception("[transcode] could not mark doc failed — doc_id=%s", doc_id)


def _parse_renditions(spec: str) -> list[dict]:
    renditions = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        size, _, bitrate = part.partition("@")
        width_s, _, height_s = size.lower().partition("x")
        renditions.append({"width": int(width_s), "height": int(height_s), "bitrate": bitrate or "1M"})
    if not renditions:
        raise RuntimeError(f"no valid renditions in HLS_RENDITIONS={spec!r}")
    return renditions


def _run_ffmpeg(args: list[str], label: str) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args]
    logger.info("[transcode] ffmpeg %s — %s", label, " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=settings.HLS_FFMPEG_TIMEOUT)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg {label} failed (rc={proc.returncode}): {proc.stderr[-2000:]}")


def _probe_duration(path: Path) -> float:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {proc.stderr[-500:]}")
    return float(proc.stdout.strip() or "0")


def _process_job(doc_id: str, author_key: str) -> None:
    doc = ch.get_document(doc_id, author_key)
    if not doc:
        raise RuntimeError(f"document {doc_id} not found")
    body = doc["body"]
    video_ref = _find_video_ref(body)
    object_key = str(video_ref["value"])
    prefix = hls_prefix(object_key)
    renditions = _parse_renditions(settings.HLS_RENDITIONS)

    _set_transcoding_settings(doc_id, author_key, body, {"enabled": False, "status": "processing"})

    s3 = media_svc.get_s3_client()
    tmp = Path(tempfile.mkdtemp(prefix="hls-"))
    try:
        # 1. Pull the raw file from the object store (internal endpoint).
        raw_path = tmp / "raw"
        logger.info("[transcode] downloading raw — key=%s", object_key)
        s3.download_file(settings.S3_BUCKET, object_key, str(raw_path))
        duration = _probe_duration(raw_path)
        logger.info("[transcode] raw downloaded — %s bytes, duration=%.2fs", raw_path.stat().st_size, duration)

        # 2. Transcode each rendition: HLS segments + variant manifest.
        variants = []
        for r in renditions:
            tag = f"{r['height']}p"
            out_dir = tmp / tag
            out_dir.mkdir()
            _run_ffmpeg(
                [
                    "-i", str(raw_path),
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                    "-vf", f"scale={r['width']}:{r['height']}",
                    "-b:v", r["bitrate"],
                    "-c:a", "aac", "-b:a", "128k",
                    "-hls_time", "6", "-hls_list_size", "0",
                    "-hls_segment_filename", str(out_dir / "seg%d.ts"),
                    str(out_dir / "index.m3u8"),
                ],
                label=f"rendition {tag}",
            )
            files = sorted(out_dir.iterdir())
            logger.info("[transcode] rendition %s — %s files, uploading to %s/", tag, len(files), f"{prefix}/{tag}")
            for f in files:
                s3.upload_file(str(f), settings.S3_BUCKET, f"{prefix}/{tag}/{f.name}")
            variants.append(
                {
                    "width": r["width"],
                    "height": r["height"],
                    "fps": 30,
                    "bitrate_kbps": int(r["bitrate"].rstrip("Mk")) * (1000 if r["bitrate"].endswith("M") else 1),
                    "codec": "h264",
                    "duration_seconds": round(duration, 1),
                    "url": {"type": "minio", "value": f"{prefix}/{tag}/index.m3u8"},
                }
            )

        # 3. Thumbnails (0s + mid-point) for the feed.
        thumbnails = []
        for ts in sorted({0, int(duration // 2)}):
            thumb_name = f"thumb-{ts}s.jpg"
            thumb_path = tmp / thumb_name
            _run_ffmpeg(
                ["-ss", str(ts), "-i", str(raw_path), "-frames:v", "1", "-vf", "scale=640:360", "-q:v", "3", str(thumb_path)],
                label=f"thumbnail {ts}s",
            )
            s3.upload_file(str(thumb_path), settings.S3_BUCKET, f"{prefix}/{thumb_name}")
            thumbnails.append(
                {"width": 640, "height": 360, "timestamp_seconds": ts, "url": {"type": "minio", "value": f"{prefix}/{thumb_name}"}}
            )

        # 4. The document becomes the manifest (transcoding-foundation.md).
        _set_transcoding_settings(
            doc_id,
            author_key,
            body,
            {"enabled": True, "status": "done", "variants": variants, "thumbnails": thumbnails},
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)