# Media gauntlet — upload, transcode, HLS, playback

[← back to the gauntlet doctrine](./README.md)

Media is the heaviest surface: an upload (the presigned MinIO path), a transcode
(the in-process ffmpeg worker → HLS renditions + thumbnails), and a playback
(hls.js on desktop, native HLS on mobile). The media doc carries
`transcoding_settings` (status: processing → done|failed, the variants, the
`manifest_url` minted at read time). This is the surface where "the video is
greyed out" / "the audio is Darth Vader" / "the controls vanish" bugs live.

The media gauntlet is the slowest in the suite (the transcode is a real ffmpeg
run). It drives the upload → transcode → playback lifecycle with the truth
asserted, and it is the one surface where the *node's* transcode pipeline is the
thing under test, not just the client.

## The surface

- **Where it shows:** the composer (upload), the `PostCard` / `DiscoverCard` /
  `PostLightbox` (playback), the media demo (`marketing-ui/docs/media`).
- **Testids:** `data-testid="media-video"` (the feed inline player),
  `"hls-video-player"` / `"hls-video"` (the hls.js player), `"media-image"`,
  `"media-carousel"`, `"media-post-progress"` (the encode/upload %), the player
  controls (`"quality-select"`, `"speed-select"`, `"fullscreen-button"`).
- **The truth:** the media doc's `transcoding_settings` (the status, the variants,
  the `manifest_url`), the MinIO object (the uploaded file), and the HLS manifest
  (the synthesized master + the variant manifests).

## The state machine

```
cold (no media)
→ upload a video            the MinIO object exists; the media doc is created
                            (transcoding_settings.status = processing)
→ transcode completes       status = done; the variants exist; the manifest_url mints
→ the feed renders the HLS player (hls.js on desktop)
→ playback starts           the video plays (duration > 0, the manifest parsed)
→ RELOAD                    the media persists; the player re-mints the manifest
→ quality switch            the variant switches (the level switch)
→ RELOAD                    the media + the player persist
→ upload an image           the image renders at the natural ratio (object-contain)
→ RELOAD                    the image persists
```

**The transcode-truth assertion (the load-bearing one):** after the upload, the
gauntlet polls the media doc's `transcoding_settings.status` until it reaches
`done` (or `failed`), then asserts the variants exist and the `manifest_url`
mints. A media doc that stays `processing` forever, or reaches `done` with no
variants, is a transcode bug the UI-only assertion (the player renders) would
miss — the player might render the raw fallback while the transcode is broken.

**The playback truth:** the hls.js player parses the minted manifest (the
`MANIFEST_PARSED` event) and the video has a duration > 0. The gauntlet asserts
the manifest was parsed AND the video is playable, not just "the player element
is in the DOM."

**The reload truth:** a reload re-mints the `manifest_url` (the read path mints a
fresh 10-min JWT sig). The gauntlet asserts the player works after a reload (the
fresh sig is valid) — a stale sig that 403s on the manifest is a bug the
cold-start test misses.

**The ratio truth:** a 9:16 clip renders at the natural ratio (not letterboxed —
the 3.100.2 fix); the control rack is reachable (the 3.100.1 fix). The gauntlet
asserts the rendered ratio + the rack's reachability.

## The forks

- **Upload:** the composer's video attach is the reference. (The image attach is
  a fork — the presigned path differs.)
- **Playback:** the feed inline player vs. the lightbox full player vs. the
  discover card player — the same media, three renderings. Drive each.
- **Source:** the transcoded HLS path (hls.js) vs. the raw-file fallback (native
  `<video>`) — the two playback paths. Drive both.

## The truth fields

- **DB:** the media doc's `transcoding_settings` (status, variants,
  `manifest_url`); the MinIO object (the uploaded file exists).
- **UI:** the player type (hls.js vs. native), the manifest parsed, the video
  duration, the rendered ratio, the control rack.

## The anti-tests

- **Transcode failure:** a source that fails to transcode → status = `failed`,
  the designed error state (not a greyed-out tile, not a hang).
- **Stale sig:** a copied `manifest_url` past its 10-min TTL → the manifest 403s
  (the revocation); the player shows the designed error, not a silent failure.
- **Non-member sig:** a sig minted for one reader, used by another → 403 (the
  bifurcated auth).
- **Raw fallback:** a non-transcoded video (the Phase-2 import path) → the native
  `<video>` plays (no hls.js).
- **Mobile (native HLS):** on a mobile viewport (Safari), the native HLS path is
  used (no hls.js) — the player works. (Driven in the mobile project, if present.)

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A uploads a video post; user B
  (separate context, who follows A) → B's feed shows the video, the HLS player
  works for B (the manifest is minted for B, the per-reader sig).
- **The transcode at scale (API floor):** 10 users upload 10 videos in parallel →
  all 10 reach `done` (the transcode worker's bounded concurrency holds — no
  queue starvation, no lost jobs).
- **The manifest at N readers (API floor):** a video post viewed by 10 readers →
  each reader's `manifest_url` is minted for that reader (the per-reader sig), and
  each works (the bifurcated auth holds at N readers).

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — the upload → transcode → manifest via raw calls, the
   `transcoding_settings` + the variants + the manifest asserted (the poll until
   `done`).
2. **Browser gauntlet — video upload + playback** — the full lifecycle, the
   transcode truth + the playback truth + the reload.
3. **Browser gauntlet — image** — the upload + the natural-ratio render + reload.
4. **Browser gauntlet — the forks** — the playback from the feed / lightbox /
   discover; the HLS vs. raw-source paths.

Note: the transcode is a real ffmpeg run — the slowest step in the suite. The
API floor's poll-until-`done` is the diagnostic anchor (it tells you whether the
break is in the transcode or the playback). The browser gauntlet's timeout is the
longest in the suite; the diagnostic dump (the transcode worker log + the hls.js
console + the manifest fetch) is essential.
