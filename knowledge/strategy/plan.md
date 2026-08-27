# web10 v3 Plan

> **THE RULE:** docs first, then code. If the docs are perfect, the LLM
> implements perfect. If the docs are vague, the code is vague. No
> exceptions.

> The previous plan (phases 0–3, all lane items) is archived at
> `archive/plan-17.08.2026.md`. This is a fresh plan. Fill it in as work
> is scoped — one phase at a time, docs before code.

## Hierarchy of Reliance

Every layer depends on the one above it. An LLM implementing any layer
reads only the layer directly above it — never skips, never guesses.

```
Plan (this file)
  ↓
Knowledge base (web10-v3/ — architecture, data model, contracts)
  ↓
Marketing docs (marketing-ui/public/docs/ — customer-facing, derived from KB)
  ↓
Backend / API implementation (ClickHouse, SDK server, CRUD endpoints)
  ↓
Authenticator implementation (ui/ — consent, tokens, service contracts)
  ↓
Social app implementation (marketing/web10-social/ — screens, feeds, groups)
```

If a lower layer contradicts its source above, the source wins. Always.

---

## Phases

<!--
Format per phase:

## Phase N — <name>

**Where:** `<dir>`

<one-paragraph why this phase exists and what "done" looks like>

- [ ] **<area>** (`<file>`) — <the bite>
-->

## Phase 1 — Demo Apps: Platform Unit Tests

**Where:** `marketing/marketing-ui/public/docs/{hello,notes,messages,groups,media,feed,sharing}/`

The demos are the platform's unit tests. Each one tests 1–2 features in
isolation. The social app is the integration test — it smashes the
features together. When the social app breaks, the demos tell you which
feature is broken. "Done" = each demo runs end-to-end (auth → feature →
persist), no console errors, full E2E test with the real auth popup flow
and log sequence verification.

**Simple demos (existing, done):**

- [✓] **Hello** (`hello/`) — auth flow completes, greeting shows username, groups listed. E2E with popup + log sequence.
- [✓] **Notes** (`notes/`) — full CRUD: create, read, update, delete. Data persists after reload. E2E with popup + log sequence.

**Feature demos (new/upgraded):**

- [✓] **Messages** (`messages/`) — DM group contract (invite_only, deterministic ID) + WebRTC P2P. Send/receive via CRUD and via data channel. E2E.
- [✓] **Groups** (`groups/`) — group management: create, roles, join policies (open/request/invite_only), invite, join, leave, approve/deny. E2E.
- [✓] **Media** (`media/`) — MinIO upload, `minio` type in document body, presigned URL on read, display. E2E.
- [✓] **Feed** (`feed/`) — discover group + followers groups, multi-group read. Post to discover, follow creators, read combined feed. E2E.
- [✓] **Sharing** (`sharing/`) — block sharing per group, user-wide + per-group blacklists. E2E.

**Authenticator consent forks (the shared seam every demo drives):**

- [✓] **Approve-all fork** — drive "Approve all & continue" through the real popup (was untested; carried a real bug — the app-contract response was dropped, so the opener's callback fired late). Fixed via a shared `approveOne` helper.
- [✓] **Full fork audit** — every remaining fork driven through the real popup (deny app / deny group / skip / all-set / logout / details diff / mixed / edge / fix-access), plus the core-core authenticator torture test (signup, login, state rule, config wizard, security-model anti-tests) — `e2e/tests/authenticator-torture.spec.ts` (36 tests). Caught 8 real bugs (wizard POSTed config to the status endpoint; v2 Mongo admin that can't log in; dead "already configured" guard; empty passwords accepted; wizard Storage→Welcome off-by-one; `I.wapi` never assigned so the desktop logout menu never rendered; wizard swallowed configure errors; fix-access e2e seam violation). All fixed. The `auth-consent-forks` lane is complete.

## Phase 2 — HLS: The Video Spine

**Where:** `api/app/v3/` (media endpoints + worker), `marketing/marketing-ui/public/docs/media/` (demo player)

HLS is v3 (D44) — "the one feature that makes this legit legit youtube vs
bs." Adaptive bitrate is user-visible at every scale; P2P delivery is a
bandwidth-economics play that only pays off at M2+ concurrent-viewer scale
(and ships a security surface we don't need yet) — it stays v4. The KB is
the spec: `knowledge/knowledge-base/web10-v3/media/`.

- [✓] **Transcode worker** (`api/app/services/transcode.py`, `api/app/v3/endpoints/media.py`) — video upload → in-process ffmpeg worker (dedicated daemon threads, bounded concurrency, NOT the request pool) → 360p/720p/1080p HLS renditions + thumbnails → MinIO → document updated with `transcoding_settings` (status: processing → done|failed; the doc is the status surface).
- [✓] **Signed segments** (`api/app/services/hls.py`, `api/app/v3/endpoints/media.py`) — a read of a transcoded doc mints a 10-min JWT (sig) bound to (reader, doc, hls prefix); the manifest endpoint verifies the sig AND re-checks access (author or group membership) — the expiry is the re-check cadence. Master manifest synthesized from `transcoding_settings.variants` (doc is source of truth, manifest is a view); variant manifests rewrite every segment to a signed URL; segments stream from MinIO sig-only (no DB, traversal rejected).
- [✓] **Player** (`marketing/marketing-ui/public/docs/media/`) — the media demo gains a video flow: upload → queue transcode → poll the doc → hls.js playback (Safari native fallback, vendored hls.js). The demo is the HLS unit test; web10-social adoption is a follow-up.
- [✓] **E2E** (`e2e/tests/hls.spec.ts`) — API floor (upload → transcode → manifest → variant → segment bytes, MPEG-TS sync byte) + anti-tests (no sig / EXPIRED sig / cross-doc sig / non-member sig / traversal) + browser gauntlet (real demo: upload → "HLS ready" → hls.js manifest parsed → video duration > 0, log sequence). 40 API unit tests in `api/tests/test_hls.py`.
- [✓] **Aspect-ratio policy + social-style demo** (`services/transcode.py`, `docs/media/`, `video-experience.md`) — renditions planned per-source: target by height, preserve the source ratio, never upscale, even dims (a 9:16 phone video no longer gets squashed to 16:9); thumbnails fit ratio-preserving; fps probed. The media demo gains the upload-style toggle (Original / TikTok 9:16 / Instagram 4:5 / Square 1:1) with client-side reframe before upload (canvas cover-crop + MediaRecorder — the node gets the finished file, stays ratio-agnostic) and the player spec (muted autoplay, quality dropdown, speed, fullscreen, vertical layout). New KB doc `video-experience.md` specs the experience the pipeline docs never covered (ratio policy, upload styles, player, creator controls). E2E: vertical + landscape fixtures, ratio/no-upscale assertions, tiny-source test, style-toggle gauntlet (landscape → TikTok reframe → 9:16 renditions → play).

## Phase 3 — web10-social: The Integration Test

**Where:** `marketing/web10-social/`, `e2e/tests/`

The demos (Phase 1) are the platform's unit tests, and they're green.
The social app is the integration test — it smashes the features
together — and it is the M0 gate's machine track (`timeline.md`: the
slice must stand on its own before sends start). Today the app is
v3-shaped on the inside (the hand-rolled `src/data/v3.ts` client hits
`/v3/*` for all CRUD) but v1 on the door (auth still runs on
`web10-npm@1.0.8`'s `wapiInit`, not the v3 SDK's D42 consent flow), and
nothing proves it works end-to-end — the old social e2e specs were
retired in 3.0.61 and never rewritten. "Done" = the app signs in
through the real D42 popup, every screen works against the v3 API,
video plays through the HLS pipeline, and a browser e2e gauntlet
proves it.

- [✓ 3.9.2] **Decision: converge on the SDK** (`knowledge/strategy/decisions.md`) — the app runs on two legacy seams: `web10-npm@1.0.8` (v1 `wapiInit`) for auth and a hand-rolled `src/data/v3.ts` (raw fetch) for data, both because the app predates the current SDK. The demos already run the new SDK (`sdk/` → `wapi.js`) for BOTH auth (D42: `openAuthPortal` + `contractRequest` + `authListen`) and data (`createV3Client`) — the demos are the reference implementation. Record the convergence decision (retire both legacy seams, adopt the SDK), then execute. Docs first — this gates the auth + data items below.
- [✓ 3.11.0] **Auth on v3** (`src/interfaces/auth.ts`, `src/App.tsx`) — replace the v1 `wapiInit` adapter with the SDK's D42 flow (the same one the demos run): login through the real consent popup (the LoginScreen's one-tap survives via D42 auto-complete), token in the `token=` cookie, `authListen` dedupe (D45), sign-out scrubs.
- [✓ 3.12.0] **Data on the SDK** (`src/data/v3.ts`) — `getV3Client()` returns the SDK's `createV3Client`; retire the hand-rolled fetch client. The data modules (posts, feed, dms, comments, reactions, contacts, profile) keep their API — the swap is inside the seam.
- [ ] **E2E gauntlet** (`e2e/tests/`) — rewrite the retired social specs (`social-post-feed`, `social-full`, `gauntlet`) against v3, per the demo specs' pattern: API floor (signup → post → feed → DM → profile + I3 cross-user isolation) + browser gauntlet (real D42 login → feed renders → post → reload persists → DM round-trip) with log-sequence verification.
- [ ] **HLS in the feed** (`src/components/`) — adopt the media demo's hls.js player (Safari native fallback, vendored hls.js) for video posts. Moved here from the `hls` lane, which is otherwise complete.

## App Store: Real-User Metrics (D49) — Platform

The store's raw ping-count `visits` is retired as a metric. Replaced with
**real web10 user activity**, un-gameable by construction (only the node
mints tokens, so an app can only grow its numbers with real logged-in
users). One `app_visits (app_url, username, seen_at)` table, gated at
ingest (1 row per (app, real user) per 3h, anon dropped), metric-as-query
(no counters to race or pile on ClickHouse). `apps` becomes a stable
registration record (append on create/metadata-change only). Headline +
sort = `users_30d`. The `/stats` node macro shows the same active-user set
across all apps. Decision done (D49); lane is `app-store-metrics` in
`parallel-execution.md`.

- [✓] **Decision: D49** (`knowledge/strategy/decisions.md`) — real-user windowed metrics (`visits` + `users_1d/30d/90d/1y`), anon dropped at ingest, `users_30d` headline/sort, pagination, sign-in re-ping required, `apps` stops appending per ping.
- [✓ 3.15.0] **`app_visits` table** (`clickhouse-init/`, `api/app/v3/services/clickhouse.py`) — DDL + boot self-heal.
- [✓ 3.15.0] **Gated ingest** (`register_app`) — append per (app, user) if latest `seen_at` > 3h (or first); anon dropped at ingest (verified token only, I2); #4 URL normalization folded in.
- [✓ 3.15.0] **`apps` stable** — stop appending per ping; retire the `visits` counter column as a store metric.
- [✓ 3.15.0] **Metrics + pagination** (`/v3/apps/list`) — `visits` + `users_1d/30d/90d/1y` realtime; `limit`/`offset`, sort `users_30d` desc, `visits` tiebreak; store grid + detail UI.
- [✓ 3.15.0] **`/stats` macro** — node-wide `users_1d/30d/90d/1y` (all apps); homepage leads with `users_30d`.
- [✓ 3.15.0] **SDK** — token in the register ping + re-fire on the sign-in transition (required).
- [✓ 3.15.0] **Hardening** — #7 manifest byte cap in `/pwa_listing`.
- [✓ 3.15.0] **Tests** — unit (gated ingest, anon-drop, forged-token I2 anti-test, metrics, pagination) + e2e (real signed-in user → active count; pagination boundary).
- [✓ 3.15.0] **KB** — `app-store/overview.md` metrics section + `db/clickhouse.md` `app_visits` table.

## App Store: Product Page (D52) — Platform

The store's product page is real (D52): tap a tile → a shareable page with
the full manifest description, the complete metric breakdown, and reviews
(rating + comment). The URL is the key — `web10apps_post_id` is retired.
Spec'd in `knowledge-base/web10-v3/app-store/endpoints.md` (D52, PR #682);
lane is `app-store-metrics` in `parallel-execution.md`.

- [✓ 3.16.1] **Decision: D52** (`knowledge/strategy/decisions.md`) — page not modal (deep-link rule), `GET /v3/apps/detail?url=` (public, pure read, no visit bump), URL is the key, reviews = rating + optional comment, D49's metric set + node macro.
- [✓ 3.16.1] **KB** — `app-store/endpoints.md`: the full endpoint surface, auth split, detail response shape, product-page flow, logistics table.
- [✓ 3.17.0] **`GET /v3/apps/detail`** (`api/app/v3/endpoints/appstore.py`, `services/clickhouse.py`) — app + `get_app_metrics` breakdown + rating aggregate + rating list + `/v3/stats` node macro; 404 for unknown AND unapproved apps; pure read (no `app_visits` row).
- [✓ 3.17.0] **`app_ratings.comment`** (`clickhouse-init/`, `services/clickhouse.py`, `endpoints/appstore.py`) — DDL template + boot-time ALTER (named-column insert); `POST /v3/apps/rating` accepts an optional comment (1000-char cap); rating list + detail return it; ratings key on the canonical url (hardening #4).
- [✓ 3.17.0] **Dedup fix** (`services/clickhouse.py`) — re-rate appends; a plain `deleted = 0` read sees both rows until a background merge. Dedup-then-filter (`row_number() OVER (PARTITION BY target_app_id, author ORDER BY updated_at DESC, deleted DESC)`) in `get_app_ratings` + the admin aggregate (same latent bug).
- [✓ 3.17.0] **`list_store_apps`** — stops blanking `web10apps_post_id` (field dropped from the response).
- [✓ 3.17.0] **UI** (`marketing/marketing-ui/src/`) — card links to `/app-store/app/{urlencoded-canonical-url}` (preserving `?api=`); `AppDetail` rewritten: detail endpoint, manifest-preferred identity, five metric blocks, reviews (aggregate + list + comments + empty state), rate form (token-cookie session: signed in → star picker + comment + submit; signed out → SDK auth popup), node context footer.
- [✓ 3.17.0] **Tests** — 12 API unit tests (detail composition / 404s / pure-read / normalization; comment round-trip / cap; dedup read) + 3 stale `get_app` mocks re-aligned; AppDetail.test.tsx rewritten (17 tests) + AppCard route tests; 4 e2e tests (detail payload + pure-read, 404s, rating round-trip with re-rate dedup + cap, card → page browser seam).

## Phase 4 — Production Cutover: v2 → v3, then merge to main

**Where:** `knowledge/knowledge-base/web10-v3/` (migration model), `api/` (migration tooling), `ubuntu-deployment/` (prod deploy)

Prod runs **v2 on real MongoDB** — the live 579-user node at web10.app,
data in the docker volume (D25: prod bootstraps on the host mongo, "zero
migration risk"). v3 is a different data model, not a newer deploy: v2 is
star records + services + terms/ACL + a discovery ledger; v3 is ClickHouse
`documents` + `doc_groups` + `group_contracts` + `group_members`. So the
cutover is a genuine transformation of live user data, and the old v2
"migration endpoints" were already stripped when the v2 routes went. Two
practical consequences: (1) these are real, reachable users — we have every
one's phone number, so the cutover includes an SMS to all of them saying
they were migrated; (2) this phase is deliberately last and deliberately
gated.

**GATE (non-negotiable): main does not move until Phase 3 is SOLID** — the
social app (the integration test) is green end-to-end, the e2e gauntlet
passes on dev, and the operator has signed off. No Phase 4 work that touches
prod runs before that gate clears. Scoping the rest of this phase (tooling,
rehearsal, cutover steps) happens when the gate clears — one phase at a time,
docs before code, per the rule at the top.

- [ ] **KB: the v2→v3 data migration model** (`knowledge/knowledge-base/web10-v3/`) — docs first, and the only item that starts before the gate. What maps to what: v2 star records → v3 user docs; v2 services/collections → v3 collections; v2 terms/ACL → v3 group contracts; the v2 discovery ledger → dropped or re-derived (decide, with the D30/D32/D34/D35 public-by-default calls in mind); media blobs → re-pointed by object key, not copied. Name what is lossy, what is dropped, and what is re-derived. This doc is the spec the migration tooling implements — no tooling before it.
- [ ] (scope when the gate clears) migration tooling + a rehearsal against a staging copy of the prod mongo (docker volume), then the cutover and the dev→main merge.
- [ ] (scope when the gate clears) SMS cutover notice — text all 579 users (phone numbers live in the v2 star records) that they were migrated, over the existing Twilio send path. Needs: the send list (deduped, verified numbers only), the message copy, and a delivery check. Runs after the data flip — the notice says "you're migrated," not "you will be." Copy can be drafted pre-gate.
