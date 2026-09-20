from pydantic import BaseModel


class ListPeopleDirectory(BaseModel):
    """The public people directory (D0, discover-reorg).

    ``token`` is optional: a missing token reads as the node's ``anon`` member
    (the public subset); a valid token reads as that user (their follows + the
    public subset). Same card shape either way — only the permissions differ.
    """

    token: str | None = None
    limit: int = 20
    offset: int = 0
