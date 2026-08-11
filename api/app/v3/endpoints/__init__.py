from fastapi import APIRouter

from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

from . import (
    account,
    appstore,
    auth,
    blocking,
    contracts,
    documents,
    groups,
    media,
)

router = APIRouter(prefix="/v3")

# Auth first — signup, login
router.include_router(auth.router, prefix="")

# Account management — profile, password, phone, email
router.include_router(account.router, prefix="")

# Document CRUD
router.include_router(documents.router, prefix="")

# Group contracts — groups (including group-scoped blocking/sharing)
router.include_router(groups.router, prefix="/groups")

# User-wide blocking
router.include_router(blocking.router, prefix="")

# Media
router.include_router(media.router, prefix="/media")

# App contracts
router.include_router(contracts.router, prefix="/app-contracts")

# App store
router.include_router(appstore.router, prefix="/apps")


# Node stats
@router.post("/stats", tags=["system"])
async def node_stats(data: TokenOnly):
    """Get node-level stats: users, documents, groups."""
    return ch.get_node_stats()
