# Music: The Audio Track Feed — web10-social

## Listening Experience Extension

The player/library extension contract and bounded verification are in
[`strategy/music-listening.md`](../../strategy/music-listening.md).
3.258.0 implements persistent playback and existing saved-collection composition
locally, without new platform primitives or changes to target access rules.

A music track is a `posts` doc on the discover group tagged `music`, with
exactly one **audio or video file** (`audio/*` or `video/*`), optionally
accompanied by images. No new collection, no new group — the Music
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

**A video CAN be music — the "mark as music" choice (both directions, the
operator's 10.11.2026 ask).** A single-video post is opt-OUT of the music
tab by default (a video is usually just a video); the choice is a tag, never
a new column:

- **Create:** when the tray has video media, the composer shows a "Mark as
  music" checkbox (opt-in, never automatic — audio keeps its auto-tag).
  Checked → `tags: ['music']` on the create.
- **Edit:** when the post's media is video OR audio, the composer's edit
  mode shows the same choice as a separate-save control (`MusicTagToggle`,
  the Discover-audience pattern — it writes the tag via `updatePost`
  without touching title/text/media): "Mark as music" / "Remove music
  tag". Audio posts get the REMOVAL path (the auto-tag can be undone);
  video posts get the addition. Image-only posts get no control.

## The read + the render-time gate

`readMusicPage` (paged, the wall's infinite scroll) + `readMusicFeed`
(one-shot, the search) in `src/data/feed.ts`. Two-layer filter (defense in
depth):

1. **Server-side** — `readDiscoverFeed(…, ["music"])` sends the generic tag
   filter (`has(tags, 'music')`), so the node pulls only tagged tracks.
2. **Render-time** — the gate re-derives MIME types from the *resolved* media.
   Require exactly one audio/video attachment; additional images are allowed.
   Image-only posts, multiple playable attachments, unsupported types and
   unresolved attachments are excluded. Missing metadata must not disguise a
   second playable attachment. A video explicitly marked as music is a track.

The D86 surface label is `'music'` — the read logs a delivery impression per
returned track (the on-surface "N plays" is the reach over these deliveries).

## The surface

### Audio on ordinary post cards

Music attachments are playable outside `/music`: marketing Discover's shared
DiscoverCard and social Feed/PostCard use the shared `AudioPlayer` for resolved
`audio/*` media. Carousel audio uses the same transport instead of an image tag.
Resolved MIME takes precedence over a post's `music` tag; supporting images and
video retain their renderers. No decorative progress bar stands in for a player.

The inline transport has explicit Play/Pause, keyboard/touch seeking and actual
elapsed/duration state; it does not autoplay or fetch audio on mount
(`preload="none"`). Another audible media play pauses it; URL replacement or
unmount retires the old transport. Missing URLs show Audio unavailable; denied,
unsupported or failed playback shows an error and explicit retry. Retry reuses
the existing URL, never extends its expiry; refreshing the original post is still
needed for a fresh expired URL. This is not the dedicated Music queue or its
automatic authorized renewal. Native-browser fixture evidence is not acceptance
of a particular production recording.

The feed presentation uses the track's resolved thumbnail as cover art, or a
resolved supporting image when no thumbnail exists. Audio URLs and author
avatars are never covers. Reserve the square while loading; missing/failed art
uses a disc fallback. The card receives the post title and current author label
from its consumer; these are display metadata, not access authority. Updating
only artwork/labels must not remount or restart the audio transport.

### Dedicated listening destination

`/music` renders compact cover/title/artist-duration rows and one overflow
button per track. Its action sheet offers Play next, Add to queue, Save to
playlist, Save/remove Saved Music, Share and Go to artist. Anonymous listeners
can explore/play/share, but cannot save. Group display names stay separate
from exact group IDs. Desktop Explore has a compact artwork feature; mobile
prioritizes the track list. Load more is explicit, not infinite scroll.

The app-level MusicProvider owns the session transports — one `Audio` element
AND one `Video` element (music.md: a video CAN be a track) — plus the session
queue and transport state; navigation does not dispose playback. The session
has ONE voice: the active transport is the element of the current track's kind
(a video track routes to the video element and releases the audio one, and
vice-versa). The video element is DETACHED by default (audio-only in the
mini-player state) — the expanded player panel borrows it into its visible
video stage (the provider owns the element; the surface lends a parent, so
position + hls state survive the move). A transcoded video (status done +
minted manifest) rides hls.js through the app's vendored build + the shared
`resolveManifestHref` (the same source seam every video surface uses); a raw
MP4 plays the direct file. The persistent player sits above mobile
navigation. Seek/time, volume, previous/next, finite shuffle, repeat off/all/one,
automatic advance and queue removal are session state, never playlist writes.
Duplicate queue entries retain occurrence identity. Explicit Play next wins
over shuffle. Playback failure can re-read the original authorized track and
reload its current URL. Signed URLs/credentials are not persisted. Audible
competing media pauses Music; muted previews do not. Supported browser Media
Session actions are registered and cleared with the session. The session
metadata also carries the track's resolved cover as artwork — the same shared
album-art precedence as the cards above (the audio's own thumbnail, otherwise
the post's supporting image, never the recording URL) — so the phone's system
media controls (previous/next, pause, scrubber) can render the album art.
With no cover the artwork entry is omitted, not a broken URL, and a refreshed
track re-reads its post and lands with the fresh cover URL.

The first media error during requested playback automatically re-reads the
original post once, preserving queue occurrence and restoring position after
metadata loads. Further failure remains visible with explicit retry; selecting
without playing never triggers automatic playback. Pause/selection/session
changes invalidate pending recovery. Caption-based titles are shared across
rows, menus, mini-player and Media Session; failed artwork renders a disc fallback
and a changed artwork URL can load again. These are client repairs, not evidence
that a particular production object or phone codec works.

URL state: `q` is a case-insensitive loaded-track/name search; `view=saved` or
`view=playlists` selects the library; `collection` is the full collection ID;
`track` restores one readable track without autoplay; `panel=player|queue`
opens listening views; `menu` addresses a track action sheet. Search is not
catalog-wide indexed search. Paging offsets count raw returned rows, not only
tracks surviving the media gate; read errors show retry, not normal empty UI.

Saved Music is a personal normal private-by-default collection created only
on explicit first save with `createCollection('Saved Music', {slug:'saved-music'})`.
Its path ends in `saved-saved-music`; the existing collection list strips one
prefix, so its returned slug is `saved-music`. Display-name changes do not
change identity. Unsave removes the saved reference, never the original post.
Playlists list the existing personal web10 collections; collection contents
are independently hydrated in durable order and gated to music, not intersected
with the current Discover page. Nonmusic/unavailable items are explained and
skipped without reordering/deleting them. Existing collection detail handles
privacy, rename and durable reorder. Account/mount lifecycle guards drop stale
results and block follow-on mutation steps; already-issued requests cannot be
undone. Existing collection read caps and lack of atomic save uniqueness remain.

## Nav

Profiles use Posts, Media and (when available) Saved, not a Music tab: most
people are not musicians. Music posts remain in Posts, and their audio/video
attachments appear in Media. Audio tiles show cover art or a musical-note
fallback and open the original post. Legacy profile `?tab=music` links resolve
to `?tab=media`, preserving other URL parameters. The dedicated `/music`
listening destination is unchanged.

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
arbitrary mime types (presigned upload + confirm). The render-time gate checks
resolved media rather than trusting the client-asserted tag: images alone
cannot become a track, and multiple playable attachments remain ambiguous.
