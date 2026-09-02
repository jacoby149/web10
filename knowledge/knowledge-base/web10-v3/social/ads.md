# Web10 Ads

An ad is a **post that carries a monetizable link**. That is the whole thing: a piece of content (the post's own text + media) plus a link that pays the creator (the `offer`). It is not a service, not a collection, not an ad network — it is a `posts` document tagged `ad`, delivered to the creator's followers by the same architecture that delivers every other post.

This is the **creator-owned** ad layer. It is not an ad network — no exchange, no bidding, no third-party targeting. The only sponsors a viewer sees are the ones the creator chose. The ad-network layer (campaigns, targeting, DSP/SSP, revenue split) is a separate v4 concern — see the two-layer note at the bottom.

## Why a Post, Not a Service

(D55 supersedes D50's "ads default service" framing.)

The first draft made `ads` a default service — its own collection, its own `ads: [readAll]` contract permission, its own provisioning. The operator rejected it: *"ads shouldn't be some kind of a service, they should be locked in what they are… stuck in their ways, inflexible, a piece of media a link to the affiliate thing, maybe that is it?"*

He was right. Look at what an ad actually is: content + a link. That is a post with an extra field. Making it a service invented machinery for a distinction that does not exist:

- **The feed join disappears.** The service framing needed a "feed + ads join" (`collection_name IN ('posts','ads')`) — which was aspirational anyway, because the API reads one collection per call (`read_documents_in_groups` takes a single `service`). With ads as posts there is no join at all: the feed read already returns them, and the renderer styles the ones tagged `ad`.
- **The contract surface disappears.** The social app already reads `posts`. An ad post is a post — no new `ads: [readAll]` permission, no new app-contract line, no provisioning.
- **The catalog is a filter, not a read.** The creator's catalog is their own posts where `tags` has `ad` — the house's existing `tags` column (`has(tags, 'ad')`), filtered client-side (a creator's own posts are a small, bounded set).

What the service framing got right survives: the ad object, group delivery, carrying (now the `ad_preference` column on the post, `ads-dissemination.md`), D51 curation, I3. Only the namespace dies.

## The Standard Ad Object

An ad is a `posts` document. `collection_name = 'posts'`, `author_key` = the creator, `tags` includes `ad`. The body is the post's normal fields plus the ad-specific `offer` + `status` — deliberately small, locked in what it is, inflexible on purpose:

```json
{
  "text": "Everything I use, linked.",
  "media_refs": ["<media doc_id>"],
  "tags": ["ad"],
  "offer": {
    "kind":       { "type": "text", "value": "affiliate" },
    "partner":    { "type": "text", "value": "Amazon" },
    "link":       { "type": "text", "value": "https://amzn.to/abc?tag=alice-20" },
    "cta":        { "type": "text", "value": "Get it" },
    "disclosure": { "type": "text", "value": "I may earn a commission." }
  },
  "status": "active"
}
```

**The creative is the post itself** — `text` (the copy) + `media_refs` (the media, the same doc-id refs a post uses, resolved through the same media machinery). A video ad's media rides the HLS pipeline (`../media/transcoding.md`) exactly like a post's video. There is no separate `creative` wrapper and no separate media prefix — the ad's media is a normal media record.

**`offer`** — the monetizable link. The leaf-typed standard (`../sdk/document-typing.md`): `kind` is `affiliate` | `direct` | `own_store` — that is the whole "you name it": an Amazon tag, a brand the creator DM'd, the creator's own store, all the same shape. `link` is the URL that pays the creator. `cta` is the button text. `disclosure` is the auto-shown FTC line. The platform never rewrites the link, never cloaks it, never inserts its own — the creator's link is the link.

**`status`** — `active` | `paused` (default `active`). Curation and the feed renderer filter on it (D51); a paused ad is skipped and the catalog shows it as paused.

**No `stats` in v0.** The first draft kept impression/click counters in the doc. They are gone: a counter is a write on a read path (a tombstone + insert per click), it is the one part of the object that is not "a piece of media and a link," and it is the v4 layer's job (revenue settlement, impression verification). The catalog shows the offer's state, not click counts, in v0.

### The Creative Is Data; the HTML Is the App's

The operator wanted *"more of an html control over the ads."* The answer is a split, not a new type:

- **The doc carries the content** — text, media refs, the offer. Structured, typed, portable.
- **The app renders the HTML** — the ad block (layout, CTA button, partner badge, disclosure) is a designed component in the renderer, the way the feed card is for posts. The creator controls the *content*; the app controls the *presentation*.

There is no `html` leaf type in the protocol (`document-typing.md`: `text | minio | number | bool | datetime | ref`), and adding one is rejected: it is a protocol-wide change, it puts an XSS-sanitization burden on the node, and it breaks the doctrine that the app owns the schema and the API is just a scanner.

**`html_template` is the v4 escape hatch** (operator: *"the ad object could have html_template eventually! :) but not this iteration, that could be a v4 thing"*). In the enforced-schema era (v4's `$schema` per doc, validation at write), a creator can bring their own layout — a template the node validates and the app renders in a sandbox. Not now. The object stays locked.

## How It Maps to the Data Model

| Field | Value | Why |
|---|---|---|
| `collection_name` | `posts` | an ad is a post — the feed read already returns it |
| `author_key` | the creator | the creator owns the ad, scoped to them |
| `tags` | includes `ad` | the marker. `has(tags, 'ad')` — the catalog filter, the renderer's style check |
| `doc_groups` | the creator's followers group (and/or discover) | delivery by architecture — followers see it |
| `ref_value` | optional — a related post | the universal link column; carrying an ad is the *post's* `ad_preference` pointing at this doc (`ads-dissemination.md`), not the ad's `ref_value` |

No new tables. No new collection. No new contract permission. It is a post, and the house read (dedup-then-filter, group membership, hidden-doc exclusion) already handles it.

## Picking Up Ads Per User

There is no "ads for this viewer" query — that was the service framing's artifact. **The feed read is the query:**

```
w.read('posts', { groups: [discover, ...followed followers groups] })
```

returns everything the viewer should see, ads included (they are posts in the viewer's groups). A post that *carries* an ad comes back **with the ad inline** (`doc.ad`) — the read resolves the post's `ad_preference` (the `pinned` | `none` column, `ads-dissemination.md`) and serves the pinned ad, I3-checked (the ad is served only if the reader is in the ad's group). The renderer checks each doc:

- **a post tagged `ad`** → render the ad block (the post's creative + the offer + the disclosure)
- **a post with `ad_mode = 'pinned'`** → render the post, then the carried ad block from `doc.ad` (already resolved + I3-checked by the read; a pinned ad the reader can't see is simply absent — the doc renders plain)
- **a plain post** → render as today

Because the read is group-scoped, an ad is only ever visible to the creator's audience (or the public, if attached to discover). I3 holds: a viewer who does not follow the creator never sees the ad.

## Dissemination (per-creator)

> **Dissemination is re-scoped (27.08.2026):** the curation lives **on the
> data** — the read serves opted-in posts *with* their ad, so any app gets ads
> for free. **v3 is mad simple** (`pinned` | `none` — the creator pins an ad to
> a post, or doesn't): see
> [`ads-dissemination.md`](./ads-dissemination.md). The full curation engine
> (`round_robin` / `greedy` / `random`, the node-level density, the `signal` ×
> `strategy` enums) is the **v4 vision**: see
> [`../../web10-v4/social/ads-dissemination.md`](../../web10-v4/social/ads-dissemination.md).
> The client-side `curateAds` helper below is superseded by this.

How a creator's ads get shown is a **per-creator choice**, not a platform decision (D51). The setting lives on the creator's `settings` doc:

```json
{
  "ads": {
    "dissemination": { "type": "text", "value": "round_robin" },
    "cap":           { "type": "number", "value": 3 }
  }
}
```

`dissemination` is `round_robin` | `greedy` | `pinned` | `frequency_capped` (+ params like `cap`).

The curation is a **shared, deterministic SDK helper**, not SQL (the stateful algorithms — round-robin needs "which ad showed last," greedy needs the performance numbers — do not belong in a query):

```
curateAds(creatorAds, creatorSetting) → the ordered subset to show
```

- **round_robin** — rotate the creator's active ads so each gets equal exposure (state in the app: memory/localStorage)
- **greedy** — weight by performance
- **pinned** — the creator picks which ad is live
- **frequency_capped** — don't show the same ad more than `cap`× per session

The helper filters on `status === 'active'`. Because it is shared and deterministic, every app curates a given creator's ads identically. It is used where a creator's ads are *selected* — the composer's "Rotate my ads" (which ad a post carries, `ads-catalog.md`) and any app surfacing a curated subset. The feed's ad *posts* need no curation: they are posts, they render, 100% delivery by architecture.

## The Partner Links UI (the ingest)

The Studio's monetization screen has one card for this: **Partner Links** (it was "Amazon Associates" + "Direct Deals" — collapsed, because they are the same primitive: a link that pays the creator). The card is the ingest:

- the creator adds their offers — an Amazon tag, a direct brand deal, their own store. Each is an `offer` (kind, partner, link, cta, disclosure).
- the creator attaches an offer to content (a video, a photo, a post) → a `posts` document tagged `ad` is written, scoped to the creator, attached to their followers group.
- the card shows the offer's state (the link, the partner, the disclosure) — the doc's `offer` + `status`.

The Memberships & Tips card (the Patreon-shaped one) is the other rung-0 card and a separate concern — Stripe Connect subscriptions + tips, already scoped. Partner Links is the link side; Memberships is the subscription side.

## Two Layers (keep these straight)

| | creator-owned ads (tagged posts, this doc) | v4 ad network (`../../web10-v4/db/clickhouse-v4.md`) |
|---|---|---|
| who buys | nobody — the creator posts their own link | brands buy inventory |
| exchange / bidding | none | CPM/CPC/CPA, DSP/SSP partners |
| targeting | the creator's followers (by architecture) | demographic / interest / behavioral |
| creative control | the app renders the ad block; `html_template` (creator's own layout) is a v4 enforced-schema thing | full campaign creative |
| revenue | the creator's own affiliate/deal payout | platform + creator + partner split |
| thesis | aligned — "the only sponsors you'll ever see are ones the creator chose" | the paved model, later (M3 sponsor marketplace) |

The creator-owned ad ships now, on v3, as a tagged post — no new tables, no new collection, no new contract permission. The v4 ad tables are the exchange layer for when brands buy inventory directly — a different product, a later milestone. Do not build the v4 tables to serve creator ads; that is the wrong layer.

## Summary

An ad is a `posts` document tagged `ad`: the post's own text + media (the creative) plus a leaf-typed `offer` (the link that pays) plus a `status`. It is delivered to the creator's followers by the same group architecture as every post, picked up by the same feed read, and rendered as an ad block by the app. The Partner Links UI is the ingest; the Ad Catalog is the inventory (`ads-catalog.md`). No new collection, no ad network, no targeting — the creator is the ad channel, and the object is locked in what it is.

For the group/follow model, see `overview.md`. For the catalog + composer surfaces, see `ads-catalog.md`. For the data model + the tombstone read invariant, see `../db/clickhouse.md`. For the leaf-typing convention, see `../sdk/document-typing.md`. For the v4 ad-network layer + `html_template`, see `../../web10-v4/db/clickhouse-v4.md`.