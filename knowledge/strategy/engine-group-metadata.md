# The Query Engine Reads Group Metadata — the web10 engine reads what you're allowed to read

**Status: PLANNED — the keystone. This is the first protocol work of the
discover / groups / search cluster.** It's a big addition to the protocol
(expanding the query engine's reachable tables), and it's the foundation the
people read, the groups browser, and the feed's metadata sorting all build on.
Do it first; everything above it gets legit-metadata sorting for free.

> **The one-liner:** extend the D73 query engine so a caller's query can JOIN
> **group metadata** (member count, join policy, discoverable) into a content
> read — gated by the **existing I3 read gate** (`can_read_group`), with
> **NULL-out-and-sort-last** semantics for groups the reader can't read.
> "Reading what you're allowed to read" becomes a first-class, secure,
> queryable, **sortable** capability — the foundation for sorting people by
> legit followers and groups by legit members (the feed's sort customizability,
> applied to audience size).

---

## The operator's intent (verbatim, 18.09.2026)

> "is it needed for people and groups read, so that you are actually sorting by
> legit followers count etc, like that feed, the amount of sort customizability,
> that is next gen social media."

> "i think we need to safely and securely allow groups reads of those metadata
> fields specifically like number of members, it is enforced by the groups
> settings anyways right? to allow public seeing the metadata like number of
> members? if not allowed can null it out in the engine, then it will come out
> in the bottom of the sort! something like that."

> "this is making the protocol some really legit cool stuff even if it poses
> security conversation and design and thought it is the ultimate right way to
> go for everything apps so what i am saying is joining with groups table in
> secure way for reads, reading what you are allowed to read is essential thing
> for the web10 engine"

> "i think it should be the first thing we do since it is a big addition to the
> protocol!"

---

## Why it's first (the keystone)

- **It's a protocol change** — it expands the query engine's reachable tables
  from documents-only to documents + group-metadata. That's a security-design
  decision (the operator: "poses security conversation and design and thought"),
  so it gets its own doc + a `decisions.md` entry, and it's done deliberately,
  first.
- **It's the foundation.** The D0 people read, the D3 groups browser, and the
  feed's metadata sorting all need "sort by legit audience size." Today that
  requires multiple endpoint calls + client composition (a node function). This
  makes it a single, secure, queryable, sortable read — so the product reads are
  expressed as **queries with legit-metadata sorting from the start**, not as
  ad-hoc node functions that get reworked later.

## The problem it solves

Today the engine is **documents-only** — `safe_query.py:60-78` blocklists the
contract tables (`group_members`, `group_contracts`, `users`, …) as raw tables a
caller query must never reference. So an app **can't sort/rank by legitimate
group metadata** (member count, follower count) in a query — it needs the D0
node function (server-side composition). This doc makes "content + the group
metadata I'm allowed to see, **sorted by it**" a single, secure, queryable read.

## Why it's safe (the wall extends, it doesn't weaken)

The engine's guarantee (`safe_query.py:5-30`): a caller query can only reference
**service names** (→ API-built boundary CTEs, group-filtered) and its own CTEs —
never raw tables. The raw string is parsed to an AST, every table reference is
checked, the boundary CTEs are injected (API-built), and the result re-parses
(round-trip backstop). The boundary is on the *input* tables, not a filter on the
*output* — so aggregation, self-joins, and subqueries can't leak past it.

**This extension adds one more API-built, visibility-enforced CTE**
(`group_meta`) — it does **not** relax the raw-table blocklist. The caller
references `group_meta` (an allowed CTE name, like a service name); the raw
tables (`group_members`, `group_contracts`) **stay blocked**. The AST walk +
re-parse backstop are unchanged in structure — they recognize one more
API-built CTE. So the guarantee holds: the caller still can't touch the raw
tables; it touches the API-built, visibility-enforced `group_meta`.

---

## The security model (the core)

### Prerequisite: the content CTEs must expose `group_id` (the join key)
**The join key doesn't exist yet.** `_CTE_COLUMNS` (`safe_query.py:84`) is
`doc_id, author_key, body, ref_value, tags, created_at, updated_at, ad_mode,
ad_target` — **no `group_id`.** A doc can be in *multiple* groups (via
`doc_groups`), so the boundary CTE must JOIN `doc_groups` and surface the
group(s) — one row per (doc, readable-group) pair, each carrying that
`group_id`. Then a caller can `JOIN group_meta gm ON p.group_id = gm.group_id`.
**This is safe** (operator, 18.09.2026): the CTE is *already* filtered to the
reader's readable groups (`WHERE dg.group_id IN (readable_groups)`), so the
`group_id`s exposed are groups the reader can already read — not a new leak.
The engine returns **pages of groups** for these queries, so the multi-group
row shape is expected, not a problem. This is a prerequisite the original design
skipped — it's **QE-A0** (below) and must land before the `group_meta` join is
usable.

### The new boundary CTE: `group_meta`
- A new API-built boundary CTE (parallel to the service CTEs), exposing group
  metadata: `group_id`, **`member_count`** (from `group_members`),
  **`join_policy`** + **`discoverable`** (from `group_contracts`).
- Built by a new `_group_meta_cte_sql(readable_group_ids, member_key,
  candidate_group_ids)` — the pre-aggregated member-count subquery (the same
  shape as `_get_group_member_counts`, `clickhouse.py:1214`) JOINed to the
  deduped `group_contracts` (latest row, not-deleted — the tombstone read
  invariant), filtered to the candidate groups, with a **CASE-based NULLing** on
  the readable-set condition.
### The opt-in + the `allowed` gate (groups are governed by app contracts)
- **Opt-in:** the caller declares it wants the `group_meta` join (a flag on
  `w.query`). Without it, `group_meta` is an unknown table (rejected by
  `_validate`). The caller pays for the join only when it wants it.
- **The `allowed` gate is per-service from the app contract** — and
  `group_meta` isn't a service. `query.py:168` computes
  `allowed = {svc for svc, ops in perms if "readAll" in ops}` — the *services*
  the app contract grants. `group_meta` is a metadata CTE, so it's not in
  `allowed`, and `_validate` would reject it as an unknown table. **The opt-in
  must inject `group_meta` into the allowed set** (or `_validate` special-cases
  it when `withGroupMeta` is on). This is the second integration point beyond
  the CTE builder. **The deeper point (operator, 18.09.2026):** groups are
  governed by app contracts — so the app-contract model may need an **extension
  to carry group-metadata read rules** (a `group_meta` grant, analogous to the
  per-service `readAll` grants), rather than a bare always-on flag. That's the
  clean, contract-governed version of the opt-in. **Decision: start with the
  opt-in flag (QE-6); the app-contract `group_meta` grant is the follow-up that
  makes it contract-governed.**

### The visibility rule (reuses the existing I3 gate — no new permission)
- The endpoint computes the reader's **readable groups** via the existing D58
  gate — `readable_groups(principal, service, authenticated,
  candidate_group_ids)` (`clickhouse.py:1155`) / `can_read_group` (`:1125`) —
  and passes them to the CTE builder (exactly how the service CTEs get
  `readable_groups_by_service`, `safe_query.py:294-307`).
- Per row: a group's metadata is **visible iff the group is in the reader's
  readable set** (i.e., `can_read_group(G, reader, service, authenticated)` —
  "enforced by the groups settings," the operator's words). Otherwise the
  metadata columns are **NULL**.
- **No new permission concept** — it reuses the exact gate the read path already
  uses. The visibility is computed by the endpoint (the trusted side) and
  enforced in the API-built CTE — the caller never sees the gate logic.

### The NULL-out-and-sort-last semantics (the I3 pattern)
- Unreadable groups are **present** in the `group_meta` CTE (as NULLs), not
  excluded — so they sort to the bottom and the caller sees "there are groups I
  can't read" without learning their metadata. (Contrast the service CTEs, which
  *exclude* unreadable groups — `group_meta` *NULLs* them, to enable the
  sort-to-bottom + the honest "I can't read these" signal.)
- **NULL sorts last** (ClickHouse `ORDER BY … NULLS LAST`). So "top K by
  `member_count`" returns "top K among what I can read," with the unreadable
  groups at the bottom.
- **The I3 proof (no inference):** for an unreadable group G, a reader R can
  learn that G exists (already known — R has its ID / it's in the candidate set)
  and that R can't read it (already known). R **cannot** learn G's `member_count`
  (NULL) or G's rank among readable groups (it's at the bottom, and the NULLs are
  unordered by count among themselves). So no leak of the count or the rank. The
  NULL leaks only "G exists but I can't read it" — already known. **I3 holds at
  the sort level.**

### The `group_meta` CTE must NOT copy the service CTE's WHERE-filter (security note)
The service CTEs **exclude** unreadable groups (`WHERE group_id IN
(readable_groups)`). The `group_meta` CTE must **include all** candidate groups
and **CASE-NULL the unreadable ones** — if an implementer copies the service
CTE's `WHERE`-filter pattern, they silently drop the unreadable groups and the
NULL-out-and-sort-last breaks (no NULLs to sort to the bottom, and the reader
loses the honest "there are groups I can't read" signal). **Do not reuse the
service CTE's WHERE-filter; `group_meta` full-scans + CASE-NULLs.** This is part
of the security conversation (operator, 18.09.2026) — the NULL-out is what makes
the sort I3-honest, and a WHERE-filter would quietly break it.

### The performance shape (the full-scan is inherent to the NULL-out design)
- The `group_meta` CTE is a pre-aggregated count subquery + a LEFT JOIN to the
  deduped contracts + a CASE-based NULLing on `group_id IN (readable_set)`. The
  per-row principal check is a **set-membership test** (not a correlated
  per-row function), so it vectorizes.
- **The full-scan is inherent, not a bug:** the NULL-out-and-sort-last *requires*
  the unreadable groups to be in the CTE (to NULL them) — so the CTE scans
  `group_members` + `group_contracts` for **all** candidate groups, every time.
  It is **not** "bounded by the groups being joined" (the CTE is materialized
  standalone, before the JOIN). The cost is bounded by the **node's group
  count** — fine at hundreds–low-thousands; a real cost at 100k+. ClickHouse
  handles it (columnar + the `group_members` count is a pre-aggregation over an
  indexed `group_id`), so it's a scale cost, not a crash risk (operator,
  18.09.2026: "hopefully indices or something can make this not crash out" —
  yes, the pre-aggregation + the existing `group_id` indexing make it
  tractable). **Mitigation at scale:** a pre-aggregated / materialized
  member-count table (refreshed on join/leave) so the CTE reads the aggregate,
  not the raw `group_members`.
- **A standalone `SELECT * FROM group_meta`** (the groups browser) returns the
  whole group list (group_ids are "guessable" per D53, so not a huge leak, but
  new info) — bounded by `max_limit`. This is the groups-browser shape (the
  groups *are* the metadata), distinct from the content-join shape (the people
  read).

---

## The behavior change (explicit decision — QE-7)

- **Today:** the group detail (`group_detail`, `groups.py:357`) returns
  `member_count` for **any** group by ID, regardless of read permission (the D53
  "metadata is low-sensitivity" model — "group IDs are guessable URLs anyway, the
  real boundary is the content").
- **This model:** metadata is visible **iff you can read the group** (per
  `can_read_group`). A private group's `member_count` is NULL to a non-reader.
- **This is a tightening** (more consistent I3) — and it changes existing
  behavior (the detail endpoint + the D53 model). **Decision: adopt the
  tightening** — "reading what you're allowed to read" should apply to metadata
  too, not just content. This requires a KB update to `groups/detail.md` (the
  "metadata is always returned" line becomes "metadata is returned per the
  reader's read gate; NULL when the reader can't read the group").
- **Consistency with `discoverable`:** a discoverable group is publicly listed
  (its metadata is public — that's the point of being discoverable); a
  non-discoverable group's metadata is gated by the read permission. So
  `discoverable` and the read gate align: discoverable = public metadata;
  non-discoverable = metadata per read gate. Clean.

---

## The design decisions to lock

- **QE-1: Which tables/fields are joinable.** `group_members` → `member_count`;
  `group_contracts` → `join_policy`, `discoverable`. **Not** raw `users` account
  data (no password hash, no phone/email — the account table stays out). (The
  operator: "groups reads of those metadata fields specifically like number of
  members.")
- **QE-2: The visibility rule** = `can_read_group` / `readable_groups` (the
  existing D58 gate). No new permission concept.
- **QE-3: NULL-out-and-sort-last** + the I3 proof (no inference from the
  NULL/sort pattern — traced above).
- **QE-4: The completeness-guarantee extension** — `group_meta` is an allowed
  API-built CTE (opt-in); the raw tables stay blocked; the AST walk + re-parse
  backstop unchanged in structure.
- **QE-5: The performance shape** — pre-aggregated count CTE + LEFT JOIN to
  deduped contracts + CASE-based NULLing on the readable set.
- **QE-6: Opt-in + the `allowed` gate** — the caller declares `withGroupMeta` on
  `w.query`; without it, `group_meta` is rejected. The opt-in must inject
  `group_meta` into the `allowed` set (`query.py:168` computes it from the app
  contract's readAll services — `group_meta` isn't one). **Follow-up:** the
  app-contract model gains a `group_meta` grant (groups governed by app
  contracts — the operator's point), making the capability contract-governed
  rather than a bare flag.
- **QE-7: The metadata-visibility tightening** — adopt "metadata iff you can read
  the group" (changes the D53 detail model; KB update to `groups/detail.md`
  required).

---

## Bite sizing (small, one owner each)

- [✓ 3.121.0] **QE-A0: expose `group_id` on the content CTEs** (the join key — the
  prerequisite, `api/app/v3/services/safe_query.py`) — add `dg.group_id` to the
  boundary CTE's outer SELECT (the one that JOINs `doc_groups`), so a doc in N
  readable groups surfaces N rows (one per group, each with that `group_id`) —
  the multi-group row shape is pre-existing (the JOIN already produces N rows)
  and now visible + meaningful. The exposed group_ids are all readable groups
  (the `WHERE dg.group_id IN (readable_groups)` filter), so no I3 leak. Update
  the prepare pass / row serialization to carry the new column. **Gates QE-A**
  (the `group_meta` join is unusable without the key).
- [✓ 3.123.0] **QE-A: the node change** (`api/app/v3/services/safe_query.py` + the query
  endpoint) — the `_group_meta_cte_sql` builder (pre-aggregated counts + deduped
  contracts + CASE-based NULLing on the readable set — **NOT** the service CTE's
  WHERE-filter); the opt-in flag on the query; the endpoint computes the readable
  groups (via `readable_groups`) and passes them to the CTE builder (parallel to
  `readable_groups_by_service`); the `_validate` + `allowed`-gate extension
  (recognize `group_meta` when opted in — `query.py:168` computes `allowed` from
  the app contract's readAll services, so the opt-in must inject `group_meta`
  into the allowed set; **keep the raw tables blocked**). The compiled query must
  re-parse (the existing backstop).
- [✓ 3.126.0] **QE-B: the SDK change** (`sdk/src/v3.ts`) — `w.query(sql, { groups,
  prepare, withGroupMeta })` + the `V3Prepare`/query types. `dist/` +
  `public/wapi.js` rebuilt + re-synced.
- [✓ 3.127.0] **QE-C: the I3 anti-tests** (the seatbelt — the most important bite) — a
  reader can't see/infer a group's metadata they can't read: the value is NULL;
  the sort doesn't reveal the rank; the NULL pattern doesn't reveal the count; a
  private group's `member_count` is absent to a non-reader but present to a
  member; **the raw tables are still rejected** (a direct `group_members`
  reference is rejected even with `withGroupMeta` set — the wall holds); the
  completeness guarantee (the AST walk catches a raw-table reference inside a
  caller CTE / subquery, with the opt-in on).
- [~] **QE-D: the migration** — the D0 people read + the D3 groups browser
  expressed as queries using `group_meta` (sort by legit follower/member count).
  The node-function versions (if shipped first) are replaced by the query
  versions (same semantics, now app-writable). **Gated on QE-A/B/C (done).**
  **Handed off to the `discover-reorg` lane** (this lane owns the query engine +
  SDK, not the social data layer the migration rewires) — filed there as
  **QE-D1 (groups browser, clean) + QE-D2 (people read, blocked on a
  group-scoping design decision: the query engine scopes to the reader's groups,
  but D0 needs all public users)**.

---

## The relationship to the cluster (why it's first)

- **D0 (people read)** + **D3 (groups browser)** (`discover-reorg.md`) build on
  it — they sort by legit follower/member count via the `group_meta` join.
- **The feed's metadata sorting** (the "next-gen" ranking) builds on it — sort
  posts/groups/people by audience size, the feed's sort customizability applied
  to metadata.
- **group-as-profile** + **global-search** depend on the people/groups reads,
  which depend on this.
- **So this is the keystone:** do it first, and everything above it gets
  legit-metadata sorting for free. The D0/D3 node functions (if shipped to
  unblock the product meanwhile) use the *same* visibility semantics
  (`can_read_group`, NULL out what you can't read) — so the engine expansion is
  a mechanism upgrade, not a semantics change. No rework.

---

## Acceptance bar

- **The I3 proof holds** (QE-C anti-tests): a reader can't see/infer a group's
  metadata they can't read — via the value (NULL), the sort (no rank leak), or
  the NULL pattern (no count leak). A private group's `member_count` is absent to
  a non-reader, present to a member.
- **The wall holds** (QE-C): the raw tables (`group_members`, `group_contracts`,
  `users`) are still rejected — a direct reference is rejected even with
  `withGroupMeta` on; the AST walk + re-parse backstop catch it inside caller
  CTEs / subqueries.
- **The visibility reuses the existing gate** (QE-2): the endpoint computes the
  readable groups via `readable_groups`/`can_read_group`; no new permission
  concept.
- **Opt-in** (QE-6): without the flag, `group_meta` is rejected (unknown table);
  with it, the CTE is injected + visibility-enforced.
- **Performance** (QE-5): the CTE is bounded by the candidate set; the per-row
  check is a set-membership test (vectorizes); a large candidate set doesn't
  degrade the query pathologically.
- **The tightening is decided + documented** (QE-7): the D53 detail model change
  is explicit; `groups/detail.md` is updated.
- API + SDK + the I3 anti-tests green; `ruff` + `tsc` clean.

## Out of scope (filed, not built)
- Raw `users` account data (the account table stays out — counts + contract
  metadata only).
- Other contract tables (`user_blacklist`, `group_blacklist`,
  `user_group_sharing`, `app_contracts`, …) — not joinable (they're
  visibility *filters*, not metadata).
- Write ops (this is a read capability only).
- The KB promotion (this plan doc extends `knowledge/knowledge-base/web10-v3/
  query-engine.md` when built — the implementation doc).
