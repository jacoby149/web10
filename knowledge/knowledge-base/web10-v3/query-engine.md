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
4. **The prepare pass (read + resolve).** The engine optionally **mints** the
   result rows after the SELECT — presigned media URLs, per-reader HLS sigs,
   ad attachment, and the author's face — so a single `w.query()` returns
   **render-ready** rows, not raw docs. This is what lets an app express its
   whole feed as *one* query (the 267-requests-in-one) with **no bespoke
   endpoint** (D73: the social feed retires `POST /v3/feed`). See
   [The Prepare Pass](#the-prepare-pass-read--resolve) and
   [The Feed as a Query](#the-feed-as-a-query-the-reference-example).

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

## The Prepare Pass (read + resolve)

The engine runs a **SELECT** — it returns raw rows. But a rendered feed needs
more than rows: each post's media needs a **fresh presigned URL**, each
transcoded video needs a **per-reader HLS sig**, each doc may carry a **pinned
ad + node ad**, and the author needs a **face** (profile + avatar URL). Today
those minting passes live on the read endpoints (`/read`, and the now-retired
`/feed`) as post-query transforms. The prepare pass moves them **into the
engine**, so a single `w.query()` returns render-ready rows.

**Why it is safe (the load-bearing part).** The prepare pass mints
*capabilities* (a presigned URL grants access to the media; an HLS sig grants
access to the stream). A capability-minter on a query surface is only as safe
as the boundary that fed it:

- The **boundary CTEs already proved** the reader can read every doc in the
  result (I3 + the D58 read gate + block/sharing/hidden). The prepare pass
  only ever touches docs *already in the result* — it cannot reach a doc the
  query couldn't.
- Each pass is **access-bound**: `resolve_media_urls` is **author-scoped**
  (presigns only media the doc's author owns, for a doc the reader can read);
  the HLS sig is **per-reader** (bound to the reader, 10-min TTL = the
  membership re-check cadence); the ads are **I3-checked** (the reader's ad
  preference + the node's config). A reader can only mint capabilities for
  docs they can already read — **no escalation**.
- Media / HLS / ads / face are **universal** primitives (D44 / D49 / D55 /
  D57), not social. Baking them in keeps the engine generic — a messaging app
  rendering media, or a notes app with attachments, gets the same pass.

**The shape.** `w.query(sql, { groups, prepare })`. `prepare` is an optional
spec of which passes to run on the result rows:

```
prepare?: {
  media?: true,   // presign the row's body.media_refs (author-scoped) + mint
                  // per-reader HLS sigs for transcoded video
  ads?:   true,   // attach the pinned ad (ad_mode/ad_target) + the node ad
  face?:  { bodyField, mediaField, authorColumn?, urlField? }
          // mint the author's face: presign <bodyField>.<mediaField>,
          // author-scoped to <authorColumn>, set <urlField> (default
          // 'avatar_url'). For a query that JOINs the author's profile
          // service, this is the avatar.
}
```

**Shape coupling — how the engine knows what to mint.** A query can return any
shape, but the passes need to find the doc's `body.media_refs` + `author_key`
(+ `ad_mode`/`ad_target` for ads). Two rules, in order:

1. **Duck-type default.** If a row carries `doc_id` + `author_key` + `body`,
   the `media`/`ads` passes mint that row's `body.media_refs` / `ad_mode` /
   `ad_target`. This is the common case (the feed: `SELECT p.*, …counts…`) and
   needs zero config. A row without those keys (an aggregate, a non-doc join
   column) is skipped — the pass no-ops on it.
2. **Explicit `face` spec.** The author's face lives in a *different* body
   (the JOINed profile), not the row's `body`. The caller declares where:
   `face: { bodyField: 'profile_body', mediaField: 'avatar_ref', … }`. Generic
   (any app's face service) and explicit (no magic).

**Engine change:** the boundary CTE's exposed columns gain `ad_mode` +
`ad_target` (the ad-attach pass reads them off the row). Everything else —
`resolve_media_urls_in_docs`, `_mint_hls_manifest_urls`, `attach_pinned_ads`,
`attach_node_ads` — is reused verbatim; the prepare pass is a thin orchestration
over the existing functions, applied to the query's rows.

**What it is not.** Not a second query (one round-trip — the SELECT and the
mint are one call). Not a way to mint capabilities for docs outside the result
(the boundary is the wall). Not social-specific (the passes are universal; the
`face` spec is caller-supplied).

## The Feed as a Query (the reference example)

The social app's following feed is the reference for "an app's whole feed as
one query." It used to be a bespoke `POST /v3/feed` endpoint (`feed.py`) that
hardcoded the social read: a power-mean ranked, keyset-cursor-paged page of
`posts`, LEFT JOINed to exact reaction + comment counts, with the node reading
the author's `profile` service + resolving the `avatar_ref` (a D60 leak — the
platform knowing the social face). D73 retires it: the feed is a **query** the
**app** writes, run through the engine, with the **prepare** pass minting the
result. The node hardcodes nothing — the app's query names the `profile`
service (the app knows its own face).

**The query** (the app's; the engine wraps `posts` / `reactions` / `comments`
/ `profile` in boundary CTEs). It is the feed SQL with the board base replaced
by the `posts` boundary CTE and the engagement subqueries reading the
`reactions` / `comments` service CTEs:

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value,
       p.ad_mode, p.ad_target,
       coalesce(eng.reaction_count, 0) AS likes,
       coalesce(cmt.comment_count, 0)  AS comments,
       (<power-mean score over p.created_at, eng.reaction_count, cmt.comment_count>) AS score,
       pr.body AS profile_body
FROM posts p
LEFT JOIN (SELECT ref_value, count() AS reaction_count
           FROM reactions WHERE ref_value != '' GROUP BY ref_value) eng
       ON eng.ref_value = p.doc_id
LEFT JOIN (SELECT ref_value, count() AS comment_count
           FROM comments WHERE ref_value != '' GROUP BY ref_value) cmt
       ON cmt.ref_value = p.doc_id
LEFT JOIN profile pr ON pr.author_key = p.author_key
WHERE <keyset cursor: created_at < :last (Newest) | score < :last (tuned)>
ORDER BY <toUnixTimestamp64Milli(p.created_at) DESC | score DESC>
LIMIT <page + 1>          -- +1 → the client drops the trailing row → has_more
```

`prepare: { media: true, ads: true, face: { bodyField: 'profile_body',
mediaField: 'avatar_ref', authorColumn: 'author_key', urlField: 'avatar_url' } }`
mints the media + HLS + ads + the author's avatar. The client maps the rows to
`PostRecord` (the profile body → `profile`, `avatar_url` → the resolved face)
exactly as it does today.

**Behavior-preserved (the bar: exact same thing, via the engine).** The query
reproduces `read_feed`'s output: same ranking (the power-mean score inlined),
same keyset cursor, same exact engagement counts, same ads/media/HLS, same
author face. Two places the engine is *more correct*, not less, and both match
in practice for the following feed:

- **Engagement counts are group-scoped.** The old SQL counted reactions/comments
  across *all* groups; the query counts them in the reader's *readable* groups
  (the boundary CTE). Reactions/comments default to the discover group (D62,
  readable by all), so the count is identical in practice — and a reaction
  attached only to a group the reader can't read no longer over-counts for them.
- **The author face is group-scoped.** The old `get_author_profiles` read the
  `profile` service across all groups; the query JOINs the `profile` boundary
  CTE (readable groups). The following feed shows posts from users the reader
  *follows* — following = a membership in the author's followers group — so the
  reader can read the author's profile and the JOIN returns it. Identical in
  practice; a face the reader genuinely can't read no longer leaks.

**Why this is the D60-conformant shape.** The node exposes only universal
primitives: the safe query (the 267→1 data read) + the prepare pass (resolve +
mint). The *social* composition — which services to join, the ranking knobs,
the face field — lives in the **app's query**, not the node. Any app writes its
own feed query the same way; the social app is the example. `feed.py` is gone;
the node knows no "feed," no "profile," no "avatar."

**The column-name contract (alias every selected column).** The row→client
contract is the *result column names*: the prepare pass and the client
duck-type on `body` / `author_key` / `ad_mode` / `ad_target` (a row without a
`body` key is a non-doc row — the passes skip it). ClickHouse names a result
column after the qualified expression — `p.body` — **whenever any other table
in the join scope exposes a same-named column** (the feed's count subqueries
expose `ref_value`; a JOINed profile subquery exposes `author_key` + `body`).
With no name clash the unqualified name comes through (`doc_id`, `tags`,
`created_at`), which is what makes the failure *partial* and silent: some keys
mangle, some don't, and nothing errors — the feed just renders empty. The rule
is therefore: **a caller query that SELECTs table-qualified columns must alias
them** (`p.body AS body`, `p.author_key AS author_key`, …). The feed query does
this for every column; `query-engine.spec.ts` pins it end to end (a JOINed
same-named-column shape must return unqualified keys). The endpoint logs the
result column names (`[query] … columns=[…]`) so a mangled contract is visible
at the source, not as an empty feed downstream.

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
