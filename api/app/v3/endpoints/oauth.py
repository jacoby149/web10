import secrets

from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
from app.services.auth import check_admin
from app.v3.models import LookupOauthClient, RegisterOauthClient, RevokeOauthClient
from app.v3.models.common import TokenOnly
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["oauth"])


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
