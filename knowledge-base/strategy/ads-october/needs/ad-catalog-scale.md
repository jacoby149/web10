# NEED — scale the ad catalog (versions + storefront + round-robin)

**Status: OPEN.** Filed from the operator's ad-experience pass (05.10.2026).
The operator, running 20+ affiliate products, hit the *catalog* problem: how do
you organize, present, and rotate a *lot* of ads?

## The complaint (verbatim)

> "something i am concerned about, you have 20 affiliate links, to 20 products,
> maybe you want a few ad versions of each, maybe you want to put those ads
> into collections, i.e. amazon storefront only works if you blow up, so we can
> do a storefront here i.e. let people catalog a bunch of ads together. also
> that collections of ads thing is great, because if you choose to pin round
> robin sttyle ads, you could have a collection of ads rotate on that post,
> where it is a different ad fromt that collection every time"

## What's already built (the part that's NOT new)

**Albums / collections exist.** An ad can be in multiple albums
(Apple-Photos-style — `album:<id>` tags, `ads-catalog.ts`), and you can pin an
ad from an album. So the operator's "collections" idea is *mostly* there. The
gap is what you do *with* a collection at scale — the three new ideas below.

## The three new ideas

### 1. Ad versions (multiple ads for the same offer)

> "you have 20 affiliate links, to 20 products, maybe you want a few ad
> versions of each"

A creator has 20 products and wants **a few angles on each** — different
creative, different copy, different CTA, for the same `offer.link`. Today an
ad is one doc with one creative; there's no notion of "these three ads are
versions of the same product."

**The model (app-owned, D60):** a *version* is an ad doc that shares the same
offer (the same `offer.link`, or an explicit `base_offer` / `offer_id` ref) but
carries different creative + copy. The link is the same (the affiliate tracking
is unchanged); the *angle* differs. This enables:
- **A/B testing** — which version converts better (the earnings panel, once
  the lightweight shown + clicked counter exists, can show per-version CTR).
- **Multiple angles** — "the product shot" vs "the use-case" vs "the review"
  for the same item, without re-entering the link.

**The open question:** is a version an *explicit* grouping (a `base_offer` ref
linking the version docs) or *implicit* (ads that share the same `offer.link`
are auto-grouped as versions)? Explicit is cleaner (the creator names the
grouping); implicit is zero-effort (paste the same link, they're grouped).
Probably implicit-with-explicit-override.

### 2. The storefront (a public surface for the creator's catalog)

> "amazon storefront only works if you blow up, so we can do a storefront here
> i.e. let people catalog a bunch of ads together"

The operator's point: Amazon's storefront is gated — it "only works if you blow
up" (you need a big following / a verified storefront to get one). web10 can
give **every creator** a storefront from day one: a **public, browsable surface
listing the creator's catalog** of recommended products (their affiliate ads +
their merch). It's the "here's everything I recommend" page — a grid of the
creator's ad catalog, deep-linkable, shareable.

**The model (app-owned, D60 — a web10-social route, not a node concept):**
a new surface (e.g. `/u/:username/store` or a tab on the profile) that renders
the creator's ad catalog as a browsable grid — each tile = an ad (creative +
title + the offer CTA). It's the *public face* of the creator's ad catalog.
The data is already there (the creator's `ad`-tagged docs in their followers
group); the storefront is a *read + render* of it, organized by album/collection
(the built albums become the storefront's sections).

**Why it matters (the "6th post" extension):** the storefront is the creator's
*catalog* as a destination, not just ads attached to posts. A fan can browse
"everything this creator recommends" in one place — the affiliate version of a
creator's "links" page (the Linktree/Stan-store case). It's where the "net"
lands: the creator casts ads across their posts, and the storefront is the
*collection* of the catch.

**The open question:** is the storefront *only* the creator's affiliate/merch
ads, or does it also surface their own posts/products? (The operator's framing
is "catalog a bunch of ads together" — so v1 is the ad catalog; their own
content is the profile, a separate surface.)

### 3. Round-robin pinning (pin a collection, the read rotates)

> "if you choose to pin round robin style ads, you could have a collection of
> ads rotate on that post, where it is a different ad fromt that collection
> every time"

Today a post's `ad_preference` points to **one** ad doc_id (`types.ts:73`). The
operator wants to pin a **collection** (an album) to a post, and have the read
serve a **different ad from the collection each time** — rotation.

**The model (a new `ad_preference` mode):** the post's `ad_preference` gains a
*round-robin* mode — `target` = an album (not a single ad), and the read
resolves to **one ad from that album** per resolution. The resolution strategy
is the open question:

| Strategy | Behavior | web10 idiom |
|----------|----------|-------------|
| **Per-reader** (deterministic) | each reader sees a *different* ad from the collection, stable per reader | **the node-ad hash** — the `(doc_id, reader)` hash that picks which posts carry a node ad. The most web10-idiomatic: each fan sees a different product, but consistently (no flicker on refresh). |
| **Per-read** (random) | each fetch is a different ad | simplest, but flickers on refresh (a fan sees a different product every time they load the post — confusing). |
| **Per-time** (rotating) | the ad rotates on a schedule (hourly/daily) | all readers see the same ad at a given time; it changes over time. |

**The per-reader deterministic hash is the recommended one** — it's exactly how
node ads already pick (the `(doc_id, reader)` hash in `clickhouse.py`), so it's
a proven, D60-generic mechanism. Each fan sees a *different* product from the
collection (the "net casts wider" — 20 products, each fan sees a different one,
so the collection's total reach is the sum of its parts), but *consistently*
(the same fan sees the same product on refresh — no flicker, and if they click
it and come back, it's still there).

**Why it matters (the "fishing net" extension):** round-robin is the *post*
analogy of the net. A single pinned ad = one cast. A round-robin collection =
the post casts the *whole collection*, each fan catching a different product.
The post's reach is multiplied by the collection's size, without the creator
pinning 20 separate posts. It's the "20 products, one post" play — the creator
pins their *storefront collection* to a post, and the rotation does the
casting.

**The open questions:**
1. **Resolution strategy** — per-reader (recommended, the node-ad hash) vs
   per-read vs per-time.
2. **Determinism scope** — per-reader-per-post (each post in the collection
   rotates independently) or per-reader-global (a fan sees the same "slot"
   across all the creator's round-robin posts)? Per-post is simpler;
   per-global is more "curated" (the fan's "lane" through the collection).
3. **Does the rotation respect ad status?** A paused ad in the collection is
   skipped (only active ads rotate). A retired ad is out. (This is the
   existing `status` field — the rotation just filters on it.)

## The through-line — "scale the catalog"

The three ideas are one concern: **the catalog is bigger than one ad per
post.** 20 products × a few versions each = a lot of ads, and the creator
needs:
- **Versions** — multiple angles per product (A/B + variety).
- **The storefront** — a public destination for the whole catalog (not just
  ads attached to posts).
- **Round-robin** — one post casts the whole collection (the net, at the post
  level).

The **albums** (built) are the *organizing* primitive that all three hang off:
versions are grouped by offer, the storefront is organized by album, and
round-robin pins an album. The albums are the spine; the three ideas are what
you do with the spine at scale.

## The relationship to the other needs

- **`ad-creative-labor.md`** (the 30-ads photo labor) is the *making* side of
  catalog scale; this need is the *organizing + disseminating* side. Together
  they're the "run 30 ads" problem: make them fast (labor), organize them
  (versions/albums), present them (storefront), rotate them (round-robin).
- **`ad-earnings.md`** (the per-ad economics) extends naturally: the earnings
  panel shows **per-version** performance (which angle converts), **per-product**
  (which of the 20 earns), and **portfolio** (the net's total catch). The
  storefront + round-robin are what make the portfolio *bigger* (more products
  in rotation, more versions tested).

## Open questions (operator)

1. **Versions: explicit or implicit grouping?** (a `base_offer` ref vs
   auto-group by shared `offer.link`.)
2. **Storefront scope:** the ad catalog only, or the creator's own
   products/posts too? (v1 = the ad catalog, recommended.)
3. **Storefront surface:** a new route (`/u/:username/store`) or a tab on the
   existing profile? (A tab is less IA change; a route is more "destination.")
4. **Round-robin resolution:** per-reader (recommended, the node-ad hash) vs
   per-read vs per-time.
5. **Round-robin determinism scope:** per-post vs per-reader-global.

## Files (when built)

- `marketing/web10-social/src/data/ads-catalog.ts` — the version grouping
  (`base_offer` / auto-group by link); the round-robin `ad_preference` mode
  (target = album); the storefront read (the creator's ad catalog as a grid,
  organized by album).
- `marketing/web10-social/src/data/types.ts` — the `ad_preference` round-robin
  mode (the `target` is an album doc_id, not an ad doc_id); the version ref on
  the ad body.
- `api/app/v3/services/clickhouse.py` — the round-robin resolution in the read
  path (the `ad_preference` join picks one ad from the target album, the
  `(doc_id, reader)` hash — the node-ad idiom). D60-generic (a "pick one from a
  set, deterministic per reader" resolution, not an "Amazon" concept).
- `marketing/web10-social/src/components/Monetization/CreatorMonetization.tsx`
  — the version UI (make a version of an ad); the storefront builder (organize
  the catalog into the storefront); the round-robin pin control (pin a
  collection, not a single ad).
- A **storefront surface** (a new route or a profile tab) — the public grid of
  the creator's catalog.
- `marketing/web10-social/src/components/Feed/` + `Discover/` — the round-robin
  ad renders (the post shows *one* ad from the collection, the resolved one).
