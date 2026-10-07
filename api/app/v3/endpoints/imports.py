"""Import endpoints — the "port your YouTube" pipeline (plan: YouTube Importer).

Flow (the client is the authenticator's import card):
  1. POST /v3/imports        — create a job + presigned upload URLs (one per
     export part; a Takeout split into ~2GB parts is N parts, any file type —
     tar is the default, zip works too).
  2. the client uploads every part straight to MinIO (the node's own bucket —
     the export never touches another service).
  3. POST /v3/imports/start  — the node verifies every part landed, then the
     in-process worker (import_worker.py) extracts, parses, and writes.
  4. POST /v3/imports/status — poll the job row (phase, counts, errors).

The raw export is DELETED from MinIO when the job reaches a terminal phase
(the privacy promise: the node never keeps the raw export).
"""

import queue
import uuid

from fastapi import APIRouter, HTTPException

import app.settings as settings
from app.services.auth import decode_token
from app.services.importers import PARSERS
from app.services.media import ensure_bucket, get_s3_client, get_s3_signing_client
from app.v3.endpoints.auth_helper import app_contract_origin, require_app_permission
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import ImportCreate, ImportJobRef
from app.v3.services import import_worker

router = APIRouter(tags=["imports"])


def _import_object_key(user: str, job_id: str, part_index: int, filename: str) -> str:
    """The part's object key — namespaced by user + job so a presigned URL can
    only ever address THIS job's parts (the S3 key is the boundary)."""
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[1].lower()[:8]
    return f"imports/{user}/{job_id}/part-{part_index:03d}{ext}"


@router.post("/imports")
def create_import(data: ImportCreate):
    """Create an import job. Returns presigned upload URLs — one per part."""
    user = _user(data)
    require_app_permission(data, "imports", "create")
    if data.platform not in PARSERS:
        raise HTTPException(status_code=400, detail=f"unsupported platform: {data.platform}")
    if not data.parts or len(data.parts) > settings.IMPORT_MAX_PARTS:
        raise HTTPException(
            status_code=400,
            detail=f"parts must be 1..{settings.IMPORT_MAX_PARTS} (got {len(data.parts)})",
        )
    if any(
        part.size_bytes is not None and not 0 < part.size_bytes <= import_worker.MAX_PART_BYTES for part in data.parts
    ):
        raise HTTPException(status_code=413, detail="export part exceeds upload size limit")

    # An explicit target group must be one the user OWNS (I3: the import writes
    # posts + comments + the group's face, all owner-level). A group the user
    # doesn't own is a 403, an unknown group a 404.
    target_group_id = (data.target_group_id or "").strip()
    decoded = decode_token(data.token)
    scope = {"credential_kind": decoded.credential_kind, "app_origin": decoded.app_origin, "expires": decoded.expires}
    if target_group_id:
        if not import_worker.ch.get_group(target_group_id):
            raise HTTPException(status_code=404, detail="target group not found")
        if not import_worker.user_owns_group(user, target_group_id):
            raise HTTPException(status_code=403, detail="you do not own the target group")
    import_worker.authorize_import_job({"user_key": user, "target_group_id": target_group_id, "authorization": scope})

    job_id = uuid.uuid4().hex
    s3 = get_s3_client()
    ensure_bucket(s3)
    signer = get_s3_signing_client()
    object_keys = [_import_object_key(user, job_id, i, part.filename) for i, part in enumerate(data.parts)]
    import_worker.create_import_job(job_id, user, data.platform, object_keys, target_group_id, authorization=scope)

    uploads = []
    for i, object_key in enumerate(object_keys):
        presigned = signer.generate_presigned_post(
            settings.S3_BUCKET,
            object_key,
            Fields={},
            Conditions=[{"key": object_key}, ["content-length-range", 1, import_worker.MAX_PART_BYTES]],
            ExpiresIn=settings.UPLOAD_URL_EXPIRY,
        )
        uploads.append(
            {
                "part_index": i,
                "object_key": object_key,
                "upload_url": presigned["url"],
                "fields": presigned.get("fields"),
            }
        )

    job = import_worker.get_import_job(job_id) or {}
    return {"job_id": job_id, "platform": data.platform, "job": job, "uploads": uploads}


def _owned_job(data: ImportJobRef) -> dict:
    """The job row, or 404 — and only the job's owner may touch it (I3: a token
    never reaches another user's data)."""
    user = _user(data)
    job = import_worker.get_import_job(data.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="import job not found")
    if job["user_key"] != user:
        raise HTTPException(status_code=403, detail="not your import job")
    origin = app_contract_origin(data)
    if origin is not None and origin != (job.get("authorization") or {}).get("app_origin"):
        raise HTTPException(status_code=403, detail="not this app's import job")
    return job


@router.post("/imports/start")
def start_import(data: ImportJobRef):
    """Verify every export part landed in MinIO, then queue the job."""
    require_app_permission(data, "imports", "create")
    job = _owned_job(data)
    if job["phase"] == import_worker.COMPLETE:
        return {"job_id": job["job_id"], "status": "complete"}
    if job["phase"] in (import_worker.QUEUED, import_worker.PROCESSING):
        import_worker.authorize_import_job(job)
        return {"job_id": job["job_id"], "status": job["phase"]}

    decoded = decode_token(data.token)
    scope = {"credential_kind": decoded.credential_kind, "app_origin": decoded.app_origin, "expires": decoded.expires}
    import_worker.authorize_import_job({**job, "authorization": scope})

    s3 = get_s3_client()
    missing = []
    for key in job["object_keys"]:
        try:
            head = s3.head_object(Bucket=settings.S3_BUCKET, Key=key)
        except Exception:
            missing.append(key)
            continue
        if not 0 < head["ContentLength"] <= import_worker.MAX_PART_BYTES:
            raise HTTPException(status_code=413, detail="export part exceeds upload size limit")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"{len(missing)} of {len(job['object_keys'])} export parts are missing from storage — upload them, then start again",
        )

    try:
        import_worker.update_import_job(job["job_id"], authorization=scope)
        import_worker.submit_import_job(job["job_id"])
    except queue.Full:
        raise HTTPException(status_code=503, detail="import queue is full; retry later", headers={"Retry-After": "30"})
    return {"job_id": job["job_id"], "status": "queued"}


@router.post("/imports/status")
def import_status(data: ImportJobRef):
    """Poll the job row (the status surface the client renders)."""
    require_app_permission(data, "imports", "read")
    job = _owned_job(data)
    return {"job_id": job["job_id"], "job": job}
