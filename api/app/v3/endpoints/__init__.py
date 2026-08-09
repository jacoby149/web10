from fastapi import APIRouter

import app.exceptions as exceptions
from app.v3.models import Token
from app.v3.services import clickhouse as ch
from app.services.auth import decode_token

router = APIRouter(prefix="/v3")


def _user(data: Token) -> str:
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    return decoded.username


# ---------------------------------------------------------------------------
# CRUD with groups
# ---------------------------------------------------------------------------


@router.post("/create")
async def create_document(data: Token):
    """Create a document with optional group attachments."""
    author = _user(data)
    if data.body is None:
        raise exceptions.CRUD

    doc_id = ch._gen_doc_id()
    result = ch.insert_document(
        doc_id=doc_id,
        author_key=author,
        collection_name=data.collection or "",
        body=data.body,
        tags=data.body.get("tags", []),
    )

    if data.groups:
        ch.attach_doc_to_groups(doc_id, data.groups)
        result["groups"] = data.groups

    return result


@router.post("/read")
async def read_documents(data: Token):
    """Read documents filtered by group membership."""
    reader = _user(data)
    if not data.groups:
        raise exceptions.CRUD

    if "me" in data.groups:
        docs = ch.read_documents(
            author_key=reader,
            collection_name=data.collection or "",
            limit=data.limit,
            offset=data.offset,
        )
    else:
        docs = ch.read_documents_in_groups(
            group_ids=data.groups,
            member_key=reader,
            collection_name=data.collection or "",
            limit=data.limit,
            offset=data.offset,
        )

    return docs


@router.post("/update")
async def update_document(data: Token):
    """Update a document (new version + optional group changes)."""
    author = _user(data)
    if data.body is None or not data.doc_id:
        raise exceptions.CRUD

    existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    merged_body = {**existing["body"], **data.body}
    result = ch.update_document(
        doc_id=data.doc_id,
        author_key=author,
        collection_name=existing["collection_name"],
        body=merged_body,
        tags=merged_body.get("tags", []),
    )

    if data.groups is not None:
        ch.replace_doc_groups(data.doc_id, data.groups)
        result["groups"] = data.groups
    else:
        result["groups"] = ch.get_doc_groups(data.doc_id)

    return result


@router.post("/delete")
async def delete_document(data: Token):
    """Tombstone a document and its group attachments."""
    author = _user(data)
    if not data.doc_id:
        raise exceptions.CRUD

    existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    ch.delete_document(data.doc_id, author, existing["collection_name"])
    ch.detach_doc_from_groups(data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}


# ---------------------------------------------------------------------------
# Group operations
# ---------------------------------------------------------------------------


@router.post("/groups/create")
async def create_group(data: Token):
    """Create a group with roles and initial members."""
    creator = _user(data)
    if not data.name or not data.roles or not data.members:
        raise exceptions.CRUD

    decoded = decode_token(data.token)
    group_id = f"{data.name.lower().replace(' ', '-')}"
    group_id = f"{decoded.provider}/groups/{creator}/{group_id}"
    join_policy = data.join_policy or "open"

    ch.create_group(group_id, data.roles, join_policy)

    for m in data.members:
        ch.add_group_member(group_id, m["member_key"], m.get("role", "member"))

    creator_role = None
    for role_def in data.roles:
        if any(m["member_key"] == creator for m in data.members if m.get("role") == role_def["name"]):
            creator_role = role_def
            break

    if not creator_role:
        ch.add_group_member(group_id, creator, "admin")

    return {"group_id": group_id}


@router.post("/groups/list")
async def get_my_groups(data: Token):
    """Get all groups the user belongs to."""
    user = _user(data)
    return ch.get_user_groups(user)


@router.post("/groups/get")
async def get_group(data: Token):
    """Get group details."""
    _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    group = ch.get_group(data.group_id)
    if not group:
        raise exceptions.ENTRY_NOT_FOUND
    return group


@router.post("/groups/update")
async def update_group(data: Token):
    """Update group settings."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    member = ch.get_group_member(data.group_id, user)
    if not member:
        raise exceptions.CRUD

    existing = ch.get_group(data.group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    result = ch.update_group(
        data.group_id,
        roles=data.roles or existing["roles"],
        join_policy=data.join_policy or existing["join_policy"],
    )
    return result


@router.post("/groups/members/list")
async def get_group_members(data: Token):
    """Get group members."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    if not ch.is_group_member(data.group_id, user):
        raise exceptions.CRUD
    return ch.get_group_members(data.group_id)


@router.post("/groups/members/add")
async def add_group_member(data: Token):
    """Add a member to a group."""
    user = _user(data)
    if not data.group_id or not data.member_key or not data.role:
        raise exceptions.CRUD
    requester = ch.get_group_member(data.group_id, user)
    if not requester:
        raise exceptions.CRUD

    existing = ch.get_group(data.group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    requester_role_def = None
    for rd in existing["roles"]:
        if rd["name"] == requester["role"]:
            requester_role_def = rd
            break

    if requester_role_def and "assignRoles" not in requester_role_def.get("permissions", []):
        raise exceptions.CRUD

    ch.add_group_member(data.group_id, data.member_key, data.role)
    return {"group_id": data.group_id, "member_key": data.member_key, "role": data.role}


@router.post("/groups/members/remove")
async def remove_group_member(data: Token):
    """Remove a member from a group."""
    user = _user(data)
    if not data.group_id or not data.member_key:
        raise exceptions.CRUD
    requester = ch.get_group_member(data.group_id, user)
    if not requester:
        raise exceptions.CRUD

    existing = ch.get_group(data.group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    requester_role_def = None
    for rd in existing["roles"]:
        if rd["name"] == requester["role"]:
            requester_role_def = rd
            break

    if requester_role_def and "revokeRoles" not in requester_role_def.get("permissions", []):
        raise exceptions.CRUD

    ch.remove_group_member(data.group_id, data.member_key)
    return {"group_id": data.group_id, "member_key": data.member_key, "status": "removed"}


@router.post("/groups/join")
async def join_group(data: Token):
    """Join a group (open or request)."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    existing = ch.get_group(data.group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    if existing["join_policy"] == "open":
        ch.add_group_member(data.group_id, user, "member")
        return {"group_id": data.group_id, "member_key": user, "role": "member"}
    elif existing["join_policy"] == "request":
        ch.create_join_request(data.group_id, user, "pending")
        return {"group_id": data.group_id, "status": "pending"}
    else:
        raise exceptions.CRUD


@router.post("/groups/invite")
async def invite_member(data: Token):
    """Invite a member to a group."""
    user = _user(data)
    if not data.group_id or not data.member_key or not data.role:
        raise exceptions.CRUD
    requester = ch.get_group_member(data.group_id, user)
    if not requester:
        raise exceptions.CRUD

    ch.create_join_request(data.group_id, data.member_key, "invited")
    return {"group_id": data.group_id, "invited_key": data.member_key, "status": "invited"}


@router.post("/groups/accept-invite")
async def accept_invite(data: Token):
    """Accept a group invite or join request."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, user, "approved")
    ch.add_group_member(data.group_id, user, "member")
    return {"group_id": data.group_id, "role": "member"}


@router.post("/groups/decline-invite")
async def decline_invite(data: Token):
    """Decline a group invite or join request."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, user, "declined")
    return {"group_id": data.group_id, "status": "declined"}


@router.post("/groups/leave")
async def leave_group(data: Token):
    """Leave a group."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    ch.remove_group_member(data.group_id, user)
    return {"group_id": data.group_id, "member_key": user, "status": "left"}


# ---------------------------------------------------------------------------
# Service contracts (simplified v3)
# ---------------------------------------------------------------------------


@router.post("/service-contracts/add")
async def add_service_contract(data: Token):
    """Add a service contract (app trust)."""
    user = _user(data)
    if not data.service_name or not data.allowed_origin:
        raise exceptions.CRUD
    result = ch.add_service_contract(user, data.service_name, data.allowed_origin)
    return result


@router.post("/service-contracts/list")
async def get_service_contracts(data: Token):
    """Get active service contracts."""
    user = _user(data)
    return ch.get_service_contracts(user)


@router.post("/service-contracts/revoke")
async def revoke_service_contract(data: Token):
    """Revoke service contracts (all or by origin)."""
    user = _user(data)
    if data.allowed_origin:
        ch.revoke_service_contract(user, data.allowed_origin)
    else:
        ch.revoke_all_service_contracts(user)
    return {"status": "revoked"}


# ---------------------------------------------------------------------------
# Blocking
# ---------------------------------------------------------------------------


@router.post("/block")
async def block_user(data: Token):
    """Block a user (user-wide)."""
    user = _user(data)
    if not data.blocked_key:
        raise exceptions.CRUD
    ch.block_user(user, data.blocked_key)
    return {"user_key": user, "blocked_key": data.blocked_key}


@router.post("/unblock")
async def unblock_user(data: Token):
    """Unblock a user."""
    user = _user(data)
    if not data.blocked_key:
        raise exceptions.CRUD
    ch.unblock_user(user, data.blocked_key)
    return {"user_key": user, "blocked_key": data.blocked_key}


# ---------------------------------------------------------------------------
# Sharing toggle
# ---------------------------------------------------------------------------


@router.post("/sharing/set")
async def set_sharing(data: Token):
    """Set sharing toggle for a group."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    ch.set_user_group_sharing(user, data.group_id, data.enabled)
    return {"user_key": user, "group_id": data.group_id, "sharing_enabled": data.enabled}
