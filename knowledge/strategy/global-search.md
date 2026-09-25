# Global Search — the top-bar everything-search (operator pass, 18.09.2026)

**Status: PLANNED.** The operator wants Instagram-style profile search: a
**global search in the app chrome** (people + groups + posts) that's the
*front door*, with the Discover subtabs as the *browsers* you land on via
"see more." This doc owns the search surface. The subtabs it deep-links into
are `discover-reorg.md`; the group page it can land on is `group-as-profile.md`.

> **The shape (operator, 18.09.2026):** "maybe good to have an everything
> search on the topbar, people groups, everything. AND have people tab in
> discover and if dropdown you hit see more people results it shoots you to
> people discover with that search so you can page through." + "on insta you
> can search profiles, so we are trying to get parity on that."

---

## Why this is its own doc (not folded into discover-reorg)

Search is **cross-cutting chrome** — it lives on every screen (the app
shell), not inside Discover. Discover owns the *browsers* (the paged
people/groups/posts lists); this doc owns the *front door* (the field + the
dropdown + the "see more" jump). Keeping them separate means two workspaces
never edit the same file: this lane owns `Layout.tsx` + a new
`GlobalSearch` component + a `globalSearch` data fn; discover-reorg owns
`DiscoverScreen.tsx` + the subtab components.

**Current state (verified):** the social app has **no top bar** — desktop is
sidebar-only (`Layout.tsx`), mobile is a 56px header (Wordmark + bell + new
post + bug + logout, no search). So this is a **new chrome surface**, not a
 tweak. **The shape (operator, 18.09.2026, refined 23.09.2026):** the search
is the front door, so it is **always visible** — a full field with the
"Search people, groups, posts…" placeholder, not a bare icon. The operator
(23.09.2026, two screenshots): "i want the search bar to look like this all
the time … like its clicked in form, because i think that is alot more
informative to the user." **Desktop:** the top bar permanently renders the
expanded field (glyph + placeholder + X); the results **dropdown** opens on
focus and closes on Escape / click-outside / navigate; the X clears the query
(the field never collapses). **Mobile:** the 56px header can't carry a
permanent field, so it keeps the icon → full-screen results view pattern.

---

## The design

### The surface (the always-expanded field)
A search **field** in the app chrome, available on **every** screen (it's in
the shell, not a page). The field is **always visible** — the operator's call
(23.09.2026): the persistent "Search people, groups, posts…" placeholder is
more informative than a bare icon. The state machine scopes to the **results
dropdown**: **`field (always) → focus → results → close`.**
- **Field (always):** a full field (search glyph + input + X) in the top bar
  / header, on every screen. The placeholder is the front door, so it's
  always on.
- **Focus:** clicking / focusing the field opens the **results dropdown**
  (focus is in the field).
- **Results:** type → **debounced** (the app's 400ms idiom) → a **chunky
   mode toggle** (Trending | People) over the results. **Trending (posts) is
   the default** (the operator, 23.09.2026: "the moment you search in the
   search bar it should show you the discover posts being searched, and then
   chunky icon to switch it to people and groups search"). One tap flips to
   **People** (the people + groups sections + the "See all results in
   Discover" CTA). The labels match Discover's tabs — the operator
   (24.09.2026): "it is supposed to be Trending and People, not Posts and
   People." The fan-out is **mode-aware** — the people/groups reads only
   fire in People mode (no wasted reads); posts always load.
   - **Desktop:** a **dropdown** under the field.
   - **Mobile:** a **full-screen results view** (not a dropdown — a dropdown
     from a 56px header over a scrollable screen + keyboard is fiddly) with an
     **X to close** (the operator's call).
- **Close:** Escape / click-outside / navigate → the **dropdown** closes
  (150ms fade); the field stays. The **X clears the query** (desktop) /
  closes the full-screen view (mobile). The typed query persists across
  close/reopen and navigation.
- **Tap a result** → navigate: person → `/u/:username`, group →
  `/groups/:groupId` (encoded), post → the post (the profile permalink, the
  app's existing post deep link).
- **Enter / the CTA** → Discover **with the query** (`?q=`), staying on
  whatever tab is active (the operator, 24.09.2026: "i would like if i hit
  enter that the search happens whether on posts or the people tab, like it
  searches / stays on both. then you can X it from either one in the
  discover"). A bare `/discover?q=…` lands on Trending (the bare-URL
  default); `/discover?tab=explore&q=…` lands on People. The query chip
  (with its X) renders on **both** tabs, so the search can be cleared from
  either one. **This URL shape is a cross-lane contract with
  `discover-reorg` — it is pinned verbatim here and in that doc** (so the two
  lanes can't drift):
  - Trending → `/discover?q=…` (the Trending tab is the default, so `?q=` alone)
  - People → `/discover?tab=explore&q=…`
- Empty query → just the field (no results). No results → a designed "No
  matches for '…'" state. Anon (signed-out) → the field is present but the
  People/Posts sections degrade (anon can't read much); the app's existing
  sign-in idiom applies ("sign in to search people").

### The read (v1: client-side fan-out)
One `globalSearch(query, limit)` data fn fans out to the three existing
reads in parallel and merges:
- **People** — the `discover-reorg` D0 read (public users) filtered by
  query; falls back to `fetchPeople` if D0 isn't landed. (Gated on D0 for
  scale; `fetchPeople` is the v1 floor.)
- **Groups** — `readGroupDirectory` (exists, anon, D53) filtered by query
  (name/owner/tags).
- **Posts** — `readDiscoverFeed` (exists) filtered by query (the app's
  existing `?q=` post search).
A **node multi-entity search endpoint** is the scale fix (follow-up, not v1)
— at 1000+ people the client fan-out is three small reads, which is fine.

**Anon vs signed-in is a behavior split, not a data split** (operator
correction, 18.09.2026): the same card shape, the same principal-based read —
anon just can't follow/join, so those actions prompt sign-in (the app's
existing idiom). No second data path.

---

## Bite sizing (small, one owner each)

- [✓] **S1: the search surface in the chrome** (`Layout.tsx` + a new
  `src/components/Search/GlobalSearch.tsx`) — the **expanding-icon** state
  machine (`icon (rest) → expanded field → results → collapse`): the slim
  search icon in the top bar / header (always there, like the logout), the
  **animate-open** to a full-width field, the **animate-collapse** on
  done/Escape/X, the debounced (400ms) query state, and the results container
  (**dropdown on desktop / full-screen view + X on mobile**). No results logic
  yet (renders the shell + a "type to search" state). The bar stays slim at
  rest (the collision rule — it never crowds a per-screen sticky header).
  `layout.test.tsx` / a new `globalSearch.test.tsx` (the icon is on every
  screen; tap expands the field; Escape/X collapses; the query is debounced;
  mobile renders the full-screen results view, not a dropdown).
- [✓] **S2: the fan-out + results + "see more"** (`src/data/search.ts` new +
  `GlobalSearch.tsx`) — `globalSearch(query)` (the three-way fan-out +
  merge, top ~5 each, **per-section loading** so the slowest read doesn't
  block the whole dropdown); the result sections (People/Groups/Posts); tap →
  navigate; "see more" → the Discover browser with `?q=` **using the pinned
  URL shape** (`/discover?tab=people&q=…` etc. — the cross-lane contract with
  `discover-reorg`). `globalSearch.test.ts` (the fan-out merges + caps each
   section; a people hit links to `/u/…`, a group hit to `/groups/…`, "see more
   people" to the **pinned** `/discover?tab=people&q=…`). **People scale gated
   on `discover-reorg` D0** (v1 floor: `fetchPeople`).
- [✓] **S3: the desktop field is always expanded** (`GlobalSearch.tsx`) —
  operator pass (23.09.2026, two screenshots): "i want the search bar to look
  like this all the time … like its clicked in form, because i think that is alot more
  informative to the user." The desktop top bar permanently renders
  the full field (glyph + "Search people, groups, posts…" + X) instead of the
  collapsed icon; `open` now scopes to the **results dropdown** (focus →
  open; Escape / click-outside / navigate → close, 150ms fade); the X **clears
  the query** (keeps focus in the field) instead of collapsing; the typed
  query persists across close/reopen and navigation. **Mobile is unchanged**
  (icon → full-screen results view). `globalSearch.test.tsx` re-pinned (the
  field is always present, no trigger; focus opens the dropdown; Escape /
  click-outside close the dropdown but keep the field; X clears the query; the
  Layout cases count one trigger — the mobile one — plus the desktop field).
- [✓ 3.153.0] **S4: posts-first + the chunky People & Groups toggle**
  (`GlobalSearch.tsx`) — operator pass (23.09.2026, the "show don't tell"
  search rework): the dropdown **defaults to the Posts section** ("the moment
  you search it should show the discover posts being searched") with a
  **chunky Posts | People & Groups mode toggle** (one tap flips to the people
  + groups sections + the "See all results in Explore" CTA). The fan-out is
  **mode-aware** (people/groups reads only fire in People & Groups mode). The
  mode resets to Posts on collapse. `globalSearch.test.tsx` re-pinned to the
  posts-first + mode-toggle model (posts default, the toggle flips to
  people+groups, Enter/CTA still open Explore).
- [✓ 3.157.0] **S5: Enter stays on the active tab + the labels match Discover**
  (`GlobalSearch.tsx`) — operator pass (24.09.2026, the search dropdown
  screenshot): "i would like if i hit enter that the search happens whether
  on posts or the people tab, like it searches / stays on both. then you can
  X it from either one in the discover! also that text is just wrong, it is
  supposed to be Trending and People, not Posts and People." (1) **Enter /
  the CTA** now navigates to Discover **with the query, staying on the active
  tab** — a bare `/discover?q=…` (Trending) or `/discover?tab=explore&q=…`
  (People), instead of always forcing `?tab=explore`. (2) The **mode toggle
  labels** are **Trending | People** (was Posts | People & Groups) — matching
  Discover's tabs; the posts section header reads "Trending"; the CTA reads
  "See all results in Discover." (3) The **query chip (with its X)** now
  renders on the **Trending tab too** (DiscoverScreen — see
  `discover-reorg.md`), so the search can be X'd from either tab.
  `globalSearch.test.tsx` re-pinned (Enter → `/discover?q=…`; Enter on the
  People tab keeps `?tab=explore`; the CTA → `/discover?q=…`; the section
  testid is `global-search-section-trending`).

**Ownership:** this lane owns `Layout.tsx`, `src/components/Search/`,
`src/data/search.ts`. It does **not** touch `DiscoverScreen.tsx` or the
subtabs (discover-reorg owns those) — the only hand-off is the `?q=` deep
link, which is a contract, not a shared file.

---

## Acceptance bar (design.md §12)

- The field is reachable on every screen (desktop + 375px); the dropdown
  passes the screenshot test (people/groups/posts sections, a result row,
  the "see more" links, the no-match state).
- **Deep links:** "see more" targets are refresh-safe + shareable
  (`/discover?tab=people&q=…` restores the browser with the query).
- All states designed (idle / loading / results / no-match / anon-degraded);
  tokens only; `data-testid` hooks on the field, each section, each result,
  each "see more."
- **I3 holds:** the search only surfaces what the reader's principal can
  read (anon sees the public subset; the fan-out reuses the existing
  principal-based reads, no new access surface).

## Out of scope (filed, not built)
- The node multi-entity search endpoint (the scale fix for 1000+ people).
- Search suggestions / recent searches / trending searches (v2 polish).
- The marketing site's global search (it has its own `SearchBar`; mirroring
  this is a `discover-reorg` M1 follow-up).
