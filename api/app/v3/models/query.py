from pydantic import BaseModel, Field


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
    """

    token: str | None = None
    sql: str = Field(min_length=1)
    groups: list[str] | None = None
