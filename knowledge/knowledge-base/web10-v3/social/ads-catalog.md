# Web10 Ads: The Catalog + Composer (D54)

`ads.md` defines what an ad is (a document in the `ads` default service) and how it reaches a viewer (group delivery + the per-viewer read). This doc defines the two surfaces a creator actually touches: the **Ad Catalog** in the authenticator (the inventory of *their* ads) and the **composer integration** in web10-social (attaching an ad to a post, or letting the creator's own ads rotate).

## The Use Case

A creator has offers — an Amazon tag, a brand deal, their own store. They build ads around those offers: a video of their setup with the affiliate link, a photo of the product, a text post with the store URL. On the paved platforms that inventory is invisible — the platform's ad manager owns it, and the creator can't take it anywhere.

Here the creator's ads are *their documents*. So they need a place to see them, manage them, and use them:

1. **The Ad Catalog** (the authenticator's Studio) — the creator's inventory. Every ad they've made, its offer, its status, its numbers. Add one, edit one, retire one. This is the "torture" surface: the catalog is where the ad object gets exercised end to end, by its owner, in the app they already trust for everything else.
2. **The Composer** (web10-social) — when the creator makes a post, the post can *carry* an ad from the catalog (pick one explicitly), or the creator can turn on **round-robin** so their ads rotate onto their posts automatically.

Both surfaces are reads and writes of the same documents, through the same SDK calls the rest of the app uses. No new endpoint, no new table — the catalog is a read of the creator's own `ads` collection, and the composer attachment is a `ref_value` link.

## The Ad Catalog (the authenticator)

**Where:** the Studio (`ui/src/components/Studio/`), the monetization screen. The Partner Links card (D50 — the collapse of "Amazon Associates" + "Direct Deals") is the **ingest**: offers live there. The **Ad Catalog** is the **inventory**: the ads built from those offers.

The catalog is a list of the creator's own `ads` documents:

```
w.read('ads', { groups: [followersGroupId(me)] })
```

That is the whole read. The creator's own token reads their own collection through their own followers group — the same group-scoped read any app uses, no owner special-case, no new endpoint. (The owner could also read via their own-docs path; the group read is the canonical one because it is exactly what the audience sees — what's in the catalog is what gets delivered.)

**Each row shows:**

| Field | Source |
|---|---|
| the creative | `body.creative` — media (presigned on read, the post machinery), headline, body text |
| the offer | `body.offer` — kind, partner, link, CTA, disclosure |
| status | `body.status` — `active` \| `paused` (default `active`) |
| numbers | `body.stats` — impressions, clicks (v0: materialized counters in the doc) |
| attached posts | reverse `ref_value` — the posts that carry this ad |

**Actions:**

- **New ad** — the ingest flow: pick an offer (from the Partner Links card, or define one inline), attach content (media upload through the existing media pipeline, or text), set status. Writes one `ads` document, attached to the creator's followers group.
- **Edit** — update the doc (tombstone + new insert, the house write path). Editing the offer re-points the link; editing the creative re-uploads media.
- **Pause / resume** — flip `body.status`. A paused ad is skipped by curation (`curateAds` filters on `status === 'active'`) but stays in the catalog with its numbers.
- **Retire** — tombstone the doc. It falls out of the catalog and of every feed; the numbers are gone with it (v0 has no archive — the doc is the record).

**States, all designed** (design.md §12): empty catalog (no ads yet — the CTA is "create your first ad", which opens the ingest), loading (skeleton rows), error (read failed — retry), and the per-row states (active / paused). The catalog is a screen, so it gets a route in the authenticator's mode switch (`?mode=studio` → the Studio already renders it; the catalog is a section of the Studio, not a new mode — the Studio is the monetization surface and the catalog is its inventory view).

## The Composer Integration (web10-social)

The post composer (`marketing/web10-social/src/components/Feed/PostComposer.tsx`) gains one control next to the media attach + visibility: **Attach ad**.

**The picker.** Tap it → a sheet listing the creator's catalog (the same read as the catalog screen: `w.read('ads', { groups: [followersGroupId(me)] })`, active ads first). Each entry: the creative's thumbnail/headline + the offer's partner + kind badge. Selecting one attaches it to the post being composed. The sheet has an empty state (no ads yet — a link out to the Studio catalog) and a loading state.

**What attaching does.** The post document is written with the ad link in its `ref` (the universal link — `ref_value` on create, the 3.16.2 write path):

```json
{ "ref": "<ad doc_id>", "ref_type": "ad" }
```

The post is a `posts` document; the ad stays an `ads` document. The post *carries* the ad — it does not copy it. One ad can be carried by many posts; the catalog's "attached posts" column is the reverse lookup (`ref_value = <ad doc_id>` over the creator's posts).

**Rendering.** A post that carries an ad renders the ad block under the post body: the creative (if the ad's media differs from the post's media), the offer (partner, CTA, link), and the disclosure (the FTC line, always shown — it is part of the object, not a UI option). A post with no ad renders exactly as it does today.

**Round-robin.** The composer's ad control has a second option: **Rotate my ads** (instead of picking one). When set, the post is written with no specific `ref` — and the *feed renderer* applies the creator's dissemination setting (`settings` doc, `ads.dissemination`, D51) to the creator's active ads: for each post by a creator whose setting is `round_robin`, the renderer attaches the next ad in rotation (state in the app: memory/localStorage, per D51 — the curation is a shared SDK helper, not server logic). `pinned` renders the pinned ad on every post; `greedy` and `frequency_capped` behave per D51. The composer's "Rotate my ads" is the *per-post* opt-in; the `settings` doc's dissemination is the *default* the rotation follows. A post can still pin a specific ad over the default — explicit beats automatic.

**Why the post carries the link instead of the ad becoming a post:** the ad keeps its own identity, its own numbers (stats bump per ad, not per post), and its own lifecycle (pause the ad and it stops rendering on every post that carries it — the renderer checks `status` at render time). The post is the vehicle; the ad is the payload.

## How It Maps to the Data Model

| Thing | Mechanism |
|---|---|
| the catalog | `w.read('ads', { groups: [followers group] })` — the canonical per-viewer read, run by the owner |
| new / edit / retire | the house write path on `ads` docs (create / update / tombstone) |
| status | `body.status` = `active` \| `paused` — curation filters on it |
| post carries an ad | the post's `ref` → `ref_value` = the ad's `doc_id` (the universal link) |
| attached-posts column | reverse `ref_value` lookup over the creator's `posts` |
| round-robin | the D51 dissemination setting on the `settings` doc + the `curateAds` SDK helper at render time |
| numbers | `body.stats` in the ad doc (v0 counters) |

No new tables. No new endpoints. No new SDK surface beyond the existing `create`/`read`/`update`/`delete` + `ref` on create. The only new code is UI (the catalog screen, the composer's ad control) and the renderer's ad block.

## Security Invariants

- **I3 holds unchanged.** The catalog reads the creator's own ads through their own group; a viewer only ever sees ads in groups they belong to. Attaching an ad to a post adds no new read path — the post already carries the ref, and the ad doc is only fetched by a reader who can see the post's group (the renderer resolves the ref through the same group-scoped read; a ref to an unreadable ad renders as a broken link, never as the ad's contents).
- **I5 holds.** Both surfaces run on the creator's scoped, expiring token. The catalog is the creator's own collection — no app-contract escalation is needed for the owner to manage their ads; *other* apps still need `ads: [readAll]` to read them.
- **The disclosure is not optional in the UI.** The object carries it; the renderer shows it. Hiding the FTC line is a review rejection.

## Logistics

- **Spec'd, not built.** The build bites are in the `ads` lane (`parallel-execution.md`), gated on the lane's foundation items (the `ads` service conformance, the `curateAds` helper) — the catalog and the composer both read the catalog read, and the composer's rotation calls the curation helper.
- **The Partner Links card** (the ingest, D50) is the catalog's sibling in the Studio — offers in one card, ads in the other. The "New ad" flow starts from an offer.
- **v0 scope:** status is `active`/`paused` only (no scheduled ads, no per-ad targeting — targeting is the audience, by architecture); stats are doc-embedded counters; the round-robin state is app-local (memory/localStorage) per D51. Revenue settlement, impression verification, and the v4 ad-network exchange are out of scope (`ads.md`, two-layer note).

For the ad object + the per-viewer read + dissemination, see `ads.md`. For the universal link (`ref_value`), see `../db/clickhouse.md`. For the UI standard (states, tokens, screenshots), see `../../../strategy/design.md`.
