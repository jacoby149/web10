from datetime import datetime, timedelta

import jwt
import requests
from passlib.context import CryptContext

from app.models.auth import Token, TokenData
from app.services.documentdb import get_approved, get_user, is_in_cross_origins
import app.settings as settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user:
        raise Exception("LOGIN")
    if not verify_password(password, user.hashed_password):
        raise Exception("LOGIN")
    return user


def decode_token(token: str, private_key: bool = False) -> TokenData:
    if private_key:
        payload = jwt.decode(token, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
    else:
        payload = jwt.decode(token, options={"verify_signature": False})
    token_data = TokenData()
    token_data.populate_from_payload(payload)
    return token_data


def can_mint(submission_token: TokenData, mint_token: TokenData) -> bool:
    if submission_token.username != mint_token.username:
        raise Exception("MINT")
    if not submission_token.site:
        raise Exception("MINT")
    elif submission_token.site not in settings.CORS_SERVICE_MANAGERS:
        if submission_token.site != mint_token.site:
            raise Exception("MINT")
    if submission_token.provider == settings.PROVIDER:
        if submission_token.provider != mint_token.provider:
            raise Exception("MINT")
    else:
        raise Exception("MINT")
    return True


def certify_with_remote_provider(token: Token) -> bool:
    decoded = decode_token(token.token)
    url = f"{decoded.provider}/certify"
    response = requests.post(url, json=token.model_dump())
    return response.status_code == 200


def anon_token() -> TokenData:
    return TokenData(username="anon", provider=settings.PROVIDER, target=settings.PROVIDER)


def certify(token: Token) -> bool:
    try:
        if token.token is None:
            token_data = anon_token()
        else:
            token_data = decode_token(token.token, private_key=True)
        if token_data.provider != settings.PROVIDER:
            raise Exception("TOKEN")
        if token_data.username is None:
            raise Exception("TOKEN")
        if token_data.username != "anon" and datetime.utcnow() > datetime.fromisoformat(token_data.expires):
            raise Exception("TOKEN")
    except Exception:
        raise Exception("TOKEN")
    return True


def is_permitted(token: Token, username: str, service: str, action: str) -> bool:
    if token.token is not None:
        decoded = decode_token(token.token)
    else:
        decoded = anon_token()

    if settings.PROVIDER == decoded.provider:
        certified = certify(token)
    else:
        certified = certify_with_remote_provider(token)

    if certified:
        if not decoded.target:
            if decoded.username == username and decoded.provider == settings.PROVIDER:
                return True
            else:
                return False
        elif decoded.target != settings.PROVIDER:
            return False
        if (
            decoded.username == "anon"
            or decoded.site in settings.CORS_SERVICE_MANAGERS
            or is_in_cross_origins(decoded.site, username, service)
        ):
            if get_approved(decoded.username, decoded.provider, username, service, action):
                return True
    return False


def check_admin(token: Token) -> bool:
    if not is_permitted(token, decode_token(token.token).username, "*", None):
        raise Exception("NOT_ADMIN")
