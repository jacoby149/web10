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

NOW = "now()"


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


def insert_document(doc_id: str, author_key: str, collection_name: str, body: dict, ref_value: str = "", tags: list[str] | None = None) -> dict:
    """Insert a document into the documents table."""
    now = _now()
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


def read_documents(author_key: str | None, collection_name: str, doc_id: str | None = None, limit: int = 50, offset: int = 0, sort_desc: bool = True) -> list[dict]:
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

    result = client.query(f"""
        SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at
        FROM documents
        WHERE {where}
        ORDER BY {order}
        LIMIT %(limit)s OFFSET %(offset)s
    """, {"limit": limit, "offset": offset, **params})

    rows = []
    for row in result.result_rows():
        rows.append({
            "doc_id": row[0],
            "author_key": row[1],
            "collection_name": row[2],
            "body": _parse_json(row[3]),
            "ref_value": row[4],
            "tags": list(row[5]),
            "created_at": str(row[6]),
            "updated_at": str(row[7]),
        })
    return rows


def update_document(doc_id: str, author_key: str, collection_name: str, body: dict, ref_value: str = "", tags: list[str] | None = None) -> dict:
    """Update a document (insert new version with higher updated_at)."""
    now = _now()
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
    return [
        {"member_key": row[0], "role": row[1], "joined_at": str(row[2])}
        for row in result.result_rows()
    ]


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
    return [
        {"requester_key": row[0], "status": row[1], "requested_at": str(row[2])}
        for row in result.result_rows()
    ]


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
# Service Contracts (simplified v3)
# ---------------------------------------------------------------------------


def add_service_contract(user_key: str, service_name: str, allowed_origin: str) -> dict:
    """Add a service contract (app trust)."""
    now = _now()
    client.insert(
        "service_contracts",
        [[user_key, service_name, allowed_origin, now, now, 0]],
    )
    return {
        "user_key": user_key,
        "service_name": service_name,
        "allowed_origin": allowed_origin,
        "created_at": now.isoformat(),
    }


def get_service_contracts(user_key: str) -> list[dict]:
    """Get active service contracts for a user."""
    result = client.query(
        "SELECT service_name, allowed_origin FROM service_contracts "
        "WHERE user_key = %(user_key)s AND deleted = 0",
        {"user_key": user_key},
    )
    return [
        {"service_name": row[0], "allowed_origin": row[1]}
        for row in result.result_rows()
    ]


def is_origin_allowed(user_key: str, service_name: str, allowed_origin: str) -> bool:
    """Check if an origin is allowed for a user+service."""
    result = client.query(
        "SELECT count() FROM service_contracts "
        "WHERE user_key = %(user_key)s AND service_name = %(service_name)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"user_key": user_key, "service_name": service_name, "allowed_origin": allowed_origin},
    )
    return result.result_rows()[0][0] > 0


def revoke_service_contract(user_key: str, allowed_origin: str):
    """Tombstone all service contracts for an origin."""
    client.command(
        "INSERT INTO service_contracts (user_key, service_name, allowed_origin, created_at, updated_at, deleted) "
        "SELECT user_key, service_name, allowed_origin, created_at, now(), 1 "
        "FROM service_contracts WHERE user_key = %(user_key)s AND allowed_origin = %(allowed_origin)s AND deleted = 0",
        {"user_key": user_key, "allowed_origin": allowed_origin},
    )


def revoke_all_service_contracts(user_key: str):
    """Tombstone all service contracts for a user."""
    client.command(
        "INSERT INTO service_contracts (user_key, service_name, allowed_origin, created_at, updated_at, deleted) "
        "SELECT user_key, service_name, allowed_origin, created_at, now(), 1 "
        "FROM service_contracts WHERE user_key = %(user_key)s AND deleted = 0",
        {"user_key": user_key},
    )


# ---------------------------------------------------------------------------
# Blacklists
# ---------------------------------------------------------------------------


def block_user(user_key: str, blocked_key: str):
    """Block a user (user-wide blacklist)."""
    now = _now()
    client.insert("user_blacklist", [[user_key, blocked_key, now]])


def unblock_user(user_key: str, blocked_key: str):
    """Remove a user block."""
    client.command(
        "DELETE FROM user_blacklist WHERE user_key = %(user_key)s AND blocked_key = %(blocked_key)s",
        {"user_key": user_key, "blocked_key": blocked_key},
    )


def is_user_blocked(user_key: str, blocked_key: str) -> bool:
    """Check if a user has blocked another user."""
    result = client.query(
        "SELECT count() FROM user_blacklist WHERE user_key = %(user_key)s AND blocked_key = %(blocked_key)s",
        {"user_key": user_key, "blocked_key": blocked_key},
    )
    return result.result_rows()[0][0] > 0


def block_user_in_group(user_key: str, group_id: str, blocked_key: str):
    """Block a user from seeing content in a specific group."""
    now = _now()
    client.insert("group_blacklist", [[user_key, group_id, blocked_key, now]])


def unblock_user_in_group(user_key: str, group_id: str, blocked_key: str):
    """Remove a per-group block."""
    client.command(
        "DELETE FROM group_blacklist WHERE user_key = %(user_key)s AND group_id = %(group_id)s AND blocked_key = %(blocked_key)s",
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

    # clickhouse-connect supports named params but IN lists need special handling
    # Use positional placeholders for the IN clause
    in_placeholders = ", ".join([f"%({gid})s" for gid in group_ids])
    params = {member_key: member_key, "coll": collection_name}
    for i, gid in enumerate(group_ids):
        params[f"g{i}"] = gid

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
        "WHERE user_key = p.author_key AND blocked_key = %(member_key)s"
        ") "
        "ORDER BY p.created_at DESC "
        "LIMIT %(limit)s OFFSET %(offset)s",
        {"member_key": member_key, "coll": collection_name, "limit": limit, "offset": offset, **{f"g{i}": gid for i, gid in enumerate(group_ids)}},
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
    in_placeholders = ", ".join(f"%(d{i})s" for i in range(len(doc_ids)))
    params = {"coll": collection_name, **{f"d{i}": did for i, did in enumerate(doc_ids)}}
    result = client.query(
        f"SELECT ref_value, count() FROM documents "
        "WHERE deleted = 0 AND collection_name = %(coll)s AND ref_value IN ({in_placeholders}) "
        "GROUP BY ref_value",
        params,
    )
    return {row[0]: row[1] for row in result.result_rows()}
