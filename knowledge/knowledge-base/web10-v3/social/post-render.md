# Post render — how a post displays in every surface

A post is **one piece of content**. It has to look designed in every place it
appears: the profile grid tile, the feed card, the discover board, the video
wall, the shorts lens, the post lightbox, the watch page, the post permalink,
the profile feed, the repost embed, and the share preview. This doc is the
**render matrix** — the "what shows where" for a post (a `title` + a markdown
`text` + media, D82 + D85) across every surface, at every density.

`rich-text.md` is the **model** (markdown under the hood, the WYSIWYG editor,
the `<PostBody>` renderer, the security line). This doc is the **presentation**
— *where* a post displays, *how much* of it, and *in what order*. The two are
separate concerns: the model says "the body is markdown, rendered by one
component"; this doc says "here is exactly what each surface shows, and how it
truncates."

## The use case

A creator posts. The post then appears in a dozen places: a 9:16 tile on their
profile wall, a card in your feed, a row on the discover board, a thumbnail on
the video wall, a slide in the shorts lens, a modal when you click the tile, a
page when you open the permalink, a link preview when someone shares it. Each
of those is a different *amount of space* — a tile is 9:16 and tiny, the
lightbox is a reading column, the share preview is a 1200×630 card.

The problem the operator is fixing: **the teaser is designed, the detail is
bare.** The profile grid tile (the text-only "quote card," 3.179.0) looks good
— the title in the display font on a brand-tinted tile. But *click* the tile and
the lightbox is a 320px column with a bare title, icon-only actions, and a flat
owner list (the "someone's first try" surface). The two ends of the spectrum —
the teaser and the detail — are not *both* designed. A post has to hold at
every zoom level, and today it only holds at the teaser.

## The core model: one content, N densities (a zoom, not a reformat)

The load-bearing fact: **a post is rendered at different *densities* in
different surfaces, but it is always the *same* content — a zoom, not a
reformat.** The grid tile is a low-resolution version of the lightbox, not a
different post. The feed card is the lightbox with the body clamped. Nothing is
re-authored per surface; the surface decides *how much* of the one post to show.

This kills the "showing it in multiple ways" question: it is not multiple
*formats*, it is one format at N *fidelities*. The consequences:

- **The title is the anchor.** It is the one element that appears at *every*
  density (the tile, the card, the detail). That is what makes a post
  *recognizable* as it zooms — you see the title on the tile, you click, the
  same title is the header of the lightbox. A post with no title falls back to
  its first line as the anchor (the caption-only case).
- **The densities are monotonic.** Teaser ⊂ Summary ⊂ Full. The full post
  *contains* the teaser — the tile's title is the lightbox's title, the card's
  clamped body is the top of the lightbox's body. A surface never shows
  something the full post doesn't have, and the full post never contradicts the
  teaser.
- **The truncation is honest.** A teaser that cuts the content shows an
  ellipsis (or a hard clip at a word boundary), never a mid-word cut. The
  teaser is a *preview* of the full post, and a preview that lies (a cut-off
  word, a truncated sentence that reads wrong) breaks the "zoom" — the user
  clicks expecting the rest and gets a different shape.

### The three densities

| Density | What it is | The surfaces | The body |
|---|---|---|---|
| **Teaser** | the at-a-glance tile / thumbnail. 1–2 lines. | the grid tile, the home card (video wall), the shorts tile, the repost embed, the share preview | the title (or first line) only — no markdown, no body |
| **Summary** | the in-the-stream card. A few lines. | the feed card, the discover card, the profile feed | the title + **light markdown** (inline bold/italic/code/links/mentions), `line-clamp`'d |
| **Full** | the read-it surface. The whole post. | the post lightbox, the watch page, the post permalink | the title + **full markdown** (headings, lists, code blocks, blockquotes, the `@` mentions) at a reading measure |

The **shorts lens** is the one exception to the clean mapping: it is a *full*
surface (the detail of a short) but **video-first** — the 9:16 video *is* the
content, and the markdown is an **overlay** (the caption over the video, the
TikTok shape), not a reading column. The lens shows the full post; it just
presents the body as an overlay because the video is the hero.

## The render matrix

The load-bearing table. For each surface, what it shows at its density, and how
the two big post forks (text-only vs. media) change it. An **ad** is a `posts`
doc (ads.md, D55) — it renders exactly like a post in every cell (a post-format
ad is a card, an inline ad is the title line); it is not a separate row.

| Surface | Density | Text-only | Image(s) | Video (landscape) | Short (9:16) | Repost |
|---|---|---|---|---|---|---|
| **Grid tile** (profile wall, 9:16) | teaser | the **quote card** — title in the display font on a brand-tinted tile (3.179.0) | the first image, cover-cropped to 9:16 + the title overlay (bottom) | the poster frame + a play badge + the title overlay | the poster + a play badge + the title overlay | the **original's** tile (the repost shows what it amplifies) |
| **Home card** (video wall, 16:9) | teaser | *(not on the video wall — text-only posts don't render here)* | the first image, cover-cropped to 16:9 + the title | the thumbnail (16:9) + the title + the author attribution | *(portrait — stays out of the video wall, 3.182.0)* | the original's thumbnail |
| **Feed card** (the Following feed) | summary | the author row + the title + the body (light markdown, clamped) | the author row + the title + the body (clamped) + the media grid | the author row + the title + the body (clamped) + the inline video | the author row + the title + the 9:16 video | the reposter's row + the comment + the **embedded original** (a compact card) |
| **Discover card** (the Hot Gossip board) | summary | the rank badge + the title + the body (clamped) — a hot take is caption-only by default (D82) | the rank badge + the title + the body (clamped) + a thumbnail | the rank badge + the title + the body (clamped) + a thumbnail | the rank badge + the title + the body (clamped) | the rank badge + the title + the body (clamped) |
| **Shorts tile / lens** | teaser / full | *(a short is a video — no text-only case)* | *(n/a)* | *(landscape — not a short)* | **tile:** the 9:16 poster + the caption overlay. **lens:** the full-screen video + the caption overlay + the author + the action rail | *(n/a — a repost is not a short)* |
| **Post lightbox** (click a tile / a card) | **full** | the **post-detail system** — identity row + the title + the body (full markdown, reading measure) + the stats row + the labeled actions + the `⋯` menu | the post-detail system + the media (the carousel) | the post-detail system + the video (the player) | the post-detail system + the 9:16 video (the square-capped frame) | the post-detail system + the embedded original |
| **Watch page** (`/watch/:postId`) | **full** | *(a watch page is a video — no text-only case)* | *(n/a)* | the player + the title + the body (full markdown, the description) + the author row + the comments + the "What's next" queue | *(portrait → the shorts lens, not the watch page)* | the player + the title + the body + the embedded original |
| **Post permalink** (`/u/:u/p/:id`) | **full** | the post-detail system (the standalone page) | the post-detail system + the media | the post-detail system + the video | the post-detail system + the 9:16 video | the post-detail system + the embedded original |
| **Profile feed** (the Facebook-shaped view) | summary→full | the full `PostCard` (the profile's posts as a vertical stream) | the full `PostCard` + the media | the full `PostCard` + the video | the full `PostCard` + the 9:16 video | the full `PostCard` + the embedded original |
| **Repost embed** (inside a repost card) | teaser | the original's title + first line (compact) | the original's title + a thumbnail (compact) | the original's title + a thumbnail + a play badge | the original's title + a 9:16 thumbnail | *(n/a — no nested reposts)* |
| **Share preview** (the OG card, node-rendered) | teaser | the title + the first line as `og:description` (plain text, D85's strip) | the title + the first line + the first image as `og:image` | the title + the first line + the poster as `og:image` | the title + the first line + the poster | the title + the first line + the original's image |

**Reading the table:** the **text-only column** is the interesting one — it is
the only post type where the teaser is a *designed card* (the quote card)
instead of a media crop, and it is the only type where the teaser and the full
post are *both* text (the tile's title *is* the lightbox's title). Every media
post's teaser is a *crop of the media*; its full post is the media + the body.
The **repost column** is the only one where the surface shows *another* post
(the original) — the repost card is the reposter's comment + the embedded
original, and the embed renders the original at teaser density.

## The per-surface specs

The matrix is the "what"; these are the "how" — the rules that make each
surface hold.

### The grid tile (the teaser that's already good)

The 9:16 tile on the profile wall (`WallTile`). This is the teaser the operator
likes — keep it, and make it the *reference* for what a teaser should be:

- **Text-only → the quote card.** A brand-tinted background (deterministic per
  post, the `hashToColor` idiom, 3.179.0), a soft glow, the **title in the
  display font** (Space Grotesk) with the caption under it, bright foreground,
  vertically centered. A caption-only post (no title) shows its first line as
  the heading. This is the "designed teaser" — the bar the other teasers meet.
- **Image → cover-crop + title overlay.** The first image, cover-cropped to
  9:16, with the title as a bottom overlay (a gradient scrim for legibility).
- **Video / short → poster + play badge + title overlay.** The poster frame, a
  play badge (top-right), the title as a bottom overlay.
- **The tile is the teaser, the click is the payoff.** Tapping the tile opens
  the **full** post (the lightbox) — the "click a tile → lightbox" seam. The
  tile never shows the body; it shows the title and *invites the click*.

### The feed / discover / profile cards (the summary)

The in-the-stream cards (`PostCard`, `DiscoverCard`, `ProfileFeed`). The
summary density:

- **The author row** (avatar + name + `@handle` + timestamp) anchors the top.
- **The title** (the display font, the anchor) leads the body.
- **The body** is **light markdown** — inline bold/italic/code/links/mentions
  only (no headings, no code blocks, no blockquotes in a card) — and is
  `line-clamp`'d (the card is a teaser of the body, not the body). A card that
  renders a code block or a heading is a card that blew up in height; the
  summary density is *inline* markdown, clamped.
- **The media** renders below (the grid for images, the inline player for
  video, the 9:16 frame for a short).
- **The action bar** (the labeled Like / Comment / Share, the counts) closes
  the card.
- **The "read more" seam.** A card whose body is clamped is *clickable* —
  tapping the body (or the card) opens the **full** post (the lightbox). The
  clamp is the invitation; the click is the payoff. A card that clamps but
  doesn't open the full post is a dead end.

### The detail surfaces (the full) — the post-detail system

The lightbox, the watch page, and the permalink are the **full** density. They
share **one layout** (the post-detail system, specified in `rich-text.md`):
the identity row, the display-font title, the body (full markdown at a reading
measure), the media, the quiet stats row, the labeled action bar, the `⋯` owner
menu, and a **content-sized** container (a text-only post gets a centered
reading column, not 320px-in-896px). The three surfaces differ only in the
chrome around the shared layout:

- **The lightbox** — the modal. The shared layout in a panel; the media is the
  carousel (or the square-capped 9:16 frame for a short); the post-nav arrows
  step through the profile's posts.
- **The watch page** — the video destination. The shared layout with the
  player as the hero (left on desktop, top on mobile) + the "What's next" queue
  + the comments below.
- **The permalink** — the standalone page. The shared layout as a page (the
  shareable URL, the surface the share preview points at).

The **shorts lens** is the full density, video-first: the full-screen 9:16
video + the caption overlay + the author + the action rail (the TikTok shape).
It is the detail of a short; it just presents the body as an overlay because
the video is the hero.

### The repost embed (the teaser of another post)

A repost card is the reposter's comment + the **embedded original**. The embed
renders the original at **teaser** density (the title + the first line, or the
title + a thumbnail) — a compact card, not the full post. Tapping the embed
opens the *original's* full post (its lightbox / permalink), not the repost's.
The repost is the quote; the embed is the thing being quoted.

### The share preview (the teaser the node renders)

The OG / Twitter card (`share.py`, D71) is the teaser density, **node-rendered**
(no client). It shows the title (`og:title`) + the first line as
`og:description` (**plain text** — D85's markdown strip, so no `**` / `#`
leaks) + the first image / poster as `og:image`. The I3 / D41 floor: a
non-public post renders the generic card with no content.

## The truncation rules

How each density cuts the content. The rule is **honest truncation** (the
"zoom, not a reformat" model): a cut is a *preview*, never a lie.

- **The teaser** (tile / thumbnail): the title only (or the first line,
  caption-only). No body. A title longer than the tile's measure clips at a
  word boundary with an ellipsis (the quote card's `line-clamp`). The teaser
  never shows a partial sentence that reads wrong on its own.
- **The summary** (card): the body is `line-clamp`'d (a fixed number of lines,
  the card's height budget). The clamp cuts at a word boundary + an ellipsis.
  A clamped body is *clickable* → the full post (the "read more" seam). The
  clamp is the invitation, not the end.
- **The full** (detail): **no truncation** — the whole post, at a reading
  measure. A very long post scrolls (the detail surface is a reading surface;
  scrolling is correct, clamping is not). The one exception: the **shorts lens**
  overlay clamps the caption (the video is the hero; the caption is a few
  lines, expandable).

The **anchor rule** ties it together: the element that appears at *every*
density (the title, or the first line) is the same string at every density. The
tile's title, the card's title, and the lightbox's title are the *same text* —
that is what makes the post recognizable as it zooms.

## The click-through seam (the "click a tile" the operator flagged)

The operator's specific point: the tile is good, but *clicking* it lands on a
bare lightbox. The fix is the **click-through seam** — the navigation from a
teaser / summary to the full post, designed as a first-class thing:

- **Every teaser and summary is clickable to the full post.** A grid tile →
  the lightbox (the profile's post, with the post-nav arrows). A feed / discover
  card → the lightbox (or the permalink). A home card → the watch page (video)
  or the shorts lens (portrait). A shorts tile → the lens. A repost embed → the
  original's full post.
- **The click lands on the *full* density, never a dead end.** The teaser
  invites the click by *withholding* the body (the clamp, the title-only tile);
  the click *pays it off* with the full post. A teaser that opens a surface
  that shows *less* than the teaser (a bare lightbox) breaks the seam — that is
  the bug. The full post always shows ≥ what the teaser showed.
- **The URL is the state** (the deep-link rule). The full post is reachable by
  URL — the permalink (`/u/:u/p/:id`) for a standalone post, the lightbox for a
  modal. Refreshing the lightbox restores it; the permalink is shareable. The
  teaser → full seam is a navigation, and the navigation is the URL.

## The consistency rules

The rules that make a post *hold* across surfaces (the "zoom, not a reformat"
model, made checkable):

1. **Recognizable.** The anchor (the title, or the first line) is the *same
   string* at every density. You can identify the post from the tile, and the
   same title is the header when you click it.
2. **Monotonic.** Teaser ⊂ Summary ⊂ Full. A surface never shows content the
   full post lacks; the full post never contradicts the teaser. The teaser is a
   *subset* of the full post, not a different thing.
3. **Honest truncation.** A cut is a word-boundary ellipsis, never a mid-word
   cut or a sentence that reads wrong alone. The teaser is a preview, and a
   preview that lies breaks the zoom.
4. **Lands.** Every teaser / summary is clickable to the full post, and the full
   post shows ≥ what the teaser showed. No dead ends, no "click and get less."
 5. **One layout for the full.** The lightbox, the watch page, and the permalink
    share the post-detail system (one spec, three chromes). They are the same
    surface at different chrome, not three different designs.
6. **The title is the anchor, the body is the zoom.** The title is constant
   across densities; the body is what changes (none → clamped → full). A post
   with no title uses its first line as the anchor (the caption-only case).

## What it rejects

1. **A separate format per surface.** The teaser is not a different post from
   the full post — it is the same post at a lower density. Re-authoring the
   content per surface (a "tile version" + a "card version" + a "detail
   version") is the reformat trap; the model is one content, N fidelities.
2. **A teaser that shows the body.** The teaser is the title (or first line)
   only. A tile that renders the full markdown body is a tile that is no longer
   a teaser — it is a cramped full post. The body belongs to the summary / full
   densities.
3. **A summary that renders block markdown.** A card is inline markdown,
   clamped. A card that renders a code block, a heading, or a blockquote is a
   card that blew up in height. Block markdown is the full density.
4. **A full post that truncates.** The detail surface is a reading surface — it
   shows the whole post (it scrolls). Clamping the full post is clamping the
   thing the user clicked to read. (The one exception: the shorts lens overlay,
   where the video is the hero.)
5. **A teaser that doesn't land.** A tile / card that isn't clickable to the
   full post is a dead end. The teaser's job is to invite the click; a teaser
   that can't be clicked is a poster, not a teaser.
 6. **Three different detail designs.** The lightbox, the watch page, and the
    permalink are one layout (the post-detail system) at three different
    chromes. Three separate designs is three times the work and three chances
    to drift.

## The seam

- **The teaser surfaces:** `UserProfileScreen.tsx` (`WallTile` — the grid tile,
  the quote card), `marketing/shared/discover/src/HomeCard.tsx` (the video
  wall), `ShortsWall.tsx` / `ShortsScreen.tsx` (the shorts tile / lens),
  `FeedScreen.tsx` (`RepostedEmbed` — the repost embed).
- **The summary surfaces:** `FeedScreen.tsx` (`PostCard`),
  `marketing/shared/discover/src/DiscoverCard.tsx` (the discover card),
  `ProfileFeed.tsx` (the profile feed).
- **The full surfaces:** `PostLightbox.tsx`, `WatchScreen.tsx`, the
  post-permalink route (`/u/:u/p/:id`) — the shared post-detail system
  (specified in `rich-text.md`).
- **The share preview:** `api/app/v3/endpoints/share.py` (the node-rendered
  teaser, D71 + D85's strip).
- **The body in every surface:** `<PostBody>` (the renderer, `rich-text.md`) at
  the surface's density (teaser = title only, no `<PostBody>`; summary = light
  markdown, clamped; full = full markdown, reading measure).

**KB:** `social/rich-text.md` (the model — the markdown, the editor, the
renderer, the post-detail system), `social/ads.md` (an ad is a post — it
renders in every cell of the matrix), `social/shorts.md` +
`social/discover-card.md` (the teaser / summary specs for the shorts + discover
surfaces), `social/watch-page.md` (the full spec for the watch page),
`social/share-preview.md` (the node-rendered teaser).
