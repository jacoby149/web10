import app.exceptions as exceptions
from app.services.auth import decode_token


def user(data) -> str:
    """Extract username from JWT. Raises TOKEN if invalid or anon."""
    if not data.token:
        raise exceptions.TOKEN
    decoded = decode_token(data.token, private_key=True)
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
    if not decoded.username or decoded.username == "anon":
        return "anon"
    return decoded.username
