import json

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

import app.exceptions as exceptions
from app.models.auth import Token
from app.models.config import (
    ConfigUpdate,
    SetupRequest,
    SetupStatus,
)
from app.services import config as config_svc
from app.services.auth import check_admin, decode_token, get_password_hash
from app.v3.services import clickhouse as ch

router = APIRouter()


@router.post("/")
def root():
    """A bare API host should look intentional, not broken."""
    return RedirectResponse(url="/docs")


# --- Setup wizard ---


@router.post("/setup", tags=["system"])
def get_setup_status() -> SetupStatus:
    """Returns whether the node has been configured."""
    return SetupStatus(
        configured=config_svc.node_is_configured(),
        has_admin=config_svc.admin_exists(),
    )


@router.post("/setup/configure", tags=["system"])
def post_setup(req: SetupRequest):
    """First-run setup: generates JWT key, saves config, creates admin.

    v3: the admin is a ClickHouse user (``ch.create_user``) — the only store
    ``/v3/login`` reads — so the wizard's admin can actually log in. The
    guard is ClickHouse too: a node with any user is already in use.
    """
    if ch.node_has_users():
        raise HTTPException(status_code=400, detail="Node already configured")

    # Generate JWT key
    key_data = config_svc.generate_jwt_keypair()
    key_data["ts"] = __import__("datetime").datetime.utcnow().isoformat()
    config_svc.save_jwt_key(key_data)

    # Build config body — the new admin is the node's admin (check_admin
    # enforces the config admins list).
    config_body = req.model_dump(exclude_none=True)
    config_body["private_key"] = key_data["key"]
    config_body["algorithm"] = "HS256"
    config_body["admins"] = [req.admin_username]
    config_svc.save_config(config_body)

    # Create the admin in ClickHouse.
    if not ch.create_user(req.admin_username, get_password_hash(req.admin_password)):
        raise HTTPException(status_code=400, detail="Admin user already exists")

    return {
        "status": "configured",
        "message": "Node setup complete. You can now log in.",
        "key_id": key_data["kid"],
    }


# --- Config management ---


@router.post("/config", tags=["admin"])
def get_config(token: Token):
    """Returns the node's EFFECTIVE config (admin only): the settings.py
    defaults (env-overridden — what the node actually runs) overlaid with
    the saved node_config. The Node Config UI reads this, so a fresh node
    shows its live values (provider, ClickHouse, MinIO) instead of blanks.

    POST (not GET) because it carries a token in the body — GET bodies are an
    anti-pattern and get stripped by proxies. Matches the sibling system
    endpoints (/setup, /stats) which are all POST.

    Only ``private_key`` is stripped — it is the node's signing secret and
    the UI has no field for it. Everything else is shown: this is the node
    operator's own admin surface (check_admin: node-signed JWT + admin
    list), and the panel's job is to show what the node runs.
    """
    check_admin(token)
    cfg = config_svc.effective_config()
    safe = {k: v for k, v in cfg.items() if k != "private_key"}
    # the effective admin list (saved list, or the bootstrap default)
    safe["admins"] = config_svc.list_admins()
    return safe


@router.post("/am_admin", tags=["admin"])
def am_admin(token: Token):
    """Any authenticated user can ask whether THEY are an admin of this node.

    Lets the console show/hide the Node Config surface without leaking the
    admin list to non-admins.
    """
    try:
        check_admin(token)
        return {"admin": True}
    except Exception:
        return {"admin": False}


@router.post("/config/update", tags=["admin"])
def patch_config(token: Token, update: ConfigUpdate):
    """Partially update node config (admin only)."""
    check_admin(token)
    current = config_svc.get_config()
    changes = update.model_dump(exclude_none=True)
    current.update(changes)
    config_svc.save_config(current)
    return {"status": "updated", "changed": list(changes.keys())}


# --- Health ---


@router.get("/ready", tags=["system"])
def ready():
    """Health check — returns 200 if ClickHouse is reachable."""
    try:
        ch.client.command("SELECT 1")
        return {"status": "ok", "configured": config_svc.node_is_configured()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {e}")


# --- App store listing ---


@router.get("/pwa_listing", include_in_schema=False)
def pwa_listing(url: str):
    """Proxy a registered app's PWA manifest (icon + name for the store).

    The marketing app store fetches the app's manifest through the node so
    the storefront can show each app's real icon without a CORS round-trip
    from the browser. Manifest URL = {url without trailing slash} +
    /manifest.json — so a registered path with or without a trailing slash
    resolves the same (a path IS an app, D47).
    """
    manifest_url = url.rstrip("/") + "/manifest.json"
    # Hard cap on manifest size (hardening #7): a real PWA manifest is a few
    # KB; an unbounded read is a memory spike the store would absorb on every
    # render. Over the cap → treat as no manifest.
    _MANIFEST_MAX_BYTES = 256 * 1024
    try:
        with requests.get(manifest_url, {"Accept": "application/json"}, timeout=1, stream=True) as resp:
            resp.raise_for_status()
            chunks = []
            total = 0
            for chunk in resp.iter_content(chunk_size=8192):
                total += len(chunk)
                if total > _MANIFEST_MAX_BYTES:
                    raise exceptions.NO_PWA
                chunks.append(chunk)
            return json.loads(b"".join(chunks))
    except requests.exceptions.RequestException:
        raise exceptions.NO_PWA


# --- Issue Tracking (bug reports) ---


@router.post("/bug_report", tags=["issue-tracking"])
def submit_bug_report(req: dict):
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


@router.post("/admin/bug_reports", tags=["issue-tracking"])
def admin_bug_reports(req: Token, limit: int = 100, offset: int = 0):
    """List bug reports (admin only). Screenshots excluded — too large."""
    check_admin(req)
    reports = ch.list_bug_reports(limit=limit, offset=offset)
    return {"reports": reports, "count": len(reports)}


@router.post("/admin/bug_reports/{report_id}", tags=["issue-tracking"])
def admin_bug_report_detail(report_id: str, req: Token):
    """Get a single bug report with screenshots (admin only)."""
    check_admin(req)
    report = ch.get_bug_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")
    return report
