from fastapi import APIRouter

from .endpoints import feedback, infra, imports, issue_tracking, pay

v3_router = APIRouter()

# Infrastructure (bare, no prefix)
v3_router.include_router(infra.router, prefix="/infra", tags=["infrastructure"])

# Product sections (v3-prefixed). The first-party analytics beacon (pageview /
# funnel / error) moved to the NODE (POST /analytics/event → marketing_events
# in ClickHouse, D56) — the old in-memory marketing-api endpoints were retired
# (they lost data on every restart and nothing read them).
v3_router.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
v3_router.include_router(imports.router, prefix="/import", tags=["import"])
v3_router.include_router(issue_tracking.router, prefix="/issue-tracking", tags=["issue-tracking"])
v3_router.include_router(pay.router, prefix="/pay", tags=["pay"])
