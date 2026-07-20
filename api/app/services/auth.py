import ipaddress
from datetime import datetime
from urllib.parse import urlparse

import jwt
import requests
from passlib.context import CryptContext

import app.settings as settings
from app.models.auth import Token, TokenData
from app.services.documentdb import get_approved, get_user, is_in_cross_origins

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


def _is_private_ip(host: str) -> bool:
    """Return True if host resolves to a private, loopback, or link-local address."""
    try:
        addr = ipaddress.ip_address(host)
        return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast
    except ValueError:
        pass
    # DNS name — reject obvious internal hosts
    lower = host.lower()
    return lower in ("localhost", "localhost.localdomain") or lower.endswith(".local")


def _validate_provider_url(url: str) -> str:
    """Validate a provider URL before any outbound fetch.

    Raises Exception("TOKEN") on any violation.
    """
    if not url or len(url) > 2048:
        raise Exception("TOKEN")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise Exception("TOKEN")
    host = parsed.hostname
    if not host:
        raise Exception("TOKEN")
    if _is_private_ip(host):
        raise Exception("TOKEN")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def certify_with_remote_provider(token: Token) -> bool:
    decoded = decode_token(token.token)
    base = _validate_provider_url(decoded.provider)
    url = f"{base}/certify"
    response = requests.post(url, json=token.model_dump(), timeout=10)
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
    except (jwt.exceptions.PyJWTError, ValueError, TypeError):
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
    # Admin = the token's user is on this node's admin list (config.admins,
    # or settings.DEFAULT_ADMINS until one is saved). Being the owner of your
    # own collection is NOT enough — the config is node-global, so on a shared
    # node any user would otherwise be able to edit Stripe keys, CORS, etc.
    from app.services import config as config_svc

    if not token.token:
        raise Exception("NOT_ADMIN")
    certify(token)  # verifies signature, provider, and expiry (raises TOKEN)
    decoded = decode_token(token.token, private_key=True)  # verified claims (I2)
    if decoded.provider != settings.PROVIDER or not config_svc.is_admin(decoded.username):
        raise Exception("NOT_ADMIN")
    return True
