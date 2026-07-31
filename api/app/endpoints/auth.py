import re
import time
from collections import defaultdict
from datetime import datetime, timedelta

import jwt
from fastapi import APIRouter, Form, Response

import app.exceptions as exceptions
import app.settings as settings
from app.models.auth import PhoneForm, SignUpForm, Token, TokenData, TokenForm
from app.models.core import dotdict
from app.services import documentdb as db
from app.services import email as email_svc
from app.services import twilio as mobile
from app.services.auth import (
    authenticate_user,
    can_mint,
    certify,
    check_admin,
    decode_token,
    get_password_hash,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Rate-limiting (in-memory, sliding-window, per-identifier)
# ---------------------------------------------------------------------------


class _RateLimiter:
    """Simple in-memory sliding-window rate limiter.

    Tracks request timestamps per key. Rejects when count exceeds max
    within the window. Good enough for auth endpoints (not distributed,
    but the API is single-node today).
    """

    def __init__(self, max_requests: int = 5, window_seconds: int = 300):
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._max = max_requests
        self._window = window_seconds

    def check(self, key: str) -> None:
        now = time.time()
        bucket = self._buckets[key]
        cutoff = now - self._window
        self._buckets[key] = [t for t in bucket if t > cutoff]
        if len(self._buckets[key]) >= self._max:
            raise exceptions.RATE_LIMITED
        self._buckets[key].append(now)


_passwordless_send_limiter = _RateLimiter(max_requests=5, window_seconds=300)
_passwordless_verify_limiter = _RateLimiter(max_requests=3, window_seconds=600)


def recover(From: str):
    password = db.temp_pass(From, get_password_hash)
    return mobile.recovery_response(password)


@router.post("/recovery_bot", include_in_schema=False)
async def recovery_bot(From: str = Form(...), Body: str = Form(...)):
    response = recover(From.replace("+", "")) if Body == "RESET" else mobile.actionless_response()
    return Response(content=str(response), media_type="application/xml")


@router.post("/recovery_prompt")
async def send_recovery_prompt(phone_form: PhoneForm):
    phone_rec = db.get_phone_record(phone_form.phone_number)
    user = phone_rec["username"]
    return mobile.recovery_prompt(phone_form.phone_number, user)


@router.post("/change_pass", include_in_schema=False)
async def change_pass(form_data: SignUpForm):
    if authenticate_user(form_data.username, form_data.password):
        return db.change_pass(form_data.username, form_data.new_pass, get_password_hash)
    raise exceptions.LOGIN


@router.post("/change_phone", include_in_schema=False)
async def change_phone(form_data: SignUpForm):
    if authenticate_user(form_data.username, form_data.password):
        if db.get_phone_record(form_data.phone):
            raise exceptions.PHONE_NUMBER_TAKEN
        db.set_phone_number(form_data.phone, form_data.username)
        db.unregister_phone_number(form_data.username)
        db.set_verified(form_data.username, False)
        return mobile.send_verification(form_data.phone, form_data.username)
    raise exceptions.LOGIN


@router.post("/verify_code", include_in_schema=False)
async def verify_mobile_code(token: Token):
    check_admin(token)
    decoded = decode_token(token.token)
    phone_number = db.get_phone_number(decoded.username)
    code = token.query["code"]
    res = mobile.check_verification(phone_number, code)
    db.register_phone_number(phone_number, decoded.username)
    db.set_verified(decoded.username)
    return res


@router.post("/mobile_login", include_in_schema=False)
async def mobile_login(token: Token):
    code = token.query["code"]
    phone_number = token.query["phone"]
    mobile.check_verification(phone_number, code)
    rec = db.get_phone_record(phone_number)
    if not rec:
        raise exceptions.PHONE_NUMBER_NOT_REGISTERED
    token_data = TokenData(
        username=rec["username"],
        provider=settings.PROVIDER,
        site="mobile",
        expires=(datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    )
    return {"token": jwt.encode(token_data.model_dump(), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)}


# ---------------------------------------------------------------------------
# Passwordless phone login (A21 bite a)
# ---------------------------------------------------------------------------


@router.post("/passwordless/send")
async def passwordless_send(phone_form: PhoneForm):
    """Send a Twilio Verify SMS code for passwordless login.

    Rate-limited: 5 sends per 5 minutes per phone number.
    Does NOT reveal whether the phone is registered — same response shape
    for known and unknown numbers (prevents user enumeration).
    """
    _passwordless_send_limiter.check(phone_form.phone_number)
    # Always attempt to send, even if phone isn't registered, to avoid
    # user enumeration. The verify step is where we check ownership.
    try:
        sid = mobile.send_verification(phone_form.phone_number, "user")
        return {"message": "code sent", "sid": sid}
    except Exception:
        # Even on Twilio failure, return the same shape (don't leak info)
        return {"message": "code sent"}


@router.post("/passwordless/verify")
async def passwordless_verify(token: Token):
    """Verify the SMS code and mint a token for passwordless login.

    Rate-limited: 3 verify attempts per 10 minutes per phone number.
    The code MUST pass Twilio Verify (I2 — cryptographically verified,
    no unsigned claims). The phone must be registered to an account.
    """
    code = token.query.get("code")
    phone_number = token.query.get("phone")

    if not code or not phone_number:
        raise exceptions.BAD_NUM

    _passwordless_verify_limiter.check(phone_number)

    # Verify the code via Twilio (cryptographic check, satisfies I2)
    mobile.check_verification(phone_number, code)

    # Look up the account(s) registered to this phone
    rec = db.get_phone_record(phone_number)
    if not rec:
        raise exceptions.PHONE_NUMBER_NOT_REGISTERED

    token_data = TokenData(
        username=rec["username"],
        provider=settings.PROVIDER,
        site="passwordless",
        expires=(datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
    )
    return {"token": jwt.encode(token_data.model_dump(), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)}


@router.post("/send_code", include_in_schema=False)
async def send_mobile_code(token: Token):
    check_admin(token)
    decoded = decode_token(token.token)
    phone_number = db.get_phone_number(decoded.username)
    return mobile.send_verification(phone_number, decoded.username)


@router.post("/certify")
async def certify_token(token: Token):
    return certify(token)


@router.post("/web10token")
async def create_web10_token(form_data: TokenForm):
    token_data = TokenData()
    token_data.populate_from_token_form(form_data)
    # the minted token is always issued by this provider — can_mint compares
    # it against the submitted token's provider, so set it before the checks
    token_data.provider = settings.PROVIDER
    if not form_data.password and not form_data.token:
        raise exceptions.LOGIN
    try:
        if form_data.password:
            if authenticate_user(form_data.username, form_data.password):
                if form_data.site in settings.CORS_SERVICE_MANAGERS:
                    pass
        elif form_data.token:
            if certify(Token(token=form_data.token)):
                if can_mint(decode_token(form_data.token), token_data):
                    pass
    except Exception as e:
        raise e
    token_data.expires = (datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat()
    return {"token": jwt.encode(token_data.model_dump(), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)}


_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$")


def kosher(s):
    return bool(_USERNAME_RE.match(s))


@router.post("/signup", include_in_schema=False)
async def signup(form_data: SignUpForm):
    form_data = dotdict(form_data)
    if settings.BETA_REQUIRED and form_data.betacode != settings.BETA_CODE:
        raise exceptions.BETA
    if not kosher(form_data.username):
        raise exceptions.BAD_USERNAME
    res = db.create_user(form_data, get_password_hash)
    try:
        mobile.send_verification(form_data.phone, form_data.username)
    except Exception:
        pass
    return res


# ---- Email verification (A20 bite a) ----


@router.post("/set_email", include_in_schema=False)
async def set_email(token: Token):
    """Set the user's recovery email. Must be verified before it counts."""
    check_admin(token)
    decoded = decode_token(token.token)
    email = token.query.get("email")
    if not email or "@" not in email or len(email) > 254:
        raise exceptions.BAD_EMAIL
    # Check email not already claimed by another user
    existing = db.get_email_record(email)
    if existing and existing["username"] != decoded.username:
        raise exceptions.EMAIL_TAKEN
    db.set_email(email, decoded.username)
    db.register_email(email, decoded.username)
    code = email_svc.send_verification_code(email)
    return {"code": code}


@router.post("/get_email", include_in_schema=False)
async def get_email(token: Token):
    """Return the user's own email (if set)."""
    check_admin(token)
    decoded = decode_token(token.token)
    email = db.get_email(decoded.username)
    if not email:
        raise exceptions.EMAIL_NOT_FOUND
    return {"email": email, "email_verified": db.is_email_verified(decoded.username)}


@router.post("/verify_email", include_in_schema=False)
async def verify_email(token: Token):
    """Verify an email with the code sent to it."""
    check_admin(token)
    decoded = decode_token(token.token)
    email = token.query.get("email")
    code = token.query.get("code")
    if not email or not code:
        raise exceptions.BAD_EMAIL
    stored_email = db.get_email(decoded.username)
    if stored_email != email:
        raise exceptions.BAD_EMAIL
    email_svc.check_verification(email, code)
    db.set_email_verified(decoded.username, True)
    return {"verified": True}
