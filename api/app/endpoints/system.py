import ipaddress
import json
import logging
import re
import socket
from urllib.parse import urlsplit

import urllib3
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

import app.exceptions as exceptions
from app.models.auth import Token
from app.models.config import (
    ConfigUpdate,
    SetupRequest,
    SetupStatus,
)
from app.services import config as config_svc
from app.services.auth import certify, check_admin, decode_token, get_password_hash
from app.v3.endpoints.auth_helper import app_contract_origin
from app.v3.services import clickhouse as ch

router = APIRouter()
log = logging.getLogger(__name__)
MODERATION_POLICY_FIELDS = {"sensitive_words", "auto_moderate", "moderation_enabled", "auto_hide_users"}
MONETIZATION_POLICY_FIELDS = {"node_ad_percentage", "node_ad_overwrite"}


@router.post("/")
def root():
    """A bare API host should look intentional, not broken."""
    return RedirectResponse(url="/docs")


@router.post("/certify", tags=["system"])
def certify_endpoint(token: Token):
    """Verify that a token was minted by THIS node and is unexpired.

    The WebRTC signaling server (``api/rtc``) calls this on every connection
    and keeps the socket only on a 200. It is the v2-era endpoint the Python
    rewrite dropped — without it the signaling server 404s over real HTTPS and
    closes every socket, so P2P (real-time messages + notifications) is dead
    on any non-local node. Locally it masked itself: the HTTPS call to the
    HTTP-only local API fails at the network layer, the RTC server's missing
    ``.catch`` never closes the socket, and P2P "works" — a corrupted measure.

    ``certify`` (services/auth.py) does the real check: signature verification
    (I2 — no unsigned decode), provider match (the token is from this node),
    and expiry. A forged / cross-node / expired token raises ``TOKEN`` → 401,
    so the signaling server drops the socket.
    """
    certify(token)
    return {"status": "ok"}


@router.post("/ice", tags=["system"])
def get_ice(token: Token):
    """Return the node's ICE server configuration for WebRTC P2P clients.

    Returns the default STUN servers. Requires a valid node token (same gate
    as /certify) so that only authenticated node users can get the config.
    """
    if not token.token:
        raise HTTPException(status_code=401, detail="Token is required")
    certify(token)

    ice_servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun2.l.google.com:19302"},
        {"urls": "stun:stun3.l.google.com:19302"},
        {"urls": "stun:stun4.l.google.com:19302"},
    ]

    log.info("[ice] served %d ICE server(s) to token user", len(ice_servers))
    return {"iceServers": ice_servers}


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
    decoded = decode_token(token.token)
    if decoded.credential_kind == "app":
        origin = app_contract_origin(token)
        permissions = ch.get_app_permissions(decoded.username, origin).get("node", [])
        fields = set()
        if "moderate" in permissions:
            check_admin(token, required_capability="moderate")
            fields.update(MODERATION_POLICY_FIELDS)
        if "manageMonetization" in permissions:
            check_admin(token, required_capability="manageMonetization")
            fields.update(MONETIZATION_POLICY_FIELDS)
        if not fields:
            raise HTTPException(status_code=403, detail="App permission denied")
        cfg = config_svc.effective_config()
        return {k: v for k, v in cfg.items() if k in fields}
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
        decoded = decode_token(token.token)
        app_contract_origin(token)
        return {"admin": config_svc.is_admin(decoded.username)}
    except Exception:
        return {"admin": False}


@router.post("/config/update", tags=["admin"])
def patch_config(token: Token, update: ConfigUpdate):
    """Partially update node config (admin only)."""
    changes = update.model_dump(exclude_none=True)
    decoded = decode_token(token.token)
    if decoded.credential_kind == "app":
        if not changes or set(changes) - (MODERATION_POLICY_FIELDS | MONETIZATION_POLICY_FIELDS):
            raise HTTPException(status_code=403, detail="App cannot change node authority or credentials")
        if set(changes) & MODERATION_POLICY_FIELDS:
            check_admin(token, required_capability="moderate")
        if set(changes) & MONETIZATION_POLICY_FIELDS:
            check_admin(token, required_capability="manageMonetization")
    else:
        check_admin(token)
    current = config_svc.get_config()
    current.update(changes)
    config_svc.save_config(current)
    return {"status": "updated", "changed": list(changes.keys())}


@router.get("/telemetry", tags=["system"])
def telemetry_config():
    """The node's telemetry IDs, for the frontends to install at runtime (D56).

    Public — no token. GA4 measurement IDs and Hotjar site IDs are public
    identifiers (they are embedded in every page's HTML for the scripts to
    load); there is no secret here. CORS is wildcard on this node (the
    security boundary is the token, not the origin), so every surface —
    marketing site, social app, authenticator — can read this pre-login from
    any origin.

    The Node Config UI (admin) is where these are set; this endpoint is how
    the values reach the client at runtime, so an operator can change the
    IDs live without a rebuild. Empty string = that instrument is off.
    """
    cfg = config_svc.effective_config()
    return {
        "ga4_measurement_id": cfg.get("ga4_measurement_id") or "",
        "hotjar_site_id": cfg.get("hotjar_site_id") or "",
    }


# --- First-party usage telemetry (D56) ---


@router.post("/analytics/event", tags=["telemetry"])
async def analytics_event(request: Request):
    """Ingest one first-party beacon event (pageview / funnel / error).

    Public — no token. The beacon fires before login, and CORS is wildcard on
    this node (the security boundary is the token, not the origin), so every
    surface — marketing site, social app, authenticator — can POST here from
    any origin. The event is content-free by convention (paths, funnel steps,
    referrers, JS error strings — never post text, media, or PII).

    The body is read as raw JSON, NOT a typed `dict` param: the beacon fires
    via `navigator.sendBeacon`, which sends a string body as `text/plain`
    (not `application/json`). A typed `dict` param makes FastAPI 422 on that
    content-type mismatch — and a 422 in the browser console is an "unexpected
    console error" that fails the e2e. Reading the raw body is content-type
    agnostic. Best-effort: a telemetry write must never fail the caller (a
    ClickHouse hiccup is swallowed; the beacon still gets a 200).
    """
    try:
        req = await request.json()
    except Exception:
        req = {}
    if not isinstance(req, dict):
        return {"status": "ok"}
    etype = (req.get("type") or req.get("event_type") or "").strip()
    if etype not in ("pageview", "funnel", "error"):
        # Unknown types are dropped, not errors — the beacon is fire-and-forget.
        return {"status": "ok"}
    try:
        ch.insert_marketing_event(
            event_type=etype,
            app=(req.get("app") or "").strip(),
            path=(req.get("path") or "").strip(),
            referrer=(req.get("referrer") or "").strip(),
            funnel_event=(req.get("event") or req.get("funnel_event") or "").strip(),
            metadata=req.get("metadata") or {},
            error_message=(req.get("message") or req.get("error_message") or "").strip(),
            error_source=(req.get("source") or req.get("error_source") or "").strip(),
            error_line=int(req.get("line") or 0),
            error_column=int(req.get("column") or 0),
            user_agent=(req.get("user_agent") or "").strip(),
        )
    except Exception:
        log.exception("[telemetry] event ingest failed (event dropped)")
    return {"status": "ok"}


@router.post("/admin/analytics", tags=["admin"])
def admin_analytics(req: Token, days: int = 30):
    """The operator's usage dashboard (admin only): totals, top paths, top
    referrers, funnel counts, top errors — realtime over marketing_events."""
    check_admin(req)
    return ch.marketing_events_summary(days=days)


# --- Health ---


@router.get("/ready", tags=["system"])
def ready():
    """Health check — returns 200 if ClickHouse is reachable."""
    try:
        ch.client.command("SELECT 1")
        return {"status": "ok", "configured": config_svc.node_is_configured()}
    except Exception:
        log.exception("[ready] DB unreachable")
        raise HTTPException(status_code=503, detail="DB unreachable") from None


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
    # Hard cap on manifest size (hardening #7): a real PWA manifest is a few
    # KB; an unbounded read is a memory spike the store would absorb on every
    # render. Over the cap → treat as no manifest.
    _MANIFEST_MAX_BYTES = 256 * 1024
    try:
        # Reject parser ambiguities before either registration lookup or DNS.
        if any(ord(c) <= 32 or ord(c) == 127 for c in url) or "\\" in url:
            raise ValueError("invalid URL")
        parsed = urlsplit(url)
        host = parsed.hostname
        if (
            parsed.scheme not in ("http", "https")
            or not host
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or "%" in parsed.netloc
        ):
            raise ValueError("invalid URL")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if parsed.port == 0:
            raise ValueError("invalid port")
        host = host.encode("idna").decode("ascii").lower().rstrip(".")
        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            # Do not accept libc's legacy inet_aton forms (integer, hex, octal,
            # shortened IPv4), or single-label / local search-domain names.
            if (
                "." not in host
                or host.endswith((".localhost", ".local", ".internal"))
                or not re.fullmatch(r"[a-z0-9.-]+", host)
                or all(re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)", p) for p in host.split("."))
            ):
                raise ValueError("invalid host")
        else:
            if (
                not literal.is_global
                or literal.is_multicast
                or literal.is_reserved
                or getattr(literal, "ipv4_mapped", None) is not None
            ):
                raise ValueError("non-public address")
        app = ch.get_app(url)
        if not app or not app.get("approved"):
            log.info("[pwa_listing] unknown or unapproved app rejected")
            raise exceptions.NO_PWA
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if not addresses:
            raise ValueError("no DNS addresses")
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if (
                not ip.is_global
                or ip.is_multicast
                or ip.is_reserved
                or getattr(ip, "ipv4_mapped", None) is not None
                or (
                    ip.version == 6
                    and (
                        ip not in ipaddress.ip_network("2000::/3") or ip.sixtofour is not None or ip.teredo is not None
                    )
                )
            ):
                raise ValueError("non-public DNS address")
        pinned_ip = addresses[0][4][0]
        authority = f"[{host}]" if ":" in host else host
        if parsed.port is not None:
            authority += f":{port}"
        pool_type = urllib3.HTTPSConnectionPool if parsed.scheme == "https" else urllib3.HTTPConnectionPool
        tls = (
            {"server_hostname": host, "assert_hostname": host, "cert_reqs": "CERT_REQUIRED"}
            if parsed.scheme == "https"
            else {}
        )
        # The pool's host is a numeric, validated address: connection-time DNS
        # can never resolve the attacker-controlled hostname a second time.
        with pool_type(pinned_ip, port=port, timeout=1, **tls) as pool:
            log.info("[pwa_listing] fetching manifest from pinned public address")
            resp = pool.urlopen(
                "GET",
                (parsed.path.rstrip("/") or "") + "/manifest.json",
                headers={"Accept": "application/json", "Host": authority},
                redirect=False,
                retries=False,
                preload_content=False,
            )
            try:
                if not 200 <= resp.status < 300:
                    raise exceptions.NO_PWA
                body = resp.read(_MANIFEST_MAX_BYTES + 1, decode_content=True)
                if len(body) > _MANIFEST_MAX_BYTES:
                    raise exceptions.NO_PWA
                return json.loads(body)
            finally:
                resp.close()
    except (ValueError, UnicodeError, OSError, urllib3.exceptions.HTTPError):
        log.info("[pwa_listing] invalid destination or manifest fetch failed - NO_PWA")
        raise exceptions.NO_PWA from None


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

    # D70: push the report to the node's admins as a DM from the bugbot user.
    # Best-effort — the row above is already durable; a delivery failure must
    # never fail the submitter's request (deliver_bug_report swallows its own
    # errors, this guard is belt-and-suspenders).
    try:
        from app.v3.services import bugbot

        bugbot.deliver_bug_report(
            {
                "report_id": result["report_id"],
                "username": username,
                "email": (req.get("email") or "").strip(),
                "description": description,
                "page_url": (req.get("page_url") or "").strip(),
                "app_version": (req.get("app_version") or "").strip(),
                "device_info": (req.get("device_info") or "").strip(),
                "browser_info": (req.get("browser_info") or "").strip(),
                "error_message": (req.get("error_message") or "").strip(),
                "stack_trace": (req.get("stack_trace") or "").strip(),
                "screenshots": req.get("screenshots") or [],
            }
        )
    except Exception:
        log.exception("[bugbot] delivery hook failed (report %s is durable)", result["report_id"])

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
