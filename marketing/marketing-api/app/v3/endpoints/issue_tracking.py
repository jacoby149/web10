import logging
import os

import requests

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()

NODE_API_URL = os.environ.get("NODE_API_URL", "")


def _node_post(path: str, json: dict | None = None) -> requests.Response | None:
    url = f"{NODE_API_URL.rstrip('/')}{path}"
    if not NODE_API_URL:
        logger.warning("NODE_API_URL not set — issue-tracking proxy skipped")
        return None
    try:
        return requests.post(url, json=json or {}, headers={"Content-Type": "application/json"}, timeout=10)
    except Exception as e:
        logger.error("Issue-tracking proxy failed for %s: %s", path, e)
        return None


@router.post("/submit")
async def submit_issue(req: dict):
    """Submit a bug report. Public — no auth required.

    Proxies to the node API's ClickHouse bug_reports table.
    Accepts: description (required), email, page_url, app_version,
    device_info, browser_info, error_message, stack_trace, screenshots.
    Screenshots are base64-encoded image strings (data:image/png;base64,...).
    Optional: token — if provided, username is auto-populated.
    """
    description = (req.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")

    resp = _node_post("/bug_report", json=req)
    if resp is None:
        raise HTTPException(status_code=502, detail="node API unreachable")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
    return resp.json()


@router.post("/list")
async def list_issues(req: dict, limit: int = 100, offset: int = 0):
    """List bug reports (admin only). Screenshots excluded — too large.

    Requires token in request body (admin user)."""
    resp = _node_post("/admin/bug_reports", json={**req, "limit": limit, "offset": offset})
    if resp is None:
        raise HTTPException(status_code=502, detail="node API unreachable")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
    return resp.json()


@router.post("/detail/{report_id}")
async def issue_detail(report_id: str, req: dict):
    """Get a single bug report with screenshots (admin only).

    Requires token in request body (admin user)."""
    resp = _node_post(f"/admin/bug_reports/{report_id}", json=req)
    if resp is None:
        raise HTTPException(status_code=502, detail="node API unreachable")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="report not found")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
    return resp.json()