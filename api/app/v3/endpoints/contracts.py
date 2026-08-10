from fastapi import APIRouter

import app.exceptions as exceptions
from app.v3.models import AddAppContract, RevokeAppContract
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

from app.v3.endpoints.auth_helper import user as _user

router = APIRouter(tags=["app-contracts"])


@router.post("/add")
async def add_app_contract(data: AddAppContract):
    """Add an app contract (one per app, permissions is JSON)."""
    user = _user(data)
    result = ch.add_app_contract(user, data.allowed_origin, data.permissions)
    return result


@router.post("/list")
async def get_app_contracts(data: TokenOnly):
    """Get active app contracts."""
    user = _user(data)
    return ch.get_app_contracts(user)


@router.post("/revoke")
async def revoke_app_contract(data: RevokeAppContract):
    """Revoke one app contract (by origin) or all."""
    user = _user(data)
    if data.allowed_origin:
        ch.revoke_app_contract(user, data.allowed_origin)
    else:
        ch.revoke_all_app_contracts(user)
    return {"status": "revoked"}
