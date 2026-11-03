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
behavior. Public playlist discovery and catalog-wide indexing stay deferred.

## Starting Point

- Music-tagged Discover reads, MP3 upload and author-marked music videos.
- Album-art cards, duration and a route-local play/pause strip.
- URL search filtering over loaded tracks, not a catalog-wide search engine.
- Generic web10 collections: saved post references, private by default,
  collection creation, public sharing, covers and durable playlist order.
- Local supporting-image repair in 3.257.12; production rollout is separate.

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
6. Browser Media Session metadata/actions when supported. A deliberate audible
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

Catalog-wide indexed music/playlist search, public playlist discovery,
recommendations/radio, albums, offline downloads, cross-device queue sync,
gapless playback, lyrics and music-specific creator publishing metadata.
Existing public collection links remain usable; no new public index is implied.
