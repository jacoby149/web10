import asyncio
import logging
import time
from datetime import datetime

from fastapi import Request

from app.v3.services import clickhouse as ch

log = logging.getLogger(__name__)


async def _insert_log(row: dict):
    try:
        ch.client.insert(
            "logs",
            [
                [
                    row["ts"],
                    row["service"],
                    row["level"],
                    row["method"],
                    row["path"],
                    row["status"],
                    row["latency_ms"],
                    row["user_key"],
                    row["origin"],
                    row["message"],
                    row["request_body"],
                    row["response_body"],
                    row["meta"],
                ]
            ],
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
        log.debug("log insert failed (CH unavailable?)")


async def log_requests(request: Request, call_next):
    start = time.perf_counter()

    response = await call_next(request)
    latency_ms = int((time.perf_counter() - start) * 1000)
    status_code = response.status_code
    # Only server-defined routing metadata is safe; raw paths/headers can carry secrets.
    path = getattr(request.scope.get("route"), "path", "") or "<unmatched>"
    method = (
        request.method
        if request.method in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"}
        else "OTHER"
    )

    level = "info"
    if status_code >= 500:
        level = "error"
    elif status_code >= 400:
        level = "warn"

    asyncio.create_task(
        _insert_log(
            {
                "ts": datetime.utcnow(),
                "service": "api",
                "level": level,
                "method": method,
                "path": path,
                "status": status_code,
                "latency_ms": latency_ms,
                "user_key": "",
                "origin": "",
                "message": f"{method} {path} -> {status_code}",
                "request_body": "",
                "response_body": "",
                "meta": "",
            }
        )
    )

    return response
