import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException

import app.exceptions as exceptions
from app import settings
from app.services.auth import _utc, decode_token, encode_token, get_password_hash, public_jwks, validate_app_origin
from app.services.config import effective_config
from app.v3.endpoints.auth_helper import self_user
from app.v3.models import Login, Signup
from app.v3.models.auth import DelegateToken
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["auth"])


@router.get("/.well-known/jwks.json")
def jwks():
    return public_jwks()


@router.post("/delegate")
def delegate(data: DelegateToken):
    username = self_user(data)
    parent = decode_token(data.token)
    origin = validate_app_origin(data.app_origin)
    if not ch.is_origin_allowed(username, origin):
        raise HTTPException(status_code=403, detail="App contract missing or revoked")
    expiry = min(_utc(parent.expires), datetime.now(UTC) + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES))
    return {
        "token": encode_token(
            {
                "username": username,
                "provider": parent.provider,
                "site": origin,
                "app_origin": origin,
                "credential_kind": "app",
                "expires": expiry.isoformat(),
            }
        )
    }


_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$")


def kosher(s: str) -> bool:
    """Validate username format."""
    return bool(_USERNAME_RE.match(s))


def _require_contact() -> bool:
    """D10: the node's contact-requirement policy. Defensive — a config read
    failure (pre-setup node, test env) defaults to off."""
    try:
        return bool(effective_config().get("require_contact", False))
    except Exception:
        return False


@router.post("/signup")
def signup(data: Signup):
    """Create a user account."""
    username = data.username.lower()
    if not kosher(username):
        raise exceptions.BAD_USERNAME
    if not data.password or not data.password.strip():
        raise exceptions.BAD_PASSWORD
    if _require_contact() and not (data.phone or "").strip() and not (data.email or "").strip():
        raise exceptions.CONTACT_REQUIRED
    password_hash = get_password_hash(data.password)
    result = ch.create_user(
        username=username,
        password_hash=password_hash,
        phone=data.phone or "",
        email=data.email or "",
    )
    if not result:
        raise exceptions.EXISTS
    return result


@router.post("/login")
def login(data: Login):
    """Verify credentials, return JWT."""
    username = data.username.lower()
    if not ch.authenticate_user(username, data.password):
        raise exceptions.LOGIN
    import app.settings as settings

    token_data = {
        "username": username,
        "provider": settings.PROVIDER,
        "site": settings.PROVIDER,
        "credential_kind": "self",
        "expires": (datetime.now(UTC) + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    }
    return {"token": encode_token(token_data)}
