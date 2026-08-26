# Video Experience

The pipeline docs (`transcoding.md`, `streaming.md`) spec the plumbing: upload → ffmpeg → HLS → signed segments → hls.js. This doc specs the **experience** — the part the plumbing doesn't decide on its own: what ratio a video gets, what the player does, and what the creator controls. The bar is the Reels/TikTok/Shorts bar, because web10-social is instagram-shaped.

## Aspect-Ratio Policy (the node)

The phone is the camera. Vertical is the default, not the edge case — and the node must not care which ratio arrives. The policy:

- **Target by height.** Renditions are named by height (360p / 720p / 1080p). The `HLS_RENDITIONS` spec (`640x360@1M,1280x720@3M,1920x1080@6M`) is **nominal** — the height is the target, the width is derived from the source ratio.
- **Preserve the source ratio.** A 1080x1920 (9:16) upload plans to 360x640 / 720x1280 / 1080x1920. A 1920x1080 (16:9) upload plans to 640x360 / 1280x720 / 1920x1080. A 1080x1350 (4:5) upload plans to 288x360 / 576x720 / 1080x1350. Forcing a fixed width (`scale=1280:720`) squashes a phone video into 16:9 — that is the bug this policy exists to forbid.
- **Never upscale.** A rendition taller than the source is dropped (upscaling is pure waste — a 720p source gets 360p + 720p, not a fake 1080p). A source smaller than every target gets **one rendition at its own resolution**.
- **Even dimensions.** H.264 needs even width/height; derived widths are rounded to even.
- **Thumbnails fit, they don't squash.** The thumbnail is a ratio-preserving fit in a 640x360 box (a 9:16 video gets a ~202x360 thumb, not a squashed 640x360). Upscaling is allowed here — thumbnails are small, and soft beats cropped.

The node is **ratio-agnostic**: whatever ratio arrives (9:16, 4:5, 1:1, 16:9) gets correct renditions automatically. The ratio decision is made client-side, before upload (below) — the node just does the math right.

## Upload Styles (the client)

The killer apps keep aspect ratio to **a few fixed presets, not arbitrary** — the feed layout demands consistency. The presets:

| Style | Ratio | What it is |
|---|---|---|
| Original | source | YouTube-style — whatever the source is (long-form) |
| Square | 1:1 | Instagram classic |
| Portrait | 4:5 | Instagram feed (the tall feed post) |
| Vertical | 9:16 | TikTok / Reels / Shorts — the full-screen feed |
| Landscape | 16:9 | Classic video |

Two crop flavors, matching what the incumbents do:

- **Feed-style posts** (Instagram) get **freeform crop + resize** — drag the frame, pick the ratio.
- **Short-video** (Reels/TikTok) doesn't give a crop tool — it gives **reframe**: a fixed 9:16 frame, and you zoom + drag the source inside it. The frame is the product (the full-screen feed), so the ratio is fixed and only the window moves.

Plus **trim** — cut start/end before posting. Instagram, TikTok, YouTube all do it; YouTube even trims after publishing.

**All of it happens client-side, before upload.** The node never sees the original — it gets the finished file. That is the architectural point that makes this cheap:

- Trim / reframe / ratio-pick = browser work (canvas + MediaRecorder, or ffmpeg.wasm — `client-side-transcoding.md`)
- The node's contract doesn't change at all — with the aspect-ratio policy, whatever ratio arrives gets correct renditions automatically
- The upload story: **client edits (trim / reframe / preset) → upload finished file → node transcodes to AR-correct HLS**

The document records which style was used (`body.style`) so the feed can lay the card out the way the post was meant to be seen.

## Player Spec

- **ABR by default.** hls.js watches bandwidth and switches quality on its own (the `LEVEL_SWITCHED` event is the log seam). That's what YouTube does by default.
- **Manual quality selection.** The YouTube gear menu: Auto / 1080p / 720p / 360p. hls.js exposes `hls.levels` (the rendition list) and `hls.currentLevel` (set it to switch; `-1` = auto). ~30 lines of player UI on top of ABR.
- **Muted autoplay in the feed.** Scroll and it plays — that's the whole social-video loop. Tap-to-play feels like a video library, not a social app. Unmute is a tap.
- **Fullscreen immersive.** Vertical fullscreen, tap to reveal controls, swipe between posts (the social app's job, not the player's).
- **Speed control.** 1x / 1.5x / 2x — `video.playbackRate`, trivial.
- **hls.js first, native fallback.** Chromium on macOS reports `canPlayType('...mpegurl')` as supported (via AVFoundation) but headless Chromium can't actually play it — hls.js is the deterministic path everywhere; native HLS is the fallback for older Safari only.

## Creator Controls (the differentiator)

`transcoding_settings` is **user-owned data on the creator's node** — same shape as "your algorithm is your prompt." The killer move is letting the creator edit it:

- **Cover frame pick** — the creator chooses which frame is the thumbnail, not the auto-extracted one.
- **Encoding settings as an owned record** — default quality, max resolution, "don't upscale my 4K." The settings live in the document; the node honors them on (re)transcode.

This is the feature that turns the architecture into a product claim: the delivery proof (real view + watch-time numbers, "reached 100% of your followers — here's the ledger") and the owned settings both read from data the creator already owns.

## What v3 Does Not Do

- No live streaming (real-time RTMP ingest).
- No AR effects / filters (that's a camera pipeline, not a node feature).
- No audio library / music licensing.
- No per-title encoding (standard bitrates until scale matters — `transcoding.md`).
- No P2P delivery (v4 — `../../web10-v4/media/peertube-p2p-stack.md`, D44).

## Reference

- The model + document shape: `transcoding-foundation.md` (in this folder)
- The ffmpeg pipeline + queue: `transcoding.md` (in this folder)
- The auth split (presigned vs JWT segments): `minio-auth-bifurcated.md` (in this folder)
- The streaming layers: `streaming.md` (in this folder)
- Client-side pre-encode (ffmpeg.wasm): `client-side-transcoding.md` (in this folder)
- Decision record: D44 (HLS is v3, P2P stays v4) in `../../../strategy/decisions.md`
