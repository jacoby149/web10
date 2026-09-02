"""POST /v3/session/verify — the confirmatory session-health oracle.

The app's SessionGuard calls this at mount and after a failure. Instead of
guessing from status codes (a 401 here means "bad token" OR "no permission"
OR "user not found" — the info is destroyed at the boundary), the server runs
the ACTUAL checks it would run on a real request and reports each as a stable
code, plus the ordered recovery `actions` the client should execute.

The load-bearing rule (definite NO vs. UNKNOWN): every store-backed field
separates a DECISIVE answer (the check ran clean and found nothing) from
`unknown` (the check couldn't run — the store was unreadable). Only decisive
negatives drive actions. A deploy window that takes the contract store down
yields `unknown`, NOT `missing` — so the guard stays idle instead of churning
every user into a re-auth loop.
"""

import logging
from datetime import datetime

import jwt
from fastapi import APIRouter, Request

import app.settings as settings
from app.services.auth import decode_token
from app.v3.models import VerifySession
from app.v3.services import clickhouse as ch

logger = logging.getLogger(__name__)

router = APIRouter(tags=["access"])


def _check_token(token: str | None) -> tuple[str, str | None, str | None]:
    """Decode + classify the token. Returns (state, username, provider).

    state: valid | expired | invalid | missing. username/provider are only
    meaningful when state == "valid".
    """
    if not token:
        return "missing", None, None
    try:
        decoded = decode_token(token, private_key=True)
    except jwt.ExpiredSignatureError:
        return "expired", None, None
    except jwt.InvalidTokenError:
        # Bad signature, malformed, wrong algorithm — all "invalid".
        return "invalid", None, None
    if not decoded.username or decoded.username == "anon":
        # Well-formed but not a user session.
        return "invalid", None, None
    # User tokens carry a custom `expires` claim (ISO string), NOT the standard
    # `exp` — PyJWT doesn't check it, so check it here. This mirrors the SDK's
    # isTokenExpired (the client-side check); the server otherwise would report
    # a lapsed token as "valid".
    if decoded.expires:
        try:
            if datetime.utcnow() >= datetime.fromisoformat(decoded.expires):
                return "expired", None, None
        except ValueError:
            pass  # unparseable expires — signature still valid, not expired
    provider = decoded.provider or settings.PROVIDER
    return "valid", decoded.username, provider


@router.post("/verify")
def verify_access(request: Request, data: VerifySession):
    """Return a typed access verdict + ordered recovery actions.

    Generic by design (D60): checks only universal legs — token, user,
    contract. It does NOT know about any app's groups (no followers-group
    check); app-specific recovery (e.g. the social app healing its followers
    group) is the app's job, client-side.
    """
    token_state, username, provider = _check_token(data.token)

    # user: exists | not_found | unknown (only checkable with a valid token)
    user_state = "unknown"
    # contract: granted | partial | missing | unknown | not_checked
    # ("not_checked" = the app declared no services — a health probe; it must
    # not taint the verdict, so it's excluded from the degraded/unknown logic)
    contract_state = "not_checked"
    contract_checked = False
    missing_services: list[str] = []

    if token_state == "valid":
        # --- user lookup (decisive unless the store is unreadable) ---
        try:
            user_state = "exists" if ch.get_user(username) else "not_found"
        except Exception as e:  # store unreadable → unknown, NOT not_found
            logger.warning("[session] verify: user lookup unreadable: %s", e)
            user_state = "unknown"

        # --- app-contract check (needs the request Origin) ---
        if data.services:
            contract_checked = True
            origin = request.headers.get("origin", "")
            try:
                perms = ch.get_app_permissions(username, origin)
                missing_services = [
                    svc for svc in data.services if not all(op in perms.get(svc, []) for op in data.operations)
                ]
                if not missing_services:
                    contract_state = "granted"
                elif len(missing_services) < len(data.services):
                    contract_state = "partial"
                else:
                    contract_state = "missing"
            except Exception as e:  # store unreadable → unknown, NOT missing
                logger.warning("[session] verify: contract check unreadable: %s", e)
                contract_state = "unknown"
                missing_services = []

    # --- status: invalid > degraded > inconclusive > ok ---
    # Any non-valid token (expired / invalid / missing) is a dead session.
    token_dead = token_state in ("expired", "invalid", "missing")
    contract_bad = contract_checked and contract_state in ("missing", "partial")
    contract_unknown = contract_checked and contract_state == "unknown"
    if user_state == "not_found" or token_dead:
        status = "invalid"
    elif contract_bad:
        status = "degraded"
    elif user_state == "unknown" or contract_unknown:
        status = "inconclusive"
    else:
        status = "ok"

    # --- actions: decisive problems only, lightest/needed-first ---
    if user_state == "not_found":
        # Re-auth can't resurrect a deleted account — terminal sign-out.
        actions: list[str] = ["signout"]
    else:
        actions = []
        # Re-derive through the rooted authenticator (fresh token + contract).
        if token_dead or contract_bad:
            actions.append("reauth")

    return {
        "status": status,
        "token": token_state,
        "user": user_state,
        "contract": {"state": contract_state, "missing_services": missing_services},
        "actions": actions,
        "username": username,
        "provider": provider,
    }
