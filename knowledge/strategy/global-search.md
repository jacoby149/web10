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
 tweak. **The collision rule (operator, 18.09.2026):** the bar is **slim at
rest** — just a **search icon**, always there (like the logout) — so it never
crowds a per-screen sticky header. Tap → it **animates open** to a full-width
field; done/Escape → it **collapses** back to the icon. Desktop: a slim top
bar above the content. Mobile: the existing header carries the icon.

---

## The design

### The surface (the expanding-icon model)
A search **icon** in the app chrome, available on **every** screen (it's in
the shell, not a page). The state machine:
**`icon (rest) → expanded field → results → collapse`.**
- **Rest:** a slim search icon in the top bar / header (always there, like the
  logout). The bar stays slim — it never crowds a per-screen sticky header.
- **Expanded:** tap the icon → it **animates open** to a full-width field
  (the bar grows to hold it). Focus is in the field.
- **Results:** type → **debounced** (the app's 400ms idiom) → up to three
  sections: **People**, **Groups**, **Posts** — top ~5 each, each row tappable.
  - **Desktop:** a **dropdown** under the field.
  - **Mobile:** a **full-screen results view** (not a dropdown — a dropdown
    from a 56px header over a scrollable screen + keyboard is fiddly) with an
    **X to collapse** (the operator's call).
- **Collapse:** done / Escape / the X / navigate → the field **collapses**
  back to the icon.
- **Tap a result** → navigate: person → `/u/:username`, group →
  `/groups/:groupId` (encoded), post → the post (the profile permalink, the
  app's existing post deep link).
- **"See more People / Groups / Posts"** (one per non-empty section) → the
  Discover browser with the query applied. **This URL shape is a cross-lane
  contract with `discover-reorg` — it is pinned verbatim here and in that
  doc, and a shared deep-link test asserts it** (so the two lanes can't drift):
  - People → `/discover?tab=people&q=…`
  - Groups → `/discover?tab=groups&q=…`
  - Posts → `/discover?q=…` (the Posts tab is the default, so `?q=` alone)
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
