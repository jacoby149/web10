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
- [✓] **`group_identity` table + read path** (`clickhouse-init/`, `api/app/v3/services/clickhouse.py`) — public display metadata (name, description, banner, avatar, website, tags), group-keyed, append-only (latest wins); a table (not an I3-gated documents collection) because it's public metadata readable by anon. `get_group_identity` + `get_group_identities` (batch) feed the directory name + the detail display. (Write path is the owner/`page-curator`'s job — a fast-follow.)
- [✓] **API: the group detail (`GET /v3/groups/detail?group_id=`)** — public, principal-based (token optional, `user_or_anon`): metadata (contract, member count, identity) always for an existing group; posts only if the *reader* is a member (else "join to view"); **only a non-existent group 404s** (unlisted-model — a non-discoverable group does not 404).
- [✓] **Opt-in toggle** (`ui/` authenticator group management) — "List in directory" switch on each managed group card, controls `discoverable` only (the blasting flag; anon readability stays a separate Manage-members action). `get_groups_manages` returns `discoverable`; `v3UpdateGroup` accepts it; toggle reflects state + updates on flip.
- [✓] **UI: the directory screen** (`marketing/marketing-ui/`) — the browse surface: `/groups` (grid of discoverable groups from `GET /v3/groups/directory`, search by name/owner + topic filter by tag chips) + `/groups/:id` (deep-linkable detail from `GET /v3/groups/detail` — metadata always, posts when the reader is a member else "join to view", 404 not-found state). `GroupCard` component + Navbar "Groups" link. 14 new UI tests (card render/link/skeleton, directory headline/cards/empty/search/tag-filter, detail name/posts/join-to-view/404/skeleton).
- [✓] **Tests** — unit (identity read + slug fallback, directory query filters `discoverable=1`, directory endpoint shape, detail: non-existent 404s / non-discoverable reachable / member sees posts / non-member "join to view" / anon reads as anon) + e2e (`groups-demo.spec.ts`: directory lists discoverable + excludes non-discoverable; detail 404s ghost / reaches non-discoverable; member sees posts, non-member "join to view").

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

- [✓ 3.30.1] **KB: the v2→v3 ACCOUNT migration model** (`knowledge/knowledge-base/web10-v3/migration/v2-to-v3-accounts.md`) — the safety-critical half, docs first, the only item that starts before the gate. The one-day runbook (extract → pilot → recovery → full → SMS), the field-by-field map (v2 Mongo star record → v3 ClickHouse `users`), the bcrypt carry-over (v2 `hashed_password` is a valid v3 `password_hash` — no re-hash, no forced reset), the net-new phone-recovery flow (the current "forgot" is broken; three unauthenticated `/v3/recovery/*` endpoints + a plural `get_users_by_phone`, live before the flip), and the rollback (the mongo is never written to). The spec for `extract_accounts.py` + `migrate_accounts.py` + the recovery endpoints.
- [ ] **KB: the v2→v3 CONTENT migration model** (`knowledge/knowledge-base/web10-v3/migration/`) — the other half of the old "data migration model" item, now split out. What maps to what for the *content*: v2 services/collections → v3 `documents` + `collection_name`; v2 terms/ACL → v3 group contracts; the v2 discovery ledger → dropped or re-derived (decide, with the D30/D32/D34/D35 public-by-default calls in mind); media blobs → re-pointed by object key, not copied. Name what is lossy, what is dropped, and what is re-derived. Gated on the account migration landing (a user must be able to sign in before their content is ported into their profile).
- [ ] (scope when the gate clears) migration tooling + a rehearsal against a staging copy of the prod mongo (docker volume), then the cutover and the dev→main merge.
- [ ] (scope when the gate clears) SMS cutover notice — text all 580 users (phone numbers live in the v2 star records) that they were migrated, over the existing Twilio send path. Needs: the send list (deduped, verified numbers only), the message copy, and a delivery check. Runs after the data flip — the notice says "you're migrated," not "you will be." Copy can be drafted pre-gate.
