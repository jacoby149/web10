# The Flexible Read (Query Engine)

[implemented] · **the security boundary is built and wired** — see
`safe-query.md` (how the boundary CTE + AST redirect works and why the
guarantee holds; code in `api/app/v3/services/safe_query.py`). The caller
writes a ClickHouse `SELECT` over service names; the node compiles it through
the engine and runs it. Exposed as `POST /v3/query` + the SDK's `w.query()`.
This doc is the wider discussion: how far to take the power (joins,
aggregations, raw SQL), the query-language fork (resolved: SQL subset), and
the phasing.

How far do we let an app query the node? v2 let an app run any Mongo query
inside a user's collection. v3 has one shared ClickHouse table and a group
boundary. This doc is the discussion of how to restore v2's query power —
flexible filters, **self-joins across services**, aggregations — without
breaking the group security boundary.

## The Problem

**v2 (Mongo):** each user had their own collection. The app ran any Mongo query
inside it — `db.posts.find({ ref: X, tags: Y })`, projections, aggregations.
The collection *was* the security boundary: you own it, query it freely.

**v3 (ClickHouse):** one shared `documents` table. The boundary is **groups**
(`doc_groups` + `group_members` + roles). The current read is a fixed shape:

```
documents JOIN doc_groups WHERE group_id IN (readable groups)
```

No arbitrary filters, no joins, no aggregation beyond the power-mean ranked
read. The `ReadDocuments` model even has a `match: dict` field that is **never
wired** — the filter layer was intended and stopped.

The gap: v2 apps queried their data flexibly; v3 apps can't. We want that power
back — "let people do anything" — but secure: a caller only sees docs in the
groups they can read.

## The Security Boundary (the invariant)

The boundary is the **group-membership JOIN**, not a column predicate:

```
documents d
  JOIN doc_groups dg   ON d.doc_id = dg.doc_id
  JOIN group_members gm ON dg.group_id = gm.group_id
WHERE gm.member_key = <reader>
  AND gm.role grants readAll on <service>
```

It is **dynamic** (membership changes over time) and **JOIN-based** (not a
simple `WHERE col = x`). That one fact drives the design:

- **ClickHouse RLS / account permissions don't fit.** RLS is for static row
  predicates. "Docs in the groups I'm *currently* a member of with readAll on
  this service" is a moving JOIN a per-user ClickHouse role can't express. The
  boundary can't live in ClickHouse.
- **Raw SQL passthrough is unsafe.** Give an app raw ClickHouse and it drops
  the group JOIN and reads everyone. The boundary is gone.

**Therefore the boundary is injected by the API, never written by the caller.**
The API is the gatekeeper; ClickHouse is the execution engine (run as one
service account with full table access).

## The Design: a Constrained Query Compilation Layer

The read endpoint accepts a **structured query spec** (not raw SQL). The API
validates it against a schema, compiles it to parameterized ClickHouse SQL, and
**always injects the group-membership filter on every table, alias, and
subquery the query touches.** The caller controls the shape; the API controls
the boundary.

**What the caller (app) can specify:**
- **service(s)** — which collections to read (gated by the app contract:
  `readAll` on each).
- **filters** — `ref_value = X`, `ref_value IN (…)`, `body.text LIKE …`,
  `tags ∋ Y`, `created_at > T`, …
- **joins** — self-joins on `documents` across services. Each joined alias gets
  its **own** group filter (a join can't be used to reach a group the caller
  can't read).
- **aggregations** — `count()`, `group by ref_value`, `sum`, … (the
  `get_ref_counts` shape, generalized).
- **sort / limit / offset** — bounded (max limit, query timeout).

**What the caller cannot do:**
- Remove or override the group-membership filter (always injected).
- Read a service the app contract doesn't grant `readAll` on.
- Touch a table other than `documents` + the bridge tables (`doc_groups`,
  `group_members`, `group_contracts`).
- Run DDL/DML (read-only).
- Run an unbounded query (limit + timeout enforced).

**The self-join power is the payoff.** An app joins `documents` (service
`posts`) to `documents` (service `comments`) on `ref_value = doc_id`, and to
`documents` (service `media`) on the media ref — all inside the group boundary.
"Join documents of one service to documents of another" is exactly what
ClickHouse is for, and it stays safe because every alias carries its own group
filter.

## Why Not the Alternatives

- **ClickHouse account permissions / RLS** — doesn't fit a dynamic JOIN-based
  boundary (above). The API's compilation is the boundary.
- **Raw SQL passthrough** — unsafe (the caller drops the group filter).
- **Fixed read shapes only** (the current model, one shape at a time) — safe
  but doesn't reach "do anything"; every new shape is a new endpoint. The
  compilation layer generalizes it.

## Phasing

1. **Done — the `ref_value` filter.** `ref_value` / `ref_value IN (…)` on the
   group read, routed through the engine. Fixed the social-app + trending-page
   engagement reads.
2. **Done — the full engine.** The caller writes a ClickHouse `SELECT` over
   service names; the engine compiles it (boundary CTEs + block/sharing/hidden)
   and runs it. Exposed as `POST /v3/query` + `w.query()`. Filters, joins,
   aggregations, subqueries, and caller CTEs all work — the "do anything"
   power, safe because the raw tables are unreachable.
3. **Done — joins + aggregations.** The self-join power (the payoff): an app
   joins `posts` to `comments` on `ref_value = doc_id`, aggregates, sorts — all
   inside the group boundary.

## Performance bounds (enforced)

- **Max rows.** An unbounded query gets `LIMIT 1000` appended server-side
  (`build_safe_query(max_limit=…)`); a caller-supplied `LIMIT` is honored as-is.
- **Query timeout.** `max_execution_time = 10` is passed to ClickHouse.
- **The boundary CTE is the data bound.** A query can only scan the caller's
  readable groups, so the worst case is bounded by the caller's own data — not
  the whole node.
- **Per-user rate limiting (D65, v1).** `/v3/query` is rate-limited per user,
  keyed on the verified `user_key` from the token (not IP — the node sits behind
  a proxy, so XFF is spoofable; D49). In-memory, per-worker (the recovery
  idiom); a user over budget gets a 429. This is the abuse-prevention bound —
  **origin/app approval is curation, not a security boundary** (D64): a scripted
  caller forges `Origin` freely, so the node can't rely on it to stop abuse. The
  real boundary is the user's token + app contract (user-centric).

## Group scoping (deferred)

How a caller scopes *which* groups a read touches. Today: explicit group IDs,
or the client computes the set (the feed is "my groups minus discover"). The
`ref` filter works with that — no schema change needed.

**Deferred: server-side categorical scoping** (`groups: 'communities'`,
`groups: 'followers'`). When a real app asks for "my communities, not my
DMs," the node must resolve a category to group IDs. Two mechanisms, both
parked until an app needs it:

- **`kind` enum on the group contract** — closed, node-known, set at creation
  (`discover` / `followers` / `dm` / `community`). For *scoping*: exact and
  non-gameable (`WHERE kind = 'community'`). D60-compliant if the platform
  stores the app's label without interpreting it. Retires the fragile
  ID-convention parsing (`isFollowersGroup`, `isDmGroup`, …) when it lands.
- **A `group_tags` table** — open, user-set, for *discoverable-by-tag*
  ("groups tagged #chess"). Not for scoping: an open set is fuzzy and
  gameable (a user could tag their own group `community` to match a filter).

Neither is needed for the `ref` filter. Build the `kind` enum only when the
first app asks for categorical scoping; add tags only when an app needs
discoverable-by-tag.

## Resolved (the decisions that landed)

- **Query language: a SQL subset.** The caller writes ClickHouse `SELECT`; the
  engine parses it (sqlglot), validates every table reference, and rewrites the
  services to boundary CTEs. Not a DSL (caps the power), not raw passthrough
  (unsafe) — the rewriting layer is the boundary, and it's a *wall* (the raw
  tables are unreachable), so the parser only has to be complete about table
  refs, not about every SQL construct.
- **Join validation: any join, each alias carries its own filter.** A join is
  just a reference to one or more service CTEs, and each CTE is independently
  group-filtered. A join can't reach a group the caller can't read because each
  side of the join is already bounded. Cross-service self-joins on `ref_value`
  are the common case.
- **App contract interaction:** the query may only touch services the contract
  grants `readAll` on. `query_services()` checks this before any group work —
  an ungranted service is a 403.
- **The "do anything" ceiling:** full ClickHouse `SELECT` (read-only). The
  ceiling is "any read over your groups" — DML/DDL/table-functions/raw-tables
  are rejected. The line doesn't need to move; the boundary is structural.

## The One Assumption

The group-membership JOIN is the **only** security boundary, and it is **always
injected by the API.** Every choice above flows from that: the more power we
give the caller, the more the compiler must guarantee the boundary is applied
to every table, every join, every subquery. The power is the goal; the boundary
is non-negotiable.
