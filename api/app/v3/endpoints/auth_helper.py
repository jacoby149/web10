import logging

import jwt
from fastapi import HTTPException

import app.exceptions as exceptions
from app.services import auth as _auth
from app.services.auth import (
    _check_token_expiry,
    _remote_cache_get,
    _token_ttl_seconds,
    decode_token,
)

_log = logging.getLogger(__name__)


def _certify_foreign(token: str) -> None:
    """Cross-node certification (D84 Phase B) for a token whose provider is
    not this node. The home node is the only authority on its own tokens:
    ask it (with a cached yes — see services/auth.py) and re-check the
    expiry locally. The answer certifies IDENTITY ONLY (I6); every access
    decision still runs in the caller's permission checks.

    Raises TOKEN on any failure — a bad credential is never downgraded.
    """
    # Referenced as _auth.<name> (attribute lookup at call time) so test
    # patches on the services.auth module apply here too.
    try:
        cached = _remote_cache_get(token)
        if cached is None:
            ok = _auth.certify_with_remote_provider(_auth.Token(token=token))
            if ok:
                decoded = decode_token(token, private_key=False)
                ttl = _token_ttl_seconds(decoded.expires)
                _auth._remote_cache_set(token, True, ttl if ttl and ttl > 0 else _auth._REMOTE_NEGATIVE_TTL_S)
                _log.info("[auth] remote certify ok (principal path) provider=%s", decoded.provider)
            else:
                _auth._remote_cache_set(token, False, _auth._REMOTE_NEGATIVE_TTL_S)
                _log.info("[auth] remote certify denied (principal path)")
            cached = ok
        if not cached:
            raise exceptions.TOKEN
        decoded = decode_token(token, private_key=False)
        _check_token_expiry(decoded)
    except jwt.exceptions.PyJWTError:
        raise
    except Exception as e:
        # A denied remote certification (the home node said no) raises the
        # TOKEN *instance* (an HTTPException, not a class) — re-raise it as-is
        # so the 401 handler maps it. Anything else is a transport/parse
        # failure: deny, never pass.
        if isinstance(e, HTTPException):
            raise
        _log.warning("[auth] remote certify failed (principal path): %s", type(e).__name__)
        raise exceptions.TOKEN from None


def _is_foreign(token: str) -> bool:
    """Does this token name a provider other than this node? Unsigned
    metadata read — a routing hint only, never authority (I2)."""
    try:
        meta = decode_token(token, private_key=False)
    except Exception:
        return False
    return bool(meta.provider) and meta.provider != _auth.settings.PROVIDER


def user(data) -> str:
    """Extract username from JWT. Raises TOKEN if invalid or anon."""
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token, private_key=True)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    return decoded.username


def principal(data) -> str:
    """Reader key for permission checks (D84 Phase B).

    Local readers retain the bare key used by local membership writers until
    Phase A migrates them together. Foreign readers use the full
    ``{provider}/users/{username}`` and never borrow a local namesake's rows.

    Raises TOKEN if invalid or anon — same contract as :func:`user`.
    """
    if not data.token:
        raise exceptions.TOKEN
    foreign = _is_foreign(data.token)
    if foreign:
        _certify_foreign(data.token)
        decoded = decode_token(data.token, private_key=False)
    else:
        try:
            decoded = decode_token(data.token, private_key=True)
        except jwt.exceptions.PyJWTError:
            raise exceptions.TOKEN from None
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    return f"{decoded.provider}/users/{decoded.username}" if foreign else decoded.username


def client_id_of(data) -> str | None:
    """The token's OAuth delegation marker (D92), or None.

    A delegated token carries a `client_id` claim; a normal login token does
    not (→ None). Decoding is signature-verified (I2) — a forged client_id
    fails the decode and raises TOKEN. No token → None (anon has no
    delegation). This is the seam the Origin→client_id re-keying (O3) reads.

    Cross-node (D84 Phase B): a foreign token's delegation marker is read
    from the home-node-certified metadata (the claim is bound by A's
    signature, which the /certify call verified).
    """
    if not data.token:
        return None
    if _is_foreign(data.token):
        _certify_foreign(data.token)
        decoded = decode_token(data.token, private_key=False)
    else:
        decoded = decode_token(data.token, private_key=True)
    return decoded.client_id


def user_or_anon(data) -> str:
    """Extract username from JWT, or 'anon' when there is no token.

    Anon is the public surface (the node-default discover group / public
    board). A missing token reads as the node's `anon` member; a present but
    invalid token still raises TOKEN (we don't silently downgrade a bad
    credential to anon). Anon's access stays bounded by group membership
    (I3) — anon can only read groups it is a member of, which on a fresh node
    is the discover group.

    Cross-node (D84 Phase B): a foreign token (provider != this node) is
    certified at its home node before the bare username is returned — the
    same identity-only certification as :func:`principal`.
    """
    if not data.token:
        return "anon"
    if _is_foreign(data.token):
        _certify_foreign(data.token)
        decoded = decode_token(data.token, private_key=False)
    else:
        decoded = decode_token(data.token, private_key=True)
    if not decoded.username or decoded.username == "anon":
        return "anon"
    return decoded.username
