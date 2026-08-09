from datetime import datetime

from fastapi import APIRouter

import app.exceptions as exceptions
from app.v3.models import (
    AddMember,
    CreateDoc,
    CreateGroup,
    InviteMember,
    ReadQuery,
    ServiceContract,
    Token,
    UpdateDoc,
    UpdateGroup,
)
from app.v3.services import clickhouse as ch
from app.services.auth import decode_token

router = APIRouter(prefix="/v3")


def _user(token: Token) -> str:
    """Extract the authenticated user from the token."""
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    return decoded.username


# ---------------------------------------------------------------------------
# CRUD with groups
# ---------------------------------------------------------------------------


@router.post("/{user}/{collection}")
async def create_document(user: str, collection: str, token: Token, doc: CreateDoc):
    """Create a document with optional group attachments."""
    author = _user(token)
    if author != user:
        raise exceptions.CRUD

    doc_id = ch._gen_doc_id()
    result = ch.insert_document(
        doc_id=doc_id,
        author_key=author,
        collection_name=collection,
        body=doc.body,
        tags=doc.body.get("tags", []),
    )

    if doc.groups:
        ch.attach_doc_to_groups(doc_id, doc.groups)
        result["groups"] = doc.groups

    return result


@router.patch("/{user}/{collection}")
async def read_documents(user: str, collection: str, token: Token, query: ReadQuery):
    """Read documents filtered by group membership (v3 discover query)."""
    reader = _user(token)

    if "me" in query.groups:
        # Personal read — documents where author = user
        docs = ch.read_documents(
            author_key=user,
            collection_name=collection,
            limit=query.limit,
            offset=query.offset,
        )
    else:
        # Group-filtered read — the core v3 discover query
        docs = ch.read_documents_in_groups(
            group_ids=query.groups,
            member_key=reader,
            collection_name=collection,
            limit=query.limit,
            offset=query.offset,
        )

    return docs


@router.put("/{user}/{collection}/{doc_id}")
async def update_document(user: str, collection: str, doc_id: str, token: Token, doc: UpdateDoc):
    """Update a document (new version + optional group changes)."""
    author = _user(token)
    if author != user:
        raise exceptions.CRUD

    existing = ch.get_document(doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    merged_body = {**existing["body"], **doc.body}
    result = ch.update_document(
        doc_id=doc_id,
        author_key=author,
        collection_name=collection,
        body=merged_body,
        tags=merged_body.get("tags", []),
    )

    if doc.groups is not None:
        ch.replace_doc_groups(doc_id, doc.groups)
        result["groups"] = doc.groups
    else:
        result["groups"] = ch.get_doc_groups(doc_id)

    return result


@router.delete("/{user}/{collection}/{doc_id}")
async def delete_document(user: str, collection: str, doc_id: str, token: Token):
    """Tombstone a document and its group attachments."""
    author = _user(token)
    if author != user:
        raise exceptions.CRUD

    existing = ch.get_document(doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    ch.delete_document(doc_id, author, collection)
    ch.detach_doc_from_groups(doc_id)
    return {"doc_id": doc_id, "status": "deleted"}


# ---------------------------------------------------------------------------
# Group operations
# ---------------------------------------------------------------------------


@router.post("/groups")
async def create_group(token: Token, group: CreateGroup):
    """Create a group with roles and initial members."""
    creator = _user(token)
    group_id = f"{group.name.lower().replace(' ', '-')}"
    # Namespace by creator
    group_id = f"{decode_token(token.token).provider}/groups/{creator}/{group_id}"

    ch.create_group(group_id, group.roles, group.join_policy)

    # Add members (creator gets group management perms)
    for m in group.members:
        ch.add_group_member(group_id, m["member_key"], m.get("role", "member"))

    # Ensure creator has admin role with management perms
    creator_role = None
    for role_def in group.roles:
        if any(m["member_key"] == creator for m in group.members if m.get("role") == role_def["name"]):
            creator_role = role_def
            break

    if not creator_role:
        # Add creator as admin if not in members list
        ch.add_group_member(group_id, creator, "admin")

    return {"group_id": group_id}


@router.get("/groups")
async def get_my_groups(token: Token):
    """Get all groups the user belongs to."""
    user = _user(token)
    return ch.get_user_groups(user)


@router.get("/groups/{group_id}")
async def get_group(group_id: str, token: Token):
    """Get group details."""
    _user(token)
    group = ch.get_group(group_id)
    if not group:
        raise exceptions.ENTRY_NOT_FOUND
    return group


@router.put("/groups/{group_id}")
async def update_group(group_id: str, token: Token, update: UpdateGroup):
    """Update group settings."""
    user = _user(token)
    member = ch.get_group_member(group_id, user)
    if not member:
        raise exceptions.CRUD

    existing = ch.get_group(group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    result = ch.update_group(
        group_id,
        roles=update.roles or existing["roles"],
        join_policy=update.join_policy or existing["join_policy"],
    )
    return result


@router.get("/groups/{group_id}/members")
async def get_group_members(group_id: str, token: Token):
    """Get group members."""
    user = _user(token)
    if not ch.is_group_member(group_id, user):
        raise exceptions.CRUD
    return ch.get_group_members(group_id)


@router.post("/groups/{group_id}/members")
async def add_group_member(group_id: str, token: Token, member: AddMember):
    """Add a member to a group."""
    user = _user(token)
    requester = ch.get_group_member(group_id, user)
    if not requester:
        raise exceptions.CRUD

    existing = ch.get_group(group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    # Check if requester's role has assignRoles
    requester_role_def = None
    for rd in existing["roles"]:
        if rd["name"] == requester["role"]:
            requester_role_def = rd
            break

    if requester_role_def and "assignRoles" not in requester_role_def.get("permissions", []):
        raise exceptions.CRUD

    ch.add_group_member(group_id, member.member_key, member.role)
    return {"group_id": group_id, "member_key": member.member_key, "role": member.role}


@router.delete("/groups/{group_id}/members/{member_key}")
async def remove_group_member(group_id: str, member_key: str, token: Token):
    """Remove a member from a group."""
    user = _user(token)
    requester = ch.get_group_member(group_id, user)
    if not requester:
        raise exceptions.CRUD

    existing = ch.get_group(group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    requester_role_def = None
    for rd in existing["roles"]:
        if rd["name"] == requester["role"]:
            requester_role_def = rd
            break

    if requester_role_def and "revokeRoles" not in requester_role_def.get("permissions", []):
        raise exceptions.CRUD

    ch.remove_group_member(group_id, member_key)
    return {"group_id": group_id, "member_key": member_key, "status": "removed"}


@router.post("/groups/{group_id}/join")
async def join_group(group_id: str, token: Token):
    """Join a group (open or request)."""
    user = _user(token)
    existing = ch.get_group(group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND

    if existing["join_policy"] == "open":
        ch.add_group_member(group_id, user, "member")
        return {"group_id": group_id, "member_key": user, "role": "member"}
    elif existing["join_policy"] == "request":
        ch.create_join_request(group_id, user, "pending")
        return {"group_id": group_id, "status": "pending"}
    else:
        raise exceptions.CRUD


@router.post("/groups/{group_id}/invite")
async def invite_member(group_id: str, token: Token, invite: InviteMember):
    """Invite a member to a group."""
    user = _user(token)
    requester = ch.get_group_member(group_id, user)
    if not requester:
        raise exceptions.CRUD

    ch.create_join_request(group_id, invite.member_key, "invited")
    return {"group_id": group_id, "invited_key": invite.member_key, "status": "invited"}


@router.post("/groups/{group_id}/accept-invite")
async def accept_invite(group_id: str, token: Token):
    """Accept a group invite or join request."""
    user = _user(token)
    result = ch.client.query(
        "SELECT requester_key FROM group_join_requests "
        "WHERE group_id = %(group_id)s AND requester_key = %(user_key)s AND status IN ('pending', 'invited') AND deleted = 0",
        {"group_id": group_id, "user_key": user},
    )
    if not result.result_rows():
        raise exceptions.CRUD
    ch.resolve_join_request(group_id, user, "approved")
    ch.add_group_member(group_id, user, "member")
    return {"group_id": group_id, "role": "member"}


@router.post("/groups/{group_id}/decline-invite")
async def decline_invite(group_id: str, token: Token):
    """Decline a group invite or join request."""
    user = _user(token)
    result = ch.client.query(
        "SELECT requester_key FROM group_join_requests "
        "WHERE group_id = %(group_id)s AND requester_key = %(user_key)s AND status IN ('pending', 'invited') AND deleted = 0",
        {"group_id": group_id, "user_key": user},
    )
    if not result.result_rows():
        raise exceptions.CRUD
    ch.resolve_join_request(group_id, user, "declined")
    return {"group_id": group_id, "status": "declined"}


@router.post("/groups/{group_id}/leave")
async def leave_group(group_id: str, token: Token):
    """Leave a group."""
    user = _user(token)
    ch.remove_group_member(group_id, user)
    return {"group_id": group_id, "member_key": user, "status": "left"}


# ---------------------------------------------------------------------------
# Service contracts (simplified v3)
# ---------------------------------------------------------------------------


@router.post("/service-contracts")
async def add_service_contract(token: Token, contract: ServiceContract):
    """Add a service contract (app trust)."""
    user = _user(token)
    result = ch.add_service_contract(user, contract.service_name, contract.allowed_origin)
    return result


@router.get("/service-contracts")
async def get_service_contracts(token: Token):
    """Get active service contracts."""
    user = _user(token)
    return ch.get_service_contracts(user)


@router.delete("/service-contracts")
async def revoke_service_contract(token: Token, allowed_origin: str | None = None):
    """Revoke service contracts (all or by origin)."""
    user = _user(token)
    if allowed_origin:
        ch.revoke_service_contract(user, allowed_origin)
    else:
        ch.revoke_all_service_contracts(user)
    return {"status": "revoked"}


# ---------------------------------------------------------------------------
# Blocking
# ---------------------------------------------------------------------------


@router.post("/block/{blocked_key}")
async def block_user(blocked_key: str, token: Token):
    """Block a user (user-wide)."""
    user = _user(token)
    ch.block_user(user, blocked_key)
    return {"user_key": user, "blocked_key": blocked_key}


@router.delete("/block/{blocked_key}")
async def unblock_user(blocked_key: str, token: Token):
    """Unblock a user."""
    user = _user(token)
    ch.unblock_user(user, blocked_key)
    return {"user_key": user, "blocked_key": blocked_key}


# ---------------------------------------------------------------------------
# Sharing toggle
# ---------------------------------------------------------------------------


@router.put("/sharing/{group_id}")
async def set_sharing(group_id: str, token: Token, enabled: bool = True):
    """Set sharing toggle for a group."""
    user = _user(token)
    ch.set_user_group_sharing(user, group_id, enabled)
    return {"user_key": user, "group_id": group_id, "sharing_enabled": enabled}
