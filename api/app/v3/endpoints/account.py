import logging
import re

from fastapi import APIRouter

import app.exceptions as exceptions
from app.services.auth import get_password_hash
from app.v3.endpoints.auth_helper import self_user as _user
from app.v3.models import (
    ChangePass,
    ChangePhone,
    SetEmail,
    SetRecoveryPhone,
    VerifyCode,
)
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["account"])
logger = logging.getLogger(__name__)


def _self_user(data) -> str:
    return _user(data)


@router.post("/change-pass")
def change_pass(data: ChangePass):
    """Change password."""
    user = _user(data)
    if not ch.authenticate_user(user, data.password):
        raise exceptions.LOGIN
    ch.change_password(user, get_password_hash(data.new_pass))
    return {"status": "changed"}


@router.post("/change-phone")
def change_phone(data: ChangePhone):
    """Change phone number."""
    user = _self_user(data)
    if not re.fullmatch(r"\+?[0-9][0-9 ()-]{5,18}[0-9]", data.phone):
        raise exceptions.BAD_NUM
    ch.change_phone(user, data.phone)
    logger.info("[account] phone replacement stored unverified")
    return {"phone": data.phone}


@router.post("/set-email")
def set_email(data: SetEmail):
    """Set recovery email."""
    user = _self_user(data)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data.email):
        raise exceptions.BAD_CONTACT
    ch.set_email(user, data.email)
    logger.info("[account] email replacement stored unverified")
    return {"email": data.email}


@router.post("/verify-phone")
def verify_phone(data: VerifyCode):
    """Verify phone number with code."""
    user = _self_user(data)
    phone = ch.get_phone_number(user)
    if not phone:
        raise exceptions.PHONE_NUMBER_MISSING
    from app.services import twilio as mobile

    logger.info("[account] checking phone OTP")
    mobile.check_verification(re.sub(r"\D", "", phone), data.code)
    if ch.get_phone_number(user) != phone:
        raise exceptions.CONTACT_NOT_LINKED
    ch.verify_phone(user)
    logger.info("[account] phone OTP approved; contact verified")
    return {"phone_verified": True}


@router.post("/verify-email")
def verify_email(data: VerifyCode):
    """Verify email with code."""
    user = _self_user(data)
    profile = ch.get_user_profile(user)
    email = profile.get("email") if profile else None
    if not email:
        raise exceptions.BAD_CONTACT
    from app.services import twilio as mobile

    logger.info("[account] checking email OTP")
    mobile.check_verification(email, data.code)
    current = ch.get_user_profile(user)
    if not current or current.get("email") != email:
        raise exceptions.CONTACT_NOT_LINKED
    ch.verify_email(user)
    logger.info("[account] email OTP approved; contact verified")
    return {"email_verified": True}


@router.post("/profile")
def get_profile(data: TokenOnly):
    """Get user profile."""
    user = _user(data)
    profile = ch.get_user_profile(user)
    if not profile:
        raise exceptions.NO_USER
    return profile


@router.post("/send_code")
def send_code(data: TokenOnly):
    """Send a verification code to the user's phone."""
    user = _self_user(data)
    phone = ch.get_phone_number(user)
    if not phone:
        raise exceptions.PHONE_NUMBER_MISSING
    from app.services import twilio as mobile

    logger.info("[account] sending phone OTP")
    result = mobile.send_verification(re.sub(r"\D", "", phone))
    logger.info("[account] phone OTP sent")
    return result


@router.post("/set_recovery_phone")
def set_recovery_phone(data: SetRecoveryPhone):
    """Set the recovery phone on the authenticated user's profile."""
    change_phone(ChangePhone(token=data.token, phone=data.phone))
    return {"phone_number": data.phone}
