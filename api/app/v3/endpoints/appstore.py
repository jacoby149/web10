from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import decode_token
from app.v3.models import CreateAppRating, GetAppRatings, RegisterApp
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["app-store"])


@router.post("/register")
async def register_app(data: RegisterApp):
    """Register an app in the provider app store."""
    if not data.body.get("url"):
        raise exceptions.CRUD
    return ch.register_app(data.body)


@router.post("/list")
async def list_apps(data: TokenOnly):
    """List approved apps."""
    return ch.list_apps(approved_only=True)


@router.post("/rating")
async def create_app_rating(data: CreateAppRating):
    """Submit a 1-5 star rating for an app."""
    decoded = decode_token(data.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    if not data.body.get("target_app_id"):
        raise exceptions.CRUD
    rating = data.body.get("rating", 0)
    if not 1 <= rating <= 5:
        raise exceptions.CRUD
    return ch.create_app_rating(
        author=decoded.username,
        target_app_id=data.body["target_app_id"],
        rating=rating,
        provider=decoded.provider,
    )


@router.post("/ratings")
async def get_app_ratings(data: GetAppRatings):
    """Get all ratings for an app."""
    if not data.body.get("target_app_id"):
        raise exceptions.CRUD
    return ch.get_app_ratings(data.body["target_app_id"])
