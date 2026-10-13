# NEED — affiliate links in posts render as a bare chip, not a product card

**Status: OPEN.** Filed from the operator's ad-experience pass (05.10.2026).
The question that started it: *"do the affiliate links have good embed photos?
… where the link has a photo?"*

## The complaint (verbatim)

> "does amazon affiliates, these affiliates, do the affiliate links have good
> embed photos? lets say someone put a link in a post, do the web10 post
> surfaces support good embed shares? where the link has a photo?"

## Current state (verified)

A link pasted in a post body is handled by `src/lib/linkEmbeds.ts`. It knows
exactly **two** providers — **YouTube and Vimeo** — and only those get a rich
embed (player + thumbnail). Everything else, including `amazon.com`, falls to
the `external` fallback (`linkEmbeds.ts:118`), which renders as a tiny chip: a
32px Google favicon + the domain + an external-link arrow
(`LinkEmbed.tsx:105` `ExternalLinkChip`).

So an Amazon affiliate link in a post shows a little `amazon.com ↗` pill.
**No product photo, no title, no price.** The affiliate tracking still works
(it's a normal outbound link) — only the *visual* is bare.

## Why it's bare (and why that's load-bearing)

The system **never fetches external link metadata.** No `og:image` scrape, no
server-side link-preview for pasted URLs. That's deliberate:
- **D60** — the node stays generic; it doesn't learn "Amazon" or "affiliate
  product."
- It sidesteps Amazon's aggressive bot-blocking and the whole "we scraped a
  dead/rotating image" bug class.

Don't confuse this with the **share preview** (`share-preview.md`, 3.211.0) —
that's the *other* direction: when a **web10 post's permalink** is shared to
iMessage/Slack, the preview server renders a rich OG card with the post's own
media. Solid. It says nothing about external links pasted *inside* a post.

## The fix needs a server-side link-card fetch (the D60 question)

The SPA **cannot** fetch an arbitrary page's `og:image`: CORS blocks a browser
from reading `amazon.com`'s HTML, and Amazon blocks scrapers hard (bot walls,
rotating assets). So the fetch has to be **server-side** — a node/preview-server
surface that resolves a URL → its card metadata (`og:image`, title, price if
present). That's a *generic* "give me a URL's card" primitive (like the existing
`preview/render` + `media/thumbnail` primitives), not an "Amazon" concept — so
it can stay D60-clean. But **where it lives** (node vs preview server vs a
third-party card API) is the open decision. Amazon in particular pushes you
toward a **paid link-card API** rather than direct scraping.

## The overlap (the load-bearing observation)

This is the **same primitive** `ad-creative-labor.md` needs. One fetch —
"URL → product image/card" — solves **both**:
- **here** — a pasted affiliate link in a post renders a product card (image +
  title + price);
- **there** — the ad's creative auto-fills from the offer link.

Build the primitive once; both needs are its consumers.

## What "good" looks like (acceptance bar)

- Paste an Amazon affiliate link in a post → the post renders a **product
  card** (the linked page's image + title, price if available) instead of the
  favicon chip.
- The card is built from a **server-side** URL→card fetch (CORS + bot-wall
  safe), cached so we don't re-fetch on every render.
- Degrades to the existing favicon chip when the fetch fails / the page has no
  usable image (a service, a buzz link) — never a broken card.

## Open questions (operator)

1. **Where the fetch lives.** A node endpoint (D60-generic "link card"
   primitive) vs the social preview server vs a third-party card API. The
   D60 test: would a notes/music/shop app use "give me a URL's card"? (Arguably
   yes — it's generic, not social.)
2. **Third-party vs scrape.** Amazon blocks scraping. Paid link-card API
   (reliable, per-call cost) vs best-effort `og:image` (free, flaky on Amazon)?
   Same call `ad-creative-labor.md` makes — decide once.
3. **Cache + staleness.** Product images/prices change. How long do we cache a
   fetched card before re-fetching?
4. **Scope.** Just product/affiliate links, or any external link (a YouTube
   link already embeds; a random blog link — card it too)?

## Files (when built)

- A **server-side link-card fetch** (the shared primitive): a node/preview-server
  endpoint, D60-generic, cached.
- `marketing/web10-social/src/lib/linkEmbeds.ts` — an `external` link with a
  resolved card → a `ProductCard` shape (image + title + price) instead of the
  chip.
- `marketing/web10-social/src/components/Feed/LinkEmbed.tsx` — a
  `ProductCard` renderer (image + title + price + the domain), used by both the
  post body and (via the shared primitive) the ad form.
