import re

from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import get_password_hash
from app.v3.models import Login, Signup
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$")


def kosher(s: str) -> bool:
    """Validate username format."""
    return bool(_USERNAME_RE.match(s))


@router.post("/signup")
async def signup(data: Signup):
    """Create a user account."""
    if not kosher(data.username):
        raise exceptions.BAD_USERNAME
    if not data.password or not data.password.strip():
        raise exceptions.BAD_PASSWORD
    password_hash = get_password_hash(data.password)
    result = ch.create_user(
        username=data.username,
        password_hash=password_hash,
        phone=data.phone or "",
        email=data.email or "",
    )
    if not result:
        raise exceptions.EXISTS
    return result


@router.post("/login")
async def login(data: Login):
    """Verify credentials, return JWT."""
    if not ch.authenticate_user(data.username, data.password):
        raise exceptions.LOGIN
    from datetime import datetime, timedelta

    import jwt

    import app.settings as settings

    token_data = {
        "username": data.username,
        "provider": settings.PROVIDER,
        "site": data.site or "web10",
        "expires": (datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    }
    return {"token": jwt.encode(token_data, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)}
