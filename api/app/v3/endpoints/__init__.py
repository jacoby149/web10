from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import decode_token, get_password_hash, verify_password
from app.v3.models import Token
from app.v3.services import clickhouse as ch

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


@router.post("/create", tags=["documents"])
async def create_document(data: Token):
    """Create a document with optional group attachments."""
    author = _user(data)
    if data.body is None:
        raise exceptions.CRUD

    result = ch.insert_document(
        author_key=author,
        collection_name=data.collection or "",
        body=data.body,
        tags=data.body.get("tags", []),
    )
    doc_id = result["doc_id"]

    if data.groups:
        ch.attach_doc_to_groups(doc_id, data.groups)
        result["groups"] = data.groups

    return result


@router.post("/read", tags=["documents"])
async def read_documents(data: Token):
    """Read documents filtered by group membership."""
    reader = _user(data)
    if not data.groups:
        raise exceptions.CRUD

    # "me" is shorthand for all groups the user belongs to
    if "me" in data.groups:
        user_groups = ch.get_user_groups(reader)
        group_ids = [g["group_id"] for g in user_groups]
    else:
        group_ids = data.groups

    docs = ch.read_documents_in_groups(
        group_ids=group_ids,
        member_key=reader,
        collection_name=data.collection or "",
        limit=data.limit,
        offset=data.offset,
    )

    return docs


@router.post("/update", tags=["documents"])
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


@router.post("/delete", tags=["documents"])
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


@router.post("/read-by-id", tags=["documents"])
async def read_document_by_id(data: Token):
    """Read a single document by doc_id with group permission check."""
    reader = _user(data)
    if not data.doc_id or not data.collection:
        raise exceptions.CRUD
    doc = ch.read_document_by_id(data.doc_id, reader, data.collection)
    if not doc:
        raise exceptions.ENTRY_NOT_FOUND
    return ch.resolve_media_urls_in_docs([doc])[0]


# ---------------------------------------------------------------------------
# Group operations
# ---------------------------------------------------------------------------


@router.post("/groups/create", tags=["groups"])
async def create_group(data: Token):
    """Create a group with roles and initial members."""
    creator = _user(data)
    if not data.name or not data.roles or not data.members:
        raise exceptions.CRUD

    decoded = decode_token(data.token)
    group_id = f"{data.name.lower().replace(' ', '-')}"
    group_id = f"{decoded.provider}/groups/users/{creator}/{group_id}"
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


@router.post("/groups/list", tags=["groups"])
async def get_my_groups(data: Token):
    """Get all groups the user belongs to."""
    user = _user(data)
    return ch.get_user_groups(user)


@router.post("/groups/get", tags=["groups"])
async def get_group(data: Token):
    """Get group details."""
    _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    group = ch.get_group(data.group_id)
    if not group:
        raise exceptions.ENTRY_NOT_FOUND
    return group


@router.post("/groups/update", tags=["groups"])
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


@router.post("/groups/members/list", tags=["groups"])
async def get_group_members(data: Token):
    """Get group members."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    if not ch.is_group_member(data.group_id, user):
        raise exceptions.CRUD
    return ch.get_group_members(data.group_id)


@router.post("/groups/members/add", tags=["groups"])
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


@router.post("/groups/members/remove", tags=["groups"])
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


@router.post("/groups/join", tags=["groups"])
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


@router.post("/groups/invite", tags=["groups"])
async def invite_member(data: Token):
    """Invite a member to a group."""
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

    ch.create_join_request(data.group_id, data.member_key, "invited", data.role)
    return {"group_id": data.group_id, "invited_key": data.member_key, "status": "invited"}


@router.post("/groups/accept-invite", tags=["groups"])
async def accept_invite(data: Token):
    """Accept a group invite or join request."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    pending = ch.get_pending_requests(data.group_id)
    invite = next((r for r in pending if r["requester_key"] == user), None)
    role = invite.get("role", "member") if invite and invite.get("role") else "member"
    ch.resolve_join_request(data.group_id, user, "approved")
    ch.add_group_member(data.group_id, user, role)
    return {"group_id": data.group_id, "role": role}


@router.post("/groups/decline-invite", tags=["groups"])
async def decline_invite(data: Token):
    """Decline a group invite or join request."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    if not ch.has_pending_or_invited_request(data.group_id, user):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, user, "declined")
    return {"group_id": data.group_id, "status": "declined"}


@router.post("/groups/leave", tags=["groups"])
async def leave_group(data: Token):
    """Leave a group."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    ch.remove_group_member(data.group_id, user)
    return {"group_id": data.group_id, "member_key": user, "status": "left"}


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


@router.post("/groups/requests/join/list", tags=["groups"])
async def list_join_requests(data: Token):
    """List pending join/invite requests for a group (owner/moderator only)."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    _require_group_permission(data.group_id, user, "assignRoles")
    return ch.get_pending_requests(data.group_id)


@router.post("/groups/requests/join/approve", tags=["groups"])
async def approve_join_request(data: Token):
    """Approve a pending join or invite request (owner/moderator only)."""
    user = _user(data)
    if not data.group_id or not data.requester_key:
        raise exceptions.CRUD
    _require_group_permission(data.group_id, user, "assignRoles")
    if not ch.has_pending_or_invited_request(data.group_id, data.requester_key):
        raise exceptions.CRUD
    pending = ch.get_pending_requests(data.group_id)
    invite = next((r for r in pending if r["requester_key"] == data.requester_key), None)
    role = invite.get("role", "member") if invite and invite.get("role") else "member"
    ch.resolve_join_request(data.group_id, data.requester_key, "approved")
    ch.add_group_member(data.group_id, data.requester_key, role)
    return {"group_id": data.group_id, "requester_key": data.requester_key, "status": "approved", "role": role}


@router.post("/groups/requests/join/deny", tags=["groups"])
async def deny_join_request(data: Token):
    """Deny a pending join or invite request (owner/moderator only)."""
    user = _user(data)
    if not data.group_id or not data.requester_key:
        raise exceptions.CRUD
    _require_group_permission(data.group_id, user, "assignRoles")
    if not ch.has_pending_or_invited_request(data.group_id, data.requester_key):
        raise exceptions.CRUD
    ch.resolve_join_request(data.group_id, data.requester_key, "denied")
    return {"group_id": data.group_id, "requester_key": data.requester_key, "status": "denied"}


@router.post("/groups/manages", tags=["groups"])
async def get_groups_manages(data: Token):
    """Get groups where the user has management permissions."""
    user = _user(data)
    return ch.get_groups_manages(user)


@router.post("/block", tags=["groups"])
async def block_user(data: Token):
    """Block a user (user-wide)."""
    user = _user(data)
    if not data.blocked_key:
        raise exceptions.CRUD
    ch.block_user(user, data.blocked_key)
    return {"user_key": user, "blocked_key": data.blocked_key}


@router.post("/unblock", tags=["groups"])
async def unblock_user(data: Token):
    """Unblock a user."""
    user = _user(data)
    if not data.blocked_key:
        raise exceptions.CRUD
    ch.unblock_user(user, data.blocked_key)
    return {"user_key": user, "blocked_key": data.blocked_key}


@router.post("/block-in-group", tags=["groups"])
async def block_user_in_group(data: Token):
    """Block a user from seeing your content in a specific group."""
    user = _user(data)
    if not data.blocked_key or not data.group_id:
        raise exceptions.CRUD
    ch.block_user_in_group(user, data.group_id, data.blocked_key)
    return {"user_key": user, "group_id": data.group_id, "blocked_key": data.blocked_key}


@router.post("/unblock-in-group", tags=["groups"])
async def unblock_user_in_group(data: Token):
    """Unblock a user in a group."""
    user = _user(data)
    if not data.blocked_key or not data.group_id:
        raise exceptions.CRUD
    ch.unblock_user_in_group(user, data.group_id, data.blocked_key)
    return {"user_key": user, "group_id": data.group_id, "blocked_key": data.blocked_key}


@router.post("/sharing/set", tags=["groups"])
async def set_sharing(data: Token):
    """Set sharing toggle for a group."""
    user = _user(data)
    if not data.group_id:
        raise exceptions.CRUD
    ch.set_user_group_sharing(user, data.group_id, data.enabled)
    return {"user_key": user, "group_id": data.group_id, "sharing_enabled": data.enabled}


# ---------------------------------------------------------------------------
# App Contracts (per-app with per-service permissions)
# ---------------------------------------------------------------------------


@router.post("/app-contracts/add", tags=["app-contracts"])
async def add_app_contract(data: Token):
    """Add an app contract (one per app, permissions is JSON)."""
    user = _user(data)
    if not data.allowed_origin or not data.permissions:
        raise exceptions.CRUD
    result = ch.add_app_contract(user, data.allowed_origin, data.permissions)
    return result


@router.post("/app-contracts/list", tags=["app-contracts"])
async def get_app_contracts(data: Token):
    """Get active app contracts."""
    user = _user(data)
    return ch.get_app_contracts(user)


@router.post("/app-contracts/revoke", tags=["app-contracts"])
async def revoke_app_contract(data: Token):
    """Revoke one app contract (by origin) or all."""
    user = _user(data)
    if data.allowed_origin:
        ch.revoke_app_contract(user, data.allowed_origin)
    else:
        ch.revoke_all_app_contracts(user)
    return {"status": "revoked"}


# ---------------------------------------------------------------------------
# Node stats
# ---------------------------------------------------------------------------


@router.post("/stats", tags=["system"])
async def node_stats(data: Token):
    """Get node-level stats: users, documents, groups. Anon OK."""
    return ch.get_node_stats()


# ---------------------------------------------------------------------------
# Auth (account management)
# ---------------------------------------------------------------------------


@router.post("/signup", tags=["auth"])
async def signup(data: Token):
    """Create a user account."""
    if not data.username or not data.password:
        raise exceptions.CRUD
    password_hash = get_password_hash(data.password)
    result = ch.create_user(
        username=data.username,
        password_hash=password_hash,
        phone=data.phone or "",
        email=data.email or "",
    )
    if not result:
        raise exceptions.EXISTS
    return result


@router.post("/login", tags=["auth"])
async def login(data: Token):
    """Verify credentials, return JWT."""
    if not data.username or not data.password:
        raise exceptions.LOGIN
    if not ch.authenticate_user(data.username, data.password):
        raise exceptions.LOGIN
    from datetime import datetime, timedelta

    import jwt

    import app.settings as settings

    token_data = {
        "username": data.username,
        "provider": settings.PROVIDER,
        "site": data.site or "web10",
        "expires": (datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    }
    return {"token": jwt.encode(token_data, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)}


@router.post("/change-pass", tags=["account"])
async def change_pass(data: Token):
    """Change password."""
    user = _user(data)
    if not data.password or not data.new_pass:
        raise exceptions.CRUD
    if not ch.authenticate_user(user, data.password):
        raise exceptions.LOGIN
    ch.change_password(user, get_password_hash(data.new_pass))
    return {"status": "changed"}


@router.post("/change-phone", tags=["account"])
async def change_phone(data: Token):
    """Change phone number."""
    user = _user(data)
    if not data.phone:
        raise exceptions.CRUD
    ch.change_phone(user, data.phone)
    return {"phone": data.phone}


@router.post("/set-email", tags=["account"])
async def set_email(data: Token):
    """Set recovery email."""
    user = _user(data)
    if not data.email:
        raise exceptions.CRUD
    ch.set_email(user, data.email)
    return {"email": data.email}


@router.post("/verify-phone", tags=["account"])
async def verify_phone(data: Token):
    """Verify phone number with code."""
    user = _user(data)
    if not data.code:
        raise exceptions.CRUD
    ch.verify_phone(user)
    return {"phone_verified": True}


@router.post("/verify-email", tags=["account"])
async def verify_email(data: Token):
    """Verify email with code."""
    user = _user(data)
    if not data.code:
        raise exceptions.CRUD
    ch.verify_email(user)
    return {"email_verified": True}


@router.post("/profile", tags=["account"])
async def get_profile(data: Token):
    """Get user profile."""
    user = _user(data)
    profile = ch.get_user_profile(user)
    if not profile:
        raise exceptions.ENTRY_NOT_FOUND
    return profile


@router.post("/send_code", tags=["auth"])
async def send_code(data: Token):
    """Send a verification code to the user's phone."""
    user = _user(data)
    phone = ch.get_phone_number(user)
    if not phone:
        raise exceptions.PHONE_NUMBER_MISSING
    from app.services import twilio as mobile

    return mobile.send_verification(phone, user)


@router.post("/set_recovery_phone", tags=["account"])
async def set_recovery_phone(data: Token):
    """Set the recovery phone on the authenticated user's profile."""
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    phone = (data.query.get("phone") or "").strip()
    import re

    _PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{5,18}[0-9]$")
    if not _PHONE_RE.match(phone):
        raise exceptions.BAD_NUM
    ch.change_phone(decoded.username, phone)
    return {"phone_number": phone}


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


@router.post("/media/confirm", tags=["media"])
async def confirm_media(data: Token):
    """Confirm a media upload by storing metadata."""
    user = _user(data)
    if data.body is None:
        raise exceptions.CRUD
    return ch.confirm_media_upload(user, data.body)


@router.post("/media/list", tags=["media"])
async def list_media(data: Token):
    """List media for the user."""
    user = _user(data)
    return ch.list_media(user, limit=data.limit, offset=data.offset)


@router.post("/media/delete", tags=["media"])
async def delete_media(data: Token):
    """Delete a media record."""
    user = _user(data)
    if not data.doc_id:
        raise exceptions.CRUD
    ch.delete_media(user, data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}


# ---------------------------------------------------------------------------
# App Store
# ---------------------------------------------------------------------------


@router.post("/apps/register", tags=["app-store"])
async def register_app(data: Token):
    """Register an app in the provider app store."""
    if not data.body or not data.body.get("url"):
        raise exceptions.CRUD
    return ch.register_app(data.body)


@router.post("/apps/list", tags=["app-store"])
async def list_apps(data: Token):
    """List approved apps."""
    return ch.list_apps(approved_only=True)


@router.post("/apps/rating", tags=["app-store"])
async def create_app_rating(data: Token):
    """Submit a 1-5 star rating for an app."""
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    if not data.body or not data.body.get("target_app_id"):
        raise exceptions.CRUD
    rating = data.body.get("rating", 0)
    if not 1 <= rating <= 5:
        raise exceptions.CRUD
    return ch.create_app_rating(
        author=decoded.username,
        target_app_id=data.body["target_app_id"],
        rating=rating,
        provider=decoded.provider,
    )


@router.post("/apps/ratings", tags=["app-store"])
async def get_app_ratings(data: Token):
    """Get all ratings for an app."""
    if not data.body or not data.body.get("target_app_id"):
        raise exceptions.CRUD
    return ch.get_app_ratings(data.body["target_app_id"])
