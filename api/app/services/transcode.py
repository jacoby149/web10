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
            _set_transcoding_settings(
                doc_id, author_key, doc["body"], {"enabled": False, "status": "failed", "error": error}
            )
    except Exception:
        logger.exception("[transcode] could not mark doc failed — doc_id=%s", doc_id)


def _parse_renditions(spec: str) -> list[dict]:
    """Parse HLS_RENDITIONS ("640x360@1M,1280x720@3M").

    The HEIGHT is the target (renditions are named 360p/720p/1080p by it);
    the width in the spec is nominal — the actual output width is derived
    from the source aspect ratio in _plan_renditions (video-experience.md:
    the node is ratio-agnostic, targeting is by height).
    """
    renditions = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        size, _, bitrate = part.partition("@")
        _, _, height_s = size.lower().partition("x")
        renditions.append({"height": int(height_s), "bitrate": bitrate or "1M"})
    if not renditions:
        raise RuntimeError(f"no valid renditions in HLS_RENDITIONS={spec!r}")
    return renditions


def _plan_renditions(src_w: int, src_h: int, spec: list[dict]) -> list[dict]:
    """Plan the actual output renditions for a source of src_w x src_h.

    Aspect-ratio policy (video-experience.md): preserve the source ratio,
    target by height, never upscale, keep dimensions even (H.264). A 1080x1920
    (9:16) source plans to 360x640 / 720x1280 / 1080x1920; a 1920x1080 source
    to 640x360 / 1280x720 / 1920x1080. Renditions taller than the source are
    dropped (upscaling is pure waste); a source smaller than every target
    gets one rendition at its own (evened) resolution.
    """
    ratio = src_w / src_h
    planned: list[dict] = []
    for r in sorted(spec, key=lambda x: x["height"]):
        th = r["height"]
        if th > src_h:
            continue  # no upscaling
        tw = max(2, int(th * ratio // 2) * 2)
        tw = min(tw, src_w // 2 * 2)
        tag = f"{th}p"
        if any(p["tag"] == tag for p in planned):
            continue
        planned.append({"tag": tag, "width": tw, "height": th, "bitrate": r["bitrate"]})
    if not planned:
        # Tiny source — one rendition at source resolution, lowest bitrate.
        tw, th = src_w // 2 * 2, src_h // 2 * 2
        planned.append({"tag": f"{th}p", "width": max(2, tw), "height": max(2, th), "bitrate": spec[0]["bitrate"]})
    return planned


def _thumbnail_dims(src_w: int, src_h: int, box_w: int = 640, box_h: int = 360) -> tuple[int, int]:
    """Fit the source into the thumbnail box, preserving ratio (upscaling
    allowed — thumbnails are small; soft beats cropped)."""
    scale = min(box_w / src_w, box_h / src_h)
    return max(2, int(src_w * scale // 2) * 2), max(2, int(src_h * scale // 2) * 2)


def _run_ffmpeg(args: list[str], label: str) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args]
    logger.info("[transcode] ffmpeg %s — %s", label, " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=settings.HLS_FFMPEG_TIMEOUT)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg {label} failed (rc={proc.returncode}): {proc.stderr[-2000:]}")


def _probe_duration(path: Path) -> float:
    # Format duration first; webm (browser MediaRecorder output) often has
    # format.duration = N/A — fall back to the video stream's duration.
    for entries in ("format=duration", "stream=duration"):
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                entries,
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {proc.stderr[-500:]}")
        val = proc.stdout.strip().splitlines()[0].strip() if proc.stdout.strip() else ""
        if val and val != "N/A":
            return float(val)
    return 0.0


def _probe_dimensions(path: Path) -> tuple[int, int, float]:
    """(width, height, fps) of the first video stream."""
    proc = subprocess.run(
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
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe dimensions failed: {proc.stderr[-500:]}")
    # csv=p=0 → "720,1280,15/1" (width,height,r_frame_rate) — three values.
    w_s, h_s, fps_s = proc.stdout.strip().split(",")
    num, _, den = fps_s.partition("/")
    fps = float(num) / float(den or 1)
    return int(w_s), int(h_s), round(fps) or 30


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
        src_w, src_h, fps = _probe_dimensions(raw_path)
        logger.info(
            "[transcode] raw downloaded — %s bytes, %sx%s@%sfps, duration=%.2fs",
            raw_path.stat().st_size,
            src_w,
            src_h,
            fps,
            duration,
        )

        # 2. Transcode each planned rendition: HLS segments + variant manifest.
        #    Dimensions come from _plan_renditions (source-ratio-preserving,
        #    target-by-height, no upscaling) — never the nominal spec width.
        planned = _plan_renditions(src_w, src_h, renditions)
        logger.info("[transcode] planned renditions — %s", [(p["tag"], f"{p['width']}x{p['height']}") for p in planned])
        variants = []
        for r in planned:
            tag = r["tag"]
            out_dir = tmp / tag
            out_dir.mkdir()
            _run_ffmpeg(
                [
                    "-i",
                    str(raw_path),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-pix_fmt",
                    "yuv420p",
                    "-vf",
                    f"scale={r['width']}:{r['height']}",
                    "-b:v",
                    r["bitrate"],
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-hls_time",
                    "6",
                    "-hls_list_size",
                    "0",
                    "-hls_segment_filename",
                    str(out_dir / "seg%d.ts"),
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
                    "fps": fps,
                    "bitrate_kbps": int(r["bitrate"].rstrip("Mk")) * (1000 if r["bitrate"].endswith("M") else 1),
                    "codec": "h264",
                    "duration_seconds": round(duration, 1),
                    "url": {"type": "minio", "value": f"{prefix}/{tag}/index.m3u8"},
                }
            )

        # 3. Thumbnails (0s + mid-point) for the feed — ratio-preserving fit
        #    in the 640x360 box (a 9:16 video gets a 202x360-ish thumb, not a
        #    squashed 640x360).
        thumb_w, thumb_h = _thumbnail_dims(src_w, src_h)
        thumbnails = []
        for ts in sorted({0, int(duration // 2)}):
            thumb_name = f"thumb-{ts}s.jpg"
            thumb_path = tmp / thumb_name
            _run_ffmpeg(
                [
                    "-ss",
                    str(ts),
                    "-i",
                    str(raw_path),
                    "-frames:v",
                    "1",
                    "-vf",
                    f"scale={thumb_w}:{thumb_h}",
                    "-q:v",
                    "3",
                    str(thumb_path),
                ],
                label=f"thumbnail {ts}s",
            )
            s3.upload_file(str(thumb_path), settings.S3_BUCKET, f"{prefix}/{thumb_name}")
            thumbnails.append(
                {
                    "width": thumb_w,
                    "height": thumb_h,
                    "timestamp_seconds": ts,
                    "url": {"type": "minio", "value": f"{prefix}/{thumb_name}"},
                }
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
