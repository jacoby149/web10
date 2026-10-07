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
        # Database exceptions can include the rejected row or connection secrets.
        log.debug("log insert failed (CH unavailable?)")


async def log_requests(request: Request, call_next):
    from app.v3.endpoints.auth_helper import request_origin

    context = request_origin.set(request.headers.get("origin"))
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        # ServerErrorMiddleware re-raises after its handler, which would let
        # the ASGI server log the secret-bearing exception again.
        from app.main import bare_exception_handler

        response = await bare_exception_handler(request, exc)
    finally:
        request_origin.reset(context)

    latency_ms = int((time.perf_counter() - start) * 1000)
    status_code = response.status_code

    level = "info"
    if status_code >= 500:
        level = "error"
    elif status_code >= 400:
        level = "warn"

    # Only server-defined route templates are safe: URL parameters, headers,
    # bodies and arbitrary error strings can all carry bearer credentials.
    route = request.scope.get("route")
    path = getattr(route, "path", "") or "<unmatched>"
    method = (
        request.method if request.method in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"} else "OTHER"
    )
    message = f"{method} {path} -> {status_code}"

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
                "message": message,
                "request_body": "",
                "response_body": "",
                "meta": "",
            }
        )
    )

    return response
