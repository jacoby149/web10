import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from threading import Lock

import requests as http_requests

from fastapi import APIRouter

from ...models import FeedbackCreate

logger = logging.getLogger(__name__)

router = APIRouter()

_feedback_lock = Lock()
_feedback_store: list[dict] = []
_feedback_file = Path(__file__).resolve().parent.parent.parent / "data" / "feedback.json"


def _load_feedback():
    global _feedback_store
    if _feedback_file.exists():
        try:
            _feedback_store = json.loads(_feedback_file.read_text())
            logger.info("Loaded %d feedback entries from disk", len(_feedback_store))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load feedback from disk: %s", e)
            _feedback_store = []


def _save_feedback():
    _feedback_file.parent.mkdir(parents=True, exist_ok=True)
    _feedback_file.write_text(json.dumps(_feedback_store, indent=2))


_load_feedback()


def _format_bug_post(entry: dict) -> str:
    lines = [
        "#web10-bugs",
        "",
        entry.get("message", ""),
    ]
    if entry.get("route"):
        lines.append(f"Route: {entry['route']}")
    if entry.get("version"):
        lines.append(f"Version: {entry['version']}")
    if entry.get("console_errors"):
        errors = entry["console_errors"][:3]
        lines.append(f"\nConsole ({len(entry['console_errors'])} total):")
        for err in errors:
            lines.append(f"  - {err[:120]}")
    if entry.get("stack_trace"):
        trace = entry["stack_trace"][:500]
        trace = re.sub(r"https?://\S+", "<url-redacted>", trace)
        trace = re.sub(r"[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}", "<token-redacted>", trace)
        trace = re.sub(r"\b[A-Za-z0-9_-]{40,}\b", "<token-redacted>", trace)
        lines.append(f"\nStack:\n```\n{trace}\n```")
    return "\n".join(lines)


def _deliver_bug_post(entry: dict) -> None:
    node_api_url = os.environ.get("NODE_API_URL")
    node_api_token = os.environ.get("NODE_API_TOKEN")

    if not node_api_url or not node_api_token:
        logger.warning(
            "NODE_API_URL / NODE_API_TOKEN not set — bug post skipped for feedback %s",
            entry.get("id"),
        )
        return

    post_body = {
        "text": _format_bug_post(entry),
        "tags": ["web10-bugs", entry.get("app", "unknown")],
        "created_at": entry["timestamp"],
        "origin": "feedback",
        "media_refs": [],
    }

    try:
        resp = http_requests.post(
            f"{node_api_url.rstrip('/')}/web10/public_posts",
            json={"body": post_body},
            headers={
                "Authorization": f"Bearer {node_api_token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if resp.status_code >= 300:
            logger.error(
                "Bug post failed for feedback %s: HTTP %s %s",
                entry.get("id"),
                resp.status_code,
                resp.text[:200],
            )
        else:
            logger.info("Bug post created for feedback %s", entry.get("id"))
    except Exception as e:
        logger.error("Bug post exception for feedback %s: %s", entry.get("id"), e)


@router.post("")
async def submit_feedback(fb: FeedbackCreate):
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
    with _feedback_lock:
        _feedback_store.append(entry)
        _save_feedback()

    _deliver_bug_post(entry)

    return {"status": "ok", "id": entry["id"]}


@router.get("")
async def list_feedback(limit: int = 100):
    with _feedback_lock:
        items = list(reversed(_feedback_store))[:limit]
        total = len(_feedback_store)
    return {"items": items, "total": total}
