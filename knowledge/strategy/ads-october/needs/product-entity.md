# NEED — a "product" entity (the thing an ad is *about*)

**Status: BRAINSTORMING.** Filed from the operator's ad-experience pass
(05.10.2026). The operator's own framing: *"this is all brainstorming, i think
it is productive, to bring up a lot of needs, even if we dont address them
all."* This is the most speculative of the four needs — a data-model idea, not
a surface gap. Capture it, evaluate it against the simplicity constraint, and
let it sit.

## The idea (verbatim)

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

## The options (lightweight → full)

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

## The recommendation (the simplicity constraint, applied)

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

## Files (when built — Option B, the v1)

- `marketing/web10-social/src/data/ads-catalog.ts` — the read groups ads by
  `offer.link` into implicit products (a `Map<link, AdItem[]>`); the UI shows
  the grouping.
- `marketing/web10-social/src/components/Monetization/CreatorMonetization.tsx`
  — the "versions of this product" grouping in the catalog; the "apply to all
  versions" bulk-edit (commission, cost, photo, link).
- No new entity, no new write path, no new surface. The ad form is unchanged.
