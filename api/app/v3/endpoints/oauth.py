import secrets
import uuid
from datetime import datetime, timedelta

import jwt
from fastapi import APIRouter, HTTPException

import app.exceptions as exceptions
import app.settings as settings
from app.models.auth import Token
from app.services.auth import check_admin, decode_token
from app.v3.models import (
    LookupOauthClient,
    OauthAuthorize,
    OauthToken,
    RegisterOauthClient,
    RevokeOauthClient,
)
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["oauth"])

# Refresh-token lifetime: 60 days (matches the access-token lifetime — a
# long-lived connection is a chain of 60-day rotations, not one token).
_REFRESH_TTL_DAYS = 60
_CODE_TTL_SECONDS = 60


def _validate_redirect_uris(redirect_uris: list[str]) -> None:
    """Redirect URIs must be absolute https URLs (exact-match on redemption)."""
    from urllib.parse import urlparse

    for uri in redirect_uris:
        parsed = urlparse(uri)
        if parsed.scheme != "https" or not parsed.netloc:
            raise exceptions.CRUD


@router.post("/clients/register", tags=["admin"])
def register_oauth_client(data: RegisterOauthClient):
    """Register an OAuth client (D92). Admin only.

    Mints the client_secret (256-bit) and stores the client. The secret is
    returned exactly once — the registry stores it but the list endpoint never
    returns it, so the operator must capture it now.
    """
    check_admin(Token(token=data.token))
    _validate_redirect_uris(data.redirect_uris)
    client_id = data.client_id.strip().lower()
    if not client_id:
        raise exceptions.CRUD
    client_secret = secrets.token_urlsafe(32)
    result = ch.add_oauth_client(client_id, client_secret, data.client_name.strip(), data.redirect_uris)
    return result


@router.post("/clients/list", tags=["admin"])
def list_oauth_clients(data: TokenOnly):
    """List active OAuth clients (admin view). Never returns the secret."""
    check_admin(Token(token=data.token))
    return {"clients": ch.list_oauth_clients()}


@router.post("/clients/lookup")
def lookup_oauth_client(data: LookupOauthClient):
    """Look up an OAuth client by id (the consent flow, O5, consumes this).

    Returns the client's public fields (name + redirect URIs) without the
    secret. A missing or tombstoned client is a 404 — the consent screen
    treats that as "unknown app."
    """
    client = ch.get_oauth_client(data.client_id.strip().lower())
    if client is None:
        raise exceptions.APP_NOT_FOUND
    return {
        "client_id": client["client_id"],
        "client_name": client["client_name"],
        "redirect_uris": client["redirect_uris"],
    }


@router.post("/clients/revoke", tags=["admin"])
def revoke_oauth_client(data: RevokeOauthClient):
    """Revoke (tombstone) an OAuth client. Admin only."""
    check_admin(Token(token=data.token))
    ch.revoke_oauth_client(data.client_id.strip().lower())
    return {"status": "revoked"}


# ---------------------------------------------------------------------------
# Authorize + token (D92, O5/O6/O7) — the authorization-code flow
# ---------------------------------------------------------------------------


def _mint_delegated_token(username: str, client_id: str) -> str:
    """Mint a web10 JWT with the client_id delegation claim (D92). Same four
    claims as a normal login token + client_id. 60-day expiry."""
    token_data = {
        "username": username,
        "provider": settings.PROVIDER,
        "site": "web10",
        "expires": (datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat(),
        "client_id": client_id,
    }
    return jwt.encode(token_data, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _verify_client_secret(client_id: str, client_secret: str) -> None:
    """Constant-time client_secret check. A missing/tombstoned client or a
    wrong secret is invalid_client (401)."""
    client = ch.get_oauth_client(client_id)
    if client is None or not secrets.compare_digest(client["client_secret"], client_secret or ""):
        raise HTTPException(status_code=401, detail="invalid_client")


@router.post("/authorize")
def oauth_authorize(data: OauthAuthorize):
    """The consent entry point (D92 O5). The user's session token
    authenticates; on approval the node mints a single-use, 60s authorization
    code bound to (client_id, username, redirect_uri) and returns it.

    The consent SCREEN (which app, what it can do, approve/deny) is the
    authenticator's surface (O8) — this endpoint is the node-side code mint the
    screen calls after the user approves. redirect_uri must exactly match a
    registered URI; response_type must be 'code' (implicit is rejected).
    """
    if data.response_type != "code":
        raise HTTPException(status_code=400, detail="unsupported_response_type")
    client = ch.get_oauth_client(data.client_id.strip().lower())
    if client is None:
        raise HTTPException(status_code=400, detail="unknown_client")
    if data.redirect_uri not in client["redirect_uris"]:
        raise HTTPException(status_code=400, detail="redirect_uri_mismatch")
    # The user must be signed in (their session token).
    decoded = decode_token(data.token, private_key=True)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    username = decoded.username
    code = secrets.token_urlsafe(32)
    ch.store_oauth_code(code, client["client_id"], username, data.redirect_uri, _CODE_TTL_SECONDS)
    return {"code": code, "state": data.state}


@router.post("/token")
def oauth_token(data: OauthToken):
    """Exchange an authorization code (or a refresh token) for tokens (D92
    O6/O7). The only path that mints tokens with a client_id claim."""
    if data.grant_type == "authorization_code":
        if not data.code or not data.redirect_uri:
            raise HTTPException(status_code=400, detail="invalid_request")
        _verify_client_secret(data.client_id.strip().lower(), data.client_secret)
        username = ch.redeem_oauth_code(data.code, data.client_id.strip().lower(), data.redirect_uri)
        if username is None:
            raise HTTPException(status_code=400, detail="invalid_grant")
        access_token = _mint_delegated_token(username, data.client_id.strip().lower())
        refresh_token = secrets.token_urlsafe(32)
        family_id = str(uuid.uuid4())
        ch.store_refresh_token(refresh_token, data.client_id.strip().lower(), username, family_id, _REFRESH_TTL_DAYS)
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.TOKEN_EXPIRE_MINUTES * 60,
            "refresh_token": refresh_token,
        }
    if data.grant_type == "refresh_token":
        if not data.refresh_token:
            raise HTTPException(status_code=400, detail="invalid_request")
        _verify_client_secret(data.client_id.strip().lower(), data.client_secret)
        row = ch.get_refresh_token(data.refresh_token)
        if row is None:
            raise HTTPException(status_code=400, detail="invalid_grant")
        # Replay detection: a tombstoned token means the family is compromised.
        if row["deleted"]:
            ch.invalidate_token_family(row["family_id"])
            raise HTTPException(status_code=400, detail="invalid_grant")
        if row["client_id"] != data.client_id.strip().lower():
            raise HTTPException(status_code=400, detail="invalid_grant")
        if ch._now() > row["expires_at"]:
            raise HTTPException(status_code=400, detail="invalid_grant")
        new_refresh = secrets.token_urlsafe(32)
        ch.rotate_refresh_token(
            data.refresh_token,
            new_refresh,
            data.client_id.strip().lower(),
            row["username"],
            row["family_id"],
            _REFRESH_TTL_DAYS,
        )
        access_token = _mint_delegated_token(row["username"], data.client_id.strip().lower())
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.TOKEN_EXPIRE_MINUTES * 60,
            "refresh_token": new_refresh,
        }
    raise HTTPException(status_code=400, detail="unsupported_grant_type")
