from fastapi import APIRouter, Query

import app.exceptions as exceptions
from app.models.auth import Token
from app.services.auth import check_admin, decode_token
from app.v3.models import (
    ApproveApp,
    AppsAdmin,
    CreateAppRating,
    GetAppRatings,
    ListStoreApps,
    RegisterApp,
)
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["app-store"])

# Review comment cap (D52) — a review is a paragraph, not a document.
MAX_RATING_COMMENT_LEN = 1000


@router.post("/register")
def register_app(data: RegisterApp):
    """Register an app in the provider app store."""
    if not data.body.get("url"):
        raise exceptions.CRUD
    return ch.register_app(data.body)


@router.get("/detail")
def get_app_detail(url: str = Query(..., description="The app's full URL (canonical form)")):
    """The product page payload (D52): app + full metric breakdown + rating
    aggregate + rating list + node macro. Public, pure read — no visit
    bump. 404 for unknown or unapproved apps."""
    detail = ch.get_app_detail(url)
    if detail is None:
        raise exceptions.APP_NOT_FOUND
    return detail


@router.post("/list")
def list_apps(data: ListStoreApps):
    """The public store list (D49): approved apps with realtime metrics
    (visits + users_1d/30d/90d/1y), sorted by users_30d desc, paginated."""
    limit = max(1, min(data.limit, 100))
    offset = max(0, data.offset)
    return ch.list_store_apps(limit=limit, offset=offset)


@router.post("/rating")
def create_app_rating(data: CreateAppRating):
    """Submit a 1-5 star rating for an app, with an optional review comment."""
    decoded = decode_token(data.token, private_key=True)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    if not data.body.get("target_app_id"):
        raise exceptions.CRUD
    rating = data.body.get("rating", 0)
    if not 1 <= rating <= 5:
        raise exceptions.CRUD
    comment = data.body.get("comment", "") or ""
    if len(comment) > MAX_RATING_COMMENT_LEN:
        raise exceptions.CRUD
    return ch.create_app_rating(
        author=decoded.username,
        target_app_id=data.body["target_app_id"],
        rating=rating,
        provider=decoded.provider,
        comment=comment,
    )


@router.post("/ratings")
def get_app_ratings(data: GetAppRatings):
    """Get all ratings for an app."""
    if not data.body.get("target_app_id"):
        raise exceptions.CRUD
    return ch.get_app_ratings(data.body["target_app_id"])


@router.post("/admin", tags=["admin"])
def apps_admin(data: AppsAdmin):
    """List every registered app with its approval state (admin only)."""
    check_admin(Token(token=data.token))
    apps = ch.list_apps_admin()
    pending = sum(1 for a in apps if not a["approved"])
    return {"apps": apps, "pending": pending}


@router.post("/approve", tags=["admin"])
def approve_app(data: ApproveApp):
    """Approve or reject a registered app (admin only)."""
    check_admin(Token(token=data.token))
    review_state = "approved" if data.approved else "rejected"
    ch.approve_app(data.url, data.approved, review_state)
    return {"status": "updated", "url": data.url, "approved": data.approved}
