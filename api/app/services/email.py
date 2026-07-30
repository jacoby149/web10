"""Email verification service — mirrors the Twilio Verify shape.

Generates a 6-digit code, stores it with a TTL, and provides a
check_verification path. The actual SMTP send is a stub (bite b hooks
up the real transactional provider).
"""

import datetime
import random
import string

import app.exceptions as exceptions
from app.services.documentdb import db

_CODE_LENGTH = 6
_CODE_TTL_MINUTES = 10


def _code_collection():
    """Return (or create) the web10.email_verification_codes collection."""
    full_name = "web10.email_verification_codes"
    if full_name not in set(db.list_collection_names()):
        db.create_collection(full_name)
    return db["web10"]["email_verification_codes"]


def generate_code() -> str:
    return "".join(random.choices(string.digits, k=_CODE_LENGTH))


def send_verification_code(email: str) -> str:
    """Generate a verification code and store it for the given email.

    In bite a this is a stub that stores the code (visible in logs for
    testing). Bite b replaces the stub with real SMTP delivery.
    """
    if not email or "@" not in email or len(email) > 254:
        raise exceptions.BAD_EMAIL

    code = generate_code()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=_CODE_TTL_MINUTES)
    _code_collection().update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "code": code,
                "expires_at": expires_at,
                "created_at": datetime.datetime.utcnow(),
            }
        },
        upsert=True,
    )
    # STUB: real SMTP send goes here in bite b.
    print(f"[email-verification-stub] Code for {email}: {code}")
    return code


def check_verification(email: str, code: str) -> bool:
    """Check a verification code against the stored one for the email."""
    rec = _code_collection().find_one({"email": email})
    if not rec:
        raise exceptions.WRONG_CODE

    if rec["expires_at"] < datetime.datetime.utcnow():
        _code_collection().delete_one({"email": email})
        raise exceptions.EXPIRED_CODE

    if rec["code"] != code:
        raise exceptions.WRONG_CODE

    _code_collection().delete_one({"email": email})
    return True
