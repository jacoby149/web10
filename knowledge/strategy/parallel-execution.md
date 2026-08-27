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
- [ ] Video: hls.js player for video posts in the feed (Safari native fallback, vendored hls.js) — moved from the `hls` lane

### Lane: social-e2e (Phase 3)
**Owns:** `e2e/tests/`

The retired social specs (3.0.61) are the rewrite path. Same pattern as
the demo specs: API floor + anti-tests + browser gauntlet with
log-sequence verification. The browser gauntlet bites are gated on the
`social-v3` auth bites — they drive the real D42 popup.

- [ ] API floor: signup → login → post → feed → DM → profile + I3 cross-user isolation
- [ ] Browser gauntlet: real D42 login → feed renders → post → reload persists (gated on `social-v3` auth)
- [ ] Browser gauntlet: two-user DM round-trip (gated on `social-v3` auth)

### Lane: ads (monetization)
**Owns:** `ui/src/components/Studio/`, `api/tests/test_ads.py`, `e2e/tests/ads.spec.ts`

The creator-owned ads layer (D50): the `ads` default service — content + a
monetizable link (the offer), owned by the creator, delivered to followers
by architecture. Any app with `ads: [readAll]` picks up ads per viewer with
the same multi-group read the feed uses (`w.read('ads', { groups: [...] })`
— no new endpoint, rides the existing CRUD + read + media machinery). The
Partner Links card (was "Amazon Associates" + "Direct Deals") is the ingest.
The KB is the spec — read it first: `knowledge/knowledge-base/web10-v3/social/ads.md`.

- [✓ 3.15.1] KB: the standard ad object + the per-user query + the two-layer note (`social/ads.md`) + D50
- [ ] Partner Links card (UI): collapse "Amazon Associates" (`AmazonTagCard.tsx`) + "Direct Deals" (`DirectDealsCard.tsx`) into one "Partner Links" card in the Studio monetization screen — `offer.kind` = `affiliate` | `direct` | `own_store`; update `studio-data.ts` + `studio.test.tsx`
- [ ] The `ads` service (API conformance): the ad object through the existing CRUD + the multi-group per-user read — no new endpoint; verify + pin with `api/tests/test_ads.py` (I3: a non-follower can't read the ad)
- [ ] E2E: create ad → attach to followers group → viewer reads per-user → I3 (non-follower can't see) — `e2e/tests/ads.spec.ts`

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
- [✓ 3.15.0] `/stats` macro: node-wide `users_1d/30d/90d/1y` (all apps, same query minus `GROUP BY`); homepage leads with `users_30d`
- [✓ 3.15.0] SDK: token in the register ping + re-fire the ping on the sign-in transition (required — else the metric means "returning users")
- [✓ 3.15.0] Hardening (folded in): #4 URL normalization in `register_app` (lowercase host, one trailing slash); #7 manifest byte cap in `/pwa_listing`
- [✓ 3.15.0] Tests: unit (gated ingest, anon-drop, forged-token I2 anti-test, metrics, pagination) + e2e (real signed-in user → active count; pagination boundary)
- [✓ 3.15.0] KB: `app-store/overview.md` metrics section + `db/clickhouse.md` `app_visits` table
