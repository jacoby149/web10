# Discover IA Consistency — one Discover, two apps (operator pass, 23.09.2026)

**Status: PLANNED (awaiting operator sign-off).** The operator's pass (23.09.2026,
~13 screenshots) converges on one idea: **the Discover surface should read the
same in the social app and on the marketing site** — same tabs, same names, same
icons, same card shapes, same chrome. Right now the two apps have drifted: the
social Discover is `Posts | People` with a top-bar search, the marketing
`/trending` is `Posts | People | Groups` with a hero search, different card
shapes, and a "super old" groups render. This doc is the fixed point that makes
them one surface.

> **The one-liner:** Discover = **Trending | Profiles**, in both apps. Search
> lives in the **sidebar** (desktop) / header (mobile). The **Profiles** browser
> mashes **People + Groups** (the social Explore tab) and is mirrored verbatim on
> the marketing site. The marketing nav's "Trending" is renamed **Discover**.

**Companion docs:** `discover-reorg.md` (the social Discover browsers — this
reuses + renames them) · `global-search.md` (the search surface — this moves its
home) · `design.md` (the quality bar). **No node change** (D60 — every change
here is client-side in `web10-social` + `marketing-ui` + the shared
`@web10/discover` package).

---

## The operator's intent (verbatim, 23.09.2026)

> "the new discover looks great, just no padding at all on the sides."

> "also posts and people could go in the top bar on desktop!"

> "Like facebook we could just have a logo of keys, no web10 text."

> "then the search would fit in the sidebar!"

> "here it is more apparent the search bar is in the sidebar on facebook, then
> the results are the discover results, which would be posts or people
> depending!"

> "also the marketing page is out of sync, to be consistent."

> "that should be [the social's chunky Posts|People] this [the marketing's small
> text tabs]."

> "and the marketing tab doesnt display it like that which it should."

> "that is rendering groups in a super old way, it should be the people tab and
> the trending tab like it should be pretty consistent with the discover tab in
> the social media app."

> "Like that too on the marketing page isnt consistent with the socials discover,
> it should be trending and people now."

> "also people logo should be the two overlapped people, and the subtab called
> people should be called profiles, and be one person logo, so swap those logos,
> and groups is just fine!"

> "also this shouldnt be posts and people, this should be trending and people,
> more accurate … that flame icon by posts means trending posts, so call it
> trending instead of posts, much better."

> "I am referring to that the marketing pages trending, which should be called
> discover instead."

> "this should be home discover app store."

---

## The fixed point (what "done" looks like)

### The tabs: `Trending | Profiles` (both apps)
- The social Discover's top-level tabs are **Trending | Profiles** (was
  `Posts | People`). **Trending** keeps the flame icon (it *is* the trending
  posts board — the name now says that). **Profiles** is the people+groups
  browser (was "People"/"Explore").
- The marketing `/trending` (renamed **Discover**, see chrome) shows the same
  **Trending | Profiles** tabs, in the **chunky** style the social app uses
  (big pills + icons), not the current small text row.
- **Groups is not a top-level tab in either app.** It lives inside the Profiles
  browser as a section (the social Explore tab already does this). The marketing
  drops its top-level "Groups" tab; the standalone `/groups` page is retired
  (redirects to `/trending?tab=profiles`).

### The icons (the "swap")
| Surface | Concept | Icon |
|---|---|---|
| Discover top-level tab | **Trending** | `Flame` (unchanged) |
| Discover top-level tab | **Profiles** | `User` (one person) |
| Profiles browser section | **People** | `Users` (two overlapped people) |
| Profiles browser section | **Groups** | `Hash` (unchanged — "groups is just fine") |

The operator's "swap those logos" = the **Profiles tab** carries the one-person
glyph and the **People section** carries the two-overlapped glyph (they must not
be mixed up). The marketing mirrors the same mapping.

### The chrome (desktop)
- **Sidebar** (Facebook-style): the **keys mark only** (no "web10" wordmark) at
  the top, then the **search field** (moved down from the top bar), then the nav
  rows (Profile · Shorts · Discover · Feed · Messages · Monetization · More).
- **Top bar**: the **Trending | Profiles** tabs (on the Discover screen) on the
  left, the notifications bell + account row on the right. The search is gone
  from here (it's in the sidebar now).
- **Mobile**: unchanged — the 56px header keeps the search icon → full-screen
  results view (a phone can't carry a sidebar search field).

### Search results = Discover results
Typing in the search shows the **Discover** results — **Trending posts** (the
default) or **People & Groups** (the chunky mode toggle, already built in
`GlobalSearch`). Enter / the CTA deep-links into the Profiles browser with the
query applied (`/discover?tab=profiles&q=…`). This is the existing `GlobalSearch`
behavior; only its *home* moves (top bar → sidebar).

### Marketing = a faithful mirror
The marketing Discover page renders the **same** Trending board + the **same**
Profiles browser (People + Groups mashed, the `?show=` toggle, the **new**
banner+avatar card shapes) as the social app. The "super old" flat group cards
are gone. Cards come from the shared `@web10/discover` package so the two apps
can't drift again.

---

## The bites (small, one owner each)

Sequencing note: **C1 (shared cards) gates C3 (marketing mirror).** The social
chrome/renames (A + B) are independent of the marketing work (C). All client-side.

### A — Social Discover: rename + icons + padding (web10-social)

- [ ] **A1: `Posts` → `Trending`, `People` → `Profiles` (the tab row).**
  `DiscoverScreen.tsx` `DISCOVER_TABS`: the `trending` tab's label `Posts` →
  **`Trending`** (icon stays `Flame`); the `explore` tab's label `People` →
  **`Profiles`** (icon stays `User`, one person). The tab *ids* are unchanged
  (`trending` / `explore`) so `?tab=` deep links + the `?tab=explore&q=` search
  hand-off keep working — only the visible label moves. `data-testid`s
  (`discover-tab-trending` / `discover-tab-explore`) unchanged. Re-pin
  `discoverScreen.test.tsx` (the two label assertions).
- [ ] **A2: the People section icon = two-overlapped; confirm the Profiles tab =
  one-person.** `DiscoverExploreTab.tsx` — the People section toggle chip already
  uses `Users` (two overlapped); the Profiles tab (A1) uses `User` (one person).
  Verify the two are not swapped anywhere (the operator's "swap those logos");
  the section header "People" + the `?show=` toggle keep the `Users` glyph.
  Groups keeps `Hash`. No behavior change — icon/label only.
- [ ] **A3: side padding on the Discover screen.** The operator: "no padding at
  all on the sides." The Discover content wrappers run `md:px-0` (full-bleed on
  desktop, matching the 3.153.0 "video wall is the hero" pass). Restore a
  desktop gutter so the wall breathes — `md:px-4 lg:px-6` (or the feed's
  `md:px-4`) on the content column, keeping the 1/2/3-col grid. Mobile (375px)
  stays full-bleed (`px-4`). Screenshot at 1440 + 375 to confirm the gutter
  reads as designed, not as a regression of the "fill the viewport" pass.

### B — Social chrome: search to the sidebar, tabs to the top bar (web10-social)

- [ ] **B1: the keys mark only (no wordmark) in the sidebar.** `Layout.tsx`
  `Wordmark` — the desktop sidebar's top row drops the "web10" text, keeping
  just the `/keys-mark.png` glyph (Facebook-style). The mobile header keeps the
  full lockup (it's the only branding on a phone). Add a `compact`/`markOnly`
  variant to `Wordmark` rather than deleting the text (the mobile header still
  uses the full form). Re-pin the Layout wordmark test.
- [ ] **B2: the search field moves from the top bar to the sidebar (desktop).**
  `Layout.tsx` — the desktop `<GlobalSearch variant="desktop" />` leaves the top
  bar and renders at the top of the sidebar (under the keys mark, above the nav
  rows). The top bar keeps the bell + account row. The search's results dropdown
  now anchors to the sidebar (it's a `position:relative` container — the
  dropdown already positions `absolute top-full` off its wrapper, so it follows
  the field). The field's always-expanded desktop form is unchanged
  (`global-search.md` S3). Mobile is untouched (the 56px header keeps the
  icon → full-screen results view). Re-pin `globalSearch.test.tsx` + the Layout
  cases (the desktop field is now in the sidebar, not the top bar).
- [ ] **B3: the Trending | Profiles tabs move into the top bar (desktop,
  Discover screen only).** The Discover screen's sticky tab row
  (`discover-tab-row`) moves from below the top bar into the top bar's left side
  when the active screen is Discover. On non-Discover screens the top bar shows
  only the bell + account (the tabs are Discover-specific). Implementation:
  `Layout.tsx` reads the current route and, on `/discover`, renders the two tabs
  in the top bar; `DiscoverScreen.tsx` drops its own sticky tab row on desktop
  (it keeps it on mobile, where there's no top bar). The tabs stay
  `?tab=`-driven (deep-linkable). **Decision point (flag to operator):** this
  couples the top bar to the Discover route — an acceptable, small coupling for
  the Facebook-style chrome the operator asked for. Re-pin `socialScreens.test.tsx`
  (the tab row is in the top bar on desktop Discover) + `discoverScreen.test.tsx`.

### C — Marketing: mirror the social Discover (marketing-ui + shared)

- [ ] **C1: extract the People + Groups cards into `@web10/discover` (the
  keystone).** `discover-reorg.md` M1 already called for this. Move the social
  `PersonCardRow` (banner+avatar+name+@handle+followers+Follow) and
  `DiscoverGroupCard` (banner+avatar+name+owner+members+join-policy+Join) into
  the shared package as **remote-mode** components (link-out to the social app,
  no in-app follow/join — the marketing is anon). The social app re-imports them
  (interactive mode) so there's one source. This is what lets the marketing
  render the *same* cards. `@web10/discover` `index.ts` exports them; both apps'
  `@source` already scans the package (3.111.0).
- [ ] **C2: the marketing nav — `Trending` → `Discover`; drop `Groups`.**
  `Navbar.tsx` `navItems`: `{ path: '/trending', label: 'Trending' }` →
  `{ path: '/trending', label: 'Discover' }`; remove the `{ path: '/groups' }`
  row (groups now live inside Discover). The operator: "this should be home
  discover app store." The `/groups` route redirects to `/trending?tab=profiles`
  (so old links + the footer/Join/Exporter "Trending" links keep working — update
  those three links' labels to "Discover" too). Re-pin any Navbar/route tests.
- [ ] **C3: the marketing Discover page = the social Discover (Trending |
  Profiles).** `Trending.tsx`:
  - The tab row becomes **Trending | Profiles** (chunky, icon+label pills,
    matching the social) — was `Posts | People | Groups`. The `posts` tab →
    **Trending** (flame); the `people` tab → **Profiles** (one-person); the
    `groups` tab is **removed** (groups fold into Profiles).
  - The **Profiles** tab renders the **mashed People + Groups browser** — the
    social Explore tab's shape: the `?show=` People/Groups toggle (People =
    two-overlapped, Groups = hash), People first then Groups, each paged, using
    the **shared** cards from C1. (Replaces the current separate `TrendingPeople`
    + `TrendingGroups` pages + the "super old" flat group cards.)
  - The **Trending** tab is unchanged (the video wall / Hot Gossip) — it already
    mirrors the social.
  - The hero search stays (the marketing has no sidebar) but the tab styling +
    the Profiles browser now match the social.
  - `?tab=` values: `posts` (bare) / `profiles` (was `people`) / `groups`
    (retired → redirects to `profiles`). Re-pin `Trending.test.tsx`.
- [ ] **C4: marketing card parity (the "super old" groups render is gone).**
  With C1 + C3, the marketing People + Groups cards are the shared banner+avatar
  shapes (the same as the social Discover). The old `TrendingGroups` flat card +
  the standalone `/groups` `GroupDirectory` card are retired. Confirm the
  marketing People card matches the social `PersonCardRow` (it already is
  banner+avatar; C1 unifies them).

### D — Docs + bookkeeping (same branch as the code)

- [ ] **D1: keep the KB true.** `discover-reorg.md` (the tabs are now
  `Trending | Profiles`; groups is a section, not a tab) + `global-search.md`
  (the search's home is the sidebar on desktop) + this doc's ticks. `AGENTS.md`
  only if a stack/auth fact changed (it doesn't — pure UI). A CHANGELOG line
  (feature → minor bump) + the lane ticks.

---

## Sequencing + dependencies

```
C1 (shared cards) ──> C3 (marketing mirror) ──> C4 (card parity)
C2 (marketing nav) is independent
A1, A2, A3 (social rename/icons/padding) are independent
B1, B2, B3 (social chrome) are independent of A + C
D1 (docs) lands with the code
```

**Bite-size parallelization:** A (social Discover) + B (social chrome) +
C (marketing) are three independent workspaces (different files: A/B own
`web10-social`, C owns `marketing-ui` + `shared/discover`). C1 must land before
C3. A and B both touch `Layout.tsx`/`DiscoverScreen.tsx` — **sequence B3 after
A1** (both touch the Discover tab row) or split them.

**Operator sign-off needed before build** (the flagged decisions):
1. **B3** — the Trending|Profiles tabs in the *global* top bar (Discover-only).
   Confirm that's the intent vs. keeping them as a screen-level row.
2. **C2** — dropping the marketing **Groups** nav row + the standalone `/groups`
   page (groups fold into Discover/Profiles). Confirm.
3. **A1** — "Profiles" as the tab name (it contains People *and* Groups). Confirm
   the label vs. keeping "People."

---

## Acceptance bar (design.md §12)

- **The screenshot test** at 1440 + 375 for: the social Discover (Trending |
  Profiles, sidebar search, keys-only mark), the marketing Discover (same tabs,
  same Profiles browser, same cards). The two apps read as one surface.
- **Deep links:** `?tab=trending|profiles`, `?q=`, `?show=`, `?view=`
  refresh-safe + shareable in both apps; the retired URLs (`/groups`,
  `?tab=people`, `?tab=groups`) redirect.
- **Tokens only**, all states designed (loading / empty / no-results / paged) on
  the Profiles browser in both apps. `data-testid` hooks kept + added.
- **I3 holds:** the marketing Profiles browser is anon reads only (the D0 people
  read + the D53 group directory — both already anon-capable).
- The existing `discoverScreen` / `globalSearch` / `socialScreens` /
  `Trending` suites stay green (re-pinned where the shape moved). No node change.

## Out of scope (filed, not built)
- A node multi-entity search endpoint (`global-search.md` follow-up).
- The marketing site's own sidebar (it's a pitch site, not an app — it keeps the
  top nav + hero search).
- Any change to the D0 people read or the D53 group directory (they're correct;
  this only re-renders them consistently).
