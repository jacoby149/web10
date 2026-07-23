import uuid
import zipfile
import tempfile
import asyncio
from datetime import datetime
from pathlib import Path

import requests as http_requests
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import (
    Phase,
    ImportJob,
    ImportJobCreate,
    PageView,
    FunnelEventCreate,
    JsErrorReport,
    FeedbackCreate,
)
from .utils import detect_platform
from .instagram import parse_instagram
from .facebook import parse_facebook
from .youtube import parse_youtube
from .validation import validate_record

app = FastAPI(title="web10 Marketing API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store (replace with Redis/DB in production)
jobs: dict[str, dict] = {}


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


# ─── Import Pipeline ───────────────────────────────────────────────────────────


def _write_record(node_api_url: str, token: str, service: str, body: dict) -> tuple[bool, str | None]:
    """Write a single record to the user's node via the web10 CRUD API."""
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
    zip_path: Path,
    node_api_url: str,
    token: str,
    media_service_url: str | None = None,
):
    """Background task: parse ZIP → validate → write records to node."""
    job = jobs[job_id]
    errors = []

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            entries = [{"path": e.filename, "data": zf.read(e.filename)} for e in zf.infolist() if not e.is_dir()]
            total_entries = len(entries)

            # Detect platform
            job["phase"] = Phase.PARSING
            job["total_files"] = total_entries
            job["message"] = f"Found {total_entries} entries, detecting source..."
            jobs[job_id] = job

            platform = detect_platform(entries)
            if platform == "unknown":
                job["phase"] = Phase.ERROR
                job["message"] = "Unrecognized archive format"
                job["errors"] = ["Supported: Instagram, Facebook, YouTube data exports."]
                jobs[job_id] = job
                return

            # Parse records
            job["phase"] = Phase.MAPPING
            job["message"] = f"{platform} export detected. Parsing..."
            jobs[job_id] = job

            parser = {"instagram": parse_instagram, "facebook": parse_facebook, "youtube": parse_youtube}[platform]
            records = parser(zf, entries)
            job["total_records"] = len(records)
            job["message"] = f"Parsed {len(records)} records"
            jobs[job_id] = job

            if not records:
                job["phase"] = Phase.ERROR
                job["message"] = "No importable records found"
                job["errors"] = ["No records found in archive."]
                jobs[job_id] = job
                return

            # Validate
            job["phase"] = Phase.VALIDATING
            job["message"] = f"Validating {len(records)} records..."
            jobs[job_id] = job

            valid, skipped = [], []
            for rec in records:
                ok, err = validate_record(rec)
                if ok:
                    valid.append(rec)
                else:
                    skipped.append(rec)
                    errors.append(err or "validation failed")

            job["skipped_records"] = len(skipped)
            jobs[job_id] = job

            # Deduplicate by origin_id
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

            # Write records to node
            job["phase"] = Phase.WRITING
            job["message"] = f"Writing {len(valid)} records to node..."
            jobs[job_id] = job

            # Group by service
            by_service: dict[str, list] = {}
            for rec in valid:
                by_service.setdefault(rec["service"], []).append(rec)

            services_summary = {}
            total_written = 0
            node_url = node_api_url.rstrip("/")

            for service, service_records in by_service.items():
                job["current_service"] = service
                job["message"] = f"Writing {len(service_records)} {service} records..."
                jobs[job_id] = job

                written, svc_skipped = 0, 0
                for i, rec in enumerate(service_records):
                    ok, err = _write_record(node_url, token, service, rec["body"])
                    if ok:
                        written += 1
                    else:
                        svc_skipped += 1
                        errors.append(f"[{service}] {err or 'write failed'}")
                    job["written_records"] = total_written + written
                    jobs[job_id] = job
                    # Small delay to avoid overwhelming the node
                    if i < len(service_records) - 1:
                        await asyncio.sleep(0.05)

                total_written += written
                job["skipped_records"] = job.get("skipped_records", 0) + svc_skipped
                services_summary[service] = {"written": written, "skipped": svc_skipped}
                jobs[job_id] = job

            job["services_summary"] = services_summary
            job["phase"] = Phase.COMPLETE
            job["message"] = f"Import complete: {total_written} written, {job['skipped_records']} skipped."
            job["errors"] = errors[:100]
            jobs[job_id] = job

    except Exception as e:
        job["phase"] = Phase.ERROR
        job["message"] = f"Pipeline error: {str(e)[:200]}"
        job["errors"] = [str(e)]
        jobs[job_id] = job
    finally:
        # Clean up temp file
        try:
            zip_path.unlink()
        except OSError:
            pass


@app.post("/import", response_model=ImportJob)
async def create_import_job(
    job: ImportJobCreate,
    background_tasks: BackgroundTasks,
):
    """Create an import job. Returns a job ID; client then uploads ZIP to /import/{id}/upload."""
    job_id = str(uuid.uuid4())
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


@app.post("/import/{job_id}/upload")
async def upload_zip(job_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload the ZIP file for an import job. Triggers background processing."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    job["phase"] = Phase.PARSING
    job["message"] = "ZIP uploaded, starting pipeline..."
    jobs[job_id] = job

    # Save ZIP to temp file
    tmp = Path(tempfile.mkdtemp()) / f"{job_id}.zip"
    tmp.write_bytes(await file.read())

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        tmp,
        job["node_api_url"],
        job["user_token"],
    )

    return {"job_id": job_id, "status": "processing"}


@app.get("/import/{job_id}", response_model=ImportJob)
async def get_import_job(job_id: str):
    """Get import job status. Client polls this for progress."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    # Return without internal fields
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


# ─── Analytics ─────────────────────────────────────────────────────────────────

# Simple in-memory analytics (replace with proper DB in production)
analytics_events: list[dict] = []


@app.post("/analytics/pageview")
async def track_pageview(event: PageView):
    """Track a page view."""
    analytics_events.append(
        {
            "type": "pageview",
            "path": event.path,
            "referrer": event.referrer,
            "user_agent": event.user_agent,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    return {"status": "ok"}


@app.post("/analytics/funnel")
async def track_funnel(event: FunnelEventCreate):
    """Track a funnel event (landing, export started, export complete, etc.)."""
    analytics_events.append(
        {
            "type": "funnel",
            "event": event.event,
            "metadata": event.metadata,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    return {"status": "ok"}


@app.post("/analytics/error")
async def report_error(error: JsErrorReport):
    """Accept a client-side JS error beacon (content-free, no PII)."""
    analytics_events.append(
        {
            "type": "error",
            "message": error.message,
            "source": error.source,
            "line": error.line,
            "column": error.column,
            "app": error.app,
            "route": error.route,
            "user_agent": error.user_agent,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    return {"status": "ok"}


@app.get("/analytics/summary")
async def get_analytics_summary():
    """Get a summary of marketing analytics, including funnel drop-off."""
    total_pageviews = sum(1 for e in analytics_events if e["type"] == "pageview")
    funnel_counts = {}
    for e in analytics_events:
        if e["type"] == "funnel":
            ev = e["event"]
            funnel_counts[ev] = funnel_counts.get(ev, 0) + 1
    # Per-step drop-off: for each funnel step, how many users reached it vs the previous step.
    # Funnel order (acquisition path): landing -> docs_view -> app_store_view -> exporter_view -> export_started -> export_complete
    funnel_order = [
        "landing", "docs_view", "app_store_view",
        "exporter_view", "export_started", "export_complete",
    ]
    dropoff = {}
    prev_count = None
    for step in funnel_order:
        count = funnel_counts.get(step, 0)
        if prev_count is not None and prev_count > 0:
            dropoff[step] = {
                "reached": count,
                "previous_reached": prev_count,
                "drop_off_pct": round((1 - count / prev_count) * 100, 1),
            }
        else:
            dropoff[step] = {"reached": count, "previous_reached": 0, "drop_off_pct": None}
        prev_count = count
    total_errors = sum(1 for e in analytics_events if e["type"] == "error")
    return {
        "total_pageviews": total_pageviews,
        "funnel": funnel_counts,
        "funnel_dropoff": dropoff,
        "total_errors": total_errors,
        "events_tracked": len(analytics_events),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ─── Feedback (report-a-bug) ──────────────────────────────────────────────────

feedback_store: list[dict] = []


@app.post("/feedback")
async def submit_feedback(fb: FeedbackCreate):
    """Accept a bug report / feedback from any UI."""
    entry = {
        "id": str(uuid.uuid4()),
        "type": "feedback",
        "message": fb.message,
        "contact": fb.contact,
        "app": fb.app,
        "route": fb.route,
        "version": fb.version,
        "user_agent": fb.user_agent,
        "console_errors": fb.console_errors[:50],
        "stack_trace": fb.stack_trace,
        "timestamp": datetime.utcnow().isoformat(),
    }
    feedback_store.append(entry)
    return {"status": "ok", "id": entry["id"]}


@app.get("/feedback")
async def list_feedback(limit: int = 100):
    """List recent feedback entries (newest first)."""
    items = list(reversed(feedback_store))[:limit]
    return {"items": items, "total": len(feedback_store)}
