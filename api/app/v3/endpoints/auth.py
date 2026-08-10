from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import decode_token, get_password_hash, verify_password
from app.v3.models import (
    ChangePass,
    ChangePhone,
    Login,
    SetEmail,
    SetRecoveryPhone,
    Signup,
    VerifyCode,
)
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

from app.v3.endpoints.auth_helper import user as _user

router = APIRouter(tags=["auth"])


@router.post("/signup")
async def signup(data: Signup):
    """Create a user account."""
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


@router.post("/change-pass")
async def change_pass(data: ChangePass):
    """Change password."""
    user = _user(data)
    if not ch.authenticate_user(user, data.password):
        raise exceptions.LOGIN
    ch.change_password(user, get_password_hash(data.new_pass))
    return {"status": "changed"}


@router.post("/change-phone")
async def change_phone(data: ChangePhone):
    """Change phone number."""
    user = _user(data)
    ch.change_phone(user, data.phone)
    return {"phone": data.phone}


@router.post("/set-email")
async def set_email(data: SetEmail):
    """Set recovery email."""
    user = _user(data)
    ch.set_email(user, data.email)
    return {"email": data.email}


@router.post("/verify-phone")
async def verify_phone(data: VerifyCode):
    """Verify phone number with code."""
    user = _user(data)
    ch.verify_phone(user)
    return {"phone_verified": True}


@router.post("/verify-email")
async def verify_email(data: VerifyCode):
    """Verify email with code."""
    user = _user(data)
    ch.verify_email(user)
    return {"email_verified": True}


@router.post("/profile")
async def get_profile(data: TokenOnly):
    """Get user profile."""
    user = _user(data)
    profile = ch.get_user_profile(user)
    if not profile:
        raise exceptions.ENTRY_NOT_FOUND
    return profile


@router.post("/send_code")
async def send_code(data: TokenOnly):
    """Send a verification code to the user's phone."""
    user = _user(data)
    phone = ch.get_phone_number(user)
    if not phone:
        raise exceptions.PHONE_NUMBER_MISSING
    from app.services import twilio as mobile

    return mobile.send_verification(phone, user)


@router.post("/set_recovery_phone")
async def set_recovery_phone(data: SetRecoveryPhone):
    """Set the recovery phone on the authenticated user's profile."""
    decoded = decode_token(data.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    import re

    _PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{5,18}[0-9]$")
    if not _PHONE_RE.match(data.phone):
        raise exceptions.BAD_NUM
    ch.change_phone(decoded.username, data.phone)
    return {"phone_number": data.phone}
