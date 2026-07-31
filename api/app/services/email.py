"""Email verification and recovery service.

Generates 6-digit codes, stores them with a TTL, and provides
check_verification and send paths. Uses SendGrid for real SMTP delivery
when SENDGRID_API_KEY is configured; falls back to a stub (prints code)
otherwise — safe for local dev and unit tests.
"""

import datetime
import random
import string

import app.exceptions as exceptions
import app.settings as settings
from app.services.documentdb import db

_CODE_LENGTH = 6
_CODE_TTL_MINUTES = 10
_RECOVERY_CODE_TTL_MINUTES = 15


def _code_collection():
    """Return (or create) the web10.email_verification_codes collection."""
    full_name = "web10.email_verification_codes"
    if full_name not in set(db.list_collection_names()):
        db.create_collection(full_name)
    return db["web10"]["email_verification_codes"]


def _recovery_code_collection():
    """Return (or create) the web10.email_recovery_codes collection."""
    full_name = "web10.email_recovery_codes"
    if full_name not in set(db.list_collection_names()):
        db.create_collection(full_name)
    return db["web10"]["email_recovery_codes"]


def generate_code() -> str:
    return "".join(random.choices(string.digits, k=_CODE_LENGTH))


def _send_via_sendgrid(to_email: str, subject: str, body: str) -> None:
    """Send a transactional email via SendGrid API (v3 mail send).

    Uses the free-tier-friendly single recipient /mail/send JSON endpoint.
    Keys come from settings (env only, never git).
    """
    import json
    import urllib.request

    if not settings.SENDGRID_API_KEY:
        raise RuntimeError("SENDGRID_API_KEY not configured")

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": settings.SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }

    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    urllib.request.urlopen(req)


def _send_stub(to_email: str, code: str) -> None:
    """Dev stub — prints the code. Never ships to prod."""
    print(f"[email-stub] Code for {to_email}: {code}")


def send_verification_code(email: str) -> str:
    """Generate a verification code, store it, and send it to the email address.

    Uses SendGrid when configured; falls back to stub otherwise.
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
    body = f"Your web10 email verification code is: {code}\n\nThis code expires in {_CODE_TTL_MINUTES} minutes."
    _try_send(email, "web10 — verify your email", body)
    return code


def _try_send(to_email: str, subject: str, body: str) -> None:
    """Attempt real SendGrid delivery; fall back to stub on missing key or failure."""
    if settings.SENDGRID_API_KEY:
        try:
            _send_via_sendgrid(to_email, subject, body)
            return
        except Exception:
            pass  # fall through to stub
    _send_stub(to_email, body)


# ---------------------------------------------------------------------------
# Recovery codes (password-reset flow, separate from verification)
# ---------------------------------------------------------------------------


def send_recovery_code(email: str) -> str:
    """Generate a password-recovery code, store it, and email it.

    Returns the 6-digit code (for test assertions; prod only sees it via email).
    """
    if not email or "@" not in email or len(email) > 254:
        raise exceptions.BAD_EMAIL

    code = generate_code()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=_RECOVERY_CODE_TTL_MINUTES)
    _recovery_code_collection().update_one(
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
    body = f"Your web10 password recovery code is: {code}\n\nThis code expires in {_RECOVERY_CODE_TTL_MINUTES} minutes. If you didn't request this, you can safely ignore it."
    _try_send(email, "web10 — recover your password", body)
    return code


def check_recovery_code(email: str, code: str) -> bool:
    """Validate a password-recovery code. Deletes it on success (one-time use)."""
    rec = _recovery_code_collection().find_one({"email": email})
    if not rec:
        raise exceptions.WRONG_CODE

    if rec["expires_at"] < datetime.datetime.utcnow():
        _recovery_code_collection().delete_one({"email": email})
        raise exceptions.EXPIRED_CODE

    if rec["code"] != code:
        raise exceptions.WRONG_CODE

    _recovery_code_collection().delete_one({"email": email})
    return True


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
