from fastapi import APIRouter, HTTPException, Request

from app import settings
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import AddAppContract, RevokeAppContract
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["app-contracts"])


def _is_authenticator_origin(request: Request) -> bool:
    """Check if the request comes from an authenticator host."""
    origin = request.headers.get("origin", "")
    if not origin:
        return True  # same-origin or direct API call — allow
    try:
        host = origin.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
    except Exception:
        return False
    return host in settings.CORS_SERVICE_MANAGERS


@router.post("/add")
def add_app_contract(request: Request, data: AddAppContract):
    """Add an app contract (one per app, permissions is JSON).

    Only callable from an authenticator origin — apps must go through
    the popup consent flow, they cannot create contracts directly.
    """
    if not _is_authenticator_origin(request):
        raise HTTPException(
            status_code=403,
            detail="App contract creation is only allowed from the authenticator. Apps must go through the consent popup.",
        )
    user = _user(data)
    result = ch.add_app_contract(user, data.allowed_origin, data.permissions)
    return result


@router.post("/list")
def get_app_contracts(data: TokenOnly):
    """Get active app contracts."""
    user = _user(data)
    return ch.get_app_contracts(user)


@router.post("/revoke")
def revoke_app_contract(request: Request, data: RevokeAppContract):
    """Revoke one app contract (by origin) or all.

    Only callable from an authenticator origin — apps cannot revoke
    contracts directly.
    """
    if not _is_authenticator_origin(request):
        raise HTTPException(
            status_code=403,
            detail="App contract revocation is only allowed from the authenticator.",
        )
    user = _user(data)
    if data.allowed_origin:
        ch.revoke_app_contract(user, data.allowed_origin)
    else:
        ch.revoke_all_app_contracts(user)
    return {"status": "revoked"}


@router.post("/cleanup")
def cleanup_stale_contracts(request: Request, data: TokenOnly):
    """Tombstone stale app contracts where allowed_origin is not a URL.

    Only callable from an authenticator origin.
    """
    if not _is_authenticator_origin(request):
        raise HTTPException(
            status_code=403,
            detail="Contract cleanup is only allowed from the authenticator.",
        )
    user = _user(data)
    count = ch.cleanup_stale_app_contracts(user)
    return {"status": "cleaned", "revoked": count}
