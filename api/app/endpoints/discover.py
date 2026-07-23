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
async def discover_posts(
    sort: str = "recent",
    limit: int = 50,
    skip: int = 0,
    token: Token | None = None,
):
    """For-you feed: recent or trending discovery posts.

    Discovery is a PUBLIC read: parameters come from the URL query string
    (what the social feed sends — a bodyless PATCH), with an optional JSON
    body's `query` taken as an override for richer clients. A request body
    is NOT required — requiring one made the feed's bodyless PATCH 422.
    """
    if token and token.query:
        sort = token.query.get("sort", sort)
        limit = token.query.get("limit", limit)
        skip = token.query.get("skip", skip)
    return db.query_discovery_posts(sort_by=sort, limit=min(limit, 200), skip=skip)


@router.patch("/discover/users", tags=["discovery"])
async def discover_users(limit: int = 20, token: Token | None = None):
    """Suggested accounts based on discovery index activity."""
    if token and token.query:
        limit = token.query.get("limit", limit)
    return db.suggested_users(limit=min(limit, 100))


@router.patch("/discover/search", tags=["discovery"])
async def discover_search(
    q: str | None = None,
    limit: int = 50,
    skip: int = 0,
    token: Token | None = None,
):
    """Full-text search across the discovery index."""
    if token and token.query:
        q = token.query.get("q", q)
        limit = token.query.get("limit", limit)
        skip = token.query.get("skip", skip)
    if not q:
        return []
    return db.search_discovery_posts(query=q, limit=min(limit, 200), skip=skip)


@router.patch("/discover/topics", tags=["discovery"])
async def discover_topics(limit: int = 20, token: Token | None = None):
    """Trending hashtags from the discovery index."""
    if token and token.query:
        limit = token.query.get("limit", limit)
    return db.trending_topics(limit=min(limit, 100))


@router.patch("/discover/post/{username}/{service}/{post_id}", tags=["discovery"])
async def discover_post(username: str, service: str, post_id: str, token: Token | None = None):
    """Single post lookup from the discovery index."""
    post = db.lookup_discovery_post(username, service, post_id)
    if not post:
        raise exceptions.ENTRY_NOT_FOUND
    return post
