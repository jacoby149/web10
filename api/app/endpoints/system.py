import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

import app.exceptions as exceptions
from app.models.auth import Token
from app.models.config import (
    AppAdminQuery,
    AppApprovalRequest,
    AppRatingRequest,
    ConfigUpdate,
    DiscoveryModerationRequest,
    SetupRequest,
    SetupStatus,
)
from app.services import config as config_svc
from app.services import documentdb as db
from app.services.auth import check_admin, decode_token, get_password_hash

router = APIRouter()


@router.get("/", include_in_schema=False)
async def root():
    """A bare API host should look intentional, not broken."""
    return RedirectResponse(url="/docs")


# --- Setup wizard ---


@router.get("/setup", include_in_schema=False)
async def get_setup_status() -> SetupStatus:
    """Returns whether the node has been configured."""
    return SetupStatus(
        configured=config_svc.node_is_configured(),
        has_admin=config_svc.admin_exists(),
    )


@router.post("/setup", include_in_schema=False)
async def post_setup(req: SetupRequest):
    """First-run setup: generates JWT key, saves config, creates admin."""
    if config_svc.admin_exists():
        raise HTTPException(status_code=400, detail="Node already configured")

    # Generate JWT key
    key_data = config_svc.generate_jwt_keypair()
    key_data["ts"] = __import__("datetime").datetime.utcnow().isoformat()
    config_svc.save_jwt_key(key_data)

    # Build config body
    config_body = req.model_dump(exclude_none=True)
    config_body["private_key"] = key_data["key"]
    config_body["algorithm"] = "HS256"
    config_svc.save_config(config_body)

    # Create admin
    config_svc.create_admin(
        req.admin_username,
        get_password_hash(req.admin_password),
        phone="",
    )

    return {
        "status": "configured",
        "message": "Node setup complete. You can now log in.",
        "key_id": key_data["kid"],
    }


# --- Config management ---


@router.post("/config", include_in_schema=False)
async def get_config(token: Token):
    """Returns the current node config (admin only).

    POST (not GET) because it carries a token in the body — GET bodies are an
    anti-pattern and get stripped by proxies. Matches the sibling system
    endpoints (/setup, /stats) which are all POST.
    """
    check_admin(token)
    cfg = config_svc.get_config()
    # Strip sensitive fields
    safe = {
        k: v
        for k, v in cfg.items()
        if k
        not in (
            "private_key",
            "s3_secret_key",
            "twilio_auth_token",
            "stripe_test_key",
            "stripe_live_key",
        )
    }
    # the effective admin list (saved list, or the bootstrap default)
    safe["admins"] = config_svc.list_admins()
    return safe


@router.post("/am_admin", include_in_schema=False)
async def am_admin(token: Token):
    """Any authenticated user can ask whether THEY are an admin of this node.

    Lets the console show/hide the Node Config surface without leaking the
    admin list to non-admins.
    """
    try:
        check_admin(token)
        return {"admin": True}
    except Exception:
        return {"admin": False}


@router.patch("/config", include_in_schema=False)
async def patch_config(token: Token, update: ConfigUpdate):
    """Partially update node config (admin only)."""
    check_admin(token)
    current = config_svc.get_config()
    changes = update.model_dump(exclude_none=True)
    current.update(changes)
    config_svc.save_config(current)
    return {"status": "updated", "changed": list(changes.keys())}


# --- Health ---


@router.get("/ready", include_in_schema=False)
async def ready():
    """Health check — returns 200 if DB is reachable."""
    try:
        db.client.admin.command("ping")
        return {"status": "ok", "configured": config_svc.node_is_configured()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {e}")


@router.post("/stats", include_in_schema=False)
async def stats(skip: int = 0, limit: int = 0):
    apps = db.get_apps(skip, limit)
    users = db.get_user_count()
    size = db.total_size()
    return {"apps": apps, "users": users, "storage": size}


@router.get("/pwa_listing", include_in_schema=False)
async def pwa(url: str):
    try:
        resp = requests.get(url + "manifest.json", {"Accept": "application/json"}, timeout=1)
    except requests.exceptions.RequestException:
        raise exceptions.NO_PWA
    return resp.json()


@router.post("/register_app", include_in_schema=False)
async def register_app(info: dict):
    """Register an app (v2). Accepts url + optional name, description,
    icon_url, screenshots. New apps start as pending. Repeat visits
    from approved apps with changed metadata enter review."""
    if "url" not in info:
        return
    fragments = [
        "http://",
        "localhost",
        "file://",
        "vscode-webview:/",
        "--",
        ".html",
        "web10.dev",
        ".id.repl.co",
    ]
    for fragment in fragments:
        if fragment in info["url"]:
            return
    db.register_app(info)


# --- App Store curation (admin only) ---
#
# Anyone can POST /register_app, but an app stays hidden from the public
# storefront (POST /stats → get_apps) until an admin approves it. These
# endpoints let the node operator see pending apps and toggle approval
# from the authenticator's Node Config panel.


@router.post("/apps/admin", include_in_schema=False)
async def apps_admin(query: AppAdminQuery):
    """List every registered app with its approval state (admin only)."""
    token = Token(token=query.token)
    check_admin(token)
    apps = db.list_apps_admin()
    pending = sum(1 for a in apps if not a["approved"])
    return {"apps": apps, "pending": pending}


@router.post("/apps/approve", include_in_schema=False)
async def apps_approve(req: AppApprovalRequest):
    """Approve or reject a registered app (admin only).
    On approve of pending_on_change: promotes pending metadata to live fields.
    On reject: preserves old metadata, sets review_state to rejected."""
    token = Token(token=req.token)
    check_admin(token)
    db.set_app_approval(req.url, req.approved, req.reviewer_note)
    return {"status": "updated", "url": req.url, "approved": req.approved}


# --- App ratings (D37) ---


@router.post("/apps/rating", include_in_schema=False)
async def apps_rating(req: AppRatingRequest):
    """Submit a 1-5 star rating for an app. Upserts by (target_app_id, author)."""
    if not 1 <= req.rating <= 5:
        raise HTTPException(status_code=400, detail="rating must be 1-5")
    token = Token(token=req.token)
    decoded = decode_token(token.token)
    return db.create_app_rating(
        author=decoded.username,
        target_app_id=req.target_app_id,
        rating=req.rating,
        provider=decoded.provider,
    )


@router.patch("/apps/ratings/{target_app_id}", include_in_schema=False)
async def apps_ratings(target_app_id: str):
    """Read all star ratings for an app (anon OK)."""
    return db.query_app_ratings(target_app_id)


# --- Discovery migration (admin only) ---


@router.post("/admin/discovery/migrate_terms", include_in_schema=False)
async def admin_discovery_migrate_terms(req: Token):
    """Provision the canonical public_posts anon-read term for every existing
    account that lacks it. Admin only. Idempotent — safe to call multiple times."""
    check_admin(req)
    return db.migrate_public_posts_terms()


@router.post("/admin/discovery/backfill", include_in_schema=False)
async def admin_discovery_backfill(req: Token):
    """Backfill the discovery index with all existing public_posts from every
    user collection. Admin only. Idempotent — safe to call multiple times."""
    check_admin(req)
    return db.backfill_discovery()


@router.post("/admin/apps/migrate_v2", include_in_schema=False)
async def admin_apps_migrate_v2(req: Token):
    """Migrate legacy web10.apps records to v2 shape (D37).
    Backfills review_state, metadata_version, web10apps_post_id.
    Projects approved apps to #web10apps discovery. Admin only. Idempotent."""
    check_admin(req)
    return db.migrate_apps_to_v2()


@router.post("/admin/discovery/migrate_follows_terms", include_in_schema=False)
async def admin_discovery_migrate_follows_terms(req: Token):
    """Provision core app service terms (follows, inbox, reactions, comments,
    dms) for every existing account that lacks them. Admin only. Idempotent."""
    check_admin(req)
    return db.migrate_follows_terms()


# --- Discovery board moderation (admin only) ---


def _check_moderation_request(req: DiscoveryModerationRequest) -> str:
    """Admin-gate + input guard. Returns the admin's username (the actor)."""
    check_admin(Token(token=req.token))
    if req.service in ("*", "services"):
        raise HTTPException(status_code=400, detail="invalid service")
    decoded = decode_token(req.token, private_key=True)
    return decoded.username


@router.post("/admin/discovery/remove", include_in_schema=False)
async def admin_discovery_remove(req: DiscoveryModerationRequest):
    """Hide a post from the public discovery board. Admin only.

    Sets a sticky ``removed`` flag on the discovery index document — the post
    drops out of /discover/posts, /discover/search, /discover/topics,
    /discover/users and single-post lookup, and an author editing their post
    cannot un-hide it. The underlying record in the author's collection is
    NOT touched (I3): this is board-level takedown, not record deletion.
    """
    actor = _check_moderation_request(req)
    result = db.moderate_discovery_post(req.author, req.service, req.post_id, True, actor=actor, reason=req.reason)
    if not result["matched"]:
        raise HTTPException(status_code=404, detail="post not found on the discovery board")
    return result


@router.post("/admin/discovery/restore", include_in_schema=False)
async def admin_discovery_restore(req: DiscoveryModerationRequest):
    """Restore a previously hidden post to the public discovery board. Admin only."""
    actor = _check_moderation_request(req)
    result = db.moderate_discovery_post(req.author, req.service, req.post_id, False, actor=actor, reason=req.reason)
    if not result["matched"]:
        raise HTTPException(status_code=404, detail="post not found on the discovery board")
    return result


@router.post("/admin/discovery/removed", include_in_schema=False)
async def admin_discovery_removed(req: Token):
    """List posts currently hidden from the discovery board. Admin only."""
    check_admin(req)
    return {"removed": db.list_removed_discovery_posts()}
