# Music: Browse, Save, Listen

## Intent

Music should feel like a music player and a small music library, not a social
feed with a play button. The reference is YouTube Music's listening flow:
explore a little, search, choose something, keep listening while browsing.
It serves the same creator identity and audience as Posts, Video and Shorts.
This is not a promise of YouTube Music catalog or recommendation parity.

## Implementation Status

3.258.0 implements the local feature scope below. All 1,761 social tests in
118 files and production typecheck/build pass. Seeded desktop/375px captures
for Explore, Saved Music, playlists, player, queue and track actions were
inspected in `.context/music-*.png`. Browser smoke uses silent fixture audio:
start/pause, navigate-away player continuity, queue actions, save/unsave and
the collection picker pass, with no horizontal overflow at 375px. This does
not establish real-media playback or connected collection persistence.

The extension is not deployed. Release checks remain:
isolated real-storage first/return saves and unavailable refs; real MP3/video
playback and expired-URL refresh; actual phone Media Session/background
behavior. Bounded public-curator browsing and live playlist bookmarks are now
approved in [music-social-library.md](music-social-library.md); catalog-wide
indexing stays deferred.

4.4.1 adds the bounded device-report repair: consistent caption titles,
failed-art fallback and one-shot media-error recovery. Seven new regressions,
all 1,760 social tests and production typecheck/build pass. Native Chromium
desktop/375px plays a generated MP3 after an intercepted HTTP 403; repeated
failure remains retryable and all four screenshots are inspected. Node reads
are mocked, so this is not real signed-expiry, production-object, phone or
background-playback acceptance. Those release gates above remain open.

4.9.0 hands the track's resolved cover to the browser Media Session as
`artwork` (shared album-art precedence, computed once at the track gate and
used by every in-app player surface too), so the phone's system media
controls can render the album art. The selector moved to the pure
`@web10/discover/audio-artwork` subpath (the `/face` seam pattern) because the
data layer must not pull the shared React barrel. Gate and session controls
are red→green, all 1,955 social and 299 marketing tests and both
production typecheck/builds pass, desktop/375px music-player and the bounded
403-recovery captures were re-passed, and a native-Chromium receipt confirms
the real `navigator.mediaSession.metadata` carries the cover while playing.
The phone OS widget itself is not locally capturable; physical-phone and
actual-account acceptance remain the connected-listening lane's.

4.10.0 adds playlist sharing: the Music app's Saved Music / Playlists header
and the collection detail's header hand out the collection's canonical
permalink (`/u/:username/saved/:collectionId`, the group variant for a group's
playlists) through one shared dialog. A private playlist says so before the
link goes out; the owner's "Make public & share" flips the D58 `anyone` reader
row first (the existing visibility seam) and then shares, and "copy anyway"
stays available. The permalinks join the link-preview edge split (KB:
`web10-v3/social/share-preview.md`): a public playlist previews its name, its
cover (an audio cover's album art, never the recording) and its item count; a
private one previews the generic card, no content. Group-authored post
permalinks (`/groups/:groupId/p/:postId`) render the same post card as the
`/u/` shape, so a shared song's preview carries its album art on every share
surface. New card/server/nginx controls plus the dialog regressions pass;
all social tests and the production build/typecheck are green in this branch.
Deployment and receiving-app cache refresh remain separate release checks.

## Starting Point

5.5.0 adds original-post reactions, URL-backed public curator browsing and personal
live playlist bookmarks. The local 2,223-test/build/desktop/375px Chromium receipt
and explicit connected-node/consent/phone limits are recorded in
[music-social-library.md](music-social-library.md). Catalog-wide indexing remains
deferred; saving a playlist keeps its live original, not copied tracks.

- Music-tagged Discover reads, MP3 upload and author-marked music videos.
- Album-art cards, duration and a route-local play/pause strip.
- URL search filtering over loaded tracks, not a catalog-wide search engine.
- Generic web10 collections: saved post references, private by default,
  collection creation, public sharing, covers and durable playlist order.
- Local supporting-image repair (renumbered 3.258.1 after the dev merge); production rollout is separate.

## Implemented Scope

1. A listening-first Music destination with Explore, Saved Music and Playlists.
   Explore has artwork-led picks plus compact track rows, explicit load-more
   rather than an endless scrolling wall, and an always-visible search field.
   Search matches loaded track title/caption/artist and collection names;
   describe the loaded-result limit honestly and allow loading further results.
   Operator reference: the 03.11.2026 YouTube Music screenshots show compact
   cover/title/artist-duration rows, with one vertical-ellipsis overflow control.
   Put Play next, Add to queue, Save/unsave, Add to playlist and Share in its
   bottom sheet (desktop compact dialog), not an always-visible action cluster.
   The sheet repeats the selected title/artist so its target stays unambiguous;
   Escape/outside/Close dismiss and keyboard focus returns to the trigger.
   Never squeeze the song metadata to make room for secondary actions.
2. One app-level audio player that survives route navigation. Include seek,
   elapsed/total time, volume, previous/next, shuffle, repeat off/all/one,
   automatic next-track playback, and an editable session queue (play next,
   append, remove). Failed playback has a visible retryable state.
   A requested track's first media failure re-reads its original authorized post
   once and resumes its position after fresh metadata. A second failure stays
   visible; no automatic retry loop. Pausing, choosing another track or changing
   session invalidates pending recovery. Selected-but-paused failures never autoplay.
   Titles fall back to the caption consistently in rows, menus, mini-player and
   Media Session. Missing or failed artwork uses the same designed fallback.
3. URL-addressable now-playing and queue panels. A track link resolves the
   original readable post, including tracks outside the current Explore page.
   Reload restores the selected view/track without unsolicited autoplay.
4. Save/unsave in a normal private-by-default collection named Saved Music.
   It is created only on the first explicit save, never just by visiting Music.
   Identify the personal collection by its reserved saved-music slug, not a
   display-name match or a device-local credential. Reuse it on return visits.
5. Add to playlist uses the existing Save to collection picker and its create
   flow. Music's Playlists view lists existing personal web10 collections;
   selecting one hydrates its saved references and plays eligible music in
   collection order. Nonmusic/unavailable items are skipped with an explanation.
    Link to existing collection detail for privacy, rename and durable reorder.
    Covers select the resolved audio/video thumbnail, or the resolved image URL,
    never the raw recording. Missing, denied or failed images keep a reserved
    square with the designed music fallback; a changed URL may load again. Keep
    cover-reference choices, collection visibility/order and read gates unchanged.
    A playlist shares its canonical permalink (the collection detail's link);
    the shared dialog states a private playlist's link can't open yet, and the
    owner's "Make public & share" flips the visibility before the link goes out.
6. Browser Media Session metadata/actions when supported. The session metadata
   carries the track's resolved cover as artwork — the shared album-art
   precedence (the audio's own thumbnail, otherwise the post's supporting
   image, never the recording URL), computed once at the track gate and shared
   with every in-app player surface — so the phone's system media controls
   (previous/next, pause, scrubber) render the album art; with no cover the
   artwork entry is omitted. A deliberate audible
   video play pauses Music; muted previews do not. No automatic resume after
   another surface takes playback. Account/session changes clear playback and
   private library state; late reads/writes cannot repopulate a new account.

## Composition, Not A New Library

A playlist is a durable web10 collection. A queue is temporary player state.
Saved Music uses the existing saved group + saved documents, never a new API,
table or service. A pointer is not a grant: every target is read through its
own current authorization. Do not intersect saved tracks with the current
Discover page, persist signed media URLs or credentials, change a collection's
visibility implicitly, or rewrite mixed-content playlist order from a filtered
music view. Anonymous users may explore/listen, but cannot save or create.

The shared music gate requires the music tag, exactly one resolved audio/video
attachment, optional images, and no unresolved/unsupported attachments. Discover
adds its audience gate; saved reads retain their original target gates.

## Acceptance

- Tests drive queue/end/seek/repeat/shuffle/error/route-persistence behavior.
- Tests drive first save, return save, unsave, failed save/retry, picker entry,
  ordered playlist hydration, nonmusic/unavailable targets and stale-account reads.
- Search/view/collection/now-playing/queue state round-trips through the URL.
- No production writes or deployment are required to build this feature.
- Social tests and build pass; desktop and 375px screenshots of Explore,
  library and player states are captured and inspected with seeded data.
- Browser/real-storage playback, mobile background playback and connected
  collection persistence remain explicit release checks, not mocked-test claims.

## Later

Catalog-wide indexed music/playlist search and global playlist discovery,
recommendations/radio, albums, offline downloads, cross-device queue sync,
gapless playback, lyrics and music-specific creator publishing metadata.
Existing public collection links remain usable; no new public index is implied.
