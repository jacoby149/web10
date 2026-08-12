from fastapi import APIRouter

from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import AddAppContract, RevokeAppContract
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

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


@router.post("/cleanup")
async def cleanup_stale_contracts(data: TokenOnly):
    """Tombstone stale app contracts where allowed_origin is not a URL.

    This is a one-time cleanup for contracts created with service names
    instead of website origins. Call this to clean up your contracts list.
    """
    user = _user(data)
    count = ch.cleanup_stale_app_contracts(user)
    return {"status": "cleaned", "revoked": count}
