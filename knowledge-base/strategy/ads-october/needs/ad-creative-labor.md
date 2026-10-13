# NEED — the ad creative is manual labor at scale

**Status: OPEN.** Filed from the operator's ad-experience pass (05.10.2026).
The operator made 30 ads in one sitting (the 3.217.0 one-tab surface) and the
friction showed up at exactly that volume.

## The complaint (verbatim)

> "Not bad that you need to do your own photos, but definitely laborious if
> you have like 30 ads."

## The problem

An ad's creative is **one manually-attached media item** (image or video). The
`AdForm` (`CreatorMonetization.tsx`) has a single attach control
(`accept` image/video, one item, `media_refs`), and the creator has to find,
upload, and attach a photo **per ad**. At one ad that's fine. At 30 ads (a
creator running a real affiliate catalog — 30 products, 30 links) it's 30
repeats of the same manual step, and the photo has to match the product in the
link. That's the labor.

The model already supports everything downstream — `media_refs` end to end,
`AdBlock`/`PostAdCard` render it, albums organize it. The only missing piece is
**getting the photo in without hand-work**.

## The insight (shared with the link-embed need)

The photo the creator wants is **already on the link's page.** An Amazon
affiliate link points at a product page whose main image *is* the ad creative.
So the labor disappears if the system can **pull the product image from the
offer link** and use it as the ad's creative — instead of the creator hunting
for a photo and uploading it.

That is the same primitive the `external-link-embeds.md` need wants (a product
card for a pasted affiliate link). One fetch, two consumers:
- **here** — auto-fill the ad's `media_refs` from `offer.link` when the creator
  pastes the link (or a "pull creative from link" affordance);
- **there** — render a product card for a link pasted in a post body.

## What "good" looks like (acceptance bar)

- Paste an affiliate link into the ad form's `offer.link` → the form offers /
  auto-fills the linked page's product image as the ad's creative (the creator
  can still override with a manual upload — the manual path stays, it just
  stops being the *only* path).
- 30 ads = 30 link pastes, not 30 photo hunts. The manual attach remains the
  fallback for links with no usable image (a service, a buzz link, a `kind:
  none` self-promo).
- The pulled image is stored as a normal `media_refs` doc (the existing
  pipeline — `uploadMedia` / `public_media`), so rendering is unchanged.

## Why it's a server-side surface (D60) — the constraint

The SPA **cannot** fetch an arbitrary product page's image: CORS blocks a
browser from reading `amazon.com`'s HTML, and Amazon actively blocks scrapers
(bot walls, rotating assets). So the fetch has to happen **server-side** — a
node/preview-server surface that resolves a URL → its `og:image` (or a
third-party link-card API, since Amazon blocks direct scraping). That pokes at
D60 (the node stays generic): it's a *generic* "give me a URL's card
metadata" primitive (like the existing `preview/render` + `media/thumbnail`
primitives), not an "Amazon" concept. The decision on whether/where that
generic fetch lives is the open call — see `external-link-embeds.md`, which
carries the same constraint and the D60 question in full.

## Open questions (operator)

1. **Auto-fill vs affordance.** On paste, silently fill the creative, or show a
   "use this image?" chip the creator confirms? (A chip is safer — a wrong
   auto-picked image is worse than a manual one.)
2. **Which image.** A product page can have several images; the `og:image` is
   the canonical one — is that always the right creative, or do we want the
   creator to pick from a few?
3. **Third-party card API.** Amazon blocks scraping hard. Do we lean on a paid
   link-preview/card service (reliable, costs money per call) or best-effort
   `og:image` fetch (free, flaky on Amazon)? This is the same call the
   link-embed need makes — decide once.

## Files (when built)

- `marketing/web10-social/src/components/Monetization/CreatorMonetization.tsx`
  — the `AdForm` link field + the creative auto-fill / "use this image" chip.
- `marketing/web10-social/src/data/ads-catalog.ts` — the creative-from-link seam
  (resolve link → image doc_id → `media_refs`).
- A **server-side link-card fetch** (the shared primitive — see
  `external-link-embeds.md`): likely a node/preview-server endpoint, D60-generic.
