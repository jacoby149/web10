# Video Player — one shared surface for every video

The pipeline docs (`../media/transcoding.md`, `../media/streaming.md`) and the experience spec (`../media/video-experience.md`) decide what a video *is* on the wire: the ratio policy, the HLS renditions, the player's behavior (ABR, quality, speed, muted autoplay). This doc decides the one thing they do not: **how the web10-social client renders it.** Because that is where the slop was.

## The use case

A fan is scrolling. A video is in the stream. It should simply *be* — playing, in place, the way Reels and TikTok and Shorts do it — and it should not seize the screen and drag them out of the scroll. The creator posted a vertical clip; whether it appears in the feed, in Discover, or in a group, it should look like the same product. One video, one way of being rendered, everywhere it shows.

That is the whole goal. Everything below is in service of it.

## The problem: N copies, already drifting

The client did not have one way to render a video. It had several, copy-pasted, and they had already gone their separate ways:

| Copy | Where | Fit | Tap behavior |
|---|---|---|---|
| `MediaItem` video branch | Feed | `object-contain`, natural ratio | play/pause, **stops propagation** |
| `MediaVideo` | Discover grid | `object-cover`, uniform 16:9 | play/pause, **bubbles to the card → modal** |
| `PostMedia` | Groups | native `<controls>` | the browser's own player |

Three implementations of "an inline video you tap to play," and they disagreed on the one thing that matters: whether a tap on the video escapes to the card. Discover's did not stop propagation, so tapping the video both played it *and* opened the `PostLightbox` modal — the yank-out-of-the-scroll. The feed's copy had the fix; Discover's had drift; Groups had given up and used the browser's native controls.

The `HlsVideoPlayer` (the full control rack) was, to its credit, already shared between the feed and the lightbox. The slop was the *inline* path — the tap-to-play `<video>` — which is ninety percent of social video and which was triplicated.

## The rule

> **No surface owns a `<video>` element. Every surface composes `<VideoPlayer>`.**

That single rule is what kills the drift. A surface says *what* it wants — a source, a mode, a fit, a ratio — and does not say *how* the pixels get there. When the inline tap-to-play logic changes, it changes in one place, and every surface gets it at once.

## The component: two axes

`<VideoPlayer>` is factored along the two axes that actually vary. Not one mega-component with an `if` for everything, and not N copies — one thin component that picks a **source renderer** and a **control surface**, then delegates.

```mermaid
flowchart LR
    S["<VideoPlayer …/>"] -->|source| SRC{"source type"}
    SRC -->|hls| HR["HlsSource<br/>hls.js / native HLS"]
    SRC -->|file| FR["FileSource<br/>native &lt;video&gt;"]
    SRC -->|youtube| YR["YouTubeSource<br/>&lt;iframe&gt; — Shorts"]
    S -->|mode| MODE{"mode"}
    MODE -->|inline| IC["InlineControls<br/>muted · loop · tap-to-play"]
    MODE -->|full| FC["FullControls<br/>scrubber · quality · speed · fullscreen"]
```

**Axis 1 — `source`** (where the bytes come from), a discriminated union:

| `source` | Renderer | Notes |
|---|---|---|
| `{ type: 'hls', manifestUrl }` | `HlsSource` | hls.js first, native HLS the Safari fallback (the `video-experience.md` rule). Transcoded posts (D44). |
| `{ type: 'file', url }` | `FileSource` | a direct `<video src>`. Non-transcoded posts, the import path's MP4s. |
| `{ type: 'youtube', id }` | `YouTubeSource` | an `<iframe>`. **This is the Shorts path** — adding YouTube is a new source case, not a new component. |

**Axis 2 — `mode`** (how it presents):

| `mode` | Control surface | Behavior |
|---|---|---|
| `inline` | `InlineControls` | muted, loop, tap-to-play/pause, minimal overlay, duration badge. The feed / Discover / Groups behavior. |
| `full` | `FullControls` | the current `HlsVideoPlayer` rack: scrubber, quality, speed, volume, fullscreen. The lightbox / "watch" behavior. |

**The rack's visibility (auto-hide + pointer hold).** The `full` rack overlays the video (not a bar below it) and auto-hides ~2.5s after the video is playing + idle, so the feed stays media-forward; it returns on hover and stays up while paused. The hide must never fire while the pointer is **over the player** — the rack is held visible for as long as the pointer is in the frame, independent of the idle timer. The same auto-hide + pointer-hold governs the file path's rack (`InlineVideo`, 3.102.0): a direct-file video shows the identical rack while playing, so the hls and file paths are visually consistent.

**The rack is one designed surface, not a native `<select>`.** The speed + quality controls are a small `RackMenu` (an icon button + a popover of options), not a native `<select>` — the native select is OS-styled (a lopsided, non-token widget) and breaks the flagship bar. The rack is a single row: scrubber on top, then play/pause · mute · volume · time on the left and speed · quality · fullscreen on the right — no text labels, even spacing, token colors only. **The two menus carry distinct glyphs** (3.103.0): speed is a speedometer (`Gauge`), quality is a screen (`MonitorPlay`) — the old bug was both being `Gauge`, so a user saw two identical dials and couldn't tell "speed" from "resolution." **A mid-playback quality switch must not stall the video** (3.103.0): picking a level re-buffers the new rendition's segments, and if the current buffer drains before the new level's first segment lands the `<video>` stalls and never resumes on its own — the player nudges it (resume if it was playing + re-arm `hls.startLoad()` if `autoStartLoad` is disengaged).

Plus three layout props: `fit` (`contain` — never crops, letterboxes; `cover` — fills the frame, crops), `ratio` (or `width`/`height`), and `immersive` (default `false`). **The frame is full-bleed** (3.102.0): the player reserves the source ratio and the video fills the card width (`object-contain`) — a portrait clip is a tall full-width box, landscape is full-width 16:9. There is no phone-width column and no letterbox gutter: the black bars (for a portrait clip in a wide card) are the video's own background, not a `bg-elevated` frame. This is what makes a 9:16 clip on Discover look like the same product as one in the feed and on the marketing `/trending` page — full size, no borders.

**`maxWidth` — cap a portrait frame (3.103.0, the Discover cap 3.105.3).** Full-bleed is right for a wide, media-forward surface, but a 9:16 clip in a *bounded card* reserves a box ~1.78× the frame width tall — in the lightbox modal that's ~1.78× the viewport tall (clipped, the control rack stranded off-screen at its bottom), and in a card (the social Discover board, the marketing `/trending` wall) it dwarfs the card and buries the rack. A surface that owns a bounded frame passes `maxWidth` (e.g. `min(50vh, 100%)`) for a portrait clip (`width < height`); the player caps the frame to that width and centers it (`mx-auto`) in a full-width black letterbox, so the whole clip + the rack stay in view. The cap is width-based on purpose: for a portrait clip, capping the width is what forces the (taller) height to shrink into the frame. Landscape clips are never capped (only portrait is "too tall"). The lightbox (`PostLightbox`), the social Discover card (board + video view, 3.105.3 — "too big on desktop, make it consistent"), and the marketing `TrendingCard` all set it, so a 9:16 clip looks the same in every card surface; the following Feed leaves it unset (full-bleed). The pointer-hold handlers live on the player's outer box (not the capped frame), so reaching across the letterbox border never hides the rack mid-reach.

**`maxHeight` — the feed's portrait cap (3.34.0, restored on the hls path in 3.111.0).** The feed is a single-column stream, not a card wall — full-bleed is right, but a 9:16 clip at full card width is ~1.78× the card tall, which buries the control rack below the fold. The feed passes `maxHeight="60vh"`; for a portrait clip the player caps the frame's height and centers the shrunken frame (`mx-auto`) in the full-width black letterbox — the same shape the `maxWidth` cap produces (the feed's portrait video reads as the same product as the Discover card's). Landscape clips are unaffected: at full width they're already shorter than the cap, so the cap is a no-op. **The hls path used to drop the prop** (3.105.0's full-bleed redesign threaded `maxWidth` to `HlsVideoPlayer` but not `maxHeight`), so a transcoded portrait clip — the default for every upload — rendered as a giant full-width box while a raw (file-path) clip honored the cap. 3.111.0 threads it; the cap now holds on both source paths.

**`immersive` — the video fills the frame the surface gives it.** Off (the default), the player reserves its own box (the source's ratio, or the `ratio` prop) and the surface sizes it. On, the player takes the size of its parent frame and the `<video>` fills it (`absolute inset-0 w-full h-full object-cover`): no own aspect-ratio, no phone-width column, and — for the `hls` source — **video only, no control rack** (the scrubber/quality/speed/fullscreen rack is the `mode="full"`/lightbox surface; on an immersive slide it would collide with the overlay chrome the surface draws on top). The surface that owns the frame is `ShortsScreen` (the slide IS the 9:16 frame — see `shorts.md`); the prop is what lets the one shared player serve it without a second `<video>` implementation.

**The `muted` seam (3.111.0, the Shorts sound toggle).** Immersive is muted by default — the browser's autoplay policy requires it for the ambient loop. A surface that owns the sound choice passes `muted={false}` (the Shorts speaker icon, `shorts.md` decision #7): the `<video>` follows the prop on mount + on every flip (a toggle while paused takes effect on the next play). The non-immersive paths are untouched (the feed's mute follows play state, as before).

**The package is CSS-scanned by each app (3.111.0).** The shared package lives *outside* each app's directory (`marketing/shared/discover/` is a sibling of the two apps, reached only through the Vite alias), so Tailwind v4's automatic content detection never scans it — any class that appears *only* in the package (the rack's `inset-x-0`/`bottom-0` positioning, the gradient scrim, the `RackMenu` popover, the volume slider) is missing from a build that doesn't use it elsewhere. The symptom was surface-specific: the marketing `/trending` rack rendered unpositioned + invisible (its positioning classes were absent from that build), while the social app's rack landed (its own components happened to use the same classes) but shipped unstyled (no scrim, no hover, no popover). Each app's entry CSS carries an explicit `@source "../../shared/discover/src";` — the classes are generated in both builds, now and for every future class added to the package.

A surface is therefore a one-liner:

```
Feed:      <VideoPlayer source={hlsOrFile} mode="inline" fit="contain" />   (hls → mode="full")
Discover:  <VideoPlayer source={hlsOrFile} mode="inline" fit="contain" />   (hls → mode="full"; full-bleed, rack on both paths, 3.102.0)
Groups:    <VideoPlayer source={file}      mode="inline" fit="contain" />
Lightbox:  <VideoPlayer source={hlsOrFile} mode="full" />
Shorts:    <VideoPlayer source={hlsOrFile} mode="inline" fit="cover"  immersive />
```

## The two modalities (where, not how)

The modal question is orthogonal to the rendering question. *Where* a video is shown decides the modality; the `<VideoPlayer>` decides *how* it renders. The two compose:

```mermaid
flowchart TD
    V["a video post"] --> Ctx{"where is it shown?"}
    Ctx -->|"in a stream<br/>Feed / Discover / Groups"| Inline["INLINE modality<br/>&lt;VideoPlayer mode=inline&gt;<br/>plays in place, no modal"]
    Ctx -->|"in a gallery<br/>Profile grid / deep-link"| Modal["MODAL modality<br/>grid cell = static poster<br/>tap → lightbox, mode=full"]
```

- **Inline modality** — the surface is a *stream* (Feed, Discover, Groups). The video plays in place. No modal. Comments expand inline in the card (`CommentThread`, the feed's existing pattern), not in a lightbox.
- **Modal modality** — the surface is a *gallery* (the Profile grid, the deep-link). The grid cell is a static poster; tapping it opens the `PostLightbox`, which renders `<VideoPlayer mode="full">`.

The deep-link (`/u/:username/p/:postId`) is the modal modality — it opens over the profile, so it stays a modal. Consistent.

The invariant that makes the inline modality feel right: **in `inline` mode, a tap on the video must never reach the card.** The card's job is navigation and comments; the video's job is playback. `stopPropagation` on the inline control surface, always. This is the bug Discover had and the feed already fixed — it becomes a property of the component, not a per-surface discipline.

## Trace: a 9:16 clip in Discover

1. The read carries the media doc's `transcoding_settings` plus a per-reader `manifest_url` (the 3.34.0 data-layer work).
2. `DiscoverCard` renders the single video through `DiscoverVideo` → `<VideoPlayer source={{type:'hls', manifestUrl}} mode="full" fit="contain">` (a direct-file clip takes `mode="inline"` instead — same rack, 3.102.0).
3. The player reserves the source ratio (9:16) and fills the card width (`object-contain`, full-bleed — no phone column, no letterbox gutter); the poster shows; the tall 9:16 box holds its place (no layout shift).
4. The fan taps: it plays muted and looping, in place; the control rack (scrubber · play/pause · mute · time · speed · quality · fullscreen) reveals on hover and auto-hides while playing + idle. Tapping again pauses. The tap never reaches the card.
5. The fan taps the comment count: `CommentThread` drops open below the media, inline. No modal, no yank. The scroll is intact.

## Surface map

| Surface | Source | Mode | Fit | Ratio | Modality |
|---|---|---|---|---|---|
| Feed | hls \| file | inline (hls = full) | contain | natural (≤60vh), full-bleed | inline |
| Discover grid | hls \| file | inline (hls = full) | contain | natural; **portrait capped** (`maxWidth`, 3.105.3) | inline |
| Discover / trending "Video" view | hls \| file | inline (hls = full) | contain | natural; **portrait capped** (`maxWidth`, 3.105.3) | inline |
| **Home wall tile (the hover preview)** | hls \| file | **hover** (poster at rest, muted autoplay on hover) | cover | **16:9** (the tile) | **hover** (the `HomeCard` thumbnail) |
| Marketing `/trending` card | hls \| file | inline (hls = full) | contain | natural; **portrait capped** (`maxWidth`, 3.103.0) | inline |
| Groups | file | inline | contain | natural | inline |
| Profile grid cell | — (static poster) | — | — | — | modal (cell → lightbox) |
| Lightbox / deep-link | hls \| file | full | contain | natural; **portrait capped** (`maxWidth`, 3.103.0) | modal |
| Shorts slide | hls \| file | inline | cover | the slide's frame (9:16, `immersive`) | immersive (the swipe surface, `shorts.md`) |

**The hover preview (the `HomeCard`'s 16:9 tile, 3.163.0).** The Home wall's tile is the one surface that plays on *hover*, not tap — the YouTube home behavior (the operator, 25.09.2026: "when you hover on youtube, the video starts playing … even has that nice audio icon in the top right to toggle volume"). The shared `HoverVideo` (`@web10/discover`) renders the tile's poster at rest; when the pointer **enters** (a hover-capable device — touch never fires `mouseenter`, so a phone keeps the static thumbnail + the tap navigates) the video starts playing **muted** (the autoplay policy), `object-cover` in the same 16:9 frame, and a **speaker icon (top-right)** toggles the sound (the user's explicit gesture, so un-muted playback is allowed). When the pointer **leaves**, playback stops and the poster returns. The source follows the same rule as every other surface (`sourceFromMedia`: transcoded → hls.js, else the direct file) and attaches **lazily on first hover** — a wall of cards does not mint/attach N players at rest. The frame is **inert to the pointer**: the card's `<a>` (the post's permalink) owns the click — hovering plays, clicking navigates. A failed attach (an undecodable codec, an expired sig) degrades to the poster; the tile still works as a link. The play affordance + the duration badge are `pointer-events-none` (decorative) so they never sit over the `HoverVideo` and steal its `mouseenter`.

**The control rack is on every inline video, both source paths** (3.102.0): the hls path (`HlsVideoPlayer`) and the file path (`InlineVideo`) render the same overlaid rack (scrubber · play/pause · mute · volume · time · speed · quality · fullscreen), auto-hiding while playing + idle. The file path's rack appears while playing (the tap-to-play surface reveals it); the hls path's is visible on mount + hover. This is the "both have video controls" consistency — a discover video looks and behaves the same whether it's transcoded (hls) or a direct file, and the same on web10-social and the marketing `/trending` page (one shared card).

## What this is not

- **Not a rewrite of the player.** `HlsVideoPlayer` is kept as-is and is the `hls` source renderer — `<VideoPlayer>` delegates to it for transcoded video (it is the full-rack implementation). The behavior is preserved; only *when* it's used moves (the surface says `source={{type:'hls'}}`, the component picks the player).
- **Not the immersive vertical feed.** The full-screen swipe-between-posts surface is specified in `shorts.md` — it composes the same `<VideoPlayer mode="inline">`, and the swipe container is its own thing.
- **Not a change to the node.** The ratio policy, the renditions, the manifest minting — all untouched. This is client-side only.

## Open questions

Decided and built: the two modalities; the one-component / two-axes shape; the inline `stopPropagation` invariant; the Discover fix (inline video plus inline `CommentThread`, no lightbox); the Discover YouTube view (web10 video posts render inline in the 16:9 tile — the TikTok/Shorts wall, no lightbox); Groups (unified to `<VideoPlayer mode="inline">`); **multi-media posts** (the shared `MediaCarousel` — a fixed frame + scroll-snap strip of all the post's media + a `1/N` position indicator where the old dead count badge was; video slides render through `<VideoPlayer fill>`, image slides through `<img>`; composed by both the feed's `MediaGrid` and Discover's card).

Still open:

- **Real YouTube embeds (Shorts)** — the `youtube` source case (an `<iframe>`) is wired into `<VideoPlayer>` but no surface uses it yet. Landing it is a data-model question first (how a post references an external YouTube id) before a rendering one.

## Reference

- The player *spec* (ABR, quality, speed, muted autoplay, hls.js-first, the ratio policy): `../media/video-experience.md`
- The model + document shape (`transcoding_settings`, variants): `../media/transcoding-foundation.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
- The current full-rack implementation (becomes `FullControls`): `../../../../marketing/web10-social/src/components/Feed/HlsVideoPlayer.tsx`
- The inline comment pattern the inline modality reuses: `../../../../marketing/web10-social/src/components/Feed/CommentThread.tsx`
- The shared multi-media carousel: `../../../../marketing/web10-social/src/components/Feed/MediaCarousel.tsx`
