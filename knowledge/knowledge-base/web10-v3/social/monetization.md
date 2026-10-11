# Monetization (web10-social): The App-Owned Ad Surface

> **v3** (15.09.2026, D75). Where a creator's ads + a node operator's ad
> inventory live: **inside web10-social**, not the authenticator. Read
> `ads.md` (the ad object + the service-agnostic node mechanism),
> `ads-dissemination.md` (the `ad_preference` on the doc), and `node-ads.md`
> (the operator's inventory) first.

## The Separation (D75)

The ad *mechanism* is a node primitive and is **service-agnostic** — the node
does not vet an ad's `collection_name`; the `ad`/`node_ad` tag + the
`ad_preference` pointer + group membership (I3) are the whole model. The ad
*catalog* + monetization *onboarding* are **app-owned**: web10-social is the
first (and for now only) app that builds them, and it shapes an ad as a
**post** because that's what a social ad is.

| Layer | Owns | Shape |
|---|---|---|
| **web10 (node)** | the ad mechanism — `ad_preference` columns, I3-checked inline serve, node-ad attachment, the `ad`/`node_ad` tags | service-agnostic, no catalog, no "what is an ad" opinion |
| **web10-social** | the ad catalog + affiliate onboarding + the node-ad inventory | "an ad is a post tagged `ad`" — the social shape, owned by the social app |
| **authenticator** | identity, contracts, groups, node config | no monetization |

This is D60 applied one level up: the protocol stays one size, the app owns the
schema. The "ridiculous generic catalog" never gets built — the catalog is
social's, so it's allowed to be posts-shaped without claiming to be the
protocol's.

## The Surface

A deep-linked **`/monetize`** screen in web10-social (the URL holds the state —
refresh restores it, it's shareable). The Monetization tab is **Ads | Products
| Analytics** for every signed-in user (the ads-october focus #5 restructure —
the "stay" in one place: what's running, what they're selling, how it's
performing). There is **no separate Node tab**: a node admin's node-ad
inventory (the density + overwrite knobs + the node ads) is **folded into the
Ads tab**, where the ad list is unified (regular ads + node ads, filtered by
scope). Selected by the URL's `?tab` param:

- **Ads** (default, the bare URL) — the ad catalog + affiliate onboarding. For
  a node admin, the node-ad controls (density + overwrite) + the node ads are
  folded in (the scope filter: All | Regular | Node).
- **Products** (`?tab=products`) — the catalog of the ad's product attributes
  (the "what I'm selling" view — the storefront's data).
- **Analytics** (`?tab=analytics`) — the projection-vs-actual tell (the "how
  it's performing" view).

**The in-page tab row is the section switcher** — the X/Threads idiom the Posts
screen's Discover | Following row established. Every signed-in user gets the
**Ads | Products | Analytics** row (three tabs, for everyone). The URL holds the
section, so refresh restores it + it's deep-linkable. A stale `?tab=node` deep
link (the retired Node tab) falls back to the Ads tab, where the node inventory
now lives. The nav has ONE Monetization entry (see "The Nav" below) that
deep-links here and highlights on any section.

### Ads (every signed-in user)

The creator's own monetization (the old "My Ads"):

- **The ad catalog** — the creator's ads (posts tagged `ad` in their followers
  group) + albums (posts tagged `ad_album`) + the posts they're pinned to.
  Create / **edit** / pause / resume / retire an ad; make an album; pin an ad to
  a post. This is the authenticator's old `AdsCard`, re-homed. **Edit** keeps the
  same `doc_id` (an update is a new version), so a post that has the ad pinned
  keeps pointing at it and the new creative/offer/format shows immediately.
- **The ad form** — create **and** edit. It carries the **format toggle**
  (`inline` / `post` — see `ads.md` "Two Formats"), a **media attach** (one
  image or video, the creative), CTA suggestion chips, and an optional `kind`
  (`none` = self-promo hides the partner field).
- **The Run-as scope (node admin only, create)** — the node admin's **New Ad**
  form gains a **Run as** toggle (Personal ad / Node ad). Personal → the
  creator's followers group (the existing path). Node → the discover group,
  tagged `ad` + `node_ad` (the operator's inventory, via `createNodeAd` in
  `ads-catalog.ts`). A node admin runs an ad as a personal ad OR a node ad from
  one surface — no separate panel. Edit mode has no scope (an ad's home is fixed
  by where it was created); a non-admin's form is personal-only (no toggle).
- **Affiliate onboarding** — the "get started" pointer to the affiliate
  programs worth joining (external sign-up links) + the direct-deals surface.
  This is the old `AffiliateProgramsCard` / `DirectDealsCard`, re-homed. The
  full guide is `monetization-bootcamp.md`.

The data is the owner's own posts over their followers group, filtered
client-side (a creator's own posts are a small, bounded set) — the house
pattern. `readMyCatalog` / `splitCatalog` / `updateAd` / `createNodeAd` in
`src/data/ads-catalog.ts`.

#### The node-ad inventory (node admin only, folded into the Ads tab)

There is **no separate Node tab** — the operator's node-ad inventory (D57, the
second layer) lives **inside the Ads tab**, because a node owner's ads are just
ads with a scope (regular vs node), not a different product. Two pieces:

- **The node-ad controls** (`NodeAdControls.tsx`, the "Node Ads" card at the top
  of the Ads tab) — the two operator knobs: **Ad density** (`node_ad_percentage`,
  0-100: how often node ads attach to posts) + **Overwrite the creator's ad?**
  (`node_ad_overwrite`, default **off**). When on, a node ad **replaces** the
  creator's ad on the same post (only the node ad shows); off (the D57
  non-steal principle) → both show, the creator's monetization is never
  suppressed. Reads the effective node config (admin); a non-admin gets a 403 →
  the controls degrade to read-only.
- **The unified ad list** — the operator's regular ads + the node ads (the
  discover group, tagged `ad` + `node_ad`) in **one list**, with a **scope
  filter** (All | Regular | Node) to narrow by kind. A node ad row carries a
  **NODE** badge and has **no Pin control** (a node ad is the operator's
  inventory — it attaches at the density, not by pinning to a post); a regular
  ad row has Pin. Editing a node ad uses `updateNodeAd` (keeps the `node_ad`
  tag); editing a regular ad uses `updateAd`. The New Ad form's **Run as** scope
  is how a node admin creates either kind.

This is the old `AdInventoryCard`, re-homed + merged into the Ads tab. It reads
the discover group + the admin node config (`/config`), and writes
`node_ad_percentage` + `node_ad_overwrite` via `/config/update`.

### Products (every signed-in user) — the product maker (D89)

The **product maker** (D89): the creator's **products** (the first-class
entities — a `posts` doc tagged `product` in the followers group), rendered as
a grid of product tiles (picture + name + price + the commission badge + the
`$ / sale` + the `~$ / 100k` projection + the offer CTA). This is the
**private management face** of the storefront — the "what I'm selling" view.
Each product is the **master** (the single source of truth for the affiliate
link, the price, the commission, the pics); the ads reference it by
`product_id`. A product tile has a **make-an-ad** affordance (create a new ad
off the product) + an **edit** affordance (edit the master).

The **public storefront** (focus #1) is the *shareable browsing face* of this
same data — a deep-linkable `/u/:username/store` route (the "here's everything
I recommend" destination). Same data, two surfaces: Products is the owner's
management view (the product maker), the storefront is what the audience
browses. See "The Storefront" below.

Data: `readMyCatalog` split to the `product`-tagged docs (`ProductsSection.tsx`).
No node surface (D60).

### Analytics (every signed-in user)

The "how it's performing" view (ads-october focus #4 — the diagnostic). For
each product ad it shows the **projection** (the hypothesis — the static
"100k impressions ~ $X" line, assumed rates, focus #3) vs the **actuals** (the
reality — the $ the operator logged from their affiliate dashboard, the
"actuals box"). The **gap is the tell**: a badge (winner / on track /
underperforming / not matching) + a note. The **click counter** (the measured
half) is the **D86 content-analytics engine** — a separate lane, not built yet —
so this section shows a "clicks coming soon" note and runs the tell on
projection-vs-actuals for now.

The actuals box is **human-in-the-loop**: web10 can't see the affiliate payout
(off-platform, no API), so the operator logs the number web10 can't measure —
the "organic, no-integration" trade-off. The **self-calibration** (the operator
sets their own click→purchase %) overrides the projection's assumed conversion.

The **portfolio view** (the "net's total catch") summarizes the whole catalog at
the top: product count + the total projected value (the sum of the per-100k
projections) + the total actuals logged — so 30 ads read as a portfolio, not a
pile. The **what-if calculator** (the interactive projection) is a per-ad
impressions slider: drag it and the projected $ moves live (the "do I care
about this ad" decision made concrete). Both are pure client-side math over the
product fields — no node surface (D60).

Data: `readMyCatalog` filtered to product ads (`AnalyticsSection.tsx`). No node
surface (D60).

### The Storefront (public, deep-linkable)

**`/u/:username/store`** — the "here's everything I recommend" destination
(ads-october focus #1, "Amazon storefront parity"). A shareable page that
renders the creator's **products** (the master, D89) as a browsable grid (each
tile = a product: picture + name + price + the `$ / sale` + the `~$ / 100k` +
the offer CTA).
The thing Amazon gates behind a big following, web10 gives every creator.

Access is **group-gated (I3)**: the owner + the creator's followers can read
the followers group's `posts` service; an anon / non-follower read 403s → the
"follow to browse" state (the web10 "public to your audience" model — no new
grants, D60-clean). The profile header has a **Store** button (owner + visitor)
that deep-links here. Data: `readUserAds` / `readStorefront` in
`ads-catalog.ts` (`StorefrontScreen.tsx`).

### Node Ads (node admin only)

The operator's ad inventory (D57, the second layer) is **folded into the Ads
tab** (see "The node-ad inventory" above) — there is no separate Node tab. The
node ads are the `node_ad`-tagged docs on the discover group, managed in the
unified ad list (create / pause / resume / retire) + the node-ad controls
(density + overwrite). A node ad supports **both formats** (`inline` / `post`) +
media, exactly like a creator ad — "node ads and post ads work the same exact
way."

## Node-Admin Detection

The **node-ad inventory** (the Ads tab's Node Ads card + the unified ad list's
node ads + the scope filter) + the ad form's **Run-as scope** appear **only when
the current user is the node admin**. Detection reuses the existing `POST
/am_admin` (no new endpoint) — the same check the authenticator's
`I.checkAdmin()` uses:

```
POST /am_admin  { token }  →  { admin: boolean }   (never errors)
```

`src/data/ads-catalog.ts` exposes `checkNodeAdmin(): Promise<boolean>` (calls
`/am_admin` with the current token; `false` on no token / failure). A
`useNodeAdmin()` hook caches the result for the session. The Monetization
surface renders the node-ad controls + the scope filter + the ad form's Run-as
scope only when it's `true`.

## The Nav

ONE entry. The nav has a single **Monetization** row (the `$` icon) for every
signed-in user — a **permanent desktop sidebar row** (the operator, 23.09.2026:
"take monetization out of the more menu on desktop, there is space for it") +
the mobile "More" sheet. It deep-links to `/monetize` (Ads, the default) and
**highlights on ANY `/monetize` section** (Ads / Products / Analytics) — the
surface's in-page tab row is the section switcher, so the nav has one entry that
lights up for all three. There is NO separate "Node Monetization" nav row (the
node-ad inventory is folded into the Ads tab, not its own nav entry).

## What Moved Out of the Authenticator

The Studio's monetization cards are **removed** from `ui/src/components/Studio/`:
`AdsCard` (the catalog), `AffiliateProgramsCard`, `DirectDealsCard`,
`LadderCard`, `AdInventoryCard` (node ads), and `MembershipsCard` (deleted — it
called the dead `/payments/stripe/connect`). Their data (`ads-data.ts`, the
monetization parts of `studio-data.ts`) moves to web10-social's
`src/data/ads-catalog.ts`. The authenticator keeps identity / contracts /
groups / node-config.

## The Data Model (the social shape)

| Thing | Doc | Where | Tag |
|---|---|---|---|
| a creator ad | a post | the creator's followers group | `ad` |
| an ad album | a post | the creator's followers group | `ad_album` |
| a node ad | a post | the discover group | `ad` + `node_ad` |

The `offer` (the leaf-typed link that pays) + `status` are on the ad's body
(`ads.md`). Carrying an ad is the *post's* `ad_preference` (`pinned` +
`target`), not the ad's `ref_value` (`ads-dissemination.md`). The ad's optional
**product section** (the "ad is the superset" — name / price / commission /
actuals / calibration, leaf-typed `number` + `text`) is also on the ad's body
(`ads.md` "The Product Section") — the input for the projection + the
Products/storefront views.

## Out of Scope

- **Content moderation's separate `posts` hardcode** (`documents.py`, D59 —
  only posts-on-discover auto-hide) is a different coupling, not ads.
- **Memberships / tips** (the Stripe Connect subscriptions) — the old
  `MembershipsCard` is deleted; memberships is a future rung, not built.
- **The v4 ad-network layer** (campaigns, targeting, DSP/SSP) — a different
  product, `../../web10-v4/db/clickhouse-v4.md`.
