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
refresh restores it, it's shareable). Two sections:

### Creator (every signed-in user)

The creator's own monetization:

- **The ad catalog** — the creator's ads (posts tagged `ad` in their followers
  group) + albums (posts tagged `ad_album`) + the posts they're pinned to.
  Create / pause / resume / retire an ad; make an album; pin an ad to a post.
  This is the authenticator's old `AdsCard`, re-homed.
- **Affiliate onboarding** — the "get started" pointer to the affiliate
  programs worth joining (external sign-up links) + the direct-deals surface.
  This is the old `AffiliateProgramsCard` / `DirectDealsCard`, re-homed. The
  full guide is `monetization-bootcamp.md`.

The data is the owner's own posts over their followers group, filtered
client-side (a creator's own posts are a small, bounded set) — the house
pattern. `readMyAds` / `splitCatalog` in `src/data/ads-catalog.ts`.

### Node (node admin only)

The operator's ad inventory (D57, the second layer):

- **Node ads** — the `node_ad`-tagged docs on the discover group. Create /
  pause / resume / retire.
- **Ad density** — the `node_ad_percentage` node-config slider (0-100).

This is the old `AdInventoryCard`, re-homed. It reads the discover group + the
admin node config (`/config`), and writes `node_ad_percentage` via
`/config/update`.

## Node-Admin Detection

The "Node" section + the nav icon appear **only when the current user is the
node admin**. Detection reuses the existing `POST /am_admin` (no new endpoint)
— the same check the authenticator's `I.checkAdmin()` uses:

```
POST /am_admin  { token }  →  { admin: boolean }   (never errors)
```

`src/data/ads-catalog.ts` exposes `checkNodeAdmin(): Promise<boolean>` (calls
`/am_admin` with the current token; `false` on no token / failure). A
`useNodeAdmin()` hook caches the result for the session. The nav renders the
"Node Monetization" icon only when it's `true`.

## The Nav

Two entries, both siblings of Groups (the desktop sidebar + the mobile "More"
sheet):

- **Monetization** — every signed-in user. Deep-links to `/monetize` (the
  Creator tab, the default): the creator's ad catalog + affiliate onboarding.
- **Node Monetization** — the node admin only (non-admins never see it).
  Deep-links to `/monetize?tab=node`: the node-ad inventory + density.

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
`target`), not the ad's `ref_value` (`ads-dissemination.md`).

## Out of Scope

- **Content moderation's separate `posts` hardcode** (`documents.py`, D59 —
  only posts-on-discover auto-hide) is a different coupling, not ads.
- **Memberships / tips** (the Stripe Connect subscriptions) — the old
  `MembershipsCard` is deleted; memberships is a future rung, not built.
- **The v4 ad-network layer** (campaigns, targeting, DSP/SSP) — a different
  product, `../../web10-v4/db/clickhouse-v4.md`.
