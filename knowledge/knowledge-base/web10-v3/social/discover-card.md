# The Shared Discover Card

The discover card — the ranked post card with the video, the engagement bar, the comments, the rank badge, and the heat glow — is **one shared component** consumed by both `web10-social` and `marketing-ui` (D74). One source, two apps: the discover feature is the same on both, so it can't drift.

## Why shared

The two discover surfaces had drifted into independent implementations — the marketing `TrendingCard`/`YouTubeCard` vs the social `DiscoverCard`/`DiscoverYouTubeCard`. Duplicated card chrome, a divergent video path (the marketing card played the **raw source file** — HEVC/AV1 — that mobile Chrome can't decode → the greyed-out tile), a divergent engagement bar. Copying one piece (just the player) would have added a fourth divergent copy instead of fixing the drift. A shared source package makes "the discover is the same on both" structurally true.

## Where it lives

`marketing/shared/discover/` — a **source** package (no build step). `main`/`exports` point at `src/index.ts`. It is consumed by both apps via a `file:` dependency + a Vite alias to the package source (compiled as app code, not pre-bundled).

The package is **presentational only** — it owns the card + its presentational deps, all self-contained (plain HTML + the shared design tokens, no radix/cva):

| Module | What it is |
|---|---|
| `DiscoverCard` | The card: rank + time, author row, media, tags, engagement bar. |
| `HomeCard` | The Home view's card — the YouTube-style video tile (16:9 thumbnail, a truncated title, the author's attribution). |
| `VideoPlayer` / `HlsVideoPlayer` / `MediaCarousel` | The player (the "no surface owns a `<video>`" rule — `video-player.md`). |
| `PostActions` / `CommentThread` | The engagement bar + the comment thread (`post-actions.md`). |
| `RankBadge` / `heatTier` / `HEAT_SHADOW` | The rank badge (#1 gold, #2-3 silver, #4+ brand) + the tiered heat glow. |
| `types.ts` | `DiscoverPost`, `MediaItem`, `TranscodingSettings`, `CommentItem`, `ReadComments`, `CreateComment`. |

## The data seam is injected

The package knows **nothing** about wapi or the public ledger. The data layer is injected:

- `readComments(postId, groups?)` — the comment reader.
- `createComment({ postId, text, ... })` — the comment writer (absent in `remote` mode).
- `onToggleReaction(kind)` — the like/dislike writer (interactive mode).
- `onAuthorClick()` — the author navigation (interactive mode).

The social app injects its wapi-backed data; the marketing injects its public-ledger reader. This is what lets one card run on both apps' data.

## Two modes

| | `interactive` (web10-social) | `remote` (marketing-ui) |
|---|---|---|
| Context | Logged in | Anon (no session) |
| Like | Tappable (optimistic toggle) | Display-only (a count — an anon visitor can't like) |
| Comment | Compose box (writes via the data seam) | **Link-out to the post permalink** |
| Author | Click → in-app profile navigation | **Link-out to web10 social** |
| Post text | Plain | **Link-out to the post permalink** |
| Read side (video, counts, comment list, rank, glow) | **Identical** | **Identical** |

The read side is identical in both modes — "see comments on both." The write affordances become link-outs in `remote` mode because there's no session to write with.

## The ad slot (and the post-format ad's own card)

The card's `renderAd?: (ad: DiscoverAd) => ReactNode` seam (absent in
`remote` mode → no ads) renders the post's attached ads in the card's ad slot
(between the media and the engagement bar): the creator's pinned ad
(`post.ad`) + the node's ad (`post.node_ad`), each per its `format`. The social
app injects its `AttachedAd` (inline → the compact `AdBlock`, post → the
`PostAdCard`'s attached variant).

**`post`-format ads are skipped by the card's slot** — they render as their
**own card in the stream, next in line after the post** (the screen inserts
them; `ads.md` "Two Formats"). Nothing indicates the pin — the badge +
disclosure are the only dressing. The card only ever renders the inline
format in its slot.

**The board read drops ad docs (the every-surface rule).** The card renders
what its screen's read hands it — and the discover group *holds* the node ad
docs (tagged `ad` + `node_ad`). So each app's board read filters them out of
the standalone list before the cards ever see them: the social app's
`readDiscoverFeed` (`dropAdPosts`) and the marketing `/trending` read + search
(`dropAdDocs`, `FeedPreview.tsx`). Without the filter, a node ad doc renders as
a plain ranked tile/card on the board (the 25.09.2026 leak — `#ad #node_ad`
docs ranked #1/#2 on the marketing Home wall). Full rule: `ads.md` "The
every-surface rule".

## The video: transcoded HLS, not the raw file

The card plays the **transcoded HLS** (H.264/AAC) via `sourceFromMedia` — the same rule `video-player.md` specs: a video with `transcoding_settings.status === 'done'` + a minted `manifest_url` plays through hls.js (native HLS on Safari); anything else (processing/failed/absent) plays the direct file.

This is the greyed-out-tile fix: the **raw source file** (`read_url`) is the user's original camera upload — typically HEVC/AV1, which mobile Chrome (Pixel 9) can't decode. The transcoded HLS is universally decodable. The node mints `manifest_url` into the resolved media ref on every read (`_mint_hls_manifest_urls`), so the card picks the HLS path with zero extra reads.

## The wall's loading model: paint on the one read, enrich in the background

The Video wall's first paint is **one round-trip** — the board read. The node's read path returns every post's `media_refs` **pre-resolved** (presigned `thumbnail_url` + `read_url` + dimensions + HLS settings on each ref object), so `loadDiscover` builds the media map synchronously from those inline refs and paints the grid immediately: the thumbnails are in the first render, no grey window, no second media round-trip.

Everything the grid needs beyond the one read — the engagement tallies, the authors' faces (display name + avatar), and the string-ref media fallback (write-path reads that carry bare doc_ids instead of resolved objects) — loads **in the background, in parallel**, and patches the grid in. The card re-renders from the same maps, so the wall fills in: counts, avatars, display names.

This is the "best of both worlds" the operator asked for (06.10.2026): **fast loading** (instant thumbnails from the one read) **and** **hover-to-play** (the `HoverVideo` preview attaches lazily on first hover — a wall of cards does not mint N players at rest; touch devices get the scroll-dwell analog). It supersedes the 3.210.1 "paint only after media resolves" move, which traded the grey window for a wall that waited on the per-author profile fan-out + a second media round-trip before a single thumbnail could paint. The profile fan-out is now a single parallel batch (was a serial per-author await — N distinct authors = N sequential round-trips).

The `HoverVideo` preview itself is already lazy: the poster is the resting face, the video source attaches on first hover (desktop) or first touch-dwell (mobile), and at most one tile plays at a time (the module-level coordinator elects the most visible eligible tile). So a wall of a ton of videos costs one thumbnail image per tile at rest, and one preview player only for the tile the pointer/finger is on.

**The doctrine is cross-surface, not Video-wall-only.** Every content surface paints on its one read and enriches in the background: the Video wall (this section), the Shorts wall (3.220.0), the Watch page (3.221.0), the Profile (3.223.0 — the owner/visitor `loadData` paints after the one read; the collections + counts + face media patch in), and the **People tab** (3.224.0 — `fetchPeoplePage` is the BASE read, the D0 directory + the reader's following set for `is_following` in one round-trip; the per-card face media `enrichPeopleFaces` + the "N mutuals" badge `enrichPeopleMutuals` — an N-way `getGroupMembers` fan-out, one per person — enrich in the background and patch the list in). The anti-pattern this doctrine kills: holding a surface's first paint behind a fan-out (serial `for…await`, or a parallel `Promise.all(items.map(async () => await read))` baked into the base read's return) or a redundant second media round-trip. The `paint-on-read` lane in `parallel-execution.md` tracks the remaining surfaces (DmsScreen, the Shorts lens, FeedScreen, GroupDetailScreen).

 ## The Home view is landscape-videos-only (the default view)
 
 The discover / trending surface has two views, toggled by `?view=`: **Home** (the default, the bare URL) and **Hot Gossip** (`?view=grid`, the ranked post board). The operator: *"video view should be first, hot gossip second, to compete. video should be renamed home view."*
 
 **Home** is the YouTube-style video wall — the card that competes pound-for-pound with YouTube's home page. It shows **landscape videos only** (photos don't belong, and portrait (9:16) videos are **shorts** — they live in the Shorts destination, the TikTok shape, not the YouTube-shaped wall; the operator: "it is really disorienting to be ripped out of video view without any indication", and YouTube keeps the two separate). The filter is the render-time gate: a post is a wall video if it's tagged `video` OR its first resolved media is a video (`mime_type` starts with `video/`), **AND** it is not portrait (`width < height` on the resolved media — the same 9:16 signal Shorts' render-time backstop uses, re-derived rather than trusting the client-asserted tag).

The Home card is the shared **`HomeCard`** (one source, both apps), the "less brainrot" YouTube shape:
1. a **16:9 thumbnail** (the video's `thumbnail_url` / first frame, `object-cover` — fills the frame, never letterboxes) with a play affordance + a duration badge. For a video, the thumbnail is the **hover preview** (`HoverVideo`, 3.164.0): the poster at rest, the clip playing **muted on hover** with a **top-right speaker toggle** + a **bottom scrubber** (the YouTube home behavior — `video-player.md` "The hover preview"). The video overlays the poster (both `absolute inset-0` — the same box, stacked, so the video is never pushed off-screen below the poster) and reveals only once it is actually **playing** (the poster stays the backdrop, so the tile never flashes gray); un-muting is audible; the scrubber **seeks on click** (a click anywhere on the track jumps to that position). The **duration badge** (bottom-right) is a **live time-lapse** (3.166.4): the clip's total length at rest, the **elapsed** position counting up while the preview plays, back to the total on leave (`video-player.md` "The duration badge is a live time-lapse"). The speaker + scrubber are controls, not the card link — they `stopPropagation` **and** `preventDefault`, so a click on them never navigates the tile (the "clicking the speaker opens a new tab" bug). The frame is otherwise inert (the `<a>` owns the click: hover plays, click navigates); a touch device never fires `mouseenter`, so the preview runs on the **scroll-dwell** path instead (3.203.0 — the finger stops over a ≥60%-visible tile, the preview plays muted, one preview at a time).
2. the **title** — the post's `title` (D82) when present, else the post text (`text`) truncated to `HOME_TITLE_LIMIT` (80) chars with a trailing ellipsis (the "show it if it's short, else …" rule); the caption (`text`) is the card's body, shown under the title only when both exist and differ;
3. the **attribution** — the author's avatar + display name + a relative time.

In `interactive` mode (web10-social) the thumbnail + title navigate to the post's permalink and the author to their profile (in-app), plus a compact like/comment/repost engagement row. In `remote` mode (marketing-ui) they're link-outs to web10 social, no engagement row (an anon visitor can't react). The title is `text-base` (16px, the chunky YouTube scale). The Home wall is **full-width** (no `max-w` cap) so the thumbnails fill the viewport: the social Discover is **3-across on desktop** (`sm:grid-cols-2 lg:grid-cols-3` — "three fill the viewport", the operator's "GIGANTIC" call) and the marketing `/trending` is 3-across full-width.

## Consumption (the single-React requirement)

The package has **no node_modules of its own** — a second `react` would break the hooks dispatcher (the "two Reacts" bug). Its bare imports (`react`, `react-dom`, `lucide-react`, `clsx`, `tailwind-merge`) resolve to the **consuming app's** deps:

- **Vite** (runtime): the app's `vite.config` aliases `@web10/discover` to the package source + aliases the package's external deps to the app's `node_modules` (single instance).
- **tsc** (type-check): the app's `tsconfig` `paths` maps `@web10/discover` + the external deps to the app's `node_modules` (the `react`/`react-dom` types point at `@types/react`/`@types/react-dom`).

Both apps carry the alias + `paths` + the single-instance mappings. The `file:` dependency in each app's `package.json` keeps the package's own deps resolvable for the package's editor IntelliSense.

## What is NOT shared

The **screen** chrome is app-specific and stays in each app: the social `DiscoverScreen`'s chunky sticky **Posts | People** tab row (the primary nav — no separate "Discover" header; "People" is really people + groups, called People like Facebook's Friends tab), compact composer (single-line until focused), and profile map; the marketing `/trending` page's slim control row (search + Posts|People|Groups + Home|Hot Gossip), topic filter, and TOP-10 sidebar (**Hot Gossip only** — the Home wall is full-width with no rail). The shared package is the **card**, not the **screen**. (The knob rack is already a verbatim copy between the apps — if that drift becomes a problem, it's a natural follow-up to share, but the high-churn surface — the card — is now shared.)
