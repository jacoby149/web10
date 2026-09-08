from pydantic import BaseModel

from app.v3.models.documents import PowerMeanSort


class FeedRequest(BaseModel):
    """The feed read (D69): one page of posts, ranked in SQL, cursor-paged.

    `groups` is the reader's feed groups (the client computes them: my groups
    minus discover — the same set the old `readFeed` passed). The node filters
    them to the readable set (the D58 read gate) before the query.

    `cursor` is the keyset cursor from the previous page's `next_cursor`:
    `{"created_at": <iso>}` for the Newest preset or `{"score": <float>}` for a
    tuned preset. `None` / omitted = the first page.

    `sort` is the power-mean knob config. `None` / all-zero = the Newest preset
    (chronological — the delivery pitch). A tuned preset ranks in SQL and the
    cursor rides on the score.

    `limit` is the page size (the node fetches `limit + 1` to compute
    `has_more`). Anon-capable: a missing token reads as the node's `anon`
    member (the public board) — the same rule as the read endpoint (D41).
    """

    token: str | None = None
    groups: list[str]
    limit: int = 20
    cursor: dict | None = None
    sort: PowerMeanSort | None = None
