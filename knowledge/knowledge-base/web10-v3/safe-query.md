# The Safe Query (Flexible-Read Boundary)

[implemented] — `api/app/v3/services/safe_query.py`, tests in
`api/tests/test_safe_query.py`. The design discussion is in `query-engine.md`.

A caller (an app, on behalf of a user) writes a ClickHouse `SELECT`. The node
runs it **only** over the caller's own groups. This doc is how that works and
why the guarantee holds.

## The one-sentence guarantee

> A caller's query can only read the **boundary CTEs** (service-named,
> filtered to the caller's readable groups) or CTEs derived from them. The raw
> tables (`documents`, `doc_groups`, `group_members`, …) are **unreachable**
> from the caller's query.

That is a **wall, not a membrane**: the raw tables are not "filtered out of the
output" — they are simply not reachable as inputs.

## How it works (five steps)

The caller's SQL string is **never executed**. It is:

1. **Parsed** into an AST (`sqlglot`, ClickHouse dialect). Unparseable →
   rejected. More than one statement (stacked `;`) → rejected.
2. **Type-checked**: only a single `SELECT` (or set operation) is allowed.
   `INSERT` / `UPDATE` / `DELETE` / `DROP` / … → rejected.
3. **Walked**: every `Table` node in the tree — including inside caller CTEs
   and subqueries — is checked:
   - empty name (a **table function**: `file()`, `numbers()`, `s3()`) →
     rejected (an escape hatch off the node);
   - a **raw node table** (`documents`, `doc_groups`, …) → rejected;
   - an **ungranted / unknown** table → rejected;
   - a **granted service** (`posts`, `comments`, …) → noted (a boundary CTE is
     needed);
   - a **caller-defined CTE** → allowed (it is derived from services).
4. **Compiled**: for each service the query uses, the API builds a **boundary
   CTE** — the service's docs, deduped, joined to `doc_groups`, filtered to the
   caller's readable groups for that service — and injects it **first** (so
   caller CTEs that reference a service resolve). The caller's query is
   re-emitted from the validated AST after the CTEs.
5. **Round-tripped**: the compiled SQL is re-parsed and must come back as
   exactly one statement (a malformed injection would break this).

The boundary CTE for a service looks like:

```sql
posts AS (
  SELECT d.doc_id, d.author_key, d.body, d.ref_value, d.tags, d.created_at, d.updated_at
  FROM (
    SELECT doc_id, author_key, body, ref_value, tags, created_at, updated_at
    FROM documents
    WHERE collection_name = 'posts' AND deleted = 0
    QUALIFY row_number() OVER (PARTITION BY doc_id, author_key ORDER BY updated_at DESC) = 1
  ) d
  JOIN (
    SELECT doc_id, group_id FROM doc_groups WHERE deleted = 0
    QUALIFY row_number() OVER (PARTITION BY doc_id, group_id ORDER BY updated_at DESC) = 1
  ) dg ON d.doc_id = dg.doc_id
  WHERE dg.group_id IN (<the caller's readable groups for posts>)
    -- block/sharing/hidden, as NOT IN / tuple-NOT IN (see "Why NOT IN, not
    -- LEFT ANTI JOIN"):
    AND d.author_key NOT IN (<user_blacklist: authors the reader blocked>)
    AND (d.author_key, dg.group_id) NOT IN (<group_blacklist: blocked in this group>)
    AND NOT (d.author_key != <reader> AND (d.author_key, dg.group_id) IN (<user_group_sharing: paused in this group>))
    AND (d.doc_id, dg.group_id) NOT IN (<group_hidden_docs: hidden in this group>)
)
```

The caller's `SELECT … FROM posts` now reads that CTE. `posts` is no longer the
raw table — it is the caller's own groups, and nothing else.

**Why `NOT IN`, not `LEFT ANTI JOIN`.** The block/sharing/hidden filters are
`NOT IN` / tuple-`NOT IN` subqueries, not `LEFT ANTI JOIN`. A ClickHouse 24.8
bug breaks CTE inlining when the CTE body combines a `JOIN` with a
`LEFT ANTI JOIN` — the CTE's output columns become unresolvable
(`UNKNOWN_IDENTIFIER`), so *any* query over the service 400s. The `NOT IN`
forms are semantically identical (verified against a live node, including the
empty-subquery "no blocks → keep all" case and the sharing-pause self-exempt)
and inline cleanly. The column mapping is the anti-join's `ON` clause,
transposed: `ub.user_key = d.author_key AND ub.blocked_key = reader` becomes
`d.author_key NOT IN (SELECT user_key … WHERE blocked_key = reader)`.

## Why the guarantee holds

**The boundary is on the input, not the output.** This is the whole thing. If
you instead wrapped the caller's query and filtered the *output*
(`SELECT * FROM (caller) WHERE <group filter>`), the caller's query would have
*already read the raw table* inside the parens, and a filter on the output
couldn't undo an aggregation that baked everyone's data in:

```sql
-- caller "query": counts everyone's comments, then the outer filter is too late
SELECT author_key, count(*) FROM documents WHERE collection_name='comments' GROUP BY author_key
```

Redirecting the *input* (the caller reads the CTE, never the raw table) makes
that impossible: there is no raw table in the caller's query to aggregate over,
join, or subquery. The CTE is already filtered, so aggregation, self-joins, and
subqueries all stay inside the boundary.

**String injection is neutralized by construction.** The attacks that break
string-wrapping — stacked statements, comment blocks, "gibberish" — are all
attacks on the *string*. Here the string is resolved into a tree *before* any
check runs, so there is no string boundary to jump out of:
- `; DROP TABLE` → two statements → rejected at step 1.
- `/* … */` / `--` → stripped by the parser before the walk; a hidden table ref
  is still a real `Table` node in the tree → caught at step 3.
- gibberish → parse error → rejected at step 1.

**Table functions are the one non-`Table` escape, and they're caught.**
`file('/etc/passwd')` would read off the node. In the AST it surfaces as a
`Table` with an **empty name** — rejected at step 3.

## What is pinned (the tests)

`api/tests/test_safe_query.py` pins each facet — the "rejected" tests are the
membrane that must not leak:

| facet | test |
|---|---|
| boundary CTE injected + group-filtered | `test_simple_service_query_gets_boundary_cte` |
| empty groups → empty CTE, not error | `test_no_readable_groups_degrades_to_empty_not_error` |
| cross-service self-join | `test_self_join_across_services_injects_both_ctes` |
| caller CTE ordering (service first) | `test_caller_cte_referencing_service_orders_correctly` |
| raw table rejected (top / subquery / caller CTE / qualified) | `test_raw_table*`, `test_qualified_raw_table_rejected` |
| table function rejected | `test_table_function_rejected` |
| stacked statements rejected | `test_stacked_statements_rejected` |
| comment can't hide a raw table | `test_comment_cannot_hide_a_raw_table` |
| unknown / system / ungranted table rejected | `test_unknown_table_rejected`, `test_system_table_rejected`, `test_ungranted_service_rejected` |
| non-SELECT rejected | `test_non_select_rejected` |
| unparseable rejected | `test_unparseable_rejected` |
| aggregation can't leak past the boundary | `test_aggregation_cannot_leak_past_the_boundary` |

## The honest caveat

The guarantee rests on **sqlglot parsing the ClickHouse SQL faithfully**. Two
failure modes and their backstops:

- **Unparseable query** → rejected (safe). A query sqlglot can't read is not
  run.
- **Mis-parsed query** (sqlglot reads a construct wrong and hides a table ref)
  → the **round-trip re-parse** (step 5) is the backstop: the compiled SQL must
  re-parse to exactly one statement. This catches a malformed result, not a
  subtle semantic mis-parse — so the residual risk is "sqlglot's ClickHouse
  dialect is incomplete in a way that hides a table reference." That is the
  one thing to keep watching as sqlglot evolves; the pinned tests are the
  tripwire.

The **ClickHouse account is not a backstop** here: the boundary CTEs
legitimately reference `documents` + `doc_groups`, so the service account must
read them. The boundary is the rewriter, full stop.

## Wiring it in

`build_safe_query` is the boundary. It is wired two ways:

1. **`POST /v3/query`** (`api/app/v3/endpoints/query.py`) — the flexible read
   endpoint. The caller's `SELECT` + the app-contract-granted services →
   `query_services()` (which services the query touches) → `readable_groups()`
   per service (the D58 read gate) → `build_safe_query(...)` → `execute_query()`.
   Anon-capable (a missing token reads as the node's `anon` member, the public
   board — D41). The SDK exposes it as `w.query(sql, { groups? })`.
2. **The `ref` filter on the group read** (`read_docs_by_ref`) — the fixed
   "give me the comments/reactions for these posts" shape, compiled through the
   same engine so it carries the full boundary.

Both paths share the boundary; neither can reach the raw tables.
