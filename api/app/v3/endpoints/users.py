from fastapi import APIRouter

from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.models import ListPeopleDirectory
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["people"])


@router.post("/directory")
def list_people_directory(data: ListPeopleDirectory):
    """The public people directory (D0): a paged, follower-ranked list of the
    users whose profile face the reader can read (I3).

    Principal-based: a missing token reads as the node's `anon` member (the
    public subset); a valid token reads as that user (their follows + the
    public subset). A user with no readable profile face is absent, not shown
    with a fallback. One round-trip — the node composes list_users + the I3
    read gate + profile faces + follower counts, so the client never fans out
    to N per-user reads.
    """
    principal = user_or_anon(data)
    authenticated = principal != "anon"
    users = ch.list_public_users(principal, authenticated, data.limit, data.offset)
    return {"users": users, "limit": data.limit, "offset": data.offset}
