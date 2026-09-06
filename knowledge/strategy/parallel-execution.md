# Parallel Execution

Companion to `plan.md`. That file says **what** and **why**; this file
says what can happen **at the same time**.

> The previous lane queues are archived at
> `archive/parallel-execution-17.08.2026.md`. This is a fresh board. Add
> lanes as work is scoped.

---

## Rules

1. **Lane ownership** — each lane owns its directories. No lane edits
   another lane's files. Cross-lane seams go through `.context/` notes.
2. **Merge small, merge often** — branches live days, not weeks.
3. **Every branch updates the changelog** — add a `CHANGELOG.md` line,
   tick the `plan.md` item, tick your lane item here.
4. **Bite sizing** — one bite = one PR ≈ 20-40 focused minutes.
   If an item needs an "AND", split it.

## Status Key

| Mark | Meaning |
|------|---------|
| `[✓]` | Merged |
| `[~]` | In flight in another workspace |
| `[ ]` | Open |

---

## Lanes

<!--
Format per lane:

### Lane: <name> (Phase N)
**Owns:** `<dir>`

- [ ] <bite>
-->

### Lane: hello-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/hello/`

- [✓] Auth flow completes without errors
- [✓] Greeting shows correct username
- [✓] Groups listed correctly
- [✓] Session restores on page reload
- [✓] No console errors in any flow
- [✓] Full E2E test with popup + log sequence verification

### Lane: notes-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/notes/`

- [✓] Auth flow completes without errors
- [✓] Create note works
- [✓] Read/list notes works
- [✓] Update note works
- [✓] Delete note works
- [✓] Data persists after page reload
- [✓] No console errors in any flow
- [✓] Full E2E test with popup + log sequence verification

### Lane: auth-consent-forks (Phase 1)
**Owns:** `ui/src/components/Consent/`, `ui/src/interfaces/`, `e2e/tests/auth-popup-roundtrip.spec.ts`

The authenticator consent screen is the shared seam every demo drives. The
round-trip spec drove only the single "Allow" + "Close window" forks. The
**approve-all** fork had a real bug — it dropped the app-contract response, so
the opener's callback fired late, mis-delivered from the group's response —
that no test could see, because the bug lived only in the `approveAll` code
path. The **fork rule** in the AI Use Theory (`knowledge/ai-use-theory/testing.md`)
is the fix: a feature is covered only when the seam is driven through *every*
fork. This lane drives every remaining fork through the real popup.

- [✓] Approve-all fork: app + group contract via "Approve all" (not single Allow) — fixed the dropped app-contract response (shared `approveOne` helper so the two forks can't diverge) + E2E with the bug-catcher assertion
- [✓ 3.3.0] Deny fork: single "Deny" (X) on the app contract → demo handles `denied` gracefully (message, no crash, fix-access appears)
- [✓ 3.3.0] Deny fork: single "Deny" on the group contract → demo proceeds (group is optional, `initApp` still runs)
- [✓ 3.3.0] Skip fork: "Continue without sharing" → token sent, no contracts granted, demo shows fix-access on first CRUD
- [✓ 3.3.0] All-set fork: already-granted ACR is filtered out → "You're all set" renders → "Close window" closes the popup
- [✓ 3.3.0] Logout fork: "Not you? Log out" → returns to login, pending contracts cleared, no stale state
- [✓ 3.3.0] Details fork: expand/collapse chevron renders the permission diff (added/removed/same chips) for a re-request
- [✓ 3.3.0] Mixed fork: approve app + deny group in one session (and the reverse) — each response matches its own contract
- [✓ 3.3.0] Edge fork: approve-all with zero pending contracts → `goToApp` early return, no crash
- [✓ 3.3.0] Fix-access fork: revoke → "Fix access" through the REAL popup (retire the `popup.close()` + raw-API workaround in `notes-demo.spec.ts` — a seam-rule violation the theory now names)

### Lane: messages-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/messages/`

- [✓ 3.5.0] DM group contract: create invite_only group with deterministic ID
- [✓ 3.5.0] Send message via CRUD (attach to DM group)
- [✓ 3.5.0] Receive/read messages via group read
- [✓ 3.8.0] WebRTC: initP2P with token, connect to peer
- [✓ 3.8.0] WebRTC: send data over P2P channel
- [✓ 3.8.0] WebRTC: receive data via onInbound callback
- [✓ 3.8.0] E2E test: DM CRUD + WebRTC P2P round-trip (DM CRUD half done in 3.5.0; WebRTC P2P half done in 3.8.0)

### Lane: groups-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/groups/`

- [✓ 3.2.0] Create group with roles
- [✓ 3.2.0] Join policy: open (instant join)
- [✓ 3.2.0] Join policy: request (approve/deny)
- [✓ 3.2.0] Invite member with role
- [✓ 3.2.0] Leave group
- [✓ 3.2.0] Remove member
- [✓ 3.2.0] E2E test: group lifecycle + join policies

### Lane: media-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/media/`

- [✓ 3.6.0] Upload image to MinIO (presigned URL)
- [✓ 3.6.0] Create document with minio type in body
- [✓ 3.6.0] Read document back, verify presigned URL resolved
- [✓ 3.6.0] Display image from presigned URL
- [✓ 3.6.0] E2E test: upload → create → read → display

### Lane: feed-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/feed/`

- [✓ 3.7.2] Create/join discover group (open, auto-join)
- [✓ 3.7.2] Post to discover group
- [✓ 3.7.2] Create followers groups for 2-3 test users
- [✓ 3.7.2] Follow creators (join followers groups)
- [✓ 3.7.2] Read combined feed from discover + followers
- [✓ 3.7.2] E2E test: post → follow → read combined feed
- [✓ 3.17.6] Fix: use the node-default discover group — the demo was still on the stale per-user model from 3.7.2 (it asked users to "set up your discover group" through the consent popup). Now it reads the universal board `web10.app/groups/web10/discover` under the `posts` service (the same service + group the social app and marketing site use), no setup step; e2e re-aligned (contains-assertions, since the board is a shared node default)

### Lane: sharing-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/sharing/`

- [✓ 3.7.0] Create group, post to it
- [✓ 3.7.0] Block sharing per group (toggle off)
- [✓ 3.7.0] Verify posts hidden from members when sharing blocked
- [✓ 3.7.0] Unblock sharing (toggle on), verify posts reappear
- [✓ 3.7.0] User-wide blacklist: block a user
- [✓ 3.7.0] Per-group blacklist: block a user from one group
- [✓ 3.7.0] E2E test: share → block → verify hidden → unblock → verify visible
- [✓ 3.8.1] Fix: "sharing group ready" printed twice (root cause: `authListen` re-fired on a redundant same-user token — now deduped in the SDK, D45 + demo idempotency + anti-test)

### Lane: retire-obsolete-e2e (Phase 1)
**Owns:** `e2e/tests/`

Pre-v3 e2e specs testing removed endpoints / ghost demo locations / broken
flows. Approach: **cut the broken bodies**; STUB (`test.skip` + comment) where
the feature still belongs in v3 (the stub documents the v3 intent + rewrite
path); DELETE where the feature is gone in v3. Coverage absorbed by the Phase
1 per-demo E2E lanes + `api/tests/test_v3_conformance.py` (I3 contract
enforcement).

**DELETED (whole spec — ghost location / removed endpoints):**
- [✓ 3.0.61] `demo-cr-flow.spec.ts` — ghost `sdk.localhost/demos/` location (demos moved to `marketing.localhost/docs/`) + old `/v3/documents/*` paths. Groups browser flows → `groups-demo` lane. (PR #648)
- [✓ 3.0.61] `consent-grant.spec.ts` — legacy `/signup` + removed `/certify`/`/posts`/`/services`. v3 consent → `auth-popup-roundtrip.spec.ts`. (PR #648)
- [✓ 3.0.61] `terms-revoke.spec.ts` — removed `/posts`/`/services`. v3 contract-revoke → `auth-popup-roundtrip.spec.ts`. (PR #648)

**GUTTED + STUBBED (feature belongs in v3 — rewrite later):**
- [✓ 3.0.61] `app-store.spec.ts` — "token handoff" (v2 `/certify` + `/{username}/posts`) → v3 app-contract + `/v3/create`. (PR #648)
- [✓ 3.0.61] `social-post-feed.spec.ts` — "signup+token+CRUD" (v2 `/certify`) + social render. (PR #648)
- [✓ 3.0.61] `studio-metering.spec.ts` — 3 metering tests (v2 star-record `credits_spent`) → v3 billing. "aggregate" DELETED (v2-only `/aggregate`, gone in ClickHouse). (PR #648)
- [✓ 3.0.61] `exporter.spec.ts` — marketing-api `/health` + `/import` pipeline (v2 node API). (PR #648)
- [✓ 3.0.61] `social-full.spec.ts` — posts/comments/reactions/DM (v2 `/{username}/*`) → v3 service-based CRUD + DM groups; social render. (PR #648)
- [✓ 3.0.61] `gauntlet.spec.ts` — 5 social-app render tests + 2 v3-API tests (join-approval, cross-user isolation I3) that were FAILING on correct v3 login → investigate (possible real bugs). (PR #648)

### Lane: hls (Phase 2)
**Owns:** `api/app/v3/endpoints/media.py`, `api/app/services/{transcode,hls}.py`, `marketing/marketing-ui/public/docs/media/` (demo player), `e2e/tests/hls.spec.ts`

HLS is v3 (D44) — "the one feature that makes this legit legit youtube vs
bs." Upload → in-process ffmpeg worker (dedicated daemon threads, NOT the
FastAPI request pool, bounded concurrency) → HLS renditions (360p/720p/
1080p) + thumbnails → MinIO → signed manifest + JWT on every segment
(bifurcated auth) → hls.js playback (Safari native). The KB is aligned and
is the spec: `knowledge/knowledge-base/web10-v3/media/`
(`transcoding-foundation.md` = the model, `transcoding.md` = the pipeline,
`minio-auth-bifurcated.md` = the auth split, `streaming.md` = the layers).
P2P stays v4 — do not build it here.

- [✓ 3.9.0] Transcode worker: video upload → ffmpeg (subprocess) → 360p/720p/1080p HLS renditions + thumbnails → MinIO → document updated with `transcoding_settings` (status: processing → done|failed; the doc is the status surface) — `api/app/services/transcode.py` + `POST /v3/media/transcode`
- [✓ 3.9.0] Signed manifest + segment serving: a read mints a 10-min JWT (sig) bound to (reader, doc, hls prefix); the manifest endpoint verifies the sig AND re-checks access (author or group membership) — the expiry is the re-check cadence. Master manifest synthesized from `transcoding_settings.variants` (doc is source of truth, manifest is a view); variant manifests rewrite every segment to a signed URL; segments stream from MinIO sig-only (no DB, traversal rejected) — `api/app/services/hls.py` + `GET /v3/media/hls/{manifest,variant,segment}`
- [✓ 3.9.0] Player in the media demo (the HLS unit test): upload → queue transcode → poll the doc → hls.js playback (Safari native fallback, vendored hls.js) — `marketing/marketing-ui/public/docs/media/`
- [✓ 3.9.0] E2E: API floor (upload → transcode → manifest → variant → segment bytes, MPEG-TS sync byte) + anti-tests (no sig / EXPIRED sig / cross-doc sig / non-member sig / traversal) + browser gauntlet (real demo: upload → "HLS ready" → hls.js manifest parsed → video duration > 0, log sequence) — `e2e/tests/hls.spec.ts` + 40 API unit tests in `api/tests/test_hls.py`
- [✓ 3.10.0] Aspect-ratio policy + social-style demo: renditions planned per-source (target by height, preserve source ratio, never upscale, even dims — the squashed-9:16 bug); thumbnails ratio-preserving; fps probed; two ffprobe bugs the new e2e caught (csv unpack, webm `format.duration = N/A` → stream fallback). Demo: upload-style toggle (Original / TikTok 9:16 / Instagram 4:5 / Square 1:1) + client-side reframe before upload (canvas cover-crop + MediaRecorder — node gets the finished file) + player spec (muted autoplay, quality dropdown via hls.js levels, speed, fullscreen, vertical layout). KB: new `video-experience.md`. E2E: vertical + landscape fixtures, ratio/no-upscale assertions, tiny-source test, style-toggle gauntlet — `api/app/services/transcode.py`, `marketing/marketing-ui/public/docs/media/`, `e2e/tests/hls.spec.ts`, `api/tests/test_hls.py`
- [✓ 3.9.1] web10-social adoption: moved to the `social-v3` lane (Phase 3) — the demo proves the pipeline, the app is the integration test

### Lane: social-v3 (Phase 3)
**Owns:** `marketing/web10-social/`

The social app is the integration test (Phase 3). It ran on two legacy
seams — `web10-npm@1.0.8` (v1 auth) and the hand-rolled `src/data/v3.ts`
(data) — and the convergence is on the SDK the demos already run on.
Both seams are now retired (3.11.0 auth, 3.12.0 data); what remains is
the hls.js player and the e2e gauntlet that proves it end-to-end.
The decision bite gated the seam bites — docs first.

- [✓ 3.9.2] Decision: converge on the SDK (`knowledge/strategy/decisions.md`) — D46. Retire both legacy seams, adopt the SDK the demos already run on (the reference implementation).
- [✓ 3.11.0] Auth: D42 login through the real consent popup (the same flow the demos run) — the LoginScreen's one-tap survives via auto-complete
- [✓ 3.11.0] Auth: sign-out scrubs token + cookie; session restores on reload
- [✓ 3.12.0] Data: `getV3Client()` returns the SDK's `createV3Client` — retire the hand-rolled fetch client, data modules keep their API
- [✓ 3.28.1] Media + profile persistence (operator bug: "uploading a profile photo gives me error … the whole profile page is extremely broken, i cant even change my name / website"): `uploadMedia` is now the real presigned flow (form → MinIO POST → confirm with `object_key`, never a URL); `refreshMediaUrls` presigns via `getMediaReadUrl`; `resolveMediaRefs` handles the dual ref shape (API-resolved objects = the cross-user path, string doc_ids = `listMedia(doc_ids)` + presign); `mediaRefId` at every `mediaMap` indexing site; `saveProfile` calls `ensureFollowers` before writing (the 3.25.3 settings pattern — profile.ts was the named unfixed sibling); persistent hidden file input (`profile-file-input`) makes the upload seam e2e-drivable. Cross-lane touches: the API's `media/confirm` + `media/list` now return document envelopes (the SDK's `V3Document` was the contract; the API was the drifted side) + `list_media` `doc_ids` filter + `resolve_media_urls` fresh-presign-from-object_key (hls lane's `media.py`/`clickhouse.py`), SDK `listMedia` doc_ids
- [✓ 3.38.2] Profile screen heals broken node state (operator: "still having issues … confused how much it doesnt work" — the dev node's pre-fix state: phantom-member followers group + stale app contract): `ensureFollowers` now heals the phantom-member state (group exists but user not a member — the pre-3.25.1 `web10.app/users/{username}` member key — via `getMyGroups` check + `joinGroup`; no join when already a member, which would downgrade the owner role on merge); the profile owner path's `loadData` is per-read isolated (one `members/list` 401 degrades the Following tile, never blanks the screen — the feed's 3.25.x pattern)
- [✓ 3.39.0] Session health — the confirmatory `verifySession` oracle + the SessionGuard (operator: "is there any way we can recover from bad state? … the social app could sign out! … wouldnt want to over do it … how would we detect the state is just bad"): `POST /v3/session/verify` runs the real checks (token decode incl. the custom `expires` claim, user lookup, app-contract check, followers-group membership) and returns a typed verdict + ordered `actions` — the node is the oracle, the client never guesses from status codes. The load-bearing rule (**definite NO vs. UNKNOWN**): an UNREADABLE store yields `unknown` (no action), a readable+EMPTY store yields the decisive negative (action) — a deploy window must not look like "contract missing". The app's SessionGuard (`src/data/session.ts`) executes the `actions` (`reauth` replace-on-arrival / `heal_followers_group` / `signout`) with a 5-min cooldown (the loop-breaker → "Log in again" banner). Wired on mount (reauth deferred — no popup on page load) + on a reactive 401/403. Cross-lane: API endpoint + model, SDK `w.verifySession()` + types, KB `sdk/api.md` "Session Health" section, `e2e/tests/session-verify.spec.ts` (the dirty-node seatbelt — seeds each bad state, asserts the verdict + the browser heal gauntlet)
- [✓ 3.31.0] Mobile bottom nav "More" tab (operator: "the mobile responsive view is too crammed at the bottom, because we have so many coming soon things … maybe a burger where some of the things are on the side" → chose the More sheet over a burger): the mobile bottom bar is now **four core tabs (Feed, Discover, Messages, Profile) + a "More" tab** (never >5 icons, room to grow); the More sheet (the `AdPicker` bottom-sheet idiom) holds **Settings** + the **coming-soon list** (Flares/Takes/Livestream/Games/Marketplace) so the roadmap is discoverable on mobile; the **"Help" (report-bug) tab moves from the bottom bar to the mobile top header** (already holds New-post + Log-out). Desktop sidebar unchanged. `src/components/Social/Layout.tsx` + `socialScreens.test.tsx` (the "coming-soon NOT in mobile bottom nav" test → two tests: bar = 4 core + More, sheet holds Settings + coming-soon; Help in the header, not the bar).
- [✓ 3.32.0] Groups screen: the "coming soon" Groups tab is now real — My Groups (community memberships, infra groups filtered) + Discover (the D53 directory, search + topic filter) + the deep-linkable detail (`/groups/:id`). Data layer: `readGroupDirectory` + `readGroupDetail` (the public GET endpoints) + the community-group filter. 22 unit tests + screenshot harness routes. Groups is a real destination: desktop sidebar + mobile More sheet (alongside Settings), NOT a bottom-bar core tab.
- [✓ 3.38.0] Feed knobs (D36 amendment — operator lifted the "knobs on the chronological feed" reject): the feed carries the same D36 rack as Discover (presets + rotary knobs, power-mean re-ranking, client-side). Default = the Newest preset (chronological until tuned — the delivery pitch survives as the out-of-the-box experience). Knob state is deep-linkable (`?knobs=`, same encoding as Discover) AND persisted to the user's web10 `settings` service (`feedKnobs` on the settings doc — the 3.25.3 pattern; URL > saved > default). `readFeedEngagement` (the ref pattern) gives the likes/comments knobs real signal. 16 unit tests.
- [✓ 3.34.0] Feed media renders at natural aspect ratio, not a 1:1 crop (operator: "all the videos were in this 1:1 ratio … it should be the dims of the video ideally … in the profile view when i click the vids, they look great though!"): the read path was dropping the stored dimensions — **API (cross-lane touch, `api/app/v3/services/clickhouse.py`)** `resolve_media_urls` now carries `width`/`height`/`duration_seconds` + a presigned `thumbnail_url` (additive); **client** `types.ts` `fromResolvedMediaRef` maps them, `FeedScreen.tsx` `MediaItem` renders `object-contain` at the natural ratio (capped `max-h-[60vh]`, measure-on-load fallback for legacy), and `MediaGrid` is **option (b)** — first item at natural ratio + a count badge (the lightbox carousel handles the rest). 816 API + 236 social tests green.
- [✓ 3.39.0] Real-time messages (WebRTC P2P) + presence: the social app adopts the messages-demo's P2P pattern (CRUD = source of truth, P2P = the fast path). `src/data/p2p.ts` (the seam: initP2P / sendP2P / onP2PInbound / presence set) wraps the SDK's `web10-npm/rtc` (PeerJS). On sign-in, when `p2pEnabled` is on (default), App opens the peer; a sent DM is also pushed over the data channel, and an inbound nudge re-reads the open conversation. Presence = the peer is open: the other party shows Online/Offline (green/gray dot + label) from live connections + a "Real-time" status chip. Opt-out (Settings → Real-time Messages toggle) tears down the peer — CRUD-only, shown offline. `peerjs` added as a dep; `v3.ts` sets `rtcServer`; `AppSettings.p2pEnabled` (default on); screenshot harness aliases `@/data/p2p` to a no-op (no real signaling connection). 11 unit tests (`p2p.test.ts`) + screenshot harness (settings toggle + presence dots verified).
- [✓ 3.40.0] Presence offline detection: the presence dot flips gray when a peer disconnects (3.39.0 stuck green). `src/data/p2p.ts` — connection-close hooks (send path opens the channel via `connect()` + hooks `close`; inbound path hooks the sender's conn) for immediate offline + a TTL backstop (per-peer `lastSeen` + 15s sweep expiring peers idle past 60s) for missed close events. `markOffline` notifies presence subscribers (DmsScreen dot/label flip automatically, no component change); `teardownP2P` stops the sweep + clears `lastSeen`. 5 new unit tests (`p2p.test.ts`), 292 green.
- [ ] Video editor before posting: client-side **trim** (in/out points + re-encode) + **resize/crop** — the operator's "we can do more! all those features to edit the video trim, resize before posting." A client-side editor (canvas / MediaRecorder or ffmpeg.wasm for re-encode); partly dissolves once the feed renders natural ratios (resize-to-fit stops being a problem), trim is the piece that stays. Its own lane item, gated on the hls.js player.
- [ ] Video: hls.js player for video posts in the feed (Safari native fallback, vendored hls.js) — moved from the `hls` lane

### Lane: social-e2e (Phase 3)
**Owns:** `e2e/tests/` — each bite owns its own spec file, so the bites
parallelize across workspaces (breadth, not depth).

The social app is the integration test (Phase 3). The retired social specs
(3.0.61: `social-post-feed`, `social-full`, `gauntlet`) are the rewrite
path. Same pattern as the demo specs: API floor + anti-tests + browser
gauntlet with log-sequence verification. **Organized by surface, not by
test layer** — each surface is an independent spec (separate route,
separate `src/data/` module, no shared code under test), so six workspaces
can run six specs at once. The only shared seam is login (the D42 popup) —
already torture-tested by `authenticator-torture` + `auth-popup-roundtrip`
(gate cleared, 3.11.0); each spec uses it as infrastructure, never
re-tests it. The platform-primitive API floors already live in the demo
specs (`feed-demo` = multi-group read, `groups-demo` = group lifecycle,
`messages-demo` = DM CRUD, `sharing-demo` = block/share) — the social API
floors stay thin: they pin the app's exact read pattern (what the app
actually queries), not a re-proof of the primitive. I3 anti-tests are
per-surface: each spec proves isolation for its own surface. The discover
board is a shared node default — posts to it get contains-assertions, not
exact counts (the `feed-demo` pattern).

- [✓ 3.26.0] Feed (`e2e/tests/social-feed.spec.ts`) — API floor: the app's exact feed read (discover + followers multi-group, sort config) + I3 (a non-follower's group post is absent). Browser gauntlet: real D42 login → feed renders → post → reload persists.
- [✓ 3.25.1] Groups (`e2e/tests/social-groups.spec.ts`) — the app's groups surface: follows (followers groups) as the app drives them — follow → the creator's posts enter the feed → unfollow → they leave. API floor: the follow/unfollow group ops + the feed-read delta. Browser gauntlet: follow/unfollow through the app, feed reflects it. (Group *management* — create/roles/invite — is the authenticator + marketing directory surface; its floors live in `groups-demo`.)
- [✓ 3.26.3] Profiles (`e2e/tests/social-profile.spec.ts`) — API floor: profile doc + posts read + follower count; I3 (a stranger's private data is not readable). Browser gauntlet: own profile (edit persists) + another user's public profile + the `/u/:username/p/:postId` deep link.
- [✓ 3.28.1] Profiles torture layer (`social-profile.spec.ts`) — the 3.26.3 gauntlet pre-created the followers group via API and only edited the bio, so the cold-start save path and the upload seam were never driven. New: API floor (the app's exact upload pattern — upload-url → presigned POST → confirm envelope → list(doc_ids) → read-url → the blob serves back the exact uploaded bytes; profile write round-trip through the app contract + no-contract-origin 403 anti-test) + browser gauntlet (COLD START — no group, no doc: edit name/website/bio → the app creates the group (node-level assert) → persists across reload; AVATAR UPLOAD — real file via setInputFiles → presigned avatar renders (naturalWidth > 0) → persists across reload).
- [✓ 3.25.2] Messages (`e2e/tests/social-messages.spec.ts`) — API floor: DM group contract + CRUD (deterministic DM group ID). Browser gauntlet: two-user DM round-trip through the app (send → receive → reply).
- [✓ 3.25.3] Settings (`e2e/tests/social-settings.spec.ts`) — API floor: settings doc read/write round-trip. Browser gauntlet: change a setting → persists across reload + sign-out/sign-in.
- [✓ 3.26.2] Trending (`e2e/tests/social-trending.spec.ts`) — the `/discover` board surface (the in-app trending: D36 knobs over the node-default discover group). API floor: anon board read + engagement counts. Browser gauntlet: the board renders seeded posts, the knobs re-rank, deep-linkable state. (Complements the `discover-board` lane's board gauntlet — that one owns the moderation ops: seed → anon read → hide/restore round-trip.)
- [✓ 3.32.0] Groups directory (`e2e/tests/social-groups-directory.spec.ts`) — the app's Groups screen (distinct from the follows surface in 3.25.1): the D53 directory + detail reads. API floor: directory lists discoverable + excludes non-discoverable; detail reachable for an existing group / a ghost 404s; **I3** — a non-member detail read returns NO posts; join/leave membership. Browser gauntlet: Discover → join an open group → it appears in My Groups → the detail deep link renders, log-sequence verified.
- [ ] Capstone gauntlet (`e2e/tests/social-gauntlet.spec.ts`) — one journey across all screens (login → feed → post → profile → DM → follow → settings → reload), log-sequence verified. **Gated on all six surface specs above.**

### Lane: discover-board (Phase 3)
**Owns:** `api/app/v3/` (discover group + board read + admin discovery), `persona-orchestration/`, `marketing/marketing-ui/src/components/FeedPreview.tsx` + `src/pages/Trending.tsx`, `ui/src/components/Config/ConfigPage.tsx`

The node-default universal public board. The discover group
(`web10.app/groups/web10/discover`) is a NODE DEFAULT — created at boot,
anon + every user a member, auto-enroll at signup, backfill pre-existing
users. Discovery IS a group read: the board is the discover group in the
`groups` list, read anon through the anon-capable `/v3/read` (no separate
discover endpoint — the v2 `/discover/posts` is not resurrected). Persona
seeding posts to the group so the marketing trending page + in-app Discover
look alive.

- [✓ 3.16.2] Node-default discover group: boot-time `ensure_discover_group()` (create + anon + backfill), auto-enroll in `create_user`, idempotent
- [✓ 3.16.2] Anon-capable `/v3/read`: missing token reads as `anon` (the board), app-contract gate for real users only, I3 holds (anon can't read non-member groups)
- [✓ 3.16.2] `ref_value` on create (the ref pattern was broken on the write path — reactions/comments couldn't reference their target)
- [✓ 3.16.2] Board moderation as a group op: `POST /v3/groups/{hide,unhide,hidden}` (gated by `hideAll` OR node admin — the public board has no moderator role), `get_hidden_docs`, anti-join dedup-then-filter
- [✓ 3.16.2] Persona seeding for v3: `seed_personas.py` rewritten off v2 (terms/schemas/ledger) onto groups — posts + reactions/comments via `ref_value`, idempotent, `--verify`
- [✓ 3.16.2] Marketing trending + admin board rewired to the normal group read (anon); trending computes engagement client-side from the reactions/comments groups
- [✓ 3.18.2] Power-mean ranking in the backend (D36, feed-lens-integration) — `/v3/read` gains an optional `sort` config (recency/likes/comments weights, `half_life_ms`, `character` p); the node computes the score over the full group membership and returns pre-sorted results (mirrors `marketing-ui/src/lib/powerMean.ts` so client + server rank identically). Also un-reds the 12 stale `Trending.test.tsx` reds (the mock was still on the v2 `/discover/posts` shape — re-aligned to the v3 `/v3/read` discover-group shape)
- [✓ 3.21.1] Power-mean ranking v1 scale-up — the sort path moves from Python (full membership fetch + in-process sort) into ClickHouse: shared `_board_base_sql` fragment, exact engagement counts via one grouped scan of reactions + comments (option B, no counter table — operator: "this is clickhouse"), SQL power-mean score, `ORDER BY` + `LIMIT`/`OFFSET` in the DB. Real-CH equivalence check proves the SQL score matches the Python reference to ≤1e-9
- [✓ 3.38.1] fix(api) + fix(marketing-ui): /trending consumes the v3 read shape + the API serializes datetimes as ISO 8601 UTC (the 3.16.2 rewire's two regressions, root-caused). (1) Negative times: `/v3/read`'s naive `str(datetime)` `created_at` was parsed as local time (west-of-UTC → future) — **API** now emits ISO 8601 UTC via `_iso_utc()` (every `str(row[N])`/`now.isoformat()` datetime site; `_from_iso_utc()` for the update round-trip), fixing every client at once; **marketing-ui** `parseCreatedAt()` stays as a defensive fallback. (2) Empty Video view: the v3 read serves `media_refs` pre-resolved (objects with `mime_type` + `read_url`), but the page treated them as strings + hardcoded `first_attachment_mime: undefined`, so media was tag-detected only; now `first_attachment_mime` derives from the resolved ref and `TrendingMedia` uses `read_url` directly (no token-gated presign round-trip). 6 marketing-ui tests (241 green) + 835 API tests green.
- [ ] E2E: board gauntlet — seed → anon reads the board → a real user's post appears → remove/restore round-trip (gated on the social-e2e stack)

### Lane: content-moderation (D59)
**Owns:** `api/app/v3/services/moderation.py`, `api/app/v3/endpoints/moderation.py`, `api/app/v3/models/moderation.py`, `api/app/v3/endpoints/documents.py` (the create hook), `api/app/services/config.py` (defaults), `api/app/models/config.py`, `api/tests/test_moderation.py`, `ui/src/components/Config/ConfigPage.tsx` (the Moderation card), `ui/src/__tests__/configModeration.test.tsx`, `clickhouse-init/001-init-v3-schema.sql.template` (moderation_flags)

Content moderation (D59): sensitive-language detection + discover suppression,
built on the existing `group_hidden_docs` mechanism. A whole-word,
case-insensitive blocklist in `node_config` is checked on the post-create path;
a hit on a discover-group post is auto-hidden (the existing hide) + flagged.
A user on `auto_hide_users` is always auto-hidden. The review queue is
human-in-the-loop (the operator suppresses; the machine only flags). D41 holds
— suppression is board curation, not secrecy.

- [✓ 3.41.0] Decision: D59 (`knowledge/strategy/decisions.md`) + KB (`social/content-moderation.md` + `social/sensitive-words-default.md`, the ~50-word default list)
- [✓ 3.41.0] Config: four `node_config` fields (`sensitive_words`, `auto_moderate`, `moderation_enabled`, `auto_hide_users`) + `effective_config` defaults (no DDL — JSON blob) + the shipped default blocklist
- [✓ 3.41.0] Detection: `app.v3.services.moderation` — `check_text` (whole-word, case-insensitive), `moderation_config`, `should_auto_hide`, `record_flag` (best-effort)
- [✓ 3.41.0] Write-path hook: `create_document` moderates `posts` on the discover group — flag + (auto_moderate OR listed) `hide_doc_from_group(DISCOVER_GROUP_ID, …)`; best-effort (a moderation failure never fails the post)
- [✓ 3.41.0] `moderation_flags` table (DDL template + boot self-heal) + `insert_moderation_flag`/`get_moderation_flags` (the queue is a GROUP BY view)
- [✓ 3.41.0] Admin endpoints: `POST /v3/moderation/flags` (the queue) + `POST /v3/moderation/auto-hide` (add/remove from `auto_hide_users`)
- [✓ 3.41.0] UI: the Node Config "Content Moderation" card — master switch + auto-hide toggle (diff-only save), blocklist tag input, the review queue with "Keep hiding"/"Hiding"
- [✓ 3.41.0] Tests: 27 API (`test_moderation.py`) + 7 UI (`configModeration.test.tsx`) — detection, the hook, I3 scoping, the endpoints, the card
- [ ] E2E: moderation gauntlet — post with a flagged word → hidden from the board → operator keeps-hiding → next post auto-hidden → operator removes → next post visible (gated on the social-e2e stack)
- [ ] v1: profile name/bio detection (flag-only, not scanned on the post path in v0) + a retroactive-scan admin command + a user notification on auto-hide

### Lane: contact-auth (D61)
**Owns:** `api/app/v3/endpoints/recovery.py`, `api/app/v3/endpoints/auth.py`, `api/app/v3/services/clickhouse.py` (get_users_by_contact), `api/app/services/twilio.py` (channel-aware), `api/app/v3/models/auth.py`, `api/app/models/config.py` (require_contact), `api/app/services/config.py`, `api/app/exceptions.py`, `api/tests/test_recovery.py`, `ui/src/interfaces/Interface.tsx`, `ui/src/components/CredentialPage/ForgotForm.tsx`, `ui/src/interfaces/MockInterface.tsx`, `ui/src/__tests__/recoveryFlow.test.tsx`

Contact-anchored auth (D61): the account is anchored on a phone OR email,
verified by a 6-digit code. The contact is the front door (enter contact →
code → pick an account or create one → signed in). Sign-up, sign-in, and
password-change are the same flow. Node-config-gated (D10): `require_contact`;
web10.app turns it on. The 3.47.0 UI already calls the three endpoints — they
were never built (the changelog's "the API is 3.37.0" was wrong).

- [✓ 3.51.0] Decision: D61 (`knowledge/strategy/decisions.md`) + KB (`knowledge-base/web10-v3/auth/auth.md`)
- [✓ 3.51.0] API keystone: the three endpoints (request/verify/complete) + `get_users_by_contact` (phone OR email) + Twilio channel-aware (sms/email) + the `verify_token` gate + create-on-complete (unified signup)
- [✓ 3.51.0] Node config flag: `require_contact` (D10) + enforced in `POST /v3/signup` (401 `CONTACT_REQUIRED`)
- [✓ 3.51.0] Tests: `api/tests/test_recovery.py` (request/verify/complete, contact mismatch, bad code, node-config gate)
- [✓ 3.51.0] UI: the contact input (phone OR email) + verify_token plumbing + "create a new account" option + primary-sign-in routing
- [✓ 3.51.1] Refinement: the recovery send drops the username (the message is the console-configured Twilio Verify template — a username-less "your code is {{code}}, if you didn't request this ignore it"); `send_verification` no longer takes a username
- [✓ 3.56.1] E2E: the contact-anchored auth gauntlet (`e2e/tests/recovery.spec.ts`) — phone + email paths, create-on-complete, password-change, the anti-tests (contact mismatch, bad/expired/wrong-purpose verify_token, send rate-limit); the e2e stack runs the API in local-Twilio mode (`TWILIO_E2E`) so the fixed code "123456" completes the flow without real credentials
- [✓ 3.58.1] Fix: the recovery password-change 401s the new password — a same-second `updated_at` race. The five users-table mutators (`change_password`/`change_phone`/`set_email`/`verify_phone`/`verify_email`) wrote `updated_at` from ClickHouse `now()` (second precision) while `create_user`/`migrate_user` used Python microsecond `_now()`; in the same second the new row's `.000` ms tied/lost to the old row's real ms, so `get_user`'s `ORDER BY updated_at DESC LIMIT 1` returned the stale old-hash row. The mutators now use `_now()` (bound `%(updated_at)s`) so the new row strictly outranks the old one

### Lane: ads (monetization)
**Owns:** `ui/src/components/Studio/`, `api/app/v3/services/clickhouse.py` + `api/app/v3/endpoints/documents.py` + `api/tests/test_ads.py`, `e2e/tests/ads.spec.ts`, `marketing/web10-social/src/components/Feed/PostComposer.tsx` + the ad block

The creator-owned ads layer (D55 + the v3/v4 dissemination split): an ad is a
**`posts` document tagged `ad`** (the post's own text + media + a leaf-typed
`offer` + a `status`). **v3 is mad simple** — a document's `ad_preference` (a
column on `documents`) is `pinned` | `none`: the creator pins a specific ad to a
post, and the **read serves the doc with the pinned ad inline** (100% of the
time, I3-checked). Ads are organized into **albums** (Apple-Photos-style,
first-class; an ad in a few via a tag-like field). The full curation engine
(`round_robin` / `greedy` / `random`, the node-level density, the `signal` ×
`strategy` enums) is the **v4 vision**. The KB is the spec — read it first:
`web10-v3/social/ads.md` (the object), `web10-v3/social/ads-dissemination.md`
(the v3 design), and `web10-v4/social/ads-dissemination.md` (the v4 engine).

- [✓ 3.16.1] KB: the standard ad object + the Dissemination section + the two-layer note (`social/ads.md`) + D50 + D51
- [✓ 3.22.0] KB: the Ad Catalog + the composer integration (`social/ads-catalog.md`) + D54
- [✓ 3.23.0] KB: D55 — an ad is a `posts` doc tagged `ad`, not a service
- [✓ 3.25.0] The tagged-post ad (API conformance): the ad object through the existing posts CRUD + the feed read returns it + I3 — pinned by `api/tests/test_ads.py`
- [✓ 3.26.1] KB: the v3/v4 dissemination split — v3 is `pinned` | `none` (data-layer, the read serves the pinned ad inline, I3-checked, 100% density), the curation engine is the v4 vision; the three v3 questions resolved (`ad_preference` column on `documents`, albums first-class + tag-like ad→album link, inline read)
- [✓ 3.27.4] **v3 API: the read serves the pinned ad** — the `ad_preference` column on `documents` (`pinned` | `none` + `target`); the feed read joins to the pinned ad and returns the doc **with** the ad inline (100% of the time); the **I3 check** (serve the pinned ad only if the reader is a member of the ad's group, else no ad); the **albums** (first-class, an ad in a few via a tag-like field). Pinned by `api/tests/test_ads.py`. The foundation — gates the UI
- [✓ 3.28.0] **Ads tab (authenticator)** — the Studio's new Ads surface: **ads upload** (the ingest — create ads: media + offer + status → a `posts` doc tagged `ad`), **album making** (Apple-Photos-style: make albums, sort by album or all, add an ad to a few albums), **pin an ad to a post** (pick an ad → set the post's `ad_preference`). All states designed (empty → CTA, skeleton, error). `ui/src/components/Studio/`
- [✓ 3.29.0] **Composer pin control (web10-social)** — the "Pin an ad" control in `PostComposer`: pick an ad (from an album or all) to pin to the post, or none (sets the post's `ad_preference`); the ad block renders under the post (creative + offer + disclosure, disclosure never hidden). `marketing/web10-social/src/components/Feed/`
- [✓ 3.30.0] **E2E: the torture gauntlet** — create an ad → pin it to a post → follower sees the post with the ad block + disclosure → unpin → it's gone → non-follower never sees the ad (I3) → an ad in two albums shows in both. `e2e/tests/ads.spec.ts`
- [✓ 3.53.0] **Monetization bootcamp guide** (`knowledge/knowledge-base/web10-v3/social/monetization-bootcamp.md`) — the creator-facing ramp: which affiliate programs to join (the shortlist table), how to sign up (the website-list / 180-day rule, node-account vs creator-account), how the ad maker turns a link into a post that pays (offer kind/partner/link/cta/disclosure + pin-to-post + albums), and the "do it genuinely" principles. Docs only — derives from `ads.md` + `ads-catalog.md`, no code.
- [✓ 3.54.0] **Studio: the Affiliate Programs card** (`ui/src/components/Studio/AffiliateProgramsCard.tsx` + `studio-data.ts`) — the bootcamp factored into the Studio: the "START HERE" card in Rung 0 pointing a creator at the programs worth joining (each row = program + niche + commission + why + external sign-up link, new tab). Sits above the Ads card. 8 new Studio tests.
- [✓ 3.55.0] **Studio: retire the AmazonTagCard** (`ui/src/components/Studio/AmazonTagCard.tsx` deleted) — the single-global-tag "auto-affiliate-everything" card D55 rejected (the platform never rewrites the link; the tag lives in each ad's `offer.link`, set in the ad maker). Removed from the Studio + 4 tests.
- [ ] **Bootcamp page (marketing-ui)** — surface the guide as a `/docs/monetization` page (or a Studio link-out) so a first-time ad-maker lands on it. Gated on a docs-page surface in marketing-ui.

### Lane: node-ads (D57)
**Owns:** `api/app/v3/services/clickhouse.py` (node ad query + read-time attachment), `api/app/v3/endpoints/documents.py` (the read enrichment — the third join: `doc.ad` + `doc.node_ad`), `api/app/services/config.py` + `api/app/models/config.py` (`node_ad_percentage`), `ui/src/components/Studio/` (Ad Inventory card), `marketing/web10-social/src/components/Feed/` (renderer: `node_ad` tag → "Sponsored" label, both ads on the same post), `e2e/tests/node-ads.spec.ts`, `api/tests/test_node_ads.py`

The node operator's ad layer (D57, the second layer of the two-layer ad
model). **v3 is ads only** — no Stripe, no memberships, no tips (the
payment model is v4). A node ad is a `posts` doc on the discover group,
tagged `ad` + `node_ad`, authored by the node operator. The read attaches
active node ads to posts at the operator's configured percentage (default
10%). The attachment is read-time — the creator's `ad_mode` column is
never modified. The response is a **third join**: `doc.ad` (the creator's
pinned ad, if `ad_mode = 'pinned'`) + `doc.node_ad` (the node's ad, if
selected by the percentage). Both can be present on the same post — the
creator's monetization is never suppressed by the node's. The KB is the
spec — read it first: `web10-v3/social/node-ads.md`.

- [ ] **Decision: D57** (`knowledge/strategy/decisions.md`) — two-layer ad model (creator + node); v3 is ads only (no Stripe, no memberships, no tips — the payment model is v4); read-time attachment at a percentage; the third join (`doc.ad` + `doc.node_ad`, both can be present); usage-based pricing (MongoDB model); the v3/v4 split rationale (Stripe Connect = migration lock-in + onboarding friction)
- [ ] **KB: `node-ads.md`** (`knowledge/knowledge-base/web10-v3/social/node-ads.md`) — the node ad object, the read-time attachment (the third join), the density control, the renderer (both ads on the same post), the operator's revenue model (hosting + node ad revenue 85-90%), the "what this is NOT" (not a payment processor, v3 is ads only), security invariants
- [✓ 3.37.0] **`node_ad_percentage` config** (`api/app/models/config.py`, `api/app/services/config.py`) — new field on `NodeConfig` + `ConfigUpdate` (integer, 0-100, default 10); `effective_config()` defaults it; the Node Config UI exposes it
- [✓ 3.37.0] **Node ad query** (`api/app/v3/services/clickhouse.py`) — `get_active_node_ads()`: the bounded query (discover group, `tags ∋ 'node_ad'`, `status = 'active'`, LIMIT 20); called once per read, cached for the read's duration; defensive try/except (returns [] on any error)
- [✓ 3.37.0] **Read-time attachment (the third join)** (`api/app/v3/endpoints/documents.py`) — after the pinned-ad resolution, for each doc: hash(doc_id + reader_key) → if < percentage, attach a node ad as `doc.node_ad` (round-robin); the response carries both `doc.ad` (creator's, if pinned) and `doc.node_ad` (node's, if selected); the creator's `ad_mode` column is never written
- [✓ 3.57.0] **Renderer: both ads on the same post** (`marketing/web10-social/src/components/Feed/AdBlock.tsx`) — the post renders with up to two ad blocks: the creator's ad (`doc.ad`, their disclosure) + the node's ad (`doc.node_ad`, "Sponsored" label + node disclosure); both visible, neither suppressing the other. Ads render as posts (media-aware, creator violet / node amber dressing, disclosure names the author)
- [ ] **Ad Inventory card (authenticator)** (`ui/src/components/Studio/`) — the operator's surface: percentage slider (0-100), list of active node ads (creative preview, offer, status), create / pause / resume / retire node ads (writes `posts` docs tagged `ad` + `node_ad` to the discover group); all states designed (empty → CTA, skeleton, error)
- [ ] **Tests: unit** (`api/tests/test_node_ads.py`) — node ad query (returns active node ads from discover group, excludes paused, excludes non-node_ad, bounded at 20); read-time attachment (percentage 0 = no node ads, percentage 100 = all posts get a node ad, percentage 10 = ~10% get one, deterministic per (doc, reader), a `pinned` post gets BOTH `doc.ad` AND `doc.node_ad`, round-robin cycles through active node ads); I3 (node ad visible to all members of discover group, which is everyone)
- [ ] **Tests: e2e** (`e2e/tests/node-ads.spec.ts`) — API floor: operator creates a node ad → a reader's feed read returns a post with `doc.node_ad` (the `node_ad` tag present, the "Sponsored" disclosure) → a `pinned` post returns BOTH `doc.ad` (the creator's ad) AND `doc.node_ad` (the node's ad) → percentage 0 = no node ads → percentage 100 = all posts get a node ad. Browser gauntlet: operator creates a node ad via the Ad Inventory card → a follower's feed renders a post with the "Sponsored" ad block → a creator's pinned post shows BOTH the creator's ad AND the node's ad → no pageerror

### Lane: query-engine (D62)
**Owns:** `api/app/v3/services/safe_query.py`, `api/app/v3/endpoints/query.py`, `api/app/v3/models/query.py`, `api/app/v3/services/clickhouse.py` (`execute_query` + the boundary CTE), `api/tests/test_query_endpoint.py` + `test_safe_query.py`, `sdk/src/v3.ts` (`w.query`), `e2e/tests/query-engine.spec.ts`, `knowledge/knowledge-base/web10-v3/{query-engine,safe-query}.md`

The **flexible read** (D62): a caller writes a ClickHouse `SELECT` over their
services and the node runs it — read-only by construction. The safe-query
engine rewrites each service to an API-built boundary CTE (group-filtered +
block/sharing/hidden), so joins/aggregations/subqueries/CTEs all work and none
can leak past the caller's groups (raw tables unreachable — a wall, not a
membrane). Exposed as `POST /v3/query` + `w.query(sql, { groups? })`. Anon-
capable (D41), app-contract-gated, `LIMIT 1000` + 10s timeout. KB is the spec —
read it first: `web10-v3/query-engine.md` + `safe-query.md`.

- [✓ 3.52.0] **The boundary** (`safe_query.py`) — parse → validate → rewrite to boundary CTEs; `read_docs_by_ref` is the first consumer (the `ref` filter).
- [✓ 3.56.0] **Server-side engagement counts** (`read_ref_counts_by_ref`) — `GROUP BY ref_value` through the engine (exact, no cap).
- [✓ 3.58.0] **`query_services()` + `max_limit`** (`safe_query.py`) — the pre-flight (which services the query touches) + the `LIMIT 1000` performance bound (a caller `LIMIT` is honored; a union's trailing limit is seen).
- [✓ 3.58.0] **`POST /v3/query`** (`api/app/v3/endpoints/query.py` + `models/query.py`) — anon-capable, app-contract-gated (`query_services` before any group work), per-service D58 read gate, D42 "not a member" 403, caller-SQL → 400. `clickhouse.py` `execute_query()` + `QueryExecutionError`.
- [✓ 3.58.0] **`w.query()`** (`sdk/src/v3.ts`) — `w.query(sql, { groups? })` → `{ rows, count }`; token-less (anon); JSDoc examples + the ClickHouse `LEFT JOIN` count gotcha. `dist/` + `wapi.js` rebuilt.
- [✓ 3.58.0] **The ClickHouse 24.8 CTE-inlining fix** — the boundary CTE's block/sharing/hidden `LEFT ANTI JOIN`s broke CTE inlining when combined with a `JOIN` (`UNKNOWN_IDENTIFIER`), which also broke `read_docs_by_ref` + `read_ref_counts_by_ref` on a real node. Rewritten as `NOT IN` / tuple-`NOT IN` subqueries (semantically identical, verified live: block / group-block / sharing-pause self-exempt / hidden; empty → keep all).
- [✓ 3.58.0] **Tests** — API `test_query_endpoint.py` (20) + `test_safe_query.py` (+12) + `e2e/tests/query-engine.spec.ts` (the seam gauntlet: the power — self-join + aggregation + CTE + JSON; I3 — a non-member reads nothing; the contract gate; the membrane; anon).
- [✓ 3.59.0] **v1: a query playground demo** (`marketing-ui/public/docs/query/`) — an interactive SQL box over the signed-in user's groups (the "go crazy" showcase), reusing the demo auth pattern. Five clickable example queries (recent posts, trending self-join, reaction breakdown, hot-posts CTE, comments by author), a result table + loading/empty/error states, ⌘/Ctrl+Enter to run. Registered in `DEMO_APPS`; `tests/demos/query.spec.ts` (6) + a `query` method/branch in the demo mock.
- [✓ 3.60.0] **v1: per-user query rate limiting** (D65) — `/v3/query` rate-limited per user, keyed on the verified `user_key` (not IP — D49/D64), in-memory per-worker (the recovery idiom), 429 when exceeded. No Redis (D66).
- [ ] **v1: query governance (remainder)** — result caching for repeat queries, `EXPLAIN`-style cost hints in the response. (Redis deferred to the social real-time work — D66.)

### Lane: app-store-metrics (D49)
**Owns:** `api/app/v3/services/clickhouse.py`, `api/app/endpoints/`, `api/app/services/config.py` (n/a — D48), `sdk/src/`, `marketing/marketing-ui/src/pages/`, `clickhouse-init/`, `e2e/tests/`

The store's raw ping-count `visits` is retired as a metric (D49). Replaced
with real-user activity: one `app_visits` table, gated at ingest (1 row per
(app, real user) per 3h, anon dropped), metric-as-query (no counters to
race or pile on). `apps` becomes a stable registration record. Headline +
sort = `users_30d`. The `/stats` node macro shows the same active-user set
across all apps. The decision bite is done (D49); the build follows.

- [✓] Decision: D49 — real-user windowed metrics, anon dropped at ingest, `users_30d` headline, pagination, sign-in re-ping required (`knowledge/strategy/decisions.md`)
- [✓ 3.15.0] Table: `app_visits (app_url, username, seen_at)` + DDL template + boot self-heal
- [✓ 3.15.0] Ingest: gated append per (app, user) if latest `seen_at` > 3h (or first); anon dropped at ingest — verified token only (I2, no unsigned decode)
- [✓ 3.15.0] `apps`: stop appending per ping — append on first registration or real metadata change only; retire the `visits` counter column as a store metric
- [✓ 3.15.0] Metrics: `visits` (count of windowed rows) + `users_1d/30d/90d/1y` (distinct real users, trailing windows) — realtime over `app_visits`
- [✓ 3.15.0] Store: paginated app list (`limit`/`offset`, sort `users_30d` desc, `visits` tiebreak); grid card shows `users_30d` headline, detail page shows the full set
- [✓ 3.15.0] `/stats` macro: node-wide `users_1d/30d/90d/1y` (all apps, same query minus `GROUP BY`); homepage stat bar leads with the all-time `users` count (3.27.5 — operator preference: all-time, not the 30d window)
- [✓ 3.15.0] SDK: token in the register ping + re-fire the ping on the sign-in transition (required — else the metric means "returning users")
- [✓ 3.15.0] Hardening (folded in): #4 URL normalization in `register_app` (lowercase host, one trailing slash); #7 manifest byte cap in `/pwa_listing`
- [✓ 3.15.0] Tests: unit (gated ingest, anon-drop, forged-token I2 anti-test, metrics, pagination) + e2e (real signed-in user → active count; pagination boundary)
- [✓ 3.15.0] KB: `app-store/overview.md` metrics section + `db/clickhouse.md` `app_visits` table
- [✓ 3.17.2] D52 (spec, PR #682): decision + `app-store/endpoints.md` — page not modal, `GET /v3/apps/detail?url=` (public, pure read), URL is the key, reviews = rating + comment, D49's metric set + node macro
- [✓ 3.17.3] D52 (build): `GET /v3/apps/detail` (app + metrics + ratings + node macro; 404 unknown/unapproved; pure read)
- [✓ 3.17.3] D52 (build): `app_ratings.comment` (DDL + boot ALTER, named-column insert, 1000-char cap, canonical-url keying) + dedup-then-filter read in `get_app_ratings` + admin aggregate
- [✓ 3.17.3] D52 (build): `list_store_apps` drops the blanked `web10apps_post_id`
- [✓ 3.17.3] D52 (build): UI — card → `/app-store/app/{urlencoded-url}`, AppDetail rewritten (metrics, reviews, rate form with token-cookie session + SDK auth popup, node context)
- [✓ 3.17.3] D52 (build): tests — 12 API unit + AppDetail/AppCard unit rewrites + 4 e2e (detail payload, 404s, rating round-trip dedup, card → page seam)

### Lane: groups-directory (D53)
**Owns:** `api/app/v3/endpoints/groups.py`, `api/app/v3/services/clickhouse.py`, `clickhouse-init/`, `ui/src/components/` (group management), `marketing/marketing-ui/src/pages/` (or `web10-social/`), `e2e/tests/`

The group store (D53): a public, anon-browsable directory of the groups that
are listed, plus a flexible by-ID detail. Two orthogonal controls: a
**`discoverable` boolean** on `group_contracts` is the *blasting* flag (listed
or not) — **discoverable by default** (default `true`), except `invite_only`
groups (default `false`) and the discover group (explicit `false`);
**membership** controls whether a reader can see the posts (I3). The
directory is a **minimal, canonical view** (no table) over `group_contracts`
⋈ `group_members` ⋈ `group-identity-service`; tags + rich display live in
`group-identity-service`; topic search is a composition. The **detail** is a
flexible, principal-based read (unlisted-model): any existing group reachable
by ID, posts gated by the *reader's* membership, only a non-existent group
404s. I3 holds end to end. The KB is the spec:
`knowledge-base/web10-v3/groups/discoverability.md` + `detail.md`.

- [✓] Decision: D53 — `discoverable` boolean (blasting flag, **default `true`**, `invite_only` + discover group `false`) separate from membership (readability); directory = minimal view (no table); detail = flexible principal-based read (unlisted-model, no 404 for non-discoverable); tags in `group-identity-service`; search by composition (`knowledge/strategy/decisions.md`)
- [✓] KB: `groups/discoverability.md` (two controls, discoverable-by-default, minimal directory view, `group-identity-service` + tags, composition search, invariants) + `groups/detail.md` (unlisted model, listing/reachability/content split, principal-based read, metadata vs posts, why no constrained detail, invariants)
- [✓] Schema: `discoverable UInt8 DEFAULT 1` on `group_contracts` (DDL template + boot-time `ALTER ... ADD COLUMN IF NOT EXISTS`) + `create_group` default logic (True except `invite_only`→False, named-column insert) + `get_group`/`update_group`/`delete_group` carry it + `CreateGroup`/`UpdateGroup` models + create/update endpoints + discover group created `discoverable=False` + unit tests (default logic, named-column insert, discover-group non-discoverable, endpoint pass-through)
- [✓] API: `GET /v3/groups/directory` (anon, paginated) — the **minimal** list of `discoverable = true` groups: id, name (identity, else slug), owner, join policy, member count, tags, permission summary. No posts. View over `group_contracts` ⋈ `group_members` ⋈ `group_identity`
- [✓] `group_identity` table + read path — public display metadata (name, description, banner, avatar, website, tags), group-keyed, append-only; a table (not an I3-gated documents collection) because it's public; `get_group_identity` + `get_group_identities` (batch) feed the directory name + detail display. **⚠️ SUPERSEDED by D60 (3.44.0):** the table is deleted — the face is now documents in an app-named service (`web10-social-group-identity`); the directory/detail are generic (name = slug, no face).
- [✓] API: the group detail (`GET /v3/groups/detail?group_id=`) — public, principal-based (token optional, `user_or_anon`): metadata always for an existing group; posts only if the *reader* is a member (else "join to view"); only a non-existent group 404s (unlisted-model)
- [✓] Opt-in toggle in the authenticator — "List in directory" switch on each managed group card, controls `discoverable` only (anon readability stays a separate Manage-members action); `get_groups_manages` returns `discoverable`, `v3UpdateGroup` accepts it; unit tests (API manages shape + UI toggle on/off/managed-only)
- [✓] UI: the directory screen (`marketing/marketing-ui/`) — `/groups` grid (from `GET /v3/groups/directory`, search + tag filter) + `/groups/:id` detail (from `GET /v3/groups/detail`, posts when member else "join to view", 404 state); `GroupCard` + Navbar link; 14 UI tests (card, directory, detail)
- [✓] Tests: unit (identity read + slug fallback, directory query filters `discoverable=1`, directory endpoint shape, detail: ghost 404 / non-discoverable reachable / member sees posts / non-member "join to view" / anon reads as anon) + e2e (`groups-demo.spec.ts`: directory lists discoverable + excludes non-discoverable; detail 404s ghost / reaches non-discoverable; member sees posts, non-member "join to view")
- [✓ 3.24.0] D53 amendment: NOT discoverable by default — `create_group` defaults `discoverable` to `False` for every join policy (listing is an opt-in; `invite_only` special-case subsumed); DDL default `0` (template + boot `ALTER`); KB amended (decisions.md + discoverability.md)
- [✓ 3.24.0] Backfill (one-time, sentinel-gated) — `_migrate_discoverable_default_flip` delists groups created under the earlier discoverable-by-default rule; a `node_config` sentinel marks completion; only ever moves groups OUT of the directory; concurrent-safe; 3 API unit tests
- [✓ 3.24.0] Contract policy editors work (authenticator) — the "Settings" TODO becomes a real `GroupSettingsDialog` join-policy editor; roles editor + discoverable toggle verified end-to-end; `groupDisplayName` bug fixed (returned `users/<username>`, now the slug); 5 UI unit tests
- [✓ 3.24.0] Torture tests — `e2e/tests/group-contract-editors.spec.ts` (11 tests): API floor (join_policy/roles/discoverable update persists; I3 anti-test: non-member update rejected, the `CRUD` 401) + browser gauntlet (join-policy change → persisted + badge; cancel fork; save-failure fork → status-bar error, no crash; roles add → persisted; empty-role-name anti-test; discoverable toggle ON → listed / OFF → delisted)

### Lane: d58-backend (Stage 0 — the keystone, sequential)
**Owns:** `api/app/v3/endpoints/groups.py` + `services/clickhouse.py` + `models/` (role shape + gates + backfill + identity write), `api/tests/` (conformance re-pin).
**Task blocks + kickoffs:** `strategy/v3-groups-overhaul/stage-0.md` (umbrella: `strategy/v3-groups-overhaul.md`).

D58 replaces the group permission model the KB described but the code never
built. Roles become **per-service permission maps** (the `services` array was
decorative / unenforced). Access is granted to three **nested principal
classes** — `anyone` / `authenticated` / `member` (retiring the `anon`
misnomer) — stored as reserved keys in `group_members`. A principal's
effective role is the **union** of the grants on every class they belong to.
**Reads are role-gated** (content); **identity stays public** (the face).
Public / private = a role grant to `anyone` / `authenticated` — no new flag.
Management ops live under the reserved `'group'` service key. One role per
person (already the code). Closes the attach hole (the write side gets the
same per-service gate). Stays **v3** (operator: pre-prod). The KB is the spec:
`groups/access.md` + D58.

**This is the one stage that does NOT parallelize** — it is a single
coordinated change across `groups.py` + `clickhouse.py`. One workspace, done
in order. It gates Stage 1 and Stage 2. **Gated on the in-flight PRs that
touch these same files landing first** (#734 node-ads, #727 create-group) —
re-base off dev before starting.

- [✓] Decision: D58 (`knowledge/strategy/decisions.md`) — per-service role maps + principal classes + union semantics + reserved `group_members` keys + role-gated content reads + public identity + public/private via class grants + the `'group'` management key + one-role-per-person + the attach-hole fix + conservative backfill; stays v3
- [✓] KB — new `groups/access.md` (canonical model reference) + `identity.md` / `overview.md` / `discoverability.md` / `social-contracts.md` / `requests.md` / `detail.md` re-aligned to the per-service map shape + principal classes (the "service-scoped roles" + "multiple roles per user" fiction retired; `anon`-as-member → `anyone`/`authenticated` grants; membership-gate → effective-role-gate)
- [✓ 3.42.0] **1. Role shape + read gate + write gate** — roles stored as per-service maps; the read path computes the reader's **effective role** (union over `anyone` / `authenticated` / member role) and gates content reads on per-service `readAll` (replaces the membership-only check); the write/attach path gates on the effective role granting the op on the service (closes the attach hole); management ops check the `'group'` key. Both role shapes normalized on read (old clients keep working until Stages 1–2 migrate).
- [✓ 3.43.0] **2. Backfill (one-time, sentinel-gated)** — fan the old flat `permissions` out across the old `services` list (`['*']` → `'*'` key) over `group_contracts`; rename the discover board's `anon` member row → `anyone`; **conservative visibility default** (no existing group besides discover becomes `anyone`-readable — owners opt in). Role-shape fan-out in 3.42.0; the `anon` → `anyone` rename + the `ensure_discover_group` enrollment change in 3.43.0.
- [✓ 3.42.0] **3. Identity write endpoint** — the group's face (name, description, banner, avatar, website, tags) written to the public `group_identity` table, gated by a role grant on `group-identity-service` (owner / `page-curator`); lands *on* the D58 model
- [✓ 3.43.0] **4. Conformance re-pin** — I3 re-pinned from "membership grants access" to "effective role grants access"; stronger anti-tests (anon vs private group, signed-in vs signed-out, member ⊇ stranger ⊇ visitor monotonicity; the attach-hole anti-test). Pinned in `test_v3_access.py` (all five principal-class forks; the monotonicity invariant added in 3.43.0). The stub `test_v3_conformance.py` is a separate, larger effort.

### Lane: d58-demos (Stage 1 — parallel, one workspace per demo)
**Owns:** `marketing/marketing-ui/public/docs/<demo>/` — each demo owns its own dir, so the lanes never touch each other.
**Task blocks + kickoffs:** `strategy/v3-groups-overhaul/stage-1.md`.

**Gated on `d58-backend`.** The demos are the reference implementation (D46) —
they run the real SDK consent flow, so getting them green proves the backend
end-to-end before the social app (the integration test, Stage 2) builds on it.
Each demo below is an **independent lane** — N workspaces run N demos at once.
Per demo: adopt the per-service role-map shape in its `createGroup` role
literals (the old `{services, permissions}` → `{permissions: {service: [ops]}}`),
and drive a **public/private + identity fork** in its e2e (set the group's face
+ grant/revoke the `anyone` read role → assert a bystander's read).

- [✓ 3.45.0] **media-demo** — `docs/media/` (creates `media-{username}` with roles)
- [✓ 3.45.0] **notes-demo** — `docs/notes/` (creates `notes-{username}` with roles)
- [✓ 3.45.0] **sharing-demo** — `docs/sharing/` (creates `sharing-{username}` with roles)
- [✓ 3.45.0] **groups-demo** — `docs/groups/` (the richest — `ROLE_PRESETS`, create/join/roles/invite; the reference for the new shape)
- [✓ 3.45.0] **messages-demo** — `docs/messages/` (DM groups with roles)
- [✓ 3.45.0] **feed-demo** — `docs/feed/` (discover/followers groups with roles)
- [✓ 3.45.0] **tasks-demo** — `docs/tasks/` (user-named groups with roles)
- [✓ 3.45.0] **SDK role type** — `sdk/src/` `V3GroupRole` → the per-service map shape (the shared type the demos + social app both reflect; small, can run alongside)

### Lane: d58-social (Stage 2 — parallel, one workspace per feature)
**Owns:** `marketing/web10-social/` (fan-facing) + `ui/src/components/Groups/` (admin-facing) + `sdk/src/` (role type). Each feature below is an **independent lane** — different files, so they run in parallel.
**Task blocks + kickoffs:** `strategy/v3-groups-overhaul/stage-2.md`.

**Gated on `d58-backend`** (and ideally `d58-demos` green as the proven
reference). The social app is the integration test — it wires up what the
backend + demos already prove. Fan-facing (web10-social) and admin-facing
(ui/) are separate apps → separate parallel lanes.

- [✓ 3.46.0] **role definitions** — `web10-social/src/data/groups.ts` `FOLLOWER_ROLES` / `COMMUNITY_ROLES` / `DM_ROLES` → the per-service map shape (the shared seam; small, do early)
- [✓ 3.46.0] **group profile (fan-facing)** — `GroupDetailScreen.tsx` renders the group's face: banner (cover) + overlapping avatar + name + about + tags + website (the Facebook-shaped hero), from the `web10-social-group-identity` service (D60)
- [✓ 3.46.0] **public/private (fan-facing)** — the detail shows a public/private badge; the create-group dialog gains a visibility control (public / signed-in-only / private) that carries the initial `anyone`/`authenticated` grant
- [✓ 3.46.0] **group profile editor (admin-facing)** — `ui/src/components/Groups/` a profile editor (name, description, website, tags) next to the existing Settings/Roles/Members dialogs → writes the face via the normal CRUD path (D60)
- [✓ 3.46.0] **public/private control (admin-facing)** — `ui/src/components/Groups/` a "Who can read" control (public / signed-in-only / private = grant/revoke the `anyone` / `authenticated` read role)
- [✓ 3.46.0] **feed + detail effective-role read** — the detail renders what the role-gated read returns (a bystander on a private group sees the face + "join to view"; on a public group sees posts) — the API does the gating

### Lane: admin-console (Phase 3)
**Owns:** `ui/src/components/Config/`, `api/app/endpoints/system.py`, `api/app/services/config.py`

The node console's operator surfaces (Node Config panel first). The
panel is the node's control surface — it must show what the node
actually runs, and every control on it must work.

- [✓ 3.16.0] Node Config: effective config in the form (settings defaults ← saved overlay — no more blanks; ClickHouse URL + MinIO values default to the docker-network settings) + field trimming (Node Identity → provider/CORS/token-expiry; Stripe → mode + keys) + the dead Save button fixed (PATCH /config 405 → POST /config/update)

### Lane: platform-telemetry (D56)
**Owns:** `marketing/marketing-ui/src/lib/analytics.ts`, `marketing/web10-social/src/lib/analytics.ts`, `ui/src/lib/analytics.ts`, the three frontends' `main.tsx` + `Dockerfile`, `ubuntu-deployment/docker-compose.ecosystem.yml` (frontend build args), `knowledge/knowledge-base/web10-v3/telemetry.md`

Full-platform telemetry (D56): GA4 + Hotjar on every user-facing
surface, the recording content-blind by construction (maskAllText +
blockAllImages), GA4 events content-free by convention, max tracking
with `advertising_id: 'OFF'` as the single kept flag. The trade is
terms-level, not a consent popup. Supersedes the old "platform surfaces
stay recording-free" rule. The KB is the spec — read it first:
`knowledge/knowledge-base/web10-v3/telemetry.md`.

- [✓ 3.27.1] Decision: D56 (`knowledge/strategy/decisions.md`) — every surface tracked; recording content-blind by construction; GA4 events content-free by convention; `advertising_id: 'OFF'` kept; the trade is terms-level
- [✓ 3.27.1] KB: `knowledge-base/web10-v3/telemetry.md` — the why (compete with Meta/TikTok on UX), the use case, the technical how (GA4 + masked Hotjar, env-gated, per-app `src/lib/analytics.ts`), the line it does not cross, logistics
- [✓ 3.27.1] Build: all three surfaces — web10-social gains masked Hotjar (GA4 already there, max-tracking config); marketing-ui gains GA4 (in-house beacon + Hotjar already there, Hotjar moved to the canonical masked init); the authenticator gains both (new `ui/src/lib/analytics.ts` + initial pageview — query-parameter-driven, no router); `hotjarIdentify(username)` on login in web10-social; unit tests per app (no-op without env, script load, masking config pinned, idempotency, identify)
- [✓ 3.27.1] Deploy wiring: `VITE_GA4_MEASUREMENT_ID` + `VITE_HOTJAR_SITE_ID` baked at build time — Dockerfile ARG/ENV on all three frontends, compose passes `GA4_MEASUREMENT_ID` / `HOTJAR_SITE_ID` per environment (empty = tracking off), env examples updated
- [✓ 3.27.2] Positioning realignment: the docs stop reading "anti-analytics" — thesis.md gains the "and it tracks hard (D56)" section; the manifesto's "nobody is mining you" is narrowed to content (never scanned/sold/fed to the ad machine) + the candid telemetry parenthetical; AGENTS.md gains the Telemetry (D56) operating rule; the README premise table gains the "Built like the best, owned like yours" row; design.md drops the stale "privacy-first" justifications
- [✓ 3.27.3] Runtime-configurable IDs: the GA4/Hotjar IDs live in `node_config` (ClickHouse), set in the Node Config UI (Telemetry card), resolved at page load via a public `GET /telemetry` (node authoritative, build-time env is the dev fallback) — no rebuild to change them. Also fixed the Node Config save (flat body vs the API's `{token:{token}, update:{...}}` — every save 422'd)
- [ ] Terms copy: the tracking disclosure on the marketing site (the "wrong platform for you if you arent ok with that" line) — gated on a terms surface existing (there is no terms page yet)

### Lane: public-docs (audience model)
**Owns:** `marketing/marketing-ui/public/docs/`, `marketing/marketing-ui/src/pages/Docs.tsx`, `marketing/marketing-ui/public/docs/schemas/`

The public docs are the audience-tuned surface of the KB (the KB is the root of
trust — `knowledge/knowledge-base/web10-v3/`). The current docs are thin, not
organized by audience, and drifted (`sdk.md` teaches a non-existent Mongo-style
API). The reframe: an explicit **audience model** — sections for **Users**,
**Developers**, **Node Operators / Influencers**, **Monetizers** (+ the pitch).
Each doc names its reader and speaks clearly to that reader. Full breakdown in
`plan.md` → "Public Docs Overhaul (audience model) — Docs". **Sequencing:** the
drift fix first (the docs are actively wrong), then the audience sections
(Users → Developers → Node Operators → Monetizers), then the rendering/UX.

- [✓ 3.60.3] **Drift fix: rewrite `sdk.md` to the real SDK** — every example to the actual surface (`createV3Client`, `openAuthPortal`+`authListen`, `read(collection, {groups, limit, offset, ref})`, `update(docId, body)`, `delete(docId)`, `query(sql, {groups})`, the group/contract/media/account ops). Source: `KB sdk/api.md` + `sdk/src/v3.ts`. Acceptance: every code block matches the real SDK; copy-paste works. (The KB `sdk/api.md` was aligned to the same surface first — it carried the same drift.)
- [✓ 3.60.4] **Drift fix: rewrite `KB sdk/implementation.md`** — the "How Layer" (SDK call → ClickHouse SQL) carries the same Mongo-style drift: `w.update(collection, {_id}, {$set}, {$groups})` → `update(docId, body, {groups})`, `w.delete(collection, {_id})` → `delete(docId)`, `w.read(collection, {_id, groups})` → `readById(docId, collection)`, `w.createGroup({…})` → `createGroup(name, joinPolicy, roles, members)`, `w.getGroups({member})`/`getGroups({manages})` → `getMyGroups()`/`getGroupsManages()`, `w.getMembers`/`removeMember` → `getGroupMembers`/`removeGroupMember`, `w.blockSharing` → `setSharing`, `w.upload`/`getReadUrl`/`list` → `requestMediaUploadUrl`/`getMediaReadUrl`/`listMedia`, `w.getServiceContracts`/`revokeServiceContract`/`revokeAllServiceContracts` → `listAppContracts`/`revokeAppContract` (the table is `app_contracts`, not `service_contracts`); drop the v4 power-mean `$sort` + cross-node addressing sections (v4 features misplaced in v3). Source: `sdk/src/v3.ts` + `api/app/v3/`.
- [✓ 3.60.5] **Drift fix: bring `protocol-spec.md` current** — add the query engine (D63), recovery (D61), engagement model (D62), ads (D55), D58 role shape, the read `ref`+`count` shape, the rate limit (D65); fix the token format; un-draft it.
- [✓ 3.60.6] **Drift fix: `conventions.md` + `groups.md`** — real `read` opts (drop `$match`/`$sort`/`$limit`); D58 role shape; the engagement model (D62).
- [✓ 3.60.7] **For Users** — `getting-started`, `groups-in-plain-terms`, `your-data` (export / kill switch / opt-out), `account-recovery` (D61), `import-from-other-platforms` (expand the placeholder `export-guidance` + the web10 import flow).
- [ ] **For Developers** — `query-engine` (NEW), `app-contracts` (NEW), `media` (NEW), `scaffolding` (verify the CLI exists).
- [ ] **For Node Operators / Influencers** — `start-a-node` (NEW), `node-config` (NEW), `app-store` (NEW), `your-audience` (NEW), `being-a-creator` (NEW).
- [ ] **For Monetizers** — `ads` (NEW), `ad-catalog` (NEW), `affiliate-programs` (NEW), `payment-rails` (NEW), `monetization-bootcamp` (link the existing guide).
- [ ] **Rendering / UX** — reorganize the `Docs.tsx` sidebar by audience; a "who are you?" landing that routes the reader to their section.
