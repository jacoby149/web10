# Music: people have taste, not just queues

## The listening loop

A listener finds a song, reacts to it, opens the conversation, and borrows a
curator's taste for the ride home. Music already plays and saves individual
tracks. The missing part is finding somebody else's collection and keeping it
within reach. A playlist should not require an expedition through profile tabs.

Operator approval: 08.11.2026, “great, plan it out add knowledge base for it
then proceed!” after the song-reaction/public-playlist/live-bookmark proposal.

## Contract

- Song likes/dislikes are the original post's mutually exclusive reactions.
  Compose shared PostActions in the expanded player and track sheet; keep compact
  song rows uncluttered. Read identity-specific state and counts from the same
  reaction groups used for writes. Anonymous listeners see counts, not writable
  controls. Pending/error/retry and late-read/write ownership matter.
- Playlists has URL-held `scope=browse` and `scope=bookmarks` subviews alongside
  own collections. Browse offers curators from the loaded Music page (personal and
  group authors) and accepts an exact local username. This is bounded creator
  discovery, not a catalog-wide search/index or recommendations. The selected
  curator is `curator`, and the open playlist remains `collection`.
- Public lists reuse readUserPublicCollections/readGroupPublicCollections. Never
  enumerate private collections with owner reads. Cards identify the curator;
  mixed collections say “saved items,” not song counts. Opening a collection
  hydrates eligible music in existing order, explains unavailable/nonmusic items
  and allows play-all without rewriting the source.
- “Save playlist” bookmarks the live original, not a copy. Persist one document
  per target in `web10-social-playlist-bookmarks`, attached only to the human's
  own followers group (owner wildcard; followers/public roles cannot read this
  service). Store only `collection_id`; no copied name, cover, signed URL,
  credentials or target membership. Use personal CRUD, never acting-group
  authority. Collapse duplicate records on read; removal deletes all matching
  personal rows. Concurrent tabs are not a uniqueness promise.
- Bookmarks are pointers, never access grants. Resolve current faces and songs
  through authorized reads each visit. A now-private/deleted target remains
  removable as “Unavailable playlist,” with no cached content. An outage is an
  error, not permission to create duplicate bookmarks. No writes on visiting,
  browsing, playing or anonymous use. Account/client/unmount changes invalidate
  pending work before follow-on reads/writes or UI settlement.
- Individual save-song/save-to-playlist actions work in other people's playlists.
  Whole-playlist copying is deferred; no silent snapshot. Existing private
  defaults, canonical links, media recovery and playback continuity stay intact.
  No node/SDK/auth protocol change.

## Delivery and gates

1. **MS1 — Song interactions:** shared controls in player/sheet, identity
   hydration, mutual exclusion, serialization, failure/retry and stale-response
   controls. Existing Music/comment tests and build pass.
2. **MS2 — Browse curators:** public personal/group lists, exact username entry,
   URL/history restoration, anonymous ordered playback, empty/loading/error
   states and private/obsolete-response controls.
3. **MS3 — Live bookmarks:** owner-scoped first/return save/remove, duplicate
   cleanup, unavailable targets, no failed-read create fallback, session guards
   and retry; no source collection writes.
4. **MS4 — Acceptance:** full social suite/typecheck/build and real Chromium UI
   flows at desktop/375px; screenshots inspected. Isolated fixtures prove UI,
   not deployed persistence, actual-node denial or physical-phone behavior. Those
   remain in the existing connected-listening task.

## Local implementation receipt — 5.5.0

MS1–MS4's local gates are complete. `MusicReactions` composes the shared action
bar in the expanded player and track sheet, with read/retry/pending/rollback
states and optional guarded follow-on writes in the existing reaction helpers.
`MusicPlaylistBrowser` owns curator/scope URL navigation and the live bookmark
library; `data/musicLibrary.ts` owns the personal pointer CRUD. Login consent and
the access oracle request the new app service together; existing grants need
normal re-consent, not a new token protocol.

All 2,223 social tests in 147 files pass with one worker; all 108 focused
Music/library/reaction/contract controls and final typecheck/build pass. The
23 added controls include anonymous ordered playback, browser-history restoration,
obsolete curator replies, failed-read/no-create, duplicate cleanup, pagination,
unavailable metadata and owner changes without a component render.

`screenshots/music-social-library.mjs` boots/stops its own server and drives
desktop/375px Chromium through public group browse → save/reopen live bookmark →
song like/dislike → individual song save → exact source-order play-all → comments.
Receipt: `.context/music-social/music-social-library-receipt.json`; eight
`music-{curators,bookmarks,social-menu,social-player}-{desktop,375}.png` captures
were inspected. Fixture-only upload-preview chrome is suppressed on idle Music;
mobile curator chips scroll within their own row and the reaction pair stays
beside Comments above the persistent player.

Actual-node bookmark persistence/two-account denial, existing-user consent upgrades,
target revocation and cross-surface reaction persistence remain in **Music
social-library connected acceptance** in the lane/plan. The older connected
listening task still owns real-media/expiry/physical-phone behavior. No
deployment, production writes, global public index, cross-node discovery or
whole-playlist copy.

PR #1438's first complete CI run reproduced a stale pre-granted browser fixture:
the settings re-login waited for “Continue as” while the real popup correctly
requested the new bookmark-service consent. The settings/saved/trending seeds,
real login and access oracle now import one pure `lib/socialContract.ts` service
declaration rather than retaining duplicated lists. A source-list comparison
reproduced the exact missing grant before replacement; existing contract/oracle
tests pin the shared declarations. No extra approval click, bypass, relaxed
assertion or timeout increase.
Full connected bookmark acceptance above remains separate from this existing
already-granted re-login journey.
