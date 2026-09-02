# Web10 Ads: The Catalog + Composer (D54, D55)

`ads.md` defines what an ad is (a `posts` document tagged `ad` — a piece of content + a link that pays) and how it reaches a viewer (group delivery + the feed read). This doc defines the two surfaces a creator actually touches: the **Ad Catalog** in the authenticator (the inventory of *their* ads) and the **composer integration** in web10-social (attaching an ad to a post, or letting the creator's own ads rotate).

## The Use Case

A creator has offers — an Amazon tag, a brand deal, their own store. They build ads around those offers: a video of their setup with the affiliate link, a photo of the product, a text post with the store URL. On the paved platforms that inventory is invisible — the platform's ad manager owns it, and the creator can't take it anywhere.

Here the creator's ads are *their posts*. So they need a place to see them, manage them, and use them:

1. **The Ad Catalog** (the authenticator's Studio) — the creator's inventory. Every ad they've made, its offer, its status. Add one, edit one, pause one. This is the "torture" surface: the catalog is where the ad object gets exercised end to end, by its owner, in the app they already trust for everything else.
2. **The Composer** (web10-social) — when the creator makes a post, the post can *carry* an ad from the catalog (pick one explicitly), or the creator can turn on **round-robin** so their ads rotate onto their posts automatically.

Both surfaces are reads and writes of the same `posts` documents, through the same SDK calls the rest of the app uses. No new endpoint, no new collection — the catalog is a tag-filtered read of the creator's own posts, and the composer attachment is a `ref_value` link between two posts.

## The Ad Catalog (the authenticator)

**Where:** the Studio (`ui/src/components/Studio/`), the monetization screen. The Partner Links card (D50) is the **ingest**: offers live there. The **Ad Catalog** is the **inventory**: the ads built from those offers.

The catalog is the creator's own posts, filtered to the ones tagged `ad`:

```
w.read('posts', { groups: [followersGroupId(me)] })   → filter tags ∋ 'ad'
```

That is the whole read. The creator's own token reads their own posts through their own followers group — the same group-scoped read any app uses, no owner special-case, no new endpoint, no tag query parameter (the filter is client-side; a creator's own posts are a small, bounded set). What's in the catalog is exactly what gets delivered.

**Each row shows:**

| Field | Source |
|---|---|
| the creative | the post's `text` + `media_refs` (resolved through the media machinery) |
| the offer | `body.offer` — kind, partner, link, CTA, disclosure |
| status | `body.status` — `active` \| `paused` (default `active`) |
| attached posts | reverse `ref_value` — the posts that carry this ad |

**Actions:**

- **New ad** — the ingest flow: pick an offer (from the Partner Links card, or define one inline), attach content (media upload through the existing media pipeline, or text), set status. Writes one `posts` document tagged `ad`, attached to the creator's followers group.
- **Edit** — update the doc (tombstone + new insert, the house write path). Editing the offer re-points the link; editing the creative re-uploads media.
- **Pause / resume** — flip `body.status`. A paused ad is skipped by curation (`curateAds` filters on `status === 'active'`) and by the feed renderer, but stays in the catalog.
- **Retire** — tombstone the doc. It falls out of the catalog and of every feed.

**States, all designed** (design.md §12): empty catalog (no ads yet — the CTA is "create your first ad", which opens the ingest), loading (skeleton rows), error (read failed — retry), and the per-row states (active / paused). The catalog is a section of the Studio (the Studio is the monetization surface and the catalog is its inventory view), not a new mode.

## The Composer Integration (web10-social)

The post composer (`marketing/web10-social/src/components/Feed/PostComposer.tsx`) gains one control next to the media attach + visibility: **Attach ad**.

**The picker.** Tap it → a sheet listing the creator's catalog (the same read as the catalog screen: the creator's posts filtered to `ad`, active first). Each entry: the creative's thumbnail/headline + the offer's partner + kind badge. Selecting one attaches it to the post being composed. The sheet has an empty state (no ads yet — a link out to the Studio catalog) and a loading state.

**What attaching does.** The post document is written with the ad preference in its `ad_preference` column (the `pinned` | `none` + `target` column on `documents`, `ads-dissemination.md`):

```json
{ "ad_preference": { "mode": "pinned", "target": "<ad post doc_id>" } }
```

The post is a `posts` document; the ad is a `posts` document. The post *carries* the ad — it does not copy it. One ad can be carried by many posts; the catalog's "attached posts" column is the reverse lookup (`ad_target = <ad doc_id>` over the creator's posts). A post's `ad_preference` is independent of its `ref_value`, so a post can carry an ad *and* be a reply (the v3 column freed the universal link).

**Rendering.** A post that carries an ad renders the ad block under the post body: the creative (the ad post's media + text, if it differs from the post's own), the offer (partner, CTA, link), and the disclosure (the FTC line, always shown — it is part of the object, not a UI option). The read serves the pinned ad inline (`doc.ad`), I3-checked (the ad is served only if the reader is in the ad's group — a pinned ad the reader can't see is simply absent). A post with no ad (`ad_preference.mode = 'none'`) renders exactly as it does today.

> **Round-robin is re-scoped (27.08.2026).** The "Rotate my ads" composer option + the
> `settings`-doc dissemination setting below are the **old client-side model** —
> superseded. **v3 is `pinned` | `none`** (the composer pins a specific ad, or
> doesn't — `ads-dissemination.md`); the curation engine (`round_robin` /
> `greedy` / `random`, the `signal` × `strategy` enums, the node-level density)
> is the **v4 vision** (`../../web10-v4/social/ads-dissemination.md`). The
> `curateAds` SDK helper is superseded by the data-layer read.

**Why the post carries the link instead of copying the ad:** the ad keeps its own identity, its own lifecycle (pause the ad and it stops rendering on every post that carries it — the renderer checks `status` at render time), and its own place in the catalog. The post is the vehicle; the ad is the payload.

## How It Maps to the Data Model

| Thing | Mechanism |
|---|---|
| the catalog | `w.read('posts', { groups: [followers group] })` filtered to `tags ∋ 'ad'` — the feed read, run by the owner |
| new / edit / retire | the house write path on `posts` docs (create / update / tombstone), tagged `ad` |
| status | `body.status` = `active` \| `paused` — curation + the renderer filter on it |
| post carries an ad | the post's `ad_preference` column (`pinned` \| `none` + `target` = the ad post's `doc_id`) — the read serves the pinned ad inline, I3-checked (`ads-dissemination.md`) |
| attached-posts column | reverse `ad_target` lookup over the creator's `posts` |
| albums | a `posts` doc tagged `ad_album` (name in the body); an ad is in a few via `album:<album doc_id>` tags on the ad (the tag-like link, `ads-dissemination.md`) |

No new tables. No new collection. No new endpoints. One new column on `documents` (`ad_mode` + `ad_target`, the `ad_preference` — `ads-dissemination.md`). No new SDK surface beyond the existing `create`/`read`/`update`/`delete` + `ad_preference` on create/update. The only new code is UI (the catalog screen, the composer's ad control, the ad block) and the `offer` + `status` fields on the ad post.

## Security Invariants

- **I3 holds unchanged.** The catalog reads the creator's own posts through their own group; a viewer only ever sees posts (ads included) in groups they belong to. Pinning an ad to a post adds no new read path the viewer can abuse — the read serves the pinned ad **only if the reader is a member of the ad's group** (the ad rides the reader's access, not just the post's; a pinned ad the reader can't see is simply absent, never leaked). The check is in the read's query, not the renderer.
- **I5 holds.** Both surfaces run on the creator's scoped, expiring token. The catalog is the creator's own collection — no app-contract escalation is needed for the owner to manage their ads; other apps read ads through the `posts` permission they already hold to read the feed.
- **The disclosure is not optional in the UI.** The object carries it; the renderer shows it. Hiding the FTC line is a review rejection.

## Logistics

- **Spec'd, not built.** The build bites are in the `ads` lane (`parallel-execution.md`), gated on the lane's foundation items (the tagged-post ad conformance, the `curateAds` helper) — the catalog and the composer both read the catalog read, and the composer's rotation calls the curation helper.
- **The Partner Links card** (the ingest, D50) is the catalog's sibling in the Studio — offers in one card, ads in the other. The "New ad" flow starts from an offer.
- **v0 scope:** status is `active`/`paused` only (no scheduled ads, no per-ad targeting — targeting is the audience, by architecture); no `stats` counters in the doc (v4); the round-robin state is app-local (memory/localStorage) per D51; the creative is data and the HTML is the app's renderer (`html_template` — the creator's own layout — is a v4 enforced-schema thing). Revenue settlement, impression verification, and the v4 ad-network exchange are out of scope (`ads.md`, two-layer note).

For the ad object + the feed read + dissemination, see `ads.md`. For the universal link (`ref_value`), see `../db/clickhouse.md`. For the UI standard (states, tokens, screenshots), see `../../../strategy/design.md`.