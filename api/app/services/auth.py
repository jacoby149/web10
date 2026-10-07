import json
import logging
from datetime import UTC, datetime
from urllib.parse import urlsplit

import bcrypt
import jwt

import app.settings as settings
from app.models.auth import Token, TokenData

# bcrypt's algorithm only ever consumes the first 72 bytes of a password.
# bcrypt >= 4.1 enforces that limit by raising ValueError on longer input
# instead of silently truncating, which is the correct behavior — we truncate
# here so the API behaves identically to the old passlib path (which relied
# on the silent truncation) and so no caller ever hits the ValueError.
_BCRYPT_MAX_BYTES = 72


def _to_bcrypt_bytes(value: str) -> bytes:
    return value.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bcrypt_bytes(plain_password), hashed_password.encode("utf-8"))
    except ValueError:
        # Malformed hash (not a valid bcrypt string) — treat as no match.
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_to_bcrypt_bytes(password), bcrypt.gensalt()).decode("utf-8")


logger = logging.getLogger(__name__)


def _utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def validate_app_origin(origin: str) -> str:
    try:
        parsed = urlsplit(origin)
        host = parsed.hostname
        port = parsed.port
        if (
            not isinstance(origin, str)
            or not host
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Not an origin")
        local = host in ("localhost", "127.0.0.1", "::1") or host.endswith(".localhost")
        if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
            raise ValueError("Insecure app origin")
        authority = f"[{host}]" if ":" in host else host
        if port is not None and port != (443 if parsed.scheme == "https" else 80):
            authority += f":{port}"
        if origin != f"{parsed.scheme}://{authority}":
            raise ValueError("Non-canonical origin")
    except (ValueError, TypeError, AttributeError):
        raise jwt.InvalidTokenError("Invalid app origin")
    return origin


def encode_token(payload: dict) -> str:
    payload = {**payload, "iss": settings.PROVIDER}
    if settings.AUTH_SIGNING_KEY:
        public_jwks()  # Validate the configured key before issuing credentials.
        return jwt.encode(payload, settings.AUTH_SIGNING_KEY, algorithm="RS256", headers={"kid": settings.AUTH_KEY_ID})
    if not settings.PRIVATE_KEY or settings.PRIVATE_KEY == "8cbec8....." or settings.ALGORITHM != "HS256":
        raise RuntimeError("Configure AUTH_SIGNING_KEY or an explicit HS256 PRIVATE_KEY")
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm="HS256")


def public_jwks() -> dict:
    if not settings.AUTH_SIGNING_KEY:
        return {"keys": []}
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    key = load_pem_private_key(settings.AUTH_SIGNING_KEY.encode(), password=None).public_key()
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

    if not isinstance(key, RSAPublicKey) or key.key_size < 2048:
        raise RuntimeError("AUTH_SIGNING_KEY must be an RSA key of at least 2048 bits")
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key))
    public.update(kid=settings.AUTH_KEY_ID, use="sig", alg="RS256")
    return {"keys": [public]}


def verified_payload(token: str) -> dict:
    # Headers select only locally configured keys. Never follow jku/x5u/provider.
    header = jwt.get_unverified_header(token)
    if settings.AUTH_SIGNING_KEY and header.get("alg") == "RS256":
        if header.get("kid") != settings.AUTH_KEY_ID:
            raise jwt.InvalidTokenError("Unknown signing key")
        key = jwt.PyJWK.from_dict(public_jwks()["keys"][0]).key
        return jwt.decode(token, key, algorithms=["RS256"])
    if settings.AUTH_SIGNING_KEY:
        try:
            allowed = _utc(settings.AUTH_LEGACY_VERIFY_UNTIL) > datetime.now(UTC)
        except (ValueError, TypeError):
            allowed = False
        if not allowed:
            raise jwt.InvalidTokenError("Legacy verification disabled")
    if not settings.PRIVATE_KEY or settings.PRIVATE_KEY == "8cbec8....." or settings.ALGORITHM != "HS256":
        raise jwt.InvalidTokenError("Legacy signing key unavailable")
    return jwt.decode(token, settings.PRIVATE_KEY, algorithms=["HS256"])


def decode_token(token: str, private_key: bool = True) -> TokenData:
    # Keep the shipped keyword, but it can no longer disable verification.
    payload = verified_payload(token)
    if payload.get("provider") != settings.PROVIDER or payload.get("iss", settings.PROVIDER) != settings.PROVIDER:
        logger.warning("[auth] rejected non-local issuer")
        raise jwt.InvalidTokenError("Non-local issuer")
    if not isinstance(payload.get("username"), str) or not payload["username"].strip():
        raise jwt.InvalidTokenError("Missing username")
    if payload.get("purpose") is not None:
        raise jwt.InvalidTokenError("Not a session token")
    # Ambiguous shipped sessions must log in again; their authority cannot be
    # reconstructed from site, Origin, or the caller's requested operation.
    if payload.get("credential_kind") == "app":
        validate_app_origin(payload.get("app_origin"))
    elif payload.get("credential_kind") != "self" or payload.get("app_origin") is not None:
        raise jwt.InvalidTokenError("Invalid credential kind; log in again")
    if payload.get("target") not in (None, settings.PROVIDER):
        raise jwt.InvalidTokenError("Wrong target node")
    if payload["username"] != "anon" or payload.get("expires") is not None:
        try:
            expiry = _utc(payload.get("expires"))
        except (ValueError, TypeError):
            raise jwt.InvalidTokenError("Invalid expiry")
        if expiry <= datetime.now(UTC):
            logger.info("[auth] rejected expired session")
            raise jwt.ExpiredSignatureError("Expired session")
    token_data = TokenData()
    token_data.populate_from_payload(payload)
    return token_data


def certify_with_remote_provider(token: Token) -> bool:
    # Foreign principals cannot safely map to the current bare local usernames.
    raise jwt.InvalidTokenError("Federation identity migration not available")


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
    except (jwt.exceptions.PyJWTError, ValueError, TypeError):
        raise Exception("TOKEN")
    return True


def check_admin(token: Token, required_capability: str | None = None) -> bool:
    # Admin = the token's user is on this node's admin list (config.admins,
    # or settings.DEFAULT_ADMINS until one is saved). Being the owner of your
    # own collection is NOT enough — the config is node-global, so on a shared
    # node any user would otherwise be able to edit Stripe keys, CORS, etc.
    from app.services import config as config_svc

    if not token.token:
        raise Exception("NOT_ADMIN")
    certify(token)  # verifies signature, provider, and expiry (raises TOKEN)
    decoded = decode_token(token.token, private_key=True)  # verified claims (I2)
    if decoded.credential_kind == "app":
        if required_capability not in ("moderate", "manageMonetization"):
            raise Exception("NOT_ADMIN")
        from app.v3.endpoints.auth_helper import require_app_permission

        require_app_permission(token, "node", required_capability)
    if decoded.provider != settings.PROVIDER or not config_svc.is_admin(decoded.username):
        raise Exception("NOT_ADMIN")
    return True
