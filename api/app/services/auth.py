import ipaddress
import json
import logging
import socket
import ssl
import threading
import time
from collections import OrderedDict
from datetime import UTC, datetime
from urllib.parse import urlparse

import bcrypt
import jwt
import urllib3

import app.settings as settings
from app.models.auth import Token, TokenData

log = logging.getLogger(__name__)

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


def _check_token_expiry(data: TokenData) -> None:
    if data.username == "anon":
        return
    try:
        expires = datetime.fromisoformat(data.expires)
    except (TypeError, ValueError):
        raise jwt.InvalidTokenError("invalid token expiry") from None
    # Node minters use naive UTC; offset-bearing ISO timestamps denote the
    # same absolute deadline. A valid signature alone never makes it fresh.
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if datetime.now(UTC) >= expires:
        raise jwt.ExpiredSignatureError("token expired")


def decode_token(token: str, private_key: bool = True) -> TokenData:
    if private_key:
        payload = jwt.decode(token, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
    else:
        payload = jwt.decode(token, options={"verify_signature": False})
    token_data = TokenData()
    token_data.populate_from_payload(payload)
    if private_key:
        _check_token_expiry(token_data)
    return token_data


def _validate_provider_url(url: str) -> str:
    """Derive HTTPS transport without changing the exact provider principal.

    Production JWTs carry host-only providers. An explicit HTTPS URL may also
    carry a node base path. HTTP cannot authenticate an issuer. DNS/address
    validation and connection pinning happen immediately before the POST.
    """
    if not url or len(url) > 2048 or any(ord(c) <= 32 or ord(c) >= 127 for c in url):
        raise Exception("TOKEN")
    if any(c in url for c in "\\?#"):
        raise Exception("TOKEN")
    if "://" not in url:
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme != "https" or not url.startswith("https://"):
        raise Exception("TOKEN")
    host = parsed.hostname
    if not host or "%" in host or parsed.username is not None or parsed.password is not None:
        raise Exception("TOKEN")
    if parsed.netloc.endswith(":") or parsed.port == 0 or parsed.params:
        raise Exception("TOKEN")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def certify_with_remote_provider(token: Token) -> bool:
    decoded = decode_token(token.token, private_key=False)  # Untrusted destination metadata, not local authority.
    parsed = urlparse(_validate_provider_url(decoded.provider))
    host, port = parsed.hostname, parsed.port or 443
    # Resolve once, reject mixed public/private answers, then connect only to
    # that validated numeric address. TLS still verifies the issuer hostname.
    addresses = [
        ipaddress.ip_address(answer[4][0]) for answer in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    ]
    if not addresses or any(
        not addr.is_global
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
        or (isinstance(addr, ipaddress.IPv6Address) and (addr.ipv4_mapped or addr.sixtofour or addr.teredo))
        for addr in addresses
    ):
        raise Exception("TOKEN")
    pool = urllib3.HTTPSConnectionPool(
        str(addresses[0]),
        port=port,
        server_hostname=host,
        assert_hostname=host,
        cert_reqs=ssl.CERT_REQUIRED,
        timeout=urllib3.Timeout(connect=3, read=10),
        retries=False,
    )
    response = None
    authority = f"[{host}]" if ":" in host else host
    if port != 443:
        authority += f":{port}"
    try:
        log.info("[auth] remote certify request: validated HTTPS destination")
        response = pool.urlopen(
            "POST",
            parsed.path.rstrip("/") + "/certify",
            body=json.dumps({"token": token.token}).encode(),
            headers={"Host": authority, "Content-Type": "application/json"},
            redirect=False,
            retries=False,
            preload_content=False,
        )
        log.info("[auth] remote certify response status=%d", response.status)
        return response.status == 200
    finally:
        if response is not None:
            response.close()
        pool.close()


# --- Cross-node certification cache (D84 Phase B — live /certify model) ----
#
# A foreign node's "yes" is cached until the token's own expiry: a JWT is a
# fixed signed artifact, so once the home node has certified it, the answer
# cannot change before the token dies (revocation propagates at token
# lifetime — the same bound the read path already concedes for issued
# capabilities). Negative answers get a short fixed TTL so a forged or
# revoked token does not hammer the home node per request.

_REMOTE_CACHE_MAX = 4096
_REMOTE_NEGATIVE_TTL_S = 30.0
_remote_cache: "OrderedDict[str, tuple[float, bool]]" = OrderedDict()
_remote_cache_lock = threading.Lock()


def _remote_cache_get(token_str: str) -> bool | None:
    with _remote_cache_lock:
        entry = _remote_cache.get(token_str)
        if entry is None:
            return None
        expires_at, ok = entry
        if time.monotonic() >= expires_at:
            del _remote_cache[token_str]
            return None
        _remote_cache.move_to_end(token_str)
        return ok


def _remote_cache_set(token_str: str, ok: bool, ttl_s: float) -> None:
    with _remote_cache_lock:
        _remote_cache[token_str] = (time.monotonic() + ttl_s, ok)
        _remote_cache.move_to_end(token_str)
        while len(_remote_cache) > _REMOTE_CACHE_MAX:
            _remote_cache.popitem(last=False)


def clear_remote_certify_cache() -> None:
    """Test hook — drop all cached remote certification results."""
    with _remote_cache_lock:
        _remote_cache.clear()


def _token_ttl_seconds(expires_iso: str | None) -> float | None:
    """Seconds remaining until the token's ISO expiry, or None when the
    expiry is absent/unparseable (the caller then falls back to the
    negative-entry TTL)."""
    if not expires_iso:
        return None
    try:
        expires = datetime.fromisoformat(expires_iso)
    except (TypeError, ValueError):
        return None
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return (expires - datetime.now(UTC)).total_seconds()


def anon_token() -> TokenData:
    return TokenData(username="anon", provider=settings.PROVIDER, target=settings.PROVIDER)


def certify(token: Token) -> bool:
    try:
        if token.token is None:
            token_data = anon_token()
        else:
            # The unsigned provider selects the verifier, never authority.
            # An independent node's signature cannot pass our local key.
            token_data = decode_token(token.token, private_key=False)
            foreign = bool(token_data.provider) and token_data.provider != settings.PROVIDER
            if foreign:
                _check_token_expiry(token_data)
                # Cross-node certification (D84 Phase B): the home node is
                # the only authority on its own tokens. Ask it (with a
                # cached yes) — the answer certifies IDENTITY ONLY (I6);
                # every access decision still runs locally below and in the
                # caller's permission checks.
                cached = _remote_cache_get(token.token)
                if cached is None:
                    ok = certify_with_remote_provider(token)
                    if ok:
                        ttl = _token_ttl_seconds(token_data.expires)
                        _remote_cache_set(token.token, True, ttl if ttl and ttl > 0 else _REMOTE_NEGATIVE_TTL_S)
                        log.info(
                            "[auth] remote certify ok provider=%s username=%s",
                            token_data.provider,
                            token_data.username,
                        )
                    else:
                        _remote_cache_set(token.token, False, _REMOTE_NEGATIVE_TTL_S)
                        log.info("[auth] remote certify denied provider=%s", token_data.provider)
                    cached = ok
                if not cached:
                    raise Exception("TOKEN")
            else:
                token_data = decode_token(token.token, private_key=True)
                if token_data.provider != settings.PROVIDER:
                    raise Exception("TOKEN")
            if token_data.username is None:
                raise Exception("TOKEN")
            _check_token_expiry(token_data)
            # OAuth 2.0 delegation (D92): a token carrying a client_id is a
            # delegated token — the client must exist and be active (not
            # tombstoned). Tokens without a client_id (the popup flow) skip this
            # check entirely — today's behavior, byte-for-byte.
            if token_data.client_id and not foreign:
                from app.v3.services import clickhouse as ch

                if ch.get_oauth_client(token_data.client_id) is None:
                    raise Exception("TOKEN")
    except (jwt.exceptions.PyJWTError, ValueError, TypeError, OSError, urllib3.exceptions.HTTPError):
        raise Exception("TOKEN") from None
    return True


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
