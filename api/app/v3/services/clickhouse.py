import json
import logging
import threading
import time
import uuid
from datetime import datetime

import clickhouse_connect
from uuid6 import uuid7

import app.settings as settings
from app.services.media import get_s3_client, get_s3_signing_client

log = logging.getLogger(__name__)

# The ClickHouse client is created lazily, PER THREAD (thread-local), not as a
# single global. The API endpoints are sync (run in FastAPI's thread pool) and
# the client is a blocking, single-connection object — a shared global would be
# a data race under concurrent requests. A thread-local gives each worker thread
# its own connection (created once on first use, then reused), so concurrent
# requests run in parallel without blocking the event loop or racing on a
# shared connection.
_thread_local = threading.local()


def _get_client():
    client = getattr(_thread_local, "client", None)
    if client is None:
        client = clickhouse_connect.get_client(
            host=settings.CLICKHOUSE_HOST,
            port=settings.CLICKHOUSE_PORT,
            database=settings.CLICKHOUSE_DATABASE,
            username=settings.CLICKHOUSE_USER,
            password=settings.CLICKHOUSE_PASSWORD,
            secure=settings.CLICKHOUSE_SECURE,
        )
        _thread_local.client = client
    return client


class _LazyClickHouse:
    """Lazy proxy — the actual ClickHouse connection is only created on first
    use (per thread), so the API can start even when ClickHouse isn't
    available yet (e.g., dev stack without a ClickHouse container, or during
    startup before ClickHouse is ready)."""

    def __getattr__(self, name):
        return getattr(_get_client(), name)


client = _LazyClickHouse()


def _now() -> datetime:
    return datetime.utcnow()


def _json(body: dict) -> str:
    return json.dumps(body)


def _parse_json(body: str) -> dict:
    if not body:
        return {}
    return json.loads(body)


def _gen_doc_id() -> str:
    """Generate a time-ordered UUID (UUIDv7) as hex. Better for ClickHouse merge trees than random UUIDv4."""
    return str(uuid7())


def ensure_apps_schema():
    """Self-heal the v3 schema on pre-existing deployments.

    The DDL template (clickhouse-init) only runs on a FRESH ClickHouse
    volume; dev/prod volumes predate newer tables/columns. This idempotent
    pass adds them on boot so the schema is complete everywhere. Safe to
    run from every gunicorn worker — every statement is a no-op once the
    object exists.
    """
    try:
        # apps.visits — the visit tracker (app store). Pre-existing volumes
        # have the apps table without the column; ADD COLUMN appends it at
        # the end, which is why inserts must name their columns.
        client.command("ALTER TABLE apps ADD COLUMN IF NOT EXISTS visits UInt64 DEFAULT 0")
        # app_ratings.comment — reviews are a rating with words (D52).
        # Pre-existing volumes predate the column; ADD COLUMN appends it at
        # the end, which is why inserts must name their columns.
        client.command("ALTER TABLE app_ratings ADD COLUMN IF NOT EXISTS comment String DEFAULT ''")
        # node_config — node-level config (the v2 Mongo web10.config
        # collection, moved to ClickHouse: v3 stacks run no Mongo).
        client.command(
            "CREATE TABLE IF NOT EXISTS node_config ("
            "config_id String, body String, updated_at DateTime64(3), deleted UInt8 DEFAULT 0"
            ") ENGINE = ReplacingMergeTree(updated_at) ORDER BY config_id"
        )
        # app_visits — the app usage log (D49). Pre-existing volumes predate
        # the table; without it the ingest gate and the /v3/stats macro
        # query a missing table on the first ping.
        client.command(
            "CREATE TABLE IF NOT EXISTS app_visits ("
            "app_url String, username String, seen_at DateTime64(3)"
            ") ENGINE = MergeTree ORDER BY (app_url, username, seen_at)"
            " TTL toDateTime(seen_at) + INTERVAL 2 YEAR"
        )
        # group_contracts.discoverable — the group directory listing switch
        # (D53). Pre-existing volumes predate the column; ADD COLUMN appends
        # it at the end, which is why group inserts name their columns.
        client.command("ALTER TABLE group_contracts ADD COLUMN IF NOT EXISTS discoverable UInt8 DEFAULT 1")
        log.info(
            "[v3] schema ensured (apps.visits + app_ratings.comment + node_config + app_visits + group_contracts.discoverable present)"
        )
        # Data migration (idempotent): re-home demo apps registered under
        # their directory-index file URLs onto their directory URLs.
        _migrate_file_index_app_rows()
    except Exception as e:
        # ClickHouse not up yet, or table missing (fresh volume mid-init).
        # The DDL template covers fresh volumes; log and move on.
        log.warning(f"[v3] schema ensure skipped: {type(e).__name__}: {e}")


def _tombstone_app_row(url: str) -> None:
    """Mark the latest live row for ``url`` as deleted (the dedup-then-filter
    house pattern — a tombstone row ranks latest, so the app leaves the store)."""
    client.command(
        "INSERT INTO apps (url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, updated_at, deleted) "
        "SELECT url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, now64(6), 1 "
        "FROM (SELECT url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, updated_at, deleted, "
        "row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM apps) WHERE rn = 1 AND deleted = 0 AND url = %(url)s",
        {"url": url},
    )


def _migrate_file_index_app_rows() -> None:
    """One-time, idempotent data migration.

    The store's demo apps were registered under their directory-index file
    URLs (``.../docs/media/index.html``) because the docs page linked the
    explicit ``index.html`` and the SDK registered ``window.location.href``.
    #683 fixed the identity fork for NEW registrations (the canonicalizer
    and the SDK now collapse ``/index.html`` to the directory), but the rows
    already stored under file URLs remain — icon-less, name-less duplicate
    cards whose manifest lookup (``.../index.html/manifest.json``) can never
    resolve.

    Re-home each live file-index row under its directory URL (carrying over
    name/description/approval so the demos stay approved and keep their
    icons) and tombstone the file row. Idempotent: once the file rows are
    tombstoned the source query returns nothing on later boots, and the
    canonicalizer now strips ``/index.html`` so no new file-index rows can be
    created. Safe under concurrent gunicorn workers — duplicate re-home rows
    carry identical state and the dedup hides all but one.
    """
    result = client.query(
        "SELECT url, name, description, icon_url, screenshots, visits, approved, review_state, "
        "metadata_version, created_at "
        "FROM (SELECT url, name, description, icon_url, screenshots, visits, approved, review_state, "
        "metadata_version, created_at, updated_at, deleted, "
        "row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM apps) WHERE rn = 1 AND deleted = 0 "
        "AND (url LIKE '%/index.html' OR url LIKE '%/index.html/')"
    )
    if not result.result_rows:
        return
    for row in result.result_rows:
        old_url = row[0]
        new_url = _canonical_app_url(old_url)
        if new_url == old_url:
            continue
        # A live row already exists under the directory URL (e.g. a
        # post-#683 visit registered it) — keep that row, just drop the
        # stale file row.
        if not get_app(new_url):
            client.insert(
                "apps",
                [[new_url, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], _now(), 0]],
                column_names=[
                    "url",
                    "name",
                    "description",
                    "icon_url",
                    "screenshots",
                    "visits",
                    "approved",
                    "review_state",
                    "metadata_version",
                    "created_at",
                    "updated_at",
                    "deleted",
                ],
            )
        _tombstone_app_row(old_url)
        log.info(f"[v3] re-homed app {old_url} -> {new_url}")


# ---------------------------------------------------------------------------
# Discover group — the node-default universal public board
# ---------------------------------------------------------------------------
#
# The discover group is a NODE DEFAULT, not an app-created group (KB:
# web10-v3/groups/social-contracts.md §1 — owner "System", members "Everyone
# (auto-join)"; web10-social-v3/discover.md — "every user (including anon) is
# a member"). It is the universal public board: a read of the group IS the
# board, and a post is public when its author attaches it here. The group id
# is a well-known constant (not provider-derived) so every app — and the
# marketing site, which reads it as anon — addresses the same board.

DISCOVER_GROUP_ID = "web10.app/groups/web10/discover"

# One role. Everyone shares it (social-contracts.md §1): read the board, post
# to it, manage your own posts. No owners, no moderators.
DISCOVER_ROLES = [
    {
        "name": "member",
        "services": ["posts"],
        "permissions": ["readAll", "create", "updateOwn", "deleteOwn"],
    }
]


def _ensure_discover_group_contract() -> None:
    """Create the discover group contract if missing (no membership work).

    The lightweight half of ensure_discover_group — safe to call from the
    signup path (create_user) where we only need the contract to exist before
    enrolling the new user, not the full anon + backfill pass.
    """
    if not get_group(DISCOVER_GROUP_ID):
        # discoverable=False (D53): the board is anon-readable (anon is a
        # member) but NOT a directory entry — it's a board, not a community.
        create_group(DISCOVER_GROUP_ID, DISCOVER_ROLES, "open", discoverable=False)
        log.info("[v3] discover group created: %s", DISCOVER_GROUP_ID)


def ensure_discover_group() -> None:
    """Ensure the node-default discover group exists and is populated.

    Idempotent boot pass (safe from every gunicorn worker):
      1. create the group contract if missing,
      2. ensure `anon` is a member — the public surface reads the board as
         anon, so anon membership is what makes it anon-readable,
      3. backfill every existing user as a member (auto-enrollment for
         accounts created before the group existed).
    New users are enrolled at signup (see create_user), so the backfill only
    adds pre-existing accounts.

    Resilient like ensure_apps_schema: ClickHouse may not be ready at boot
    (or a test may run this against a stub), so a failure is logged and
    deferred to the next boot / the signup auto-enroll, not fatal.
    """
    try:
        _ensure_discover_group_contract()

        members = set(get_group_member_keys(DISCOVER_GROUP_ID))
        if "anon" not in members:
            add_group_member(DISCOVER_GROUP_ID, "anon", "member")
            log.info("[v3] discover group: anon enrolled")

        added = 0
        for user in list_users():
            if user["username"] not in members:
                add_group_member(DISCOVER_GROUP_ID, user["username"], "member")
                added += 1
        if added:
            log.info("[v3] discover group: backfilled %d user(s)", added)
    except Exception as e:
        log.warning(f"[v3] discover group ensure skipped: {type(e).__name__}: {e}")


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def insert_document(
    author_key: str,
    service: str,
    body: dict,
    ref_value: str = "",
    tags: list[str] | None = None,
    doc_id: str | None = None,
) -> dict:
    """Insert a document into the documents table. Generates doc_id if not provided."""
    now = _now()
    if not doc_id:
        doc_id = _gen_doc_id()
    client.insert(
        "documents",
        [[doc_id, author_key, service, _json(body), ref_value or "", tags or [], now, now, 0]],
    )
    return {
        "doc_id": doc_id,
        "author_key": author_key,
        "service": service,
        "body": body,
        "ref_value": ref_value,
        "tags": tags or [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


def read_documents(
    author_key: str | None,
    service: str,
    doc_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    sort_desc: bool = True,
) -> list[dict]:
    """Read documents by author and service. Optional doc_id filter."""
    conditions = ["collection_name = %(coll)s"]
    params = {"coll": service}

    if author_key:
        conditions.append("author_key = %(author)s")
        params["author"] = author_key

    if doc_id:
        conditions.append("doc_id = %(doc_id)s")
        params["doc_id"] = doc_id

    where = " AND ".join(conditions)
    order = "created_at DESC" if sort_desc else "created_at ASC"

    result = client.query(
        f"""
        SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at
        FROM (
            SELECT *, row_number() OVER (PARTITION BY doc_id, author_key ORDER BY updated_at DESC) AS rn
            FROM documents
            WHERE {where}
        )
        WHERE rn = 1 AND deleted = 0
        ORDER BY {order}
        LIMIT %(limit)s OFFSET %(offset)s
    """,
        {"limit": limit, "offset": offset, **params},
    )

    rows = []
    for row in result.result_rows:
        rows.append(
            {
                "doc_id": row[0],
                "author_key": row[1],
                "service": row[2],
                "body": _parse_json(row[3]),
                "ref_value": row[4],
                "tags": list(row[5]),
                "created_at": str(row[6]),
                "updated_at": str(row[7]),
            }
        )
    return rows


def update_document(
    doc_id: str, author_key: str, service: str, body: dict, ref_value: str = "", tags: list[str] | None = None
) -> dict:
    """Update a document (insert new version with higher updated_at, preserve created_at)."""
    existing = get_document(doc_id, author_key)
    if not existing:
        return None
    now = _now()
    created_at = datetime.fromisoformat(existing["created_at"])
    client.insert(
        "documents",
        [[doc_id, author_key, service, _json(body), ref_value or "", tags or [], created_at, now, 0]],
    )
    return {
        "doc_id": doc_id,
        "author_key": author_key,
        "service": service,
        "body": body,
        "ref_value": ref_value,
        "tags": tags or [],
        "created_at": existing["created_at"],
        "updated_at": now.isoformat(),
    }


def delete_document(doc_id: str, author_key: str, service: str):
    """Tombstone a document (insert deleted=1 version)."""
    client.command(
        "INSERT INTO documents (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted) "
        "SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, now64(6), 1 "
        "FROM documents WHERE doc_id = %(doc_id)s AND author_key = %(author_key)s AND collection_name = %(service)s AND deleted = 0",
        {"doc_id": doc_id, "author_key": author_key, "service": service},
    )


def get_document(doc_id: str, author_key: str) -> dict | None:
    """Get a single document by doc_id and author_key."""
    result = client.query(
        "SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at "
        "FROM documents WHERE doc_id = %(doc_id)s AND author_key = %(author_key)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"doc_id": doc_id, "author_key": author_key},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "doc_id": row[0],
        "author_key": row[1],
        "service": row[2],
        "body": _parse_json(row[3]),
        "ref_value": row[4],
        "tags": list(row[5]),
        "created_at": str(row[6]),
        "updated_at": str(row[7]),
    }


def get_document_any_author(doc_id: str) -> dict | None:
    """Get a document by doc_id without knowing the author.

    Used by the HLS manifest re-check (`services/hls.py`): the stream token
    carries the reader's username, and the endpoint must find the document
    to verify author/membership access — the caller already holds a
    document-bound sig, so this is not an enumeration surface.
    """
    result = client.query(
        "SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at "
        "FROM documents WHERE doc_id = %(doc_id)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"doc_id": doc_id},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "doc_id": row[0],
        "author_key": row[1],
        "service": row[2],
        "body": _parse_json(row[3]),
        "ref_value": row[4],
        "tags": list(row[5]),
        "created_at": str(row[6]),
        "updated_at": str(row[7]),
    }


# ---------------------------------------------------------------------------
# Doc Groups
# ---------------------------------------------------------------------------


def attach_doc_to_groups(doc_id: str, group_ids: list[str]):
    """Attach a document to multiple groups."""
    if not group_ids:
        return
    now = _now()
    rows = [[doc_id, gid, now, now, 0] for gid in group_ids]
    client.insert("doc_groups", rows)


def detach_doc_from_groups(doc_id: str):
    """Tombstone all group attachments for a document."""
    client.command(
        "INSERT INTO doc_groups (doc_id, group_id, created_at, updated_at, deleted) "
        "SELECT doc_id, group_id, created_at, now(), 1 "
        "FROM doc_groups WHERE doc_id = %(doc_id)s AND deleted = 0",
        {"doc_id": doc_id},
    )


def replace_doc_groups(doc_id: str, group_ids: list[str]):
    """Tombstone old group attachments, insert new ones."""
    detach_doc_from_groups(doc_id)
    attach_doc_to_groups(doc_id, group_ids)


def get_doc_groups(doc_id: str) -> list[str]:
    """Get active group IDs for a document."""
    result = client.query(
        "SELECT group_id FROM doc_groups WHERE doc_id = %(doc_id)s AND deleted = 0",
        {"doc_id": doc_id},
    )
    return [row[0] for row in result.result_rows]


# ---------------------------------------------------------------------------
# Group Contracts
# ---------------------------------------------------------------------------


def create_group(group_id: str, roles: list[dict], join_policy: str, discoverable: bool | None = None) -> dict:
    """Create a group contract.

    ``discoverable`` (D53) lists the group in the public directory. It
    defaults to ``True`` — groups are discoverable by default — except
    ``invite_only`` groups, which default to ``False`` (inherently private:
    DMs, private circles). Pass ``discoverable`` explicitly to override.
    """
    if discoverable is None:
        discoverable = join_policy != "invite_only"
    now = _now()
    client.insert(
        "group_contracts",
        [[group_id, _json(roles), join_policy, int(discoverable), now, now, 0]],
        column_names=["group_id", "roles", "join_policy", "discoverable", "created_at", "updated_at", "deleted"],
    )
    return {
        "group_id": group_id,
        "roles": roles,
        "join_policy": join_policy,
        "discoverable": discoverable,
        "created_at": now.isoformat(),
    }


def get_group(group_id: str) -> dict | None:
    """Get a group contract (latest version).

    Dedup first (latest row wins, tombstones included) then filter deleted=0 —
    a deleted group must not be found by its stale active row.
    """
    result = client.query(
        "SELECT group_id, roles, join_policy, discoverable, created_at, updated_at "
        "FROM (SELECT group_id, roles, join_policy, discoverable, created_at, updated_at, deleted, "
        "row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_contracts WHERE group_id = %(group_id)s) "
        "WHERE rn = 1 AND deleted = 0",
        {"group_id": group_id},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "group_id": row[0],
        "roles": _parse_json(row[1]),
        "join_policy": row[2],
        "discoverable": bool(row[3]),
        "created_at": str(row[4]),
        "updated_at": str(row[5]),
    }


def delete_group(group_id: str):
    """Tombstone a group contract and all its members."""
    # Tombstone the group contract
    client.command(
        "INSERT INTO group_contracts (group_id, roles, join_policy, discoverable, created_at, updated_at, deleted) "
        "SELECT group_id, roles, join_policy, discoverable, created_at, now64(6), 1 "
        "FROM group_contracts WHERE group_id = %(group_id)s AND deleted = 0",
        {"group_id": group_id},
    )
    # Tombstone all members
    client.command(
        "INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted) "
        "SELECT group_id, member_key, role, joined_at, now64(6), 1 "
        "FROM group_members WHERE group_id = %(group_id)s AND deleted = 0",
        {"group_id": group_id},
    )
    # Tombstone all join requests
    client.command(
        "INSERT INTO group_join_requests (group_id, requester_key, status, requested_at, resolved_at, updated_at, deleted) "
        "SELECT group_id, requester_key, status, requested_at, resolved_at, now64(6), 1 "
        "FROM group_join_requests WHERE group_id = %(group_id)s AND deleted = 0",
        {"group_id": group_id},
    )


def update_group(group_id: str, **kwargs):
    """Update a group contract (insert new version)."""
    existing = get_group(group_id)
    if not existing:
        return None
    roles = kwargs.get("roles", existing["roles"])
    join_policy = kwargs.get("join_policy", existing["join_policy"])
    discoverable = kwargs.get("discoverable", existing["discoverable"])
    now = _now()
    client.insert(
        "group_contracts",
        [[group_id, _json(roles), join_policy, int(discoverable), existing["created_at"], now, 0]],
        column_names=["group_id", "roles", "join_policy", "discoverable", "created_at", "updated_at", "deleted"],
    )
    return {
        "group_id": group_id,
        "roles": roles,
        "join_policy": join_policy,
        "discoverable": discoverable,
        "updated_at": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Group Members
# ---------------------------------------------------------------------------


def add_group_member(group_id: str, member_key: str, role: str) -> dict:
    """Add a member to a group."""
    now = _now()
    client.insert(
        "group_members",
        [[group_id, member_key, role, now, now, 0]],
    )
    return {
        "group_id": group_id,
        "member_key": member_key,
        "role": role,
        "joined_at": now.isoformat(),
    }


def remove_group_member(group_id: str, member_key: str):
    """Tombstone a group member.

    now64(6) (microsecond) — not now() (second) — so the tombstone's
    updated_at is never earlier than the active row it supersedes when both
    land in the same second; the reader's row_number() keys off updated_at.
    """
    client.command(
        "INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted) "
        "SELECT group_id, member_key, role, joined_at, now64(6), 1 "
        "FROM group_members WHERE group_id = %(group_id)s AND member_key = %(member_key)s AND deleted = 0",
        {"group_id": group_id, "member_key": member_key},
    )


def get_group_members(group_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    """Get active members of a group (deduplicated by latest version).

    A remove/leave is a tombstone (deleted=1). We must dedup FIRST (latest
    row per member_key wins, tombstones included) and only then filter
    deleted=0 — filtering deleted=0 up front would let a stale active row
    resurrect a member who was removed or left.
    """
    result = client.query(
        "SELECT member_key, role, joined_at "
        "FROM (SELECT member_key, role, joined_at, deleted, "
        "row_number() OVER (PARTITION BY member_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_members "
        "WHERE group_id = %(group_id)s) "
        "WHERE rn = 1 AND deleted = 0 "
        "LIMIT %(limit)s OFFSET %(offset)s",
        {"group_id": group_id, "limit": limit, "offset": offset},
    )
    return [{"member_key": row[0], "role": row[1], "joined_at": str(row[2])} for row in result.result_rows]


def get_group_member(group_id: str, member_key: str) -> dict | None:
    """Get a specific member of a group (latest version).

    Dedups by updated_at (tombstones included) then filters deleted=0, so a
    removed/left member resolves to their current state, not a stale row.
    """
    result = client.query(
        "SELECT member_key, role, joined_at FROM (SELECT member_key, role, joined_at, deleted, "
        "row_number() OVER (PARTITION BY member_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_members "
        "WHERE group_id = %(group_id)s AND member_key = %(member_key)s) "
        "WHERE rn = 1 AND deleted = 0",
        {"group_id": group_id, "member_key": member_key},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {"member_key": row[0], "role": row[1], "joined_at": str(row[2])}


def is_group_member(group_id: str, member_key: str) -> bool:
    """Check if a user is an active member of a group."""
    return get_group_member(group_id, member_key) is not None


def get_group_member_keys(group_id: str) -> list[str]:
    """All active member keys of a group (deduplicated, no limit).

    Used by the discover-group backfill to know who is already enrolled —
    one query instead of one membership check per user.
    """
    result = client.query(
        "SELECT member_key FROM (SELECT member_key, deleted, "
        "row_number() OVER (PARTITION BY member_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_members WHERE group_id = %(group_id)s) "
        "WHERE rn = 1 AND deleted = 0",
        {"group_id": group_id},
    )
    return [row[0] for row in result.result_rows]


def _get_group_member_counts(group_ids: list[str]) -> dict[str, int]:
    """Get deduplicated active member counts for a batch of groups.

    Returns {group_id: member_count}.  Uses a single query so the
    window function lives at the top level (ClickHouse cannot decorrelate
    window functions inside correlated scalar sub-queries).
    """
    if not group_ids:
        return {}
    result = client.query(
        "SELECT group_id, count() AS cnt "
        "FROM (SELECT group_id, member_key, deleted "
        "FROM group_members WHERE group_id IN %(group_ids)s "
        "QUALIFY row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC, deleted DESC) = 1) "
        "WHERE deleted = 0 "
        "GROUP BY group_id",
        {"group_ids": group_ids},
    )
    return {row[0]: row[1] for row in result.result_rows}


def get_user_groups(member_key: str) -> list[dict]:
    """Get all groups a user belongs to (deduplicated by latest version).

    Dedup first (latest row wins, tombstones included) then filter deleted=0
    on both sides — a left group's stale active row must not linger here.
    """
    result = client.query(
        "SELECT gc.group_id, gc.join_policy, gm.role AS my_role "
        "FROM (SELECT group_id, member_key, role, deleted, "
        "row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_members) gm "
        "JOIN (SELECT group_id, join_policy, deleted, "
        "row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_contracts) gc "
        "ON gm.group_id = gc.group_id "
        "WHERE gm.rn = 1 AND gc.rn = 1 AND gm.deleted = 0 AND gc.deleted = 0 AND gm.member_key = %(member_key)s",
        {"member_key": member_key},
    )
    # Collect group ids for member-count lookup
    group_ids = [row[0] for row in result.result_rows]
    counts = _get_group_member_counts(group_ids)

    seen = set()
    out = []
    for row in result.result_rows:
        if row[0] not in seen:
            seen.add(row[0])
            out.append(
                {
                    "group_id": row[0],
                    "join_policy": row[1],
                    "my_role": row[2],
                    "member_count": counts.get(row[0], 0),
                }
            )
    return out


# ---------------------------------------------------------------------------
# Group Join Requests
# ---------------------------------------------------------------------------


def create_join_request(group_id: str, requester_key: str, status: str = "pending", role: str = "") -> dict:
    """Create a join request."""
    now = _now()
    # Explicit column list (robust to table column order) + a zero-datetime
    # sentinel for resolved_at (the column is non-Nullable; "not resolved yet").
    client.insert(
        "group_join_requests",
        [[group_id, requester_key, status, role, now, datetime(1970, 1, 1), now, 0]],
        column_names=[
            "group_id",
            "requester_key",
            "status",
            "role",
            "requested_at",
            "resolved_at",
            "updated_at",
            "deleted",
        ],
    )
    return {
        "group_id": group_id,
        "requester_key": requester_key,
        "status": status,
        "role": role,
        "requested_at": now.isoformat(),
    }


def resolve_join_request(group_id: str, requester_key: str, status: str):
    """Update a join request status (approved/denied).

    now64(6) (microsecond) — not now() (second) — so the resolved row's
    updated_at is never earlier than the pending row it supersedes; the reader
    dedups by updated_at, so a second-precision timestamp can lose the tie.
    """
    client.command(
        "INSERT INTO group_join_requests (group_id, requester_key, status, role, requested_at, resolved_at, updated_at, deleted) "
        "SELECT group_id, requester_key, %(status)s, role, requested_at, now64(6), now64(6), 0 "
        "FROM group_join_requests WHERE group_id = %(group_id)s AND requester_key = %(requester_key)s AND deleted = 0",
        {"group_id": group_id, "requester_key": requester_key, "status": status},
    )


def get_pending_requests(group_id: str) -> list[dict]:
    """Get pending join requests for a group.

    Dedup first (latest request per requester wins) then filter to
    pending/invited — a resolved request (approved/denied is a new row) must
    not leave its old pending row showing.
    """
    result = client.query(
        "SELECT requester_key, status, role, requested_at "
        "FROM (SELECT requester_key, status, role, requested_at, deleted, "
        "row_number() OVER (PARTITION BY requester_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_join_requests WHERE group_id = %(group_id)s) "
        "WHERE rn = 1 AND status IN ('pending', 'invited') AND deleted = 0",
        {"group_id": group_id},
    )
    return [
        {"requester_key": row[0], "status": row[1], "role": row[2], "requested_at": str(row[3])}
        for row in result.result_rows
    ]


def has_pending_or_invited_request(group_id: str, requester_key: str) -> bool:
    """Check if a user has a pending or invited join request for a group.

    Dedup first (latest request wins) then filter — a resolved request must
    not still count as pending.
    """
    result = client.query(
        "SELECT count() FROM (SELECT 1 FROM (SELECT status, deleted, "
        "row_number() OVER (PARTITION BY requester_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_join_requests "
        "WHERE group_id = %(group_id)s AND requester_key = %(requester_key)s) "
        "WHERE rn = 1 AND status IN ('pending', 'invited') AND deleted = 0)",
        {"group_id": group_id, "requester_key": requester_key},
    )
    return result.result_rows[0][0] > 0


# ---------------------------------------------------------------------------
# Group Hidden Docs (moderation)
# ---------------------------------------------------------------------------


def hide_doc_from_group(group_id: str, doc_id: str, moderator_key: str):
    """Hide a document from a group's discover."""
    now = _now()
    client.insert(
        "group_hidden_docs",
        [[group_id, doc_id, moderator_key, now, now, 0]],
    )


def unhide_doc_from_group(group_id: str, doc_id: str):
    """Unhide a document from a group's discover.

    now64(6) (microsecond) — not now() (second) — so the tombstone's
    updated_at is never earlier than the active hide row it supersedes when
    both land in the same second; the reader's dedup keys off updated_at, so
    a second-precision tombstone would rank earlier and the restore would be
    invisible until a background merge (same house pattern as the unblock
    tombstones).
    """
    client.command(
        "INSERT INTO group_hidden_docs (group_id, doc_id, moderator_key, hidden_at, updated_at, deleted) "
        "SELECT group_id, doc_id, moderator_key, hidden_at, now64(6), 1 "
        "FROM group_hidden_docs WHERE group_id = %(group_id)s AND doc_id = %(doc_id)s AND deleted = 0",
        {"group_id": group_id, "doc_id": doc_id},
    )


def get_hidden_docs(group_id: str) -> list[dict]:
    """List documents hidden from a group (the moderation takedown list).

    Joins the documents table to surface author + body for the admin's
    restore list. Dedup first (latest row per doc, tombstones included) then
    filter deleted=0 — a restored doc's stale hidden row must not linger.
    """
    result = client.query(
        "SELECT hd.doc_id, hd.moderator_key, hd.hidden_at, d.author_key, d.body "
        "FROM (SELECT doc_id, moderator_key, hidden_at, deleted, "
        "row_number() OVER (PARTITION BY doc_id ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_hidden_docs WHERE group_id = %(group_id)s) hd "
        "LEFT JOIN (SELECT doc_id, author_key, body FROM (SELECT doc_id, author_key, body, deleted, "
        "row_number() OVER (PARTITION BY doc_id ORDER BY updated_at DESC) as rn "
        "FROM documents) WHERE rn = 1 AND deleted = 0) d ON d.doc_id = hd.doc_id "
        "WHERE hd.rn = 1 AND hd.deleted = 0 "
        "ORDER BY hd.hidden_at DESC",
        {"group_id": group_id},
    )
    return [
        {
            "doc_id": row[0],
            "moderator_key": row[1],
            "hidden_at": str(row[2]),
            "author_key": row[3] or "",
            "body": _parse_json(row[4]) if row[4] else {},
        }
        for row in result.result_rows
    ]


# ---------------------------------------------------------------------------
# App Contracts (per-app with per-service permissions)
# ---------------------------------------------------------------------------


def add_app_contract(user_key: str, allowed_origin: str, permissions: dict) -> dict:
    """Add an app contract (one row per app, permissions is JSON). Upserts if exists."""
    now = _now()
    client.insert(
        "app_contracts",
        [[user_key, allowed_origin, json.dumps(permissions), now, now, 0]],
    )
    return {
        "user_key": user_key,
        "allowed_origin": allowed_origin,
        "permissions": permissions,
        "created_at": now.isoformat(),
    }


def get_app_contracts(user_key: str) -> list[dict]:
    """Get active app contracts for a user."""
    result = client.query(
        "SELECT allowed_origin, permissions FROM (SELECT allowed_origin, permissions, deleted, "
        "row_number() OVER (PARTITION BY allowed_origin ORDER BY updated_at DESC) as rn "
        "FROM app_contracts WHERE user_key = %(user_key)s) WHERE rn = 1 AND deleted = 0",
        {"user_key": user_key},
    )
    return [
        {
            "allowed_origin": row[0],
            "permissions": json.loads(row[1]) if row[1] else {},
        }
        for row in result.result_rows
    ]


def is_origin_allowed(user_key: str, allowed_origin: str) -> bool:
    """Check if an origin has an active contract for a user."""
    result = client.query(
        "SELECT count() FROM (SELECT deleted FROM app_contracts "
        "WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s "
        "ORDER BY updated_at DESC LIMIT 1) WHERE deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )
    return result.result_rows[0][0] > 0


def get_app_permissions(user_key: str, allowed_origin: str) -> dict:
    """Get the permissions dict for a user+origin contract. Returns {} if no contract."""
    result = client.query(
        "SELECT permissions FROM (SELECT permissions, deleted FROM app_contracts "
        "WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s "
        "ORDER BY updated_at DESC LIMIT 1) WHERE deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )
    rows = result.result_rows
    if not rows:
        return {}
    return json.loads(rows[0][0]) if rows[0][0] else {}


def has_permission(user_key: str, allowed_origin: str, service_name: str, operation: str) -> bool:
    """Check if an origin has permission for a specific service+operation."""
    perms = get_app_permissions(user_key, allowed_origin)
    if not perms:
        return False
    service_perms = perms.get(service_name, [])
    return operation in service_perms


def revoke_app_contract(user_key: str, allowed_origin: str):
    """Tombstone one app contract (one row = one app)."""
    client.command(
        "INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted) "
        "SELECT user_key, allowed_origin, permissions, created_at, now64(6), 1 "
        "FROM app_contracts WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )


def revoke_all_app_contracts(user_key: str):
    """Tombstone all app contracts for a user."""
    client.command(
        "INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted) "
        "SELECT user_key, allowed_origin, permissions, created_at, now64(6), 1 "
        "FROM app_contracts WHERE user_key = %(user_key)s AND deleted = 0",
        {"user_key": user_key},
    )


def cleanup_stale_app_contracts(user_key: str) -> int:
    """Tombstone app contracts where allowed_origin is not a URL (stale service-name entries).

    Legitimate contracts always have allowed_origin starting with http:// or https://.
    Returns the number of contracts tombstoned.
    """
    result = client.command(
        "INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted) "
        "SELECT user_key, allowed_origin, permissions, created_at, now64(6), 1 "
        "FROM app_contracts "
        "WHERE user_key = %(user_key)s AND deleted = 0 "
        "AND allowed_origin NOT LIKE 'http://%%' AND allowed_origin NOT LIKE 'https://%%'",
        {"user_key": user_key},
    )
    return result.written_rows if hasattr(result, "written_rows") else 0


# ---------------------------------------------------------------------------
# Blacklists
# ---------------------------------------------------------------------------


def block_user(user_key: str, blocked_key: str):
    """Block a user (user-wide blacklist)."""
    now = _now()
    client.insert("user_blacklist", [[user_key, blocked_key, now, now, 0]])


def unblock_user(user_key: str, blocked_key: str):
    """Remove a user block (tombstone via INSERT SELECT).

    now64(6) (microsecond) — not now() (second) — so the tombstone's
    updated_at is never earlier than the active row it supersedes when both
    land in the same second; the reader's row_number() keys off updated_at.
    """
    client.command(
        "INSERT INTO user_blacklist (user_key, blocked_key, created_at, updated_at, deleted) "
        "SELECT user_key, blocked_key, created_at, now64(6), 1 "
        "FROM user_blacklist WHERE user_key = %(user_key)s AND blocked_key = %(blocked_key)s AND deleted = 0",
        {"user_key": user_key, "blocked_key": blocked_key},
    )


def is_user_blocked(user_key: str, blocked_key: str) -> bool:
    """Check if a user has blocked another user."""
    result = client.query(
        "SELECT count() FROM (SELECT 1 FROM user_blacklist WHERE user_key = %(user_key)s AND blocked_key = %(blocked_key)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1)",
        {"user_key": user_key, "blocked_key": blocked_key},
    )
    return result.result_rows[0][0] > 0


def block_user_in_group(user_key: str, group_id: str, blocked_key: str):
    """Block a user from seeing content in a specific group."""
    now = _now()
    client.insert("group_blacklist", [[user_key, group_id, blocked_key, now, now, 0]])


def unblock_user_in_group(user_key: str, group_id: str, blocked_key: str):
    """Remove a per-group block (tombstone via INSERT SELECT).

    now64(6) (microsecond) — not now() (second) — so the tombstone's
    updated_at is never earlier than the active row it supersedes when both
    land in the same second; the reader's row_number() keys off updated_at.
    """
    client.command(
        "INSERT INTO group_blacklist (user_key, group_id, blocked_key, created_at, updated_at, deleted) "
        "SELECT user_key, group_id, blocked_key, created_at, now64(6), 1 "
        "FROM group_blacklist WHERE user_key = %(user_key)s AND group_id = %(group_id)s AND blocked_key = %(blocked_key)s AND deleted = 0",
        {"user_key": user_key, "group_id": group_id, "blocked_key": blocked_key},
    )


# ---------------------------------------------------------------------------
# User Group Sharing
# ---------------------------------------------------------------------------


def set_user_group_sharing(user_key: str, group_id: str, enabled: bool):
    """Set sharing toggle for a user in a group."""
    now = _now()
    client.insert(
        "user_group_sharing",
        [[user_key, group_id, 1 if enabled else 0, now, now, 0]],
    )


def is_sharing_enabled(user_key: str, group_id: str) -> bool:
    """Check if sharing is enabled for a user in a group. Default: True (opt-out model)."""
    result = client.query(
        "SELECT sharing_enabled FROM user_group_sharing "
        "WHERE user_key = %(user_key)s AND group_id = %(group_id)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"user_key": user_key, "group_id": group_id},
    )
    if not result.result_rows:
        return True  # Default on (opt-out model)
    return result.result_rows[0][0] == 1


# ---------------------------------------------------------------------------
# Cross-group document reads (the core v3 query)
# ---------------------------------------------------------------------------


def read_documents_in_groups(
    group_ids: list[str],
    member_key: str,
    service: str,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Read documents attached to groups where the user is a member.

    This is the core v3 discover query: documents JOIN doc_groups JOIN group_members,
    filtered by membership, tombstones, blacklists, and hidden docs.

    Blocking/sharing enforcement (KB: security/overview.md "Blocking and
    Sharing", social/cross-app-sharing.md):
    - user_blacklist — the author blocked the reader: the author's content
      is hidden from the reader, everywhere.
    - group_blacklist — the author blocked the reader in THIS group: the
      author's content in this group is hidden from the reader; the reader
      still sees everyone else's content, and the author still sees the
      reader's content (the block is one-directional).
    - user_group_sharing — the author paused sharing in THIS group: same
      shape as a per-group block, but the author's own reads are exempt
      (the author keeps seeing their own posts — "pause sharing without
      leaving").

    All three tables are ReplacingMergeTree: block/unblock/toggle append a
    new version and the old row survives until a background merge. The
    anti-joins therefore dedup first (latest row per key, tombstones
    included) and then filter deleted = 0 — a raw `deleted = 0` join would
    keep matching the stale pre-unblock row and the unblock would not take
    effect until a merge happened (nondeterministic).
    """
    if not group_ids:
        return []

    result = client.query(
        "SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value "
        "FROM (SELECT doc_id, author_key, body, tags, created_at, ref_value, deleted "
        "FROM (SELECT *, row_number() OVER (PARTITION BY doc_id, author_key ORDER BY updated_at DESC) AS rn "
        "FROM documents WHERE collection_name = %(coll)s) "
        "WHERE rn = 1 AND deleted = 0) p "
        "JOIN (SELECT doc_id, group_id FROM doc_groups WHERE deleted = 0 "
        "QUALIFY row_number() OVER (PARTITION BY doc_id, group_id ORDER BY updated_at DESC) = 1) pg "
        "ON p.doc_id = pg.doc_id "
        "JOIN (SELECT group_id, member_key, role FROM (SELECT group_id, member_key, role, deleted, "
        "row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC) as rn "
        "FROM group_members) WHERE rn = 1 AND deleted = 0) gm ON pg.group_id = gm.group_id "
        "LEFT ANTI JOIN (SELECT user_key, blocked_key FROM (SELECT user_key, blocked_key, deleted, "
        "row_number() OVER (PARTITION BY user_key, blocked_key ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM user_blacklist) WHERE rn = 1 AND deleted = 0) ub "
        "ON ub.user_key = p.author_key AND ub.blocked_key = %(member_key)s "
        "LEFT ANTI JOIN (SELECT user_key, group_id, blocked_key FROM (SELECT user_key, group_id, blocked_key, deleted, "
        "row_number() OVER (PARTITION BY user_key, group_id, blocked_key ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM group_blacklist) WHERE rn = 1 AND deleted = 0) gb "
        "ON gb.user_key = p.author_key AND gb.group_id = pg.group_id AND gb.blocked_key = %(member_key)s "
        "LEFT ANTI JOIN (SELECT user_key, group_id, sharing_enabled FROM (SELECT user_key, group_id, sharing_enabled, deleted, "
        "row_number() OVER (PARTITION BY user_key, group_id ORDER BY updated_at DESC) AS rn "
        "FROM user_group_sharing) WHERE rn = 1 AND deleted = 0) ugs "
        "ON ugs.user_key = p.author_key AND ugs.group_id = pg.group_id AND ugs.sharing_enabled = 0 "
        "AND p.author_key != %(member_key)s "
        "LEFT ANTI JOIN (SELECT group_id, doc_id FROM (SELECT group_id, doc_id, deleted, "
        "row_number() OVER (PARTITION BY group_id, doc_id ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM group_hidden_docs) WHERE rn = 1 AND deleted = 0) hd "
        "ON hd.doc_id = p.doc_id AND hd.group_id = pg.group_id "
        "WHERE gm.member_key = %(member_key)s "
        "AND pg.group_id IN (%(g0)s" + "".join(f", %(g{i})s" for i in range(1, len(group_ids))) + ") "
        "ORDER BY p.created_at DESC "
        "LIMIT %(limit)s OFFSET %(offset)s",
        {
            "member_key": member_key,
            "coll": service,
            "limit": limit,
            "offset": offset,
            **{f"g{i}": gid for i, gid in enumerate(group_ids)},
        },
    )

    return [
        {
            "doc_id": row[0],
            "author_key": row[1],
            "body": _parse_json(row[2]),
            "tags": list(row[3]),
            "created_at": str(row[4]),
            "ref_value": row[5],
            "service": service,
        }
        for row in result.result_rows
    ]


# ---------------------------------------------------------------------------
# Ref counts (engagement)
# ---------------------------------------------------------------------------


def get_ref_count(doc_id: str, service: str = "reactions") -> int:
    """Count documents referencing a given doc_id."""
    result = client.query(
        "SELECT count() FROM (SELECT 1 FROM documents WHERE deleted = 0 AND collection_name = %(coll)s AND ref_value = %(doc_id)s "
        "ORDER BY updated_at DESC LIMIT 1)",
        {"coll": service, "doc_id": doc_id},
    )
    return result.result_rows[0][0]


def get_ref_counts(doc_ids: list[str], service: str = "reactions") -> dict[str, int]:
    """Count references for multiple documents."""
    if not doc_ids:
        return {}
    placeholders = ", ".join(f"%(d{i})s" for i in range(len(doc_ids)))
    params = {"coll": service, **{f"d{i}": did for i, did in enumerate(doc_ids)}}
    result = client.query(
        f"SELECT ref_value, count() FROM (SELECT ref_value FROM documents WHERE deleted = 0 AND collection_name = %(coll)s AND ref_value IN ({placeholders}) "
        "QUALIFY row_number() OVER (PARTITION BY doc_id, author_key ORDER BY updated_at DESC) = 1) GROUP BY ref_value",
        params,
    )
    return {row[0]: row[1] for row in result.result_rows}


# ---------------------------------------------------------------------------
# Read by doc_id with group permission check
# ---------------------------------------------------------------------------


def read_document_by_id(doc_id: str, member_key: str, service: str) -> dict | None:
    """Read a single document by doc_id with group permission check.

    The user_blacklist anti-join dedups first (latest row per key,
    tombstones included) then filters deleted = 0 — same reason as
    read_documents_in_groups: a raw `deleted = 0` join keeps matching the
    stale pre-unblock row until a background merge.
    """
    result = client.query(
        "SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value "
        "FROM documents p "
        "LEFT SEMI JOIN ( "
        "SELECT pg.doc_id FROM doc_groups pg "
        "JOIN group_members gm ON pg.group_id = gm.group_id "
        "WHERE gm.member_key = %(member_key)s AND pg.deleted = 0 AND gm.deleted = 0 "
        ") membership ON membership.doc_id = p.doc_id "
        "LEFT ANTI JOIN (SELECT user_key, blocked_key FROM (SELECT user_key, blocked_key, deleted, "
        "row_number() OVER (PARTITION BY user_key, blocked_key ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM user_blacklist) WHERE rn = 1 AND deleted = 0) ub "
        "ON ub.user_key = p.author_key AND ub.blocked_key = %(member_key)s "
        "WHERE p.doc_id = %(doc_id)s "
        "AND p.deleted = 0 "
        "AND p.collection_name = %(coll)s "
        "ORDER BY p.updated_at DESC LIMIT 1",
        {"doc_id": doc_id, "coll": service, "member_key": member_key},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "doc_id": row[0],
        "author_key": row[1],
        "body": _parse_json(row[2]),
        "tags": list(row[3]),
        "created_at": str(row[4]),
        "ref_value": row[5],
        "service": service,
    }


# ---------------------------------------------------------------------------
# Groups: manages
# ---------------------------------------------------------------------------


def get_groups_manages(member_key: str) -> list[dict]:
    """Get groups where the user has management permissions.

    Fetches all groups the user belongs to, then filters in Python by
    checking if the group's roles JSON grants manageRoles to the user's role.
    Deduplicates group_members and group_contracts by latest version.
    """
    result = client.query(
        "SELECT gc.group_id, gc.join_policy, gc.roles, gm.role AS my_role "
        "FROM (SELECT group_id, member_key, role, deleted, "
        "row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_members) gm "
        "JOIN (SELECT group_id, join_policy, roles, deleted, "
        "row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM group_contracts) gc "
        "ON gm.group_id = gc.group_id "
        "WHERE gm.rn = 1 AND gc.rn = 1 AND gm.deleted = 0 AND gc.deleted = 0 AND gm.member_key = %(member_key)s",
        {"member_key": member_key},
    )
    # Collect group ids for member-count lookup
    group_ids = [row[0] for row in result.result_rows]
    counts = _get_group_member_counts(group_ids)

    out = []
    seen = set()
    for row in result.result_rows:
        group_id, join_policy, roles_json, my_role = row
        if group_id in seen:
            continue
        seen.add(group_id)
        # Check if the user's role has manageRoles permission
        # roles_json is a list of {name, services, permissions} — find matching role
        roles_list = _parse_json(roles_json) if roles_json else []
        if isinstance(roles_list, list):
            role_def = next((r for r in roles_list if r.get("name") == my_role), {})
        else:
            role_def = roles_list.get(my_role, {})
        if isinstance(role_def, dict) and "manageRoles" in role_def.get("permissions", []):
            out.append(
                {
                    "group_id": group_id,
                    "join_policy": join_policy,
                    "roles": roles_list,
                    "my_role": my_role,
                    "member_count": counts.get(group_id, 0),
                }
            )
    return out


# ---------------------------------------------------------------------------
# Group members list (the getMembers call)
# ---------------------------------------------------------------------------


# (get_group_members already exists above — used by getMembers)


# ---------------------------------------------------------------------------
# Block in group
# ---------------------------------------------------------------------------


# (block_user_in_group and unblock_user_in_group already exist above)


# ---------------------------------------------------------------------------
# Provider service contracts
# ---------------------------------------------------------------------------


def add_provider_service_contract(provider_key: str, allowed_origin: str) -> dict:
    """Add a provider-level service contract (node trust)."""
    now = _now()
    client.insert(
        "provider_service_contracts",
        [[provider_key, allowed_origin, now, now, 0]],
    )
    return {
        "provider_key": provider_key,
        "allowed_origin": allowed_origin,
        "created_at": now.isoformat(),
    }


def get_provider_service_contracts(provider_key: str) -> list[dict]:
    """Get active provider service contracts."""
    result = client.query(
        "SELECT allowed_origin FROM (SELECT allowed_origin, deleted, "
        "row_number() OVER (PARTITION BY allowed_origin ORDER BY updated_at DESC) as rn "
        "FROM provider_service_contracts WHERE provider_key = %(provider_key)s) WHERE rn = 1 AND deleted = 0",
        {"provider_key": provider_key},
    )
    return [{"allowed_origin": row[0]} for row in result.result_rows]


def is_provider_origin_allowed(provider_key: str, allowed_origin: str) -> bool:
    """Check if an origin is allowed at the provider level."""
    result = client.query(
        "SELECT count() FROM (SELECT deleted FROM provider_service_contracts "
        "WHERE provider_key = %(provider_key)s AND allowed_origin = %(allowed_origin)s "
        "ORDER BY updated_at DESC LIMIT 1) WHERE deleted = 0",
        {"provider_key": provider_key, "allowed_origin": allowed_origin},
    )
    return result.result_rows[0][0] > 0


def revoke_provider_service_contract(provider_key: str, allowed_origin: str):
    """Tombstone a provider service contract."""
    client.command(
        "INSERT INTO provider_service_contracts (provider_key, allowed_origin, created_at, updated_at, deleted) "
        "SELECT provider_key, allowed_origin, created_at, now64(6), 1 "
        "FROM provider_service_contracts "
        "WHERE provider_key = %(provider_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"provider_key": provider_key, "allowed_origin": allowed_origin},
    )


# ---------------------------------------------------------------------------
# Media (v3 — inline resolution, no separate list)
# ---------------------------------------------------------------------------


def resolve_media_urls(doc_body: dict, user_key: str) -> dict:
    """Resolve media references in a document body to presigned URLs.

    Looks for media_refs array in the body, batches all refs into a single
    query across media_metadata and public_media collections, and returns
    the body with read_urls injected.
    """
    media_refs = doc_body.get("media_refs") or []
    if not media_refs:
        return doc_body

    ref_strs = [str(m) for m in media_refs]
    placeholders = ", ".join(f"%(r{i})s" for i in range(len(ref_strs)))
    params = {"author_key": user_key, **{f"r{i}": rs for i, rs in enumerate(ref_strs)}}

    result = client.query(
        f"SELECT doc_id, body, collection_name FROM documents "
        f"WHERE doc_id IN ({placeholders}) AND author_key = %(author_key)s "
        f"AND collection_name IN ('media_metadata', 'public_media') AND deleted = 0",
        params,
    )

    # Build lookup: object_key -> metadata
    meta_map = {}
    for row in result.result_rows:
        meta_map[row[0]] = _parse_json(row[1])

    resolved = []
    for mref in media_refs:
        mref_str = str(mref)
        meta = meta_map.get(mref_str, {})
        resolved.append(
            {
                "object_key": mref_str,
                "mime_type": meta.get("mime_type"),
                "filename": meta.get("filename"),
                "size_bytes": meta.get("size_bytes"),
                "read_url": meta.get("url"),
            }
        )

    if resolved:
        resolved_body = dict(doc_body)
        resolved_body["media_refs"] = resolved
        return resolved_body
    return doc_body


def _collect_minio_keys(obj, keys: list):
    """Collect object keys from every {type: 'minio', value} leaf value (recursive)."""
    if isinstance(obj, dict):
        if obj.get("type") == "minio" and obj.get("value"):
            keys.append(str(obj["value"]))
        else:
            for v in obj.values():
                _collect_minio_keys(v, keys)
    elif isinstance(obj, list):
        for item in obj:
            _collect_minio_keys(item, keys)


def _resolve_minio_types(obj, signing_client):
    """Add a fresh presigned `url` to every {type: 'minio', value} leaf value.

    Returns a new structure (does not mutate the input). The `value` (object
    key) is kept; a time-limited presigned `url` is added alongside it, per the
    document-typing KB: the API converts a minio type to a presigned URL on read.
    """
    if isinstance(obj, dict):
        if obj.get("type") == "minio" and obj.get("value"):
            object_key = str(obj["value"])
            presigned = signing_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET, "Key": object_key},
                ExpiresIn=settings.READ_URL_EXPIRY,
            )
            return {**obj, "url": presigned}
        return {k: _resolve_minio_types(v, signing_client) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_minio_types(item, signing_client) for item in obj]
    return obj


def resolve_minio_types(doc_body: dict) -> dict:
    """Resolve minio types in a document body to fresh presigned URLs.

    A body with no minio types is returned unchanged (and no S3 client is
    created). Presigned-URL generation is offline (no network call), so this is
    cheap to run on every read.
    """
    keys: list = []
    _collect_minio_keys(doc_body, keys)
    if not keys:
        return doc_body
    return _resolve_minio_types(doc_body, get_s3_signing_client())


def resolve_media_urls_in_docs(docs: list[dict]) -> list[dict]:
    """Resolve media URLs in a list of documents.

    Two mechanisms, both applied on read:
    1. media_refs — an array of media_metadata doc_ids, resolved to
       {object_key, mime_type, filename, size_bytes, read_url}.
    2. minio types — {type: 'minio', value: object_key} leaf values anywhere in
       the body, each converted to a fresh presigned `url` (the KB's document
       typing: the API turns a minio type into a presigned URL on read).
    """
    resolved = []
    for doc in docs:
        body = doc.get("body", {})
        if body.get("media_refs"):
            author = doc.get("author_key", "")
            body = resolve_media_urls(body, author)
        body = resolve_minio_types(body)
        doc_with_media = dict(doc)
        doc_with_media["body"] = body
        resolved.append(doc_with_media)
    return resolved


# ---------------------------------------------------------------------------
# User stats (v3 equivalent of /stats)
# ---------------------------------------------------------------------------

# Object-store (MinIO/S3) media size — v3-native. The v2 implementation
# scanned MongoDB metadata (body.size_bytes) for this number, but v3 has no
# Mongo: media documents carry only {type:'minio', value: key} references,
# so the object store IS the source of truth for blob bytes. A bucket scan
# is a real cost, so it's cached with a short TTL — /stats is polled by the
# marketing site, and the number only needs to be roughly right.
_S3_SIZE_CACHE: int = 0
_S3_SIZE_CACHE_TIME: float = 0.0
_S3_SIZE_TTL = 60  # seconds — don't re-scan the bucket on every /stats


def total_s3_size() -> int:
    """Sum of object sizes in the media bucket (MinIO/S3)."""
    global _S3_SIZE_CACHE, _S3_SIZE_CACHE_TIME
    now = time.time()
    if now - _S3_SIZE_CACHE_TIME < _S3_SIZE_TTL:
        return _S3_SIZE_CACHE
    total = 0
    s3 = get_s3_client()
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.S3_BUCKET):
        for obj in page.get("Contents", []):
            total += int(obj.get("Size", 0))
    _S3_SIZE_CACHE = total
    _S3_SIZE_CACHE_TIME = now
    return total


def get_app_metrics(app_urls: list[str]) -> dict:
    """Realtime store metrics per app (D49): `visits` (count of the windowed,
    anon-free rows) + `users_1d/30d/90d/1y` (distinct real users in the
    trailing window). Apps with no rows are absent — the caller merges zeros.
    countDistinct* is exact (not the approximate uniq()), so the numbers a
    visitor sees are trustworthy."""
    if not app_urls:
        return {}
    placeholders = ", ".join(f"%(u{i})s" for i in range(len(app_urls)))
    params = {f"u{i}": u for i, u in enumerate(app_urls)}
    result = client.query(
        f"SELECT app_url, count() AS visits, "
        f"countDistinctIf(username, seen_at > now() - INTERVAL 1 DAY) AS users_1d, "
        f"countDistinctIf(username, seen_at > now() - INTERVAL 30 DAY) AS users_30d, "
        f"countDistinctIf(username, seen_at > now() - INTERVAL 90 DAY) AS users_90d, "
        f"countDistinctIf(username, seen_at > now() - INTERVAL 365 DAY) AS users_1y "
        f"FROM app_visits WHERE app_url IN ({placeholders}) GROUP BY app_url",
        params,
    )
    return {
        row[0]: {
            "visits": int(row[1]),
            "users_1d": int(row[2]),
            "users_30d": int(row[3]),
            "users_90d": int(row[4]),
            "users_1y": int(row[5]),
        }
        for row in result.result_rows
    }


def get_node_active_users() -> dict:
    """Node-wide active users across all apps (D49 `/stats` macro): the same
    active-user set as the store, minus the per-app grouping. The homepage
    leads with users_30d."""
    result = client.query(
        "SELECT "
        "countDistinctIf(username, seen_at > now() - INTERVAL 1 DAY) AS users_1d, "
        "countDistinctIf(username, seen_at > now() - INTERVAL 30 DAY) AS users_30d, "
        "countDistinctIf(username, seen_at > now() - INTERVAL 90 DAY) AS users_90d, "
        "countDistinctIf(username, seen_at > now() - INTERVAL 365 DAY) AS users_1y "
        "FROM app_visits"
    )
    row = result.result_rows[0] if result.result_rows else (0, 0, 0, 0)
    return {"users_1d": int(row[0]), "users_30d": int(row[1]), "users_90d": int(row[2]), "users_1y": int(row[3])}


def list_store_apps(limit: int = 20, offset: int = 0) -> dict:
    """The public store list (D49): approved apps with realtime metrics,
    sorted by users_30d desc (visits tiebreak), paginated. Returns
    {apps: [...], total: N}."""
    apps = list_apps(approved_only=True)
    metrics = get_app_metrics([a["url"] for a in apps])
    zero = {"visits": 0, "users_1d": 0, "users_30d": 0, "users_90d": 0, "users_1y": 0}
    enriched = []
    for a in apps:
        m = metrics.get(a["url"], zero)
        enriched.append({**a, **m})
    enriched.sort(key=lambda a: (a["users_30d"], a["visits"]), reverse=True)
    total = len(enriched)
    return {"apps": enriched[offset : offset + limit], "total": total}


def get_node_stats() -> dict:
    """Node-level stats (D49): user/doc/group counts, storage, the approved-
    app count, and the node-wide active-user set (the store's metric, macro).
    The per-app array moved to list_store_apps (paginated)."""
    user_result = client.query("SELECT count(DISTINCT author_key) FROM documents WHERE deleted = 0")
    user_count = user_result.result_rows[0][0] if user_result.result_rows else 0
    doc_result = client.query("SELECT count() FROM documents WHERE deleted = 0")
    doc_count = doc_result.result_rows[0][0] if doc_result.result_rows else 0
    group_result = client.query("SELECT count() FROM group_contracts WHERE deleted = 0")
    group_count = group_result.result_rows[0][0] if group_result.result_rows else 0
    app_count_result = client.query("SELECT count(DISTINCT url) FROM apps WHERE deleted = 0 AND approved = 1")
    app_count = app_count_result.result_rows[0][0] if app_count_result.result_rows else 0

    # Storage — ClickHouse on-disk bytes + S3 media blob bytes
    try:
        storage_result = client.query("SELECT sum(bytes_on_disk) FROM system.parts WHERE active = 1")
        storage = (
            int(storage_result.result_rows[0][0])
            if storage_result.result_rows and storage_result.result_rows[0][0] is not None
            else 0
        )
    except Exception:
        storage = 0
    try:
        storage += total_s3_size()
    except Exception:
        pass  # S3 unavailable — keep ClickHouse bytes

    return {
        "users": user_count,
        "documents": doc_count,
        "groups": group_count,
        "app_count": app_count,
        "active_users": get_node_active_users(),
        "storage": storage,
    }


def node_has_users() -> bool:
    """True if the ClickHouse users table has any non-deleted records."""
    result = client.query("SELECT count() FROM users WHERE deleted = 0")
    return bool(result.result_rows[0][0] > 0)


# ---------------------------------------------------------------------------
# Node config (v3 has no Mongo — the v2 web10.config collection, moved here)
# ---------------------------------------------------------------------------


def get_node_config() -> dict:
    """The node config document (config_id='node'), or {} if unset.

    Dedup-then-filter: saves append a new row, so the latest row per
    config_id wins (tombstones included in the dedup, then deleted = 0).
    """
    result = client.query(
        "SELECT body FROM (SELECT body, config_id, deleted, "
        "row_number() OVER (PARTITION BY config_id ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM node_config) WHERE rn = 1 AND deleted = 0 AND config_id = 'node'",
    )
    if not result.result_rows:
        return {}
    return _parse_json(result.result_rows[0][0])


def save_node_config(body: dict) -> dict:
    """Append a new version of the node config (latest row wins on read)."""
    client.insert(
        "node_config",
        [["node", _json(body), _now(), 0]],
        column_names=["config_id", "body", "updated_at", "deleted"],
    )
    return body


def save_jwt_key(key_data: dict) -> dict:
    """Persist a JWT signing key record under config_id='jwt:<kid>'."""
    client.insert(
        "node_config",
        [[f"jwt:{key_data['kid']}", _json(key_data), _now(), 0]],
        column_names=["config_id", "body", "updated_at", "deleted"],
    )
    return key_data


def get_latest_jwt_key() -> dict | None:
    """The most recently saved JWT signing key record, or None."""
    result = client.query(
        "SELECT body FROM (SELECT body, deleted, updated_at, "
        "row_number() OVER (PARTITION BY config_id ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM node_config WHERE config_id LIKE 'jwt:%') WHERE rn = 1 AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
    )
    if not result.result_rows:
        return None
    return _parse_json(result.result_rows[0][0])


# ---------------------------------------------------------------------------
# Users (account management)
# ---------------------------------------------------------------------------


def create_user(username: str, password_hash: str, phone: str = "", email: str = "") -> dict:
    """Create a user account and auto-enroll them in the discover group.

    Auto-enrollment (KB: social-contracts.md — "Everyone (auto-join)"): every
    account is a member of the universal public board by default, so their
    posts are discoverable the moment they attach one to the group. The group
    contract is created at boot (ensure_discover_group); the lightweight
    guard here covers the edge where a signup races the boot pass.
    """
    existing = client.query(
        "SELECT count() FROM (SELECT 1 FROM users WHERE username = %(username)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1)",
        {"username": username},
    )
    if existing.result_rows[0][0] > 0:
        return None
    now = _now()
    client.insert(
        "users",
        [[username, password_hash, phone, 0, email, 0, now, now, 0]],
    )
    _ensure_discover_group_contract()
    add_group_member(DISCOVER_GROUP_ID, username, "member")
    return {"username": username, "phone": phone, "email": email}


def list_users() -> list[dict]:
    """All active users (deduplicated to the latest row per username)."""
    result = client.query(
        "SELECT username FROM (SELECT username, deleted, "
        "row_number() OVER (PARTITION BY username ORDER BY updated_at DESC, deleted DESC) as rn "
        "FROM users) WHERE rn = 1 AND deleted = 0",
    )
    return [{"username": row[0]} for row in result.result_rows]


def get_user(username: str) -> dict | None:
    """Get a user record."""
    result = client.query(
        "SELECT username, password_hash, phone, phone_verified, email, email_verified, created_at "
        "FROM users WHERE username = %(username)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"username": username},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "username": row[0],
        "password_hash": row[1],
        "phone": row[2],
        "phone_verified": bool(row[3]),
        "email": row[4],
        "email_verified": bool(row[5]),
        "created_at": str(row[6]),
    }


def authenticate_user(username: str, plain_password: str) -> bool:
    """Check if the provided password matches the stored hash."""
    from app.services.auth import verify_password

    user = get_user(username)
    if not user:
        return False
    return verify_password(plain_password, user["password_hash"])


def change_password(username: str, new_password_hash: str):
    """Change a user's password."""
    client.command(
        "INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted) "
        "SELECT username, %(new_hash)s, phone, phone_verified, email, email_verified, created_at, now(), 0 "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username, "new_hash": new_password_hash},
    )


def change_phone(username: str, phone: str):
    """Change a user's phone number (unverified)."""
    client.command(
        "INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted) "
        "SELECT username, password_hash, %(phone)s, 0, email, email_verified, created_at, now(), 0 "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username, "phone": phone},
    )


def set_email(username: str, email: str):
    """Set a user's email (unverified)."""
    client.command(
        "INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted) "
        "SELECT username, password_hash, phone, phone_verified, %(email)s, 0, created_at, now(), 0 "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username, "email": email},
    )


def verify_phone(username: str):
    """Mark phone as verified."""
    client.command(
        "INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted) "
        "SELECT username, password_hash, phone, 1, email, email_verified, created_at, now(), 0 "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username},
    )


def verify_email(username: str):
    """Mark email as verified."""
    client.command(
        "INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted) "
        "SELECT username, password_hash, phone, phone_verified, email, 1, created_at, now(), 0 "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username},
    )


def get_user_profile(username: str) -> dict | None:
    """Get public profile (no password hash)."""
    user = get_user(username)
    if not user:
        return None
    return {
        "username": user["username"],
        "phone": user["phone"],
        "phone_verified": user["phone_verified"],
        "email": user["email"],
        "email_verified": user["email_verified"],
    }


def get_phone_number(username: str) -> str | None:
    """Get the phone number for a user."""
    user = get_user(username)
    return user["phone"] if user else None


def get_phone_record(phone_number: str) -> dict | None:
    """Find a user by phone number (for recovery)."""
    result = client.query(
        "SELECT username, phone FROM users WHERE phone = %(phone)s AND deleted = 0 ORDER BY updated_at DESC LIMIT 1",
        {"phone": phone_number},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {"username": row[0], "phone": row[1]}


# ---------------------------------------------------------------------------
# Media (upload confirm, list)
# ---------------------------------------------------------------------------


def confirm_media_upload(user_key: str, metadata: dict) -> dict:
    """Confirm a media upload by storing metadata in documents table."""
    now = _now()
    doc_id = _gen_doc_id()
    client.insert(
        "documents",
        [[doc_id, user_key, "media_metadata", _json(metadata), "", [], now, now, 0]],
    )
    return {"doc_id": doc_id, **metadata}


def list_media(user_key: str, limit: int = 50, offset: int = 0) -> list[dict]:
    """List media metadata for a user."""
    result = client.query(
        "SELECT doc_id, body, created_at FROM documents "
        "WHERE author_key = %(user_key)s "
        "AND collection_name IN ('media_metadata', 'public_media') "
        "AND deleted = 0 "
        "ORDER BY created_at DESC "
        "LIMIT %(limit)s OFFSET %(offset)s",
        {"user_key": user_key, "limit": limit, "offset": offset},
    )
    return [
        {
            "doc_id": row[0],
            "metadata": _parse_json(row[1]),
            "created_at": str(row[2]),
        }
        for row in result.result_rows
    ]


def delete_media(user_key: str, doc_id: str):
    """Tombstone a media record."""
    client.command(
        "INSERT INTO documents (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted) "
        "SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, now(), 1 "
        "FROM documents WHERE doc_id = %(doc_id)s AND author_key = %(user_key)s AND deleted = 0",
        {"doc_id": doc_id, "user_key": user_key},
    )


# ---------------------------------------------------------------------------
# App Store
# ---------------------------------------------------------------------------


def _canonical_app_url(url: str) -> str:
    """Canonical app identity (D49 / hardening #4): lowercase host, no
    leading www., exactly one trailing slash, no query/fragment. `app.com`,
    `app.com/`, `WWW.App.com`, `app.com?x=1` all → `https://app.com/`. One
    row per app, not per URL spelling."""
    from urllib.parse import urlparse, urlunparse

    raw = url.strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    p = urlparse(raw)
    scheme = p.scheme.lower()
    host = (p.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    netloc = host
    port = p.port
    if port and not (scheme == "http" and port == 80) and not (scheme == "https" and port == 443):
        netloc = f"{host}:{port}"
    path = p.path or "/"
    # A trailing /index.html is the server's way of serving the directory
    # app — the directory IS the app (D47). Fold it, or a demo loaded via
    # its index.html link forks into a second store entry whose manifest
    # lookup (.../index.html/manifest.json) 404s: icon-less, name-less card.
    # The trailing-slash form (.../index.html/) is handled too — rows
    # registered between hardening #4 and this fix carry it.
    if path.endswith("/index.html/"):
        path = path[: -len("index.html/")]
    elif path.endswith("/index.html"):
        path = path[: -len("index.html")]
    if not path.endswith("/"):
        path += "/"
    return urlunparse((scheme, netloc, path, "", "", ""))


def _verified_username(token: str | None) -> str | None:
    """The real user behind a ping, or None (D49). I2: the signature is
    verified — an unsigned/forged/expired token yields None (anon), never a
    username. Only the node mints these tokens, at login, so an app cannot
    fake another user's visit."""
    if not token:
        return None
    try:
        from app.services.auth import decode_token

        decoded = decode_token(token, private_key=True)
        return decoded.username or None
    except Exception:
        return None


# D49 ingest gate: one counted visit per (app, user) per this window.
_APP_VISIT_WINDOW_SECONDS = 3 * 3600


def _count_app_visit(app_url: str, username: str) -> None:
    """Append an app_visits row if the (app, user) gate allows: no prior row,
    or the latest seen_at is older than the window. Bounded growth — a user
    navigating 100x in an hour produces one row (D49: 'if >3h, insert')."""
    result = client.query(
        "SELECT max(seen_at) FROM app_visits WHERE app_url = %(u)s AND username = %(x)s",
        {"u": app_url, "x": username},
    )
    last = result.result_rows[0][0] if result.result_rows else None
    if last is not None:
        last_dt = last if isinstance(last, datetime) else datetime.fromisoformat(str(last))
        if (datetime.utcnow() - last_dt).total_seconds() < _APP_VISIT_WINDOW_SECONDS:
            return  # within the window — gated out, no row
    client.insert(
        "app_visits",
        [[app_url, username, datetime.utcnow()]],
        column_names=["app_url", "username", "seen_at"],
    )


def register_app(app_info: dict) -> dict:
    """Register an app + record a counted visit (D49).

    Two separate writes with separate growth rules:
    - `apps` — the registration record. Appended on first registration or a
      real metadata change only. NOT per ping (that piled on ClickHouse).
    - `app_visits` — the usage log. One row per (app, real user) per 3h;
      anon pings are dropped at ingest. The store's metrics are realtime
      queries over this table — no maintained counters.
    """
    url = _canonical_app_url(app_info["url"])
    username = _verified_username(app_info.get("token"))

    existing = get_app(url)
    if existing:
        # Append a new apps row ONLY if metadata actually changed. A plain
        # repeat ping (url only — the auto-register shape) is a no-op here.
        name = app_info.get("name", "")
        description = app_info.get("description", "")
        icon_url = app_info.get("icon_url", "")
        metadata_changed = (
            (name and name != existing["name"])
            or (description and description != existing["description"])
            or (icon_url and icon_url != existing["icon_url"])
        )
        if metadata_changed:
            client.command(
                "INSERT INTO apps (url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, updated_at, deleted) "
                "SELECT url, "
                "if(%(name)s != '', %(name)s, name), "
                "if(%(description)s != '', %(description)s, description), "
                "if(%(icon_url)s != '', %(icon_url)s, icon_url), "
                "screenshots, visits, approved, review_state, metadata_version + 1, "
                "created_at, now64(6), 0 "
                "FROM (SELECT url, name, description, icon_url, screenshots, visits, approved, review_state, "
                "metadata_version, created_at, updated_at, deleted, "
                "row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn "
                "FROM apps) WHERE rn = 1 AND deleted = 0 AND url = %(url)s",
                {"url": url, "name": name, "description": description, "icon_url": icon_url},
            )
    else:
        now = _now()
        client.insert(
            "apps",
            [
                [
                    url,
                    app_info.get("name", ""),
                    app_info.get("description", ""),
                    app_info.get("icon_url", ""),
                    _json(app_info.get("screenshots", [])),
                    0,  # visits — retired as a store metric (D49); app_visits is the source
                    0,
                    "pending",
                    1,
                    now,
                    now,
                    0,
                ]
            ],
            column_names=[
                "url",
                "name",
                "description",
                "icon_url",
                "screenshots",
                "visits",
                "approved",
                "review_state",
                "metadata_version",
                "created_at",
                "updated_at",
                "deleted",
            ],
        )

    # The usage log — real, verified users only, gated to 1 per 3h.
    if username:
        _count_app_visit(url, username)

    return {"url": url, "review_state": existing["review_state"] if existing else "pending"}


def list_apps(approved_only: bool = True) -> list[dict]:
    """List apps, optionally filtered by approval.

    Dedup-then-filter: the visits increment appends a new row per
    registration, so the latest row per url wins (tombstones included in
    the dedup, then deleted = 0).
    """
    where = "AND approved = 1" if approved_only else ""
    result = client.query(
        f"SELECT url, name, description, icon_url, screenshots, visits, review_state, metadata_version "
        f"FROM (SELECT url, name, description, icon_url, screenshots, visits, approved, review_state, "
        f"metadata_version, updated_at, deleted, "
        f"row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn "
        f"FROM apps) WHERE rn = 1 AND deleted = 0 {where} ORDER BY url",
    )
    return [
        {
            "url": row[0],
            "name": row[1],
            "description": row[2],
            "icon_url": row[3],
            "screenshots": _parse_json(row[4]),
            "visits": row[5],
            "review_state": row[6],
            "metadata_version": row[7],
        }
        for row in result.result_rows
    ]


def list_apps_admin() -> list[dict]:
    """Admin-facing list of every registered app with full state."""
    result = client.query(
        "SELECT url, name, description, icon_url, screenshots, approved, review_state, "
        "metadata_version, visits, created_at, updated_at "
        "FROM (SELECT url, name, description, icon_url, screenshots, approved, review_state, "
        "metadata_version, visits, created_at, updated_at, deleted, "
        "row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM apps) WHERE rn = 1 AND deleted = 0 ORDER BY created_at DESC",
    )
    apps = []
    for row in result.result_rows:
        url = row[0]
        # Fetch ratings for this app — dedup-then-filter (a re-rate appends;
        # the latest row per (app, author) wins, not the pre-merge pile).
        ratings_result = client.query(
            "SELECT rating, count() as cnt FROM ("
            "SELECT rating, deleted, "
            "row_number() OVER (PARTITION BY target_app_id, author ORDER BY updated_at DESC, deleted DESC) AS rn "
            "FROM app_ratings WHERE target_app_id = %(url)s"
            ") WHERE rn = 1 AND deleted = 0 "
            "GROUP BY rating WITH ROLLUP ORDER BY rating",
            {"url": url},
        )
        total_count = 0
        weighted_sum = 0
        for r in ratings_result.result_rows:
            if r[0] is not None:
                total_count += r[1]
                weighted_sum += r[0] * r[1]

        apps.append(
            {
                "url": url,
                "approved": bool(row[5]),
                "name": row[1],
                "description": row[2],
                "icon_url": row[3],
                "screenshots": _parse_json(row[4]),
                "registered_at": str(row[9]),
                "review_state": row[6],
                "metadata_version": row[7],
                "visits": row[8],
                "last_reviewed_at": str(row[10]),
                "rating_average": round(weighted_sum / total_count, 1) if total_count else None,
                "rating_count": total_count,
            }
        )
    return apps


def get_app(url: str) -> dict | None:
    """Get an app by URL (latest row wins). Normalized — rows are stored in
    canonical form (D49 / hardening #4), so lookups must be too."""
    url = _canonical_app_url(url)
    result = client.query(
        "SELECT url, name, description, icon_url, screenshots, approved, review_state, metadata_version, visits, created_at "
        "FROM apps WHERE url = %(url)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"url": url},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "url": row[0],
        "name": row[1],
        "description": row[2],
        "icon_url": row[3],
        "screenshots": _parse_json(row[4]),
        "approved": bool(row[5]),
        "review_state": row[6],
        "metadata_version": row[7],
        "visits": row[8],
        "registered_at": str(row[9]),
    }


def get_app_detail(url: str) -> dict | None:
    """The product page payload (D52): the app record + the full realtime
    metric breakdown + rating aggregate + rating list + the node macro.

    Pure read — no app_visits row is written (a product-page view is not an
    app visit; usage rows come only from SDK pings with a verified token).
    Returns None for unknown urls and for apps that are not approved — the
    product page is a store surface, and the store lists approved only.
    """
    url = _canonical_app_url(url)
    app = get_app(url)
    if app is None or not app["approved"]:
        return None

    metrics = get_app_metrics([url]).get(
        url,
        {"visits": 0, "users_1d": 0, "users_30d": 0, "users_90d": 0, "users_1y": 0},
    )
    ratings = get_app_ratings(url)
    rating_count = len(ratings)
    rating_average = round(sum(r["rating"] for r in ratings) / rating_count, 1) if rating_count else None
    node = get_node_stats()
    return {
        "url": app["url"],
        "name": app["name"],
        "description": app["description"],
        "icon_url": app["icon_url"],
        "screenshots": app["screenshots"],
        "review_state": app["review_state"],
        "registered_at": app["registered_at"],
        "metrics": metrics,
        "rating": {"average": rating_average, "count": rating_count},
        "ratings": ratings,
        "node": {
            "users": node["users"],
            "app_count": node["app_count"],
            "active_users": node["active_users"],
            "storage": node["storage"],
        },
    }


def approve_app(url: str, approved: bool, review_state: str):
    """Approve or reject an app.

    Dedup-then-filter: only the latest row per url is re-inserted — a raw
    `WHERE url = ...` would re-insert every visit-bump version and
    multiply rows. now64(6) so the new row ranks latest in the dedup.
    The url is normalized (rows are stored in canonical form, D49 /
    hardening #4) — approving `www.app.com/x` hits the `app.com/x` row.
    """
    url = _canonical_app_url(url)
    client.command(
        "INSERT INTO apps (url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, updated_at, deleted) "
        "SELECT url, name, description, icon_url, screenshots, visits, %(approved)s, %(review_state)s, metadata_version, created_at, now64(6), 0 "
        "FROM (SELECT url, name, description, icon_url, screenshots, visits, metadata_version, created_at, updated_at, deleted, "
        "row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM apps) WHERE rn = 1 AND deleted = 0 AND url = %(url)s",
        {"url": url, "approved": 1 if approved else 0, "review_state": review_state},
    )


def create_app_rating(author: str, target_app_id: str, rating: int, provider: str, comment: str = "") -> dict:
    """Submit a 1-5 star rating for an app, with an optional review comment
    (D52: a review is a rating with words). Named columns — the comment
    column was appended by ALTER on pre-existing volumes. The target is
    canonicalized (hardening #4) so a client can't fork an identity by
    spelling — the detail page queries the canonical url."""
    target_app_id = _canonical_app_url(target_app_id)
    now = _now()
    client.insert(
        "app_ratings",
        [[author, target_app_id, rating, comment, provider, now, now, 0]],
        column_names=[
            "author",
            "target_app_id",
            "rating",
            "comment",
            "provider",
            "created_at",
            "updated_at",
            "deleted",
        ],
    )
    return {"author": author, "target_app_id": target_app_id, "rating": rating, "comment": comment}


def get_app_ratings(target_app_id: str) -> list[dict]:
    """Get all ratings for an app (newest first), including review comments.
    The target is canonicalized (hardening #4) — reads and writes key on
    the same identity. Dedup-then-filter: a re-rate appends a new row, and
    ReplacingMergeTree collapses it only on a background merge — the
    window function makes the latest row per (app, author) win on read."""
    target_app_id = _canonical_app_url(target_app_id)
    result = client.query(
        "SELECT author, rating, comment, provider, created_at FROM ("
        "SELECT author, rating, comment, provider, created_at, deleted, "
        "row_number() OVER (PARTITION BY target_app_id, author ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM app_ratings WHERE target_app_id = %(target_app_id)s"
        ") WHERE rn = 1 AND deleted = 0 "
        "ORDER BY created_at DESC",
        {"target_app_id": target_app_id},
    )
    return [
        {
            "author": row[0],
            "rating": row[1],
            "comment": row[2],
            "provider": row[3],
            "created_at": str(row[4]),
        }
        for row in result.result_rows
    ]


# ---------------------------------------------------------------------------
# Bug Reports
# ---------------------------------------------------------------------------


def submit_bug_report(
    description: str,
    username: str = "",
    email: str = "",
    page_url: str = "",
    app_version: str = "",
    device_info: str = "",
    browser_info: str = "",
    error_message: str = "",
    stack_trace: str = "",
    screenshots: list[str] | None = None,
) -> dict:
    """Submit a bug report. Public — no auth required. Screenshots are base64-encoded strings."""
    now = _now()
    report_id = uuid.uuid4().hex
    client.insert(
        "bug_reports",
        [
            [
                report_id,
                username,
                email,
                description,
                page_url,
                app_version,
                device_info,
                browser_info,
                error_message,
                stack_trace,
                _json(screenshots or []),
                now,
                now,
                0,
            ]
        ],
    )
    return {
        "report_id": report_id,
        "status": "submitted",
        "created_at": now.isoformat(),
    }


def list_bug_reports(limit: int = 100, offset: int = 0) -> list[dict]:
    """List bug reports, newest first. Screenshots are NOT returned by default (too large)."""
    result = client.query(
        "SELECT report_id, username, email, description, page_url, app_version, device_info, "
        "browser_info, error_message, stack_trace, created_at "
        "FROM bug_reports WHERE deleted = 0 "
        "ORDER BY created_at DESC "
        "LIMIT %(limit)s OFFSET %(offset)s",
        {"limit": limit, "offset": offset},
    )
    return [
        {
            "report_id": row[0],
            "username": row[1],
            "email": row[2],
            "description": row[3],
            "page_url": row[4],
            "app_version": row[5],
            "device_info": row[6],
            "browser_info": row[7],
            "error_message": row[8],
            "stack_trace": row[9],
            "created_at": str(row[10]),
        }
        for row in result.result_rows
    ]


def get_bug_report(report_id: str) -> dict | None:
    """Get a single bug report by ID, including screenshots."""
    result = client.query(
        "SELECT report_id, username, email, description, page_url, app_version, device_info, "
        "browser_info, error_message, stack_trace, screenshots, created_at "
        "FROM bug_reports WHERE report_id = %(report_id)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"report_id": report_id},
    )
    if not result.result_rows:
        return None
    row = result.result_rows[0]
    return {
        "report_id": row[0],
        "username": row[1],
        "email": row[2],
        "description": row[3],
        "page_url": row[4],
        "app_version": row[5],
        "device_info": row[6],
        "browser_info": row[7],
        "error_message": row[8],
        "stack_trace": row[9],
        "screenshots": _parse_json(row[10]),
        "created_at": str(row[11]),
    }
