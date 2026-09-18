# Video player — the fix list (operator pass, 17.09.2026)

**Status: RESOLVED (3.111.0).** All three fixes are built + tested +
screenshot-verified; the KB (`video-player.md`, `shorts.md`) is updated. This
doc is the work order that produced the PR — kept for the record (the
operator asked that nothing get lost).

The operator ran the video surfaces (social feed, marketing `/trending`,
Shorts) and filed three critiques. This doc is the work order: every critique
verbatim, the verified root cause (with the evidence), the fix, and the
acceptance bar. One PR resolves all three — they share one component
(`marketing/shared/discover/`) and one root disease (the shared package's
CSS + layout props are only half-wired into the two apps).

> **The good reference** (operator: "this looks great!"): the Discover card's
> portrait video — capped to a square-ish frame, centered in a black
> letterbox, full control rack reachable. Every surface below should read as
> that same product.

---

## Issue 1 — the feed's video player "still looks out of date"

**Surface:** social app, `/feed` (social.web10.app/feed)
**Operator (verbatim):** "feed the video player still looks out of date...."
**Screenshot:** `.context/attachments/c7ajXl/image.png` — a portrait (9:16)
video post in the feed renders as a **giant full-width box** (~1.78× the card
width tall): the clip fills the viewport edge to edge, the card header is
buried above the fold, and the control rack sits at the bottom of a box that
is taller than the screen.

### Root cause (verified)

`FeedScreen.tsx:103-113` (`MediaItem`) passes `maxHeight="60vh"` to
`<VideoPlayer>` — the feed's 3.34.0 cap ("a portrait clip can't blow up the
card"). But `VideoPlayer` (**`marketing/shared/discover/src/VideoPlayer.tsx`**)
only forwards `maxHeight` to the **file** path (`InlineVideo`). The **hls**
path — `HlsVideoPlayer`, which is what **every transcoded upload** (the
default since 3.88.0) takes — never receives it:

```tsx
// VideoPlayer.tsx — the hls branch drops maxHeight
return (
  <HlsVideoPlayer
    manifestUrl={source.manifestUrl}
    poster={source.poster}
    width={source.width}
    height={source.height}
    className={className}
    maxWidth={maxWidth}        // ← maxWidth threaded, maxHeight NOT
  />
);
```

So a 9:16 clip in the feed reserves a full-width 9:16 box with **no cap**:
at a 700px card width that's a 1244px-tall box. The 3.105.0 "full-bleed"
redesign removed the phone column but silently dropped the height cap on the
hls path — the file path still honors it, which is why a raw (non-transcoded)
video looks fine and a transcoded one looks broken. The KB's own surface map
says the feed is "natural (**≤60vh**), full-bleed" — the cap is the
intended behavior; the hls path just lost it.

The same dropped prop hits `GroupDetailScreen.tsx:105` (groups feed,
`maxHeight="60vh"`).

### Fix

Thread `maxHeight` from `<VideoPlayer>` into `HlsVideoPlayer` and apply it to
the frame div (the one that reserves `aspectRatio`). For a portrait clip
(`width < height`) the height cap forces the width to shrink
(`width = height × ratio`); center the frame (`mx-auto`) in the full-width
black letterbox — the same shape the `maxWidth` cap already produces, so a
capped feed video looks like the Discover card the operator approved.
Landscape clips (ratio ≥ 1) at a 60vh cap are already shorter than
full-width, so the cap is a no-op for them — no centering needed, no visual
change.

### Acceptance bar

- A 9:16 post in the feed renders at ≤60vh tall, centered in a black
  letterbox, whole clip + rack in view (the "this looks great" reference).
- A 16:9 post in the feed is unchanged (full-width 16:9).
- The groups feed (`GroupDetailScreen`) gets the same cap for free.
- `hlsVideoPlayer.test.tsx` + pins: `maxHeight` on a portrait reserves the
  ratio AND caps the height + centers; landscape unaffected.

---

## Issue 2 — marketing `/trending`: "the controls straight up dont show"

**Surface:** marketing site, `/trending` (web10.app/trending)
**Operator (verbatim):** "on the marketing page not on social media looks
great and consistent too, but the controls straight up dont show, i can click
it to pause and play but that is it on marketing discover, should be the same
where you can see the controls on the vid....."
**Screenshot:** `.context/attachments/tT1qRi/image.png` — the video plays
(tap toggles), but no control rack appears.

### Root cause (verified by building the app)

Both apps render the **same** shared `HlsVideoPlayer` — the rack markup is
identical. The difference is **CSS**: Tailwind v4's automatic content
detection scans each app's own directory, and the shared package lives
**outside** it (`marketing/shared/discover/src/` is a sibling of
`marketing/marketing-ui/`, reached only through the Vite alias). Classes that
appear **only** in the shared package are never generated for the app that
doesn't use them elsewhere.

Built `marketing-ui` and grepped the shipped CSS:

| Class (the rack) | marketing-ui CSS | web10-social CSS |
|---|---|---|
| `inset-x-0` (rack position) | **missing** | present (used in social's own src) |
| `bottom-0` (rack position) | **missing** | present |
| `from-black/80` (gradient scrim) | **missing** | **missing** |
| `bg-black/85` (RackMenu popover) | **missing** | **missing** |
| `bg-white/10` (icon hover) | **missing** | **missing** |
| `pt-8` (rack top padding) | **missing** | **missing** |
| `min-w-20`, `border-white/10` (popover) | **missing** | **missing** |
| `accent-brand` (volume slider) | **missing** | present |

In the marketing app the rack container (`absolute inset-x-0 bottom-0 …`)
loses its **positioning** classes entirely: an `absolute` element with no
inset utilities sits at its static position with no width — the rack is
there in the DOM but rendered as a collapsed, unpositioned sliver. Hence
"i can click it to pause and play but that is it" — the `<video>`'s own
click handler works; the rack is invisible. In the social app the positioning
classes happen to be used by social's own components, so the rack lands —
but it still ships **without** the gradient scrim, the icon hover, and the
popover styling (the "looks out of date" half of Issue 1's feed screenshot:
icons floating on the video with no dark backdrop behind them).

### Fix

Explicit `@source` in each app's Tailwind entry CSS (Tailwind v4's
mechanism for "also scan this directory"), pointing at the shared package:

```css
/* marketing/marketing-ui/src/index.css + marketing/web10-social/src/index.css */
@source "../../shared/discover/src";
```

One line per app; the shared package's classes are now generated in **both**
builds, now and for every future class added to the package (no per-class
chasing). Verify by rebuilding + grepping the shipped CSS for
`inset-x-0` / `from-black/80` / `bg-black/85` in **both** apps.

### Acceptance bar

- Hovering a `/trending` video shows the full rack (scrubber · play/pause ·
  mute · volume · time · speed · quality · fullscreen) with the gradient
  scrim — identical to the social app.
- The RackMenu popovers (speed/quality) render styled (bg, border, min-width)
  on both apps.
- Shipped CSS of **both** apps contains the rack classes (build + grep).

---

## Issue 3 — Shorts: "muted default, no way to hear the video"

**Surface:** social app, `/shorts` (the TikTok view)
**Operator (verbatim):** "tik tok view looks great but muted default, should
he a mute unmute speaker icon, no way to hear the video"
**Screenshot:** `.context/attachments/8kYlK7/image.png` — the full-screen
vertical short, action rail (like/comment/share), no sound control anywhere.

### Root cause (verified)

The immersive player hardcodes mute:

- `ImmersiveHls` (`VideoPlayer.tsx`): `<video muted autoPlay loop …>` — the
  `muted` attribute is unconditional.
- `InlineVideo` (file source, `immersive`): `muted={!playing}` — muted
  whenever not playing.

Muted-by-default is **correct** (the browser autoplay policy requires it —
the KB's `shorts.md` playback spec: "the active slide autoplays muted").
What's missing is the **escape hatch**: TikTok/Reels/YouTube-Shorts all ship
a speaker toggle so a user who wants sound can get it.

### Fix (the TikTok model)

- **Screen-level mute state** in `ShortsScreen` (not per-video): muted by
  default; one toggle un-mutes **all** shorts for the session (TikTok
  remembers the choice while you're in the lens).
- **The speaker icon** on the action rail (top item, above the heart — the
  TikTok position): `VolumeX` when muted, `Volume2` when unmuted.
- **The seam:** `<VideoPlayer immersive>` gains a `muted` prop (default
  `true` — every existing consumer is unchanged); `ImmersiveHls` +
  `InlineVideo` apply it to the `<video>` (`el.muted`) instead of the
  hardcoded attribute. A user gesture (the tap) satisfies the autoplay
  policy for audio, so unmuting mid-play is allowed.
- Persist the choice for the session (a module-level flag is enough —
  TikTok's behavior is per-lens-session, not per-browser).

### Acceptance bar

- Shorts open muted (autoplay works, no policy violation).
- Tapping the speaker icon un-mutes the active short **and** subsequent
  shorts; tapping again re-mutes.
- The icon reflects state (`VolumeX` ↔ `Volume2`), has an `aria-label`,
  and `stopPropagation` (the tap never toggles play/pause).
- `shortsScreen.test.tsx` + pins: the icon exists, toggles the video's
  `muted`, and the state carries to the next slide.

---

## The shared root disease (why one PR)

All three issues are the same gap from three angles: **the shared
`@web10/discover` package is only half-integrated into its two apps.**

1. **CSS** — Tailwind v4 doesn't scan the package → rack classes missing
   (Issue 2 fully, Issue 1's "out of date" look partially).
2. **Layout props** — `VideoPlayer` accepts `maxHeight` but drops it on the
   hls path (Issue 1).
3. **Behavior seams** — the immersive player has no mute seam (Issue 3).

The package is the single source (D73/D74 — "one card, one player, both
apps"); the integration seams around it are what drifted. This PR closes all
three seams in the package + the two app entry points.

## Files touched

| File | Change |
|---|---|
| `marketing/shared/discover/src/HlsVideoPlayer.tsx` | accept + apply `maxHeight` (portrait cap, centered letterbox) |
| `marketing/shared/discover/src/VideoPlayer.tsx` | thread `maxHeight` to the hls path; `muted` seam on `immersive` (`ImmersiveHls` + `InlineVideo`) |
| `marketing/marketing-ui/src/index.css` | `@source "../../shared/discover/src";` |
| `marketing/web10-social/src/index.css` | `@source "../../shared/discover/src";` |
| `marketing/web10-social/src/components/Shorts/ShortsScreen.tsx` | screen-level mute state + speaker icon on the rail + `muted` prop wiring |
| `marketing/web10-social/src/__tests__/hlsVideoPlayer.test.tsx` | `maxHeight` pins |
| `marketing/web10-social/src/__tests__/shortsScreen.test.tsx` | mute toggle pins |
| `marketing/marketing-ui/src/components/Trending.test.tsx` | (re-pin if the CSS change shifts assertions) |
| `knowledge/knowledge-base/web10-v3/social/video-player.md` | surface map: feed hls path is ≤60vh-capped; the `@source` integration note |
| `knowledge/knowledge-base/web10-v3/social/shorts.md` | playback spec: muted-by-default **+ the speaker toggle** (amends decision #6) |
| `knowledge/changelogs/CHANGELOG.md` | new entry |
| `knowledge/strategy/plan.md` + `parallel-execution.md` | tick the lane item |

## Gates

- [ ] `bun run test` green in `marketing/web10-social` (the full suite)
- [ ] `bun run test` green in `marketing/marketing-ui`
- [ ] `tsc --noEmit` clean in both apps
- [ ] `vite build` both apps; shipped CSS contains `inset-x-0`,
      `from-black/80`, `bg-black/85`, `accent-brand` in **both**
- [ ] Screenshots: feed (desktop + 375) with a portrait video ≤60vh;
      `/trending` rack visible; Shorts rail with the speaker icon
- [ ] PR → `dev`, conflicts resolved, **all** checks green (optional
      included — `UNSTABLE` is red)
