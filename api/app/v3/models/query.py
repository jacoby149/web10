from pydantic import BaseModel, Field


class PrepareFace(BaseModel):
    """The author's face resolution (D73): presign a media field from a
    (JOINed) face body, author-scoped, and set it on a row field.

    For a query that JOINs the author's profile service, this is the avatar:
    ``bodyField`` is the column holding the profile body, ``mediaField`` the
    field in it that is a media ref (``avatar_ref``), ``authorColumn`` the
    author to scope the presign to (defaults to the row's ``author_key``), and
    ``urlField`` the row field to set with the presigned URL (defaults to
    ``avatar_url``).
    """

    bodyField: str
    mediaField: str
    authorColumn: str | None = None
    urlField: str = "avatar_url"


class PrepareSpec(BaseModel):
    """The engine's prepare pass (D73): which post-query minting passes to run
    on the result rows, so a single ``w.query()`` returns render-ready rows.

    The passes operate on the rows the SELECT returned (the boundary CTEs
    already proved the reader can read them) — they mint capabilities only for
    docs in the result, never beyond (no escalation). Each is access-bound:
    ``media`` presigns author-scoped + mints per-reader HLS sigs; ``ads``
    attaches the I3-checked pinned + node ad; ``face`` presigns the author's
    face media. All universal primitives (D44/D49/D55/D57).
    """

    media: bool | None = None
    ads: bool | None = None
    face: PrepareFace | None = None


class QueryRequest(BaseModel):
    """A caller-written ClickHouse SELECT, run over the caller's groups only.

    The flexible read (query-engine.md / safe-query.md): the app writes a
    SELECT over service names (``posts``, ``comments``, ...), the node
    compiles it through the safe-query engine (boundary CTEs + block/
    sharing/hidden anti-joins) and runs it. Read-only by construction — the
    engine rejects anything but a single SELECT, raw tables, and table
    functions before anything executes.

    `token` is optional: a missing token reads as the node's `anon` member
    (the public board), the same rule as the group read (D41: the node is
    readable by design).

    `groups` (optional): the group IDs to scope the read to. Omitted = all
    the reader's groups (the "me" semantics of the group read).

    `sql` is the caller's query. Service names are the only tables it may
    reference; each is replaced by an API-built boundary CTE filtered to the
    reader's readable groups for that service. Aggregations, self-joins,
    subqueries, and caller CTEs are all allowed — the raw tables are simply
    unreachable, so none of them can leak past the boundary.

    `prepare` (optional, D73): the post-query minting pass — presign media +
    mint HLS sigs + attach ads + resolve the author's face on the result rows,
    so the query returns render-ready rows in one round-trip (the feed-as-query
    pattern; retires the bespoke ``/v3/feed``).
    """

    token: str | None = None
    sql: str = Field(min_length=1)
    groups: list[str] | None = None
    prepare: PrepareSpec | None = None
