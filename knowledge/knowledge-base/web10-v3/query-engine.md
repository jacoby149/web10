# The Flexible Read (Query Engine)

[open — design discussion] · **the security boundary itself is built** — see
`safe-query.md` (how the boundary CTE + AST redirect works and why the
guarantee holds; code in `api/app/v3/services/safe_query.py`). This doc is the
wider discussion: how far to take the power (joins, aggregations, raw SQL),
the query-language fork, and the phasing.

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

1. **Now — the `ref_value` filter.** Add `ref_value` / `ref_value IN (…)` to
   the group read. Minimal, safe, and it fixes the social-app + trending-page
   engagement reads (both are broken today because `ref_value` is never
   persisted — see `web10-social-v3/engagement.md`). Also wire `get_ref_counts`
   for the feed's engagement counts.
2. **Next — structured filters.** Generalize the read to a filter spec (body
   fields, tags, created_at) compiled to parameterized SQL, group filter always
   injected. This is the `match` field, finally wired.
3. **Later — joins + aggregations.** The full compilation layer: cross-service
   self-joins, aggregations, the "do anything" power. The big one; needs the
   query-language decision below.

## Open Questions (the actual discussion)

- **Query language.** A JSON DSL (structured spec)? A SQL subset (parse +
  validate ClickHouse SQL, inject the group filter)? A passthrough with a
  query-rewriting layer? The trade is expressiveness vs. how hard it is to
  safely validate arbitrary SQL (a rewriting layer that must catch *every* way
  to escape the group filter is a security-critical parser).
- **Join validation.** Which joins are allowed? Same-table self-joins only?
  Cross-service joins on `ref_value`? How do we prove a join can't bypass the
  group filter (each alias must carry its own filter — enforced how)?
- **Performance bounds.** Max limit, max join depth, query timeout, max result
  size. ClickHouse is fast, but a bad query can still DoS a shared node.
- **App contract interaction.** The contract grants per-service `readAll`. A
  multi-service query must have every service granted — how is that checked?
- **The "do anything" ceiling.** Full ClickHouse SQL (rewriting layer) is the
  max power but the hardest to keep safe. A DSL is safer but caps the power.
  Where's the line, and does the line move as trust in the app-contract model
  grows?

## The One Assumption

The group-membership JOIN is the **only** security boundary, and it is **always
injected by the API.** Every choice above flows from that: the more power we
give the caller, the more the compiler must guarantee the boundary is applied
to every table, every join, every subquery. The power is the goal; the boundary
is non-negotiable.
