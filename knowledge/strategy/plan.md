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
- [✓ 3.32.0] **Groups screen** (`src/components/Groups/`, `src/data/groups.ts`) — the "coming soon" Groups tab is now real: **My Groups** (the user's community memberships, infrastructure groups filtered out) + **Discover** (the D53 public directory, search + topic filter) + the **deep-linkable group detail** (`/groups/:id`, the D53 unlisted-model). The data layer gains `readGroupDirectory` + `readGroupDetail` (the public GET endpoints) + the community-group filter. E2E: `social-groups-directory.spec.ts` (API floor + browser gauntlet).
- [✓ 3.38.0] **Feed knobs** (`src/components/Feed/FeedScreen.tsx`, `src/data/{feed,settings,types}.ts`) — D36 amendment (operator lifted the "knobs on the chronological feed" reject): the feed carries the same D36 rack as Discover (presets + rotary knobs, power-mean re-ranking, client-side). Default = Newest preset (chronological until tuned). Knob state deep-linkable (`?knobs=`) + persisted to the user's web10 `settings` service (`feedKnobs` on the settings doc; URL > saved > default). `readFeedEngagement` (the ref pattern) feeds the likes/comments knobs.
- [✓ 3.39.0] **Real-time messages (WebRTC P2P) + presence** (`src/data/p2p.ts`, `src/components/Chat/DmsScreen.tsx`, `src/App.tsx`, `src/components/Settings/SettingsScreen.tsx`) — the social app adopts the messages-demo's P2P pattern (CRUD is the source of truth; P2P is the fast path). On sign-in, when the user's `p2pEnabled` setting is on (default), the app opens a PeerJS peer over the node's RTC signaling server; a sent DM is also pushed over the data channel so the recipient sees it instantly, and an inbound nudge re-reads the open conversation. Presence = the P2P peer is open: the other party shows Online/Offline (green/gray dot + label) from live connections, and a "Real-time" status chip shows the local peer state. Opt-out (Settings → Real-time Messages) tears down the peer — messages still work via CRUD, no instant nudge, shown offline. `peerjs` added as a dep; the screenshot harness aliases `@/data/p2p` to a no-op (no real signaling connection).
- [✓ 3.40.0] **Presence offline detection** (`src/data/p2p.ts`) — the presence dot now flips to gray when a peer disconnects (3.39.0 stuck green). Two mechanisms: connection-close hooks (the send path opens the channel via `connect()` and hooks `close`; the inbound path hooks the sender's connection) for immediate offline, + a TTL backstop (per-peer `lastSeen` + a 15s sweep expiring peers idle past 60s) for missed close events. `markOffline` notifies presence subscribers so the DmsScreen dot/label flip automatically. 5 new unit tests.
- [ ] **E2E: per-surface social specs** (`e2e/tests/`) — rewrite the retired social specs (`social-post-feed`, `social-full`, `gauntlet`) against v3, per the demo specs' pattern — **organized by surface so they parallelize across workspaces**: one spec per surface (feed, groups/follows, profiles, messages, settings, trending), each = API floor (the app's exact read pattern + a per-surface I3 anti-test; the primitive floors stay in the demo specs) + browser gauntlet (real D42 login → drive the surface → assert render/interaction/persistence, log-sequence verified). Lane: `social-e2e` in `parallel-execution.md`.
- [ ] **E2E: capstone gauntlet** (`e2e/tests/social-gauntlet.spec.ts`) — one journey across all screens (login → feed → post → profile → DM → follow → settings → reload), log-sequence verified. Gated on the six surface specs.
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
- [✓ 3.15.0] **`/stats` macro** — node-wide `users_1d/30d/90d/1y` (all apps); homepage stat bar leads with the all-time `users` count (3.27.5 — operator preference: all-time, not the 30d window).
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

- [✓ 3.17.2] **Decision: D52** (`knowledge/strategy/decisions.md`) — page not modal (deep-link rule), `GET /v3/apps/detail?url=` (public, pure read, no visit bump), URL is the key, reviews = rating + optional comment, D49's metric set + node macro.
- [✓ 3.17.2] **KB** — `app-store/endpoints.md`: the full endpoint surface, auth split, detail response shape, product-page flow, logistics table.
- [✓ 3.17.3] **`GET /v3/apps/detail`** (`api/app/v3/endpoints/appstore.py`, `services/clickhouse.py`) — app + `get_app_metrics` breakdown + rating aggregate + rating list + `/v3/stats` node macro; 404 for unknown AND unapproved apps; pure read (no `app_visits` row).
- [✓ 3.17.3] **`app_ratings.comment`** (`clickhouse-init/`, `services/clickhouse.py`, `endpoints/appstore.py`) — DDL template + boot-time ALTER (named-column insert); `POST /v3/apps/rating` accepts an optional comment (1000-char cap); rating list + detail return it; ratings key on the canonical url (hardening #4).
- [✓ 3.17.3] **Dedup fix** (`services/clickhouse.py`) — re-rate appends; a plain `deleted = 0` read sees both rows until a background merge. Dedup-then-filter (`row_number() OVER (PARTITION BY target_app_id, author ORDER BY updated_at DESC, deleted DESC)`) in `get_app_ratings` + the admin aggregate (same latent bug).
- [✓ 3.17.3] **`list_store_apps`** — stops blanking `web10apps_post_id` (field dropped from the response).
- [✓ 3.17.3] **UI** (`marketing/marketing-ui/src/`) — card links to `/app-store/app/{urlencoded-canonical-url}` (preserving `?api=`); `AppDetail` rewritten: detail endpoint, manifest-preferred identity, five metric blocks, reviews (aggregate + list + comments + empty state), rate form (token-cookie session: signed in → star picker + comment + submit; signed out → SDK auth popup), node context footer.
- [✓ 3.17.3] **Tests** — 12 API unit tests (detail composition / 404s / pure-read / normalization; comment round-trip / cap; dedup read) + 3 stale `get_app` mocks re-aligned; AppDetail.test.tsx rewritten (17 tests) + AppCard route tests; 4 e2e tests (detail payload + pure-read, 404s, rating round-trip with re-rate dedup + cap, card → page browser seam).

## Groups: Discoverable Directory (D53) — Platform

Groups get a store: a public, anon-browsable directory of the groups that
are listed, plus a flexible by-ID detail. Two orthogonal controls (D53): a
**`discoverable` boolean** on `group_contracts` is the *blasting* flag (listed
in the directory or not) — **NOT discoverable by default** (default `false`,
the D53 amendment: listing is an opt-in; app-backend groups stay out unless an
owner blasts them) — the discover group is explicitly `false` (a board, not a
directory entry); **membership** controls whether a reader can see the posts
(I3). A one-time, sentinel-gated backfill delists groups created under the
earlier discoverable-by-default rule. The
directory is a **minimal, canonical view** (no dedicated table) over
`group_contracts` ⋈ `group_members` ⋈ `group-identity-service`; rich display
metadata — including **tags** for topic — lives in `group-identity-service`,
and topic search is a **composition** (the app joins the directory with an
identity query). The **detail** is a flexible, principal-based read
(unlisted-model): reachable for any existing group, posts gated by the
*reader's* membership, only a non-existent group 404s. I3 holds end to end.

- [✓] **D53 amendment: NOT discoverable by default** (`api/app/v3/services/clickhouse.py`, `clickhouse-init/`, `knowledge/strategy/decisions.md`, `groups/discoverability.md`) — `create_group` defaults `discoverable` to `False` for every join policy (listing is an opt-in; the `invite_only` special-case is subsumed); DDL default flips to `0` (template + boot `ALTER`); the node stays readable-by-design (the detail is still unlisted-model — only the browse surface is opt-in).
- [✓] **Backfill (one-time, sentinel-gated)** (`api/app/v3/services/clickhouse.py`) — `_migrate_discoverable_default_flip` delists groups created under the earlier discoverable-by-default rule (appends a `discoverable = 0` row per live listed group); runs exactly once (a `node_config` sentinel `migration:discoverable_default_flip`); only ever moves groups OUT of the directory (membership untouched); concurrent-safe (duplicate rows dedup to one).
- [✓] **Contract policy editors work (authenticator)** (`ui/src/components/Groups/`) — the "Settings" TODO becomes a real `GroupSettingsDialog` join-policy editor (Open/Request/Invite-only → `v3UpdateGroup({join_policy})`); the roles editor (`GroupRolesDialog`) + "List in directory" (`discoverable`) toggle verified end-to-end. All three contract controls (roles, join_policy, discoverable) work through the real UI → `POST /v3/groups/update` → persisted. `groupDisplayName` bug fixed (returned `users/<username>`, now the slug).
- [✓] **Torture tests** (`e2e/tests/group-contract-editors.spec.ts`, 11 tests) — API floor (join_policy/roles/discoverable update persists; I3 anti-test: non-member update rejected, the `CRUD` 401) + browser gauntlet (join-policy change → persisted + badge; cancel fork; save-failure fork → status-bar error, no crash; roles add → persisted; empty-role-name anti-test; discoverable toggle ON → listed / OFF → delisted in the anon directory). Every browser test asserts no pageerror.

- [✓] **Decision: D53** (`knowledge/strategy/decisions.md`) — `discoverable` boolean (blasting flag, **default `true`**, `invite_only` + discover group `false`) is separate from membership (content readability); directory = minimal canonical view (no table); detail = flexible principal-based read (unlisted-model, no 404 for non-discoverable); display metadata + tags in `group-identity-service`; topic search by composition; I3 holds end to end.
- [✓] **KB** (`knowledge-base/web10-v3/groups/discoverability.md` + `detail.md`) — discoverability.md: the two controls, the discoverable-by-default rule, the minimal directory (view, not table), `group-identity-service` (name/banner/tags), composition-based topic search, security invariants. detail.md: the unlisted model, the listing/reachability/content split, the principal-based read, metadata vs posts, why no constrained detail, security invariants.
- [✓] **Schema: `discoverable` column** (`clickhouse-init/`, `api/app/v3/services/clickhouse.py`) — `discoverable UInt8 DEFAULT 1` on `group_contracts` (DDL template + idempotent boot-time `ALTER ... ADD COLUMN IF NOT EXISTS` for pre-existing volumes, the 3.2.0 house pattern); `create_group` defaults `discoverable` to `True` except `invite_only` (→ `False`), named-column insert; `get_group` returns it; `update_group`/`delete_group` carry it; `CreateGroup`/`UpdateGroup` models + create/update endpoints accept it; the discover group is created `discoverable=False`.
- [✓] **API: `GET /v3/groups/directory`** (`api/app/v3/endpoints/groups.py`, `services/clickhouse.py`) — public, anon, paginated; the **minimal** list of `discoverable = true` groups: id, name (identity, else slug), owner, join policy, member count, tags, permission summary. **No posts.** A view over `group_contracts` ⋈ `group_members` ⋈ `group_identity`.
- [✓] **`group_identity` table + read path** (`clickhouse-init/`, `api/app/v3/services/clickhouse.py`) — public display metadata (name, description, banner, avatar, website, tags), group-keyed, append-only (latest wins); a table (not an I3-gated documents collection) because it's public metadata readable by anon. `get_group_identity` + `get_group_identities` (batch) feed the directory name + the detail display. (Write path is the owner/`page-curator`'s job — a fast-follow.) **⚠️ SUPERSEDED by D60 (3.44.0):** the `group_identity` table is deleted — the group's face is now documents in an app-named service (`web10-social-group-identity`), and the directory/detail are generic (name = slug, no face). The platform never learns what a "banner" is.
- [✓] **API: the group detail (`GET /v3/groups/detail?group_id=`)** — public, principal-based (token optional, `user_or_anon`): metadata (contract, member count, identity) always for an existing group; posts only if the *reader* is a member (else "join to view"); **only a non-existent group 404s** (unlisted-model — a non-discoverable group does not 404).
- [✓] **Opt-in toggle** (`ui/` authenticator group management) — "List in directory" switch on each managed group card, controls `discoverable` only (the blasting flag; anon readability stays a separate Manage-members action). `get_groups_manages` returns `discoverable`; `v3UpdateGroup` accepts it; toggle reflects state + updates on flip.
- [✓] **UI: the directory screen** (`marketing/marketing-ui/`) — the browse surface: `/groups` (grid of discoverable groups from `GET /v3/groups/directory`, search by name/owner + topic filter by tag chips) + `/groups/:id` (deep-linkable detail from `GET /v3/groups/detail` — metadata always, posts when the reader is a member else "join to view", 404 not-found state). `GroupCard` component + Navbar "Groups" link. 14 new UI tests (card render/link/skeleton, directory headline/cards/empty/search/tag-filter, detail name/posts/join-to-view/404/skeleton).
- [✓] **Tests** — unit (identity read + slug fallback, directory query filters `discoverable=1`, directory endpoint shape, detail: non-existent 404s / non-discoverable reachable / member sees posts / non-member "join to view" / anon reads as anon) + e2e (`groups-demo.spec.ts`: directory lists discoverable + excludes non-discoverable; detail 404s ghost / reaches non-discoverable; member sees posts, non-member "join to view").

## Groups: Access Model (D58) — Platform

D58 replaces the group permission model the KB described but the code never
built. Roles become **per-service permission maps** (the `services` array was
decorative / unenforced). Access is granted to three **nested principal
classes** — `anyone` / `authenticated` / `member` (retiring the `anon`
misnomer) — stored as reserved keys in `group_members`. A principal's
effective role is the **union** of the grants on every class they belong to.
**Reads are role-gated** (content); **identity stays public** (the face).
Public / private = a role grant to `anyone` / `authenticated` — no new flag.
Management ops live under the reserved `'group'` service key. One role per
person (already the code). This closes the attach hole (the write side gets
the same per-service gate). Stays **v3** (operator: pre-prod). KB is the spec:
`groups/access.md` (canonical) + D58.

- [✓] **Decision: D58** (`knowledge/strategy/decisions.md`) — per-service role maps + principal classes (`anyone`/`authenticated`/`member`) + union semantics + reserved `group_members` keys + role-gated content reads + public identity + public/private via class grants + the `'group'` management key + one-role-per-person + the attach-hole fix + conservative backfill. Stays v3.
- [✓] **KB** (`knowledge-base/web10-v3/groups/`) — new `access.md` (the canonical model reference: the two trust layers, the role shape, principal classes, union semantics, the gates, public/private, worked examples, invariants); `identity.md` / `overview.md` / `discoverability.md` / `social-contracts.md` / `requests.md` / `detail.md` re-aligned to the per-service map shape + principal classes (the "service-scoped roles" + "multiple roles per user" fiction retired; `anon`-as-member → `anyone`/`authenticated` grants; membership-gate → effective-role-gate).
**Execution is a three-stage pipeline** (lanes in `parallel-execution.md`):
Stage 0 is the **backend** — the one sequential keystone (one workspace; a
single coordinated change across `groups.py` + `clickhouse.py`, so it does not
parallelize; gated on the in-flight PRs that touch those files landing first).
Stage 1 is the **demo apps** — fully parallel, one workspace per demo (each
owns its own dir); the demos are the reference implementation, so green demos
prove the backend end-to-end. Stage 2 is the **social app + authenticator** —
fully parallel, one workspace per feature (fan-facing `web10-social` and
admin-facing `ui/` are separate apps).

**Stage 0 — backend (the keystone, sequential):**
- [✓ 3.42.0] **API: role shape + read gate + write gate** (`api/app/v3/endpoints/groups.py`, `services/clickhouse.py`, `models/`) — roles stored as per-service maps; the read path computes the reader's **effective role** (union over `anyone` / `authenticated` / member role) and gates content reads on per-service `readAll` (replaces the membership-only check); the write/attach path gates on the effective role granting the op on the service (closes the attach hole); management ops check the `'group'` key. Both role shapes normalized on read (old clients keep working until Stages 1–2 migrate).
- [✓ 3.43.0] **API: backfill (one-time, sentinel-gated)** (`services/clickhouse.py`) — fan the old flat `permissions` out across the old `services` list (`['*']` → `'*'` key) over `group_contracts`; rename the discover board's `anon` member row → `anyone`; **conservative visibility default** (no existing group besides discover becomes `anyone`-readable — owners opt in). The role-shape fan-out landed in 3.42.0; the `anon` → `anyone` member-row rename + the `ensure_discover_group` enrollment change landed in 3.43.0.
- [✓ 3.42.0] **API: identity write endpoint** (`api/app/v3/endpoints/groups.py`) — the group's face (name, description, banner, avatar, website, tags) written to the public `group_identity` table, gated by a role grant on `group-identity-service` (owner / `page-curator`). Lands *on* the D58 model.
- [✓ 3.43.0] **Conformance re-pin** (`api/tests/`) — I3 re-pinned from "membership grants access" to "effective role grants access"; the anti-tests get stronger (anon vs private group, signed-in vs signed-out, member ⊇ stranger ⊇ visitor monotonicity; the attach-hole anti-test). Pinned in `test_v3_access.py` (the gate logic + all five principal-class forks, incl. the monotonicity invariant added in 3.43.0). The stub `test_v3_conformance.py` is a separate, larger effort.

**Stage 1 — demo apps (parallel, one workspace per demo):**
- [✓ 3.45.0] **Each group-creating demo** (`marketing/marketing-ui/public/docs/{media,notes,sharing,groups,messages,feed,tasks}/`) — adopt the per-service role-map shape in its `createGroup` role literals + drive a public/private + identity fork in its e2e (set the group's face + grant/revoke the `anyone` read role → assert a bystander's read). `groups-demo` is the reference (the richest `ROLE_PRESETS`).
- [✓ 3.45.0] **SDK role type** (`sdk/src/`) — `V3GroupRole` → the per-service map shape (the shared type the demos + social app reflect).

**Stage 2 — social app + authenticator (parallel, one workspace per feature):**
- [✓ 3.46.0] **Role definitions** (`marketing/web10-social/src/data/groups.ts`, `sdk/src/`) — the social app's `FOLLOWER_ROLES` / `COMMUNITY_ROLES` / `DM_ROLES` → the per-service map shape (the shared seam).
- [✓ 3.46.0] **Group profile (fan-facing)** (`web10-social/src/components/Groups/GroupDetailScreen.tsx`) — render the group's face: banner (cover) + overlapping avatar + name + about + tags + website (the Facebook-shaped hero), from the `web10-social-group-identity` service (D60).
- [✓ 3.46.0] **Public/private (fan-facing)** (`web10-social/src/components/Groups/`) — the detail shows a public/private badge; the create-group dialog gains a visibility control (public / signed-in-only / private) that carries the initial `anyone`/`authenticated` grant.
- [✓ 3.46.0] **Group profile editor (admin-facing)** (`ui/src/components/Groups/`) — a profile editor (name, description, website, tags) next to the existing Settings/Roles/Members dialogs → writes the face via the normal CRUD path (D60).
- [✓ 3.46.0] **Public/private control (admin-facing)** (`ui/src/components/Groups/`) — a "Who can read" control (public / signed-in-only / private = grant/revoke the `anyone` / `authenticated` read role).
- [✓ 3.46.0] **Feed + detail effective-role read** (`web10-social/`) — the detail renders what the role-gated read returns (a bystander on a private group sees the face + "join to view"; on a public group sees posts) — the API does the gating.

## Ads: The Catalog + Composer (D54, D55) — Platform

The creator's ads, **v3 mad simple** (D55 + the v3/v4 dissemination split). An
ad is a **`posts` document tagged `ad`**: the post's own text + media (the
creative) plus a leaf-typed `offer` (the link that pays) plus a `status`. A
document's `ad_preference` (a column on `documents`) is **`pinned` | `none`** in
v3: the creator pins a specific ad to a post, and the **read serves the doc with
the pinned ad inline** (100% of the time, I3-checked — the ad is served only if
the reader is in the ad's group). Ads are organized into **albums**
(Apple-Photos-style, first-class; an ad in a few via a tag-like field). The
**Ads tab** in the authenticator's Studio is the surface (ads upload + album
making + pin an ad to a post); the **composer** in web10-social pins an ad to a
post. The full curation engine (`round_robin` / `greedy` / `random`, the
node-level density, the `signal` × `strategy` enums) is the **v4 vision** —
spec'd in `web10-v4/social/ads-dissemination.md`, built after v3. The v3 design
is in `web10-v3/social/ads-dissemination.md`; the ad object in `social/ads.md`
(D55). Lane is `ads` in `parallel-execution.md`.

- [✓ 3.22.0] **Decision: D54** (`knowledge/strategy/decisions.md`) — catalog is a Studio surface (Partner Links = ingest, catalog = inventory); catalog read = the canonical per-viewer read run by the owner; post carries ad by `ref_value` (no copy); `body.status` = `active` | `paused` (curation filters on it); round-robin = D51 setting at render time, per-post opt-in; disclosure never optional; no new tables/endpoints/SDK surface.
- [✓ 3.22.0] **KB** (`knowledge-base/web10-v3/social/ads-catalog.md`) — the two surfaces, the catalog read + row fields + actions + states, the composer picker + attach-by-ref + ad block + round-robin, the data-model map, the security invariants (I3/I5 hold), v0 scope.
- [✓ 3.23.0] **Decision: D55** (`knowledge/strategy/decisions.md`) — an ad is a `posts` doc tagged `ad`, not a service (supersedes D50's service framing): the feed join + the `ads: [readAll]` contract + the provisioning all disappear; the object is locked (post fields + leaf-typed `offer` + `status`, no `stats`, no `creative.format`); the creative is data + the HTML is the app's renderer (no `html` leaf type); `html_template` is v4; carrying is post → post.
- [✓ 3.23.0] **KB** (`knowledge-base/web10-v3/social/ads.md` rewritten + `ads-catalog.md` updated) — the tagged-post model: why a post not a service, the locked ad object, the creative-is-data/HTML-is-the-app split + the v4 `html_template` escape hatch, the data-model map, the feed read as the ad read, D51 dissemination re-scoped (curation selects; the feed's ad posts just render), the two-layer note.
- [✓ 3.25.0] **Foundation: the tagged-post ad conformance** — the ad object (a `posts` doc tagged `ad` with the `offer` + `status`) through the existing posts CRUD + the feed read returns it + I3 (a non-follower can't read the ad post), pinned by `api/tests/test_ads.py`. No service to provision. The catalog and the composer both read this, so it gates both surfaces.
- [✓ 3.26.1] **KB: the v3/v4 dissemination split** — v3 is `pinned` | `none` (data-layer, the read serves the pinned ad inline, I3-checked, 100% density); the curation engine (`round_robin` / `greedy` / `random`, the node-level density, the `signal` × `strategy` enums) is the v4 vision. The three v3 questions resolved: `ad_preference` is a column on `documents`, albums are first-class (Apple-Photos-style) with a tag-like ad→album link (an ad in a few), and the read returns the docs + ads inline. `web10-v3/social/ads-dissemination.md` + `web10-v4/social/ads-dissemination.md`.
- [✓ 3.27.4] **v3 API: the read serves the pinned ad** — the `ad_preference` column on `documents` (`pinned` | `none` + `target`); the feed read joins to the pinned ad and returns the doc **with** the ad inline (100% of the time); the **I3 check** (serve the pinned ad only if the reader is a member of the ad's group, else no ad); the **albums** (first-class, an ad in a few via a tag-like field). Pinned by `api/tests/test_ads.py`. The foundation — gates the UI.
- [✓ 3.28.0] **Ads tab (authenticator)** — the Studio's new Ads surface: **ads upload** (the ingest — media + offer + status → a `posts` doc tagged `ad`), **album making** (Apple-Photos-style: make albums, sort by album or all, add an ad to a few), **pin an ad to a post** (pick an ad → set the post's `ad_preference`). All states designed (empty → CTA, skeleton, error). `ui/src/components/Studio/`.
- [✓ 3.29.0] **Composer pin control (web10-social)** — the "Pin an ad" control in `PostComposer`: pick an ad (from an album or all) to pin to the post, or none (sets the post's `ad_preference`); the ad block renders under the post (creative + offer + disclosure, disclosure never hidden). `marketing/web10-social/src/components/Feed/`.
- [✓ 3.30.0] **E2E** — the torture gauntlet: create an ad → pin it to a post → follower sees the post with the ad block + disclosure → unpin → it's gone → non-follower never sees the ad (I3) → an ad in two albums shows in both. `e2e/tests/ads.spec.ts`.

## Monetization Bootcamp (creator guide) — Docs + Studio

The creator-facing ramp: a guide that takes a creator from "I have an
audience" to "my first affiliate payout," grounded in the D55 ad model. It
answers the two questions that come up in every onboarding — *which
affiliate programs are worth joining* and *how the web10 ad maker turns a
link I already have into a post that pays.* The KB doc is the full guide;
the Studio card is the "point people toward the programs" surface (the
training factored into the money screen). The affiliate shortlist (Amazon,
Walmart, Target, eBay, TikTok Shop, Shopify, Fiverr, Semrush, HubSpot) is a
map, not a contract — rates/cookies shift, confirm on the program's page.

- [✓ 3.53.0] **KB: the bootcamp guide** (`knowledge/knowledge-base/web10-v3/social/monetization-bootcamp.md`) — the use case (creator-owned links, not a platform ad box), the one rule (an ad is a post with a link that pays), the two layers (your ads vs node ads), the affiliate shortlist table, the sign-up ramp (the website-list / 180-day rule, the node-account vs creator-account split), the ad-maker walkthrough (offer kind/partner/link/cta/disclosure), pin-to-post, albums, and the "do it genuinely" principles (only link what you'd buy, the content is the ad, disclose up top, the audience is the asset). "What this is not" (not an ad network, not a payment processor, not memberships/tips) + logistics (built now / known gap: ad-maker media attach / deferred v4).
- [✓ 3.54.0] **Studio: the Affiliate Programs card** (`ui/src/components/Studio/AffiliateProgramsCard.tsx` + `studio-data.ts` `AFFILIATE_PROGRAMS`) — the bootcamp factored into the Studio: the "START HERE" card in Rung 0 that points a creator at the programs worth joining (each row = program + niche + commission + why + an external sign-up link, new tab). The entry point that sits above the Ads card — sign up for a program, then make your first ad. The full guide stays the KB doc. 8 new Studio tests.
- [✓ 3.55.0] **Studio: retire the AmazonTagCard** (`ui/src/components/Studio/AmazonTagCard.tsx` deleted) — the single-global-tag card was the leftover "auto-affiliate-everything" (skimlinks/sovrn) model that D55 rejected ("the platform never rewrites the link — the creator's link is the link," `ads.md:43`). The real flow is *creators make ads with the links* — the tag lives in each ad's `offer.link`, set in the ad maker. The card is removed from the Studio + its 4 tests; the Affiliate Programs card is the sign-up pointer, the Ads card is where the link goes.
- [ ] **Bootcamp page (marketing-ui)** — surface the guide as a `/docs/monetization` page (or a Studio link-out) so a creator hitting the ad maker for the first time can land on it. Gated on a docs-page surface existing in marketing-ui (the `public/docs/` set is the precedent).

## Node-Level Ads (D57) — Platform

The node operator's ad layer — the second layer of the two-layer ad model
(D57). **v3 is ads only** — no Stripe, no memberships, no tips (the payment
model is v4). A node ad is a `posts` doc on the discover group, tagged `ad`
+ `node_ad`, authored by the node operator. The read attaches active node
ads to posts at the operator's configured percentage (default 10%). The
attachment is read-time — the creator's `ad_mode` column is never modified.
The response is a **third join**: `doc.ad` (the creator's pinned ad, if
`ad_mode = 'pinned'`) + `doc.node_ad` (the node's ad, if selected by the
percentage). Both can be present on the same post — the creator's
monetization is never suppressed by the node's. The operator sells the
inventory to advertisers directly; web10 takes a 10-15% platform fee on the
hosting invoice. The KB is the spec: `web10-v3/social/node-ads.md`. Lane is
`node-ads` in `parallel-execution.md`.

- [ ] **Decision: D57** (`knowledge/strategy/decisions.md`) — two-layer ad model (creator + node); v3 is ads only (no Stripe, no memberships, no tips — the payment model is v4); read-time attachment at a percentage; the third join (`doc.ad` + `doc.node_ad`, both can be present); usage-based pricing (MongoDB model); the v3/v4 split rationale (Stripe Connect = migration lock-in + onboarding friction)
- [ ] **KB: `node-ads.md`** (`knowledge/knowledge-base/web10-v3/social/node-ads.md`) — the node ad object, the read-time attachment (the third join), the density control, the renderer (both ads on the same post), the operator's revenue model (hosting + node ad revenue 85-90%), the "what this is NOT" (not a payment processor, v3 is ads only), security invariants
- [✓ 3.37.0] **`node_ad_percentage` config** — new field on `NodeConfig` + `ConfigUpdate` (integer, 0-100, default 10); the Node Config UI exposes it
- [✓ 3.37.0] **Node ad query + read-time attachment (the third join)** (`api/app/v3/`) — `get_active_node_ads()` (bounded query); the read enriches posts with node ads at the configured percentage (deterministic hash, round-robin); the response carries both `doc.ad` and `doc.node_ad`
- [✓ 3.57.0] **Renderer: both ads on the same post** (`marketing/web10-social/`) — the post renders with up to two ad blocks: the creator's ad + the node's ad ("Sponsored" label + node disclosure); ads render as posts (media-aware, creator violet / node amber dressing, disclosure names the author)
- [ ] **Ad Inventory card (authenticator)** (`ui/src/components/Studio/`) — percentage slider, list of active node ads, create/pause/resume/retire
- [ ] **Tests** — unit (query, attachment, percentage, determinism, third join, I3) + e2e (operator creates node ad → feed shows it → pinned post shows BOTH ads → percentage 0 = off)

## Platform Telemetry (D56) — Platform

web10 tracks hard — GA4 + Hotjar on **every** user-facing surface
(marketing-ui, web10-social, the authenticator `ui/`) — because web10
competes with Meta and TikTok for the same attention, and their UX is
the output of a decade of aggressive telemetry. The recording is
**content-blind by construction**: Hotjar runs `maskAllText: true` +
`blockAllImages: true` (text blurred, images blocked — the operator
sees cursor + layout + timing, never words or pictures), and GA4 events
are content-free by convention (paths, actions, counts — never post
text, media URLs, or PII). Max tracking, one exception: GA4
`advertising_id: 'OFF'` — we do not feed Google's ad network (the only
sponsors a fan sees are the creator's, D50/D55). The trade is
terms-level, not a consent popup: "it is the wrong platform for you if
you arent ok with that." Supersedes the old "platform surfaces stay
recording-free" rule. Spec'd in `knowledge-base/web10-v3/telemetry.md`;
the decision is D56. Lane is `platform-telemetry` in
`parallel-execution.md`.

- [✓ 3.27.1] **Decision: D56** (`knowledge/strategy/decisions.md`) — every surface tracked (GA4 + Hotjar); recording content-blind by construction (maskAllText + blockAllImages); GA4 events content-free by convention; max tracking with `advertising_id: 'OFF'` as the single kept flag; the trade is terms-level, not a consent popup.
- [✓ 3.27.1] **KB** (`knowledge-base/web10-v3/telemetry.md`) — the why (compete with Meta/TikTok on UX), the specific use case (the operator who can't see bounces), the technical how (GA4 + masked Hotjar, env-gated, per-app `src/lib/analytics.ts`), the line it does not cross (content never tracked, not sold, trade stated), logistics.
- [✓ 3.27.1] **Build: all three surfaces** — web10-social gains masked Hotjar (GA4 already there, max-tracking config); marketing-ui gains GA4 (in-house beacon + Hotjar already there, Hotjar moved to the canonical masked init); the authenticator gains both (new `ui/src/lib/analytics.ts` + initial pageview — it's query-parameter-driven, no router). `hotjarIdentify(username)` on login in web10-social. Unit tests per app (no-op without env, script load, masking config pinned, idempotency, identify).
- [✓ 3.27.1] **Deploy wiring** — `VITE_GA4_MEASUREMENT_ID` + `VITE_HOTJAR_SITE_ID` baked at build time: Dockerfile ARG/ENV on all three frontends, compose passes `GA4_MEASUREMENT_ID` / `HOTJAR_SITE_ID` per environment (empty = tracking off), env examples updated.
- [✓ 3.27.2] **Positioning realignment** — the strategy/KB/README docs stop reading "anti-analytics" and say the D56 game out loud (influencer-friendly: the incumbents' UX is the output of a decade of telemetry, and web10 now runs the same engine with a data policy they can't offer): thesis.md gains the "and it tracks hard (D56)" section; the manifesto's "nobody is mining you" is narrowed to content (never scanned/sold/fed to the ad machine) + the candid telemetry parenthetical; AGENTS.md gains the Telemetry (D56) operating rule; the README premise table gains the "Built like the best, owned like yours" row; design.md drops the stale "privacy-first" justifications.
- [✓ 3.27.3] **Runtime-configurable IDs** — the GA4/Hotjar IDs live in `node_config` (ClickHouse), set in the Node Config UI (Telemetry card), resolved at page load via a public `GET /telemetry` (node authoritative, build-time env is the dev fallback). No rebuild to change the IDs. Also fixed the Node Config save (flat body vs the API's `{token:{token}, update:{...}}` — every save 422'd).
- [ ] **Terms copy** — the tracking disclosure on the marketing site (the "wrong platform for you if you arent ok with that" line, verbatim or close). Gated on a terms surface existing — there is no terms page yet.

## Content Moderation (D59) — Platform

Sensitive-language detection + discover suppression, built on the existing
`group_hidden_docs` mechanism (the operator's "this is built into groups"
instinct). A whole-word, case-insensitive blocklist in `node_config` is
checked on the post-create path; a hit on a discover-group post is auto-hidden
(the existing hide) + flagged for the operator's review queue. A user on
`auto_hide_users` is always auto-hidden. The queue is human-in-the-loop — the
operator suppresses, the machine only flags (no shadow ban). D41 holds:
suppression is board curation, not secrecy — a suppressed user's data is
intact, their profile resolves, and their followers still see their posts.
Spec'd in `knowledge-base/web10-v3/social/content-moderation.md` (the model) +
`sensitive-words-default.md` (the ~50-word default list). Lane is
`content-moderation` in `parallel-execution.md`.

- [✓ 3.41.0] **Decision: D59** (`knowledge/strategy/decisions.md`) — blocklist detection (not a classifier); the auto-down reuses `group_hidden_docs` (no new role/column/read-path change); `auto_hide_users` for user-level suppression; the review queue is human-in-the-loop; D41 holds (board curation, not secrecy).
- [✓ 3.41.0] **KB** (`social/content-moderation.md` + `social/sensitive-words-default.md`) — the model, the flow, the node settings, the security invariants, the default list (hate speech only, evasion variants, excluded words + reasoning).
- [✓ 3.41.0] **Config** — four `node_config` fields (`sensitive_words`, `auto_moderate`, `moderation_enabled`, `auto_hide_users`) + `effective_config` defaults (no DDL — JSON blob) + the shipped default blocklist.
- [✓ 3.41.0] **Detection** (`app.v3.services.moderation`) — `check_text` (whole-word, case-insensitive), `moderation_config`, `should_auto_hide`, `record_flag` (best-effort).
- [✓ 3.41.0] **Write-path hook** (`create_document`) — moderates `posts` on the discover group; flag + (auto_moderate OR listed) `hide_doc_from_group(DISCOVER_GROUP_ID, …)`; best-effort.
- [✓ 3.41.0] **`moderation_flags` table** (DDL template + boot self-heal) + `insert_moderation_flag`/`get_moderation_flags` (the queue is a GROUP BY view).
- [✓ 3.41.0] **Admin endpoints** — `POST /v3/moderation/flags` (the queue) + `POST /v3/moderation/auto-hide` (add/remove from `auto_hide_users`).
- [✓ 3.41.0] **UI** — the Node Config "Content Moderation" card (master switch + auto-hide toggle, blocklist tag input, the review queue with "Keep hiding"/"Hiding").
- [✓ 3.41.0] **Tests** — 27 API (`test_moderation.py`) + 7 UI (`configModeration.test.tsx`).
- [ ] **E2E: moderation gauntlet** — post with a flagged word → hidden from the board → operator keeps-hiding → next post auto-hidden → operator removes → next post visible. Gated on the social-e2e stack.
- [ ] **v1** — profile name/bio detection (flag-only), a retroactive-scan admin command, a user notification on auto-hide.

## Query Engine (D62) — Platform

The **flexible read**: a caller writes a ClickHouse `SELECT` over their
**services** and the node runs it — read-only by construction. The safe-query
engine (`safe_query.py`) parses the query (sqlglot), validates every table
reference, and rewrites each service to an API-built **boundary CTE**
(group-filtered + block/sharing/hidden), so self-joins, aggregations,
subqueries, and caller CTEs all work and none can leak past the caller's groups
(the raw tables are unreachable — a wall, not a membrane). Exposed as
`POST /v3/query` + the SDK's `w.query(sql, { groups? })`. Anon-capable (D41),
app-contract-gated, `LIMIT 1000` + `max_execution_time=10` bounds. Spec'd in
`knowledge-base/web10-v3/query-engine.md` (the discussion) + `safe-query.md`
(the boundary + why the guarantee holds). Lane is `query-engine` in
`parallel-execution.md`.

- [✓ 3.52.0] **The boundary** (`safe_query.py`) — parse → validate → rewrite to boundary CTEs; the `ref` filter (`read_docs_by_ref`) is the first consumer.
- [✓ 3.56.0] **Server-side engagement counts** (`read_ref_counts_by_ref`) — `GROUP BY ref_value` through the engine (exact, no cap).
- [✓ 3.58.0] **`POST /v3/query` + `w.query()`** — the general flexible read: `query_services()` pre-flight, per-service D58 read gate, D42 "not a member" 403, `LIMIT 1000` + 10s timeout, caller-SQL → 400. SDK `w.query()` + `V3QueryResult` + JSDoc examples.
- [✓ 3.58.0] **The ClickHouse 24.8 CTE-inlining fix** — the boundary CTE's block/sharing/hidden `LEFT ANTI JOIN`s broke CTE inlining when combined with a `JOIN` (`UNKNOWN_IDENTIFIER`), which also broke `read_docs_by_ref` + `read_ref_counts_by_ref` on a real node. Rewritten as `NOT IN` / tuple-`NOT IN` subqueries (semantically identical, verified live).
- [✓ 3.58.0] **Tests** — API `test_query_endpoint.py` (20) + `test_safe_query.py` (+12) + `e2e/tests/query-engine.spec.ts` (the seam gauntlet: the power, I3, the contract gate, the membrane, anon).
- [✓ 3.59.0] **v1: the query playground demo page** (`marketing-ui/public/docs/query/`) — an interactive SQL box over the signed-in user's groups (the "go crazy" showcase), five clickable example queries, a result table + loading/empty/error states.
- [✓ 3.60.0] **v1: per-user query rate limiting** (D65) — `/v3/query` rate-limited per user, keyed on the verified `user_key` (not IP — D49/D64), in-memory per-worker (the recovery idiom), 429 when exceeded. No Redis (D66).
- [ ] **v1** — query result caching, `EXPLAIN`-style cost hints. (Redis deferred to the social real-time work — D66.)
- [ ] **v2 teardown: remove Mongo/FerretDB from the node** (D67) — the v3 stack is fully ClickHouse; delete the v2 Mongo code + drop `pymongo` + remove the FerretDB/Mongo/Postgres services. Node becomes ClickHouse + MinIO.

## Contact-Anchored Auth (D61) — Platform

The account is anchored on a **contact** (phone OR email), verified by a 6-digit
code. The contact is the front door: enter contact → code → pick an account on
that contact (or create a new username) → signed in. Sign-up, sign-in, and
password-change are the same flow. A contact can carry many usernames. The
requirement is node policy (D10): the `require_contact` node-config flag;
web10.app turns it on. The 3.47.0 UI already calls the three endpoints — they
were never built (the changelog's "the API is 3.37.0" was wrong). Lane is
`contact-auth` in `parallel-execution.md`.

- [✓ 3.51.0] **Decision: D61** (`knowledge/strategy/decisions.md`) — contact-anchored auth (phone OR email), node-config-gated (D10), one contact → many accounts, unified sign-in + password-change, the verify_token security model, age assurance as a layerable gate.
- [✓ 3.51.0] **KB** (`knowledge/knowledge-base/web10-v3/auth/auth.md`) — the contact-anchored flow section (the three endpoints, the model, the security, the node policy).
- [✓ 3.51.0] **API keystone** (`api/app/v3/endpoints/recovery.py`, `services/clickhouse.py`, `services/twilio.py`, `models/auth.py`) — the three endpoints (request/verify/complete) + `get_users_by_contact` (phone OR email) + Twilio channel-aware (sms/email) + the `verify_token` gate + create-on-complete (unified signup).
- [✓ 3.51.0] **Node config flag** (`api/app/models/config.py`, `services/config.py`) — `require_contact` (D10); enforced in `POST /v3/signup` (401 `CONTACT_REQUIRED`).
- [✓ 3.51.0] **Tests** (`api/tests/test_recovery.py`) — request sends code, verify returns accounts + verify_token, complete signs in / creates account / changes password, contact mismatch, bad code, node-config gate.
- [✓ 3.51.0] **UI** (`ui/src/interfaces/Interface.tsx`, `ui/src/components/CredentialPage/ForgotForm.tsx`) — the contact input (phone OR email), the verify_token plumbing, the "create a new account" option, the primary-sign-in routing.

## Public Docs Overhaul (audience model) — Docs

**The problem.** The public docs (`marketing/marketing-ui/public/docs/`) are thin, not organized by audience, and drifted from the implementation. The KB (`knowledge/knowledge-base/web10-v3/`) is deep and current; the public docs don't reflect it. Worst: `sdk.md` teaches a Mongo-style API (`createClient`, `w.login()`, `$sort`/`$limit`/`$match`, `$set`/`$groups`, `_id`) that doesn't match the real SDK (`createV3Client`, `openAuthPortal`+`authListen`, `read(collection, {groups, limit, offset, ref})`, `update(docId, body)`, `delete(docId)`, `w.query()`) — a developer following the docs builds the wrong app. And there's no section for the people who actually run a node or make money on it.

**The reframe (operator).** "There should be sections of docs, for developers, for users, for people who want to start a node / influencer, people that want to monetize. It's not really doing a good job of asking who's on the marketing docs, then being clear to that audience." The docs need an explicit **audience model**: each section answers "who is this for?" and then speaks clearly to that reader.

**The audience model.** Four readers + the pitch:
- **Users** — fans/followers on a web10 node. "I follow creators, I post, I manage my data."
- **Developers** — building apps on web10 data. "I'm writing code that reads/writes a user's data."
- **Node operators / influencers** — running a node or a creator account. "I run my own node / I'm a creator here."
- **Monetizers** — creators who want to earn. "I want to make money on web10."
- **(The pitch)** — the curious/evaluator. "Is this legit?" (the current `overview.md`).

**The structure.** Reorganize the flat doc list into audience sections (the `Docs.tsx` sidebar groups by audience; each doc names its reader up top):
- **Overview** (the pitch) — keep, tighten. The premise, the reach gap, how it works, the principles.
- **For Users** — `getting-started`, `groups-in-plain-terms`, `your-data` (export / kill switch / opt-out), `account-recovery` (D61), `import-from-other-platforms`.
- **For Developers** — `sdk` (REWRITTEN to the real API), `protocol-spec` (brought current), `query-engine` (NEW), `conventions` (brought current), `groups` (the API surface), `media`, `app-contracts` (NEW), `scaffolding`.
- **For Node Operators / Influencers** — `start-a-node` (NEW), `node-config` (NEW), `app-store` (NEW), `your-audience` (NEW), `being-a-creator` (NEW).
- **For Monetizers** — `ads` (NEW), `ad-catalog` (NEW), `affiliate-programs` (NEW), `payment-rails` (NEW), `monetization-bootcamp`.

**The deep items** (each is the audience-tuned surface of a KB doc — the KB is the source of truth):

### The drift fix (highest priority — the docs are actively wrong)
- [✓] **Rewrite `sdk.md` to the real SDK.** The current doc teaches a non-existent Mongo-style API. Rewrite every example to the actual surface: `createV3Client`; `openAuthPortal`+`authListen` (the auth popup); `readToken`/`isSignedIn`/`signOut`; `create(collection, body, {groups, tags})`; `read(collection, {groups, limit, offset, ref})`; `readRefCounts`; `readById`; `update(docId, body, {groups})`; `delete(docId)`; `query(sql, {groups})`; the group ops (`createGroup`, `joinGroup`, `requestJoin`, `inviteMember`, `getMyGroups`, `getGroupMembers`, …); the app-contract ops (`addAppContract`, `listAppContracts`, `revokeAppContract`); media (`requestUploadUrl`/`confirmUpload`/`getReadUrl`); the account ops (`signup`, `login`, `changePassword`, `setRecoveryPhone`, `verifyPhone`/`verifyEmail`). Source: `KB sdk/api.md` + `sdk/src/v3.ts` (the real signatures). **Acceptance:** every code block matches the real SDK (verified against `sdk/src/v3.ts`); a developer can copy-paste a working app.
- [✓ 3.60.5] **Bring `protocol-spec.md` current.** It's marked "3.0.0-draft" and missing the big recent features. Add: the query engine (`POST /v3/query`, D63), contact-anchored auth / recovery (D61), the engagement model (D62 — comments/reactions as documents in the engager's service), the ad system (D55 — a post tagged `ad`), the D58 per-service role shape, the read `ref` filter + `count` shape, the per-user rate limit (D65). Fix the token format (drop the stale `"type": "tiered"`). Un-draft it. Source: `KB auth/auth.md`, `query-engine.md`, `safe-query.md`, `groups/social-contracts.md`, `social/ads.md`, `decisions.md`.
- [✓ 3.60.6] **Fix the stale snippets in `conventions.md` + `groups.md`.** Replace `$match`/`$sort`/`$limit` with the real `read` opts; update the group role shape to D58 (a per-service permission map, not `services`+`permissions`); add the engagement model (D62) to `groups.md`.

### For Users (new section)
- [✓ 3.60.7] **`getting-started`** — create an account, sign in (the authenticator), your first post, following a creator. Plain language, no code. Source: `KB auth/auth.md` + the social app.
- [✓ 3.60.7] **`groups-in-plain-terms`** — follows, discover, close friends, communities, DMs — what they are and when you'd use each, in user language (no roles/permissions jargon). Source: `KB groups/overview.md` + `social/overview.md`.
- [✓ 3.60.7] **`your-data`** — export your data, the kill switch (revoke all apps), opt-out of a group, make everything private, block someone. The ownership story in user terms. Source: `KB auth/consent.md` + `security/overview.md`.
- [✓ 3.60.7] **`account-recovery`** — the phone/email recovery flow (D61) in user terms: how to get back in if you're locked out. Source: `KB auth/auth.md` (the recovery section).
- [✓ 3.60.7] **`import-from-other-platforms`** — expand the current `export-guidance` (a placeholder: "the operator will supply the detailed content"). **Lead with YouTube** (the first target — YouTubers, via Google Takeout; see the `YouTube Importer` section below) + the web10 **import** flow (getting your exported data onto a node) + the importer. Source: the YouTube importer + the export guidance.

### For Developers (new section)
- [✓ 3.60.8] **`query-engine`** (NEW) — the flexible read: `w.query(sql, {groups})`, the boundary (read-only by construction, scoped to your groups), the "go crazy" examples (self-join, aggregation, CTE, JSON body breakdown), the error surface (403 unsafe, 400 caller-SQL), the rate limit (D65). Source: `KB query-engine.md` + `safe-query.md` + the query playground demo.
- [✓ 3.60.8] **`app-contracts`** (NEW) — how an app gets access: the ACR flow, per-service permissions, the kill switch, the authenticator consent screen. Source: `KB auth/consent.md` + `sdk/contracts.md`.
- [✓ 3.60.8] **`media`** (NEW) — the upload flow (presigned URL → upload → confirm), reading media (presigned GET), the streaming/HLS layer. Source: `KB media/*`.
- [✓ 3.60.8] **`scaffolding`** — the CLI + the demo apps (hello, notes, query, …) as the starting point. Verify the CLI actually exists; fix the "coming soon" framing if it's aspirational. Source: the demo apps + the CLI.

### For Node Operators / Influencers (new section)
- [ ] **`start-a-node`** (NEW) — `docker compose up` (the stack: ClickHouse + MinIO + api/ui/rtc/social), the setup flow (the admin), pointing at your own domain. Source: `KB setup/node-config.md` + `ubuntu-deployment/`.
- [ ] **`node-config`** (NEW) — the node_config, admins, the `/am_admin` gate, the node policy flags (`require_contact`, …). Source: `KB setup/node-config.md`.
- [ ] **`app-store`** (NEW) — approving/rejecting apps, the storefront, the metrics (`users_30d`, …). Source: `KB app-store/overview.md` + `endpoints.md`.
- [ ] **`your-audience`** (NEW) — the owned audience: the followers list, reaching it directly (the differentiator). Source: `KB groups/overview.md` (the owned audience) + `groups/identity.md`.
- [ ] **`being-a-creator`** (NEW) — posting, groups, the social app, the profile. The creator's day-to-day. Source: `KB social/overview.md`.

### For Monetizers (new section)
- [ ] **`ads`** (NEW) — creator-owned ads (a post tagged `ad`), the offer, the disclosure, pinning to a post. Source: `KB social/ads.md`.
- [ ] **`ad-catalog`** (NEW) — the Ad Catalog (the Studio), the composer. Source: `KB social/ads-catalog.md`.
- [ ] **`affiliate-programs`** (NEW) — the affiliate programs (the bootcamp shortlist), the creator-owned links. Source: `KB social/monetization-bootcamp.md`.
- [ ] **`payment-rails`** (NEW) — how revenue works, the 3% rail, the metering. Source: `decisions.md` (D5, D21) + the metering.
- [ ] **`monetization-bootcamp`** — the existing guide; link it into the monetizer section. Source: `KB social/monetization-bootcamp.md`.

### The rendering / UX
- [✓ 3.60.7] **Reorganize the `Docs.tsx` sidebar by audience** — group the docs under "Overview / For Users / For Developers / For Node Operators / For Monetizers" (the current flat list + demo apps). Each doc page names its reader up top.
- [ ] **A "who are you?" landing** — the `/docs` landing asks the reader who they are and routes them to their section (the "asking who's on the marketing docs" the operator wants).

**Sequencing.** The drift fix first (the docs are actively wrong — `sdk.md` teaches a non-existent API). Then the audience sections (Users → Developers → Node Operators → Monetizers), each a bite. The rendering/UX last (it's the container for the content).

**Cross-reference.** This is the public surface of the KB — every doc above is the audience-tuned version of a KB doc; when the KB changes, the public doc follows (the KB is the root of trust). The `Monetization Bootcamp` section (above) and the `Query Engine` section are the KB/platform halves; this section is the public-docs half. Lane: `public-docs` in `parallel-execution.md` (owns `marketing/marketing-ui/public/docs/` + `src/pages/Docs.tsx`).

## YouTube Importer (port your YouTube) — Platform

**The target: YouTubers, narrowly.** Operator: "porting your youtube eventually right! want to narrowly target youtubers only since google has such a great export import thing!" The first import target is **YouTubers specifically** — not all platforms. Two reasons: (1) a YouTuber is the ideal web10 user — they have a big audience (subscribers) they don't own (it's Google's), and the web10 pitch is "own your audience" (the reach gap: 1M subs, 300k reach). Porting to web10 = they own their audience, 100% delivery, no shadow ban. (2) **Google Takeout is a great export** — the data is already easy to get (`export-guidance.md` already documents the YouTube export).

**The flow:** export from YouTube via Google Takeout → import onto a web10 node.
- **Videos** → web10 media (the HLS pipeline, D44).
- **The channel** → a creator profile.
- **Subscribers** → the **owned audience** — the follower/contact list the creator can reach directly (the killer angle: the subscriber list becomes the creator's data; those people become web10 users when they sign up + follow).
- **Comments** → comments (the engagement model, D62).

**The pitch:** "Port your YouTube channel. Own your audience." The reach gap is the hook — on YouTube, Google decides which 300k of your 1M subs see the next video; on web10, 100% delivery is architecture.

**The "eventually" framing.** This is a future item, not the next bite. The first concrete step is the import mapping (Takeout → web10); the importer UI + the "port your YouTube" landing come after.

- [ ] **The import mapping** (Takeout → web10) — parse the Google Takeout YouTube export (videos, channel, subscribers, comments) into web10: videos → media (HLS, D44), the channel → a creator profile, subscribers → the owned audience (the follower/contact list), comments → comments (D62). Source: the HLS pipeline (D44) + the engagement model (D62) + `export-guidance.md` (the YouTube export).
- [ ] **The importer** (the node endpoint + the UI) — the "port your YouTube" flow: upload the Takeout ZIP, map the data, confirm, done. The creator's channel is on their node; their audience is theirs.
- [ ] **The "port your YouTube" landing** — a creator-facing page: the reach gap, the owned audience, the import flow. The hook for the YouTuber. (Feeds the `For Monetizers` / `For Node Operators` doc sections above.)
- [ ] **The docs** — the `import-from-other-platforms` doc (above) leads with YouTube as the first target, pointing at the importer + landing.

## Phase 4 — Production Cutover: v2 → v3, then merge to main

**Where:** `knowledge/knowledge-base/web10-v3/` (migration model), `api/` (migration tooling), `ubuntu-deployment/` (prod deploy)

Prod runs **v2 on real MongoDB** — the live 580-user node at web10.app,
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

- [✓ 3.31.1] **KB: the v2→v3 ACCOUNT migration model** (`knowledge/knowledge-base/web10-v3/migration/v2-to-v3-accounts.md`) — the safety-critical half, docs first, the only item that starts before the gate. The one-day runbook (extract → pilot → recovery → full → SMS), the field-by-field map (v2 Mongo star record → v3 ClickHouse `users`), the bcrypt carry-over (v2 `hashed_password` is a valid v3 `password_hash` — no re-hash, no forced reset), the net-new phone-recovery flow (the current "forgot" is broken; three unauthenticated `/v3/recovery/*` endpoints + a plural `get_users_by_phone`, live before the flip), and the rollback (the mongo is never written to). The spec for `extract_accounts.py` + `migrate_accounts.py` + the recovery endpoints.
- [ ] **KB: the v2→v3 CONTENT migration model** (`knowledge/knowledge-base/web10-v3/migration/`) — the other half of the old "data migration model" item, now split out. What maps to what for the *content*: v2 services/collections → v3 `documents` + `collection_name`; v2 terms/ACL → v3 group contracts; the v2 discovery ledger → dropped or re-derived (decide, with the D30/D32/D34/D35 public-by-default calls in mind); media blobs → re-pointed by object key, not copied. Name what is lossy, what is dropped, and what is re-derived. Gated on the account migration landing (a user must be able to sign in before their content is ported into their profile).
- [ ] (scope when the gate clears) migration tooling + a rehearsal against a staging copy of the prod mongo (docker volume), then the cutover and the dev→main merge.
- [ ] (scope when the gate clears) SMS cutover notice — text all 580 users (phone numbers live in the v2 star records) that they were migrated, over the existing Twilio send path. Needs: the send list (deduped, verified numbers only), the message copy, and a delivery check. Runs after the data flip — the notice says "you're migrated," not "you will be." Copy can be drafted pre-gate.
