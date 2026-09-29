# Global Search — the top-bar everything-search (operator pass, 18.09.2026)

**Status: SHIPPED + AMENDED (3.162.0) + RE-AMENDED (3.174.0) + S8 (3.175.0) + S9 (3.178.0) + S10 (3.180.0).** The
always-expanded everything-search shipped in the desktop **top bar** (S1–S4).
`discover-ia-consistency.md` (3.157.0) moved the desktop field's home from the
top bar to the sidebar (the operator's Facebook-style chrome). **On 29.09.2026
(3.174.0) the field's home moved BACK to the top bar** — the operator's pass:
"have the search be in the topbar again, the design just works now, instead of
this traffic jam." The desktop top bar now carries the **search field** (a
fixed-width pill, left slot) + the bell + the account row; the sidebar carries
the full **web10** wordmark (the "10" in brand violet) + the nav rows. **Mobile
is unchanged** (the 56px header keeps the icon → full-screen results view).
**S7 (3.162.0) made the search people-first** — the dropdown opens on the
People mode (people + groups, live as you type), opposite to Discover (where
Trending is the first tab); the "see all" CTA + Enter in People mode land on
the People tab. **S8 (3.175.0) made the search four categories** — the
Discover split's four flat destinations (Video · Shorts · Hot Gossip · People)
are the four search categories: the dropdown's mode toggle is the four
destinations, one tap picks the category, and Enter / the "see all" CTA open
THAT destination with the query (`/video?q=`, `/shorts?q=`, `/hot-gossip?q=`,
`/people?q=`); the Shorts destination honors `?q=` (the wall filters its tiles + a query
chip). **S9 (3.178.0) made the search the open tab's live filter** — the four
categories are the four nav tabs: a category tap OPENS that tab (navigates to
its destination, carrying the query), and typing in the field, while a tab is
open, filters THAT tab as you type (the query is written to the destination's
URL as `?q=`, debounced — the destinations' existing `?q=` client-side filters
do the rest, live). The field is the tab's search box; the dropdown is the
preview (a few rows + the "open the tab" CTA). **S10 (3.180.0) keeps the
dropdown open on a topic change** — a category tap / Enter / the "see all"
CTA navigates to the picked tab AND keeps the dropdown open (the operator
wants to see the results as they search, not have it collapse the moment the
tab opens); the mode follows the now-open tab and the field re-seeds from the
new URL's `?q=`, so the preview matches the tab being filtered. A row tap
(person / group / post / short) still closes the dropdown (it is not a topic
change). The state machine (always-
expanded field, focus → dropdown, X clears the query, the typed query
persists) is unchanged. Everything below is the
historical record; the current desktop home is the **top bar**.

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
- **Results:** type → **debounced** (the app's 400ms idiom) → a **slim
   segmented mode toggle** (People | Trending) over the results. **People
   (people + groups) is the default** (S7, 25.09.2026 — the search is
   people-first, **opposite to Discover** where Trending is the first tab):
   the small people/groups results appear live as you type, and the "see
   all" CTA / Enter land on the People tab. One tap flips to **Trending**
   (the posts section); its Enter keeps the S5 active-tab hand-off. The
   labels match Discover's tabs — the operator (24.09.2026): "it is supposed
   to be Trending and People, not Posts and People." All three fan-out reads
   load together on the query (the mode only picks which sections are
   shown), so a flip is instant and each section renders independently.
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
- **Enter / the CTA** → Discover **with the query** (`?q=`). The destination
  follows the results mode (S7): **People mode** → the **People tab**
  (`/discover?tab=explore&q=…` — the "see all" lands where the small results
  came from); **Trending mode** → whatever tab is active (the operator,
  24.09.2026: "i would like if i hit enter that the search happens whether
  on posts or the people tab, like it searches / stays on both"). A bare
  `/discover?q=…` lands on Trending (the bare-URL default);
  `/discover?tab=explore&q=…` lands on People. The query chip
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
- [✓ 3.160.0] **S5: Enter stays on the active tab + the labels match Discover**
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
- [✓ 3.161.0] **S6: the Facebook-style search — the unclipped wide dropdown +
  the Profiles/Groups subtabs** (`GlobalSearch.tsx` + `Layout.tsx` +
  `DiscoverExploreTab.tsx` + `DiscoverScreen.tsx`) — operator pass
  (25.09.2026, the search dropdown + Discover screenshots + two Facebook
  references): "that search bar looks chopped though" + "this dropdown looks
  terrible too" + "facebooks looks much better" + "in the subtab of people
  groups and profiles instead of groups and people! but people should be the
  logo of the two people … in the subtab, it should be profiles and groups,
  i.e. profiles is individual people profiles. and should be just one person
  logo!". (1) **The unchopped field** — the sidebar's `overflow-hidden` (a
  decorative-glow clip) was clipping the dropdown to the 256px sidebar; the
  glow now clips in its own inner container and the dropdown is a **wide
  panel** (`w-[26rem]`, `rounded-xl`) that overflows into the content,
  Facebook-style. The field is a **rounded-full pill** (h-10, `bg-elevated`),
  the placeholder shortens to "Search web10" (it fit), and the **X only
  renders when there's a query** (an empty field has nothing to clear). (2)
  **The Facebook-style rows** — each result row is a round glyph chip (person
  / hash / search) + the title + a subline; **person rows carry the account's
  own avatar on the RIGHT** (the Facebook suggestion row); the mode toggle is
  a slim segmented control (no chunky pills). (3) **The subtabs are Profiles +
  Groups** — the Explore tab's visibility chips read **Profiles** (the
  ONE-person glyph — individual profiles) + **Groups** (hash), and the section
  header reads **Profiles**; the **People top tab carries the TWO-people
  glyph** (it holds profiles + groups — "people should be the logo of the two
  people"). Tab *ids* + `?tab=`/`?show=` deep links unchanged.
  `globalSearch.test.tsx` re-pinned (the X is query-gated; the pill +
   wide-panel assertions) + `discoverScreen.test.tsx` +1 (the two-people People
   tab vs the one-person Profiles chip).
- [✓ 3.162.0] **S7: the search is people-first — opposite to Discover, live as
  you type, no "see results" hop** (`GlobalSearch.tsx`) — operator pass
  (25.09.2026, the search dropdown + Discover screenshots): "for search
  purposes, people should be selected firstly in the search, people first,
  opposite in discover in discover the trending tab is first, and shouldnt
  have to hit see results! the people tab should pull up automatically with
  the search as you type as well as showing the small results." The search
  and Discover are **opposite on purpose**: Discover opens on **Trending**
  (the posts board is the hero), the search opens on **People** (the front
  door is finding accounts). (1) **The default mode is People** — the
  dropdown opens on the people + groups sections, live as you type (the
  400ms debounce + per-section loading are unchanged); the Trending (posts)
  section is one tap over. (2) **The reads load together, the mode only
  picks which sections are shown** — all three fan-out reads fire on the
  debounced query (they're cheap pool reads), so a tab flip is instant (no
  re-skeleton) and each section renders independently as its read resolves.
  (3) **The "see all" lands where the small results came from** — Enter /
  the "See all results in Discover" CTA in **People mode** navigate to the
  **People tab** (`/discover?tab=explore&q=…`); in **Trending mode** they
  keep the S5 active-tab hand-off (a bare `/discover?q=…` → Trending;
  `?tab=explore` rides along when already there). The query chip (with its
  X) still renders on both tabs. `globalSearch.test.tsx` re-pinned to the
  people-first model (People default; the toggle flips to Trending; Enter →
  `?tab=explore&q=`; Enter in Trending mode keeps the active tab; the CTA →
   `?tab=explore&q=`; the no-results state is Trending-mode; per-section
   loading unchanged).
- [✓ 3.175.0] **S8: the search is four categories — the four flat destinations
    are the four search categories** (`src/data/search.ts` + `GlobalSearch.tsx`
    + `ShortsWall.tsx` + `ShortsScreen.tsx`) — operator pass (28.09.2026, the search dropdown
   screenshot): "if people selected in the search, should open people tab
   automatically, then if trending is selected, should open hot gossip tab
   with that search, but search should have all 4 categories as options to
   search! and you pick one! so all searchable". The Discover split (3.171.0)
   flattened Discover to four flat routes (Video · Shorts · Hot Gossip ·
   People), but the search still carried the pre-split **two-mode** toggle
   (People | Trending) — the "Trending" category was really Hot Gossip, and
   Video + Shorts were unsearchable. The fix makes the search mirror the nav
   exactly: **(1) the fan-out goes from three reads to five** — new
   `searchVideo` (the discover-board pool gated to video posts — the `/video`
   destination's render-time gate, `postHasVideo`, kept in lockstep with
   `DiscoverScreen`) + `searchShorts` (`readShortsFeed` — the genuine 9:16
   gate, shorts.md — filtered by text/author) join `searchPeople` /
   `searchGroups` / `searchPosts`; `globalSearch` returns
   `{people, groups, video, shorts, posts}`, each section degrading
   independently. (2) **The mode toggle is the four flat destinations**
   (People | Video | Shorts | Hot Gossip — the labels match the nav exactly),
   People still the default (S7: the search is people-first); one tap picks
   the category, each shows its own section; the "See all results for "…" in
   {Category}" CTA + Enter navigate to **that destination with `?q=`**
   (`/people?q=` / `/video?q=` / `/shorts?q=` / `/hot-gossip?q=`); all five
   reads load together on the debounced query (the mode only picks which
   sections are shown) so a flip is instant; the segmented track is
   `overflow-x-auto` + `whitespace-nowrap` so the four labels fit on one line
    at 375px. (3) **The Shorts destination honors `?q=`** — the search's Shorts
    category lands on `/shorts?q=…`; since 3.173.0 a bare `/shorts` is the
    **wall** (the lens is `/shorts/:postId`), the wall filters its tiles to the
    matches (text/author, case-insensitive — a view over the loaded wall, not a
    re-read) + shows a **query chip (with its X)** so the search is visible +
    clearable (the `?q=` idiom the other destinations already use); a no-match
    `?q=` shows a designed no-match state with the clear affordance. The lens
    keeps the same `?q=` filter + chip for `/shorts/:postId?q=…` deep links.
    `globalSearch.test.ts` re-pinned to the five-way
   fan-out (+ `searchVideo` / `searchShorts` suites); `globalSearch.test.tsx`
    re-pinned to the four-category model (the toggle; Enter / CTA per category
    → the right destination + `?q=`; the per-category sections; the no-results
    state; per-section loading; row navigation) + `shortsScreen.test.tsx` +2.
    1092 web10-social tests green, `tsc` clean. **No node change (D60 —
    entirely client-side).**
- [✓ 3.178.0] **S9: the search bar IS the open tab's live filter — a category
    tap opens that tab, and typing filters the open tab as you type**
    (`GlobalSearch.tsx`) — operator pass (29.09.2026): "on search bar, if i
    hit people, people tab should open up, when i type it should be searching
    people as i type, if i hit hot topic, the hot topic tab should show up, as
    i type it should be searching the feed! if i have video tab open as a i
    type should be filtering the videos! shorts tab, same thing!". S8 made the
    four destinations the four search categories, but a category tap only
    flipped the dropdown's preview and typing only fed the dropdown — the open
    tab was a separate surface that only learned the query via Enter / the CTA.
    S9 makes the field the tab's search box: **(1) a category tap opens the
    tab** — tapping People / Video / Shorts / Hot Gossip navigates to that
    destination (`/people` / `/video` / `/shorts` / `/hot-gossip`) carrying the
    query (`?q=`); Enter / the "see all" CTA do the same (now the tap matches
    them). **(2) the field is the open tab's live filter** — when one of the
    four search destinations is the current route, the field mirrors the tab's
    `?q=` (deep-link + refresh-safe — the URL is the source of truth) and
    typing writes the debounced query back to the tab's URL as `?q=`
    (`replace`, no history spam per keystroke); the destination's existing
    `?q=` client-side filter (DiscoverScreen / ShortsWall / DiscoverExploreTab)
    reacts and filters live. The X clears the field AND the tab's `?q=` (the
    tab un-filters). On a non-destination route (feed / profile / messages) the
    field is the front door only — the preview shows, no `?q=` is written.
    **(3) the mode follows the open tab** — the dropdown preview matches the
    tab being filtered (on `/video` it previews Video, …); on a non-destination
    route it rests on People (S7). **The interaction guard (the subtle part):**
    the `?q=` write is gated on the field being focused AND on a real
    interaction (a keystroke or the X clear) — never on mount or a bare focus —
    so a deep link (`/video?q=…`) is not wiped before the field seeds from it,
    and a navigation (a row tap) ends the live-filter gesture (the field
    re-seeds from the new URL). The X clear removes `?q=` directly (robust to
    the mousedown-blur a real browser fires before the click).
    `globalSearch.test.tsx` re-pinned to the S9 model (the four "toggle flips"
    → "on the {tab} the dropdown previews {tab}"; the three "Enter in {mode}"
    → "Enter on the {tab}"; the three "tapping a category" assert the tap
    NAVIGATES with `?q=`; the row-tap cases drop the now-redundant mode-people
    click + the short-row case moves onto the Shorts tab) + 8 new S9 cases
    (typing on each of the four tabs writes `?q=` debounced; the field seeds
    from the tab's `?q=`; the X clears the field AND the tab's `?q=`; typing on
    a non-destination route writes no `?q=`; Enter on an open tab stays on the
     tab). 1124 web10-social tests green, `tsc` clean. **No node change (D60 —
     entirely client-side).**
- [✓ 3.180.0] **S10: the search stays open on a topic change — the dropdown
     survives the navigation it triggers** (`GlobalSearch.tsx`) — operator pass
     (29.09.2026, two search screenshots): "when i change search topic, it
     switches screens which is great, but the search collapses" + "the search
     should stay open in my opinion, so the user can see the search results as
     they search". S9 made a category tap / Enter / the "see all" CTA navigate
     to the picked destination (the tab) — but the navigate → close effect
     (`useEffect` on `pathname`) closed the dropdown the moment the tab opened,
     so the user lost the preview exactly when they wanted to compare it
     against the now-filtered tab. **The fix (all client-side,
     `GlobalSearch.tsx` — no node change, D60):** a `categoryOpenRef` flag is
     set when the search's OWN navigation fires (`openCategory` — the category
     tap, Enter, and the CTA all route through it) and consumed (reset) by the
     `pathname`-change effect: when the flag is set, the effect keeps the
     dropdown open (desktop) + re-focuses the field (a real browser's mousedown
     on the category button blurred it) instead of closing it. The mode follows
     the now-open tab (the existing mode-follows effect) and the field
     re-seeds from the new URL's `?q=` (the existing seed effect), so the
     preview matches the tab being filtered. A row tap (person / group / post /
     short) is NOT a topic change — it still closes the dropdown (the flag is
     only set by `openCategory`). Mobile is unchanged (the full-screen view
     still collapses on navigate — the operator's original mobile design).
     `globalSearch.test.tsx` +5 (a new S10 block: tapping a category keeps the
     dropdown open + the mode follows the tab; the CTA keeps it open; Enter
     keeps it open; switching topics on an already-open tab keeps it open; a
     row tap still closes it — the regression pin). 1129 web10-social tests
     green, `tsc` clean. Harness `entry.tsx` gains the `/video` + `/hot-gossip`
     routes (DiscoverScreen) so the PR screenshot can show the dropdown open
     over the now-filtered tab; screenshots `search-stays-open-{desktop,375}.png`.
     **No node change (D60 — entirely client-side).**

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
