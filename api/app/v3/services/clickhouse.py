import json
import logging
import uuid
from datetime import datetime

import clickhouse_connect

import app.settings as settings

log = logging.getLogger(__name__)

client = clickhouse_connect.get_client(
    host=settings.CLICKHOUSE_HOST,
    port=settings.CLICKHOUSE_PORT,
    database=settings.CLICKHOUSE_DATABASE,
    username=settings.CLICKHOUSE_USER,
    password=settings.CLICKHOUSE_PASSWORD,
    secure=settings.CLICKHOUSE_SECURE,
)


def _now() -> datetime:
    return datetime.utcnow()


def _json(body: dict) -> str:
    return json.dumps(body)


def _parse_json(body: str) -> dict:
    if not body:
        return {}
    return json.loads(body)


def _gen_doc_id() -> str:
    return uuid.uuid4().hex


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def insert_document(
    author_key: str,
    collection_name: str,
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
        [[doc_id, author_key, collection_name, _json(body), ref_value or "", tags or [], now, now, 0]],
    )
    return {
        "doc_id": doc_id,
        "author_key": author_key,
        "collection_name": collection_name,
        "body": body,
        "ref_value": ref_value,
        "tags": tags or [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


def read_documents(
    author_key: str | None,
    collection_name: str,
    doc_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    sort_desc: bool = True,
) -> list[dict]:
    """Read documents by author and collection. Optional doc_id filter."""
    conditions = ["deleted = 0", "collection_name = %(coll)s"]
    params = {"coll": collection_name}

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
        FROM documents
        WHERE {where}
        ORDER BY {order}
        LIMIT %(limit)s OFFSET %(offset)s
    """,
        {"limit": limit, "offset": offset, **params},
    )

    rows = []
    for row in result.result_rows():
        rows.append(
            {
                "doc_id": row[0],
                "author_key": row[1],
                "collection_name": row[2],
                "body": _parse_json(row[3]),
                "ref_value": row[4],
                "tags": list(row[5]),
                "created_at": str(row[6]),
                "updated_at": str(row[7]),
            }
        )
    return rows


def update_document(
    doc_id: str, author_key: str, collection_name: str, body: dict, ref_value: str = "", tags: list[str] | None = None
) -> dict:
    """Update a document (insert new version with higher updated_at, preserve created_at)."""
    existing = get_document(doc_id, author_key)
    if not existing:
        return None
    now = _now()
    created_at = datetime.fromisoformat(existing["created_at"])
    client.insert(
        "documents",
        [[doc_id, author_key, collection_name, _json(body), ref_value or "", tags or [], created_at, now, 0]],
    )
    return {
        "doc_id": doc_id,
        "author_key": author_key,
        "collection_name": collection_name,
        "body": body,
        "ref_value": ref_value,
        "tags": tags or [],
        "created_at": existing["created_at"],
        "updated_at": now.isoformat(),
    }


def delete_document(doc_id: str, author_key: str, collection_name: str):
    """Tombstone a document (insert deleted=1 version)."""
    client.command(
        "INSERT INTO documents (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted) "
        "SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, now(), 1 "
        "FROM documents WHERE doc_id = %(doc_id)s AND author_key = %(author_key)s AND deleted = 0",
        {"doc_id": doc_id, "author_key": author_key},
    )


def get_document(doc_id: str, author_key: str) -> dict | None:
    """Get a single document by doc_id and author_key."""
    result = client.query(
        "SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at "
        "FROM documents WHERE doc_id = %(doc_id)s AND author_key = %(author_key)s AND deleted = 0",
        {"doc_id": doc_id, "author_key": author_key},
    )
    if not result.result_rows():
        return None
    row = result.result_rows()[0]
    return {
        "doc_id": row[0],
        "author_key": row[1],
        "collection_name": row[2],
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
    return [row[0] for row in result.result_rows()]


# ---------------------------------------------------------------------------
# Group Contracts
# ---------------------------------------------------------------------------


def create_group(group_id: str, roles: list[dict], join_policy: str) -> dict:
    """Create a group contract."""
    now = _now()
    client.insert(
        "group_contracts",
        [[group_id, _json(roles), join_policy, now, now, 0]],
    )
    return {
        "group_id": group_id,
        "roles": roles,
        "join_policy": join_policy,
        "created_at": now.isoformat(),
    }


def get_group(group_id: str) -> dict | None:
    """Get a group contract."""
    result = client.query(
        "SELECT group_id, roles, join_policy, created_at, updated_at "
        "FROM group_contracts WHERE group_id = %(group_id)s AND deleted = 0",
        {"group_id": group_id},
    )
    if not result.result_rows():
        return None
    row = result.result_rows()[0]
    return {
        "group_id": row[0],
        "roles": _parse_json(row[1]),
        "join_policy": row[2],
        "created_at": str(row[3]),
        "updated_at": str(row[4]),
    }


def update_group(group_id: str, **kwargs):
    """Update a group contract (insert new version)."""
    existing = get_group(group_id)
    if not existing:
        return None
    roles = kwargs.get("roles", existing["roles"])
    join_policy = kwargs.get("join_policy", existing["join_policy"])
    now = _now()
    client.insert(
        "group_contracts",
        [[group_id, _json(roles), join_policy, existing["created_at"], now, 0]],
    )
    return {
        "group_id": group_id,
        "roles": roles,
        "join_policy": join_policy,
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
    """Tombstone a group member."""
    client.command(
        "INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted) "
        "SELECT group_id, member_key, role, joined_at, now(), 1 "
        "FROM group_members WHERE group_id = %(group_id)s AND member_key = %(member_key)s AND deleted = 0",
        {"group_id": group_id, "member_key": member_key},
    )


def get_group_members(group_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    """Get active members of a group."""
    result = client.query(
        "SELECT member_key, role, joined_at FROM group_members "
        "WHERE group_id = %(group_id)s AND deleted = 0 LIMIT %(limit)s OFFSET %(offset)s",
        {"group_id": group_id, "limit": limit, "offset": offset},
    )
    return [{"member_key": row[0], "role": row[1], "joined_at": str(row[2])} for row in result.result_rows()]


def get_group_member(group_id: str, member_key: str) -> dict | None:
    """Get a specific member of a group."""
    result = client.query(
        "SELECT member_key, role, joined_at FROM group_members "
        "WHERE group_id = %(group_id)s AND member_key = %(member_key)s AND deleted = 0",
        {"group_id": group_id, "member_key": member_key},
    )
    if not result.result_rows():
        return None
    row = result.result_rows()[0]
    return {"member_key": row[0], "role": row[1], "joined_at": str(row[2])}


def is_group_member(group_id: str, member_key: str) -> bool:
    """Check if a user is an active member of a group."""
    return get_group_member(group_id, member_key) is not None


def get_user_groups(member_key: str) -> list[dict]:
    """Get all groups a user belongs to."""
    result = client.query(
        "SELECT gc.group_id, gc.join_policy, gm.role AS my_role, "
        "(SELECT count() FROM group_members gm2 WHERE gm2.group_id = gc.group_id AND gm2.deleted = 0) AS member_count "
        "FROM group_members gm "
        "JOIN group_contracts gc ON gm.group_id = gc.group_id "
        "WHERE gm.member_key = %(member_key)s AND gm.deleted = 0 AND gc.deleted = 0",
        {"member_key": member_key},
    )
    return [
        {
            "group_id": row[0],
            "join_policy": row[1],
            "my_role": row[2],
            "member_count": row[3],
        }
        for row in result.result_rows()
    ]


# ---------------------------------------------------------------------------
# Group Join Requests
# ---------------------------------------------------------------------------


def create_join_request(group_id: str, requester_key: str, status: str = "pending") -> dict:
    """Create a join request."""
    now = _now()
    client.insert(
        "group_join_requests",
        [[group_id, requester_key, status, now, None, now, 0]],
    )
    return {
        "group_id": group_id,
        "requester_key": requester_key,
        "status": status,
        "requested_at": now.isoformat(),
    }


def resolve_join_request(group_id: str, requester_key: str, status: str):
    """Update a join request status (approved/denied)."""
    client.command(
        "INSERT INTO group_join_requests (group_id, requester_key, status, requested_at, resolved_at, updated_at, deleted) "
        "SELECT group_id, requester_key, %(status)s, requested_at, now(), now(), 0 "
        "FROM group_join_requests WHERE group_id = %(group_id)s AND requester_key = %(requester_key)s AND deleted = 0",
        {"group_id": group_id, "requester_key": requester_key, "status": status},
    )


def get_pending_requests(group_id: str) -> list[dict]:
    """Get pending join requests for a group."""
    result = client.query(
        "SELECT requester_key, status, requested_at FROM group_join_requests "
        "WHERE group_id = %(group_id)s AND status = 'pending' AND deleted = 0",
        {"group_id": group_id},
    )
    return [{"requester_key": row[0], "status": row[1], "requested_at": str(row[2])} for row in result.result_rows()]


def has_pending_or_invited_request(group_id: str, requester_key: str) -> bool:
    """Check if a user has a pending or invited join request for a group."""
    result = client.query(
        "SELECT count() FROM group_join_requests "
        "WHERE group_id = %(group_id)s AND requester_key = %(requester_key)s AND status IN ('pending', 'invited') AND deleted = 0",
        {"group_id": group_id, "requester_key": requester_key},
    )
    return result.result_rows()[0][0] > 0


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
    """Unhide a document from a group's discover."""
    client.command(
        "INSERT INTO group_hidden_docs (group_id, doc_id, moderator_key, hidden_at, updated_at, deleted) "
        "SELECT group_id, doc_id, moderator_key, hidden_at, now(), 1 "
        "FROM group_hidden_docs WHERE group_id = %(group_id)s AND doc_id = %(doc_id)s AND deleted = 0",
        {"group_id": group_id, "doc_id": doc_id},
    )


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
        "SELECT allowed_origin, permissions FROM app_contracts WHERE user_key = %(user_key)s AND deleted = 0",
        {"user_key": user_key},
    )
    return [
        {
            "allowed_origin": row[0],
            "permissions": json.loads(row[1]) if row[1] else {},
        }
        for row in result.result_rows()
    ]


def is_origin_allowed(user_key: str, allowed_origin: str) -> bool:
    """Check if an origin has an active contract for a user."""
    result = client.query(
        "SELECT count() FROM app_contracts "
        "WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )
    return result.result_rows()[0][0] > 0


def get_app_permissions(user_key: str, allowed_origin: str) -> dict:
    """Get the permissions dict for a user+origin contract. Returns {} if no contract."""
    result = client.query(
        "SELECT permissions FROM app_contracts "
        "WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )
    rows = result.result_rows()
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
        "SELECT user_key, allowed_origin, permissions, created_at, now(), 1 "
        "FROM app_contracts WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )


def revoke_all_app_contracts(user_key: str):
    """Tombstone all app contracts for a user."""
    client.command(
        "INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted) "
        "SELECT user_key, allowed_origin, permissions, created_at, now(), 1 "
        "FROM app_contracts WHERE user_key = %(user_key)s AND deleted = 0",
        {"user_key": user_key},
    )


# ---------------------------------------------------------------------------
# Blacklists
# ---------------------------------------------------------------------------


def block_user(user_key: str, blocked_key: str):
    """Block a user (user-wide blacklist)."""
    now = _now()
    client.insert("user_blacklist", [[user_key, blocked_key, now, now, 0]])


def unblock_user(user_key: str, blocked_key: str):
    """Remove a user block (tombstone via INSERT SELECT)."""
    client.command(
        "INSERT INTO user_blacklist (user_key, blocked_key, created_at, updated_at, deleted) "
        "SELECT user_key, blocked_key, created_at, now(), 1 "
        "FROM user_blacklist WHERE user_key = %(user_key)s AND blocked_key = %(blocked_key)s AND deleted = 0",
        {"user_key": user_key, "blocked_key": blocked_key},
    )


def is_user_blocked(user_key: str, blocked_key: str) -> bool:
    """Check if a user has blocked another user."""
    result = client.query(
        "SELECT count() FROM user_blacklist WHERE user_key = %(user_key)s AND blocked_key = %(blocked_key)s AND deleted = 0",
        {"user_key": user_key, "blocked_key": blocked_key},
    )
    return result.result_rows()[0][0] > 0


def block_user_in_group(user_key: str, group_id: str, blocked_key: str):
    """Block a user from seeing content in a specific group."""
    now = _now()
    client.insert("group_blacklist", [[user_key, group_id, blocked_key, now, now, 0]])


def unblock_user_in_group(user_key: str, group_id: str, blocked_key: str):
    """Remove a per-group block (tombstone via INSERT SELECT)."""
    client.command(
        "INSERT INTO group_blacklist (user_key, group_id, blocked_key, created_at, updated_at, deleted) "
        "SELECT user_key, group_id, blocked_key, created_at, now(), 1 "
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
        "WHERE user_key = %(user_key)s AND group_id = %(group_id)s AND deleted = 0",
        {"user_key": user_key, "group_id": group_id},
    )
    if not result.result_rows():
        return True  # Default on (opt-out model)
    return result.result_rows()[0][0] == 1


# ---------------------------------------------------------------------------
# Cross-group document reads (the core v3 query)
# ---------------------------------------------------------------------------


def read_documents_in_groups(
    group_ids: list[str],
    member_key: str,
    collection_name: str,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Read documents attached to groups where the user is a member.

    This is the core v3 discover query: documents JOIN doc_groups JOIN group_members,
    filtered by membership, tombstones, blacklists, and hidden docs.
    """
    if not group_ids:
        return []

    result = client.query(
        "SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value "
        "FROM documents p "
        "JOIN doc_groups pg ON p.doc_id = pg.doc_id "
        "JOIN group_members gm ON pg.group_id = gm.group_id "
        "WHERE p.deleted = 0 "
        "AND p.collection_name = %(coll)s "
        "AND pg.deleted = 0 "
        "AND gm.member_key = %(member_key)s "
        "AND gm.deleted = 0 "
        "AND pg.group_id IN (%(g0)s" + "".join(f", %(g{i})s" for i in range(1, len(group_ids))) + ") "
        "AND NOT EXISTS ("
        "SELECT 1 FROM user_blacklist "
        "WHERE user_key = p.author_key AND blocked_key = %(member_key)s AND deleted = 0"
        ") "
        "AND NOT EXISTS ("
        "SELECT 1 FROM group_hidden_docs h "
        "WHERE h.doc_id = p.doc_id AND h.group_id = pg.group_id AND h.deleted = 0"
        ") "
        "ORDER BY p.created_at DESC "
        "LIMIT %(limit)s OFFSET %(offset)s",
        {
            "member_key": member_key,
            "coll": collection_name,
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
            "collection_name": collection_name,
        }
        for row in result.result_rows()
    ]


# ---------------------------------------------------------------------------
# Ref counts (engagement)
# ---------------------------------------------------------------------------


def get_ref_count(doc_id: str, collection_name: str = "reactions") -> int:
    """Count documents referencing a given doc_id."""
    result = client.query(
        "SELECT count() FROM documents WHERE deleted = 0 AND collection_name = %(coll)s AND ref_value = %(doc_id)s",
        {"coll": collection_name, "doc_id": doc_id},
    )
    return result.result_rows()[0][0]


def get_ref_counts(doc_ids: list[str], collection_name: str = "reactions") -> dict[str, int]:
    """Count references for multiple documents."""
    if not doc_ids:
        return {}
    placeholders = ", ".join(f"%(d{i})s" for i in range(len(doc_ids)))
    params = {"coll": collection_name, **{f"d{i}": did for i, did in enumerate(doc_ids)}}
    result = client.query(
        f"SELECT ref_value, count() FROM documents WHERE deleted = 0 AND collection_name = %(coll)s AND ref_value IN ({placeholders}) GROUP BY ref_value",
        params,
    )
    return {row[0]: row[1] for row in result.result_rows()}


# ---------------------------------------------------------------------------
# Read by doc_id with group permission check
# ---------------------------------------------------------------------------


def read_document_by_id(doc_id: str, member_key: str, collection_name: str) -> dict | None:
    """Read a single document by doc_id with group permission check."""
    result = client.query(
        "SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value "
        "FROM documents p "
        "WHERE p.doc_id = %(doc_id)s "
        "AND p.deleted = 0 "
        "AND p.collection_name = %(coll)s "
        "AND EXISTS ( "
        "SELECT 1 FROM doc_groups pg "
        "JOIN group_members gm ON pg.group_id = gm.group_id "
        "WHERE pg.doc_id = p.doc_id "
        "AND gm.member_key = %(member_key)s "
        "AND pg.deleted = 0 "
        "AND gm.deleted = 0 "
        ") "
        "AND NOT EXISTS ( "
        "SELECT 1 FROM user_blacklist "
        "WHERE user_key = p.author_key AND blocked_key = %(member_key)s AND deleted = 0 "
        ")",
        {"doc_id": doc_id, "coll": collection_name, "member_key": member_key},
    )
    if not result.result_rows():
        return None
    row = result.result_rows()[0]
    return {
        "doc_id": row[0],
        "author_key": row[1],
        "body": _parse_json(row[2]),
        "tags": list(row[3]),
        "created_at": str(row[4]),
        "ref_value": row[5],
        "collection_name": collection_name,
    }


# ---------------------------------------------------------------------------
# Groups: manages
# ---------------------------------------------------------------------------


def get_groups_manages(member_key: str) -> list[dict]:
    """Get groups where the user has management permissions.

    Uses ClickHouse JSON functions (extractJSONArray, has) to filter
    in-database instead of application-side iteration.
    """
    result = client.query(
        "SELECT gc.group_id, gc.join_policy, gm.role AS my_role, "
        "(SELECT count() FROM group_members gm2 WHERE gm2.group_id = gc.group_id AND gm2.deleted = 0) AS member_count "
        "FROM group_members gm "
        "JOIN group_contracts gc ON gm.group_id = gc.group_id "
        "WHERE gm.member_key = %(member_key)s "
        "AND gm.deleted = 0 "
        "AND gc.deleted = 0 "
        "AND gm.role IN ("
        "  SELECT name FROM extractJSONArray(gc.roles) "
        "  WHERE has(extractJSONArrayString(permissions), 'manageRoles')"
        ")",
        {"member_key": member_key},
    )
    return [
        {
            "group_id": row[0],
            "join_policy": row[1],
            "my_role": row[2],
            "member_count": row[3],
        }
        for row in result.result_rows()
    ]


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
        "SELECT allowed_origin FROM provider_service_contracts WHERE provider_key = %(provider_key)s AND deleted = 0",
        {"provider_key": provider_key},
    )
    return [{"allowed_origin": row[0]} for row in result.result_rows()]


def is_provider_origin_allowed(provider_key: str, allowed_origin: str) -> bool:
    """Check if an origin is allowed at the provider level."""
    result = client.query(
        "SELECT count() FROM provider_service_contracts "
        "WHERE provider_key = %(provider_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"provider_key": provider_key, "allowed_origin": allowed_origin},
    )
    return result.result_rows()[0][0] > 0


def revoke_provider_service_contract(provider_key: str, allowed_origin: str):
    """Tombstone a provider service contract."""
    client.command(
        "INSERT INTO provider_service_contracts (provider_key, allowed_origin, created_at, updated_at, deleted) "
        "SELECT provider_key, allowed_origin, created_at, now(), 1 "
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
    for row in result.result_rows():
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


def resolve_media_urls_in_docs(docs: list[dict]) -> list[dict]:
    """Resolve media URLs in a list of documents."""
    resolved = []
    for doc in docs:
        body = doc.get("body", {})
        if body.get("media_refs"):
            author = doc.get("author_key", "")
            resolved_body = resolve_media_urls(body, author)
            doc_with_media = dict(doc)
            doc_with_media["body"] = resolved_body
            resolved.append(doc_with_media)
        else:
            resolved.append(doc)
    return resolved


# ---------------------------------------------------------------------------
# User stats (v3 equivalent of /stats)
# ---------------------------------------------------------------------------


def get_node_stats() -> dict:
    """Get node-level stats: user count, doc count, storage estimate."""
    user_result = client.query("SELECT count(DISTINCT author_key) FROM documents WHERE deleted = 0")
    user_count = user_result.result_rows()[0][0] if user_result.result_rows() else 0
    doc_result = client.query("SELECT count() FROM documents WHERE deleted = 0")
    doc_count = doc_result.result_rows()[0][0] if doc_result.result_rows() else 0
    group_result = client.query("SELECT count() FROM group_contracts WHERE deleted = 0")
    group_count = group_result.result_rows()[0][0] if group_result.result_rows() else 0
    return {
        "users": user_count,
        "documents": doc_count,
        "groups": group_count,
    }


# ---------------------------------------------------------------------------
# Users (account management)
# ---------------------------------------------------------------------------


def create_user(username: str, password_hash: str, phone: str = "", email: str = "") -> dict:
    """Create a user account."""
    existing = client.query(
        "SELECT count() FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username},
    )
    if existing.result_rows()[0][0] > 0:
        return None
    now = _now()
    client.insert(
        "users",
        [[username, password_hash, phone, 0, email, 0, now, now, 0]],
    )
    return {"username": username, "phone": phone, "email": email}


def get_user(username: str) -> dict | None:
    """Get a user record."""
    result = client.query(
        "SELECT username, password_hash, phone, phone_verified, email, email_verified, created_at "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username},
    )
    if not result.result_rows():
        return None
    row = result.result_rows()[0]
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
        for row in result.result_rows()
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


def register_app(app_info: dict) -> dict:
    """Register an app in the provider app store. Idempotent — returns existing if already registered."""
    existing = get_app(app_info["url"])
    if existing:
        return {"url": app_info["url"], "review_state": existing["review_state"]}
    now = _now()
    client.insert(
        "apps",
        [
            [
                app_info["url"],
                app_info.get("name", ""),
                app_info.get("description", ""),
                app_info.get("icon_url", ""),
                _json(app_info.get("screenshots", [])),
                0,
                "pending",
                1,
                now,
                now,
                0,
            ]
        ],
    )
    return {"url": app_info["url"], "review_state": "pending"}


def list_apps(approved_only: bool = True) -> list[dict]:
    """List apps, optionally filtered by approval."""
    where = "AND approved = 1" if approved_only else ""
    result = client.query(
        f"SELECT url, name, description, icon_url, screenshots, review_state, metadata_version "
        f"FROM apps WHERE deleted = 0 {where} ORDER BY url",
    )
    return [
        {
            "url": row[0],
            "name": row[1],
            "description": row[2],
            "icon_url": row[3],
            "screenshots": _parse_json(row[4]),
            "review_state": row[5],
            "metadata_version": row[6],
        }
        for row in result.result_rows()
    ]


def get_app(url: str) -> dict | None:
    """Get an app by URL."""
    result = client.query(
        "SELECT url, name, description, icon_url, screenshots, approved, review_state, metadata_version "
        "FROM apps WHERE url = %(url)s AND deleted = 0",
        {"url": url},
    )
    if not result.result_rows():
        return None
    row = result.result_rows()[0]
    return {
        "url": row[0],
        "name": row[1],
        "description": row[2],
        "icon_url": row[3],
        "screenshots": _parse_json(row[4]),
        "approved": bool(row[5]),
        "review_state": row[6],
        "metadata_version": row[7],
    }


def approve_app(url: str, approved: bool, review_state: str):
    """Approve or reject an app."""
    client.command(
        "INSERT INTO apps (url, name, description, icon_url, screenshots, approved, review_state, metadata_version, created_at, updated_at, deleted) "
        "SELECT url, name, description, icon_url, screenshots, %(approved)s, %(review_state)s, metadata_version, created_at, now(), 0 "
        "FROM apps WHERE url = %(url)s AND deleted = 0",
        {"url": url, "approved": 1 if approved else 0, "review_state": review_state},
    )


def create_app_rating(author: str, target_app_id: str, rating: int, provider: str) -> dict:
    """Submit a 1-5 star rating for an app."""
    now = _now()
    client.insert(
        "app_ratings",
        [[author, target_app_id, rating, provider, now, now, 0]],
    )
    return {"author": author, "target_app_id": target_app_id, "rating": rating}


def get_app_ratings(target_app_id: str) -> list[dict]:
    """Get all ratings for an app."""
    result = client.query(
        "SELECT author, rating, provider, created_at FROM app_ratings "
        "WHERE target_app_id = %(target_app_id)s AND deleted = 0 "
        "ORDER BY created_at DESC",
        {"target_app_id": target_app_id},
    )
    return [
        {
            "author": row[0],
            "rating": row[1],
            "provider": row[2],
            "created_at": str(row[3]),
        }
        for row in result.result_rows()
    ]
