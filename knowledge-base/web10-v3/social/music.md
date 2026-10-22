# Music: The Audio Track Feed — web10-social

A music track is a `posts` doc on the discover group whose single media is a
**real audio file** (`audio/*`). No new collection, no new group — the Music
feed is a *view* over the discover group, filtered to music. Same model as
Shorts (a 9:16 video) and Video (a landscape video): the node stores
`{service, body}` opaquely; the app writes + reads a `tags` array; the feed
applies a render-time gate.

## The write

The composer accepts `audio/mpeg` (MP3). When exactly one audio file is
attached, the post is auto-tagged `['music']` — no toggle, same as `['short']`
for a 9:16 video. The album art (optional) is an image the user picks in the
composer tray; it becomes the track's thumbnail (the media doc's
`thumbnail_object_key`), which the Music wall renders as the cover.

- `validateMedia` accepts `audio/mpeg` / `audio/mp3`, 50 MB cap.
- `getAudioInfo` probes the duration in the browser (`new Audio()` +
  `onloadedmetadata`) — stored on the media doc as `duration_seconds`.
- The upload path skips the video transcode (the node's ffmpeg is for HLS
  video) and the poster frame. The album art (if picked) is downscaled via
  `generateThumbnail` and uploaded as the media doc's thumbnail.
- `createPost` writes `tags: ['music']` when the post has exactly one audio
  item.

## The read + the render-time gate

`readMusicPage` (paged, the wall's infinite scroll) + `readMusicFeed`
(one-shot, the search) in `src/data/feed.ts`. Two-layer filter (defense in
depth):

1. **Server-side** — `readDiscoverFeed(…, ["music"])` sends the generic tag
   filter (`has(tags, 'music')`), so the node pulls only tagged tracks.
2. **Render-time** — the gate re-derives `audio/*` from the *resolved* media
   and drops fakes: a doc tagged `music` whose media isn't a real audio file
   (a video, an image, or multi-media) is dropped at render. A track is a
   post with **exactly one** media that is `audio/*`.

The D86 surface label is `'music'` — the read logs a delivery impression per
returned track (the on-surface "N plays" is the reach over these deliveries).

## The surface

`/music` → `MusicScreen` — a responsive grid of square album-art tiles
(2 cols mobile → 5 cols desktop). Each tile shows:

- **Cover** — the media's `thumbnail_url` (the uploaded album art), or a
  **default musical-note fallback** (a brand-gradient background + a lucide
  `Music` icon) when absent.
- **Title** — the post's `title` (D82), falling back to truncated `text`.
- **Author** — `@username`.
- **Duration** — `m:ss` from `duration_seconds`.
- **Views** — D86 impressions (bar-chart) + reach (person), compact K/M/B.

Tapping a tile plays the track inline: a sticky bottom player bar (play/pause
toggle, cover, title, author, duration). Only one track plays at a time;
tapping the current tile toggles play/pause. The player is an `<audio>`
element (no video, no HLS).

The URL holds the state: `?q=` filters the loaded wall to matching tracks
(title / text / author, case-insensitive) + shows a query chip (with its X) —
the same idiom as Shorts / Posts / People.

## Nav

Music is a real destination (not coming-soon):

- **Desktop sidebar** — after Shorts (Profile · People · Posts · Video ·
  Shorts · **Music** · Messages · Monetization · More).
- **Mobile** — in the More sheet (the bottom bar stays at five: People ·
  Posts · Video · Shorts + More).
- Anon can browse Music (public surface).

## The line it does not cross (D60)

All client-side, zero node surface. The node already stores `{service, body}`
opaquely; `tags` is a platform primitive (a notes app tags `web10-notes-
pinned`, a shop `web10-shop-catalog`); the media pipeline already handles
arbitrary mime types (presigned upload + confirm). The render-time gate is
the anti-hack seam — a faked track (tagged `music` but the media is a video
or image) is dropped at render, never trusted from the client-asserted tag.
