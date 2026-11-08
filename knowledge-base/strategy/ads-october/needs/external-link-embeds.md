# NEED — affiliate links in posts render as a bare chip, not a product card

**Status: OPEN (the fetch primitive is BUILT — the ad-consumer shape is not).**
Filed from the operator's ad-experience pass (05.10.2026).
The question that started it: *"do the affiliate links have good embed photos?
… where the link has a photo?"*

**Update (07.11.2026, D99):** the shared primitive this need floats is built —
the link unfurl (`web10-v3/social/link-unfurl.md`): the social app's preview
server fetches a pasted link (SSRF-guarded, cached) and returns its card
(title/description/image + the provider's player iframe for Spotify /
SoundCloud / TikTok / Bandcamp). "Where the fetch lives" (this doc's open
question 1) is **decided: the social app's preview server, not the node**
(D60 — the node never fetches external urls and never learns a provider).
What stays open for THIS need: (a) the AD's product-card shape is a different
contract than the link group's card (price, product title, the affiliate
tracking url must survive into the card's href — the unfurl card's href is
the pasted url, so the tracking works today, but the ad form's auto-fill
from the offer link is unbuilt); (b) Amazon-class bot walls: the unfurl
degrades to the plain link (verified: amazon.com → `unavailable`) — the
"paid link-card API vs scrape" call (question 2) is still owed by the ad
consumer, not the unfurl; (c) the ad form's "URL → auto-fill the creative"
wiring (`ad-creative-labor.md`) — the unfurl endpoint is the seam it calls.

## The complaint (verbatim)

> "does amazon affiliates, these affiliates, do the affiliate links have good
> embed photos? lets say someone put a link in a post, do the web10 post
> surfaces support good embed shares? where the link has a photo?"

## Current state (verified 05.10.2026; the unfurl landed 07.11.2026)

A link pasted in a post body is handled by `src/lib/linkEmbeds.ts`. It knows
exactly **two** providers — **YouTube and Vimeo** — and only those get a rich
embed (player + thumbnail) **client-side** (no server round-trip).
**Since the unfurl (D99, `web10-v3/social/link-unfurl.md`):** everything else
at full density unfurls through the preview server's SSRF-guarded fetch — the
provider player (Spotify / SoundCloud / TikTok / Bandcamp) or the OG rich
card (articles, Substack, the bot-shell Instagram reel). A link the unfurl
can't resolve — **including `amazon.com` (the bot wall, verified:
`unavailable`)** — keeps the plain link. The `external` chip fallback
(`ExternalLinkChip`) survives in DMs (`TextWithLinks`), which never unfurl.

So an Amazon affiliate link in a post still shows no product card: the
unfurl's wall-refusal degrades it to the plain link. **No product photo, no
title, no price.** The affiliate tracking still works (it's a normal outbound
link) — only the *visual* is bare.

## Why it was bare (and why that was load-bearing)

The system **never fetched external link metadata** — no `og:image` scrape,
no server-side link-preview for pasted URLs. That was deliberate:
- **D60** — the node stays generic; it doesn't learn "Amazon" or "affiliate
  product."
- It sidesteps Amazon's aggressive bot-blocking and the whole "we scraped a
  dead/rotating image" bug class.

The unfurl honored both: the fetch lives in the SOCIAL APP's preview server
(the node never learns a provider, D99), and the Amazon-class walls degrade
to the plain link — the "we scraped a dead/rotating image" bug class stays
out of the render path (a wall is a `no_metadata`, never a wall-shaped card).

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
   yes — it's generic, not social.) — **ANSWERED (D99, 07.11.2026): the social
   app's preview server** — the provider set + card shapes are social
   link-curation concepts; the node keeps zero external-fetch surface. If a
   second consumer (the ad form) arrives, the primitive lifts — the decision
   is recorded, the seam is the `GET /preview/unfurl` contract.
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
