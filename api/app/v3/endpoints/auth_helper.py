import app.exceptions as exceptions
from app.services.auth import decode_token


def user(data) -> str:
    """Extract username from JWT. Raises TOKEN if invalid or anon."""
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token)
    if not decoded.username or decoded.username == "anon":
        raise exceptions.TOKEN
    return decoded.username
