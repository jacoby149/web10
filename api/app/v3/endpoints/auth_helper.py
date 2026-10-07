from contextvars import ContextVar

from fastapi import HTTPException

import app.exceptions as exceptions
from app.services.auth import decode_token

request_origin = ContextVar("request_origin", default=None)


def self_user(data) -> str:
    decoded = decode_token(data.token)
    if decoded.credential_kind != "self" or decoded.username == "anon":
        raise exceptions.TOKEN
    return decoded.username


def app_contract_origin(data, request=None) -> str | None:
    """Self credentials carry owner authority; apps carry a signed origin."""
    decoded = decode_token(data.token)
    if decoded.credential_kind == "self":
        return None
    origin = decoded.app_origin
    supplied = request.headers.get("origin") if request is not None else request_origin.get()
    if supplied not in (None, origin):
        raise HTTPException(status_code=403, detail="Origin does not match app credential")
    from app.v3.services import clickhouse as ch

    if not ch.is_origin_allowed(decoded.username, origin):
        raise HTTPException(status_code=403, detail="App contract missing or revoked")
    return origin


def require_app_permission(data, service: str, operation: str, request=None):
    origin = app_contract_origin(data, request)
    if origin is None:
        return
    from app.v3.services import clickhouse as ch

    decoded = decode_token(data.token)
    permissions = ch.get_app_permissions(decoded.username, origin)
    operations = permissions.get(service, [])
    if service not in ("group", "node", "user", "imports"):
        operations = [*operations, *permissions.get("*", [])]
    if operation not in operations:
        raise HTTPException(status_code=403, detail="App permission denied")


def user(data) -> str:
    """Extract username from JWT. Raises TOKEN if invalid or anon."""
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token, private_key=True)
    app_contract_origin(data)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    return decoded.username


def user_or_anon(data) -> str:
    """Extract username from JWT, or 'anon' when there is no token.

    Anon is the public surface (the node-default discover group / public
    board). A missing token reads as the node's `anon` member; a present but
    invalid token still raises TOKEN (we don't silently downgrade a bad
    credential to anon). Anon's access stays bounded by group membership
    (I3) — anon can only read groups it is a member of, which on a fresh node
    is the discover group.
    """
    if not data.token:
        return "anon"
    decoded = decode_token(data.token, private_key=True)
    app_contract_origin(data)
    if not decoded.username or decoded.username == "anon":
        return "anon"
    return decoded.username
