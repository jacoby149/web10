from fastapi import APIRouter

from .endpoints import analytics, feedback, infra, imports, issue_tracking, pay

v3_router = APIRouter()

# Infrastructure (bare, no prefix)
v3_router.include_router(infra.router, prefix="/infra", tags=["infrastructure"])

# Product sections (v3-prefixed)
v3_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
v3_router.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
v3_router.include_router(imports.router, prefix="/import", tags=["import"])
v3_router.include_router(issue_tracking.router, prefix="/issue-tracking", tags=["issue-tracking"])
v3_router.include_router(pay.router, prefix="/pay", tags=["pay"])
