import logging
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request

import app.v3.services.safe_query as sq
from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.models import QueryRequest
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["query"])
log = logging.getLogger(__name__)

# Performance bounds, not security (the boundary CTEs are the wall): an
# unbounded SELECT gets a LIMIT appended, and the query must finish inside
# the execution time. A caller-supplied LIMIT is always honored as-is.
MAX_ROWS = 1000
MAX_EXECUTION_TIME_S = 10


def _serialize_value(value):
    """Make a ClickHouse value JSON-safe: datetime → ISO-8601 UTC (the house
    format, same as the read path), Decimal → float."""
    if isinstance(value, datetime):
        return ch._iso_utc(value)
    if isinstance(value, Decimal):
        return float(value)
    return value


def _serialize_row(row: dict) -> dict:
    """A result row as a JSON-safe dict. A `body` column (the JSON string the
    documents table stores) is parsed back to an object — the read path
    returns parsed bodies, and a query over `body` should match."""
    out = {}
    for key, value in row.items():
        if key == "body" and isinstance(value, str) and value:
            try:
                value = ch._parse_json(value)
            except ValueError:
                pass  # a non-JSON body passes through as-is
        out[key] = _serialize_value(value)
    return out


@router.post("/query")
def run_query(request: Request, data: QueryRequest):
    """Run a caller-written SELECT over the caller's groups only (the
    flexible read, query-engine.md). Read-only by construction: the
    safe-query engine rejects anything but a single SELECT, raw tables, and
    table functions before anything executes — the raw node tables are
    unreachable from the caller's query (a wall, not a membrane).

    Anon-capable: a missing token reads as the node's `anon` member (the
    public board) — the same rule as the group read (D41: the node is
    readable by design). The app-contract gate applies to real users only,
    with the same skip rule as the read path (no Origin header = same-origin
    / direct call = no contract check).
    """
    reader = user_or_anon(data)
    authenticated = reader != "anon"

    # App-contract gate: the query may only touch services the app's contract
    # grants readAll on.
    origin = request.headers.get("origin", "")
    if authenticated and origin:
        perms = ch.get_app_permissions(reader, origin) or {}
        allowed = frozenset(svc for svc, ops in perms.items() if "readAll" in (ops or []))
    else:
        allowed = None  # unrestricted: any non-raw table name is a service

    # Which services does the query touch? Parse + validate first — an unsafe
    # query is rejected before any group lookup happens.
    try:
        needed = sq.query_services(data.sql, allowed)
    except sq.UnsafeQueryError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Candidate groups: explicit `groups`, or all the reader's groups (the
    # "me" semantics of the group read).
    if data.groups:
        candidates = data.groups
    else:
        candidates = [g["group_id"] for g in ch.get_user_groups(reader)]

    # The D58 read gate, per service the query actually uses.
    readable = {svc: ch.readable_groups(reader, svc, authenticated, candidates) for svc in needed}

    # D42 (the read endpoint's rule, generalized): an explicit group request
    # that the reader's effective role grants read on NONE of (for every
    # service the query touches) is an access failure the app can act on —
    # not an empty result. The message is the stable contract the demos +
    # e2e key off (`/not a member/i`). The "me" path (no explicit groups) and
    # service-free queries (`SELECT 1`) are exempt: an empty result is valid
    # there.
    if data.groups and authenticated and needed and not any(readable.values()):
        raise HTTPException(
            status_code=403,
            detail="not a member of the requested group",
        )

    try:
        compiled = sq.build_safe_query(
            data.sql, readable, member_key=reader, allowed_services=allowed, max_limit=MAX_ROWS
        )
    except sq.UnsafeQueryError as e:
        raise HTTPException(status_code=403, detail=str(e))

    log.info(
        "[query] reader=%s services=%s candidates=%d sql=%s",
        reader,
        sorted(needed),
        len(candidates),
        data.sql[:200],
    )

    try:
        column_names, rows = ch.execute_query(compiled, settings={"max_execution_time": MAX_EXECUTION_TIME_S})
    except ch.QueryExecutionError as e:
        # The compiled query is structurally safe; a ClickHouse failure here
        # is the caller's SQL (a column the boundary CTE doesn't expose, a
        # bad function arg, ...).
        log.warning("[query] execution failed reader=%s: %s", reader, e)
        raise HTTPException(status_code=400, detail=f"query execution failed: {e}")

    out = [_serialize_row(dict(zip(column_names, row))) for row in rows]
    return {"rows": out, "count": len(out)}
