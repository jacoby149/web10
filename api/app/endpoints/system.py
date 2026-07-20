import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

import app.exceptions as exceptions
import app.settings as settings
from app.models.auth import Token
from app.models.config import ConfigUpdate, SetupRequest, SetupStatus
from app.services import config as config_svc
from app.services import documentdb as db
from app.services.auth import check_admin, get_password_hash

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

@router.get("/config", include_in_schema=False)
async def get_config(token: Token):
    """Returns the current node config (admin only)."""
    check_admin(token)
    cfg = config_svc.get_config()
    # Strip sensitive fields
    safe = {k: v for k, v in cfg.items() if k not in (
        "private_key", "s3_secret_key", "twilio_auth_token",
        "stripe_test_key", "stripe_live_key",
    )}
    return safe


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
