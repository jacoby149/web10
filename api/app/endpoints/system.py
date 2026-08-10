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
    SetupRequest,
    SetupStatus,
)
from app.services import config as config_svc
from app.services import documentdb as db
from app.services.auth import check_admin, decode_token, get_password_hash
from app.v3.services import clickhouse as ch

router = APIRouter()


@router.post("/", include_in_schema=False)
async def root():
    """A bare API host should look intentional, not broken."""
    return RedirectResponse(url="/docs")


# --- Setup wizard ---


@router.post("/setup", tags=["system"], include_in_schema=False)
async def get_setup_status() -> SetupStatus:
    """Returns whether the node has been configured."""
    return SetupStatus(
        configured=config_svc.node_is_configured(),
        has_admin=config_svc.admin_exists(),
    )


@router.post("/setup/configure", tags=["system"], include_in_schema=False)
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


@router.post("/config/update", include_in_schema=False)
async def patch_config(token: Token, update: ConfigUpdate):
    """Partially update node config (admin only)."""
    check_admin(token)
    current = config_svc.get_config()
    changes = update.model_dump(exclude_none=True)
    current.update(changes)
    config_svc.save_config(current)
    return {"status": "updated", "changed": list(changes.keys())}


# --- Health ---


@router.post("/ready", tags=["system"], include_in_schema=False)
async def ready():
    """Health check — returns 200 if DB is reachable."""
    try:
        db.client.admin.command("ping")
        return {"status": "ok", "configured": config_svc.node_is_configured()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {e}")


@router.post("/stats", tags=["system"], include_in_schema=False)
async def stats(skip: int = 0, limit: int = 0):
    """Node stats: users, apps, storage. Reads from ClickHouse (v3)."""
    try:
        node_stats = ch.get_node_stats()
    except Exception:
        node_stats = {"users": 0, "documents": 0, "groups": 0}

    try:
        apps = ch.list_apps(approved_only=True)
        # Map to legacy shape for frontend compat
        apps = [
            {
                "url": a["url"],
                "visits": 0,
                "name": a.get("name", ""),
                "description": a.get("description", ""),
                "icon_url": a.get("icon_url"),
                "screenshots": a.get("screenshots", []),
            }
            for a in apps
        ]
    except Exception:
        apps = []

    return {
        "apps": apps,
        "users": node_stats.get("users", 0),
        "storage": 0,
    }


@router.post("/pwa_listing", include_in_schema=False)
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


@router.post("/apps/ratings/{target_app_id}", include_in_schema=False)
async def apps_ratings(target_app_id: str):
    """Read all star ratings for an app (anon OK)."""
    return db.query_app_ratings(target_app_id)


# --- Discovery migration (admin only) ---


@router.post("/admin/discovery/migrate_terms", tags=["admin"], include_in_schema=False)
async def admin_discovery_migrate_terms(req: Token):
    """Provision the canonical public_posts anon-read term for every existing
    account that lacks it. Admin only. Idempotent — safe to call multiple times."""
    check_admin(req)
    return db.migrate_public_posts_terms()


@router.post("/admin/discovery/backfill", tags=["admin"], include_in_schema=False)
async def admin_discovery_backfill(req: Token):
    """Backfill the discovery index with all existing public_posts from every
    user collection. Admin only. Idempotent — safe to call multiple times."""
    check_admin(req)
    return db.backfill_discovery()


@router.post("/admin/apps/migrate_v2", tags=["admin"], include_in_schema=False)
async def admin_apps_migrate_v2(req: Token):
    """Migrate legacy web10.apps records to v2 shape (D37).
    Backfills review_state, metadata_version, web10apps_post_id.
    Projects approved apps to #web10apps discovery. Admin only. Idempotent."""
    check_admin(req)
    return db.migrate_apps_to_v2()


@router.post("/admin/discovery/migrate_follows_terms", tags=["admin"], include_in_schema=False)
async def admin_discovery_migrate_follows_terms(req: Token):
    """Provision core app service terms (follows, inbox, reactions, comments,
    dms) for every existing account that lacks them. Admin only. Idempotent."""
    check_admin(req)
    return db.migrate_follows_terms()


# --- Bug Reports ---


@router.post("/bug_report", include_in_schema=False)
async def submit_bug_report(req: dict):
    """Submit a bug report. Public — no auth required.

    Accepts: description (required), email, page_url, app_version,
    device_info, browser_info, error_message, stack_trace, screenshots.
    Screenshots are base64-encoded image strings (data:image/png;base64,...).
    Optional: token — if provided, username is auto-populated.
    """
    description = (req.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")

    # Optional: extract username from token if provided
    username = ""
    if req.get("token"):
        try:
            decoded = decode_token(req["token"])
            username = decoded.username if decoded.username and decoded.username != "anon" else ""
        except Exception:
            pass

    result = ch.submit_bug_report(
        description=description,
        username=username,
        email=(req.get("email") or "").strip(),
        page_url=(req.get("page_url") or "").strip(),
        app_version=(req.get("app_version") or "").strip(),
        device_info=(req.get("device_info") or "").strip(),
        browser_info=(req.get("browser_info") or "").strip(),
        error_message=(req.get("error_message") or "").strip(),
        stack_trace=(req.get("stack_trace") or "").strip(),
        screenshots=req.get("screenshots") or [],
    )
    return result


@router.post("/admin/bug_reports", include_in_schema=False)
async def admin_bug_reports(req: Token, limit: int = 100, offset: int = 0):
    """List bug reports (admin only). Screenshots excluded — too large."""
    check_admin(req)
    reports = ch.list_bug_reports(limit=limit, offset=offset)
    return {"reports": reports, "count": len(reports)}


@router.post("/admin/bug_reports/{report_id}", include_in_schema=False)
async def admin_bug_report_detail(report_id: str, req: Token):
    """Get a single bug report with screenshots (admin only)."""
    check_admin(req)
    report = ch.get_bug_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")
    return report
