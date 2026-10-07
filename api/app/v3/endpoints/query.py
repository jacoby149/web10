import json
import logging
import time
from copy import deepcopy
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from sqlglot import exp

import app.exceptions as exceptions
import app.v3.services.safe_query as sq
from app.v3.endpoints.auth_helper import app_contract_origin, user_or_anon
from app.v3.endpoints.documents import _mint_hls_manifest_urls
from app.v3.models import PrepareSpec, QueryRequest
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["query"])
log = logging.getLogger(__name__)

# Result size and execution time are bounded regardless of caller SQL.
MAX_ROWS = 1000
MAX_RESULT_BYTES = 8 * 1024 * 1024
MAX_EXECUTION_TIME_S = 10

# Per-user query rate limit (D65): abuse prevention, not security. Keyed on
# the verified user_key (not IP — the node sits behind a proxy, so XFF is
# spoofable; D49/D64). In-memory, per-worker (the recovery idiom — a best-
# effort backstop; N workers ≈ N× the limit). Anon has no verified user_key,
# so it shares a worker-wide anonymous budget (no spoofable IP headers).
_QUERY_WINDOW_S = 60
_MAX_QUERIES_PER_WINDOW = 60
_query_log: dict[str, list[float]] = {}


def _check_query_rate_limit(reader: str) -> None:
    """Per-user budget plus a shared anonymous budget, per worker."""
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


def _canonical_prepare_doc(doc_id, reader, authenticated, services, allowed, candidates=None):
    """Locate by id, then re-fetch through the full current query read boundary."""
    if not isinstance(doc_id, str) or not doc_id:
        return None
    for service in sorted(services):
        if not sq.document_service_allowed(service, allowed):
            continue
        log.info("[query] canonical read start doc=%s service=%s reader=%s", doc_id, service, reader)
        located = ch.read_document_by_id(doc_id, reader, service, authenticated)
        if not located or located.get("doc_id") != doc_id:
            continue
        groups = candidates if candidates is not None else ch.get_doc_groups(doc_id)
        readable = ch.readable_groups(reader, service, authenticated, groups)
        if not readable:
            continue
        sql = (
            exp.select("*")
            .from_(exp.Table(this=exp.Identifier(this=service, quoted=True)))
            .where(exp.column("doc_id").eq(exp.Literal.string(doc_id)))
            .sql(dialect=sq.DIALECT)
        )
        compiled = sq.build_safe_query(
            sql, {service: readable}, member_key=reader, allowed_services=allowed, max_limit=1
        )
        columns, results = ch.execute_query(
            compiled,
            settings={
                "max_execution_time": MAX_EXECUTION_TIME_S,
                "max_result_rows": 1,
                "max_result_bytes": MAX_RESULT_BYTES,
                "result_overflow_mode": "throw",
                "readonly": 1,
            },
        )
        if not results:
            log.info("[query] canonical read denied doc=%s service=%s", doc_id, service)
            continue
        canonical = _serialize_row(dict(zip(columns, results[0])))
        if (
            canonical.get("doc_id") != doc_id
            or canonical.get("author_key") != located.get("author_key")
            or not isinstance(canonical.get("body"), dict)
        ):
            continue
        canonical["service"] = service
        log.info("[query] canonical read authorized doc=%s service=%s", doc_id, service)
        return canonical
    return None


def _prepare_rows(
    rows: list[dict],
    reader: str,
    prepare: PrepareSpec,
    authenticated: bool = False,
    services=(),
    allowed=None,
    candidates=None,
) -> list[dict]:
    """Preserve query extras, but mint only canonical authorized carrier data."""
    if prepare.face:
        face = prepare.face
        face_cache = {}
        prepared = []
        for row in rows:
            row = dict(row)
            # Projections are hints, not provenance. Re-prove the author/ref
            # pair against current service boundary CTEs before signing.
            row.pop(face.urlField, None)
            body = row.get(face.bodyField)
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except ValueError:
                    body = None
            author = row.get(face.authorColumn or "author_key")
            ref = body.get(face.mediaField) if isinstance(body, dict) else None
            if isinstance(author, str) and author and isinstance(ref, str) and ref:
                key = (author, ref)
                if key not in face_cache:
                    face_cache[key] = None
                    for service in sorted(services):
                        if not sq.document_service_allowed(service, allowed):
                            continue
                        readable = ch.readable_groups(reader, service, authenticated, candidates or [])
                        if not readable:
                            continue
                        sql = (
                            exp.select("doc_id", "author_key", "body")
                            .from_(exp.Table(this=exp.Identifier(this=service, quoted=True)))
                            .where(
                                exp.column("author_key").eq(exp.Literal.string(author)),
                                exp.Anonymous(
                                    this="JSONExtractString",
                                    expressions=[exp.column("body"), exp.Literal.string(face.mediaField)],
                                ).eq(exp.Literal.string(ref)),
                            )
                            .sql(dialect=sq.DIALECT)
                        )
                        compiled = sq.build_safe_query(
                            sql, {service: readable}, member_key=reader, allowed_services=allowed, max_limit=1
                        )
                        log.info("[query] canonical face read start service=%s reader=%s", service, reader)
                        columns, results = ch.execute_query(
                            compiled,
                            settings={
                                "max_execution_time": MAX_EXECUTION_TIME_S,
                                "max_result_rows": 1,
                                "max_result_bytes": MAX_RESULT_BYTES,
                                "result_overflow_mode": "throw",
                                "readonly": 1,
                            },
                        )
                        if not results:
                            continue
                        canonical = _serialize_row(dict(zip(columns, results[0])))
                        canonical_body = canonical.get("body")
                        if (
                            not canonical.get("doc_id")
                            or canonical.get("author_key") != author
                            or not isinstance(canonical_body, dict)
                            or canonical_body.get(face.mediaField) != ref
                        ):
                            continue
                        log.info("[query] canonical face authorized service=%s doc=%s", service, canonical["doc_id"])
                        resolved = ch.resolve_media_urls({"media_refs": [ref]}, canonical["author_key"])
                        media = resolved.get("media_refs") or []
                        if media and isinstance(media[0], dict):
                            face_cache[key] = media[0].get("read_url")
                        break
                    log.info("[query] face prepare resolved=%s reader=%s", bool(face_cache[key]), reader)
                if face_cache[key]:
                    row[face.urlField] = face_cache[key]
            prepared.append(row)
        rows = prepared
    if not (prepare.media or prepare.ads):
        return rows
    out = []
    cache = {}
    for row in rows:
        doc_id = row.get("doc_id")
        if not isinstance(doc_id, str) or not doc_id:
            out.append(row)
            continue
        if doc_id not in cache:
            cache[doc_id] = _canonical_prepare_doc(doc_id, reader, authenticated, services, allowed, candidates)
        canonical = cache[doc_id]
        if canonical is None:
            log.warning("[query] prepare skipped unauthorized carrier doc=%s", doc_id)
            out.append(row)
            continue
        doc = deepcopy(canonical)
        if prepare.ads:
            docs = ch.attach_node_ads(ch.attach_pinned_ads([doc], reader), reader)
            doc = docs[0]
            # Ad helpers are selectors, not authorization or provenance gates.
            for key in ("ad", "node_ad"):
                selected = doc.pop(key, None)
                if not isinstance(selected, dict):
                    continue
                target = selected.get("doc_id")
                metadata = ch.get_document_any_author(target) if isinstance(target, str) else None
                if not metadata or not isinstance(metadata.get("service"), str):
                    continue
                ad = _canonical_prepare_doc(target, reader, authenticated, [metadata["service"]], allowed)
                if ad:
                    doc[key] = ad
        if prepare.media:
            doc = _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs([doc]), reader, authenticated)[0]
        merged = dict(row)
        for key in ("ad", "node_ad"):
            merged.pop(key, None)
        merged.update(doc)
        out.append(merged)
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
    based on the signed app origin, never an absent or spoofed Origin header.
    """
    reader = user_or_anon(data)
    authenticated = reader != "anon"

    # Per-user rate limit (D65) — fail fast before any contract/group/query
    # work. Anon shares a worker-wide budget.
    _check_query_rate_limit(reader)

    # App-contract gate: the query may only touch services the app's contract
    # grants readAll on.
    origin = app_contract_origin(data, request) if authenticated else None
    if origin is not None:
        perms = ch.get_app_permissions(reader, origin) or {}
        allowed = frozenset(svc for svc, ops in perms.items() if "readAll" in (ops or []))
    else:
        allowed = None  # unrestricted: any non-raw table name is a service

    # Which services does the query touch? Parse + validate first — an unsafe
    # query is rejected before any group lookup happens.
    try:
        needed = sq.query_services(data.sql, allowed, group_meta=bool(data.withGroupMeta))
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

    # QE-A: the group_meta readable set. When the caller opts in, the endpoint
    # computes the reader's readable groups for the metadata CTE (parallel to
    # readable_groups_by_service). It is the union of the readable groups
    # across the services the query touches (the same D58 gate the service
    # CTEs use). A standalone group_meta query (no services) falls back to the
    # reader's own memberships among the candidates (membership is
    # service-agnostic). build_safe_query injects the CTE only if the query
    # actually references group_meta, so this is a no-op for queries that opt
    # in but don't join it.
    group_meta = None
    if data.withGroupMeta:
        if readable:
            readable_meta = sorted({g for groups in readable.values() for g in groups})
        else:
            my_groups = {g["group_id"] for g in ch.get_user_groups(reader)}
            readable_meta = [g for g in candidates if g in my_groups]
        group_meta = (readable_meta, candidates)

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
            data.sql,
            readable,
            member_key=reader,
            allowed_services=allowed,
            max_limit=MAX_ROWS,
            group_meta=group_meta,
        )
    except sq.UnsafeQueryError as e:
        raise HTTPException(status_code=403, detail=str(e))

    log.info(
        "[query] reader=%s services=%s group_meta=%s candidates=%d",
        reader,
        sorted(needed),
        bool(data.withGroupMeta),
        len(candidates),
    )

    try:
        column_names, rows = ch.execute_query(
            compiled,
            settings={
                "max_execution_time": MAX_EXECUTION_TIME_S,
                "max_result_rows": MAX_ROWS,
                "max_result_bytes": MAX_RESULT_BYTES,
                "result_overflow_mode": "throw",
                "readonly": 1,
            },
        )
    except ch.QueryExecutionError:
        error_id = uuid4().hex
        log.warning("[query] execution failed reader=%s error_id=%s", reader, error_id)
        raise HTTPException(status_code=400, detail=f"query execution failed (reference: {error_id})") from None

    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail="query result exceeds row limit")
    out = [_serialize_row(dict(zip(column_names, row))) for row in rows]
    if len(json.dumps({"rows": out, "count": len(out)}, ensure_ascii=False).encode("utf-8")) > MAX_RESULT_BYTES:
        raise HTTPException(status_code=400, detail="query result exceeds byte limit")
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
    if data.prepare:
        try:
            out = _prepare_rows(out, reader, data.prepare, authenticated, needed, allowed, candidates)
        except ch.QueryExecutionError:
            error_id = uuid4().hex
            log.warning("[query] canonical preparation failed reader=%s error_id=%s", reader, error_id)
            raise HTTPException(
                status_code=400, detail=f"canonical query preparation failed (reference: {error_id})"
            ) from None
    result = {"rows": out, "count": len(out)}
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > MAX_RESULT_BYTES:
        raise HTTPException(status_code=400, detail="prepared query result exceeds byte limit")
    return result
