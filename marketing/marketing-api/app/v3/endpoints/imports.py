import asyncio
import logging
import os
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from threading import Lock

import boto3
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

from ...models import (
    ImportJob,
    ImportJobCreate,
    ImportPresignRequest,
    ImportPresignResponse,
    Phase,
)
from ...utils import detect_platform
from ...instagram import parse_instagram
from ...facebook import parse_facebook
from ...youtube import parse_youtube
from ...web10 import parse_web10
from ...validation import validate_record

logger = logging.getLogger(__name__)

router = APIRouter()

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_PUBLIC_ENDPOINT = os.getenv("S3_PUBLIC_ENDPOINT", S3_ENDPOINT)
S3_BUCKET = os.getenv("S3_IMPORT_BUCKET", os.getenv("S3_BUCKET", "web10-media"))
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_USE_SSL = os.getenv("S3_USE_SSL", "false").lower() == "true"
S3_PUBLIC_USE_SSL = (
    os.getenv(
        "S3_PUBLIC_USE_SSL", "true" if S3_PUBLIC_ENDPOINT.startswith("https") else str(S3_USE_SSL).lower()
    ).lower()
    == "true"
)
IMPORT_URL_EXPIRY = int(os.getenv("IMPORT_URL_EXPIRY", "600"))
IMPORT_MAX_SIZE = int(os.getenv("IMPORT_MAX_SIZE", "524288000"))

jobs: dict[str, dict] = {}
jobs_lock = Lock()


class ImportProgress(BaseModel):
    phase: str
    message: str | None = None
    total_files: int = 0
    processed_files: int = 0
    total_records: int = 0
    written_records: int = 0
    skipped_records: int = 0
    current_service: str | None = None


class ImportResult(BaseModel):
    success: bool
    records_written: int
    records_skipped: int
    errors: list[str]
    services_summary: dict


def _s3(internal: bool = True):
    endpoint = S3_ENDPOINT if internal else S3_PUBLIC_ENDPOINT
    use_ssl = S3_USE_SSL if internal else S3_PUBLIC_USE_SSL
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        use_ssl=use_ssl,
    )


def _ensure_bucket():
    try:
        _s3(internal=True).head_bucket(Bucket=S3_BUCKET)
    except Exception:
        _s3(internal=True).create_bucket(Bucket=S3_BUCKET)


def _write_record(node_api_url: str, token: str, service: str, body: dict) -> tuple[bool, str | None]:
    import requests as http_requests
    try:
        resp = http_requests.post(
            f"{node_api_url}/create/{service}",
            json={"body": body},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=10,
        )
        if resp.status_code < 300:
            return True, None
        return False, resp.text[:200]
    except Exception as e:
        return False, str(e)[:200]


async def _run_pipeline(
    job_id: str,
    source: str,
    node_api_url: str,
    token: str,
    media_service_url: str | None = None,
):
    with jobs_lock:
        job = jobs[job_id]
    errors = []
    tmp_zip: Path | None = None
    is_s3 = source.startswith("imports/")

    try:
        with jobs_lock:
            job["phase"] = Phase.PARSING
            if is_s3:
                job["message"] = "Downloading ZIP from storage..."
            else:
                job["message"] = "ZIP uploaded, starting pipeline..."

        if is_s3:
            tmp_dir = Path(tempfile.mkdtemp())
            tmp_zip = tmp_dir / f"{job_id}.zip"
            _s3(internal=True).download_file(S3_BUCKET, source, str(tmp_zip))
        else:
            tmp_zip = Path(source)

        with zipfile.ZipFile(tmp_zip, "r") as zf:
            entries = [{"path": e.filename, "data": zf.read(e.filename)} for e in zf.infolist() if not e.is_dir()]
            total_entries = len(entries)

            with jobs_lock:
                job["total_files"] = total_entries
                job["message"] = f"Found {total_entries} entries, detecting source..."

            platform = detect_platform(entries)
            if platform == "unknown":
                with jobs_lock:
                    job["phase"] = Phase.ERROR
                    job["message"] = "Unrecognized archive format"
                    job["errors"] = ["Supported: Instagram, Facebook, YouTube data exports."]
                return

            with jobs_lock:
                job["phase"] = Phase.MAPPING
                job["message"] = f"{platform} export detected. Parsing..."

            parser = {
                "instagram": parse_instagram,
                "facebook": parse_facebook,
                "youtube": parse_youtube,
                "web10": parse_web10,
            }[platform]
            records = parser(zf, entries)

            with jobs_lock:
                job["total_records"] = len(records)
                job["message"] = f"Parsed {len(records)} records"

            if not records:
                with jobs_lock:
                    job["phase"] = Phase.ERROR
                    job["message"] = "No importable records found"
                    job["errors"] = ["No records found in archive."]
                return

            with jobs_lock:
                job["phase"] = Phase.VALIDATING
                job["message"] = f"Validating {len(records)} records..."

            valid, skipped = [], []
            for rec in records:
                ok, err = validate_record(rec)
                if ok:
                    valid.append(rec)
                else:
                    skipped.append(rec)
                    errors.append(err or "validation failed")

            with jobs_lock:
                job["skipped_records"] = len(skipped)

            seen_ids = set()
            deduped = []
            for rec in valid:
                oid = rec.get("origin_id")
                if oid and oid not in seen_ids:
                    seen_ids.add(oid)
                    deduped.append(rec)
                elif not oid:
                    deduped.append(rec)
            valid = deduped

            with jobs_lock:
                job["phase"] = Phase.WRITING
                job["message"] = f"Writing {len(valid)} records to node..."

            by_service: dict[str, list] = {}
            for rec in valid:
                by_service.setdefault(rec["service"], []).append(rec)

            services_summary = {}
            total_written = 0
            node_url = node_api_url.rstrip("/")

            for service, service_records in by_service.items():
                with jobs_lock:
                    job["current_service"] = service
                    job["message"] = f"Writing {len(service_records)} {service} records..."

                written, svc_skipped = 0, 0
                for i, rec in enumerate(service_records):
                    ok, err = _write_record(node_url, token, service, rec["body"])
                    if ok:
                        written += 1
                    else:
                        svc_skipped += 1
                        errors.append(f"[{service}] {err or 'write failed'}")
                    with jobs_lock:
                        job["written_records"] = total_written + written
                    if i < len(service_records) - 1:
                        await asyncio.sleep(0.05)

                total_written += written
                with jobs_lock:
                    job["skipped_records"] = job.get("skipped_records", 0) + svc_skipped
                    services_summary[service] = {"written": written, "skipped": svc_skipped}

            with jobs_lock:
                job["services_summary"] = services_summary
                job["phase"] = Phase.COMPLETE
                job["message"] = f"Import complete: {total_written} written, {job['skipped_records']} skipped."
                job["errors"] = errors[:100]

    except Exception as e:
        with jobs_lock:
            job["phase"] = Phase.ERROR
            job["message"] = f"Pipeline error: {str(e)[:200]}"
            job["errors"] = [str(e)]
    finally:
        if tmp_zip and tmp_zip.exists():
            try:
                tmp_zip.unlink()
                tmp_zip.parent.rmdir()
            except OSError:
                pass

        if is_s3:
            try:
                _s3(internal=True).delete_object(Bucket=S3_BUCKET, Key=source)
                logger.info("Deleted import ZIP from S3: %s/%s", S3_BUCKET, source)
            except Exception as e:
                logger.error("Failed to delete import ZIP from S3: %s — %s", source, e)


@router.post("/presign", response_model=ImportPresignResponse)
async def presign_import_upload(req: ImportPresignRequest):
    _ensure_bucket()
    job_id = str(uuid.uuid4())
    object_key = f"imports/{job_id}/{job_id}.zip"

    presigned = _s3(internal=False).generate_presigned_post(
        S3_BUCKET,
        object_key,
        Conditions=[
            ["content-length-range", 0, IMPORT_MAX_SIZE],
        ],
        ExpiresIn=IMPORT_URL_EXPIRY,
    )

    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "platform": req.platform,
            "phase": Phase.PENDING,
            "total_files": 0,
            "processed_files": 0,
            "total_records": 0,
            "written_records": 0,
            "skipped_records": 0,
            "errors": [],
            "current_service": None,
            "message": "Job created. Upload ZIP to the presigned URL, then call /import/{id}/start.",
            "services_summary": {},
            "created_at": datetime.utcnow().isoformat(),
            "node_api_url": req.node_api_url,
            "user_token": req.user_token,
            "object_key": object_key,
        }

    return ImportPresignResponse(
        job_id=job_id,
        upload_url=presigned["url"],
        fields=presigned.get("fields", {}),
        object_key=object_key,
    )


@router.post("/{job_id}/start")
async def start_import_job(job_id: str, background_tasks: BackgroundTasks):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(404, "Job not found")
        job = jobs[job_id]
        if job["phase"] != Phase.PENDING:
            raise HTTPException(409, f"Job already processing or complete: {job['phase']}")

        object_key = job.get("object_key")
        if not object_key:
            raise HTTPException(400, "Job has no S3 object key. Use /import/presign to create it.")

        job["phase"] = Phase.PARSING
        job["message"] = "Starting import pipeline..."

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        object_key,
        job["node_api_url"],
        job["user_token"],
    )

    return {"job_id": job_id, "status": "processing"}


@router.post("", response_model=ImportJob)
async def create_import_job(
    job: ImportJobCreate,
    background_tasks: BackgroundTasks,
):
    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "platform": job.platform,
            "phase": Phase.PENDING,
            "total_files": 0,
            "processed_files": 0,
            "total_records": 0,
            "written_records": 0,
            "skipped_records": 0,
            "errors": [],
            "current_service": None,
            "message": "Job created. Upload ZIP to /import/{id}/upload",
            "services_summary": {},
            "created_at": datetime.utcnow().isoformat(),
            "node_api_url": job.node_api_url,
            "user_token": job.user_token,
        }
    return ImportJob(**jobs[job_id])


@router.post("/{job_id}/upload")
async def upload_zip(job_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(404, "Job not found")
        job = jobs[job_id]
        job["phase"] = Phase.PARSING
        job["message"] = "ZIP uploaded, starting pipeline..."

    tmp = Path(tempfile.mkdtemp()) / f"{job_id}.zip"
    tmp.write_bytes(await file.read())

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        str(tmp),
        job["node_api_url"],
        job["user_token"],
    )

    return {"job_id": job_id, "status": "processing"}


@router.get("/{job_id}", response_model=ImportJob)
async def get_import_job(job_id: str):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(404, "Job not found")
        job = jobs[job_id]
    return ImportJob(
        id=job["id"],
        platform=job.get("platform"),
        phase=job["phase"],
        total_files=job.get("total_files", 0),
        processed_files=job.get("processed_files", 0),
        total_records=job.get("total_records", 0),
        written_records=job.get("written_records", 0),
        skipped_records=job.get("skipped_records", 0),
        errors=job.get("errors", []),
        current_service=job.get("current_service"),
        message=job.get("message"),
        services_summary=job.get("services_summary", {}),
        created_at=job.get("created_at"),
    )
