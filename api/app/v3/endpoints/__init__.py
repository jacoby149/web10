from fastapi import APIRouter

from app.v3.services import clickhouse as ch

from . import (
    account,
    appstore,
    auth,
    blocking,
    contracts,
    documents,
    groups,
    logs,
    media,
    moderation,
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

# Logs (SDK/E2E forwarding)
router.include_router(logs.router, prefix="")

# Content moderation (D58) — the review queue + auto-hide list
router.include_router(moderation.router, prefix="/moderation")


# Node stats
@router.post("/stats", tags=["system"])
def node_stats():
    """Get node-level stats: users, documents, groups."""
    return ch.get_node_stats()
