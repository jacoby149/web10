# Discover Reorg — Posts, People, Groups as browsers (operator pass, 18.09.2026)

**Status: SHIPPED + SUPERSEDED (3.157.0).** The original three-subtab design
(Posts | People | Groups) shipped, then **`discover-ia-consistency.md`
(3.157.0) re-cut the tabs to two — Trending | Profiles** (the operator's
23.09.2026 pass). **Groups is a *section* inside the Profiles browser, not a
top-level tab** (in both the social app and the marketing site). The People
browser's cards + the Groups cards are now the **shared `@web10/discover`
`PersonCard` + `GroupCard`** (one source, both apps). The marketing `/trending`
mirrors the social Discover (Trending | Profiles, the same Profiles browser).
Everything below is the historical record of the original reorg; read
`discover-ia-consistency.md` for the current fixed point.

> **The one-liner (original):** the subtabs are *browsers* (paged, sortable),
> not search boxes. The front door is the top-bar search (`global-search.md`);
> "see more people" lands you here with the query applied so you can page
> through. Rationale: *"you are discovering people and groups."*

**Companion docs:** `global-search.md` (the top-bar search that deep-links
here) · `group-as-profile.md` (the group *page* these cards link to). This
doc is the group/people *discovery* — the list, not the detail.

---

## The operator's intent (verbatim, 18.09.2026)

> "groups and people also need pagination and search i feel like, like this
> is where you can search groups and people up. missing that search."

> "we could find some flagship social app way to put people and groups in the
> discover, like discover can have posts, people and groups subtabs in it."

> "then we can keep the groups tab groups you are a part of … but a whole
> other people tab totally unecessary, can all be in discover, it helps the
> marketing site too!"

> (18.09.2026, on search placement) "maybe good to have an everything search
> on the topbar … AND have people tab in discover and if dropdown you hit see
> more people results it shoots you to people discover with that search so you
> can page through." → **search moves to `global-search.md`; the subtab is the
> browser it lands on.**

---

## Current state (verified, 18.09.2026)

| Surface | Today | Gap |
|---|---|---|
| **Discover** (`DiscoverScreen.tsx`, 1394 lines) | Board post feed (grid/Video), topic chips (`?tag=`), client-side post search (`?q=`), KnobRack (`?knobs=`), a "People to follow" rail (`fetchSuggestedUsers(20)`) | People is a dead-end rail (no paging, no "see all"); groups absent; the file is a god-component |
| **People** (`PeopleScreen.tsx`) | Cards (banner+avatar+name+mutuals+Follow), sorts Mutuals/Popular/A–Z (`?sort=`) | No search, no pagination (`fetchPeople(limit=20)`, a client pool); a whole nav tab |
| **Groups** (`GroupsScreen.tsx`) | My Groups + Discover tabs (`?tab=`), directory `?q=`/`?tag=` (client-side over one 50-entry page) | The directory never pages (the API takes `limit`/`offset` — the client never sends `offset`) |
| **Marketing `/trending`** | Public post feed + a "Matching users" row calling `PATCH /discover/users` | **That endpoint doesn't exist** — the row is dead code (`[]`); groups absent |

**The node already has what's needed:** `GET /v3/groups/directory?limit&offset`
(anon, **already paginated**, D53 — the client just never sends `offset`).
People has no server read yet (the D0 open item below).

---

## The design

### The subtabs = browsers (search lives in the top bar)
One screen, three subtabs, URL state (`?tab=posts|people|groups`; `posts` is
the bare URL). **No per-subtab search field** — the query arrives via
`?q=` from the top-bar search's "see more" (`global-search.md`). Each subtab
is a paged, sortable **browser**:

- **Posts** (default) — the existing board feed, **unchanged** (grid/Video,
  topic chips, KnobRack). A `?q=` (from "see more posts") filters it — the
  app's existing post search, now reachable from the global search too.
- **People** — the People cards (banner+avatar+name+mutuals+Follow), the
  three sorts (Mutuals/Popular/A–Z, `?sort=`), **pagination** ("view more"),
  and a `?q=` filter (name/handle). Reached bare (browse) or with a query
  (from "see more people"). The "People to follow" rail is **retired** from
  the Posts view — it becomes this tab.
- **Groups** — the D53 directory cards (face+name+owner+members+join policy+
  tags), the tag filter (`?tag=`), **pagination** (thread the `offset`), and
  a `?q=` filter (name/owner/tags). Join/Request + View.

### Groups tab = the groups you're a part of
`/groups` keeps one list: **My Groups** (unchanged). Its Discover tab moves
out (to Discover/Groups). `/groups?tab=discover` → `/discover?tab=groups`
(redirect, so old links + notification deep links keep working).

### People tab retired
`/people` → redirect to `/discover?tab=people`. Nav loses the People entry
(desktop sidebar + mobile More sheet). `PeopleScreen`'s cards live on inside
the Discover/People browser (it gains paging + `?q=`; it keeps the sorts).

### Marketing `/trending` mirrors the three
The public ledger gets Posts | People | Groups (anon reads). The dead
`PATCH /discover/users` row is replaced by the D0 read (or retired if D0
doesn't land and people stays social-only).

---

## Open decision (resolve before D2/M1)

**The People pool — where does it come from?** `fetchPeople` is a client
pool (discover authors + my community members, capped). On a node with 1000+
people (the operator's expectation) the pool is too small for real paging +
search. Options:
- **(a) widen the client pool + page client-side** — no node change, bounded
  by node activity. v1 floor. But it's a *biased sample* (people you're
  connected to, or who post publicly) — not a phonebook — and it can't serve
  the anon marketing site.
- **(b) a node "public users" read** (D0) — **leaning (b), and it's cheaper
  than it looks**: the enumeration primitive already exists (`list_users()`,
  `clickhouse.py:2984` — all active users), plus a public-profile read and
  `_get_group_member_counts` (batched follower counts). So D0 is a
  **server-side composition** — `list_users` → batch the profile faces →
  follower counts → rank by followers → `limit`/`offset` — one round-trip, not
  N client reads. **The follower count is unspoofable**: it's a membership
  aggregate (`count(group_members)` on the user's followers group), written by
  the join op, not a user-set field — the same "unhackable count" the D53
  directory uses. A user can lie about their bio (the face doc) but not the
  number. **Principal-based** (anon sees the public subset, signed-in sees
  more — the *same* card shape, different *permissions*). Makes people
  search/paging real at scale **and** is exactly what the marketing site needs
  (the dead `/discover/users` call becomes real).

**Risk (stated plainly):** the People browser is the highest-risk,
lowest-certainty bite here — its value is contingent on there being enough
public people to show. On a small/dev node it reads hollow (a few cards,
nothing to page). **Mitigation (operator, 18.09.2026):** if the node has fewer
than ~10 public people, the People browser shows a designed **"It's quiet
here"** state (set the expectation) instead of a degenerate ranked list.
Groups (server-paginated D53) and Posts (no-regression) are solid. **Decide
(a) vs (b) first** — it gates D2's data source and M1.

---

## Bite sizing (small, one owner each)

The subtabs are **separate component files** (not all in `DiscoverScreen.
tsx`) so the bites don't share a file: D1 owns the shell, D2 owns
`DiscoverPeopleTab.tsx`, D3 owns `DiscoverGroupsTab.tsx`. The shell just
switches between them + holds `?tab=`/`?q=`.

- [ ] **D0: the public "people" read** (keystone, `api/` + `sdk/`; only if
  the decision → (b)) — a **server-side composition** (one round-trip, not N
  client reads): `list_users()` (exists) → batch the profile faces →
  `_get_group_member_counts` on the followers groups (the **unspoofable**
  membership aggregate — a user can't fake their follower count, it's
  `count(group_members)`, not a stored field) → rank by followers →
  `limit`/`offset`. Principal-based (anon = public subset, signed-in = more —
  same card shape). A user with no public profile is **absent, not
  shown-with-fallback** (keeps I3 clean). API floor test (I3 — no private data;
  anon vs signed-in; the count is a membership aggregate, not a stored field) +
  SDK passthrough. **Gates D2 (people data) + M1.** If the decision → (a), skip
  D0 and D2 pages the widened client pool.
  **Why a server-side composition for now, and a query later:** the query
  engine is *today* walled off from the contract tables — `safe_query.
  py:60-78` blocklists `group_members` / `group_contracts` / `users` as raw
  tables a caller query must never reference (the boundary CTEs expose only
  `documents` columns). So **today** the follower count (in `group_members`)
  can't be joined in a caller query — D0 ships as this node function, which is
  where the per-endpoint I3 gate lives. **Once the `engine-group-metadata`
  keystone lands** (`engine-group-metadata.md` — the query engine gains a
  visibility-enforced `group_meta` CTE, gated by `can_read_group`,
  NULL-out-and-sort-last), D0 is **expressed as a query** using the `group_meta`
  join (sort by legit follower count) — same visibility semantics, now
  app-writable + sortable. The node function is v1; the query is v2 (QE-D, the
  migration). Don't write D0 as a `w.query(…)` *before* QE lands — it'll be
  rejected as an unsafe table reference.
- [ ] **D1: the Discover subtab shell** (`DiscoverScreen.tsx`) — the Posts |
  People | Groups tab row (`?tab=`, posts bare) + it holds `?q=` and passes
  it to the active subtab. Mounts `DiscoverPeopleTab` / `DiscoverGroupsTab`
  (designed placeholders until D2/D3 land). The "People to follow" rail is
  retired from Posts. **Posts view is byte-identical** (no regression).
  `discoverScreen.test.tsx` (tab switch + `?tab=` + `?q=` pass-through + Posts
  no-regression).
- [ ] **D2: the People browser** (`src/components/Discover/DiscoverPeopleTab.
  tsx` new + `PeopleScreen.tsx` + `people.ts`) — the People cards as a Discover
  subtab: the three sorts (`?sort=`) + **pagination** ("view more", the D0 read
  or the widened pool) + a `?q=` filter (name/handle). **"It's quiet here"
  state** (operator, 18.09.2026): if the node has fewer than ~10 public people,
  show a designed "It's quiet here" empty state (set the expectation) instead of
  a degenerate ranked list. `people.test.ts` + `peopleScreen.test.tsx`
  re-pinned + new (sorts; paging appends; `?q=` filters; the quiet-here state
  under ~10 people). **Gated on D0** (or the (a) pool).
- [ ] **D3: the Groups browser** (`src/components/Discover/DiscoverGroupsTab.
  tsx` new + `GroupsScreen.tsx` + `groups.ts`) — the D53 directory as a Discover
  subtab: cards + `?tag=` + **pagination** (thread `offset`; "view more") + a
  `?q=` filter. The Groups tab's Discover tab is removed; `/groups?tab=discover`
  → `/discover?tab=groups`. `groupsScreens.test.tsx` re-pinned + new (paging
  appends; the redirect). **Note:** the directory already excludes
  non-discoverable groups (`discoverable=1`), so `group-as-profile` drafts
  (discoverable=false) never leak here — no dependency on G0.
- [ ] **D4: nav + redirects** (`Layout.tsx`* , `App.tsx`) — People removed from
  the sidebar + More sheet; `/people` → `/discover?tab=people`; `/groups` =
  My Groups only. `socialScreens.test.tsx` (nav shape; the redirects).
  *`Layout.tsx` is also touched by `global-search` S1 (the top bar) —
  **sequence S1 before D4** (or split: S1 adds the top bar, D4 only edits the
  nav item arrays) so the two lanes don't collide in the same file.
- [ ] **M1: `/trending` mirrors the three** (`marketing-ui` + `marketing-api`)
  — Posts | People | Groups on the public ledger (anon). **The cards are
  shared** (operator, 18.09.2026): marketing already imports `@web10/discover`
  (the shared package — `DiscoverCard`, `PostActions`, …), so the **posts**
  subtab reuses the shared card (cheap + consistent). The **People + Groups
  cards are NOT in the shared package yet** (they live in the social app) →
  **extract them into `@web10/discover`** (alongside `DiscoverCard`) so both
  apps render the *same* card. M1's real remaining cost is the **marketing-api
  anon reads** (people via the D0 server-side read, groups via the D53
  directory) — that's the work, not the UI. The dead `PATCH /discover/users`
  row → the D0 read (or retired if D0 doesn't land). `Trending.test.tsx` + a
  marketing-api floor test. **Gated on D0.**

---

## Acceptance bar (design.md §12)

- Every subtab at desktop (≥1280) + 375px passes the screenshot test; tokens
  only; all states designed (loading / empty / no-`?q`-match / paged) on each.
- **Deep links:** `?tab=`, `?q=`, `?sort=`, `?tag=` refresh-safe + shareable;
  the old URLs (`/people`, `/groups?tab=discover`) redirect.
- **I3 holds:** the marketing subtabs are anon reads only; the People browser
  never shows a user's data the reader can't read (mutuals/followers are
  platform-computed).
- `data-testid` hooks on every new control; the existing `discoverScreen` /
  `peopleScreen` / `groupsScreens` suites stay green (re-pinned where the
  shape moved). The Posts subtab is a no-regression.

## Out of scope (filed, not built)
- The top-bar search itself (`global-search.md`).
- The group *page* rework (`group-as-profile.md`).
- The node multi-entity search endpoint (`global-search.md` follow-up).
- The "N in common" shared-members hint on group cards (the 3.112.0 open
  follow-up). Presence / last-active (no presence data yet).
