import logging
import time
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request

import app.exceptions as exceptions
import app.v3.services.safe_query as sq
from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.endpoints.documents import _mint_hls_manifest_urls
from app.v3.models import PrepareFace, PrepareSpec, QueryRequest
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["query"])
log = logging.getLogger(__name__)

# Performance bounds, not security (the boundary CTEs are the wall): an
# unbounded SELECT gets a LIMIT appended, and the query must finish inside
# the execution time. A caller-supplied LIMIT is always honored as-is.
MAX_ROWS = 1000
MAX_EXECUTION_TIME_S = 10

# Per-user query rate limit (D65): abuse prevention, not security. Keyed on
# the verified user_key (not IP — the node sits behind a proxy, so XFF is
# spoofable; D49/D64). In-memory, per-worker (the recovery idiom — a best-
# effort backstop; N workers ≈ N× the limit). Anon has no verified user_key,
# so it is not per-user-limited (a separate, deferred concern).
_QUERY_WINDOW_S = 60
_MAX_QUERIES_PER_WINDOW = 60
_query_log: dict[str, list[float]] = {}


def _check_query_rate_limit(reader: str) -> None:
    """Per-user query rate limit. Raises RATE_LIMIT (429) when a user exceeds
    the budget within the window. Anon is skipped (no verified user_key — the
    honest key; D65)."""
    if reader == "anon":
        return
    now = time.time()
    recent = [t for t in _query_log.get(reader, []) if now - t < _QUERY_WINDOW_S]
    if len(recent) >= _MAX_QUERIES_PER_WINDOW:
        log.warning(
            "[query] rate limit reader=%s: %d queries in the last %ds",
            reader,
            len(recent),
            _QUERY_WINDOW_S,
        )
        raise exceptions.RATE_LIMIT
    _query_log[reader] = recent + [now]


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


def _prepare_face(docs: list[dict], face: PrepareFace) -> list[dict]:
    """Mint the author's face media (D73): presign ``<bodyField>.<mediaField>``,
    author-scoped to ``<authorColumn>``, set on ``<urlField>``.

    For a query that JOINs the author's profile service, this is the avatar
    (``profile_body.avatar_ref`` → ``avatar_url``). The face body may be a
    parsed dict or a JSON string (an aliased ``body`` column the row serializer
    doesn't parse) — both are handled. A resolve failure degrades to no face
    (the client renders the fallback initials) — the face is an enhancement.
    """
    author_col = face.authorColumn or "author_key"
    out = []
    for doc in docs:
        doc = dict(doc)
        raw = doc.get(face.bodyField)
        face_body = raw
        if isinstance(raw, str):
            try:
                face_body = ch._parse_json(raw)
            except (ValueError, TypeError):
                face_body = None
        if not isinstance(face_body, dict):
            out.append(doc)
            continue
        media_ref = face_body.get(face.mediaField)
        author = doc.get(author_col) or ""
        if media_ref and author:
            try:
                resolved = ch.resolve_media_urls({"media_refs": [media_ref]}, author)
                refs = resolved.get("media_refs") or []
                if refs and isinstance(refs[0], dict) and refs[0].get("read_url"):
                    doc[face.urlField] = refs[0]["read_url"]
            except Exception as e:
                log.warning("[query] face resolve failed author=%s: %s", author, e)
        out.append(doc)
    return out


def _prepare_rows(rows: list[dict], reader: str, prepare: PrepareSpec, authenticated: bool = False) -> list[dict]:
    """The prepare pass (D73): mint the result rows so a single ``w.query()``
    returns render-ready rows. Reuses the read path's passes verbatim
    (``attach_pinned_ads`` + ``attach_node_ads`` + ``resolve_media_urls_in_docs``
    + ``_mint_hls_manifest_urls``), applied to the query's rows.

    Order matches the read path: ads first (so their media is resolved by the
    media pass), then media + HLS. The boundary CTEs already proved the reader
    can read every row, so minting capabilities for them is no escalation.
    Non-doc rows (aggregates, join columns without ``body``) no-op through the
    passes (they check ``body`` / ``ad_mode`` and skip).
    """
    if not rows:
        return rows
    docs = rows
    if prepare.ads:
        docs = ch.attach_pinned_ads(docs, reader)
        docs = ch.attach_node_ads(docs, reader)
    if prepare.media:
        docs = ch.resolve_media_urls_in_docs(docs)
        docs = _mint_hls_manifest_urls(docs, reader, authenticated)
    if prepare.face:
        docs = _prepare_face(docs, prepare.face)
    return docs


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

    # Per-user rate limit (D65) — fail fast before any contract/group/query
    # work. Keyed on the verified user_key; anon is skipped.
    _check_query_rate_limit(reader)

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
        "[query] reader=%s services=%s candidates=%d sql=%s compiled=%s",
        reader,
        sorted(needed),
        len(candidates),
        data.sql[:200],
        compiled[:400],
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
    # The result column names are the row→client contract: the prepare pass
    # and the client duck-type on `body` / `author_key` / `ad_mode`. A mangled
    # name (ClickHouse qualifies a result column `p.body` when another joined
    # table in scope exposes a same-named column) fails SILENTLY downstream —
    # empty feed, no error anywhere. Logging the names makes that class of
    # bug visible at the source.
    log.info(
        "[query] reader=%s rows=%d columns=%s",
        reader,
        len(rows),
        column_names,
    )
    # The prepare pass (D73): mint media + HLS + ads + face on the result rows
    # so the query returns render-ready rows in one round-trip (the feed-as-
    # query pattern). The boundary CTEs already gated the rows (I3); the mint
    # only touches docs in the result.
    if data.prepare:
        out = _prepare_rows(out, reader, data.prepare, authenticated)
    return {"rows": out, "count": len(out)}
