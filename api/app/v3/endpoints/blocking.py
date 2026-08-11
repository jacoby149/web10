from fastapi import APIRouter

from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import BlockUser
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["blocking"])


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