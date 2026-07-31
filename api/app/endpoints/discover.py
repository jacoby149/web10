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


def _parse_services(raw: str | None) -> list[str] | None:
    """Parse the ``services`` query param (comma-separated) into a list.

    The discovery board is a GENERAL public projection: the caller names
    which services it wants trending/searched (web10-social passes
    ``public_posts``; another app can pass its own service, e.g.
    ``fallout-avatar``). ``None`` = no param sent → the default board set.
    """
    if not raw:
        return None
    services = [s.strip() for s in raw.split(",") if s.strip()]
    return services or None


@router.patch("/discover/posts", tags=["discovery"])
async def discover_posts(
    sort: str = "recent",
    limit: int = 50,
    skip: int = 0,
    services: str | None = None,
    token: Token | None = None,
):
    """For-you feed: recent or trending discovery posts.

    Discovery is a PUBLIC read: parameters come from the URL query string
    (what the social feed sends — a bodyless PATCH), with an optional JSON
    body's `query` taken as an override for richer clients. A request body
    is NOT required — requiring one made the feed's bodyless PATCH 422.

    ``services`` (comma-separated) selects which services the board reads
    back; omitted → the default board set (public_posts + web10_apps).
    """
    if token and token.query:
        sort = token.query.get("sort", sort)
        limit = token.query.get("limit", limit)
        skip = token.query.get("skip", skip)
        services = token.query.get("services", services)
    return db.query_discovery_posts(sort_by=sort, limit=min(limit, 200), skip=skip, services=_parse_services(services))


@router.patch("/discover/users", tags=["discovery"])
async def discover_users(limit: int = 20, services: str | None = None, token: Token | None = None):
    """Suggested accounts based on discovery index activity."""
    if token and token.query:
        limit = token.query.get("limit", limit)
        services = token.query.get("services", services)
    return db.suggested_users(limit=min(limit, 100), services=_parse_services(services))


@router.patch("/discover/search", tags=["discovery"])
async def discover_search(
    q: str | None = None,
    limit: int = 50,
    skip: int = 0,
    services: str | None = None,
    token: Token | None = None,
):
    """Full-text search across the discovery index."""
    if token and token.query:
        q = token.query.get("q", q)
        limit = token.query.get("limit", limit)
        skip = token.query.get("skip", skip)
        services = token.query.get("services", services)
    if not q:
        return []
    return db.search_discovery_posts(query=q, limit=min(limit, 200), skip=skip, services=_parse_services(services))


@router.patch("/discover/topics", tags=["discovery"])
async def discover_topics(limit: int = 20, services: str | None = None, token: Token | None = None):
    """Trending hashtags from the discovery index."""
    if token and token.query:
        limit = token.query.get("limit", limit)
        services = token.query.get("services", services)
    return db.trending_topics(limit=min(limit, 100), services=_parse_services(services))


@router.patch("/discover/post/{username}/{service}/{post_id}", tags=["discovery"])
async def discover_post(username: str, service: str, post_id: str, token: Token | None = None):
    """Single post lookup from the discovery index."""
    post = db.lookup_discovery_post(username, service, post_id)
    if not post:
        raise exceptions.ENTRY_NOT_FOUND
    return post


@router.patch("/discover/app/{web10apps_post_id}", tags=["discovery"])
async def discover_app(web10apps_post_id: str, token: Token | None = None):
    """Look up an app's product page data by its web10apps_post_id (D37).
    Returns the app record + aggregated ratings. Public read."""
    # Compat filter: match v2 review_state=="approved" OR legacy approved:true
    # with no review_state field (pre-migration).
    app = db["web10"]["apps"].find_one(
        {
            "web10apps_post_id": web10apps_post_id,
            "$or": [
                {"review_state": "approved"},
                {"review_state": {"$exists": False}, "approved": True},
            ],
        }
    )
    if not app:
        raise exceptions.ENTRY_NOT_FOUND
    ratings = db._aggregate_app_ratings(web10apps_post_id)
    return {
        "url": app["url"],
        "name": app.get("name", ""),
        "description": app.get("description", ""),
        "icon_url": app.get("icon_url"),
        "screenshots": app.get("screenshots", []),
        "visits": app.get("visits", 0),
        "web10apps_post_id": web10apps_post_id,
        "rating_average": round(ratings["average"], 1) if ratings["count"] else None,
        "rating_count": ratings["count"],
    }
