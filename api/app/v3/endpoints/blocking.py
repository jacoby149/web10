from fastapi import APIRouter

from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import BlockUser, BlockUserInGroup, SetSharing
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["group-contracts"])


@router.post("/block")
async def block_user(data: BlockUser):
    """Block a user (user-wide)."""
    user = _user(data)
    ch.block_user(user, data.blocked_key)
    return {"user_key": user, "blocked_key": data.blocked_key}


@router.post("/unblock")
async def unblock_user(data: BlockUser):
    """Unblock a user."""
    user = _user(data)
    ch.unblock_user(user, data.blocked_key)
    return {"user_key": user, "blocked_key": data.blocked_key}


@router.post("/block-in-group")
async def block_user_in_group(data: BlockUserInGroup):
    """Block a user from seeing your content in a specific group."""
    user = _user(data)
    ch.block_user_in_group(user, data.group_id, data.blocked_key)
    return {"user_key": user, "group_id": data.group_id, "blocked_key": data.blocked_key}


@router.post("/unblock-in-group")
async def unblock_user_in_group(data: BlockUserInGroup):
    """Unblock a user in a group."""
    user = _user(data)
    ch.unblock_user_in_group(user, data.group_id, data.blocked_key)
    return {"user_key": user, "group_id": data.group_id, "blocked_key": data.blocked_key}


@router.post("/sharing/set")
async def set_sharing(data: SetSharing):
    """Set sharing toggle for a group."""
    user = _user(data)
    ch.set_user_group_sharing(user, data.group_id, data.enabled)
    return {"user_key": user, "group_id": data.group_id, "sharing_enabled": data.enabled}
