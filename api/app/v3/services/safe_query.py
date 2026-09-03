"""
The flexible read (query engine) — the security boundary for caller-written
ClickHouse queries.

The guarantee
-------------
A caller's query can only reference:

  * **service names** (``posts``, ``comments``, ``reactions``, ...) — each is
    replaced by a *boundary CTE* the API builds, filtered to the caller's
    readable groups for that service (the group-membership JOIN); and
  * **CTEs the caller defines** in its own ``WITH`` clause — which may only
    reference other service names / caller CTEs, never raw tables.

It may NOT reference:

  * **raw node tables** (``documents``, ``doc_groups``, ``group_members``,
    ...) — the node's infrastructure;
  * **a service it is not granted** (not in ``allowed_services``);
  * **any other table** (system tables, unknowns);
  * **table functions** (``file()``, ``numbers()``, ``s3()`` — an escape
    hatch off the node);
  * **anything but a single SELECT** (stacked statements, DML, DDL).

The raw string is never executed. It is parsed into an AST, every table
reference is checked, the boundary CTEs are injected (API-built), and the
result is re-emitted. Because the boundary is on the *input* tables (the CTEs
the caller's query reads from) — not a filter on the *output* — aggregation,
self-joins, and subqueries cannot leak past it: the raw tables are simply
unreachable from the caller's query.

Why this is a wall and not a membrane
-------------------------------------
String-level injection (stacked statements, comment blocks, "gibberish") is
neutralized because the parser resolves the string into a tree *before* any
check runs — there is no string boundary to jump out of. The one thing that
must hold is **completeness**: the walk must catch every table reference,
including inside caller CTEs and subqueries. ``find_all(exp.Table)`` visits
every node, and table functions (the one non-``Table`` escape) surface as a
``Table`` with an empty name, which is rejected.

Honest caveat
-------------
The guarantee rests on sqlglot parsing the ClickHouse SQL faithfully. An
unparseable query is rejected (safe). A query sqlglot mis-parses in a way that
hides a table reference would be the failure mode — the round-trip re-parse at
the end is the backstop that catches a malformed result.
"""

from __future__ import annotations

import sqlglot
from sqlglot import exp

DIALECT = "clickhouse"

# Node infrastructure tables a caller's query must never reference directly.
# The boundary CTEs (API-built) reference ``documents`` + ``doc_groups`` to
# apply the group filter; the caller's query cannot.
RAW_TABLES = frozenset(
    {
        "documents",
        "doc_groups",
        "group_contracts",
        "group_members",
        "group_join_requests",
        "group_hidden_docs",
        "user_blacklist",
        "group_blacklist",
        "user_group_sharing",
        "app_contracts",
        "provider_service_contracts",
        "service_contracts",
        "users",
        "moderation_flags",
        "node_config",
    }
)

# The columns a boundary CTE exposes. A caller can only select from these;
# asking for anything else is a (safe) column-not-found error.
_CTE_COLUMNS = "doc_id, author_key, body, ref_value, tags, created_at, updated_at"


class UnsafeQueryError(Exception):
    """A caller's query references something it must not. The query is
    rejected and nothing is executed."""


def _quote_group_ids(group_ids: list[str]) -> str:
    """Quote group IDs into a SQL ``IN`` list. Group IDs are node-generated
    (never caller input), so this is safe; the quoting is defense-in-depth
    against a stray quote."""
    return ", ".join(f"'{g.replace(chr(39), chr(39) * 2)}'" for g in group_ids)


def _boundary_cte_sql(service: str, readable_groups: list[str]) -> str:
    """The body of the boundary CTE for ``service``: the service's docs,
    deduped (ReplacingMergeTree latest-row, not-deleted), joined to
    ``doc_groups``, filtered to ``readable_groups`` (the caller's groups where
    their role grants readAll on this service — computed by the caller via the
    D58 read gate, passed in here).

    No readable groups → a shape-valid CTE that returns nothing (``1 = 0``),
    so a granted-but-empty service degrades to empty, not an error.
    """
    dedup_docs = (
        f"SELECT {_CTE_COLUMNS} FROM documents "
        f"WHERE collection_name = '{service}' AND deleted = 0 "
        f"QUALIFY row_number() OVER (PARTITION BY doc_id, author_key "
        f"ORDER BY updated_at DESC) = 1"
    )
    dedup_groups = (
        "SELECT doc_id, group_id FROM doc_groups WHERE deleted = 0 "
        "QUALIFY row_number() OVER (PARTITION BY doc_id, group_id "
        "ORDER BY updated_at DESC) = 1"
    )
    if not readable_groups:
        return f"SELECT {_CTE_COLUMNS} FROM ({dedup_docs}) d WHERE 1 = 0"
    return (
        f"SELECT d.doc_id, d.author_key, d.body, d.ref_value, d.tags, "
        f"d.created_at, d.updated_at FROM ({dedup_docs}) d "
        f"JOIN ({dedup_groups}) dg ON d.doc_id = dg.doc_id "
        f"WHERE dg.group_id IN ({_quote_group_ids(readable_groups)})"
    )


def _caller_cte_names(tree: exp.Expression) -> set[str]:
    """The names of CTEs the caller defines in its own WITH clause."""
    return {cte.alias_or_name for cte in tree.find_all(exp.CTE) if cte.alias_or_name}


def _validate(tree: exp.Expression, allowed: frozenset[str], caller_ctes: set[str]) -> set[str]:
    """Walk every table reference in the caller's query. Reject raw tables,
    table functions (empty name), ungranted services, and unknown tables.
    Return the set of services the query actually uses (for CTE injection)."""
    needed: set[str] = set()
    for table in tree.find_all(exp.Table):
        name = table.name
        if not name:
            # A Table with no name is a table function (file(), numbers(),
            # s3(), ...) — an escape hatch off the node. Reject.
            raise UnsafeQueryError("table functions are not allowed")
        if name in RAW_TABLES:
            raise UnsafeQueryError(f"query references raw table '{name}'")
        if name in allowed:
            needed.add(name)
        elif name in caller_ctes:
            continue  # caller-defined CTE, derived from services
        else:
            raise UnsafeQueryError(f"query references unknown table '{name}'")
    return needed


def build_safe_query(
    user_sql: str,
    readable_groups_by_service: dict[str, list[str]],
    allowed_services: frozenset[str] | set[str] | None = None,
) -> str:
    """Compile a caller's ClickHouse SELECT into a boundary-enforced query.

    Args:
        user_sql: the caller's query. May reference service names and
            caller-defined CTEs; must not reference raw tables, table
            functions, or ungranted services.
        readable_groups_by_service: for each service, the group IDs the
            caller can read (their role grants readAll there). The API
            computes this via the D58 read gate and passes it in.
        allowed_services: the services the caller may query (from the app
            contract). Defaults to the keys of ``readable_groups_by_service``.

    Returns:
        The final SQL — the boundary CTEs (API-built, group-filtered) followed
        by the caller's query. Service CTEs are ordered first so caller CTEs
        that reference them resolve.

    Raises:
        UnsafeQueryError: the query is unsafe (raw table, table function,
            ungranted/unknown table, non-SELECT, stacked statements, or it
            does not parse).
    """
    allowed = frozenset(allowed_services) if allowed_services is not None else frozenset(readable_groups_by_service)

    # 1. Parse into statements. The raw string is never executed.
    try:
        statements = sqlglot.parse(user_sql, dialect=DIALECT)
    except sqlglot.errors.ParseError as e:
        raise UnsafeQueryError(f"query does not parse: {e}") from e
    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise UnsafeQueryError(f"expected exactly one statement, got {len(statements)}")
    tree = statements[0]

    # 2. Only a single SELECT (or set operation) is allowed — no DML/DDL.
    if not isinstance(tree, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
        raise UnsafeQueryError(f"only SELECT queries are allowed, got {type(tree).__name__}")

    # 3. Validate every table reference; collect the services the query uses.
    caller_ctes = _caller_cte_names(tree)
    needed = _validate(tree, allowed, caller_ctes)

    # 4. Re-emit the (validated) caller query, then inject the boundary CTEs
    #    first so caller CTEs that reference a service resolve.
    caller_sql = tree.sql(dialect=DIALECT).strip()
    cte_defs = ", ".join(
        f"{service} AS ({_boundary_cte_sql(service, readable_groups_by_service.get(service, []))})"
        for service in sorted(needed)
    )
    if not cte_defs:
        final_sql = caller_sql
    elif caller_sql.upper().startswith("WITH "):
        final_sql = f"WITH {cte_defs}, {caller_sql[5:].strip()}"
    else:
        final_sql = f"WITH {cte_defs} {caller_sql}"

    # 5. Round-trip backstop: the result must re-parse as exactly one
    #    statement (a malformed injection would break this).
    try:
        reparsed = [s for s in sqlglot.parse(final_sql, dialect=DIALECT) if s is not None]
    except sqlglot.errors.ParseError as e:
        raise UnsafeQueryError(f"compiled query does not re-parse: {e}") from e
    if len(reparsed) != 1:
        raise UnsafeQueryError("compiled query did not re-parse to a single statement")

    return final_sql
