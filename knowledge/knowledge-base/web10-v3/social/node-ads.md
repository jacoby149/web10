# Node-Level Ads (v3): The Operator's Ad Inventory

> **v3 design** (30.08.2026). The node operator's ad layer — the second
> layer of the two-layer ad model (D57). Read `ads.md` (the ad object, D55)
> and `ads-dissemination.md` (the v3 dissemination, `pinned` | `none`)
> first. This doc is the operator's inventory: how the node monetizes the
> unmonetized gap in the feed.

## The Two Layers (keep these straight)

| | creator ads (D55, `ads.md`) | node ads (this doc) |
|---|---|---|
| who creates | the creator | the node operator |
| where it lives | the creator's followers group | the discover group (node default) |
| tag | `ad` | `ad` + `node_ad` |
| attachment | `ad_mode = 'pinned'` on the creator's post | read-time attachment to `ad_mode = 'none'` posts |
| who gets the money | the creator (100%) | the node operator (85-90%) |
| web10's cut | none (delivery only) | platform fee on the hosting invoice |
| enforcement | none (the creator's link is external) | the node renders it (part of the product) |

The creator's ad always wins. If a post has `ad_mode = 'pinned'`, the read
serves the creator's ad. The node ad only fills the gap — posts with
`ad_mode = 'none'` that aren't already monetized.

## The Node Ad Object

A node ad is a `posts` document. Same shape as a creator ad (`ads.md`), with
two differences:

1. **`tags` includes `node_ad`** (in addition to `ad`). This is the marker
   that distinguishes a node ad from a creator ad. The renderer checks for
   it to apply the "Sponsored" label + the node's disclosure.
2. **`author_key` is the node operator** (or a reserved `node` key). The ad
   is authored by the operator, not a creator.

```json
{
  "text": "Try the new workflow tool.",
  "media_refs": ["<media doc_id>"],
  "tags": ["ad", "node_ad"],
  "offer": {
    "kind":       { "type": "text", "value": "direct" },
    "partner":    { "type": "text", "value": "WorkflowCo" },
    "link":       { "type": "text", "value": "https://workflowco.com?ref=node" },
    "cta":        { "type": "text", "value": "Learn more" },
    "disclosure": { "type": "text", "value": "Sponsored" }
  },
  "status": "active"
}
```

The `disclosure` is the node's disclosure (set by the operator), not the
creator's. The renderer shows "Sponsored" + the node's name, not the
creator's name.

**The node ad lives on the discover group.** The discover group is a node
default — every user is a member (auto-enrolled at signup), anon is a
member. So the node ad is readable by everyone, the same as any discover
post. No special I3 handling needed.

## How the Read Attaches Node Ads

The read (`/v3/read`) already resolves `ad_preference` for pinned ads. The
node ad is a **read-time enrichment** — the same pattern, one more field:

```
1. Fetch the feed (normal query — posts from the reader's groups)
2. For each doc with ad_mode = 'pinned':
     resolve ad_target → serve the creator's ad inline (doc.ad)
     [existing behavior, unchanged]
3. For each doc (regardless of ad_mode):
     fetch active node ads (one small bounded query, cached per read)
     if node ads exist AND node_ad_percentage > 0:
       hash(doc_id + reader_key) → deterministic pseudo-random [0, 100)
       if hash < node_ad_percentage:
         pick a node ad (round-robin through active node ads)
         attach to the response (doc.node_ad = the node ad)
4. Return the docs
```

**The third join:** the response carries up to two ad attachments per doc:
- `doc.ad` — the creator's pinned ad (if `ad_mode = 'pinned'`)
- `doc.node_ad` — the node's ad (if selected by the percentage)

Both can be present on the same post. The creator's monetization is never
suppressed by the node's. The renderer shows both: the post content, the
creator's ad block, and the node's ad block (with the "Sponsored" label).

**The hash makes it deterministic per (doc, reader).** The same user sees
the same node ads on refresh. Different users see different posts with node
ads. No "I refreshed and the ad moved" confusion.

**The round-robin cycles through active node ads.** If the operator has 3
active node ads, the read cycles through them: the first selected post gets
ad 1, the second gets ad 2, the third gets ad 3, the fourth gets ad 1
again. The operator controls the rotation by adding/removing node ads.

**The node ad query is small and bounded:**

```sql
SELECT doc_id, body, tags, created_at
FROM documents
WHERE collection_name = 'posts'
  AND has(tags, 'node_ad')
  AND deleted = 0
  AND JSONExtractString(body, 'status') = 'active'
  AND doc_id IN (
    SELECT doc_id FROM doc_groups
    WHERE group_id = '<discover group id>'
  )
ORDER BY created_at DESC
LIMIT 20
```

One query per read (cached for the duration of the read). Bounded at 20
active node ads (the operator can't have 1000). Fast.

## The Density Control

The operator sets `node_ad_percentage` in `node_config`:

- **Type:** integer, 0-100
- **Default:** 10 (10% of unmonetized posts get a node ad)
- **0 = off** (no node ads)
- **100 = every unmonetized post gets a node ad** (aggressive; not recommended)

The setting lives in the Node Config panel (the authenticator's config
surface), alongside the other node settings. A new "Ad Inventory" card in
the Studio shows:

- The current percentage (slider or number input)
- The list of active node ads (creative preview, offer, status)
- Create / pause / resume / retire node ads
- A revenue estimate (impressions × CPM, the operator's own number)
## The Renderer

The app already renders ad posts (tagged `ad`) as ad blocks
(`AdBlock.tsx`). The node ad uses the same component, with two differences:

1. **The label:** "Sponsored" (not the creator's name). The renderer checks
   `tags ∋ 'node_ad'` → renders the "Sponsored" overline + the node's name.
2. **The disclosure:** the node's disclosure (from the ad's
   `offer.disclosure`), not the creator's. Always shown, never optional
   (D55).

**Both ads can render on the same post.** The response carries `doc.ad`
(the creator's pinned ad) and `doc.node_ad` (the node's ad). The renderer
shows: the post content → the creator's ad block (if `doc.ad`) → the node's
ad block (if `doc.node_ad`). The creator's ad is their monetization; the
node's ad is the operator's. They're separate revenue streams, both
visible, neither suppressing the other.

## The Operator's Revenue Model

The node operator's revenue is now two lines (v3):

1. **Creator hosting fees** — tiered (Free / Starter / Creator / Scale),
   usage-based overages on storage + egress. The MongoDB model (D57).
2. **Node ad revenue** — the operator sells the node ad inventory to
   advertisers directly (off-platform). They keep 85-90%. web10 takes a
   10-15% platform fee on the hosting invoice. The revenue is a function
   of: feed size × `node_ad_percentage` × CPM.

The operator is a **media company**, not just a hosting customer. They have
an audience, they sell the attention, they keep most of the revenue.

**v4 (not this doc):** the membership/tip revenue share (the 10% operator
cut on the creator's Patreon-shaped revenue) is a v4 concern. It requires
portable payment relationships (Stripe Connect transfer or creator-managed
Stripe), which is a separate engineering problem. See
`../../web10-v4/` for the v4 payment model.

## What This Is NOT

- **Not Google AdSense.** No third-party ad network. No programmatic
  bidding. No ad tech stack. The operator sells the inventory directly to
  advertisers, like a small publication sells ad space.
- **Not pre-roll video ads.** The HLS pipeline is there, but inserting a
  pre-roll into the stream is a real engineering project (ad stitching,
  VAST/VPAID). Not v3. Maybe v4.
- **Not a separate ad post in the feed.** The node ad is attached to the
  post, not a standalone feed item. The user sees the post + the ad block
  under it, the same way they see a post + a pinned creator ad.
- **Not a payment processor.** v3 is ads only. The `offer.link` is an
  external URL. The payment happens off-platform (Patreon, the creator's
  store, the affiliate network). web10 doesn't process the payment, doesn't
  hold the payment relationship, doesn't create lock-in. The membership/tip
  payment model (Stripe Connect, the 3+10+10+77 split, the patron export)
  is v4 — see `../../web10-v4/`.
- **Not an override of the creator's ad.** The node ad is an additional
  layer (`doc.node_ad`), not a replacement. The creator's ad (`doc.ad`) is
  always present when `ad_mode = 'pinned'`. Both can render on the same
  post.

## Security Invariants

- **I3 holds.** The node ad is on the discover group. Every user is a
  member. Anon is a member. The read serves the node ad to everyone, the
  same as any discover post. No new I3 surface.
- **I2 holds.** The node ad is a `posts` doc. The read verifies the reader's
  token (or anon) before serving it. No unsigned decode.
- **The creator's doc is never modified.** The node ad is a read-time
  enrichment. The `ad_mode` column on the creator's post stays `none`. The
  node operator cannot write to another user's doc.

## Summary

A node ad is a `posts` doc on the discover group, tagged `ad` + `node_ad`,
authored by the node operator. The read attaches active node ads to posts
with `ad_mode = 'none'` at the operator's configured percentage
(deterministic per reader, round-robin through active node ads). The
creator's ad (`ad_mode = 'pinned'`) always wins — the node only fills the
unmonetized gap. The operator sells the inventory to advertisers directly;
web10's cut is the platform fee on the hosting invoice. The ad block
renders under the post with a "Sponsored" label + the node's disclosure.
No new tables, no new collection, no new contract permission, no ad
network, no programmatic bidding. The operator is a media company.

For the ad object, see `ads.md`. For the v3 dissemination (`pinned` |
`none`), see `ads-dissemination.md`. For the catalog + composer surfaces,
see `ads-catalog.md`. For the data model, see `../db/clickhouse.md`.
