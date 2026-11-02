import logging
import time
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from sqlglot import ErrorLevel, exp, parse_one

import app.exceptions as exceptions
import app.settings as settings
import app.v3.services.safe_query as sq
from app.v3.endpoints.auth_helper import client_id_of, user_or_anon
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


def _query_shape(sql: str) -> dict:
    """Diagnostic AST topology only; never serialize SQL or caller AST text."""
    try:
        # Parser fallback warnings must not echo SQL either. Errors are caught
        # without logging their potentially content-bearing messages.
        tree = parse_one(sql, read=sq.DIALECT, error_level=ErrorLevel.RAISE, error_message_context=0)
        if not isinstance(tree, exp.Query):
            return {"status": "unavailable"}
        nodes, literals, indexes = [], [], {}
        for index, node in enumerate(tree.walk()):
            if index == 128:
                return {"status": "truncated", "nodes": nodes, "literals": literals}
            indexes[id(node)] = index
            nodes.append((indexes.get(id(node.parent)), type(node).__name__))
            if isinstance(node, exp.Literal):
                literals.append((index, "string" if node.is_string else "number", len(node.this)))
            elif isinstance(node, (exp.Boolean, exp.Null)):
                literals.append((index, "boolean" if isinstance(node, exp.Boolean) else "null", None))
        return {"status": "ok", "nodes": nodes, "literals": literals}
    except Exception:
        return {"status": "unavailable"}


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


def _canonical_prepare_docs(rows: list[dict], reader: str, readable: dict[str, list[str]]) -> list[dict]:
    """Projection identities request canonical reads; projected fields grant no authority."""
    ids = {r.get("doc_id") for r in rows if isinstance(r.get("doc_id"), str) and r["doc_id"]}
    if len(ids) == 0 or any(not isinstance(r.get("doc_id"), str) or not r["doc_id"] for r in rows):
        raise HTTPException(status_code=403, detail="prepare requires authorized canonical documents")
    canonical = {}
    for service, groups in readable.items():
        if not groups:
            continue
        select = (
            exp.select("doc_id", "author_key", "posted_by", "body", "ad_mode", "ad_target")
            .from_(exp.Table(this=exp.to_identifier(service, quoted=True)))
            .where(exp.In(this=exp.column("doc_id"), expressions=[exp.Literal.string(i) for i in sorted(ids)]))
            .distinct()
        )
        compiled = sq.build_safe_query(
            select.sql(dialect="clickhouse"),
            {service: groups},
            member_key=reader,
            allowed_services=frozenset({service}),
            max_limit=max(MAX_ROWS, len(ids) + 1),
        )
        try:
            columns, values = ch.execute_query(compiled, settings={"max_execution_time": MAX_EXECUTION_TIME_S})
        except ch.QueryExecutionError:
            raise HTTPException(status_code=403, detail="canonical prepare read failed")
        for values_row in values:
            doc = _serialize_row(dict(zip(columns, values_row)))
            doc_id = doc["doc_id"]
            identity = (service, doc["author_key"])
            if doc_id in canonical and canonical[doc_id][0] != identity:
                raise HTTPException(status_code=403, detail="ambiguous canonical prepare identity")
            canonical[doc_id] = (identity, doc)
    if not ids <= canonical.keys():
        raise HTTPException(status_code=403, detail="prepare requires authorized canonical documents")
    log.info("[query] canonical prepare: bound rows=%d", len(rows))
    return [
        {**{k: v for k, v in row.items() if k not in {"ad", "node_ad"}}, **canonical[row["doc_id"]][1]} for row in rows
    ]


def _prepare_rows(
    rows: list[dict], reader: str, prepare: PrepareSpec, readable: dict[str, list[str]], authenticated: bool = False
) -> list[dict]:
    """The prepare pass (D73): mint the result rows so a single ``w.query()``
    returns render-ready rows. Reuses the read path's passes verbatim
    (``attach_pinned_ads`` + ``attach_node_ads`` + ``resolve_media_urls_in_docs``
    + ``_mint_hls_manifest_urls``), applied to the query's rows.

    Media/ad rows are rebound through a fresh server-written query using the
    same service/group/visibility boundary before minting. Face projection
    binding remains a separate open boundary. Non-document aggregate rows no-op.
    """
    if not rows:
        return rows
    docs = list(rows)
    if prepare.media or prepare.ads:
        indexes = [
            i
            for i, row in enumerate(rows)
            if isinstance(row.get("doc_id"), str)
            and row["doc_id"]
            and isinstance(row.get("author_key"), str)
            and row["author_key"]
            and "body" in row
        ]
        if indexes:
            bound = _canonical_prepare_docs([rows[i] for i in indexes], reader, readable)
            if prepare.ads:
                bound = ch.attach_pinned_ads(bound, reader)
                bound = ch.attach_node_ads(bound, reader)
            if prepare.media:
                bound = ch.resolve_media_urls_in_docs(bound)
                bound = _mint_hls_manifest_urls(bound, reader, authenticated)
            for i, doc in zip(indexes, bound, strict=True):
                docs[i] = doc
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
    t0 = time.perf_counter()
    reader = user_or_anon(data)
    authenticated = reader != "anon"
    t_auth = time.perf_counter() - t0

    # Per-user rate limit (D65) — fail fast before any contract/group/query
    # work. Keyed on the verified user_key; anon is skipped.
    _check_query_rate_limit(reader)

    # App-contract gate: the query may only touch services the app's contract
    # grants readAll on. Origin→client_id re-keying (D92, O3): a delegated
    # token (client_id) is always gated on its client_id contract — even with
    # no Origin; a browser token keeps the Origin path (skipped when no Origin).
    t1 = time.perf_counter()
    origin = request.headers.get("origin", "")
    delegated_client_id = client_id_of(data) if authenticated else None
    if authenticated and (delegated_client_id or origin):
        perms = ch.get_app_permissions(reader, origin, client_id=delegated_client_id) or {}
        allowed = frozenset(svc for svc, ops in perms.items() if "readAll" in (ops or []))
    else:
        allowed = None  # unrestricted: any non-raw table name is a service
    t_app_contract = time.perf_counter() - t1

    # Which services does the query touch? Parse + validate first — an unsafe
    # query is rejected before any group lookup happens.
    t2 = time.perf_counter()
    try:
        needed = sq.query_services(data.sql, allowed, group_meta=bool(data.withGroupMeta))
    except sq.UnsafeQueryError as e:
        raise HTTPException(status_code=403, detail=str(e))
    t_parse_validate = time.perf_counter() - t2

    # Candidate groups: explicit `groups`, or all the reader's groups (the
    # "me" semantics of the group read).
    t3 = time.perf_counter()
    if data.groups:
        candidates = data.groups
    else:
        candidates = [g["group_id"] for g in ch.get_user_groups(reader)]
    t_candidates = time.perf_counter() - t3

    # The D58 read gate, per service the query actually uses.
    #
    # QUERY_EVAL_NO_POLICY (line A, the no-policy baseline): skip the readable
    # resolution entirely — every candidate is treated as readable, so the
    # boundary CTEs scope to the full candidate set (no per-group filtering).
    # This is the credited ClickHouse baseline the causal overhead (B−A) is
    # computed against. Test-mode only: it bypasses the I3 boundary, so it must
    # never be enabled on a public node.
    t4 = time.perf_counter()
    if settings.QUERY_EVAL_NO_POLICY:
        readable = {svc: list(candidates) for svc in needed}
    else:
        # QUERY_EVAL_READABLE_MODE selects the resolution algorithm: "per-group"
        # (the current O(K) round-trip path) or "batched" (the O(1)-round-trip
        # readable_groups_batched). Both have identical semantics; the
        # experiment plots both against K to show the bottleneck + the fix.
        # Referenced as ch.<name> (attribute lookup at call time) so the test
        # patches on the clickhouse module apply to whichever is chosen.
        if settings.QUERY_EVAL_READABLE_MODE == "batched":
            _resolve = ch.readable_groups_batched
        else:
            _resolve = ch.readable_groups
        readable = {svc: _resolve(reader, svc, authenticated, candidates) for svc in needed}
    t_readable = time.perf_counter() - t4

    # QE-A: the group_meta readable set. When the caller opts in, the endpoint
    # computes the reader's readable groups for the metadata CTE (parallel to
    # readable_groups_by_service). It is the union of the readable groups
    # across the services the query touches (the same D58 gate the service
    # CTEs use). A standalone group_meta query (no services) falls back to the
    # reader's own memberships among the candidates (membership is
    # service-agnostic). build_safe_query injects the CTE only if the query
    # actually references group_meta, so this is a no-op for queries that opt
    # in but don't join it.
    t5 = time.perf_counter()
    group_meta = None
    if data.withGroupMeta:
        if readable:
            readable_meta = sorted({g for groups in readable.values() for g in groups})
        else:
            my_groups = {g["group_id"] for g in ch.get_user_groups(reader)}
            readable_meta = [g for g in candidates if g in my_groups]
        group_meta = (readable_meta, candidates)
    t_group_meta = time.perf_counter() - t5

    # D42 (the read endpoint's rule, generalized): an explicit group request
    # that the reader's effective role grants read on NONE of (for every
    # service the query touches) is an access failure the app can act on —
    # not an empty result. The message is the stable contract the demos +
    # e2e key off (`/not a member/i`). The "me" path (no explicit groups) and
    # service-free queries (`SELECT 1`) are exempt: an empty result is valid
    # there. Exempt under QUERY_EVAL_NO_POLICY too: the baseline (line A) runs
    # unscoped by definition, so the membership 403 does not apply.
    if not settings.QUERY_EVAL_NO_POLICY and data.groups and authenticated and needed and not any(readable.values()):
        raise HTTPException(
            status_code=403,
            detail="not a member of the requested group",
        )

    t6 = time.perf_counter()
    try:
        if settings.QUERY_EVAL_NO_POLICY:
            # Line A: the no-policy baseline. Run the caller's SQL unscoped —
            # no boundary CTEs, no readable-set filtering. This is the
            # credited ClickHouse baseline (the engine + the SQL shape, with no
            # access layer). Test-mode only; it bypasses the I3 boundary.
            compiled = data.sql
        else:
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
    t_compile = time.perf_counter() - t6

    diagnostic_id = uuid4().hex
    log.info(
        "[query] id=%s services=%d group_meta=%s candidates=%d shape=%s compiled_shape=%s",
        diagnostic_id,
        len(needed),
        bool(data.withGroupMeta),
        len(candidates),
        _query_shape(data.sql),
        _query_shape(compiled),
    )

    t7 = time.perf_counter()
    if settings.QUERY_EVAL_STUB_EXECUTE:
        # Line C: the stubbed scan. Return a fixed N-row synthetic result
        # instead of running the compiled SQL — isolates the policy layer
        # (auth→…→compile→serialize) from the columnar engine so the
        # experiment measures "our part" with the scan held out. The rows are
        # shape-only (a doc_id + a body) so the serialize/prepare phases still
        # run over a realistic row count. Test-mode only; never on a public
        # node (it returns synthetic data, not the reader's).
        n = settings.QUERY_EVAL_STUB_ROWS
        column_names = ["doc_id", "body"]
        rows = [(f"stub-{i:06d}", '{"stub": true}') for i in range(n)]
    else:
        try:
            column_names, rows = ch.execute_query(compiled, settings={"max_execution_time": MAX_EXECUTION_TIME_S})
        except ch.QueryExecutionError as e:
            # The compiled query is structurally safe; a ClickHouse failure here
            # is the caller's SQL (a column the boundary CTE doesn't expose, a
            # bad function arg, ...).
            log.warning(
                "[query] id=%s execution failed duration_ms=%.2f", diagnostic_id, (time.perf_counter() - t7) * 1000
            )
            raise HTTPException(status_code=400, detail=f"query execution failed: {e}")
    t_execute = time.perf_counter() - t7

    t8 = time.perf_counter()
    duration_ms = (time.perf_counter() - t7) * 1000
    out = [_serialize_row(dict(zip(column_names, row))) for row in rows]
    t_serialize = time.perf_counter() - t8
    # D86: a content query is a content view (the feed-as-query, D73) — log a
    # delivery impression per returned doc (the server-side, un-gameable floor).
    # The query engine can't reference content_events (a raw node table), so the
    # delivery is a side effect here, the same principle as the read path: the
    # node logs what it actually served. The app declares the content service
    # (the feed's `posts`) + the surface; the node logs per returned doc_id.
    # Best-effort: a metrics failure never fails the query.
    if data.surface and data.content_service and reader != "anon" and out:
        doc_ids = [r["doc_id"] for r in out if isinstance(r, dict) and r.get("doc_id")]
        ch.log_content_deliveries(doc_ids, data.content_service, reader, data.surface)
    # Column aliases can contain caller input too; retain counts, not names.
    log.info(
        "[query] id=%s rows=%d columns=%d duration_ms=%.2f",
        diagnostic_id,
        len(rows),
        len(column_names),
        duration_ms,
    )
    # The prepare pass (D73): mint media + HLS + ads + face on the result rows
    # so the query returns render-ready rows in one round-trip (the feed-as-
    # query pattern). Input scoping does not certify arbitrary output aliases;
    # media/ad preparation re-reads canonical data before capability issuance.
    t9 = time.perf_counter()
    if data.prepare:
        out = _prepare_rows(out, reader, data.prepare, readable, authenticated)
    t_prepare = time.perf_counter() - t9

    # Phase-level timing telemetry (the paper's evaluation data): where does
    # the time go? auth (token verify), app_contract (the app-contract gate),
    # parse_validate (AST parse + table walk), candidates (get_user_groups),
    # readable (the D58 read gate — the access decision), group_meta (QE-A),
    # compile (CTE injection + round-trip), execute (ClickHouse), serialize
    # (row serialization), prepare (the D73 mint pass). Metadata only — no
    # SQL, no content, no caller input (the security boundary in
    # knowledge-base/web10-v3/security/logging.md).
    total_ms = (time.perf_counter() - t0) * 1000
    log.info(
        "[query] id=%s timing_ms auth=%.2f app_contract=%.2f parse_validate=%.2f "
        "candidates=%.2f readable=%.2f group_meta=%.2f compile=%.2f execute=%.2f "
        "serialize=%.2f prepare=%.2f total=%.2f",
        diagnostic_id,
        t_auth * 1000,
        t_app_contract * 1000,
        t_parse_validate * 1000,
        t_candidates * 1000,
        t_readable * 1000,
        t_group_meta * 1000,
        t_compile * 1000,
        t_execute * 1000,
        t_serialize * 1000,
        t_prepare * 1000,
        total_ms,
    )
    return {"rows": out, "count": len(out)}
