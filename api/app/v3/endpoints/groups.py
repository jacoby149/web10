from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import decode_token
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import (
    AcceptInvite,
    AddGroupMember,
    BlockUserInGroup,
    CreateGroup,
    DeclineInvite,
    DeleteGroup,
    GetGroup,
    InviteMember,
    JoinGroup,
    JoinRequestOp,
    LeaveGroup,
    ListGroupMembers,
    ListJoinRequests,
    RemoveGroupMember,
    SetSharing,
    UpdateGroup,
)
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["group-contracts"])


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
def create_group(data: CreateGroup):
    """Create a group with roles and initial members.

    Idempotent: re-creating an existing group does not append duplicate
    group_contracts or group_members rows. Demo apps re-send the
    group-creation contract on every login (the return run), so without this
    guard each login appends a second row for the same group_id.
    """
    creator = _user(data)
    decoded = decode_token(data.token, private_key=True)
    group_id = f"{data.name.lower().replace(' ', '-')}"
    group_id = f"{decoded.provider}/groups/users/{creator}/{group_id}"

    if not ch.get_group(group_id):
        ch.create_group(group_id, data.roles, data.join_policy)

    for m in data.members:
        if not ch.get_group_member(group_id, m["member_key"]):
            ch.add_group_member(group_id, m["member_key"], m.get("role", "member"))

    creator_role = None
    for role_def in data.roles:
        if any(m["member_key"] == creator for m in data.members if m.get("role") == role_def["name"]):
            creator_role = role_def
            break

    if not creator_role and not ch.get_group_member(group_id, creator):
        ch.add_group_member(group_id, creator, "admin")

    return {"group_id": group_id}


@router.post("/list")
def get_my_groups(data: TokenOnly):
    """Get all groups the user belongs to."""
    user = _user(data)
    return ch.get_user_groups(user)


@router.post("/get")
def get_group(data: GetGroup):
    """Get group details."""
    _user(data)
    group = ch.get_group(data.group_id)
    if not group:
        raise exceptions.ENTRY_NOT_FOUND
    return group


@router.post("/update")
def update_group(data: UpdateGroup):
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
def get_group_members(data: ListGroupMembers):
    """Get group members."""
    user = _user(data)
    if not ch.is_group_member(data.group_id, user):
        raise exceptions.CRUD
    return ch.get_group_members(data.group_id)


@router.post("/members/add")
def add_group_member(data: AddGroupMember):
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
def remove_group_member(data: RemoveGroupMember):
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
def join_group(data: JoinGroup):
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
def invite_member(data: InviteMember):
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
def accept_invite(data: AcceptInvite):
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
def decline_invite(data: DeclineInvite):
    """Decline a group invite or join request."""
    user = _user(data)
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, user, "declined")
    return {"group_id": data.group_id, "status": "declined"}


@router.post("/leave")
def leave_group(data: LeaveGroup):
    """Leave a group."""
    user = _user(data)
    ch.remove_group_member(data.group_id, user)
    return {"group_id": data.group_id, "member_key": user, "status": "left"}


@router.post("/requests/join/list")
def list_join_requests(data: ListJoinRequests):
    """List pending join/invite requests for a group (owner/moderator only)."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "assignRoles")
    return ch.get_pending_requests(data.group_id)


@router.post("/requests/join/approve")
def approve_join_request(data: JoinRequestOp):
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
def deny_join_request(data: JoinRequestOp):
    """Deny a pending join or invite request (owner/moderator only)."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "assignRoles")
    if not ch.has_pending_or_invited_request(data.group_id, data.requester_key):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, data.requester_key, "denied")
    return {"group_id": data.group_id, "requester_key": data.requester_key, "status": "denied"}


@router.post("/manages")
def get_groups_manages(data: TokenOnly):
    """Get groups where the user has management permissions."""
    user = _user(data)
    return ch.get_groups_manages(user)


@router.post("/block")
def block_user_in_group(data: BlockUserInGroup):
    """Block a user from seeing your content in this group."""
    user = _user(data)
    ch.block_user_in_group(user, data.group_id, data.blocked_key)
    return {"user_key": user, "group_id": data.group_id, "blocked_key": data.blocked_key}


@router.post("/unblock")
def unblock_user_in_group(data: BlockUserInGroup):
    """Unblock a user in a group."""
    user = _user(data)
    ch.unblock_user_in_group(user, data.group_id, data.blocked_key)
    return {"user_key": user, "group_id": data.group_id, "blocked_key": data.blocked_key}


@router.post("/sharing/set")
def set_sharing(data: SetSharing):
    """Set sharing toggle for a group."""
    user = _user(data)
    ch.set_user_group_sharing(user, data.group_id, data.enabled)
    return {"user_key": user, "group_id": data.group_id, "sharing_enabled": data.enabled}


@router.post("/delete")
def delete_group(data: DeleteGroup):
    """Delete a group (requires deleteGroup permission)."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "deleteGroup")
    ch.delete_group(data.group_id)
    return {"group_id": data.group_id, "status": "deleted"}
