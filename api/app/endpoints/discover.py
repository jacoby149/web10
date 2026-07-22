from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
from app.services import documentdb as db
from app.services.auth import decode_token

router = APIRouter()


def _anon_or_decode(token: Token):
    """Return decoded token data; anon if no token provided."""
    if token.token is None:
        return {"username": "anon"}
    return decode_token(token.token)


@router.patch("/discover/posts", tags=["discovery"])
async def discover_posts(token: Token):
    """For-you feed: recent or trending discovery posts."""
    sort_by = "recent"
    if token.query:
        sort_by = token.query.get("sort", "recent")
    limit = 50
    if token.query:
        limit = min(token.query.get("limit", 50), 200)
    skip = 0
    if token.query:
        skip = token.query.get("skip", 0)
    return db.query_discovery_posts(sort_by=sort_by, limit=limit, skip=skip)


@router.patch("/discover/users", tags=["discovery"])
async def discover_users(token: Token):
    """Suggested accounts based on discovery index activity."""
    limit = 20
    if token.query:
        limit = min(token.query.get("limit", 20), 100)
    return db.suggested_users(limit=limit)


@router.patch("/discover/search", tags=["discovery"])
async def discover_search(token: Token):
    """Full-text search across the discovery index."""
    if not token.query or not token.query.get("q"):
        return []
    q = token.query["q"]
    limit = 50
    if token.query:
        limit = min(token.query.get("limit", 50), 200)
    skip = 0
    if token.query:
        skip = token.query.get("skip", 0)
    return db.search_discovery_posts(query=q, limit=limit, skip=skip)


@router.patch("/discover/topics", tags=["discovery"])
async def discover_topics(token: Token):
    """Trending hashtags from the discovery index."""
    limit = 20
    if token.query:
        limit = min(token.query.get("limit", 20), 100)
    return db.trending_topics(limit=limit)


@router.patch("/discover/post/{username}/{service}/{post_id}", tags=["discovery"])
async def discover_post(username: str, service: str, post_id: str, token: Token):
    """Single post lookup from the discovery index."""
    post = db.lookup_discovery_post(username, service, post_id)
    if not post:
        raise exceptions.ENTRY_NOT_FOUND
    return post
