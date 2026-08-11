from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.models.auth import Token
from app.models.config import (
    ConfigUpdate,
    SetupRequest,
    SetupStatus,
)
from app.services import config as config_svc
from app.services import documentdb as db
from app.services.auth import check_admin, decode_token, get_password_hash
from app.v3.services import clickhouse as ch

router = APIRouter()


@router.post("/")
async def root():
    """A bare API host should look intentional, not broken."""
    return RedirectResponse(url="/docs")


# --- Setup wizard ---


@router.post("/setup", tags=["system"])
async def get_setup_status() -> SetupStatus:
    """Returns whether the node has been configured."""
    return SetupStatus(
        configured=config_svc.node_is_configured(),
        has_admin=config_svc.admin_exists(),
    )


@router.post("/setup/configure", tags=["system"])
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


@router.post("/config")
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


@router.post("/am_admin")
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


@router.post("/config/update")
async def patch_config(token: Token, update: ConfigUpdate):
    """Partially update node config (admin only)."""
    check_admin(token)
    current = config_svc.get_config()
    changes = update.model_dump(exclude_none=True)
    current.update(changes)
    config_svc.save_config(current)
    return {"status": "updated", "changed": list(changes.keys())}


# --- Health ---


@router.post("/ready", tags=["system"])
async def ready():
    """Health check — returns 200 if DB is reachable."""
    try:
        db.client.admin.command("ping")
        return {"status": "ok", "configured": config_svc.node_is_configured()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {e}")


# --- Bug Reports ---


@router.post("/bug_report")
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


@router.post("/admin/bug_reports")
async def admin_bug_reports(req: Token, limit: int = 100, offset: int = 0):
    """List bug reports (admin only). Screenshots excluded — too large."""
    check_admin(req)
    reports = ch.list_bug_reports(limit=limit, offset=offset)
    return {"reports": reports, "count": len(reports)}


@router.post("/admin/bug_reports/{report_id}")
async def admin_bug_report_detail(report_id: str, req: Token):
    """Get a single bug report with screenshots (admin only)."""
    check_admin(req)
    report = ch.get_bug_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")
    return report
