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

import json
import logging
import math
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
_pending: set[tuple[str, str]] = set()
_pending_lock = threading.Lock()


def submit_transcode_job(doc_id: str, author_key: str) -> None:
    """Enqueue once per process while queued/running; restart permits recovery."""
    _ensure_started()
    with _pending_lock:
        job = (doc_id, author_key)
        if job in _pending:
            return
        _pending.add(job)
        logger.info(
            "[transcode] job queued — doc_id=%s author=%s queue_size=%s", doc_id, author_key, _job_queue.qsize()
        )
        _job_queue.put(job)


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
        try:
            doc_id, author_key = _job_queue.get(timeout=60 if settings.HLS_RECOVERY_ENABLED else None)
        except queue.Empty:
            try:
                from app.services.transcode_recovery import recover_one

                recover_one()
            except Exception as error:
                logger.error("[transcode-recovery] maintenance unavailable: %s", type(error).__name__)
            continue
        started = time.time()
        try:
            _process_job(doc_id, author_key)
            logger.info("[transcode] job done — doc_id=%s in %.1fs", doc_id, time.time() - started)
        except Exception as e:
            logger.exception("[transcode] job FAILED — doc_id=%s: %s", doc_id, e)
            _mark_failed(doc_id, author_key, str(e))
        finally:
            with _pending_lock:
                _pending.discard((doc_id, author_key))
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


class RecoveryObsolete(Exception):
    """Maintenance must not recreate or overwrite replaced/completed media."""


def _recovery_document(doc_id, author_key, source, *, allow_processing=False):
    from app.services.transcode_recovery import eligible_source

    doc = ch.get_document_version(doc_id, author_key)
    if eligible_source(doc, author_key, allow_processing=allow_processing) != source:
        raise RecoveryObsolete()
    return doc


def _set_transcoding_settings(
    doc_id: str, author_key: str, base_body: dict, ts: dict, service: str, *, recovery_source: str | None = None
) -> None:
    """Merge transcoding_settings into the document body (new version).

    `service` is the document's OWN collection — the update must preserve it
    (a media_metadata doc updated into `media` would split the doc across
    collections: readers of the original collection never see the settings).
    """
    if recovery_source is not None:
        live = _recovery_document(doc_id, author_key, recovery_source, allow_processing=True)
        base_body, service = live["body"], live["service"]
    merged = {**base_body, "transcoding_settings": ts}
    if ts.get("status") == "done" and not merged.get("thumbnail_object_key") and ts.get("thumbnails"):
        merged["thumbnail_object_key"] = ts["thumbnails"][0]["url"]["value"]
    ch.update_document(doc_id=doc_id, author_key=author_key, service=service, body=merged)
    logger.info("[transcode] document updated — doc_id=%s status=%s", doc_id, ts.get("status"))


def _mark_failed(doc_id: str, author_key: str, error: str, *, recovery_source: str | None = None) -> None:
    try:
        doc = (
            ch.get_document(doc_id, author_key)
            if recovery_source is None
            else _recovery_document(doc_id, author_key, recovery_source, allow_processing=True)
        )
        if doc:
            _set_transcoding_settings(
                doc_id,
                author_key,
                doc["body"],
                {"enabled": False, "status": "failed", "error": error},
                doc.get("service") or "media",
                recovery_source=recovery_source,
            )
    except RecoveryObsolete:
        logger.info("[transcode-recovery] failure status skipped; canonical media changed")
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


def _ffmpeg_budget(duration_seconds: float | None = None) -> int:
    """Twice source duration, ten-minute floor, operator ceiling always wins."""
    duration = duration_seconds or 0
    if not math.isfinite(duration) or duration < 0:
        raise ValueError("invalid source duration for transcode budget")
    ceiling = max(1, settings.HLS_FFMPEG_TIMEOUT)
    return min(ceiling, max(600, math.ceil(min(duration, ceiling) * 2)))


def _run_ffmpeg(args: list[str], label: str, duration_seconds: float | None = None) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args]
    timeout = _ffmpeg_budget(duration_seconds)
    logger.info("[transcode] ffmpeg %s — timeout=%ss — %s", label, timeout, " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
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
    """Display (width, height, fps), matching ffmpeg's default autorotation."""
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate:stream_side_data=rotation",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe dimensions failed: {proc.stderr[-500:]}")
    # CSV includes extra fields/rows for display-matrix side data on phone
    # uploads. Read named fields instead of unpacking an assumed three columns.
    streams = json.loads(proc.stdout).get("streams") or []
    if not streams:
        raise RuntimeError("ffprobe found no video stream")
    stream = streams[0]
    width, height = int(stream["width"]), int(stream["height"])
    if width <= 0 or height <= 0:
        raise RuntimeError("ffprobe returned invalid video dimensions")
    rotation = next((float(side["rotation"]) for side in stream.get("side_data_list", []) if "rotation" in side), 0)
    # FFmpeg rotates before the scale filter. Plan using the same orientation,
    # or a portrait phone recording gets stretched back into encoded landscape.
    if math.isclose(abs(rotation) % 180, 90, abs_tol=0.01):
        width, height = height, width
    num, _, den = stream.get("r_frame_rate", "0/0").partition("/")
    denominator = float(den or 1)
    fps = float(num) / denominator if denominator else 0
    fps = round(fps) or 30
    logger.info("[transcode] video probe — display=%sx%s fps=%s rotation=%s", width, height, fps, rotation)
    return width, height, fps


def _process_job(doc_id: str, author_key: str, *, recovery_source: str | None = None) -> None:
    doc = (
        ch.get_document(doc_id, author_key)
        if recovery_source is None
        else _recovery_document(doc_id, author_key, recovery_source)
    )
    if not doc:
        raise RuntimeError(f"document {doc_id} not found")
    body = doc["body"]
    video_ref = _find_video_ref(body)
    object_key = str(video_ref["value"])
    prefix = hls_prefix(object_key)
    renditions = _parse_renditions(settings.HLS_RENDITIONS)

    _set_transcoding_settings(
        doc_id,
        author_key,
        body,
        {"enabled": False, "status": "processing"},
        doc.get("service") or "media",
        recovery_source=recovery_source,
    )

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
                duration_seconds=duration,
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
            doc.get("service") or "media",
            recovery_source=recovery_source,
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
