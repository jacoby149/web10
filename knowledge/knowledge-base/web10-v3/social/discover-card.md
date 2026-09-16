# The Shared Discover Card

The discover card — the ranked post card with the video, the engagement bar, the comments, the rank badge, and the heat glow — is **one shared component** consumed by both `web10-social` and `marketing-ui` (D73). One source, two apps: the discover feature is the same on both, so it can't drift.

## Why shared

The two discover surfaces had drifted into independent implementations — the marketing `TrendingCard`/`YouTubeCard` vs the social `DiscoverCard`/`DiscoverYouTubeCard`. Duplicated card chrome, a divergent video path (the marketing card played the **raw source file** — HEVC/AV1 — that mobile Chrome can't decode → the greyed-out tile), a divergent engagement bar. Copying one piece (just the player) would have added a fourth divergent copy instead of fixing the drift. A shared source package makes "the discover is the same on both" structurally true.

## Where it lives

`marketing/shared/discover/` — a **source** package (no build step). `main`/`exports` point at `src/index.ts`. It is consumed by both apps via a `file:` dependency + a Vite alias to the package source (compiled as app code, not pre-bundled).

The package is **presentational only** — it owns the card + its presentational deps, all self-contained (plain HTML + the shared design tokens, no radix/cva):

| Module | What it is |
|---|---|
| `DiscoverCard` | The card: rank + time, author row, media, tags, engagement bar. |
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

## The video: transcoded HLS, not the raw file

The card plays the **transcoded HLS** (H.264/AAC) via `sourceFromMedia` — the same rule `video-player.md` specs: a video with `transcoding_settings.status === 'done'` + a minted `manifest_url` plays through hls.js (native HLS on Safari); anything else (processing/failed/absent) plays the direct file.

This is the greyed-out-tile fix: the **raw source file** (`read_url`) is the user's original camera upload — typically HEVC/AV1, which mobile Chrome (Pixel 9) can't decode. The transcoded HLS is universally decodable. The node mints `manifest_url` into the resolved media ref on every read (`_mint_hls_manifest_urls`), so the card picks the HLS path with zero extra reads.

## The video view is videos-only

The "Video" view (both apps) shows **videos only** — competing with YouTube, photos don't belong. The filter is the render-time gate: a post is a video if it's tagged `video` OR its first resolved media is a video (`mime_type` starts with `video/`) — not the client-asserted tag alone (a direct API caller can tag an image as a video; the gate drops it at render).

## Consumption (the single-React requirement)

The package has **no node_modules of its own** — a second `react` would break the hooks dispatcher (the "two Reacts" bug). Its bare imports (`react`, `react-dom`, `lucide-react`, `clsx`, `tailwind-merge`) resolve to the **consuming app's** deps:

- **Vite** (runtime): the app's `vite.config` aliases `@web10/discover` to the package source + aliases the package's external deps to the app's `node_modules` (single instance).
- **tsc** (type-check): the app's `tsconfig` `paths` maps `@web10/discover` + the external deps to the app's `node_modules` (the `react`/`react-dom` types point at `@types/react`/`@types/react-dom`).

Both apps carry the alias + `paths` + the single-instance mappings. The `file:` dependency in each app's `package.json` keeps the package's own deps resolvable for the package's editor IntelliSense.

## What is NOT shared

The **screen** chrome is app-specific and stays in each app: the social `DiscoverScreen`'s knob rack, suggested-users row, and profile map; the marketing `/trending` page's topic filter, search, and TOP-10 sidebar. The shared package is the **card**, not the **screen**. (The knob rack is already a verbatim copy between the apps — if that drift becomes a problem, it's a natural follow-up to share, but the high-churn surface — the card — is now shared.)
