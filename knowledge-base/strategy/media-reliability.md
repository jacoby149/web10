# Media reliability across marketing and social

## The goal

A reader on a mobile connection should see useful content promptly, keep the
recording they chose playing, and recover from an interrupted request without
reloading. Fifty posts must not mean fifty video downloaders. A missing image
is not permission to show a broken icon.

Operator scope (05.11.2026): all four measures — diagnostics, bounded recovery,
visible-first scheduling and adverse-network verification — on both marketing
and social, across every media-bearing tab. Deliver in bounded changes.

## Evidence, not guesses

Reported screenshots: `PHOTO-2026-11-04-00-52-38.jpg` (five broken video posters),
`PHOTO-2026-11-03-20-14-29.jpg` (music plays while artwork fails), `image.png`
(ad image failure and repost video error), under `.context/attachments/`.
Screenshots alone establish neither HTTP status nor the cause.

Read-only production probes on 05.11.2026:

- Social/API/MinIO resolve directly to the origin and return OpenResty.
  Public reads return `media.web10.app` URLs served through Cloudflare.
  Production media JWKS is nonempty: the Worker is active, unlike older
  production-disabled rollout notes in `web10-v3/media-delivery.md`.
- Six distinct fresh image/audio URLs accept 1 KiB range GETs with HTTP 206,
  wildcard credentialless CORS, private/no-store and 60-second capabilities.
- One exact thumbnail: fresh **206**, same URL after actual expiry **403**,
  same object after a fresh authorized document read **206**. Receipt:
  `.context/media-expiry-production-receipt.json`, 10:39–10:40 UTC.
  No JWT, signed URL, object key or content is retained in that receipt.
  This reproduces delayed-fetch failure, not every screenshot or an interruption
  of an already-running transfer. The edge is enforcing the lifetime correctly.
- Source: `HoverVideo` attaches lazily, but leaving only pauses its element;
  HLS survives until unmount. `ImmersiveHls` attaches inactive slides and full
  `HlsVideoPlayer` attaches on mount. These are distinct scheduling gaps.
  Post-ad media state depends only on ad ID, potentially ignoring refreshed
  same-ID media references. Image recovery is inconsistent.
- Pages already contain 20 Feed, 30 Music and 50 Discover/Watch rows.
  Smaller pages are a measurement-driven option, not an expiry repair.
- Local Python CA-store errors are not production TLS evidence: system curl
  verifies the same endpoints without bypassing certificate checks.

## Frozen homepage phone-video incident (11.11.2026)

Read-only Chromium replay of the reported “Ramblin” card on the social homepage
reproduces an advancing clock with zero decoded video frames and zero intrinsic
video dimensions. The public carrier reports a failed transcode with
`too many values to unpack (expected 3)`; FFprobe identifies HEVC video plus AAC
audio and reproduces `1920,1080,120/1,` from the old CSV probe. The browser plays
the supported audio track over the poster; an advancing clock is not video proof.

The local worker repair reads named JSON fields and plans against display-matrix
rotation, matching FFmpeg autorotation. A generated three-second rotated HEVC
fixture reproduces the exact CSV failure before repair, then completes the real
probe/encode/thumbnail pipeline with fake document/storage I/O. Desktop/375px
Chromium decodes increasing HLS frame counts (6 → 15), retains portrait shape and
passes pause/resume; the same raw fixture advances audio with zero video frames.
Receipts/captures: `.context/rotation-playback-receipt.json` and
`.context/rotation-playback-{1440,375}.png`. All 2,241 API tests plus eight subtests
pass (one existing opt-in skip). No player/access/TTL change or production write.

Deployment and retry of the existing failed upload remain OPEN. A worker code fix
does not requeue historical `failed` records. After reviewed deployment and
operator approval, retry only the exact affected media through the existing
owner-authorized transcode route; wait for `done`, re-read the original carrier
and verify actual decoded frames on the reported homepage card. Do not re-upload
the post, grant broader access, or silently run a global backfill.

## Shared policy

1. **Diagnostics:** content-free surface/kind/phase, attempt count, duration,
   browser media-error code and HTTP status where available. Image `error`
   alone exposes no HTTP status; never guess 403 or codec failure. No signed
   URLs, tokens, object keys, accounts, text or raw exceptions in telemetry.
   Do not add diagnostic GETs to every successful image.
2. **Recovery:** one automatic bounded recovery per occurrence, then explicit
   Retry/unavailable. Re-read the original authorized carrier and exact media,
   scoped to API origin, credential generation and page/identity. Coalesce
   equivalent concurrent carrier reads and bound concurrency. Denied/missing
   never falls back to stale credentials, another owner or public storage.
   Expiry metadata schedules reads; it grants no authority. Refresh on visible
   or foreground demand, not timers for every off-screen row. Preserve queue,
   seek, pause and playback intent through delayed responses.
3. **Scheduling:** visible thumbnails before speculative video, lazy off-screen
   images, at most one disposable preview per document. Losing a preview
   releases its downloader, not just playback. Hidden/offline/Data Saver
   suppress disposable previews. Explicit Music/Watch playback is different:
   scrolling or changing routes must not kill the persistent Music player.
   Avoid retries while offline and reconnect storms. No blanket TTL increase.
4. **Verification:** real browser at desktop/375px, throttled latency/bandwidth,
   offline/reconnect, hidden/visible, rapid scrolling, return after expiry,
   403/404/5xx, stalls and corrupt/unsupported media. Pin requests/bytes and
   concurrency separately from first-paint/settled latency. Synthetic receipts
   do not certify actual phones or production rollout.

## Coverage matrix — each row needs a receipt

| Surface | Seams | Required checks |
| --- | --- | --- |
| Marketing Posts/Video/Shorts/post search | FeedPreview, Trending, shared cards/players | public carrier refresh, visible thumbnails, one preview, denied/missing |
| Marketing People/Groups/search | ProfilesBrowser, PersonCard/GroupCard/face | avatar/banner expiry, batching, fallbacks, obsolete search |
| Marketing detail/link previews | public cards and delivery | delayed crawler fetch separately from browser cache/access policy |
| Social Discover/Following Posts/Video | DiscoverScreen, FeedScreen, shared cards | current page/reader, ads, repost original carrier |
| Social Shorts wall/lens | ShortsWall, ShortsScreen, immersive/native players | active-only transport, preview budget, navigation/expiry |
| Social Watch | WatchScreen, HlsVideoPlayer | explicit playback, long-play renewal, seek/speed/quality/pause |
| Social Music | MusicProvider, AudioPlayer, MusicArtwork | delayed select/seek, art independent of audio, queue/background |
| Social Saved/playlists | SavedCollectionScreen, covers | lazy cover refresh, unreadable references, preserved order |
| Social profiles/groups/media/lightbox | Bio/Groups, PostMediaRenewal | exact carrier/uploader, banners/avatars, galleries/reposts/ads |
| Social messages/comments/notifications/Studio | attachments, avatars, analytics previews | private authorized refresh, stale account, no unrelated preload |

## Bounded delivery

Initial status, 4.10.3: MR0 and the bounded MR1 slice below are complete. Seven
added controls (five initially red), all 1,993 social/299 marketing tests and
both builds pass. `screenshots/preview-budget.mjs` runs each app's configuration
with real hls.js and synthetic stalled segments at desktop/375px; every case
requests/cancels two segments, peaks at one downloader and has zero active
offline. Four fixture screenshots inspected. MR2–MR4 remain open; no deployment,
full-tab, real-video decoding or physical-phone acceptance is claimed.

### Cross-site implementation (4.10.4 local)

Verification: 2,034 social/299 marketing tests, both production builds,
frozen-lockfile installs and whitespace checks pass. The final narrow
same-family follow-up finds no remaining P1/P2 within the repaired continuation
scope. The broader independent review/connected release gate is still open.

The social SDK seam now decorates only allowlisted read methods; marketing's
public read/query helpers use an explicit response adapter, not a global fetch
interceptor. Each response binds its media URLs to a replay of the original
immutable read arguments. Replay omits `surface` delivery accounting, retains
service/groups/query/prepare, and resolves only the exact original resource
(origin/path and non-credential query fields); stripping signatures for matching
does not authorize anything. The server's fresh read still decides access.

Bindings are in-memory, capped at 4,096 URLs, and fenced by client API/token
snapshot, login/logout/acting-identity generation and pathname. Query-string
playback position updates do not invalidate a playing Watch. Consumers also own
their component/source generation and must recheck the returned `isCurrent`
predicate at delayed metadata restoration, not only at the read return.

Recovery coalesces siblings from the same original response. Four reads may run,
64 may queue. UI demand times out after 15 seconds; a timeout does NOT free an
underlying SDK request's slot and cause an unbounded second wave. Queued work
with no remaining waiter is skipped. SDK requests already dispatched are not
claimed to be physically abortable by this adapter. Optional People mutual and
follower/following profile enrichments now use six ordered workers and reject
obsolete reader/path generations; this bounds peak jobs, not total N reads or
the still-open C10 batching design.

`ReliableImage` owns a single automatic recovery attempt and explicit retry,
waits offline, defers already-expired off-screen sources and hides failed bytes
while renewing. Existing avatar/disc fallbacks remain. A manual retry of an
external/unbound URL requests that exact URL, never fabricates a new grant.
`ReliableVideo` keeps the same native node through URL replacement, restores
position/rate and fences delayed playback. Shared full/immersive HLS and inline
audio recover through current bindings (or the existing carrier seam), with
bounded denial and honest Retry instead of guessing a browser incompatibility.

All remote image renderers now use the shared primitive: cards, people/group
faces, profiles, galleries/lightboxes, saved/playlist art, Music, search, ads,
comments, notifications and Studio previews. The static ownership guard runs
in the social test/check commands and scans BOTH apps plus the shared package;
remaining raw renderers are the shared transports, bundled branding, local bug
attachments and the local video editor. Composer/admin attachment previews
also use shared image/native handling; local metadata needed by editing is not
confused with speculative network video.

Profile/group video grids request posters, not raw recordings for metadata.
Inline ads use the HLS-aware shared player. Same-ID post ads accept refreshed
media references. Full-player automatic transport is visibility/foreground
gated; inactive Shorts hold no HLS loader and release their prior transport.
Native/file surfaces default to no preload. Preview leases and media playback
coordination preserve priority for explicit Music; the persistent Music player
is not destroyed by scrolling or route changes.

Local evidence includes deterministic reader/denial/concurrency/stall and
source/pause/Retry regressions; six review findings reproduce before repair
(four in the first bounded same-family review, two immersive continuation
findings in its follow-up). These concern delayed identity validity, recreated
DOM subscriptions, native pause intent, dispatch-time marketing generation and
immersive seek/reveal. They are not a model-diverse three-dry approval.

The self-booting `screenshots/media-recovery.mjs` runs 56 synthetic
renderer/configuration/viewport cases: 40 expired-image cases including all
five named tabs, 12 HTTP 403/404/503 failure/manual-retry cases, and four
offline/reconnect cases.
It waits for actual expiry before mounting, throttles to 150 ms/100 KiB/s, then
scrolls each image into demand: one original read plus one shared renewal and
decoded image bytes in each successful case. Persistent failures remain bounded
and explicitly retryable; offline does not spend a read until reconnect.
Music/Shorts-labelled fixture cases cover
artwork, not full native queues or immersive decoding. The separate real MP3
403/retry receipt exercises the actual Music context at both widths; the
preview budget receipt exercises real hls.js/stalled HTTP cancellation.
`screenshots/hls-recovery.mjs` independently generates twelve-second H.264/AAC
HLS and runs eight actual Chromium decoding/renewal cases (full/immersive,
both app configurations, desktop/375px): an old segment receives HTTP 403,
exactly one original-read renewal occurs, resumed playing events retain their
nonzero position and actual decoded frames continue. This is synthetic HTTP
authorization, not a real node/permission or feature-film receipt. These
receipts do not replace connected node permission, physical-phone Safari,
full-film, background OS, crawler-cache or production rollout acceptance.

- **MR0:** inventory and credential-free production expiry diagnosis. No
  production writes/configuration changes. Screenshot incident attribution
  remains limited to observed evidence.
- **MR1:** shared disposable-preview budget in `HoverVideo`: release source on
  leave/replacement/viewport exit/hidden/offline/Data Saver; one at a time.
  Both apps inherit this seam. Red→green resource tests, both suites/builds,
  real browser network and desktop/375px screenshots. Not full-player closure.
- **MR2:** shared safe diagnostics and transport-injected exact-carrier/media
  recovery with bounded reader-scoped single-flight. Expiry, missing, denied,
  offline and obsolete-identity tests. No new generic signing endpoint.
- **MR3:** wire every coverage row in small units; include same-ID ad refresh,
  native/audio/full/immersive players. Shared imports alone do not prove
  coverage. Coordinate with existing Music/media/identity owners.
- **MR4:** complete adverse-network matrix and connected acceptance; count
  lingering downloads after scrolling, prove expiry/denial and explicit intent.
  Tune page sizes only against before/after data.

Deployment is separate. Do not disable Cloudflare or relax access to hide the
problem. Existing Music/thumbnail repairs must be checked rather than redone.
