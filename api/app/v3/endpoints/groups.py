from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import decode_token
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import (
    AcceptInvite,
    AddGroupMember,
    CreateGroup,
    DeclineInvite,
    GetGroup,
    InviteMember,
    JoinGroup,
    JoinRequestOp,
    LeaveGroup,
    ListGroupMembers,
    ListJoinRequests,
    RemoveGroupMember,
    UpdateGroup,
)
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["groups"])


def _require_group_permission(group_id: str, user: str, permission: str):
    """Check that the user is a group member with the given permission. Raises CRUD if not."""
    member = ch.get_group_member(group_id, user)
    if not member:
        raise exceptions.CRUD
    existing = ch.get_group(group_id)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND
    role_def = None
    for rd in existing["roles"]:
        if rd["name"] == member["role"]:
            role_def = rd
            break
    if not role_def or permission not in role_def.get("permissions", []):
        raise exceptions.CRUD


@router.post("/create")
async def create_group(data: CreateGroup):
    """Create a group with roles and initial members."""
    creator = _user(data)
    decoded = decode_token(data.token)
    group_id = f"{data.name.lower().replace(' ', '-')}"
    group_id = f"{decoded.provider}/groups/users/{creator}/{group_id}"

    ch.create_group(group_id, data.roles, data.join_policy)

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


@router.post("/list")
async def get_my_groups(data: TokenOnly):
    """Get all groups the user belongs to."""
    user = _user(data)
    return ch.get_user_groups(user)


@router.post("/get")
async def get_group(data: GetGroup):
    """Get group details."""
    _user(data)
    group = ch.get_group(data.group_id)
    if not group:
        raise exceptions.ENTRY_NOT_FOUND
    return group


@router.post("/update")
async def update_group(data: UpdateGroup):
    """Update group settings."""
    user = _user(data)
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


@router.post("/members/list")
async def get_group_members(data: ListGroupMembers):
    """Get group members."""
    user = _user(data)
    if not ch.is_group_member(data.group_id, user):
        raise exceptions.CRUD
    return ch.get_group_members(data.group_id)


@router.post("/members/add")
async def add_group_member(data: AddGroupMember):
    """Add a member to a group."""
    user = _user(data)
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


@router.post("/members/remove")
async def remove_group_member(data: RemoveGroupMember):
    """Remove a member from a group."""
    user = _user(data)
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


@router.post("/join")
async def join_group(data: JoinGroup):
    """Join a group (open or request)."""
    user = _user(data)
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


@router.post("/invite")
async def invite_member(data: InviteMember):
    """Invite a member to a group."""
    user = _user(data)
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

    ch.create_join_request(data.group_id, data.member_key, "invited", data.role)
    return {"group_id": data.group_id, "invited_key": data.member_key, "status": "invited"}


@router.post("/accept-invite")
async def accept_invite(data: AcceptInvite):
    """Accept a group invite or join request."""
    user = _user(data)
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    pending = ch.get_pending_requests(data.group_id)
    invite = next((r for r in pending if r["requester_key"] == user), None)
    role = invite.get("role", "member") if invite and invite.get("role") else "member"
    ch.resolve_join_request(data.group_id, user, "approved")
    ch.add_group_member(data.group_id, user, role)
    return {"group_id": data.group_id, "role": role}


@router.post("/decline-invite")
async def decline_invite(data: DeclineInvite):
    """Decline a group invite or join request."""
    user = _user(data)
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, user, "declined")
    return {"group_id": data.group_id, "status": "declined"}


@router.post("/leave")
async def leave_group(data: LeaveGroup):
    """Leave a group."""
    user = _user(data)
    ch.remove_group_member(data.group_id, user)
    return {"group_id": data.group_id, "member_key": user, "status": "left"}


@router.post("/requests/join/list")
async def list_join_requests(data: ListJoinRequests):
    """List pending join/invite requests for a group (owner/moderator only)."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "assignRoles")
    return ch.get_pending_requests(data.group_id)


@router.post("/requests/join/approve")
async def approve_join_request(data: JoinRequestOp):
    """Approve a pending join or invite request (owner/moderator only)."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "assignRoles")
    if not ch.has_pending_or_invited_request(data.group_id, data.requester_key):
        raise exceptions.CRUD
    pending = ch.get_pending_requests(data.group_id)
    invite = next((r for r in pending if r["requester_key"] == data.requester_key), None)
    role = invite.get("role", "member") if invite and invite.get("role") else "member"
    ch.resolve_join_request(data.group_id, data.requester_key, "approved")
    ch.add_group_member(data.group_id, data.requester_key, role)
    return {"group_id": data.group_id, "requester_key": data.requester_key, "status": "approved", "role": role}


@router.post("/requests/join/deny")
async def deny_join_request(data: JoinRequestOp):
    """Deny a pending join or invite request (owner/moderator only)."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "assignRoles")
    if not ch.has_pending_or_invited_request(data.group_id, data.requester_key):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, data.requester_key, "denied")
    return {"group_id": data.group_id, "requester_key": data.requester_key, "status": "denied"}


@router.post("/manages")
async def get_groups_manages(data: TokenOnly):
    """Get groups where the user has management permissions."""
    user = _user(data)
    return ch.get_groups_manages(user)
