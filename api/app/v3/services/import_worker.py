"""In-process import worker (the YouTube importer — plan "port your YouTube").

The same idiom as the D44 transcode worker: bounded daemon threads, a queue,
started at boot. The difference: the queue is DURABLE — a row in the
import_jobs ClickHouse table — so a node restart doesn't lose a job: at boot,
every job in a non-terminal phase is re-submitted, and the pipeline is
idempotent (origin_id dedup), so a re-run never duplicates.

Flow (one job):
  1. stream the export parts (tar or zip, any split size — Takeout's default
     is tar split into ~2GB parts) from MinIO to a temp dir,
  2. parse the JSON members (the platform importer — pure),
  3. ensure the user's followers group (the owner-only home for staged
     content — D19/D30),
  4. upload the thumbnails (download -> MinIO -> media_metadata),
  5. write the posts (staging_posts, attached to the followers group,
     created_at = the original publish date),
  6. write the comments (ref_value = the imported post's doc_id — the D62
     join),
  7. write the profile (only if the user has none),
  8. mark COMPLETE and DELETE the export from MinIO (the privacy promise: the
     node never keeps the raw export).

The job row is the status surface: the client polls GET /v3/imports/{job_id}.
"""

import json
import logging
import queue
import shutil
import tarfile
import tempfile
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import requests

import app.settings as settings
from app.services import media as media_svc
from app.services.importers import PARSERS
from app.v3.services import clickhouse as ch

logger = logging.getLogger("web10-import")

# Phases (the job row's `phase` column)
PENDING = "pending"  # created; the export parts are being uploaded
QUEUED = "queued"  # started; waiting for a worker thread
PROCESSING = "processing"  # a worker thread is running the pipeline
COMPLETE = "complete"
ERROR = "error"

_TERMINAL = (COMPLETE, ERROR)

# The canonical followers-group roles (the node-side twin of the social app's
# FOLLOWER_ROLES in data/groups.ts — the import pipeline writes server-side,
# so it can't go through /v3/groups/create).
FOLLOWER_ROLES = [
    {
        "name": "owner",
        "permissions": {
            "*": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll"],
            "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"],
        },
    },
    {
        "name": "member",
        "permissions": {"posts": ["readAll"]},
    },
]

_job_queue: queue.Queue = queue.Queue()
_start_lock = threading.Lock()
_started = False

_IMPORT_JOBS_DDL = """
CREATE TABLE IF NOT EXISTS import_jobs (
    job_id String,
    user_key String,
    platform String,
    phase String,
    object_keys String,
    total_records UInt64 DEFAULT 0,
    written_records UInt64 DEFAULT 0,
    skipped_records UInt64 DEFAULT 0,
    errors String,
    message String DEFAULT '',
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY job_id
"""

_JOB_COLUMNS = [
    "job_id",
    "user_key",
    "platform",
    "phase",
    "object_keys",
    "total_records",
    "written_records",
    "skipped_records",
    "errors",
    "message",
    "created_at",
    "updated_at",
    "deleted",
]


# ---------------------------------------------------------------------------
# Job table (the durable queue + status surface)
# ---------------------------------------------------------------------------


def ensure_import_jobs_schema() -> None:
    """Self-heal for pre-existing volumes (the DDL template only runs on a
    fresh ClickHouse) — same idiom as ensure_apps_schema."""
    try:
        ch.client.command(_IMPORT_JOBS_DDL)
    except Exception as e:
        logger.warning("[import] import_jobs schema ensure skipped: %s: %s", type(e).__name__, e)


def _now() -> datetime:
    return datetime.utcnow()


def _json(v) -> str:
    return json.dumps(v)


def _parse_json(s) -> object:
    try:
        return json.loads(s)
    except (TypeError, json.JSONDecodeError):
        return None


def create_import_job(job_id: str, user_key: str, platform: str, object_keys: list[str]) -> dict:
    now = _now()
    ch.client.insert(
        "import_jobs",
        [
            [
                job_id,
                user_key,
                platform,
                PENDING,
                _json(object_keys),
                0,
                0,
                0,
                "[]",
                "Job created — upload the export parts, then call start.",
                now,
                now,
                0,
            ]
        ],
        column_names=_JOB_COLUMNS,
    )
    return get_import_job(job_id) or {}


def get_import_job(job_id: str) -> dict | None:
    result = ch.client.query(
        "SELECT job_id, user_key, platform, phase, object_keys, total_records, "
        "written_records, skipped_records, errors, message, created_at, updated_at "
        "FROM (SELECT *, row_number() OVER (PARTITION BY job_id ORDER BY updated_at DESC) AS rn "
        "FROM import_jobs WHERE job_id = %(job_id)s AND deleted = 0) WHERE rn = 1",
        {"job_id": job_id},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "job_id": row[0],
        "user_key": row[1],
        "platform": row[2],
        "phase": row[3],
        "object_keys": _parse_json(row[4]) or [],
        "total_records": int(row[5]),
        "written_records": int(row[6]),
        "skipped_records": int(row[7]),
        "errors": _parse_json(row[8]) or [],
        "message": row[9],
        "created_at": row[10].isoformat() if isinstance(row[10], datetime) else row[10],
        "updated_at": row[11].isoformat() if isinstance(row[11], datetime) else row[11],
    }


def update_import_job(job_id: str, **fields) -> dict:
    """Merge fields into the job's latest row (a new version row).

    The updated_at is strictly-greater than the current latest (the
    ReplacingMergeTree dedup invariant — the same race the users-table
    password-change fix handled, 3.58.1): a tie or regression would let the
    OLD row win the dedup and the update would silently vanish.
    """
    existing = get_import_job(job_id)
    if not existing:
        raise ValueError(f"unknown import job: {job_id}")
    now = _now()
    try:
        current = datetime.fromisoformat(existing["updated_at"])
    except (TypeError, ValueError):
        current = None
    if current is not None and now <= current:
        now = current + timedelta(microseconds=1)
    ch.client.insert(
        "import_jobs",
        [
            [
                job_id,
                existing["user_key"],
                existing["platform"],
                fields.get("phase", existing["phase"]),
                _json(fields.get("object_keys", existing["object_keys"])),
                int(fields.get("total_records", existing["total_records"])),
                int(fields.get("written_records", existing["written_records"])),
                int(fields.get("skipped_records", existing["skipped_records"])),
                _json(fields.get("errors", existing["errors"])),
                fields.get("message", existing["message"]),
                datetime.fromisoformat(existing["created_at"]) if existing["created_at"] else now,
                now,
                0,
            ]
        ],
        column_names=_JOB_COLUMNS,
    )
    return get_import_job(job_id) or {}


def _resubmit_active_jobs() -> None:
    """At boot: re-queue every job in a non-terminal phase (a restart must not
    lose an import — the pipeline is idempotent, so a re-run is safe)."""
    try:
        result = ch.client.query(
            "SELECT job_id FROM (SELECT job_id, phase, "
            "row_number() OVER (PARTITION BY job_id ORDER BY updated_at DESC) AS rn "
            "FROM import_jobs WHERE deleted = 0) WHERE rn = 1 AND phase IN ('queued', 'processing')"
        )
        for (job_id,) in result.result_rows:
            logger.info("[import] boot: re-submitting active job %s", job_id)
            _job_queue.put(job_id)
    except Exception as e:
        logger.warning("[import] boot resubmit skipped: %s: %s", type(e).__name__, e)


# ---------------------------------------------------------------------------
# Worker lifecycle (the transcode-worker idiom)
# ---------------------------------------------------------------------------


def submit_import_job(job_id: str) -> None:
    """Enqueue an import job for the worker threads."""
    _ensure_started()
    logger.info("[import] job queued — job_id=%s queue_size=%s", job_id, _job_queue.qsize())
    _job_queue.put(job_id)


def start_workers() -> None:
    """Start the worker threads at app boot (idempotent)."""
    _ensure_started()


def _ensure_started() -> None:
    global _started
    with _start_lock:
        if _started:
            return
        ensure_import_jobs_schema()
        _resubmit_active_jobs()
        for i in range(max(1, settings.IMPORT_WORKER_CONCURRENCY)):
            t = threading.Thread(target=_worker_loop, daemon=True, name=f"import-worker-{i}")
            t.start()
        _started = True
        logger.info("[import] worker started — concurrency=%s", settings.IMPORT_WORKER_CONCURRENCY)


def _worker_loop() -> None:
    while True:
        job_id = _job_queue.get()
        started = time.time()
        try:
            _process_job(job_id)
            logger.info("[import] job done — job_id=%s in %.1fs", job_id, time.time() - started)
        except Exception as e:
            logger.exception("[import] job FAILED — job_id=%s: %s", job_id, e)
            _mark_error(job_id, str(e))
        finally:
            _job_queue.task_done()


def _mark_error(job_id: str, error: str) -> None:
    try:
        update_import_job(job_id, phase=ERROR, errors=[error[:500]], message=f"Import failed: {error[:200]}")
    except Exception:
        logger.exception("[import] could not mark job %s error", job_id)


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------


def _process_job(job_id: str) -> None:
    job = get_import_job(job_id)
    if not job:
        logger.warning("[import] job %s not found — dropping", job_id)
        return
    if job["phase"] in _TERMINAL:
        return
    parser = PARSERS.get(job["platform"])
    if not parser:
        _mark_error(job_id, f"no importer for platform: {job['platform']}")
        return

    user = job["user_key"]
    update_import_job(job_id, phase=PROCESSING, message="Downloading export from storage...")

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"import-{job_id[:8]}-"))
    try:
        _download_parts(job["object_keys"], tmp_dir)
        entries = _extract_json_entries(tmp_dir)
        records = parser(entries)
        update_import_job(
            job_id,
            total_records=len(records),
            message=f"Parsed {len(records)} records — writing to node...",
        )
        if not records:
            update_import_job(
                job_id,
                phase=ERROR,
                errors=["No importable records found in the export."],
                message="No importable records found",
            )
            return

        followers_group = ensure_followers_group(user)
        written, skipped, errors = _write_records(job_id, user, records, followers_group)
        update_import_job(
            job_id,
            phase=COMPLETE,
            written_records=written,
            skipped_records=skipped,
            errors=errors[:100],
            message=f"Import complete: {written} written, {skipped} skipped.",
        )
    finally:
        # The privacy promise: the raw export never survives the import.
        _delete_parts(job["object_keys"])
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _download_parts(object_keys: list[str], tmp_dir: Path) -> None:
    s3 = media_svc.get_s3_client()
    for i, key in enumerate(object_keys):
        dest = tmp_dir / f"part-{i:03d}"
        logger.info("[import] downloading part %s/%s — %s", i + 1, len(object_keys), key)
        s3.download_file(settings.S3_BUCKET, key, str(dest))


def _is_zip(path: Path) -> bool:
    with open(path, "rb") as f:
        return f.read(4) == b"PK\x03\x04"


def _extract_json_entries(tmp_dir: Path) -> list[tuple[str, bytes]]:
    """The JSON members of every part — tar or zip (Takeout's default is tar
    split into ~2GB parts, but the file type shouldn't matter)."""
    entries: list[tuple[str, bytes]] = []
    for part in sorted(tmp_dir.iterdir()):
        if not part.is_file() or part.stat().st_size == 0:
            continue
        if _is_zip(part):
            with zipfile.ZipFile(part, "r") as zf:
                for info in zf.infolist():
                    if info.is_dir() or not info.filename.lower().endswith(".json"):
                        continue
                    entries.append((info.filename, zf.read(info.filename)))
        else:
            with tarfile.open(part, "r:*") as tf:
                for member in tf.getmembers():
                    if not member.isfile() or not member.name.lower().endswith(".json"):
                        continue
                    f = tf.extractfile(member)
                    if f is None:
                        continue
                    entries.append((member.name, f.read()))
    return entries


def _delete_parts(object_keys: list[str]) -> None:
    try:
        s3 = media_svc.get_s3_client()
        for key in object_keys:
            s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)
            logger.info("[import] deleted export part from storage: %s", key)
    except Exception as e:
        logger.error("[import] failed to delete export parts: %s", e)


# ---------------------------------------------------------------------------
# Groups (the owner-only home for staged content)
# ---------------------------------------------------------------------------


def followers_group_id(user: str) -> str:
    """The deterministic followers group id (the same derivation the social
    app uses: {provider}/groups/users/{username}/followers — provider = the
    node's own host, which is what the token carries)."""
    return f"{settings.PROVIDER}/groups/users/{user}/followers"


def ensure_followers_group(user: str) -> str:
    """Ensure the user's followers group exists with the canonical roles and
    the user as owner member (the node-side twin of the social app's
    ensureFollowers). Idempotent."""
    group_id = followers_group_id(user)
    if not ch.get_group(group_id):
        ch.create_group(group_id, FOLLOWER_ROLES, "open")
        logger.info("[import] followers group created — %s", group_id)
    if not ch.get_group_member(group_id, user):
        ch.add_group_member(group_id, user, "owner")
        logger.info("[import] user enrolled as owner — %s in %s", user, group_id)
    return group_id


# ---------------------------------------------------------------------------
# The write pipeline (direct ClickHouse — no HTTP fan-out)
# ---------------------------------------------------------------------------


def _parse_iso_utc(ts: str | None) -> datetime | None:
    """Takeout's ISO timestamps ("2019-05-01T12:00:00Z") -> naive UTC (the
    documents table's DateTime64(3) is naive-UTC, like _now())."""
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _existing_origin_ids(user: str) -> tuple[set[tuple[str, str]], dict[str, str]]:
    """The idempotency pre-scan: the user's existing import origin_ids per
    service (a re-run skips what's already there). Also returns the existing
    staging posts' {origin_id: doc_id} — a re-run's comments must join the
    already-imported posts."""
    existing: set[tuple[str, str]] = set()
    post_ids: dict[str, str] = {}
    for service in ("staging_posts", "comments", "profile", "media_metadata"):
        result = ch.client.query(
            "SELECT doc_id, JSONExtractString(body, 'origin_id') FROM documents "
            "WHERE author_key = %(user)s AND collection_name = %(service)s AND deleted = 0",
            {"user": user, "service": service},
        )
        for doc_id, origin_id in result.result_rows:
            if origin_id:
                existing.add((service, origin_id))
                if service == "staging_posts":
                    post_ids[origin_id] = doc_id
    return existing, post_ids


def _user_has_profile(user: str) -> bool:
    result = ch.client.query(
        "SELECT count() FROM documents WHERE author_key = %(user)s AND collection_name = 'profile' AND deleted = 0",
        {"user": user},
    )
    return int(result.result_rows[0][0]) > 0


def _upload_thumbnail(user: str, url: str, origin_id: str, title: str | None) -> str:
    """Download a YouTube thumbnail and land it in the node's media store.
    Returns the media_metadata doc_id (the post's media_refs entry)."""
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.content  # thumbnails are small (tens of KB)
    filename = f"import-thumb-{uuid.uuid4().hex[:12]}.jpg"
    object_key = media_svc.make_object_key(user, filename)
    media_svc.get_s3_client().put_object(Bucket=settings.S3_BUCKET, Key=object_key, Body=data, ContentType="image/jpeg")
    metadata = {
        "object_key": object_key,
        "filename": filename,
        "mime_type": "image/jpeg",
        "size_bytes": len(data),
        "width": None,
        "height": None,
        "origin": "youtube",
        "origin_id": f"thumb_{origin_id}",
        "caption": (title or "")[:200] or None,
    }
    doc = ch.confirm_media_upload(user, metadata)
    return doc["doc_id"]


def _write_records(job_id: str, user: str, records: list[dict], followers_group: str) -> tuple[int, int, list[str]]:
    """Write the parsed records to the node. Returns (written, skipped, errors).

    Order matters (the D62 comment join):
      1. media — the thumbnails (download -> MinIO -> media_metadata),
      2. posts — staging_posts, attached to the followers group (owner-only
         until the staging UI publishes them — D19/D30),
      3. comments — ref_value = the imported post's doc_id,
      4. profile — only if the user has no profile doc yet.
    """
    errors: list[str] = []
    written = 0
    skipped = 0
    existing, existing_post_ids = _existing_origin_ids(user)

    def _progress(message: str) -> None:
        try:
            update_import_job(
                job_id,
                written_records=written,
                skipped_records=skipped,
                errors=errors[:100],
                message=message,
            )
        except Exception:
            logger.exception("[import] progress update failed — job_id=%s", job_id)

    # Phase 1 — media (the thumbnails). Bounded concurrency: a 10k-video
    # channel is 10k small downloads, and sequential would wall-clock for
    # nothing. A failed thumbnail is non-fatal — the post still imports.
    media_doc_ids: dict[str, str] = {}  # videoId -> media doc_id
    media_recs = [r for r in records if r["service"] == "staging_posts" and r.get("media_url")]
    todo = [r for r in media_recs if ("media_metadata", f"thumb_{r['origin_id']}") not in existing]
    if todo:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {
                pool.submit(
                    _upload_thumbnail,
                    user,
                    r["media_url"],
                    r["origin_id"],
                    (r["body"].get("text") or "").split("\n")[0],
                ): r
                for r in todo
            }
            done = 0
            for future in as_completed(futures):
                rec = futures[future]
                try:
                    media_doc_ids[rec["origin_id"]] = future.result()
                    written += 1
                except Exception as e:
                    skipped += 1
                    errors.append(f"[media] {rec['origin_id']}: {str(e)[:150]}")
                done += 1
                if done % 25 == 0:
                    _progress(f"Thumbnails: {done}/{len(todo)} uploaded...")

    # Phase 2 — posts (staging_posts). created_at = the original publish date
    # (the catalog keeps its real dates — "take your videos exactly").
    post_doc_ids: dict[str, str] = dict(existing_post_ids)
    for rec in [r for r in records if r["service"] == "staging_posts"]:
        oid = rec["origin_id"]
        if ("staging_posts", oid) in existing:
            skipped += 1
            continue
        body = dict(rec["body"])
        original_created = _parse_iso_utc(body.pop("created_at", None))
        if oid in media_doc_ids:
            body["media_refs"] = [media_doc_ids[oid]]
        doc = ch.insert_document(
            author_key=user,
            service="staging_posts",
            body=body,
            tags=body.get("tags", []),
            created_at=original_created,
        )
        ch.attach_doc_to_groups(doc["doc_id"], [followers_group])
        post_doc_ids[oid] = doc["doc_id"]
        written += 1
        if written % 25 == 0:
            _progress(f"Posts: {written} written...")

    # Phase 3 — comments (the D62 join: ref_value = the post's doc_id). A
    # comment whose post wasn't imported is an orphan — skipped, not written.
    for rec in [r for r in records if r["service"] == "comments"]:
        oid = rec["origin_id"]
        if ("comments", oid) in existing:
            skipped += 1
            continue
        ref = post_doc_ids.get(rec.get("ref_origin_id") or "")
        if not ref:
            skipped += 1
            errors.append(f"[comments] {oid}: no post for video {rec.get('ref_origin_id')}")
            continue
        body = dict(rec["body"])
        original_created = _parse_iso_utc(body.pop("created_at", None))
        doc = ch.insert_document(
            author_key=user,
            service="comments",
            body=body,
            ref_value=ref,
            created_at=original_created,
        )
        ch.attach_doc_to_groups(doc["doc_id"], [followers_group])
        written += 1
        if written % 25 == 0:
            _progress(f"Comments: {written} written...")

    # Phase 4 — profile (the channel -> the creator profile). Never overwrite
    # an existing profile — the user's current profile wins.
    profile_recs = [r for r in records if r["service"] == "profile"]
    if profile_recs:
        if _user_has_profile(user):
            skipped += 1
            _progress("Profile: kept the existing one (not overwritten by the import)")
        else:
            body = dict(profile_recs[0]["body"])
            doc = ch.insert_document(author_key=user, service="profile", body=body)
            ch.attach_doc_to_groups(doc["doc_id"], [followers_group])
            written += 1

    return written, skipped, errors
