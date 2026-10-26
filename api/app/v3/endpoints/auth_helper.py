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


def client_id_of(data) -> str | None:
    """The token's OAuth delegation marker (D92), or None.

    A delegated token carries a `client_id` claim; a normal login token does
    not (→ None). Decoding is signature-verified (I2) — a forged client_id
    fails the decode and raises TOKEN. No token → None (anon has no
    delegation). This is the seam the Origin→client_id re-keying (O3) reads.
    """
    if not data.token:
        return None
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
    """
    if not data.token:
        return "anon"
    decoded = decode_token(data.token, private_key=True)
    if not decoded.username or decoded.username == "anon":
        return "anon"
    return decoded.username
