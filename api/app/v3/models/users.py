from typing import Literal

from pydantic import BaseModel, Field


class ListPeopleDirectory(BaseModel):
    """The public people directory (D0, discover-reorg).

    ``token`` is optional: a missing token reads as the node's ``anon`` member
    (the public subset); a valid token reads as that user (their follows + the
    public subset). Same card shape either way — only the permissions differ.
    """

    token: str | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    sort: Literal["popular", "newest"] = "popular"
