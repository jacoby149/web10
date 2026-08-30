import re
import time

from fastapi import APIRouter

import app.exceptions as exceptions
import app.settings as settings
from app.services.auth import get_password_hash
from app.v3.models import RecoveryComplete, RecoveryRequest, RecoveryVerify
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["recovery"])

# The recovery flow is unauthenticated — the phone number + the 6-digit code are
# the credential. The "aggressive code" policy (the doc's Phase 2): 6-digit
# length stays (phones handle it well), the aggression is in the POLICY:
#   - 90s expiry + 3 max attempts  -> Twilio Verify SERVICE settings (console)
#   - 1 send / 60s, 5 / hour       -> the thin in-endpoint guard below (backstop
#     against hammering the send endpoint, which costs a real SMS each time)
_PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{5,18}[0-9]$")
_SEND_WINDOW_S = 3600
_MAX_PER_HOUR = 5
_MIN_GAP_S = 60

# phone -> [send timestamps within the last hour]. Best-effort, per-worker.
_send_log: dict[str, list[float]] = {}


def _digits(phone: str) -> str:
    """Normalize a phone to digits (Twilio's `to` is built as '+' + digits)."""
    return re.sub(r"\D", "", phone or "")


def _kosher_phone(phone: str) -> bool:
    return bool(_PHONE_RE.match(phone or ""))


def _check_send_rate_limit(phone: str) -> None:
    """Thin per-phone send rate-limit. Raises RATE_LIMIT when exceeded."""
    now = time.time()
    recent = [t for t in _send_log.get(phone, []) if now - t < _SEND_WINDOW_S]
    if len(recent) >= _MAX_PER_HOUR or (recent and now - recent[-1] < _MIN_GAP_S):
        raise exceptions.RATE_LIMIT
    _send_log[phone] = recent + [now]


def _mint_token(username: str, site: str | None) -> str:
    """Mint a JWT in the exact shape /v3/login returns."""
    from datetime import datetime, timedelta

    import jwt

    token_data = {
        "username": username,
        "provider": settings.PROVIDER,
        "site": site or "web10",
        "expires": (datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    }
    return jwt.encode(token_data, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@router.post("/recovery/request")
def recovery_request(data: RecoveryRequest):
    """Send a 6-digit code to the phone. Unauthenticated.

    No existence oracle: the response is the same whether or not the number is
    registered (a real send only happens for a registered number, but that is
    not revealed).
    """
    if not _kosher_phone(data.phone):
        raise exceptions.BAD_NUM
    _check_send_rate_limit(_digits(data.phone))
    accounts = ch.get_users_by_phone(data.phone)
    if accounts:
        from app.services import twilio as mobile

        # The code is per-phone (not per-user); the username is only a
        # substitution in the SMS body.
        mobile.send_verification(_digits(data.phone), accounts[0]["username"])
    return {"sent": True}


@router.post("/recovery/verify")
def recovery_verify(data: RecoveryVerify):
    """Check the code and return every account on that phone.

    This is the "which account are you signing into?" list. Gated on a valid
    code — the username list is never returned before the code is verified.
    """
    if not _kosher_phone(data.phone):
        raise exceptions.BAD_NUM
    from app.services import twilio as mobile

    mobile.check_verification(_digits(data.phone), data.code)  # raises WRONG_CODE
    accounts = ch.get_users_by_phone(data.phone)
    if not accounts:
        raise exceptions.NO_USER
    return {"accounts": accounts}


@router.post("/recovery/complete")
def recovery_complete(data: RecoveryComplete):
    """Re-verify the code, confirm the picked username is on that phone, sign in.

    The code is re-checked here (it is the credential for the whole flow, not a
    one-shot from verify). The username is re-checked against the phone so a
    forged username can't be used to sign in as / reset someone else. An
    optional new_password resets the account; the returned token signs the user
    in either way (the reset is an offer, not a gate).
    """
    if not _kosher_phone(data.phone):
        raise exceptions.BAD_NUM
    from app.services import twilio as mobile

    mobile.check_verification(_digits(data.phone), data.code)  # raises WRONG_CODE
    accounts = ch.get_users_by_phone(data.phone)
    if not any(a["username"] == data.username for a in accounts):
        raise exceptions.TOKEN
    if data.new_password is not None:
        if not data.new_password.strip():
            raise exceptions.BAD_PASSWORD
        ch.change_password(data.username, get_password_hash(data.new_password))
    return {"token": _mint_token(data.username, data.site), "username": data.username}
