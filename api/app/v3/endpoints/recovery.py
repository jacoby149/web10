"""Contact-anchored auth (D61) — the front door.

Unauthenticated: the contact (phone OR email) + a 6-digit code are the
credential. Enter contact → code → pick an account on that contact (or create
a new username) → signed in. Sign-up, sign-in, and password-change are the
same flow. The `verify_token` (a short-lived signed JWT minted by `verify`) is
the gate that lets `complete` mint a login token — a raw {contact, username}
can't sign in without it.
"""

import re
import secrets
from datetime import datetime, timedelta

import jwt
from fastapi import APIRouter

import app.exceptions as exceptions
import app.settings as settings
from app.services.auth import get_password_hash
from app.v3.models import RecoveryComplete, RecoveryRequest, RecoveryVerify
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["recovery"])

_PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{5,18}[0-9]$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$")

# The verify_token proves a code was right; it gates `complete`. Short-lived.
_VERIFY_TTL_MINUTES = 5


def _contact_kind(contact: str) -> str:
    """Classify a contact as 'email' or 'phone'. Raises BAD_CONTACT if neither."""
    c = (contact or "").strip()
    if not c:
        raise exceptions.BAD_CONTACT
    if _EMAIL_RE.match(c):
        return "email"
    if _PHONE_RE.match(c):
        return "phone"
    raise exceptions.BAD_CONTACT


def _mint_verify_token(contact: str, kind: str) -> str:
    return jwt.encode(
        {
            "contact": contact,
            "kind": kind,
            "purpose": "recovery",
            "exp": datetime.utcnow() + timedelta(minutes=_VERIFY_TTL_MINUTES),
        },
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )


def _check_verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        raise exceptions.TOKEN
    if payload.get("purpose") != "recovery":
        raise exceptions.TOKEN
    return payload


def _account_has_contact(user: dict, contact: str, kind: str) -> bool:
    field = "email" if kind == "email" else "phone"
    return (user.get(field) or "") == contact


def _mint_login_token(username: str, site: str = "web10") -> str:
    token_data = {
        "username": username,
        "provider": settings.PROVIDER,
        "site": site,
        "expires": (datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    }
    return jwt.encode(token_data, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@router.post("/request")
def request_code(data: RecoveryRequest):
    """Send a 6-digit code to the contact (phone → sms, email → email)."""
    kind = _contact_kind(data.contact)
    from app.services import twilio as mobile

    mobile.send_verification(data.contact.strip(), "")
    return {"sent": True, "kind": kind}


@router.post("/verify")
def verify_code(data: RecoveryVerify):
    """Check the code; return the accounts on the contact + a verify_token.

    An empty account list is valid — it means "no account on this contact yet,
    create one" (the unified sign-up path). The code is the proof of control.
    """
    kind = _contact_kind(data.contact)
    from app.services import twilio as mobile

    mobile.check_verification(data.contact.strip(), data.code)  # raises WRONG_CODE
    users = ch.get_users_by_contact(data.contact.strip())
    return {
        "accounts": [{"username": u["username"], "email": u["email"]} for u in users],
        "verify_token": _mint_verify_token(data.contact.strip(), kind),
    }


@router.post("/complete")
def complete(data: RecoveryComplete):
    """Validate the verify_token, then sign in — or create — the picked account.

    A `new_password` sets the password (the password-change path — no old
    password required). The contact is marked verified on the account.
    """
    payload = _check_verify_token(data.verify_token)
    contact = payload["contact"]
    kind = payload["kind"]

    user = ch.get_user(data.username)
    if user:
        # Existing account — it must actually carry this contact (defense in depth).
        if not _account_has_contact(user, contact, kind):
            raise exceptions.CONTACT_NOT_LINKED
        if data.new_password:
            ch.change_password(data.username, get_password_hash(data.new_password))
    else:
        # New account — create it carrying the verified contact. A random
        # password when none is set, so the contact is the credential.
        if not _USERNAME_RE.match(data.username):
            raise exceptions.BAD_USERNAME
        pw_hash = (
            get_password_hash(data.new_password)
            if data.new_password
            else get_password_hash(secrets.token_urlsafe(24))
        )
        created = ch.create_user(
            data.username,
            pw_hash,
            phone=contact if kind == "phone" else "",
            email=contact if kind == "email" else "",
        )
        if not created:
            raise exceptions.EXISTS
    # Mark the contact verified on the account.
    if kind == "phone":
        ch.verify_phone(data.username)
    else:
        ch.verify_email(data.username)
    return {"token": _mint_login_token(data.username)}
