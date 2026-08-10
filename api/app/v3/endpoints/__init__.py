from fastapi import APIRouter

from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

from . import (
    appstore,
    auth,
    blocking,
    contracts,
    documents,
    groups,
    media,
)

router = APIRouter(prefix="/v3")

# CRUD
router.include_router(documents.router, prefix="")

# Groups
router.include_router(groups.router, prefix="/groups")

# Blocking + sharing
router.include_router(blocking.router, prefix="")

# App contracts
router.include_router(contracts.router, prefix="/app-contracts")


# Node stats
@router.post("/stats", tags=["system"])
async def node_stats(data: TokenOnly):
    """Get node-level stats: users, documents, groups. Anon OK."""
    return ch.get_node_stats()


# Auth + account
router.include_router(auth.router, prefix="")

# Media
router.include_router(media.router, prefix="/media")

# App store
router.include_router(appstore.router, prefix="/apps")
