# NEED — a "product" entity (the thing an ad is *about*)

**Status: BRAINSTORMING → REFINED.** Filed from the operator's ad-experience
pass (05.10.2026). The operator's own framing: *"this is all brainstorming, i
think it is productive, to bring up a lot of needs, even if we dont address
them all."* This is the most speculative of the needs — a data-model idea, not
a surface gap. **The operator refined the model on 05.10.2026** (see "The
operator's refinement: the ad is the superset" below) — the refinement
supersedes the three options (A/B/C) that follow. The options are kept for the
record; the refinement is the direction.

## The operator's refinement (05.10.2026): the ad is the superset

> "i think also a little more of a products ad separation, the products have
> the price, the commision, the affiliate links, the basic pics, of the
> products, then the ads can advertise products or whole storefronts of
> products, i.e. collections of the products. that is an option, or you could
> have an add that advertises a collection of ads, have no products at all, do
> storefronts without any extra product object. all ads obejcts are ads, and
> can have the same attributes as products, this may be nice because ads have
> your cool text and media, just a little more going on!"

**The model (the refinement that supersedes the three options below):**

There is **no separate Product entity.** The **ad is the single object** — the
superset. An ad *can* carry the product attributes (price, commission,
affiliate link, pics) when it's advertising a product, but it's still an ad.
The product is not a separate thing; it's a *role* the ad plays.

**The product attributes (optional, on the ad):**
```
Ad {
  // the creative (always present — "your cool text and media")
  text            // the caption
  media_refs      // the creative media (image/video)
  cta             // the button text
  format          // inline / post

  // the product attributes (optional — present when the ad is a product)
  offer.link      // the affiliate link
  offer.partner   // "Amazon" / "PartnerStack" / etc.
  item_price      // the product's price
  commission_rate // the rate (% or flat $)
  product_pics    // the basic pics of the product (separate from the creative media)

  // the target (what the ad advertises — optional)
  target          // 'product' | 'collection' | 'storefront' | null
  target_id       // the album/collection/storefront doc_id (when target is a collection)
}
```

**What an ad can advertise (the `target` field):**
- **A single product** — the ad *has* the product attributes (price,
  commission, link, pics). The ad IS the product (the ad is the product's
  listing).
- **A collection of products** — the ad points to an album/collection
  (`target: 'collection'`, `target_id: <album doc_id>`). The ad is a "shop the
  collection" ad.
- **A collection of ads** — the ad points to an album of *ads* (not products).
  The ad is a "see more" ad that points to a curated set of other ads.
- **A storefront** — the ad points to the creator's storefront (the public
  catalog). The ad is a "visit my store" ad.
- **Nothing** (`target: null`) — a pure ad, just text + media, no product. The
  ad is a buzz post, a service promo, a "check it out" with no product behind
  it.

**Storefronts without a product object:** the storefront is a **collection of
ads** (each ad optionally has product attributes). No separate product entity
is needed. The storefront is an album (the built albums) that contains ads, and
each ad in the album optionally carries the product attributes. The storefront
is the *collection*; the ads in it are the *products* (when they have the
product attributes) or the *pure ads* (when they don't).

**Why "the ad is the superset" (the operator's reasoning):**
- **"All ad objects are ads"** — there's no separate product entity to create,
  manage, or migrate. Everything is an ad. The product attributes are *optional
  fields on the ad*, not a separate object.
- **"Ads have your cool text and media, just a little more going on"** — the
  ad is the *rich* object. It has the creative (text + media) PLUS the product
  attributes (when it's a product). A bare product entity would only have the
  attributes (price, commission, link, pics) — the ad has that *plus* the
  creative. The ad is the superset; the product is a subset of the ad's
  attributes.
- **"A little more of a products ad separation"** — the separation is *light*:
  the product attributes are a *group* of fields on the ad (the "product
  section" of the ad form), not a separate entity. The ad form has a "product"
  section (price, commission, link, pics) that's filled in when the ad is a
  product, and left blank when it's not.

**The data model (the refinement, stated plainly):**
- **One object type:** the ad (a `posts` doc tagged `ad`).
- **Optional product attributes:** `item_price`, `commission_rate`,
  `product_pics` (on the ad's body, alongside the existing `offer.link` /
  `offer.partner` / `offer.cta`).
- **Optional target:** `target` (`'product'` | `'collection'` | `'storefront'`
  | null) + `target_id` (the album/collection/storefront doc_id).
- **The storefront:** an album (the built `ad_album` doc) that contains ads.
  No separate product entity. The storefront is the *collection*; the ads in
  it are the *products* (when they have the product attributes).
 - **The product fields (focus #2):** the `item_price` + `commission_rate` +
  `product_pics` fields on the ad. These are the "product attributes" the
  operator named — they live on the ad, not on a separate product entity.

**The layering: media on top of the product (the flexibility):**

> "and the ads could let you add media on top of the products, etc, the post
> ads the listing ads, it is nice and flexible"

The ad has **two layers of media**, and they're *separate*:
- **The product pics** (`product_pics`) — the *basic* pics of the product (the
  product's own photos, the Amazon product images, the merch shots). These are
  the *product layer* — what the product *is*.
- **The creative media** (`media_refs`) — the ad's *own* media (the video, the
  carousel, the lifestyle shot, the "in use" clip). These are the *creative
  layer* — what the ad *does* with the product.

The ad **layers the creative on top of the product**: the product pics are the
*base* (the product's own photos), and the creative media is the *overlay* (the
ad's own media, added on top). This is the "media on top of the products" the
operator named — the ad doesn't *replace* the product's pics, it *adds to*
them. The product pics say "this is the thing"; the creative media says "here's
why you want it."

**The format flexibility (post ads vs. listing ads):**
- **A listing ad** — the ad *is* the product listing. It has the product
  attributes (price, commission, link, pics) and *minimal* creative (just the
  product pics, maybe a short caption). It's the "here's the product, here's
  the price, here's the link" ad. The *product layer* dominates; the *creative
  layer* is thin. This is the **inline** format (the compact `AdBlock` — the
  square thumbnail + offer CTA + disclosure).
- **A post ad** — the ad is a *full post* about the product. It has the product
  attributes (the product it's about) *plus* rich creative media (the video,
  the carousel, the lifestyle content). It's the "here's why this product is
  great, watch this, look at this, here's the link" ad. The *creative layer*
  dominates; the *product layer* is the anchor (the thing the post is *about*).
  This is the **post** format (the full post card — media, copy, offer CTA,
  disclosure, likes, comments).

**The feature-parity principle (post ads are indistinguishable from posts):**

> "also i think the posts came a long way, important the post ads are in sync
> with the posts, have feature parity with the posts i.e. they look kind of
> indestinguishable"

The post ad format should have **full feature parity** with a regular post —
it should be *indistinguishable* from a post except for the ad disclosure (the
"Ad"/"Sponsored" badge + the offer CTA + the disclosure line). The post ad is
*not* a "post-like thing" — it *is* a post (a `posts` doc, the D55 model), and
it should render with the same fidelity as any other post:

- **Media:** the same media handling (image/video, carousel, HLS, the
  aspect-ratio policy). A post ad with a video plays the same as a post with a
  video. A post ad with a carousel swipes the same as a post with a carousel.
- **Title + caption (D82):** the same two-body text (the `title` headline +
  the `text` caption). A post ad with a title renders the title the same as a
  post with a title.
- **Comments:** the same comment thread (threaded replies, photos in comments,
  edit/delete, the full comment system). A post ad has comments the same as a
  post.
- **Likes/dislikes/reposts:** the same engagement bar (the shared
  `PostActions`). A post ad can be liked, disliked, and reposted the same as a
  post.
- **Everything else:** the same post chrome (the author row, the time, the
  tags, the kebab menu, the share). A post ad has the same chrome as a post.

The *only* differences are the **ad dressing** (the "Ad"/"Sponsored" badge, the
offer CTA button, the disclosure line) — the *minimum* that makes it clear
"this is an ad" without making it look *different* from a post. The ad
dressing is a *label*, not a *different rendering*. The post ad is a post that
happens to be an ad, not a different kind of thing.

**Why this principle matters (the "indistinguishable" test):** the operator's
word is "indestinguishable" — the post ad should pass the "would a user tell
the difference?" test. If a user can tell a post ad from a regular post by
*looking* (not by the disclosure), the post ad has failed the feature-parity
test. The post ad should be *visually identical* to a post, with the disclosure
as the *only* tell. This is the "ads people like to look at" emotional core
(the `ad-earnings.md` landing) applied to the rendering: the ad is *content*
(a post), not an *interruption* (a different kind of card).

**The current state (3.134.0 + 3.159.0):** the post ad format already renders
as "just another post" in the feed/discover (3.159.0 — "next in line after the
pinned post, not inside it," with "nothing indicating the pin"). The feature
parity is *mostly* there (the post ad is a `posts` doc, so it has media,
comments, likes for free). The principle is the *constraint* that keeps it
there: as posts gain features (new media types, new text formats, new
engagement signals), the post ads must gain them too (feature parity, not
feature lag). The post ad is a post; when posts evolve, post ads evolve with
them.

**The implication for the focus builds:** the post ad format (build #1, the
storefront's "post ad" tiles; build #2, the product fields on the post ad) must
maintain feature parity with posts. The storefront renders post ads the same as
regular posts (with the ad dressing). The product fields (price, commission,
pics) are *additional* data on the post ad (the "product section"), not a
*different rendering* — the post ad still looks like a post, with the product
info as *part of the post* (the caption, the media, the offer CTA), not as a
*separate card*.

The same ad object, two *shapes*: the listing ad (product-heavy, creative-thin,
inline) and the post ad (creative-heavy, product-anchored, post). The operator
chooses the format (the existing `format: 'inline' | 'post'` field, from
3.134.0), and the *layering* (product pics + creative media) is what makes both
shapes work from the same object. The product pics are always there (the
product's identity); the creative media is the *addition* (the ad's expression
of the product).

**Why "it is nice and flexible" (the operator's words):** the ad is the
superset, and the *layering* is what makes it flexible:
- **A product with no creative** — just the product pics + the price + the
  link. A listing ad. The minimum.
- **A product with creative** — the product pics *plus* the video/carousel. A
  post ad. The full expression.
- **A collection with creative** — the ad points to a collection (the
  `target` field) and has creative media (the "shop the collection" post).
- **A storefront with creative** — the ad points to the storefront and has
  creative media (the "visit my store" post).
- **A pure ad with no product** — just creative media + text, no product
  attributes. A buzz post, a service promo. The `target: null` case.

The *same object* (the ad) expresses all of these, because the product
attributes are *optional* (the "product section" of the ad) and the creative
media is *always* there (the ad's own media). The layering (product pics +
creative media) is what lets the ad be a *listing* (product-heavy) or a *post*
(creative-heavy) or a *collection promo* or a *storefront promo* or a *pure
ad* — all from the same object, all with the same fields, just different
combinations. That's the "nice and flexible" the operator named.

**How this supersedes the three options (A/B/C) below:**
- **Option A (no product entity, + versions):** the refinement *is* Option A,
  plus the product attributes on the ad + the `target` field. The "versions"
  are ads that share the same `offer.link` (the implicit grouping, Option B).
- **Option B (implicit grouping by link):** the refinement keeps the implicit
  grouping (ads with the same `offer.link` are "versions of the same product"),
  but adds the product attributes on the ad (so the grouping has *data*, not
  just a shared link).
- **Option C (explicit product entity):** the refinement *rejects* Option C.
  No separate product entity. The product attributes are on the ad. The
  "single source of truth" (the product's price/commission/link) is the ad
  itself (or the implicit grouping of ads that share the link).

**The simplicity test (re-applied to the refinement):** the refinement is
*more* simple than Option C (no separate entity to create/manage/migrate) and
*less* simple than Option A (the ad form has a "product section" with optional
fields). But the operator's constraint is *"simple for people, people actually
making ads"* — and the refinement is simple: the ad form has a "product"
section (price, commission, link, pics) that you fill in when the ad is a
product, and leave blank when it's not. No separate entity, no separate
surface, no separate write path. The ad is the thing; the product attributes
are a section of the ad.

---

## The original idea (verbatim, pre-refinement)

> "i feel like maybe it makes sense to have products and then ads, where the
> products you put the affiliate links, photos of the product, the commission
> of the product, just things like that, because then you can make an ad off
> of a product, maybe would make it easier to do ad variations. at the same
> time dont want to overcomplicate."

> "we want this to be simple for people, people actually making ads!"

## The problem it solves

Today an ad is a flat doc: `offer.link` + `offer.partner` + `offer.cta` +
`media_refs` + `text`. If a creator has 20 products and wants 3 versions of
each, that's 60 ad docs, and the *product info* (the link, the photo, the
commission, the item cost) is **repeated on every version**. Change the link
or the commission, and you edit 3 docs. The product is the *stable* thing; the
ad is the *variable* thing (the angle, the copy, the CTA). Today there's no
distinction — they're the same doc.

A **product** entity would be the stable thing:

```
Product {
  link          // the affiliate link (one, not repeated)
  photo         // the product image (one, not repeated)
  commission    // the rate (one, not repeated)
  item_cost     // the price (one, not repeated)
  name          // "Nike Air Max 90"
  partner       // "Amazon"
}

Ad {
  product       // → the product (the thing it's about)
  creative      // the angle (the variable part)
  copy          // the caption
  cta           // the button text
  format        // inline / post
}
```

Make an ad = **pick a product, write the angle.** The link, photo, commission,
and cost come from the product for free. A version = **same product, new
angle.** Change the commission = **edit the product, all versions update.**

## The simplicity test (the operator's constraint)

> "we want this to be simple for people, people actually making ads!"

This is the load-bearing question. The product entity *helps* simplicity at
scale (20 products × 3 versions = 20 product entries + 60 ad angles, not 60
repeated product infos) but *hurts* simplicity at the start (one more thing to
fill out before you can make your first ad). The test:

**Does it make the *act of making an ad* simpler, or does it add a step?**

- **At 1 ad:** it adds a step (create the product, then make the ad off it).
  *Worse.*
- **At 3 versions of 1 product:** it's a wash (you'd fill the product info
  once instead of three times, but you have an extra entity to navigate).
- **At 20 products × 3 versions:** it's clearly better (20 product entries
  instead of 60 repeated infos; change the link once, not 60 times).

So the product entity is a **scale** optimization, not a **start**
optimization. The simplicity constraint says: **don't make it a separate step
for the first ad.** The product should be *implicit* — the first time you make
an ad with a link, the product is created *for you* (the link + photo +
commission become the product). You don't "go create a product first"; you make
an ad, and the product falls out. The second time you make an ad with the same
link, it *finds* the existing product and offers to reuse it. The product
entity is a *consequence* of making ads, not a *prerequisite*.

## The options (lightweight → full) — *superseded by the refinement above*

> The three options below are the pre-refinement brainstorm. The operator's
> refinement ("the ad is the superset," above) supersedes all three: it keeps
> Option A's "no separate entity" + Option B's "implicit grouping by link,"
> adds the product attributes on the ad + a `target` field, and rejects Option
> C's separate product entity. Kept for the record.

### Option A — no product entity (the status quo, + versions)

Keep the flat ad doc. Add a `base_offer` / "version of" ref so multiple ads can
point at "the same product" (grouped by shared `offer.link`). The product info
is still repeated, but the *grouping* is explicit.

- **Pros:** zero new entities. The ad form is unchanged. Versions are a tag,
  not a new thing.
- **Cons:** the link/commission/photo are still repeated per version. Change
  the commission = edit every version. No single place that says "this is the
  product."
- **Simplicity:** highest at the start, degrades at scale.

### Option B — implicit product (the product falls out of the ad)

The ad doc is unchanged in shape. The *read* groups ads by `offer.link` into
implicit "products." The UI shows the grouping ("3 versions of this product").
The commission/cost/photo are *editable per ad* today, but the UI offers "apply
to all versions of this product" (a bulk-edit convenience).

- **Pros:** zero new entities, zero new write path. The product is a *view*
  (grouped by link), not a *thing* you create. The ad form is unchanged. The
  "apply to all versions" is the convenience that solves the repetition
  problem without a new entity.
- **Cons:** the product info is still physically repeated (the "apply to all"
  is a UI convenience, not a data guarantee — a version can drift). No single
  source of truth for the product.
- **Simplicity:** high at the start (the ad form is unchanged), decent at scale
  (the grouping + bulk-edit cover most of it).

### Option C — explicit product entity (the full model)

A new `product` doc (or a `products` service). An ad refs a product
(`product_id`). The product carries the link, photo, commission, cost, name,
partner. The ad carries the creative, copy, CTA, format. Making an ad = pick a
product (or create one inline), write the angle.

- **Pros:** single source of truth for the product. Change the commission =
  edit the product, all ads update. The storefront (need 4) is a natural
  *list of products* (not a list of ads). Versions are trivial (same product,
  new ad). The earnings panel is per-*product* (not per-ad).
- **Cons:** a new entity, a new write path, a new surface (the product maker).
  The ad form gains a "pick a product" step. More to build, more to explain.
  **The "overcomplicate" risk the operator named.**
- **Simplicity:** lowest at the start (one more thing), highest at scale (the
  single source of truth pays off at 20+ products).

## The recommendation (the simplicity constraint, applied) — *superseded by the refinement above*

> The recommendation below (Option B for v1, Option C for v2) is the
> pre-refinement call. The operator's refinement ("the ad is the superset,"
> above) supersedes it: no separate entity (rejects Option C), the product
> attributes live on the ad (the "product section" of the ad form), the
> implicit grouping by link is kept (Option B), and the `target` field lets an
> ad advertise a product / a collection / a storefront / nothing. The
> refinement IS the v1 — it's simpler than Option B (no "apply to all versions"
> bulk-edit needed; the product attributes are on the ad) and it doesn't need
> the v2 migration (there's no separate entity to migrate to).

**Option B is the right v1.** It gets 80% of the benefit (the grouping, the
bulk-edit, the "these are versions of the same product") with 0% of the new
entity. The product is a *view* (grouped by `offer.link`), not a *thing*. The
ad form is unchanged. The "apply to all versions" is the convenience that
solves the repetition problem.

**Option C is the v2** — when the catalog is big enough (20+ products) that the
single-source-of-truth payoff outweighs the extra entity. The migration is
clean: the implicit products (grouped by link) become explicit product docs,
and the ads' `offer.link` becomes a `product_id` ref. The data is already
grouped; the migration is a reframe, not a rewrite.

**The simplicity rule, stated plainly:** the product entity should be a
*consequence* of making ads, not a *prerequisite*. The first ad doesn't require
a product. The product *falls out* of the ads (grouped by link) and becomes
*explicit* only when the catalog is big enough to need it. "We want this to be
simple for people, people actually making ads" — the test is always: **does
this make the *next ad* faster to make, or does it add a step before the next
ad?**

## The relationship to the other needs

- **`ad-catalog-scale.md`** (versions + storefront + round-robin) — the
  product entity is the *data model* that makes all three cleaner. Versions =
  same product, new ad. The storefront = a list of *products* (not ads).
  Round-robin = rotate *products* (the ad is the product's current angle). The
  product entity is the spine that the catalog-scale ideas hang off — but
  Option B (the implicit grouping) gets you most of the way without the new
  entity.
- **`ad-earnings.md`** (the per-ad economics) — the earnings panel is
  per-*product* (not per-ad) when the product entity exists: "this product
  earned $X across its 3 versions." The commission + item cost live on the
  product (one place), not repeated per ad.
- **`ad-creative-labor.md`** (the 30-ads photo labor) — the product carries
  the photo (one, not repeated per version). The "pull the photo from the
  link" (the `external-link-embeds.md` primitive) fills the product's photo,
  and every version inherits it.

## Open questions (operator)

1. **v1: Option B (implicit grouping) or Option C (explicit entity)?** The
   simplicity constraint points to B. The scale payoff points to C. The
   recommendation is B for v1, C for v2 (when the catalog is big enough).
2. **If Option C: when does the product become explicit?** Auto (the first
   ad with a link creates the product) or manual (the creator "promotes" a
   grouped set of ads into a product)? Auto is simpler (the operator's
   constraint); manual is more deliberate.
3. **Does the product carry the `format`?** (inline / post is an ad-level
   choice, not a product-level one — a product can have both an inline ad and
   a post ad. Recommended: format stays on the ad.)
4. **Does the storefront (need 4) list products or ads?** If the product
   entity exists, the storefront is a list of *products* (each showing its
   current/best ad). If not (Option B), it's a list of *ads* grouped by link.
   The product entity makes the storefront cleaner, but Option B's grouping
   covers it.

## Files (when built — the refinement: the ad is the superset)

- `marketing/web10-social/src/data/ads-catalog.ts` — the ad body gains the
  optional **product attributes** (`item_price`, `commission_rate`,
  `product_pics`) + the optional **target** (`target: 'product' | 'collection'
  | 'storefront' | null` + `target_id`). `buildOfferBody` / `parseAd` write /
  read them. The read groups ads by `offer.link` into implicit "versions" (a
  `Map<link, AdItem[]>`) for the catalog view.
- `marketing/web10-social/src/data/types.ts` — `AdRecord` gains the product
  attributes + the `target` field (mapped from the body).
- `marketing/web10-social/src/components/Monetization/CreatorMonetization.tsx`
  — the ad form gains a **"product section"** (price, commission, pics) that's
  filled in when the ad is a product, left blank when it's not; a **target
  picker** (advertise: a product / a collection / a storefront / nothing).
- **The storefront** (focus #1) is an **album** (the built `ad_album` doc) that
  contains ads — no separate product entity. The storefront surface renders the
  album's ads as a grid (each showing its product attributes when present).
- No new entity, no new write path, no separate product surface. The ad is the
  single object; the product attributes are a section of the ad.
