from datetime import datetime, timedelta

import jwt
from fastapi import APIRouter, Form, Response

import app.exceptions as exceptions
import app.settings as settings
from app.models.auth import PhoneForm, SignUpForm, Token, TokenData, TokenForm
from app.models.core import dotdict
from app.services import documentdb as db
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


def kosher(s):
    return s == "".join([c for c in s if c.isalnum() or c in ["-"]])


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
