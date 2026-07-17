from datetime import datetime, timedelta

import jwt
import requests

import app.models as models
import app.mongo as mongo
import app.settings as settings


def decode_token(token: str, verify: bool = False) -> dict:
    """Decode a web10 JWT token."""
    if verify:
        payload = jwt.decode(token, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
    else:
        payload = jwt.decode(token, options={"verify_signature": False})
    return payload


def anon_token_data() -> dict:
    """Return anonymous token data."""
    return {
        "username": "anon",
        "provider": settings.PROVIDER,
        "target": settings.PROVIDER,
    }


def certify(token_str: str) -> bool:
    """Verify a token was signed by this provider and is not expired."""
    try:
        if token_str is None:
            return True
        payload = decode_token(token_str, verify=True)
        if payload.get("provider") != settings.PROVIDER:
            return False
        if payload.get("username") is None:
            return False
        username = payload.get("username")
        expires = payload.get("expires")
        if username != "anon" and expires:
            if datetime.utcnow() > datetime.fromisoformat(expires):
                return False
    except Exception:
        return False
    return True


def certify_with_remote_provider(token_str: str) -> bool:
    """Ask a remote provider to certify a token."""
    try:
        payload = decode_token(token_str, verify=False)
        provider = payload.get("provider", "")
        url = f"{provider}/certify"
        response = requests.post(url, json={"token": token_str}, timeout=5)
        return response.status_code == 200
    except Exception:
        return False


def is_permitted(token_str: str | None, username: str, service: str, action: str) -> bool:
    """
    Check if a token is permitted to perform an action on a user's service.
    Mirrors the logic in api/app/main.py:is_permitted.
    """
    if token_str is not None:
        try:
            decoded = decode_token(token_str, verify=False)
        except Exception:
            return False
    else:
        decoded = anon_token_data()

    # Certify the token
    if decoded.get("provider") == settings.PROVIDER:
        certified = certify(token_str)
    else:
        certified = certify_with_remote_provider(token_str)

    if not certified:
        return False

    target = decoded.get("target")
    if not target:
        return decoded.get("username") == username and decoded.get("provider") == settings.PROVIDER

    if target != settings.PROVIDER:
        return False

    token_username = decoded.get("username")
    token_site = decoded.get("site")
    token_provider = decoded.get("provider")

    if token_username == "anon" or (token_site and mongo.is_in_cross_origins(token_site, username, service)):
        if mongo.get_approved(token_username, token_provider, username, service, action):
            return True
    return False
