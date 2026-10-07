"""In-process import worker (the YouTube importer — plan "port your YouTube").

The same idiom as the D44 transcode worker: bounded daemon threads, a queue,
started at boot. The difference: the queue is DURABLE — a row in the
import_jobs ClickHouse table — so a node restart doesn't lose a job: at boot,
every job in a non-terminal phase is re-submitted, and the pipeline is
idempotent (origin_id dedup), so a re-run never duplicates.

Flow (one job):
  1. stream the export parts (tar or zip, any split size — Takeout's default
     is tar split into ~2GB parts) from MinIO to a temp dir,
  2. parse the data members (CSV/JSON — Takeout exports YouTube as CSV) via the
     platform importer (pure),
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
from datetime import UTC, datetime, timedelta
from pathlib import Path

import requests
from fastapi import HTTPException

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

# Takeout supports 50 GiB parts; MAX_UPLOAD_SIZE is for individual media, not
# exports. Metadata stays in RAM, while video members are never read here.
MAX_PART_BYTES = 50 * 1024**3
MAX_EXPANDED_PART_BYTES = 100 * 1024**3
MAX_METADATA_MEMBER_BYTES = 64 * 1024**2
MAX_METADATA_BYTES = 128 * 1024**2  # across ALL parts in a job
MAX_ARCHIVE_MEMBERS = 100_000  # across all parts, including ignored files
MAX_ZIP_DIRECTORY_BYTES = 32 * 1024**2
MAX_TAR_HEADER_BYTES = 1024**2  # PAX / GNU long-name payloads are read by tarfile
MAX_QUEUED_JOBS = 100

_job_queue: queue.Queue = queue.Queue(maxsize=MAX_QUEUED_JOBS)
_submission_lock = threading.Lock()
_submitted_jobs: set[str] = set()
_start_lock = threading.Lock()
_started = False

_IMPORT_JOBS_DDL = """
CREATE TABLE IF NOT EXISTS import_jobs (
    job_id String,
    user_key String,
    platform String,
    phase String,
    object_keys String,
    target_group_id String DEFAULT '',
    total_records UInt64 DEFAULT 0,
    written_records UInt64 DEFAULT 0,
    skipped_records UInt64 DEFAULT 0,
    progress UInt8 DEFAULT 0,
    errors String,
    message String DEFAULT '',
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0,
    authorization String DEFAULT ''
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY job_id
"""

_JOB_COLUMNS = [
    "job_id",
    "user_key",
    "platform",
    "phase",
    "object_keys",
    "target_group_id",
    "total_records",
    "written_records",
    "skipped_records",
    "progress",
    "errors",
    "message",
    "created_at",
    "updated_at",
    "deleted",
    "authorization",
]


# ---------------------------------------------------------------------------
# Job table (the durable queue + status surface)
# ---------------------------------------------------------------------------


def ensure_import_jobs_schema() -> None:
    """Self-heal for pre-existing volumes (the DDL template only runs on a
    fresh ClickHouse) — same idiom as ensure_apps_schema."""
    try:
        ch.client.command(_IMPORT_JOBS_DDL)
        # import_jobs.progress — the 0-100 import percentage (the client's
        # progress bar). Pre-existing volumes predate the column; ADD COLUMN
        # appends it at the end, which is why inserts name their columns.
        ch.client.command("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS progress UInt8 DEFAULT 0")
        # import_jobs.target_group_id — the group the import writes into (the
        # "port your channel into a page" flow). Empty = the followers group
        # (the pre-group-targeting default). Pre-existing volumes predate the
        # column; ADD COLUMN appends it at the end.
        ch.client.command("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS target_group_id String DEFAULT ''")
        ch.client.command("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS authorization String DEFAULT ''")
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


def create_import_job(
    job_id: str,
    user_key: str,
    platform: str,
    object_keys: list[str],
    target_group_id: str = "",
    authorization: dict | None = None,
) -> dict:
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
                target_group_id or "",
                0,
                0,
                0,
                0,
                "[]",
                "Job created — upload the export parts, then call start.",
                now,
                now,
                0,
                _json(authorization) if authorization else "",
            ]
        ],
        column_names=_JOB_COLUMNS,
    )
    return get_import_job(job_id) or {}


def get_import_job(job_id: str) -> dict | None:
    result = ch.client.query(
        "SELECT job_id, user_key, platform, phase, object_keys, target_group_id, "
        "total_records, written_records, skipped_records, progress, errors, message, created_at, updated_at, authorization "
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
        "target_group_id": row[5] or "",
        "total_records": int(row[6]),
        "written_records": int(row[7]),
        "skipped_records": int(row[8]),
        "progress": int(row[9]),
        "errors": _parse_json(row[10]) or [],
        "message": row[11],
        "created_at": row[12].isoformat() if isinstance(row[12], datetime) else row[12],
        "updated_at": row[13].isoformat() if isinstance(row[13], datetime) else row[13],
        "authorization": _parse_json(row[14]) if len(row) > 14 else None,
    }


def _clamp_progress(v) -> int:
    """The progress column is UInt8 — clamp any computed percentage to 0..100
    so a miscount can't overflow the column (or go negative)."""
    try:
        n = int(v)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, n))


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
                existing.get("target_group_id", ""),
                int(fields.get("total_records", existing["total_records"])),
                int(fields.get("written_records", existing["written_records"])),
                int(fields.get("skipped_records", existing["skipped_records"])),
                _clamp_progress(fields.get("progress", existing.get("progress", 0))),
                _json(fields.get("errors", existing["errors"])),
                fields.get("message", existing["message"]),
                datetime.fromisoformat(existing["created_at"]) if existing["created_at"] else now,
                now,
                0,
                _json(fields.get("authorization", existing.get("authorization")))
                if fields.get("authorization", existing.get("authorization"))
                else "",
            ]
        ],
        column_names=_JOB_COLUMNS,
    )
    return get_import_job(job_id) or {}


def _resubmit_active_jobs() -> None:
    """At boot: re-queue every job in a non-terminal phase (a restart must not
    lose an import — the pipeline is idempotent, so a re-run is safe)."""
    try:
        last_job_id = ""
        while True:
            result = ch.client.query(
                "SELECT job_id FROM (SELECT job_id, phase, "
                "row_number() OVER (PARTITION BY job_id ORDER BY updated_at DESC) AS rn "
                "FROM import_jobs WHERE deleted = 0) WHERE rn = 1 AND phase IN ('queued', 'processing') "
                "AND job_id > %(last_job_id)s ORDER BY job_id LIMIT 100",
                {"last_job_id": last_job_id},
            )
            if not result.result_rows:
                break
            # Advance by the last key instead of OFFSET: completed jobs vanish
            # from the active set while recovery is running.
            for (job_id,) in result.result_rows:
                while True:
                    try:
                        submit_import_job(job_id)
                        break
                    except queue.Full:
                        time.sleep(0.1)
            last_job_id = result.result_rows[-1][0]
    except Exception as e:
        logger.warning("[import] boot resubmit skipped: %s: %s", type(e).__name__, e)


# ---------------------------------------------------------------------------
# Worker lifecycle (the transcode-worker idiom)
# ---------------------------------------------------------------------------


def submit_import_job(job_id: str) -> None:
    """Enqueue an import job for the worker threads."""
    _ensure_started()
    with _submission_lock:
        if job_id in _submitted_jobs:
            return
        # A recovery page or concurrent start may be stale by admission time.
        job = get_import_job(job_id)
        if job and job["phase"] == COMPLETE:
            return
        if _job_queue.full():
            logger.warning("[import] queue full — job_id=%s", job_id)
            raise queue.Full
        # Persist only after admission, and before a worker can pick it up.
        update_import_job(job_id, phase=QUEUED, message="Queued — waiting for a worker...")
        _submitted_jobs.add(job_id)
        _job_queue.put_nowait(job_id)
        logger.info("[import] job queued — job_id=%s queue_size=%s", job_id, _job_queue.qsize())


def start_workers() -> None:
    """Start the worker threads at app boot (idempotent)."""
    _ensure_started()


def _ensure_started() -> None:
    global _started
    with _start_lock:
        if _started:
            return
        ensure_import_jobs_schema()
        for i in range(max(1, settings.IMPORT_WORKER_CONCURRENCY)):
            t = threading.Thread(target=_worker_loop, daemon=True, name=f"import-worker-{i}")
            t.start()
        _started = True
        threading.Thread(target=_resubmit_active_jobs, daemon=True, name="import-recovery").start()
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
            with _submission_lock:
                _submitted_jobs.discard(job_id)
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

    def authorize():
        authorize_import_job(job)

    try:
        authorize()
    except Exception:
        # A terminal authorization failure must not retain the raw export.
        _delete_parts(job["object_keys"])
        raise
    update_import_job(job_id, phase=PROCESSING, progress=0, message="Downloading export from storage...")

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"import-{job_id[:8]}-"))
    try:
        _download_parts(job["object_keys"], tmp_dir)
        # Download + parse are indeterminate (the record count isn't known
        # until the parse) — progress stays 0 with a live message; the
        # percentage starts counting once the write phase knows its total.
        update_import_job(job_id, message="Extracting and parsing the export...")
        entries = _extract_data_entries(tmp_dir)
        records = parser(entries)
        update_import_job(
            job_id,
            total_records=len(records),
            progress=0,
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

        # Resolve the target group. An explicit target_group_id (validated as
        # user-owned at create time) is a PAGE import — the channel becomes the
        # group's face (group-as-profile, D60). Absent → the legacy followers
        # group + personal profile.
        target_group_id = job.get("target_group_id") or ""
        authorize()
        if target_group_id:
            target_group = target_group_id
            as_page = True
        else:
            target_group = ensure_followers_group(user, authorize)
            as_page = False
        written, skipped, errors = _write_records(job_id, user, records, target_group, as_page, authorize)
        update_import_job(
            job_id,
            phase=COMPLETE,
            written_records=written,
            skipped_records=skipped,
            progress=100,
            errors=errors[:100],
            message=f"Import complete: {written} written, {skipped} skipped.",
        )
    finally:
        # The privacy promise: the raw export never survives the import.
        _delete_parts(job["object_keys"])
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _download_parts(object_keys: list[str], tmp_dir: Path) -> None:
    if not 1 <= len(object_keys) <= settings.IMPORT_MAX_PARTS:
        raise ValueError("import part count exceeds limit")
    s3 = media_svc.get_s3_client()
    for i, key in enumerate(object_keys):
        dest = tmp_dir / f"part-{i:03d}"
        logger.info("[import] downloading part %s/%s — %s", i + 1, len(object_keys), key)
        response = s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
        body = response["Body"]
        try:
            if not 0 < response["ContentLength"] <= MAX_PART_BYTES:
                raise ValueError("import part exceeds upload size limit")
            size = 0
            with dest.open("wb") as output:
                while chunk := body.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_PART_BYTES:
                        raise ValueError("import part exceeds upload size limit")
                    output.write(chunk)
            if size != response["ContentLength"]:
                raise ValueError("import part size changed during download")
        finally:
            body.close()


def _is_zip(path: Path) -> bool:
    with open(path, "rb") as f:
        return f.read(4) == b"PK\x03\x04"


def _extract_data_entries(tmp_dir: Path) -> list[tuple[str, bytes]]:
    """The data members (CSV + JSON) of every part — tar or zip. Takeout exports
    YouTube as CSV (video metadata/videos.csv, comments/comments.csv,
    channels/channel.csv); JSON is kept for future/other platforms. The video
    MP4s are deliberately NOT read here (27GB) — the metadata import only.
    Split exports are multiple parts; each is a standalone archive."""
    entries: list[tuple[str, bytes]] = []
    metadata_bytes = 0
    member_count = 0
    exts = (".csv", ".json")
    parts = sorted(tmp_dir.iterdir())
    if len(parts) > settings.IMPORT_MAX_PARTS:
        raise ValueError("import part count exceeds limit")
    for part in parts:
        if not part.is_file() or part.stat().st_size == 0:
            continue
        if part.stat().st_size > MAX_PART_BYTES:
            raise ValueError("import part exceeds upload size limit")
        expanded_bytes = 0

        def check_member(name, size):
            nonlocal member_count, expanded_bytes, metadata_bytes
            member_count += 1
            expanded_bytes += size
            if member_count > MAX_ARCHIVE_MEMBERS or expanded_bytes > MAX_EXPANDED_PART_BYTES:
                raise ValueError("archive member count or expanded size exceeds limit")
            if name.lower().endswith(exts):
                metadata_bytes += size
                if size > MAX_METADATA_MEMBER_BYTES or metadata_bytes > MAX_METADATA_BYTES:
                    raise ValueError("archive metadata size exceeds limit")

        if _is_zip(part):
            # ZipFile materializes the central directory before infolist().
            # Inspect its EOCD (including ZIP64) first to bound that allocation.
            with part.open("rb") as source:
                end = zipfile._EndRecData(source)
            if (
                not end
                or end[zipfile._ECD_SIZE] > MAX_ZIP_DIRECTORY_BYTES
                or end[zipfile._ECD_ENTRIES_TOTAL] + member_count > MAX_ARCHIVE_MEMBERS
            ):
                raise ValueError("ZIP directory exceeds limit")
            with zipfile.ZipFile(part, "r") as zf:
                for info in zf.infolist():
                    check_member(info.filename, info.file_size)
                for info in zf.infolist():
                    if info.is_dir() or not info.filename.lower().endswith(exts):
                        continue
                    with zf.open(info) as source:
                        data = source.read(min(MAX_METADATA_MEMBER_BYTES, info.file_size) + 1)
                    if len(data) != info.file_size:
                        raise ValueError("ZIP metadata size mismatch")
                    entries.append((info.filename, data))
        else:

            class BoundedTarInfo(tarfile.TarInfo):
                def _proc_member(self, archive):
                    # Extension headers are consumed inside tarfile before
                    # iteration yields a member, so gate their reads there.
                    if self.type in (
                        tarfile.XHDTYPE,
                        tarfile.XGLTYPE,
                        tarfile.SOLARIS_XHDTYPE,
                        tarfile.GNUTYPE_LONGNAME,
                        tarfile.GNUTYPE_LONGLINK,
                    ):
                        if self.size > MAX_TAR_HEADER_BYTES:
                            raise ValueError("tar extension header exceeds limit")
                        check_member(self.name, self.size)
                    return super()._proc_member(archive)

            # Streaming mode avoids an unbounded getmembers() list. Large
            # ignored video members are traversed, not materialized in RAM.
            with tarfile.open(part, "r|*", tarinfo=BoundedTarInfo) as tf:
                for member in tf:
                    check_member(member.name, member.size)
                    if not member.isfile() or not member.name.lower().endswith(exts):
                        continue
                    f = tf.extractfile(member)
                    if f is None:
                        continue
                    with f:
                        data = f.read(min(MAX_METADATA_MEMBER_BYTES, member.size) + 1)
                    if len(data) != member.size:
                        raise ValueError("tar metadata size mismatch")
                    entries.append((member.name, data))
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


def ensure_followers_group(user: str, authorize=None) -> str:
    """Ensure the user's followers group exists with the canonical roles and
    the user as owner member (the node-side twin of the social app's
    ensureFollowers). Idempotent."""
    group_id = followers_group_id(user)
    if not ch.get_group(group_id):
        if authorize:
            authorize()
        ch.create_group(group_id, FOLLOWER_ROLES, "open")
        logger.info("[import] followers group created — %s", group_id)
        # The initial owner row is part of creating the authorized new group.
        ch.add_group_member(group_id, user, "owner")
        return group_id
    if not ch.get_group_member(group_id, user):
        if authorize:
            authorize()
        ch.add_group_member(group_id, user, "owner")
        logger.info("[import] user enrolled as owner — %s in %s", user, group_id)
    return group_id


# The app-named group-identity service (the group's face — D60: app data in an
# app-named service, not a platform table). The social app's constant is
# `web10-social-group-identity`; the page import writes the channel into it.
GROUP_IDENTITY_SERVICE = "web10-social-group-identity"


def import_permissions(target_group_id: str) -> dict:
    # Match the existing pipeline's reads/writes; do not grant the importer
    # authority over any new service or app concept.
    required = {
        service: ["readAll", "create"] for service in ("staging_posts", "comments", "media_metadata", "profile")
    }
    if target_group_id:
        required["profile"] = ["readAll"]
        required[GROUP_IDENTITY_SERVICE] = ["readAll", "create"]
    required["imports"] = ["create"]
    required["group"] = ["createGroup", "manageRoles", "assignRoles"]
    return required


def authorize_import_job(job: dict) -> None:
    """Re-check recorded credential lifetime, live contract, and current roles."""
    from app.services.auth import _utc, validate_app_origin

    scope = job.get("authorization") or {}
    if scope.get("credential_kind") not in ("self", "app"):
        raise HTTPException(status_code=403, detail="Import requires renewed authorization")
    try:
        expires = _utc(scope.get("expires"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=403, detail="Import authorization invalid") from None
    if expires <= datetime.now(UTC):
        raise HTTPException(status_code=403, detail="Import authorization expired")
    user = job["user_key"]
    target = job.get("target_group_id") or ""
    if scope["credential_kind"] == "app":
        origin = validate_app_origin(scope.get("app_origin"))
        if not ch.is_origin_allowed(user, origin):
            raise HTTPException(status_code=403, detail="Import app contract revoked")
        permissions = ch.get_app_permissions(user, origin)
        for service, operations in import_permissions(target).items():
            granted = permissions.get(service, [])
            if service not in ("imports", "group"):
                granted = [*granted, *permissions.get("*", [])]
            if any(op not in granted for op in operations):
                raise HTTPException(status_code=403, detail="Import app permission denied")
    group_id = target or followers_group_id(user)
    group = ch.get_group(group_id)
    if target and not group:
        raise HTTPException(status_code=403, detail="Import target no longer exists")
    if group:
        if not user_owns_group(user, group_id):
            raise HTTPException(status_code=403, detail="Import target authority revoked")
        services = ("staging_posts", "comments", GROUP_IDENTITY_SERVICE if target else "profile")
        if not all(ch.can_write_group(group_id, user, service) for service in services):
            raise HTTPException(status_code=403, detail="Import target write permission denied")
        if not all(ch.has_mgmt_permission(group_id, user, operation) for operation in ("manageRoles", "assignRoles")):
            raise HTTPException(status_code=403, detail="Import group management authority revoked")


def user_owns_group(user: str, group_id: str) -> bool:
    """True if the user is the OWNER of the group (I3: an import may only write
    into a group the user owns — it writes posts, comments, AND the group's
    face, all of which require owner-level grants).

    The owner's member_key format varies by group kind (bare username for
    followers groups, `{provider}/users/{username}` for community groups), so
    both candidates are checked."""
    candidates = [user]
    if settings.PROVIDER:
        candidates.append(f"{settings.PROVIDER}/users/{user}")
    for key in candidates:
        member = ch.get_group_member(group_id, key)
        if member and member.get("role") == "owner":
            return True
    return False


def _group_has_face(group_id: str) -> bool:
    """True if the group already has a face doc (the identity service is a
    replace-on-write doc stream — a non-empty read means a face exists)."""
    result = ch.client.query(
        "SELECT count() FROM documents "
        "WHERE collection_name = %(service)s AND deleted = 0 "
        "AND doc_id IN (SELECT doc_id FROM doc_groups WHERE group_id = %(group)s AND deleted = 0)",
        {"service": GROUP_IDENTITY_SERVICE, "group": group_id},
    )
    return int(result.result_rows[0][0]) > 0


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


def _upload_thumbnail(user: str, url: str, origin_id: str, title: str | None, authorize=None) -> str:
    """Download a YouTube thumbnail and land it in the node's media store.
    Returns the media_metadata doc_id (the post's media_refs entry)."""
    if authorize:
        authorize()
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.content  # thumbnails are small (tens of KB)
    filename = f"import-thumb-{uuid.uuid4().hex[:12]}.jpg"
    object_key = media_svc.make_object_key(user, filename)
    if authorize:
        authorize()
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
    if authorize:
        authorize()
    doc = ch.confirm_media_upload(user, metadata)
    return doc["doc_id"]


def _write_records(
    job_id: str, user: str, records: list[dict], target_group: str, as_page: bool = False, authorize=None
) -> tuple[int, int, list[str]]:
    """Write the parsed records to the node. Returns (written, skipped, errors).

    Order matters (the D62 comment join):
      1. media — the thumbnails (download -> MinIO -> media_metadata),
      2. posts — staging_posts, attached to the target group (owner-only
         until the staging UI publishes them — D19/D30),
      3. comments — ref_value = the imported post's doc_id,
      4. the channel — the group's FACE (as_page: the group-as-profile model,
         D60 identity service) or the user's personal profile (legacy).
    """
    errors: list[str] = []
    written = 0
    skipped = 0
    done = 0  # parsed records processed (written or skipped) — the progress numerator
    total = len(records)
    if authorize:
        authorize()
    existing, existing_post_ids = _existing_origin_ids(user)

    def _progress(message: str) -> None:
        # The percentage is over the PARSED records (posts + comments +
        # profile) — the media thumbnails are an auxiliary sub-step of the
        # posts, not a record of their own. Capped at 99: 100 is reserved for
        # the COMPLETE phase (the client reads 100 as "done").
        pct = min(99, (done * 100) // total) if total else 0
        try:
            update_import_job(
                job_id,
                written_records=written,
                skipped_records=skipped,
                progress=pct,
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
                    authorize,
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
            done += 1
            if done % 25 == 0:
                _progress(f"Posts: {done}/{total}...")
            continue
        body = dict(rec["body"])
        original_created = _parse_iso_utc(body.pop("created_at", None))
        if oid in media_doc_ids:
            body["media_refs"] = [media_doc_ids[oid]]
        if authorize:
            authorize()
        doc = ch.insert_document(
            author_key=user,
            service="staging_posts",
            body=body,
            tags=body.get("tags", []),
            created_at=original_created,
        )
        if authorize:
            authorize()
        ch.attach_doc_to_groups(doc["doc_id"], [target_group])
        post_doc_ids[oid] = doc["doc_id"]
        written += 1
        done += 1
        if done % 25 == 0:
            _progress(f"Posts: {done}/{total}...")

    # Phase 3 — comments (the D62 join: ref_value = the post's doc_id). A
    # comment whose post wasn't imported is an orphan — skipped, not written.
    for rec in [r for r in records if r["service"] == "comments"]:
        oid = rec["origin_id"]
        if ("comments", oid) in existing:
            skipped += 1
            done += 1
            if done % 25 == 0:
                _progress(f"Comments: {done}/{total}...")
            continue
        ref = post_doc_ids.get(rec.get("ref_origin_id") or "")
        if not ref:
            skipped += 1
            done += 1
            errors.append(f"[comments] {oid}: no post for video {rec.get('ref_origin_id')}")
            if done % 25 == 0:
                _progress(f"Comments: {done}/{total}...")
            continue
        body = dict(rec["body"])
        original_created = _parse_iso_utc(body.pop("created_at", None))
        if authorize:
            authorize()
        doc = ch.insert_document(
            author_key=user,
            service="comments",
            body=body,
            ref_value=ref,
            created_at=original_created,
        )
        if authorize:
            authorize()
        ch.attach_doc_to_groups(doc["doc_id"], [target_group])
        written += 1
        done += 1
        if done % 25 == 0:
            _progress(f"Comments: {done}/{total}...")

    # Phase 4 — the channel. As a PAGE (as_page), the channel becomes the
    # group's FACE (the D60 identity service) — the group-as-profile model:
    # the imported channel is its own animal, its own profile. Legacy (no
    # target group), it becomes the user's personal profile. Never overwrite
    # an existing face/profile — the current one wins.
    profile_recs = [r for r in records if r["service"] == "profile"]
    if profile_recs:
        if authorize:
            authorize()
        if as_page:
            if _group_has_face(target_group):
                skipped += 1
                done += 1
                _progress("Channel: kept the group's existing face (not overwritten)")
            else:
                body = dict(profile_recs[0]["body"])
                face = {
                    "name": body.get("display_name"),
                    "description": body.get("bio"),
                    "website": body.get("website"),
                    "origin": "youtube",
                    "origin_id": profile_recs[0].get("origin_id"),
                }
                if authorize:
                    authorize()
                doc = ch.insert_document(author_key=user, service=GROUP_IDENTITY_SERVICE, body=face)
                if authorize:
                    authorize()
                ch.attach_doc_to_groups(doc["doc_id"], [target_group])
                written += 1
                done += 1
                _progress("Channel: set as the group's face")
        else:
            if _user_has_profile(user):
                skipped += 1
                done += 1
                _progress("Profile: kept the existing one (not overwritten by the import)")
            else:
                body = dict(profile_recs[0]["body"])
                if authorize:
                    authorize()
                doc = ch.insert_document(author_key=user, service="profile", body=body)
                if authorize:
                    authorize()
                ch.attach_doc_to_groups(doc["doc_id"], [target_group])
                written += 1
                done += 1

    return written, skipped, errors
