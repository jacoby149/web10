# Hashtags — the second social token (D110)

A post's body already carries one social token: the **@mention** (rich-text.md,
D85). This doc settles the second: the **#hashtag**. A creator types `#walking`
in the caption; every read surface renders it as a tappable topic link;
tapping lands on the public board of posts that carry the hashtag. The whole
loop is **app-owned, zero node surface (D60)** — the node stores `{service,
body}` opaquely and does not know a hashtag exists.

## The use case

A creator posts "Sunday trail run, legs gone. #walking #delhi". A fan taps
`#walking` and lands on a board of every public post that used it — newest
first, the feed's PostCard, the same card everywhere (post-render.md). The
creator's content is found *outside* their follower graph (the discovery loop,
D20): hashtags are the public ledger's own topic index, readable by design
(D41), terms-controlled like everything else on the node.

The bar: a hashtag behaves like one on Instagram/X — typed in plain prose,
rendered highlighted, tappable, leading to a board. It must hold next to the
mention (the token it rhymes with), not read as a bolt-on.

## The load-bearing decision: `body.hashtags`, NOT the doc `tags` column

Posts already carry a document-level `tags` column — but it is the **machine's**
vocabulary: `short` (the render-time Shorts gate), `video` / `music` (the
video-wall + music-track gates), `ad` / `node_ad` / `ad_album` (the ad
inventory split, reserved and guarded on the write path), `product` (D89's
storefront), `album:<id>` (ad albums). User prose must never be able to
*reclassify* a post: typing `#short` in a caption must not move a text post
into the Shorts wall; typing `#music` on a post with an mp3 must not make it a
music track; typing `#ad` must not make it ad inventory. The reserved-tag guard
(`RESERVED_POST_TAGS`) polices only the ad trio because only the ad trio was
user-reachable — the machine set grows every feature, and a growing blacklist
is a foot-gun.

So hashtags live in a **derived body field**, exactly the `mention_usernames`
precedent (rich-text.md): the social write layer parses the markdown body and
writes `body.hashtags` (lowercase, deduped) alongside it. The node stores it
opaquely; the read side maps it (`PostRecord.hashtags`); the board query
filters on it (`has(JSONExtract(body, 'hashtags', 'Array(String)'), '<tag>')`
through the D73 safe-query engine — the boundary CTE's block/sharing/hidden
anti-joins apply, so moderated content never leaks). Document `tags` is
untouched by user prose, period.

Consequence (accepted): a hashtag has no *machine* meaning. `#short` in a
caption is just a topic — the post is still not a short. Topics are for
discovery, not for classification.

## The pattern (what counts as a hashtag)

`#` + 1–30 chars of `[a-zA-Z0-9_]` (letters, digits, underscore — Instagram's
character set; **no hyphens**: `#walk-king` tags `walk` and leaves `-king` as
text; no unicode in v1), with the mention's boundary discipline:

- the `#` sits at the start of the text or after whitespace / `(` — so `a#b`,
  `1#x` are not hashtags;
- the run must END on a boundary (a non `[a-zA-Z0-9_]` char or the text end) —
  a 31-char run is not a hashtag (no mid-word truncation, no partial tag);
- never inside inline code / code blocks / link labels / URLs / raw HTML;
- never in a markdown heading — `# ` / `## ` at line start are ATX markers the
  parser consumes, not prose (the composer only offers H2/H3, and typing `# `
  in the editor is literal text, which the parser may still read as a heading
  on the read side — that is markdown semantics, documented in rich-text.md).

**Normalization:** stored + looked up **lowercase** (`#Walking` ≡ `#walking`;
the link's href is the normalized tag so both caseings land on one board).
The rendered child keeps the case the author typed.

The regex is ONE shared source (`@web10/discover/hashtags` —
`hashtagMatches`), consumed by both the write-side derivation (a markdown-it
token walk, the `mentionedUsernames` pattern) and the read-side render (a
remark plugin, the `remarkMentions` pattern) — so the two can never drift.

## The write side (the composer is untouched)

Hashtags need **no composer surface**: the creator types `#walking` as plain
text in the WYSIWYG caption (the editor offers no formatting it cannot persist —
D85's rule — and a hashtag needs no format, it needs a *destination*, which the
read side provides). On save, the data layer derives:

- `createPost` → `body.hashtags = hashtagTexts(post.text)` (next to
  `body.mention_usernames`);
- `updatePost` → re-derive whenever `text` changes (an edit that drops the
  `#` drops the tag; one that adds it gains the tag). No `body.hashtags` in the
  update payload otherwise (the field is app-derived, never hand-written).

Reposts derive from their comment the same way (a repost's comment is a post's
`text`). The board excludes `ad`/`product`-tagged docs in SQL; this bite does not
add topic indexing to the separate inventory writers.

**Existing posts:** rendering recognizes hashtag prose immediately, but board
membership requires `body.hashtags`. Re-saving the caption derives the index;
there is no automatic historical backfill or bulk content rewrite. The separate,
default-off resumable upload queue constructs its own deferred body and does not
yet derive this field. Its owner must wire the same helper before hashtagged
queued publication can claim parity with the standard composer path.

**Open (the follow-up, not v1):** a `#`-trigger picker in the composer
(suggesting existing hashtags, the mention picker's UX) — it needs a
distinct-hashtags read (a full-board aggregation per keystroke is not free),
so it is a separate bite, not part of the loop.

## The read side (every surface links)

The shared remark plugin (`remarkHashtags`, explicit href factory — no default,
so a consumer that doesn't pass one links nothing):

- **`<PostBody>` / `<PostBodyInline>`** (social's one renderer, full + light +
  inline densities): `#tag` → a router link to `/tag/<tag>`, styled with the
  mention's treatment (`text-brand-300 font-medium hover:underline`, tokens
  only — design.md §4/§12), `data-testid="post-body-hashtag"`. Internal href,
  so it never unfurls (the unfurl is for external http(s) only).
- **`MarkdownText`** (the shared teaser renderer, comments + the card
  captions): opt-in via `hashtagHref` (+ `onHashtagClick`, the
  `onMentionClick` seam) — social's comment thread passes it (a `#tag` in a
  comment taps to the same board); marketing-ui passes nothing and renders
  `#tag` as inert text (its router has no `/tag` route — dead links are worse
  than plain text).
- Code, headings, link labels, URLs and raw HTML stay inert (the plugin's
  node-skip list, the mention's).

The D85 security line is unchanged: the plugin emits *markdown link nodes*
before the locked `rehype-sanitize` choke point; the sanitize schema already
allows internal `/` hrefs (mentions do); nothing new crosses into the DOM
pipeline.

## The board (`/tag/:hashtag`)

The destination every hashtag link lands on: a public, newest-first board of
posts whose `body.hashtags` contains the tag.

- **Route:** `/tag/:hashtag` (top-level, the URL holds the state — refresh
  restores it, it is shareable; anon-capable: the board reads the DISCOVER
  group only, which `anyone` reads — D41/D58). The param is validated
  (`[a-z0-9_]{1,30}` after lowercasing) — an invalid param is a designed
  not-a-hashtag state, not a crash.
- **The read:** `readFeedPage` over `groups: [discoverGroup]` with the new
  `hashtags: [tag]` filter (a `buildFeedQuery` WHERE clause — one more
  condition in the app's own SELECT, D73: the app writes the query, the node
  walls it). Newest-first (no knob state), stable paging (cursor on
  created_at/author/doc), reusing the feed's media/ad prepare pass and existing
  engagement/author enrichment, D86 surface label `hashtag`. This is not a
  single-total-request claim. The ad/product exclusion rides the existing WHERE
  terms.
- **The card:** the feed's `PostCard` (the reference renderer — the board
  looks exactly like Hot Gossip, design.md §1), wired like the Discover board:
  inline media map, engagement counts, the own-reaction fill + optimistic
  toggle, the repost fill + the app-level composer repost mode, author click
  → profile/group, post-format attached ads as their own card.
- **States (design.md §1, all designed):** loading = the board skeleton;
  empty = a story beat ("Nothing under #tag yet" + for the signed-in reader a
  "Post with #tag" CTA that opens the app-level composer with `#tag ` seeded
  into the caption — the composer prefill seam; for anon, the sign-in CTA);
  error = a designed card with retry. Infinite scroll sentinel, the
  Discover-board idiom.
- **No total count in v1** (a `SELECT count()` second query is a follow-up
  bite; the board is newest-first, not ranked — there is no "Top 10" rail
  until the count + ranking land).

## Discover topic chips (the `?tag=` rail)

The Discover board's topic chips were built from doc `tags` alone — which is
why they already print `#cooking` (the `#`-label idiom was there before the
prose hashtag). v1 unions the two: chips are built from `tags ∪ hashtags` of
the loaded board, and the `?tag=` filter matches either (the client-side pool
filter, same as today — the chip is a filter on the loaded board; the GLOBAL
destination for a topic is the `/tag/` board the prose links to). The `?q=`
board search matches hashtags too. No new URL params (the deep links survive
verbatim).

## What it rejects

1. **Hashtags in the doc `tags` column.** Machine semantics are not user
   prose (the load-bearing decision, above). A `#short` caption must not
   Short a post.
2. **A node column / endpoint / contract for hashtags.** D60: the body field +
   the app's own SELECT is the whole surface; the node parses nothing.
3. **A composer toolbar button.** The toolbar is the only *formatting* surface
   (D85); a hashtag is not a format, it is a destination — typed prose, like
   the mention.
4. **Hashtags in the `title`.** The title is a plain headline string (D85);
   the hashtag is a body token.
5. **A hashtag index on comments in v1.** Comments render + link the token
   (the shared seam is free), but the board reads `posts` only — a
   comment-hashtag aggregation is a follow-up with its own query.
6. **Case-variant boards.** One board per lowercase tag; the typed case is
   display only.

## The seam

- **Shared parser:** `marketing/shared/discover/src/hashtags.ts`
  (`hashtagMatches` + `normalizeHashtag` + `remarkHashtags(hrefFactory)`;
  the `./hashtags` subpath, the `./mentions` idiom) — consumed by both apps'
  renderers and the write-side derivation (which adds the markdown-it token
  walk in social's `data/hashtags.ts`, the `data/mentions.ts` idiom).
- **Write layer:** `marketing/web10-social/src/data/posts.ts`
  (`createPost` / `updatePost` derive `body.hashtags`),
  `data/types.ts` (`PostRecord.hashtags` + the `fromV3DocToPost` mapping),
  `data/feed.ts` (`buildFeedQuery`'s `hashtags` WHERE term + `readFeedPage`'s
  `surface` opt).
- **Read layer:** `components/Feed/PostBody.tsx` (+ `PostBodyInline`, the
  `/tag/` branch in `BodyLink`), `marketing/shared/discover/src/MarkdownText.tsx`
  (+ `CommentThread.tsx` the `onHashtagClick` seam), social's
  `components/Feed/CommentThread.tsx` wrapper (navigates).
- **The board:** `components/Discover/HashtagScreen.tsx` + the `/tag/:hashtag`
  route in `App.tsx`.
- **The chips:** `components/Discover/DiscoverScreen.tsx` (the topics union +
  the `?tag=` / `?q=` filter match).
- **The prefill:** `context/ComposerContext.tsx` (`draftText` opt) →
  `NewPostSheet.tsx` → `PostComposer.tsx` (the editor's seed).
- **Data:** unchanged node surface. `body.hashtags` is app-derived content in
  the existing opaque body (the `mention_usernames` precedent); the board is
  the app's own D73 SELECT over `posts`.

**Open gates (separate bites, not this loop):** the composer's `#` picker
(suggested topics, the distinct-hashtags read); the board's total-count +
"Top 10" ranking rail; comment-hashtag aggregation; marketing-ui's board
(it has `/trending` — a `/tag` equivalent there is a marketing bite); the
share-preview hashtag emphasis (today the OG card carries the prose as-is,
which is honest).

**Local verification:** `screenshots/hashtags.mjs` boots/stops its own isolated
Vite harness, drives full/light/inline/comment-renderer links, real browser
history/reload, empty-topic composer prefill and loading/error states in both
themes at 375/768/1280/1440px. Captures and the eight-case receipt live under
`.context/hashtags/`. The fixture replaces data reads; it is not connected
ClickHouse, authorization, live publishing, physical-phone or deployment proof.
Focused unit tests exercise actual create/edit derivation, public-group query
construction, stable cursor forwarding, nested comment navigation, topic/search
filters, reaction rollback and stale-topic suppression.

**KB:** `social/rich-text.md` (the model the hashtag plugs into — the
markdown-under-the-hood, the locked render, the write derivation),
`social/post-render.md` (the render matrix — the board's row),
`social/ads.md` (the reserved-tag guard the hashtag must not touch),
`web10-v3/db/clickhouse.md` + `sdk/implementation.md` (the D73 boundary CTE
the board query runs inside).
