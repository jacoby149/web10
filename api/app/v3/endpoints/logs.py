from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.v3.services import clickhouse as ch

router = APIRouter(tags=["logs"])


class LogEntry(BaseModel):
    level: str = "info"
    message: str
    meta: str = ""


class LogBatch(BaseModel):
    service: str = "sdk"
    user_key: str = ""
    origin: str = ""
    entries: list[LogEntry] = Field(default_factory=list)


@router.post("/logs")
def submit_logs(data: LogBatch):
    """Accept log entries from SDK, E2E runner, or any external source.
    Lightweight — no auth required. Logs are tagged with service + user_key."""
    now = datetime.utcnow()
    rows = []
    for e in data.entries:
        rows.append(
            [
                now,
                data.service,
                e.level,
                "",
                "",
                0,
                0,
                data.user_key,
                data.origin,
                e.message,
                "",
                "",
                e.meta,
            ]
        )
    if rows:
        try:
            ch.client.insert(
                "logs",
                rows,
                column_names=[
                    "ts",
                    "service",
                    "level",
                    "method",
                    "path",
                    "status",
                    "latency_ms",
                    "user_key",
                    "origin",
                    "message",
                    "request_body",
                    "response_body",
                    "meta",
                ],
            )
        except Exception:
            pass
    return {"status": "ok", "count": len(rows)}
