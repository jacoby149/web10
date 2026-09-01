from types import SimpleNamespace

from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
from app.services.auth import check_admin, decode_token
from app.v3.endpoints.auth_helper import user as _user
from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.models import (
    AcceptInvite,
    AddGroupMember,
    BlockUserInGroup,
    CreateGroup,
    DeclineInvite,
    DeleteGroup,
    GetGroup,
    HideDoc,
    InviteMember,
    JoinGroup,
    JoinRequestOp,
    LeaveGroup,
    ListGroupMembers,
    ListHiddenDocs,
    ListJoinRequests,
    RemoveGroupMember,
    SetSharing,
    UnhideDoc,
    UpdateGroup,
)
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["group-contracts"])


def _require_group_permission(group_id: str, user: str, permission: str):
    """Check that the user's effective role grants the management `permission`
    (D58 — management ops live under the reserved 'group' key; the legacy flat
    shape is checked via the '*' wildcard during the transition). Raises CRUD
    if not granted, ENTRY_NOT_FOUND if the group doesn't exist."""
    if not ch.get_group(group_id):
        raise exceptions.ENTRY_NOT_FOUND
    if not ch.has_mgmt_permission(group_id, user, permission):
        raise exceptions.CRUD


def _require_moderation(group_id: str, user: str, token: str, service: str):
    """Gate for hiding/unhiding content from a group's discover.

    A member whose role grants `hideAll` on the doc's service can moderate that
    content (D58: `hideAll` is a content op, scoped to the service key, not the
    structural 'group' key). The node admin can moderate ANY group — this is how
    the public board (which has no moderator role) gets moderated.
    """
    if ch.can_moderate_service(group_id, user, service):
        return
    check_admin(Token(token=token))


def _require_moderation_any(group_id: str, user: str, token: str):
    """Gate for listing hidden docs (a moderation read, no specific doc/service).

    A member whose role grants `hideAll` on any service can list the group's
    hidden docs. The node admin can moderate ANY group.
    """
    if ch.can_moderate_group(group_id, user):
        return
    check_admin(Token(token=token))


def _parse_group_id(group_id: str) -> tuple[str, str]:
    """Extract (owner, slug) from a group_id.

    Two shapes: created groups are ``{provider}/groups/users/{creator}/{slug}``
    (the creator is the owner); the well-known groups (discover board, DMs) are
    ``{provider}/groups/{owner}/{slug}``. The slug is the fallback display name
    (when a group has no identity record).
    """
    parts = group_id.split("/")
    if "groups" in parts:
        idx = parts.index("groups")
        # {provider}/groups/users/{creator}/{slug} — created groups
        if idx + 3 < len(parts) and parts[idx + 1] == "users":
            return parts[idx + 2], parts[idx + 3]
        # {provider}/groups/{owner}/{slug} — discover board, DM groups
        if idx + 2 < len(parts):
            return parts[idx + 1], parts[idx + 2]
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return "", group_id


def _permission_summary(roles: list[dict]) -> str:
    """A short digest of what a baseline member can do, for the directory card.

    Uses the least-privileged role (the last entry, by convention — the role a
    new member gets), so the card describes the member experience, not the
    owner's.
    """
    if not roles:
        return ""
    base = roles[-1]
    # D58: handle both the per-service map shape {service: [ops]} and the
    # legacy flat list — flatten to a deduped op digest either way.
    perms = base.get("permissions")
    if isinstance(perms, dict):
        ops = [op for svc_ops in perms.values() for op in svc_ops]
    else:
        ops = list(perms or [])
    seen = set()
    uniq = [o for o in ops if not (o in seen or seen.add(o))]
    return f"{base.get('name', 'member')}: {', '.join(uniq)}" if uniq else base.get("name", "member")


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
        ch.create_group(group_id, data.roles, data.join_policy, data.discoverable)

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

    # discoverable follows the same gate as the rest of the update (a member);
    # None leaves it unchanged.
    discoverable = data.discoverable if data.discoverable is not None else existing["discoverable"]
    result = ch.update_group(
        data.group_id,
        roles=data.roles or existing["roles"],
        join_policy=data.join_policy or existing["join_policy"],
        discoverable=discoverable,
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
    _require_group_permission(data.group_id, user, "assignRoles")
    ch.add_group_member(data.group_id, data.member_key, data.role)
    return {"group_id": data.group_id, "member_key": data.member_key, "role": data.role}


@router.post("/members/remove")
def remove_group_member(data: RemoveGroupMember):
    """Remove a member from a group."""
    user = _user(data)
    _require_group_permission(data.group_id, user, "revokeRoles")
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
    _require_group_permission(data.group_id, user, "assignRoles")
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


# ---------------------------------------------------------------------------
# The group directory + detail (D53). The directory is the minimal, canonical,
# anon-browsable list of discoverable groups. The detail is the flexible,
# principal-based read of a group by ID (unlisted-model: reachable for any
# existing group; posts gated by the reader's membership).
# ---------------------------------------------------------------------------


@router.get("/directory")
def list_directory(limit: int = 50, offset: int = 0):
    """The public group directory: the minimal list of discoverable groups.

    Anon (no token needed). Returns id, name (the slug), owner, join policy,
    member count (platform-computed, unhackable), and a permission summary. No
    face, no posts — the group's *face* (rich name, banner, tags) is app data
    in an app-named identity service (D60); a surface fetches it separately and
    composes it with this list. A view over group_contracts ⋈ group_members.
    """
    groups = ch.list_discoverable_groups(limit=limit, offset=offset)
    group_ids = [g["group_id"] for g in groups]
    counts = ch._get_group_member_counts(group_ids)
    out = []
    for g in groups:
        gid = g["group_id"]
        owner, slug = _parse_group_id(gid)
        out.append(
            {
                "group_id": gid,
                "name": slug,
                "owner": owner,
                "slug": slug,
                "join_policy": g["join_policy"],
                "member_count": counts.get(gid, 0),
                "permission_summary": _permission_summary(g["roles"]),
            }
        )
    return {"groups": out, "limit": limit, "offset": offset}


@router.get("/detail")
def group_detail(group_id: str, token: str | None = None):
    """The flexible group detail (by ID). Unlisted-model (D53).

    Principal-based: reads as the token's user, or `anon` with no token. Only a
    non-existent group 404s — a non-discoverable group is still reachable (like
    an unlisted video). Metadata (contract + member count) is always returned;
    posts are returned only if the reader is a member (I3), else a "join to
    view" state. The group's *face* (rich name, banner, tags) is app data in an
    app-named identity service (D60) — the platform detail does not render it;
    a surface fetches the face from the app's service and composes it here.
    """
    principal = user_or_anon(SimpleNamespace(token=token or ""))
    group = ch.get_group(group_id)
    if not group:
        raise exceptions.ENTRY_NOT_FOUND  # only a non-existent group 404s

    counts = ch._get_group_member_counts([group_id])
    owner, slug = _parse_group_id(group_id)
    is_member = ch.is_group_member(group_id, principal)

    out = {
        "group_id": group_id,
        "name": slug,
        "owner": owner,
        "slug": slug,
        "join_policy": group["join_policy"],
        "discoverable": group["discoverable"],
        "member_count": counts.get(group_id, 0),
        "roles": group["roles"],
        "permission_summary": _permission_summary(group["roles"]),
        "is_member": is_member,
        "posts_state": "ok" if is_member else "join_to_view",
        "posts": [],
    }
    if is_member:
        out["posts"] = ch.read_documents_in_groups(
            group_ids=[group_id], member_key=principal, service="posts", limit=20
        )
    return out


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


# ---------------------------------------------------------------------------
# Moderation — hide content from a group's discover (KB: groups/overview.md
# "Moderation"). Board-level takedown: the author's own copy is untouched and
# the doc is restorable. Gated by the `hideAll` role permission OR the node
# admin (the public board has no moderator role).
# ---------------------------------------------------------------------------


@router.post("/hide")
def hide_doc(data: HideDoc):
    """Hide a document from a group's discover (moderator or node admin)."""
    user = _user(data)
    doc = ch.get_document_any_author(data.doc_id)
    if not doc:
        raise exceptions.ENTRY_NOT_FOUND
    _require_moderation(data.group_id, user, data.token, doc["service"])
    ch.hide_doc_from_group(data.group_id, data.doc_id, user)
    return {"group_id": data.group_id, "doc_id": data.doc_id, "status": "hidden"}


@router.post("/unhide")
def unhide_doc(data: UnhideDoc):
    """Restore a previously hidden document to a group's discover."""
    user = _user(data)
    doc = ch.get_document_any_author(data.doc_id)
    if not doc:
        raise exceptions.ENTRY_NOT_FOUND
    _require_moderation(data.group_id, user, data.token, doc["service"])
    ch.unhide_doc_from_group(data.group_id, data.doc_id)
    return {"group_id": data.group_id, "doc_id": data.doc_id, "status": "restored"}


@router.post("/hidden")
def list_hidden_docs(data: ListHiddenDocs):
    """List the documents currently hidden from a group's discover."""
    user = _user(data)
    _require_moderation_any(data.group_id, user, data.token)
    return {"hidden": ch.get_hidden_docs(data.group_id)}
