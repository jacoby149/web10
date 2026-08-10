import re
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


def recover(From: str):
    password = db.temp_pass(From, get_password_hash)
    return mobile.recovery_response(password)


@router.post("/recovery_bot", include_in_schema=False)
async def recovery_bot(From: str = Form(...), Body: str = Form(...)):
    response = recover(From.replace("+", "")) if Body == "RESET" else mobile.actionless_response()
    return Response(content=str(response), media_type="application/xml")


@router.post("/recovery_prompt", tags=["auth"])
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


@router.post("/send_code", include_in_schema=False)
async def send_mobile_code(token: Token):
    check_admin(token)
    decoded = decode_token(token.token)
    phone_number = db.get_phone_number(decoded.username)
    return mobile.send_verification(phone_number, decoded.username)


@router.post("/certify", tags=["auth"])
async def certify_token(token: Token):
    return certify(token)


@router.post("/web10token", tags=["auth"])
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


@router.post("/signup", tags=["auth"], include_in_schema=False)
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


# ---- Recovery phone (B9 bite a-fix) ----

# In-memory per-user rate limit for /set_recovery_phone: 5 saves per hour.
# Process-local (single-node default); enough to stop scripted phone churn.
_RECOVERY_PHONE_MAX = 5
_RECOVERY_PHONE_WINDOW = timedelta(hours=1)
_recovery_phone_attempts: dict[str, list[datetime]] = {}

_PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{5,18}[0-9]$")


def _rate_limit_recovery_phone(username: str):
    now = datetime.utcnow()
    attempts = [t for t in _recovery_phone_attempts.get(username, []) if now - t < _RECOVERY_PHONE_WINDOW]
    if len(attempts) >= _RECOVERY_PHONE_MAX:
        raise exceptions.RATE_LIMIT
    attempts.append(now)
    _recovery_phone_attempts[username] = attempts


@router.post("/set_recovery_phone", tags=["account"], include_in_schema=False)
async def set_recovery_phone(token: Token):
    """Set the recovery phone on the authenticated user's own star record.

    Any certified (non-anon) token may set its OWN user's phone — this is the
    B9 nudge's save path, so it must work for every user, not just node
    admins (unlike /set_email, no admin gate). The username always comes from
    the verified token — a token can only ever set its own owner's phone,
    never another user's. v0: the phone is stored UNVERIFIED (the
    twilio-verify upgrade rides A21).
    """
    if not token.token:
        raise exceptions.TOKEN
    certify(Token(token=token.token))  # signature, provider, expiry (raises TOKEN)
    decoded = decode_token(token.token, private_key=True)  # verified claims (I2)
    if decoded.username == "anon":
        raise exceptions.TOKEN
    phone = (token.query.get("phone") or "").strip()
    if not _PHONE_RE.match(phone):
        raise exceptions.BAD_NUM
    _rate_limit_recovery_phone(decoded.username)
    db.set_phone_number(phone, decoded.username)
    return {"phone_number": phone}


# ---- Email verification (A20 bite a) ----


@router.post("/set_email", tags=["account"], include_in_schema=False)
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


@router.post("/get_email", tags=["account"], include_in_schema=False)
async def get_email(token: Token):
    """Return the user's own email (if set)."""
    check_admin(token)
    decoded = decode_token(token.token)
    email = db.get_email(decoded.username)
    if not email:
        raise exceptions.EMAIL_NOT_FOUND
    return {"email": email, "email_verified": db.is_email_verified(decoded.username)}


@router.post("/verify_email", tags=["account"], include_in_schema=False)
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
