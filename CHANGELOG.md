1.0.145 || 23.07.2026
Gauntlet Playwright Journeys (ws-G3, C6 continued): `e2e/tests/gauntlet.spec.ts` encodes all 8 gauntlet steps (docs/gauntlet-23.07.2026.md) as Playwright journeys so passing flows can't regress. Passing steps are real assertions: Step 1 (signup + login + consent chain + UI render), Step 2 (text post->feed, media presign->upload->confirm, D23 presigned-read regression, media list), Step 4 (like reaction, comment, like button UI), Step 5 (DM send+read between two users), Step 6 (profile save+read, profile screen render), Step 7 (discovery API returns posts), Step 8 (error boundary, no white-screen, 375px viewport). Failing steps are `test.fixme` scaffolds with documented blockers: Step 3 (no follow UI, no user profiles), Step 5 partial (no new-conversation flow), Step 6 partial (no follower count), Step 7 partial (no trending screen in social app), Step 8 partial (real phone unverified). A regression in any passing journey turns the e2e job red.

1.0.144 || 23.07.2026
Fix the Notes + Messages docs demos showing "No notes yet" / "No messages yet" even when the network responses carried real data: `displayNotes(undefined)` / `displayMessages(undefined)` hit the empty-state early-return every time because the demo scripts destructured `res.data` off the read promise, but the self-hosted compat shim's `wapi.read` resolves to the array directly (`client.read` → `patch` → `res.json()` returns `Web10Record[]`, no `.data` wrapper — `sdk/src/client.ts:157`, `sdk/src/compat.ts:61`; the docs even document it as `Promise<T[]>` at `sdk.md:122`). The legacy axios-based SDK used to wrap responses as `{data: ...}`, so `response.data` worked then; the IIFE bundle shipped in 1.0.119 dropped that wrapper, and nobody caught it because no test exercises the demo scripts (they're plain `<script>` tags under `public/docs/`). Changed `wapi.read(...).then((res) => displayNotes(res.data))` → `.then(displayNotes)` in `marketing/marketing-ui/public/docs/notes/script.js` and the matching `.then((res) => displayMessages(res.data))` → `.then(displayMessages)` in `marketing/marketing-ui/public/docs/messages/script.js`; `create`/`update`/`delete` callbacks already ignored the body so they were unaffected. Also fixed the `sdk.md` quickstart example which taught the same broken `r.data` pattern (`wapi.read` example → `.then((records) => console.log('records', records))`, `create` example → `.then(r => console.log('created', r._id))` matching the real `CreateResponse` shape). `bun run build` ships `dist/docs/{notes,messages}/script.js` clean; 42 marketing-ui tests green.

1.0.143 || 23.07.2026
D23 — media reads survive a private bucket. On dev the MinIO bucket is private, so the bare unsigned object URL that `confirmUpload` stores on every media record (`${uploadUrl}/${objectKey}`) 403s every avatar/photo, and the api's `POST /media/{user}/read` presigned-GET endpoint had ZERO callers — blinding D21's "post a photo -> appears in the feed" acceptance. (1) `marketing/web10-social/src/data/wapi.ts` gains `getReadUrl(objectKey, user?, provider?)` that POSTs `{token, object_key}` to `/{user}/read` and returns `{readUrl, expiresIn}` from the api's `ReadResponse`. A module-level cache keyed by `${provider}/${username}/${objectKey}` reuses a URL while it is more than `EXPIRY_MARGIN_MS` (10s) from its `expires_in`-derived expiry, so an N-image feed's re-render is zero round-trips instead of N; an in-flight promise is registered in the cache so a concurrent burst for the same key collapses to one network call (verified by a dedupe test). A new `deriveObjectKey(url)` strips the bucket path segment off a path-style stored URL to recover the S3 key for legacy records (lane A's open `confirm-upload`-persists-`object_key` touch will let `refreshMediaUrls` prefer `record.object_key` once it lands); `clearReadUrlCache()` is a test hook. `MediaRecord` gains an optional `object_key` for forward-compat. (2) `posts.ts` `resolveMediaRefs` now `await refreshMediaUrls(records)` before returning — every record's `url` (and `thumbnail_url` when present) is swapped for a fresh presigned GET, never the raw unsigned one; failures degrade to the stored URL so a bad derivation never breaks a render worse than before. The avatar/feed/composer render paths are unchanged in shape (`mediaMap[…].url`, `thumbnail_url || url`) but now receive presigned values from resolveMediaRefs — a private bucket renders with zero 403s. (3) `__tests__/data/wapi.test.ts` (7 tests) covers the POST shape, the expiry cache reuse, the in-flight dedupe, the per-owner cache keying, the near-expiry re-fetch, and the failure-eviction retry, plus `deriveObjectKey` for path-style/deeper/raw/query-string inputs; `posts.test.ts` adds three cases for resolveMediaRefs presigning, `object_key` preference, and graceful degradation. 248 web10-social tests green (was 224), tsc -b + vite build clean. Only `marketing/web10-social/**` touched. Cross-lane opens remain: C7 (typed-sdk media surface) and the tiny lane-A `object_key`-on-confirm touch — both coordinated, not edited here.

1.0.142 || 23.07.2026
Gauntlet run against dev (v1.0.139): 0 full passes, 4 partial, 4 fails.
Blocking chain for a demoable product: (1) D23 presigned URLs — media 403s on
dev, zero callers of request_read_url; (2) follow UI — followUser() exported
but never called by any component, no user profiles, no suggested accounts;
(3) trending in social app — discovery API works, marketing-ui has /trending,
but social app has zero discover screens; (4) alternative.png on login renders
as blank square. Full report in docs/gauntlet-23.07.2026.md.

1.0.141 || 23.07.2026
C7 — typed SDK media surface (plan.txt phase 8.5, lane C). The typed SDK (sdk/src) had NO media methods; the web10-social wrapper (D23, parallel) hand-rolled its own `getUploadUrl`/`confirmUpload` calls against the api's `/{user}/upload` + `/{user}/upload/confirm` routes, and `request_read_url` had zero callers so a private bucket 403'd every avatar/photo. The SDK now exposes a typed media surface that D23's wrapper can delegate to, against the real api contract in `api/app/endpoints/media.py`: `requestUploadUrl({filename, mimeType, sizeBytes})` → POST `/{user}/upload` (snake_case body `{token, filename, mime_type, size_bytes}` ← `UploadRequest`, returns `{upload_url, fields, object_key, content_type}` ← `UploadResponse`); `confirmUpload({url, filename, mimeType, sizeBytes, width, height, durationSeconds, thumbnailUrl, caption, altText, origin, originId, encrypted})` → POST `/{user}/upload/confirm` (← `MetadataCreate`, returns the media `MetadataRecord`); `upload(blob, meta?)` — the combined presigned-POST-then-confirm convenience that turns a `Blob`/`File` into a persisted media record (requests the url, builds `FormData` with the signed `fields` + file, POSTs to S3, then confirms); and `getReadUrl(objectKey, {username?, provider?, force?})` → POST `/{user}/read` (← `ReadRequest`/`ReadResponse`) with an expiry-aware in-memory cache keyed by `(provider, user, objectKey)` so a feed of N images isn't N `/read` round-trips per render — entries are refreshed a 5s margin before their `expires_in` would 403, `force:true` bypasses the cache (e.g. after a stale-URL 403), and the cache is per-client so two genuinely different addressed users don't share entries. Optional fields are sent as JSON `null` (the api's pydantic models require the keys to exist; defaulted-when-absent doesn't round-trip). New `MediaUploadUrlParams/Response`, `MediaConfirmParams`, `MediaRecord`, `MediaReadUrlResponse` types exported from `index.ts`. Owns sdk/src/** + its tests only (no web10-social or api reach-in). 17 new media tests pin the wire shape (snake_case bodies, exact URLs, provider routing), the upload 3-step flow + S3-failure path, and the getReadUrl cache (fresh hit = no round-trip, near-expiry refresh, force bypass, per-user isolation); 81 sdk tests green, tsc clean.

1.0.140 || 23.07.2026
Lane CI audit (jacoby149/ci-cost-trims): verify the two straggler trims in the Lane CI queue. (1) CI-single-arch — already in target state on `dev`: `cd.yml` and `docker.yml` both publish `platforms: linux/amd64` only; `linux/arm64` was dropped from cd.yml in 1.0.99 (commit `8b2e5aca`) and never re-added, so there is no workflow code change to make. The audit closes the open question behind the lane item: "verify no self-hosters need ARM." `README.md` line 39 + `ubuntu-deployment/README.md` + `ubuntu-deployment/AGENT-OPS.md` document NO arm64/aarch64/Raspberry-Pi operator — only "self-hostable" generically, and the documented deploy target is Ubuntu-on-Proxmox x86_64. An operator that does run ARM can still `docker compose up --build` locally (the published ghcr.io images are amd64-only, but they are an upgrade convenience, not a gate). Lane entry ticked `[✓ 1.0.99, audit 1.0.140]` in `parallel execution.txt`. (2) CI-small-runners — NOT applied; surfaced as BLOCKED. The only remaining candidate the lane item names is `js.yml`'s typecheck step (the standalone `changelog-check` workflow it also named was removed in commit `a3712077` — "a dedicated Actions VM per PR (queue + spin-up) just to run a diff+grep isn't worth the wall-clock"). Applying `ubuntu-latest-small` to ANY PR-gated check in THIS org's plan reproduces the regression commit `196d908e` already filed today (23.07 12:36): the org's GitHub plan does NOT provision the `ubuntu-latest-small` runner label, so the job "queued indefinitely (empty runner_name, cancelled after ~20min) and showed 'pending' forever on every PR." Re-introducing it would turn every JS PR red at the check run, directly violating the lane's "Both trims land green" acceptance — so the lane entry is left `[ ]` open with a BLOCKED note rather than ticked. Re-open when the operator moves the org to a paid plan that provisions the `ubuntu-latest-small` label (or replaces it with a self-hosted small runner). No workflow YAML was touched; all 8 `.github/workflows/*.yml` parse cleanly (PyYAML `safe_load`); no PR-gated workflow's path-filter matches this docs-only diff, so the PR run is green by construction. Parallel-execution.txt lane notes updated to record both findings.

1.0.139 || 23.07.2026
Fix the web10-social "create account / login button not working" regression reported live on dev: after the popup finished auth, the social UI stayed on LoginScreen and the profile didn't load until a manual refresh. `App.tsx` registered its `authListen(() => { setSignedIn(true); setMode('feed'); })` callback ONLY on the signed-out-at-mount branch — a returning user with a session cookie took the `isSignedIn()` branch and skipped registration; once they later logged out and logged back in via the popup, the adapter's own `syncDataLayerToken` listener still fired (so the cookie landed and a refresh recovered) but App's `setSignedIn` listener was never attached, so the popup's auth message had no UI-side handler. The listener is now registered UNCONDITIONALLY — setting already-current state is a React no-op, so signing it on the signed-in path is safe and the post-popup login flips the screen to the feed without a refresh. New `appAuthListen.test.tsx` pins both branches (signed-out and signed-in at mount) and the popup-completes → `Log out` reachable flow; 224 web10-social tests green.

1.0.138 || 23.07.2026
Drop the legacy `FeedPreview` tabbed widget (`For You / Following / Trending` tabs incl. the deprecated `following` tab) and its private helpers — `TABS`/`TabId`, `PostCard`, `SkeletonCard`, `CommentThread`, `createPublicEntry`, `fetchReactionSchemaId` — from `marketing/marketing-ui/src/components/FeedPreview.tsx`. This widget stopped rendering anywhere in 1.0.121 (#217, "remove live Trending feed from landing page"), which dropped `<FeedPreview />` and its import from `Home.tsx`; the dedicated `/trending` page (`Trending.tsx`, shipped 1.0.130) is the replacement and imports only `TrendingCard`, `TrendingSkeleton`, `fetchDiscoverFeed`, `mapDiscoveryToFeedPost`, `formatCount`, `parseCount`, and the `FeedPost`/`DiscoveryPost` types — all of which stay. Exports trimmed to exactly those still imported by `Trending.tsx` / `TrendingSidebar.tsx` / `Trending.test.tsx`; unused `useState`/`useEffect`/`useCallback`/`TrendingUp`/`Users`/`Zap` imports dropped. No behavioral change (nothing rendered the deleted component); tsc + vite build + 42 marketing-ui tests green.
Re-added the Messages demo to the marketing-ui docs. It lines up with the existing Hello + Notes demos: same self-hosted-wapi / SMROnReady / authListen / promptContract scaffolding and the same `cross_origins` origin set (docs.web10.app, dev.web10.app, www.dev.web10.app, localhost, docs.localhost) so it works on prod, dev, and `bun dev` without a separate contract fix like the one notes needed in 1.0.136. New files `marketing/marketing-ui/public/docs/messages/{index.html,script.js}` — a DM-style CRUD demo over a `web10-docs-message-demo` collection: compose form with a `to` (username/provider) defaults to the signed-in user so the round-trip works with one login (writing to your own node is covered by the contract you approve), and lists messages addressed to you from your own node; sending to a friend writes to THEIR node via `wapi.create(SERVICE, payload, toUser, toProv)` and surfaces a 401/403 honestly if they haven't granted your site the messages contract (the same fan-out delivery model the `inbox` service uses). Wired into `Docs.tsx`'s `DEMO_APPS` sidebar (Code icon, matches Hello/Notes styling) and `sdk.md` references. Inline CSS uses the design.md §13 brand tokens verbatim (violet #8b5cf6, zinc dark-first, Inter/JetBrains Mono), no new tokens, no design.md edit. vite build clean (messages/ ships in dist/docs/); 42 marketing-ui tests still green.

1.0.136 || 23.07.2026
Any client that round-trips a whole read-back record into a `$set` payload (the social app's `saveProfile` spreads the existing profile — `_id` and all — into the update) 500'd on every edit: `to_db_field` maps top-level `_id` to Mongo's `_id`, which is engine-immutable, so Mongo rejects any `$set`/`$unset`/`$inc` on it with code 66 ("Performing an update on the path '_id' would modify the immutable field '_id'", even to the same value). `u_t` now drops `_id` from every operator before it reaches the driver (logged at warning), so every caller is protected regardless of whether it remembers to strip `_id` before sending. The pre-existing fancy-update / IMMUTABLE_METADATA guards keep running unchanged — the new check sits before `to_db_field` and only short-circuits the `_id` case. Old `test_id_passthrough` (which asserted the buggy behavior) replaced by four cases: `_id` dropped from `$set`/`$unset`/`$inc`, and a regression test reproducing the full-record round-trip that blew up `saveProfile`. Tests pass (ruff-clean source).
1.0.137 || 23.07.2026
Notes demo 401'd when opened on the DEV deployment. 1.0.136 added `docs.web10.app` to the SIR's `cross_origins` but missed that on dev, the marketing-ui stack serves the docs pages from `dev.web10.app` (and the `www.dev.web10.app` apex alias — see ubuntu-deployment/README.md's marketing-ui row). The auth portal still mints the tiered token against `https://auth.web10.app`, so a visitor from `https://dev.web10.app/docs/notes/` gets `site: dev.web10.app`, which isn't in the contract, and `is_in_cross_origins` denies every CRUD op (`crud access denied`, surfaced as the live `401` on `PATCH /jacoby149/web10-docs-note-demo`). Added `dev.web10.app` and `www.dev.web10.app` to `cross_origins` in `marketing/marketing-ui/public/docs/notes/script.js` only; no other demo touched (notes is the only docs demo doing CRUD that ships on dev). The SMR handshake re-fires on first visit so existing users get the re-scoped contract auto-approved.

1.0.136 || 23.07.2026
Plan the media story (operator, 23.07: "this is cool but it isn't tiktok — no short videos; adding images to a post is ugly; how will we do video?"). plan.txt gains PHASE 8.5 — media polish + video (the tiktok-shaped gap), grounded in a code audit of the honest state: the composer is a bare file input with 80×80 hover-only previews (no reorder, no alt text, remove button invisible on touch), the feed has no lightbox and silently slices past 6 images, and video is a trap — the picker accepts `video/*` but preview and feed both render it with `<img>`, so a picked video just breaks; the API stores anything up to 500MB but derives nothing (thumbnail_url/hls_manifest_url are never populated). The phase stages the route so every step ships alone: PHOTOS V1 (composer tray at real aspect ratios, client-side downscale + thumbnail + dimensions into the confirm fields, alt text, attach-time validation), PHOTOS V2 (lightbox, +N overflow, reserve-space-from-dimensions, and a design.md MEDIA SPEC with canonical aspect ratios), VIDEO V0 (direct h.264-mp4 playback with client-captured poster — works against today's API, honest caps), VIDEO V1 (the tiktok answer: a 9:16 snap-scroll short-form lens over the same posts/media services, riding direct mp4 so it does not wait for transcoding), VIDEO V2 (ffmpeg transcode worker → HLS, public media only — a transcoder can't transcode what it can't decrypt, I4; includes the phase-5 size-accounting straggler). Phase 8's old one-line video item now points at 8.5; the KNOWN GAPS video-gap note reflects the staging. parallel execution.txt gains the lane homes: D21 media polish (photos v1/v2 + video v0 — gauntlet-step-2 territory, start now), D22 vertical feed (gated on D21's video v0), A9 transcode pipeline (lane A, PARKED until the gauntlet passes per D29). Docs-only change.


The authenticator's Node Config panel is the node's admin console, but it was missing fields and had no App Store curation. Operator: "it should have all the vars in there and everything! it should also have a thing to approve apps to show up on my app store — any app can register, but i should be able to approve." Reverses the D16 curation decision (decisions.md D31: takedown → allowlist). (1) API: `documentdb.register_app` now inserts new entries as `approved: false` (pending) via `$setOnInsert` so repeat visits never reset an approval, and `get_apps` (the public storefront backing `/stats`) filters `{"approved": True}` — pre-approval historical apps now show up as pending in the admin panel until the operator curates them. New `list_apps_admin()` returns every registered app with its approval state + visit count + registration time, and `set_app_approval(url, approved)` toggles it. Two new admin-only endpoints in `system.py`: `POST /apps/admin` (lists with a `pending` count) and `POST /apps/approve` (toggles — reuses `check_admin`, so the existing admin-list + token-certify enforcement covers it). Open bodies stay include_in_schema=False like the sibling system routes. (2) UI: `ui/src/components/Config/ConfigPage.tsx` adds the missing fields — Database (db_url, db_name), Signing Algorithm (read-only, I1 note), Stripe subscription IDs (test/live for credits + space), S3 `use_ssl` toggle, and light/dark logo paths — and a new "App Store Approvals" card with pending-count badge, per-row Approve/Unapprove buttons, and approve/pending status pills. Also fixes the pre-existing "Save wipes secrets" bug: the page now diffs the edited config against the loaded snapshot and only sends changed fields, so stripped fields (private_key, s3_secret_key, twilio_auth_token, stripe keys) are never overwritten with empty strings on Save. (3) Tests: new `TestAppStoreCuration` class in `api/tests/test_endpoints.py` (5 tests) covers `/stats` approved-only contract, `/apps/admin` admin-allow + pending count, and `/apps/approve` admin-allow + DB call; 378 API tests green (was 373), ruff clean. 74 ui tests + tsc -b + vite build clean.
Fix the marketing docs Notes demo failing with "Failed to read notes" / "Failed to create note" (and never prompting to approve a contract) in the live scenario the user just hit: log in via the Hello demo — which works because it does no CRUD — then visit Notes already signed in. Two compounding bugs, both in `marketing/marketing-ui/public/docs/notes/script.js` only. (1) **Wrong `cross_origins`** — the shipped SIR listed `["auth.web10.app","web10.app","www.web10.app"]`, none of which is the origin the demo actually runs on (`docs.web10.app`). The auth portal mints a tiered token scoped to the referrer's hostname (`site: docs.web10.app`), and `is_permitted` only lets it through when `is_in_cross_origins(token.site, …)` matches — `docs.web10.app` is NOT in `CORS_SERVICE_MANAGERS` (only authenticator hosts are), so the wrong list 401'd every CRUD call with `crud access denied`, surfacing as "Failed to read/create note." Restored the canonical origin set `["docs.web10.app","localhost","docs.localhost"]` (matching `sdk/demos/notes/script.js`), so it works on prod (`docs.web10.app`), `bun dev` (`localhost`), and the localhost docker-compose vhost. (2) **Returning signed-in users skipped consent entirely** — the demo did `if (isSignedIn()) initApp(); else authListen(initApp)`, so a visitor who already had a token cookie (from the Hello demo) went straight to a read that 401'd with no way to set up the contract, since the auth button had already re-labelled itself "Log out." Fixed by: always registering `wapi.authListen(()=>initApp())` (so a fresh tiered token posts back after consent and re-runs initApp against the now-authorized service); and a `promptContract()` catch handler on read/create that re-points the button to `wapi.openAuthPortal` with an inline "Set up the notes contract" prompt. Re-opening the auth portal while still signed in renders the ConsentView (the auth cookie persists there), the SMR handshake fires (the demo's `SMROnReady` listener was registered at load, so it's ready), the user approves, the portal posts the fresh scoped token back, `authListen` swaps it in, `initApp` re-runs, `readNotes` succeeds. Hello demo untouched (it has no CRUD and was already correct). No rebuild of `wapi.js` needed — only `notes/script.js` changed (the bundle in `public/docs/wapi.js` already exposes every method used).

1.0.135 || 23.07.2026
A signed-out visitor arriving at the authenticator FROM AN APP (e.g. social → "log in" → consent flow) could never create an account: ConsentView rendered only the embedded LoginForm regardless of `I.mode`, so "Create a new account" (`setMode('signup')`) and "Forgot username or password?" (`setMode('forgot')`) changed state but the screen never changed — both buttons looked bricked (reported live on dev). ConsentView's signed-out branch now respects `I.mode`: signup renders an embedded `SignupForm` (headline "Create your node to connect {host}"), forgot renders an embedded `ForgotForm`, each with a working way back to login; `SignupForm`/`ForgotForm` gained the same `embedded` prop contract `LoginForm` already had (bare fields + actions, no card chrome — the consent card supplies the frame), and embedded ForgotForm's Cancel returns to the embedded login instead of the app store. Signup still auto-logs-in on success, so the consent flow proceeds straight to the share-requests screen. New `consentView.test.tsx` pins all the mode transitions (5 tests); 79 ui tests green, tsc + vite build clean. Only existing tokens/classes reused (design.md §13).

1.0.134 || 23.07.2026
Three fixes from the 23.07 deploy-pipeline shakeout. (1) **Prod media uploads 403'd on every attempt** even after 1.0.132's public-endpoint signing: `request_upload_url` put `Content-Type` in `generate_presigned_post`'s `Fields` but not `Conditions` — boto3 does NOT mirror Fields into the signed policy, and S3/minio reject any form field the policy doesn't cover (`AccessDenied: "Content-Type" not specified in the policy`, reproduced end-to-end against prod). The Content-Type condition is now in the policy; two regression tests in `test_driver_contracts.py` (Bug 3) pin both the source shape and the real-boto3 no-mirroring contract, since mocked suites are blind to a server-side policy check. 375 api tests green. (2) `e2e/docker-compose.yml` still built marketing-ui from the narrow `../marketing/marketing-ui` context, which 1.0.131 made invalid (the Dockerfile COPYs `marketing/marketing-ui/*` paths from the repo root) — every e2e run on dev/main failed at "Build & start e2e stack". Now repo-root context + dockerfile override, mirroring the ecosystem compose and cd.yml. (3) `smoke.sh` raced container boot: `compose up -d` returns when containers START, gunicorn needs ~5-10s, and the api has no Docker healthcheck for the stabilize loop to wait on — both of today's deploys went red with the stack actually healthy (dev api probed 3s before workers finished booting). `check()` now retries up to 30s before declaring FAIL. Box-side ops in the same shakeout (OPS-LOG 23.07, second entry): Portainer GitOps auto-update DISABLED on web10-dev + web10-prod — `deploy.yml` is now the single deployer per env (dev pushes → web10-dev, main pushes → web10-prod), which is what finally put a real commit hash on prod's status page.

1.0.133 || 23.07.2026
Fix photo upload failing on prod with a browser Mixed-Content block (`http://web10-prod-minio:9000/web10-media` "blocked; the content must be served over HTTPS", then `Failed to upload image: TypeError: Failed to fetch`). Root cause: the media service signed its browser-facing presigned upload/read URLs with the SAME S3 client the API uses to reach MinIO internally, whose `endpoint_url` on prod is `http://${STACK}-minio:9000` — an internal Docker host the browser can neither resolve nor load over HTTP from an HTTPS page. A config-only fix is impossible: MinIO's container serves plain HTTP on :9000 for in-network calls, but the browser needs HTTPS via NPM, and one endpoint can't be both. Split the two roles: `get_s3_client()` keeps the internal endpoint for server-side ops (`ensure_bucket`), and a new `get_s3_signing_client()` on a new `S3_PUBLIC_ENDPOINT` setting signs the presigned URLs handed to the browser — signing is offline (no network call) so the API never connects to the public host, it only needs to embed it in the URL. `S3_PUBLIC_ENDPOINT` defaults to `S3_ENDPOINT`, so local/e2e (one host for both) are unchanged; `docker-compose.ecosystem.yml` now sets it to `https://${MINIO_HOST}` (the MinIO vhost already aliased on the proxy network and documented in the env examples). Regression tests: the internal client uses `S3_ENDPOINT`, the signing client uses `S3_PUBLIC_ENDPOINT`, and the default keeps them equal; the `use_ssl`-on-client driver-contract test updated for the refactor. 373 API tests green (was 372); ruff clean. NOTE: takes effect on prod only after the stack is rebuilt+redeployed with the new image.
Prod's status pill was STILL "live"/unknown after 1.0.131 — root cause found and killed at both ends. (1) Portainer's GitOps checkout deletes `.git` before building, so 1.0.131's `COPY .git /app/.git` made EVERY web10-prod (and web10-dev) stack auto-update fail at the marketing-ui build (`"/.git": not found`, scheduler retrying every 5 minutes; web10-prod's ConfigHash was frozen at `de1d036a`). The Dockerfile now bind-mounts the build context at the status-bake step (`RUN --mount=type=bind`) instead of COPYing: a context WITH `.git` (GitHub runner, the box's `/opt/web10` clone) bakes real commit+date exactly as before, and a context WITHOUT `.git` (Portainer) builds clean, baking the version from `CHANGELOG.md` with commit `unknown` — a degraded pill beats a dead deploy pipeline. Dropping the early `COPY .git` also stops every commit from busting the `bun install`/vite layer cache. Verified both ways: temp clone with real `.git` → bakes `commit:"a96d77e"` matching HEAD; same context with `.git` removed → build succeeds, `version:"1.0.131"`, commit unknown. (2) Box-side (logged in OPS-LOG.md): the GitHub-Actions prod deploy (`deploy.yml`) had failed 7/7 runs ever — `env.prod` on the box had `MINIO_PASSWORD` empty, and worse, lacked `DB=deploy` + `DB_URL`, so a "successful" run would have silently re-pointed prod's api at the empty FerretDB instead of the real 208-account mongo (the parse failure was accidentally protective). `env.prod` is now completed to match the Portainer stack env exactly, and prod marketing-ui was surgically rebuilt from the box clone — https://web10.app/status.json now serves real version/commit and the pill shows `v1.0.132`.

1.0.132 || 23.07.2026
The marketing-ui `/docs` tab was bare — clicking it (with no sub-page selected) rendered a one-line "Select a document from the sidebar…" stub, and the only high-level "what is web10" copy lived on the landing page or buried in the protocol spec. Added a real Overview landing page that loads by default at `/docs`: `marketing-ui/public/docs/overview.md` — written in the manifesto/README voice (declarative, no gush, only claims what's shipped) covers the one-premise pitch ("what you make is yours"), the reach gap, how it works (fan-out on write → 100% delivery by architecture), the six principles, and a roadmap section drawn from `timeline.md` (today → rule of 100 → the Oct verdict → M2 → grind to breakeven), closing with an author credit to Jacob Hoffman / jacobhoffman.xyz. Wired into `Docs.tsx`: Overview is now the first sidebar entry (Compass icon, distinct from the per-doc `FileText`), and `/docs` with no sub-page resolves to `overview` instead of the empty stub — the sidebar Highlights Overview as active when on `/docs` exactly. Matches design.md §2 voice; uses only existing tokens via `docs-prose`. vite build clean (overview.md ships in dist/docs/); 42 marketing-ui tests still green.

1.0.131 || 23.07.2026
Fix the deployment status page baking `version:"unknown"` / `commit:"unknown"` on prod (the corner pill read "live" with only a timestamp, no version/commit) while dev showed real values. Root cause: three deploy paths ship the marketing-ui image, but only one passes build args. The SSH `deploy.yml` action computes and exports `GIT_COMMIT` + `STATUS_VERSION` before `docker compose` (dev's last deploy), but Portainer's 5-minute GitOps poll re-runs `docker compose up --build` with NO such env — so `build-status.sh`'s args fell back to empty and it baked "unknown". Prod is driven by the GitOps poll, so it was permanently stuck. Fix makes `status.json` self-sufficient regardless of build args: the marketing-ui build context is now the repo root (`docker-compose.ecosystem.yml`, `cd.yml`, and the `Dockerfile` all updated to `context: ..`/`context: .` with `file:`/`dockerfile:` pointing at `marketing/marketing-ui/Dockerfile`), the build stage installs `git` and copies `CHANGELOG.md` + `.git` into `/app`, and `build-status.sh` falls back to reading the commit SHA + date from `.git` (`git --git-dir`) and the version from the top line of `CHANGELOG.md` when the args are absent. This also fixes `commitDate`, which was `"unknown"` even on dev (the old script ran `git log` against a non-existent `.git` in the narrow context). Added a repo-root `.dockerignore` so the wider context stays small (keeps `.git` intact — excluding its packs would break `rev-parse`). Verified end-to-end: a `docker build` with zero build args against a real clone bakes `version:"1.0.127"`, `commit:"17553b51"`, `commitDate:"2026-07-23 14:33:27 -0400"` (all matching the clone HEAD). Follows the same "self-sufficient status page" line as the earlier stuck-yellow-dots fix.
D19 Phase A — content lifecycle foundation repair. The visibility split shipped half-built and crossed at both ends: importing your IG/FB/YouTube history auto-PUBLISHED your entire archive (the marketing-api parsers wrote to the legacy anon-readable `posts` collection, whose SMR terms whitelisted anon read), while composing natively wrote to `public_posts`/`private_posts` so they never re-appeared on a wall that read `posts`. decisions.md D30 fixed the model (visibility = the COLLECTION a record lives in, never a status field), and this commit lands Phase A of its task list — the live-exposure fix, no new UI yet. (1) `marketing-api` parsers (instagram/facebook/youtube) now tag imported post records as `service: staging_posts` instead of `posts`; `validation.py` registers `staging_posts` against the posts schema. Media/comments/contacts stay in their own (already owner-scoped) services — only the post record moved. (2) The social app registers a `staging_posts` SMR sir with NO anon-read whitelist in `Web10SocialAdapter`, so the node's default-deny (`is_permitted` returns False unless the requester is the owner with their own token) holds — the sir only pre-authorizes the social app's origin to operate on a user's own staging collection. The sirs list is now extracted to `src/data/serviceTerms.ts` (`buildSocialServiceSirs`) so the owner-only-vs-anon-read invariants are unit-testable without booting the adapter. (3) `readMyPosts` (the wall data layer) no longer reads the legacy `posts` collection at all — it returns `public_posts` + `private_posts` only, and drops the in-place legacy(html/media/time)→(text/media_refs/created_at) migration that lived there before (staging is its own collection now; surfacing legacy `posts` would re-publish whatever the old bugged imports wrote). Staged content surfaces in Phase C's staging/review screen, NOT the wall. (4) The broken `/exporters` CTA in three social empty states (FeedScreen, DmsScreen, and a new one on ProfileScreen's "No posts yet") now opens `${MARKETING_ORIGIN}/import` in a new tab — `MARKETING_ORIGIN` is a new origin in `src/lib/origins.ts` (build-time `VITE_MARKETING_ORIGIN` arg, prod fallback `https://marketing.web10.app`; dev `marketing.dev.web10.app`); the social Dockerfile + `docker-compose.ecosystem.yml` pass it, and the env examples get `MARKETING_UI_ORIGIN`. Tests: 9 new marketing-api parser tests (`test_staging_posts.py` — every platform's post record lands in `staging_posts`, never legacy `posts`; `staging_posts` validates; a tiny Instagram ZIP through parse_instagram), 5 new readMyPosts assertions in `posts.test.ts` (wall reads public+private only; does NOT read `posts`; does NOT read `staging_posts`), and a new `serviceTerms.test.ts` asserting the security invariants (staging_posts owner-only, public_posts anon-read, private_posts owner-only, legacy posts whitelisted for back-compat). 26 marketing-api tests green (was 17), 233 social tests green (was 228), tsc + vite build clean.

1.0.130 || 23.07.2026
Build out the marketing-ui `/trending` page so it reads as a live network instead of a placeholder feed (Lane D gauntlet step 7 — D-trending-card/grid/sidebar/polish, all four items). Previously `/trending` rendered the home-page `PostCard` list in a single narrow column and, when the discovery API returned nothing, fell back to five perpetual skeleton cards — a page that looked broken whether or not the network was quiet. Now: (1) `FeedPreview.tsx` gains `TrendingCard` + `TrendingSkeleton` exports — a media-forward ranked card with a rank badge (#1 gold flame, #2-3 silver, #4+ brand), a heat glow keyed to `engagement_score` (violet halo in tiered intensity via the §13 glow tokens — one decorative glow per screen, design.md §4), author row, 3-line content clamp, hashtag chips, and an engagement bar; hover/focus lifts 2px and intensifies the glow (`motion-reduce` safe). `FeedPost` carries `engagementScore` + `tags`. (2) `Trending.tsx` is a responsive 1/2/3-col grid with the #1 card featured across two columns, a sticky horizontal-scroll topic-filter chip rail derived from post tags, and the hero statement "What's actually trending. No algorithm." (3) New `TrendingSidebar.tsx` — a desktop-only (`lg:`) sticky "Top 10" ranked list; clicking an entry smooth-scrolls its card into view and focuses it. (4) Polish: a shimmer skeleton grid matching the real layout (no layout shift), an empty-state story beat ("The network is quiet" + CTA into web10 social) replacing the fake skeletons, and a "Load more" brand pill that pages 20→40→…→100 with `trending_load_more` / `trending_comment_attempt` funnel events. Added the canonical `--color-glow*` tokens to marketing-ui's `@theme` (it was missing them; values match design.md §13 exactly). 42 marketing-ui tests green (was 33) — new `Trending.test.tsx` covers the rank tiers, interactive vs read-only card, and the page's grid/empty/load-more/topic-filter states over a mocked discovery API. tsc + vite build clean; desktop/mobile/empty screenshots in the PR.
1.0.129 || 23.07.2026
Fix the web10-social profile/feed/upload 500s reported live (`api.web10.app/jacoby149/{posts,profile,upload}` all 500 — feed load, profile save, and image upload dead). Once the CORS-masking bug (1.0.127) was fixed the browser could finally see the real status: a genuine 500, i.e. an *unhandled* exception, not the expired-token 401 that was previously masked. Read the actual traceback off the prod container (`docker logs web10-prod-api-1`) rather than theorizing, and found TWO unrelated driver-contract bugs on the shared paths: (1) **every write** — `documentdb.update()` (and `update_schema`/public-entry update) passed `return_document=pymongo.RETURN_AFTER`, which is not a real pymongo attribute (`AttributeError: module 'pymongo' has no attribute 'RETURN_AFTER'`); the constant is `pymongo.ReturnDocument.AFTER`. Fixed all three call sites. (2) **every upload** — `media.get_s3_client()` passed `use_ssl` inside `botocore.config.Config(...)`, but `use_ssl` is a `boto3.client()` kwarg, so `Config(use_ssl=...)` raised `TypeError: Got unexpected keyword argument 'use_ssl'`; moved it up to the `client(...)` call. Both were invisible to the test suite because `conftest.py` mocks `pymongo`/`boto3` as `MagicMock`, which swallows `.RETURN_AFTER` and `Config(use_ssl=...)` silently — the same mocked-driver blind spot documented in 1.0.115. New `test_driver_contracts.py` closes the gap: source assertions that the invalid symbols are gone, plus subprocess checks against the REAL installed pymongo/botocore (a fresh interpreter that never loads the mocks) so a future library-contract flip also trips. Also hardened error handling so we stop needing to SSH-and-guess: `bare_exception_handler` now returns the exception class + message + a short `error_id` in the 500 body (safe — the code is open source, so the class/message reveal nothing the source doesn't; the full traceback with runtime locals stays server-side only, keyed to the same `error_id`), so a future unhandled 500 is diagnosable straight from the browser console. Regression test in `test_cors_trust_boundary.py` asserts the self-reporting body. 370 API tests green (was 365); ruff clean.
1.0.128 || 23.07.2026
CI-e2e-push-only: `e2e.yml` no longer runs on `pull_request` — it now triggers on `push` to `dev`/`main` only (with the same `paths:` filter: e2e/ui/*-social/marketing-ui/api/docker-compose/the workflow itself). PRs stop paying the ~15-min Playwright wall-clock; regressions are still caught, just post-merge instead of pre-merge. Same visibility-first trade-off the 1.0.99 push-trigger removal already took for the other CI workflows and the 1.0.118 changelog-check removal took for advisory checks — e2e is the last hold-out. No PR blocks on e2e anymore; issues surface in the post-merge run on dev (or main, post-deploy-merge) instead. `concurrency` group unchanged (`e2e-${{ github.ref }}` still cancels superseded runs per-ref).

1.0.127 || 23.07.2026
Fix the whole web10-social app failing with "Failed to fetch" / "No 'Access-Control-Allow-Origin' header" once a session token expires (reported live: profile, feed, and image upload all dead, console full of CORS errors from `social.web10.app` → `api.web10.app`). NOT an API-CORS misconfiguration — `allow_origins=["*"]` is correct and every *success* and HTTPException response already carries `access-control-allow-origin: *` (verified on prod). The bug: a handler registered for the base `Exception` (`bare_exception_handler`) is installed by Starlette in the outermost `ServerErrorMiddleware`, which WRAPS the `CORSMiddleware` — so its responses never pass back through CORS and ship WITHOUT the ACAO header. Services raise bare string exceptions (`raise Exception("TOKEN")` in `certify` on an expired token, `MINT`, `LOGIN`, …), and every crud/media request calls `is_permitted`→`certify` first, so an expired token turned every call into a header-less 401 that the browser reported as an opaque CORS failure instead of a real 401 the app could act on. Reproduced on prod: `POST /certify` with a bad token → `401` with NO `access-control-allow-origin`, while the normal path returns it. Fix: the exception handlers (`bare_exception_handler` incl. its mapped-exception branch, `jwt_error_handler`, `validation_exception_handler`) now stamp `access-control-allow-origin: *` on their responses via a `_with_cors()` helper; CORS is wildcard + credential-less so this is safe, and for handlers that already run inside CORSMiddleware (PyJWTError, RequestValidationError) the middleware just overwrites with the same value (idempotent). Regression tests added to `test_cors_trust_boundary.py`: a bare-`Exception("TOKEN")` 401 and a 422 validation error must both carry the CORS header. 365 API tests green (was 363).
1.0.126 || 23.07.2026
Fix the deployment status page's stuck-yellow service dots. `build-status.sh` bakes `healthEndpoints` into `status.json` from build args, but a GitOps rebuild ships them empty (`social` and `marketing` had no origin args), and the page's health-check loop did `if (!url) continue;` — leaving those two dots on the pulsing "checking" (yellow) state forever regardless of whether the services were up. The page now derives any missing health URL from the current hostname (service vhosts are always `<service>.<zone>`; "marketing" is this very origin), so all four dots resolve to a real up/down state; probes are bounded by an 8s AbortController timeout so a hanging host can't perpetuate the pulse either. Also renders "unknown"/empty version/commit/date as "—" instead of the literal word "unknown". Status page is self-sufficient now — correct even when the build args are absent.

1.0.125 || 23.07.2026
Remove the live "Trending" feed from the marketing landing page. `Home` rendered `<FeedPreview />` as the very first section (above the Hero, added in #168), so the front marketing page opened with a network feed that showed perpetual skeleton cards whenever the discovery API returned nothing — burying the hero and the pitch under a half-loaded app surface. Dropped `<FeedPreview />` and its import from `Home.tsx` (plus the now-unused `useCallback` import); the landing page opens on the Hero again. The dedicated `/trending` page is untouched — it imports the feed pieces (`PostCard`, `SkeletonCard`, `fetchDiscoverFeed`, …) directly, not the `FeedPreview` wrapper, so it keeps working. vite build clean.

1.0.122 || 23.07.2026
Fix trending page comment button and marketing-ui like button. The trending page's comment button now toggles a comment thread (fetches from `/public/entries`) instead of just incrementing the comment count. The marketing-ui FeedPreview on the home page renders interaction icons as read-only spans — no clickable like/comment/repost buttons — since the marketing site is a public preview with no auth. `PostCard` gained a `readOnly` prop; `FeedPreview` passes `readOnly={true}`. Trending page comment handler removed from `handleReaction` (only like/repost still increment counts).

1.0.124 || 23.07.2026
Fix three web10-social product bugs reported from the live app: DMs merged into one thread, profile-picture upload silently failing, and composed posts vanishing. (1) DMs — `readDms` built a single `{ $or: [...] }` filter to match both directions of a conversation, but the node's query translator (`api q_t`) strips any top-level `$`-prefixed key, so the filter was silently dropped and every read returned ALL of the user's DMs regardless of peer — so clicking any friend showed the same merged thread. Replaced with two flat, peer-scoped equality queries (one per direction) that survive translation, merged and sorted client-side; also de-fanged the two "accidentally-correct" `$or` reads in `listConversations` (now plain `{}` reads, honest about wanting "all my DMs"). (2) Profile picture / image posts — `uploadMedia`'s confirm step read the raw JWT and API protocol off the *wrapper* object (`(wapi as any).token` / `.APIProtocol`), which live only on the underlying SDK, so it POSTed `token: undefined` to `/upload/confirm` and failed auth; the stored object URL also used the raw filename instead of the server `objectKey`. Confirm now goes through a new `wapi.confirmUpload()` on the wrapper (token/protocol handled where the raw SDK is reachable) keyed on `objectKey`. `ProfileScreen.handleUpload` had no try/catch, so the throw was an unhandled rejection with zero user feedback — it now shows an inline error and an uploading spinner. (3) Posts — the composer writes to `public_posts`/`private_posts` (D5.5 discovery split) but `readMyPosts` only read the legacy `posts` service, so every newly composed post disappeared from the profile/wall; `readMyPosts` now unions all three services. Regression tests added: DMs must issue flat per-direction queries with no `$or`; `readMyPosts` unions the three services; `uploadMedia` confirms via the wrapper using the objectKey. 225 tests green (was 223); tsc + vite build clean.
1.0.123 || 23.07.2026
Fix the auth UI's "create account"/"Sign up" button appearing dead. The button was never broken — but every failure path (a missing/short phone number, mismatched passwords, a backend rejection like a taken username) surfaced its message ONLY through the global StatusBar, a faint `bg-warning/15` strip pinned to the very top of the page. The login/signup/forgot screens are chromeless and vertically centered, so on a desktop viewport the sole feedback landed ~650px above a form the user was staring at: click Sign up, nothing changes near the button, submit silently blocked → "the button does nothing." Reproduced against live dev with headless Chromium — a valid submit already succeeds (POST /signup → 200 → auto-login), but no-phone/short-phone submits set "Must Enter Phone Number" and fire no request, with the only signal off-screen. Fix: new `CredentialStatus` component echoes `I.status` inline inside each credential card, directly under the submit button (16px gap, verified) — danger-styled (`bg-danger-muted`/`text-danger` + `AlertCircle`, matching the repo's existing error pattern per design.md §8 "error text under the field") for failures, muted + spinner for in-progress states. Wired into LoginForm (covers the embedded ConsentView variant too), SignupForm, and ForgotForm; the global StatusBar is unchanged. Purely client-side, no behavior change to auth itself. tsc + vite build clean; 74 UI tests green.
1.0.122 || 23.07.2026
Fix the two docs demo apps (hello, notes) — both were bricked. They loaded the SDK from `https://auth.web10.app/sdk/wapi.js`, which 404s (the SDK moved to npm when the old auth app was retired), so `wapiInit` was undefined and every button was dead. Self-hosted the SDK: built a browser IIFE bundle of the compat shim (which registers `window.wapiInit`) to `marketing-ui/public/docs/wapi.js` and repointed both demos' `<script>` at it (`../wapi.js`, same-origin, works on dev and prod). Dropped the now-unused axios CDN tag (the new SDK uses fetch). Verified in jsdom that the bundle exposes a working `wapiInit` with every method the demos call (openAuthPortal, authListen, isSignedIn, readToken, SMROnReady, read/create/update/delete/signOut), and that `vite build` carries `wapi.js` + both demos into `dist/docs/`. The bundle is generated from `sdk/` — its banner documents the rebuild command (`bun build src/index.ts --target browser --format iife`).
1.0.121 || 23.07.2026
Parameterize marketing-ui backend origins so dev/self-hosted builds stop pointing at production. Every "into the app" link was hardcoded to prod — the App Store "Open web10 social" → `https://social.web10.app`, and Sign In / Enter web10 (Navbar, Home, Exporter) → `https://auth.web10.app` — and `FeedPreview` read `VITE_API_ORIGIN` while the ecosystem compose actually injects `VITE_API_URL`. Net effect on `dev.web10.app`: `/trending` fetched prod's (empty) discovery API so it rendered blank, and every login link threw you to prod. New `src/lib/origins.ts` reads `VITE_API_URL`/`VITE_AUTH_URL`/`VITE_SOCIAL_URL` (the build args the compose already passes) with prod fallbacks; FeedPreview + AppStore + Navbar + Home + Exporter use it. Added `SOCIAL_ORIGIN` to `env.{dev,prod}.example` (the compose referenced `${SOCIAL_ORIGIN}` but it was never defined). Verified: a dev-args build bakes `api/auth/social.dev.web10.app` into the bundle, a plain build still falls back to prod; tsc + vite build clean. Mirrors the origin parameterization D14 (web10-social) and B5 (ui/) already did. Box note: the real dev/prod `.env` must add `SOCIAL_ORIGIN` for the social link — `VITE_API_URL`/`VITE_AUTH_URL` are already set, so trending and auth links go live on the next dev rebuild without further env changes.
1.0.120 || 23.07.2026
Fix the web10-social data layer being stranded right after a fresh login (every post/like/comment/DM threw "not authenticated" until a page refresh). The app builds TWO wapi/client instances — one for auth (the adapter) and a separate one for the data layer (`createWapiWrapper`). Both read the token cookie once at init, so a fresh login within a session — which sets the token only on the auth instance (+ the cookie) — left the already-created data-layer instance tokenless; a refresh "fixed" it only because it re-created the data-layer instance from the now-present cookie. `Web10SocialAdapter` now mirrors the token onto the data-layer instance at init and whenever login lands (via an additive `authListen` window listener, so it coexists with the app's own; each listener runs `setToken` before its callback, so the token is present when the sync fires). Purely client-side — nothing stored server-side; the token stays a browser-held, scoped credential. Added `socialTokenHandoff.test.ts`, which reproduces the two-instance split and asserts propagation on login (fails without the fix). 223 tests green; tsc + vite build clean.
1.0.118 || 23.07.2026
Removed the changelog-check CI workflow (`.github/workflows/changelog.yml`). Even after fixing its runner (1.0.117) and partial-cloning the checkout, a dedicated GitHub Actions VM spun up per PR just to run a `git diff --name-only` + grep wasn't worth the wall-clock, and the check was advisory anyway (visibility-first — no branch protection gated on it). The CHANGELOG-is-the-board convention and version monotonicity remain a human/agent discipline, not CI-enforced. Supersedes the 1.0.117 tuning. `cd.yml` still reads CHANGELOG.md for the release version + notes — unaffected.
1.0.117 || 23.07.2026
Fix the perpetually-pending "changelog check": it ran on `ubuntu-latest-small`, a runner label this org doesn't provide, so the job never got assigned a runner (verified: empty `runner_name`, cancelled after ~20 min in queue) and showed "pending" forever on every PR. Switched to `ubuntu-latest` — the label every other workflow uses — since the check is trivial and runs in seconds. Regression from the 1.0.99 CI-small-runners change (which assumed a smaller-runner label that isn't configured here). Also made the checkout a partial clone (`filter: blob:none`, keeping `fetch-depth: 0` so the diff base is reachable) so the job pulls commit/tree history but not the repo's file blobs — the check is a `git diff --name-only` + grep, which needs trees, not blobs (only CHANGELOG.md's blob is read, on demand). Cuts the wasted full-content clone; the residual runtime is just the unavoidable GitHub Actions VM spin-up.
1.0.116 || 23.07.2026
Modernized `persona-orchestration/seed_personas.py` for the D5.5 discovery split so seeded content actually reaches the feed: posts now write to `public_posts` (was `posts`) with an anon-whitelisted term record written first (signup ships an empty whitelist, so without it posts never index into discovery); reactions/comments write to the public ledger via `POST /public/entries` against registered `Reaction`/`Comment` schemas with `target = "{author}/public_posts/{post_id}"`; `provider`/`site` are derived from `--api` (with `--provider`/`--site` overrides) instead of hardcoded `api.localhost`/`social.web10.app`; DMs use the single `dms` service; and signup/terms are idempotent. `seed_personas.sh` marked superseded; README documents the corrected flow + the dev(FerretDB)-vs-prod(mongo) caveat. Verified against live dev: accounts/login/terms/profiles/follows/posts(25→public_posts)/DMs(12) all 200; ledger writes now succeed once the 1.0.115 discovery/ledger fix is deployed.
1.0.115 || 23.07.2026
Fix the discovery/ledger/schema layer (the social For-You/trending feed was permanently empty; likes/comments and schema registration 500'd). Powers gauntlet steps 2/3/4/7. Verified end-to-end against a real FerretDB (`ferretdb:2`), not just the mocked unit suite. (1) Root cause of the 500s — a DB-handle bug, backend-agnostic: system collections are addressed as `db["web10"][name]`, but `db` is `client[settings.DB]` (a Database), so `db["web10"]` is a *Collection*; the `_ensure_*` helpers called Database-only methods (`list_collection_names`/`create_collection`) on it, which raise `TypeError`, 500ing every `/discover/*`, `/public/entries`, and `/schemas/*` request on any real node. New `_ensure_system_collection()` runs existence/creation through the Database handle and returns the `web10.<name>` collection; the CRUD ops (which already worked) are unchanged. The fully-mocked pymongo test suite hid this (a MagicMock accepts any call) — documented as a testing-gap lesson in discovery.md §9. (2) Contract mismatch: `web10-social`'s `feed.ts` calls `/discover/*` as a bodyless `PATCH` with params in the URL query string, but the endpoints made the JSON body REQUIRED (`token: Token`) and read sort/limit from the body only — so the real call returned `422 body required`, swallowed into an empty feed. The endpoints now take params as function args (URL query) with an optional `token: Token | None = None` body override; discovery is a public read, no body required. (3) FerretDB `$meta` quirk: `/discover/search` used a `{"$meta": "textScore"}` projection/sort, which on FerretDB returns only `_id`+score (dropping doc fields) and KeyError'd downstream; it now returns full docs ordered by `created_at` (works on both backends). NB: FerretDB *does* support `$text` indexes/search — an earlier assumption it didn't was wrong and has been corrected. (4) `background_index_post`'s exception swallow now logs (`discovery index upsert failed`) so a broken index path is never fully silent. Added regression tests replicating the real client (bodyless PATCH must not 422) — prior tests all sent a body, which is why the 422 slipped through. 363 API tests green (was 358). Docs: discovery.md §3/§1 document the bodyless public-read contract and the silent-swallow caveat; new §9 (Operational notes) covers the dev-FerretDB-vs-prod-mongo split, the DB-handle bug + mocked-test blind spot, why a fresh dev feed is empty, how to seed it, and an empty-feed debugging checklist.
1.0.114 || 23.07.2026
Regression test for the #191 CORS trust boundary (1.0.107 shipped a security-boundary change with no test). New `api/tests/test_cors_trust_boundary.py` pins the intended post-#191 behavior on both halves: (a) browser CORS is wide open — a preflight from an arbitrary app origin gets `access-control-allow-origin: *` and credentialed CORS stays off (no `access-control-allow-credentials`), so any web10 frontend can call the node; (b) `CORS_SERVICE_MANAGERS` still gates the `is_permitted` cross-origin bypass to authenticator hosts only — a service-manager site skips the per-service ACL, a non-service-manager origin does NOT (denied even with a `.*` whitelist), and the per-service `cross_origins` ACL path stays intact for a listed non-SM origin. 358 API tests green (was 353). Audit of untested behavioral/security fixes in the top ~40 changelog entries written to `.context/regression-gaps.md`.
1.0.113 || 23.07.2026
Fix marketing-ui build (for real this time): `lucide-react` (v1.x) exports NO GitHub brand icon at all — neither `Github` nor `GitHub` — since lucide removed brand icons. #206's `Github`→`GitHub` rename didn't fix it (`error TS2305: Module 'lucide-react' has no exported member 'GitHub'`), so `tsc -b`/`vite build`/e2e stayed red on dev. `GitHubStarButton` now inlines the GitHub mark as a small filled brand SVG (`fill="currentColor"`, so it still inherits the button's text color) instead of importing a nonexistent icon. tsc --noEmit clean.
1.0.112 || 23.07.2026
Fix marketing-ui build: `lucide-react` exports `GitHub` (capital H), not `Github`. The GitHubStarButton component used the wrong case, causing the TypeScript build to fail in CI/CD.

1.0.111 || 23.07.2026
Decision D30: content lifecycle is a COLLECTION, not a status field. Three tiers — staging_posts (owner-only, imported/drafted awaiting triage), private_posts, public_posts — visibility = which collection a record lives in. Publishing = move between collections. Extends existing public/private split by one tier. Rejects needs_review/imported/draft boolean fields (can't gate access, pollute queries, mix triage with real private content). Registers D19 lane item (phased: A foundation repair, B composer visibility, C staging UI) and plan tasks.
Marketing navbar: added GitHub icon to the star button so it's visually clear it links to the GitHub repo.
Fix deploy health check: `docker ps --filter status=unhealthy` is an invalid filter (Docker states are created/running/paused/restarting/removing/exited/dead — health is a separate field). This caused the stability loop to always exit on the first iteration with "All containers stable" regardless of actual container health. Both deploy jobs now use `docker inspect` to read `State.Health.Status` per container, then grep for unhealthy. Containers without a healthcheck return "none".

1.0.110 || 23.07.2026
Changes tab in Settings: the Settings page now has an Account + Changes tab bar. The Changes tab fetches `CHANGELOG.md` (served from the UI's public directory via a symlink in `ui/public/` that Docker `COPY` follows at build time) and renders the last 50 entries as versioned cards with version badges, dates, and descriptions. Parser handles the `version || DD.MM.YYYY` header format, skipping blank lines and deduplicating body text.
Social app empty states: feed, DMs, and profile screens no longer replace the entire view with a prominent "Import Your Instagram" CTA when empty. Feed keeps its header, sort dropdown, and composer visible with a muted text note and small inline import link. DMs keeps the "Messages" header. Profile shows the full UI (banner, edit, stats, tabs) so users can set up immediately. Import is now a secondary option, not the only path. 222 tests green.
Marketing navbar: replaced plain "GitHub" text link with a star button showing the live GitHub star count (fetches from GitHub API). Loading skeleton while fetching, 'k' suffix for 1000+ stars, fallback to "Star" on error. Uses a shared React context so desktop and mobile instances share one API call.
1.0.109 || 23.07.2026
Fix prod deploy: `deploy-prod` failed with `pathspec 'main' did not match any file(s) known to git`. The server repo at `/opt/web10` is a single-branch clone (tracks only `dev`), so `git fetch origin` never brought down `origin/main` and `git checkout main` had nothing to match — prod could never deploy. Both deploy jobs now fetch the target branch explicitly (`git fetch origin <branch>`, which populates FETCH_HEAD regardless of the clone's refspec) and force the local branch to it (`git checkout -B <branch> FETCH_HEAD`), replacing the `checkout`+`reset --hard origin/<branch>` that assumed a remote-tracking ref existed.
1.0.107 || 23.07.2026
SDK security + correctness fixes (web10-npm). (1) Cross-window auth messaging is now origin-scoped: `login()`/`authListen()`/`smrResponseListen()`/`smrOnReady()` ignore any postMessage whose origin isn't the configured `authUrl` (closes token injection/fixation from a malicious opener or embedder), and the authenticator side (`sendToken`, `smrListen`, legacy `SMROnReady`) posts to the opener's exact origin — derived from the referrer — instead of `'*'`, refusing to post when that origin is unknown (closes a bearer-token leak). (2) `isTokenExpired()` now reads the ISO `expires` claim the server actually sets, not the nonexistent numeric `exp` — the check was previously always false; `TokenPayload` type corrected to match. (3) CRUD routes to the addressed user's node: a `provider` argument now sets the request origin (`provider` == the node's api host), so cross-node addressing works instead of silently hitting the caller's own `apiOrigin`; no-provider calls are byte-identical to before. (4) token cookie gains `SameSite=Lax`. 64 SDK tests green (was 55), tsc strict clean, bundle rebuilt.
1.0.108 || 23.07.2026
Copy: "Own your audience" → "Your audience, actually" in all user-facing surfaces (marketing-ui hero + meta, web10-social login + meta, design.md voice example). "Own your audience" implied ownership of people; the new copy keeps "audience" but frames the claim as about the real relationship — no algorithm in the middle deciding who sees your stuff.
1.0.107 || 23.07.2026
CORS: API now allows all browser origins (`allow_origins=["*"]`, credentials off). The security boundary is the scoped token in each request body (certify + is_permitted + per-service ACL), not the browser origin — web10 apps are stateless frontends anyone can build and host anywhere, so an origin allow-list only broke legitimate apps (social, marketing) without adding security. Removed the short-lived `CORS_ALLOW_ORIGINS` setting/env wiring. `CORS_SERVICE_MANAGERS` stays as the real trust list: authenticator hosts (auth.*) that may handle consent and mint tokens for other apps — narrowed to auth-only, which also closes a latent privilege path (a service-manager site bypasses the cross-origin ACL in is_permitted). 353 API tests green.
1.0.106 || 22.07.2026
CD: split npm publish into separate web10-npm (sdk/) and web10-cli (marketing/web10-cli/) jobs. Switched to OIDC provenance (id-token: write), removing NODE_AUTH_TOKEN and packages: write. Release job now depends on both publish jobs.
1.0.105 || 22.07.2026
SDK compat shim: re-exports `wapiInit` and `wapiAuthInit` from the new typed SDK so legacy consumers (ui/, web10-social/) don't break. Both apps now resolve `web10-npm` from the local SDK and build clean. 55 SDK tests green.
1.0.104 || 22.07.2026
Fix marketing-ui build: SVG `className` assignment on createElementNS'd SVG element changed to `setAttribute('class', ...)` to avoid TS2540 read-only error (1.0.88 fix that never merged to dev). Fix analytics tests: jsdom environment now active via vite.config.js (was missing), unhandled rejection test no longer leaks into vitest's error collector.
1.0.103 || 22.07.2026
CI: removed `continue-on-error: true` from the shared js workflow's typecheck and build steps. A UI that doesn't compile or build now reports red instead of silently passing. Merging remains a human call — the referee just needs to show red.
1.100 || 22.07.2026
C2: SDK rewrite — full TypeScript, zero required deps. Replaced legacy untyped ES wapi.js with typed `createClient()` (ESM). Full protocol types: records, queries ($sort/$skip/$limit), updates ($set/$unset/$inc/$push/$addToSet/$pull/$mul), terms/contracts (SIR/SCR), tokens (TokenPayload), aggregate pipelines (PipelineStage). Typed CRUD: `read<T>(service, query)`, `create<T>(service, body)`, `update(service, query, updateSpec)`, `deleteRecord(service, query)`, `aggregate<T>(service, pipeline)`. Dropped axios → native fetch. PeerJS/RTC moved to optional subpath export (`web10-npm/rtc`) with `setPeer()` — core is tree-shakeable. Auth flow: promise-based `login()` wraps the popup/OAuth dance. Auth connector (`createAuthConnector`) with tiered token minting, SMR, login/signup, password/phone change, verification codes, Stripe management. Dev pay: `checkout()`, `verifySubscription()`, `cancelSubscription()`. Modern packaging: bun build, ESM + declaration maps, typedoc config. 55 tests green (41 client, 14 auth), tsc strict clean.
1.0.102 || 22.07.2026
Reprioritization (D29): the killer app, proud and working, before anything
else. plan.txt PRIORITY ZERO (baseline chain, merged) superseded by PRIORITY
ONE: every task judged by "does this make web10-social something the operator
demos from his phone with pride?" — with THE GAUNTLET (8 phone-run end-to-end
steps, each encoded in e2e/ as it passes) as the bar. Conductor board rewritten
around it; C2 SDK rewrite, C3 MCP, C3.5 create-web10, D11 ux telemetry, E4
provisioning, E8 store submission explicitly PARKED until the gauntlet passes.

1.0.101 || 22.07.2026
Fix CORS_SERVICE_MANAGERS dev default: auth.web10.dev -> auth.dev.web10.app (stale hostname from pre-1.0.73). The env files were already correct; only the settings.py fallback was wrong.
1.0.100 || 22.07.2026
Fix api CI: uv sync now uses --extra test so pytest and ruff are available
in the CI environment. The ruff/format debt was already paid in 1.0.73
(ruff check and ruff format pass clean across api/). 353 tests green.
E7: SDK npm publish flow verified end to end. cd.yml confirmed: fires on v* tags, npm job gated on tag prefix, publishes sdk/ with --provenance --access public. web10-npm verified public on npmjs.com (versions 1.0.0–1.0.8, latest 1.0.8). Decision D26 reaffirmed: publish stays tag-gated, no auto-publish on merge to dev/main — legacy wapi.js SDK must not flood npm while C2 typed rewrite is in flight.

1.0.99 || 22.07.2026
CI optimization: removed push triggers from all check workflows (js-ci, api,
docker, e2e, marketing-api) — code already passes PR checks before merging, so
re-running after merge wastes ~60+ minutes per merge. deploy.yml keeps its
push trigger (it actually deploys). Added bun install caching to js.yml
(actions/cache on node_modules + bun cache dir keyed on bun.lock). Per-package
path filtering in js-ci.yml (dorny/paths-filter) so touching ui/** only runs
the ui job, not all 6 packages. Dropped linux/arm64 from cd.yml (saves ~50%
on CD minutes). Switched changelog check to ubuntu-latest-small runner.
Expected savings: ~90% reduction in total CI minutes.

Marketing-ui: removed redundant trending feed from home page (already has /trending tab). Rewrote /trending page: full-page trending feed, no "For You" / "Following" subtabs. DeployStatus widget now hides when status.json has all "unknown" fields instead of showing an empty panel. Root cause fix: deploy.yml now computes GIT_COMMIT and STATUS_VERSION before docker compose, so status.json gets real values on every deploy.
1.0.98 || 22.07.2026
Knowledge folder complete overhaul: replaced AI-generated content with a working system. Knowledge theories: the-why-layer (connects tech to business), the-how-layer (comprehensive technical explanation), the-what-layer (code/deploy/ownership map). Writing styles: use-case-driven (abstract → specific → technical → logistics). Editing styles: the-touch-up (surgical fixes), the-rewrite (diagnose, pick theory/style/voice, write fresh). Voices: clive-tobacco-smoker (anti-AI voice reference). Visual-styles folder added for Mermaid chart styles. AGENTS.md added with the workflow for AI agents (pick theory → pick style → pick voice → write). Deleted old knowledge-base/ (architecture, protocol, security, 8 Mermaid scenarios) — all replaced.
1.0.89 || 21.07.2026
1.0.97 || 22.07.2026
E6: SSH-deploy CI/CD framework (replaces Portainer GitOps as deploy trigger).
New `.github/workflows/deploy.yml`: GitHub Actions SSHes into the box, runs
`docker compose up --build`, waits for container stability, runs smoke test.
Push to `dev` → web10-dev; push to `main` → web10-prod. No self-hosted runner
(ephemeral ubuntu-latest runner, deploy key for SSH). `deploy-stacks.py` now
supports file-backed stacks (`register` mode — no GitOps polling) and a
`disable-gitops` command to kill the auto-update loop on existing stacks.
Portainer remains the management UI (registered post-deploy via API) but no
longer triggers deploys. Requires GitHub secrets: `DEPLOY_SSH_KEY`, `VM_IP`,
`SSH_USER`.

1.0.96 || 22.07.2026
Marketing-ui: fixed corner deployment-status widget. A small pill in the
bottom-right (green dot + live version, mono) reads the baked /status.json
(E9) and expands to version / commit / deployed-at with a link to the full
/status/ page. Renders nothing when the status feed is absent (local dev,
tests) — no dead control. Token-only styling, keyboard operable (Esc,
focus-visible ring), covered by 4 vitest cases.

1.0.95 || 22.07.2026
Ops: Portainer admin password reset after the GitOps re-clone of /opt/web10
wiped the gitignored .env (creds existed nowhere else). Box secrets moved to
a canonical /home/jacob/web10-ops/.env outside the repo checkout, with
/opt/web10/ubuntu-deployment/.env now a symlink to it. Documented in
ubuntu-deployment README §Secrets, AGENT-OPS §1, .env.example, OPS-LOG.
Known follow-ups logged: NPM admin password still lost (needs its own
reset); web10-prod stack still tracks dev, not main.

1.0.94 || 22.07.2026
Fix: resolved merge conflict in marketing-ui AppStore.tsx (SVG className
assignment on createElementNS'd SVG element).

1.0.93 || 22.07.2026
Discovery API: cross-user discovery layer. Discovery index (`web10.discovery_posts`)
populated from CRUD on anon-whitelisted services. Public ledger (`web10.public`)
for schema-validated structured interactions (reactions, comments). Schema registry
(`web10.schemas`) with CRUD + author enforcement. Engagement counts derived live
from the ledger at read time (no cached deltas). Discovery endpoints: `/discover/posts`
(recent/trending), `/discover/users`, `/discover/search`, `/discover/topics`,
`/discover/post/{user}/{service}/{id}`. All anon-readable. +44 tests (335 total green).

1.0.92 || 22.07.2026
D5.5: Social app public layer. Split posts into `public_posts` / `private_posts`
services routed by visibility. Default terms for both on adapter init (anon
whitelisted on public, blocked on private). Register default Reaction/Comment
schemas on first boot with local cache. Reactions write to both legacy service
and `/public/entries` public ledger. New `readDiscoverFeed` calls
`PATCH /discover/posts` (recent/trending sort). Marketing-ui FeedPreview
replaced placeholder data with live discovery API feed, skeleton loading on
API unreachable, tab switching wired to sort params, reaction buttons call
`POST /public/entries` with optimistic count updates, schema definitions
fetched on mount. 222 social tests green, 19 marketing-ui tests green.

Trending added to marketing-ui navbar between Home and Docs. Dedicated /trending page created. FeedPreview simplified: removed For You/Following/Trending tabs, merged all posts into a single trending feed with Zap icon header. Fixed broken PostCard type reference.

I6 complete: `_author`, `_source_node`, `_created_at` immutable on update,
exposed on read, forged values rejected. `to_db()` strips client-supplied
metadata and injects server values from token + clock. `u_t()` silently drops
any `$set`/`$unset`/`$inc` targeting immutable fields. `to_gui()` ensures
metadata fields present on every returned record. `create()` endpoint passes
token's username/provider to `to_db()`. Cross-node: remote token's provider
becomes `_source_node`, remote username becomes `_author`. +14 I6 tests
(309 total green).
1.0.91 || 22.07.2026
Fix DMs: single `dms` service with sender/recipient fields (no per-conversation
service). legacy adapter auto-migrates message-inbox/outbox on first read.
Fix posts: legacy adapter migrates html/media/time → text/media_refs/created_at
in-place so text-only posts render in the profile grid.
Added security invariant I6: server-side record metadata (_author, _source_node,
_created_at) injected by API on create, immutable on update. audited cross-node
federation flow: no cross-node token delegation, no data sync, no provenance
metadata today. 220 tests green, tsc clean.
1.0.90 || 21.07.2026
Homepage: moved the social feed preview section above the hero so the feed is front and center — first thing you see after the navbar. The pitch headline follows immediately after.

1.0.89 || 21.07.2026
Persona orchestration: 5 live-testing personas (solar-flare-69, noodle-empress,
void-walker, butterfly-mechanic, disco-donkey) with seed scripts (bash + python),
first-week action plans, cross-follows, posts, comments, DMs, reactions, and
inbox fan-out. Makes the social platform look alive for dev testing and demos.

1.0.88 || 21.07.2026
Fix marketing-ui build: SVG `className` assignment changed to `setAttribute('class', ...)` to avoid TS2540 read-only error on dynamically created SVG elements.
1.0.86 || 20.07.2026
Marketing-ui homepage: added a social-media-style tabbed feed preview section
with placeholder content (For You / Following / Trending tabs, post cards with
avatars, media placeholders, engagement counts). The section sits between the
hero and the reach-gap proof, giving the landing page a sense of life and
activity. Avatar UI primitive added to marketing-ui. Placeholder data wired to
tabs; ready to be replaced with live backend content.
1.0.87 || 21.07.2026
D12 follow-up: web10-social vibrancy overhaul. The social flagship was
muted — flat surfaces, no ambient light, zero interaction energy —
compared to Kick's vibrant, alive feel. design.md §4 relaxed: glow
tokens (`--color-glow`, `--color-glow-intense`, `--color-glow-danger`)
added for the social app (console stays restrained). New animations
in index.css: shimmer skeleton sweep, heart-burst on like, glow-pulse
for presence indicators, brand-glow-pulse for ambient energy, float
for login particles. Custom dark scrollbar. Button gradient brand
variant with glow-on-hover, `brand_subtle` variant. Badge `brand_glow`
and `live` (pulsing) variants. Skeleton gradient shimmer replaces
solid pulse. Layout: sidebar gradient, ambient glow orb, active nav
glow pill with pulse dot, mobile nav gradient indicator. Feed: card
hover glow, heart-burst animation on like with danger drop-shadow,
vibrant brand-tinted tags, origin badges with glow, gradient empty
state icon, media hover zoom + overlay. Composer: focus glow bar,
media preview hover scale + ring. Profile: vibrant banner gradient,
avatar glow ring, gradient avatar fallback, gradient tab indicators,
media grid hover zoom + overlay. DMs: gradient sent bubbles with
shadow, presence dots with pulse, conversation list presence indicators.
Login: animated gradient background, floating ambient orbs. 195 tests
green, tsc clean, build clean.
1.0.86 || 20.07.2026
Add branch naming conventions to AGENTS.md: all new branches must use a
type prefix (feature/, fix/, refactor/, chore/, test/, docs/) followed by
a short imperative description, e.g. fix/auth-token-expiry. Existing
lane-x/ and username/ branches grandfathered.
1.0.87 || 21.07.2026
Fix profile name save, photo upload, and restore old contacts/friends.
Backend: update_records now returns the updated document (find_one_and_update)
instead of {matchedCount, modifiedCount}, so saveProfile actually persists
the profile in React state. Media upload: fixed URL path from /media/upload/{user}
to /{user}/upload, added required filename field, switched to presigned POST
with confirm step so the media record is created with an _id. Frontend:
wapi.update now receives the real document back. Profile adapter: readProfile
falls back to the legacy identity service, maps name→display_name and
pic→avatar_ref, and writes the adapted record to the new profile service.
Contacts adapter: readContacts falls back to legacy contact-addresses, maps
web10→username/provider and date_added→added_at, migrates all records to the
new contacts service on first read. Follows: added complete data layer
(readFollows, followUser, unfollowUser, blockUser, deleteFollow, etc.) and
registered the follows SRO in the adapter. +19 tests (74 data layer tests).

1.0.85 || 20.07.2026
Remove Netlify integration. Deleted ui/netlify.toml so GitHub pushes no
longer trigger Netlify builds. Removed web10social.netlify.app from the
CORS allowlist in web10-social's adapter. All deploys now go through the
ubuntu box only.
1.0.84 || 20.07.2026
D16 (frontend): revive the App Store as a real, live catalog. The
marketing-ui AppStore page now POSTs the node's /stats and renders real
data instead of hardcoded proof cards: live member + registered-app counts
plus total data owned ("N members · M apps · X MB of data owned on web10" —
the storage stat the old store used to show), web10 social promoted as the
flagship hero (not buried), and the registered third-party apps below as the catalog (name =
host, with visit counts, linking out). Robust: falls back to the hero +
first-party seed if /stats is unreachable, and skips *.localhost/known
first-party hosts. Node API resolved via ?api= / VITE_API_URL, defaulting
to the local node on *.localhost and api.web10.app otherwise. Curation /
node-owner takedown (an admin `removed` flag + admin screen) is deferred to
next per the operator — see the D16 status note in parallel execution.txt.
1.0.83 || 20.07.2026
Align the auth console sidebar header with the top bar. The brand header was
py-5 (taller) while the top bar is h-14, so their bottom borders didn't line
up at the seam. Made the sidebar header h-14 too — dividers now match.
1.0.82 || 20.07.2026
API defends against duplicate service terms. documentdb.create now rejects a
second terms record for a service that already has one (service=="services"
with a body.service already present) → 409 DUPLICATE_SERVICE. This is the
server-side guardrail behind the duplicate-contracts bug (the UI guards it
too); a service's terms should be updated, not re-created. +2 tests.
1.0.81 || 20.07.2026
Consent flow overhaul + crash fixes. A dedicated full-screen ConsentView
replaces the floating banner that overlapped the console: one focused,
polished screen (its own space) when the auth app is opened by another app.
It is concise by default — one line per requested service with plain-English
summary — and each row expands (progressive disclosure) to the full detail:
sites with access, allowed/blocked users with exact permissions, and for
changes the delta (added/removed highlighted). It shows what's already
shared vs new, and no longer re-asks for services already granted.
Approve all / Continue without sharing are sticky (no scrolling). The
token/login handoff is fixed: goToApp mints a fresh scoped token for the
referrer and posts it to the opener (approving one request no longer ships
the token early and strands the rest — the token goes only when you choose
to continue). submitSIR refuses to create a duplicate terms record for an
already-granted service (root of the duplicate-contracts bug). Also:
RequestPage rendered whitelist entries as {anchor, allowed[]} but the real
shape is {username, provider, <action>}, so `.join` on undefined blanked
the whole review screen (now defensive); the contract viewer crashed
expanding records without whitelist/blacklist/cross_origins (e.g. the
services record) — now guarded; a top-level ErrorBoundary turns any future
render throw into a designed error state instead of a blank page; the app
shell is now fixed-height so the sidebar/top bar stay put and only content
scrolls; social.localhost now targets auth.localhost automatically (any
*.localhost host is local) so social -> auth -> social works without
?local=true. 74 ui tests green.
1.0.80 || 19.07.2026
Prod cutover to the real mongo. deploy-stacks.py now sets the web10-prod
env DB=deploy + DB_URL=mongodb://host.docker.internal:27017/, so the prod
API serves the host-native mongo's "deploy" database (208 real accounts)
instead of the empty containerized FerretDB. Applied on the box and
verified: POST /stats users 5 -> 208, real apps/usage show, and a real
account (jacoby149) is found again ("incorrect username or password" on a
wrong password, not "the user doesn't exist"). Completes the DB override
enabled by 1.0.79's compose fix. Ops details in ubuntu-deployment/OPS-LOG.md.
1.0.79 || 19.07.2026
Prod fixes: missing static assets, wrong readiness API, and the DB override.
(1) ui/Dockerfile never COPYed public/, so vite had nothing to fold into
dist — every static asset (logo /YourOrgsLogo/key_white.png, favicon.ico,
manifest.json, PWA icons) 404'd on the deployed auth app. Copy public/
before the build; verified the rebuilt image serves them. (2) App.tsx's
readiness probe fell back to a hardcoded "api.localhost" when logged out, so
/ready hit the wrong API on prod (and hung locally). Fall back to the
configured API host, with *.localhost detection mirroring authAdapter.
(3) The ecosystem compose hardcoded DB: web10, so the prod override was
ignored and the API served the empty FerretDB — real accounts (the "deploy"
DB) looked like "the user doesn't exist". DB is now ${DB:-web10}; prod sets
DB=deploy + DB_URL=host mongo (env.prod). (4) Repositioned the OAuth consent
banner from a stray in-flow card (it rendered "status: ready" in an odd spot
above the shell) to a fixed prompt below the top bar.
1.0.78 || 19.07.2026
Fix marketing-ui /docs 403. The docs .md files ship in a public/docs
directory, so nginx resolved the bare /docs and /docs/ routes to that
directory, found no index.html, and returned 403 (autoindex off) — /docs
even 301'd to /docs/ first. The `$uri/` in the /docs/ try_files was asking
nginx to index the directory. Map the bare routes straight to the SPA shell
via exact-match locations (which win over the prefix, so no directory
redirect) and drop `$uri/` so sub-routes fall back to index.html while real
files (.md, schemas/) still serve. Validated: /docs, /docs/, /docs/<slug>,
and /docs/<slug>.md all 200.
1.0.77 || 19.07.2026
Auth console: admin model, Node Config fix, Studio reorder, working search,
ecosystem links, balanced topbar. SECURITY: check_admin was passing for any
signed-in owner on their own node, so on a shared node every user could
read/edit the node-global config (Stripe keys, CORS, signing). It now
enforces an admin list — config.admins, or settings.DEFAULT_ADMINS
(jacoby149) until one is saved — and returns 403 otherwise. New POST
/am_admin lets the console show/hide Node Config; admins are returned in
/config and editable via the config PATCH (add/remove in a new Admins card).
Fixed the Node Config load: the endpoint was GET while the UI POSTed (always
405 → misleading "Are you an admin?"); it's POST now, matching /setup and
/stats, with regression tests. UI: Node Config is hidden for non-admins
(sidebar + mobile nav) and shows a calm "Admins only" gate (not a red error)
if reached. Studio now leads with Rung 0 (Available Now) and puts the
aspirational ladder below. The topbar search box actually filters contracts
(by name and site) — it was a no-op — and the topbar is rebalanced to three
columns (page title left, centered search, account menu right); the account
chip is now a real menu (Settings / Log out) instead of an inert hover
target. Added an Ecosystem group (What is web10 → web10.app, App Store →
/app-store, Docs → /docs) to the sidebar. Fixed the sidebar brand/nav
alignment (was 8px off). 289 api + 74 ui tests green.
1.0.76 || 19.07.2026
B7: auth UI (ui/) from-the-phone quality pass. Rebuilt the authenticated
console shell to design.md §9: extracted one shared AppShell (full-height
fixed sidebar on desktop, top bar over the content column only, bottom tab
bar on mobile) from the wrapper that was copy-pasted into all five pages.
SideBar is now real nav — brand at top, Contracts/Requests/Studio/Node
Config with icons + a brand-muted active pill, Settings + Log out anchored
at the bottom (was warning-coloured underline text). TopBar dropped the
cryptic bars/moon icons and the dead "Apps"/appstore button (a mode with
no case that fell through to Contracts) and the non-functional theme toggle
(nothing consumed I.theme; dark-first per design.md §2). MobileNav no
longer requires the ?auth query param, so the bottom nav actually appears
(mobile had zero navigation before). Branding gained an onError fallback so
a missing logo asset degrades to the wordmark instead of a broken <img>
(the prod broken-logo report). Routing: a signed-out visitor — including an
expired/scrubbed token — now lands on the login page, never an empty "Your
contracts"; the restore path checks the token's embedded expiry and scrubs
a dead token. Contract cards enriched: a granted-on date derived from the
record's ObjectId, a globe + truncated cross_origins preview
("localhost, crm.web10.app +4 more"), a grant badge, and a site count;
the whole header is one click-to-expand target. Added a designed empty
state for a fresh account (no contracts yet) instead of a gray void.
Signup/login robustness: (a) the adapter now treats any *.localhost host
as local (auth.localhost was falling through to the prod origins) and sets
wapi.defaultAPIProtocol itself, so the published SDK's signup/login URLs
stop coming out "undefined://…" ("Unsupported protocol undefined:"); (b)
auth state is seeded from the token cookie via a lazy useState initializer
instead of a render-phase setAuth, fixing a "too many re-renders" crash
(blank page) once a valid token existed; (c) I.login completes when the
token cookie is set even though the published SDK's logIn throws minting a
referrer token with no parent app, so signup → auto-login lands on the
console instead of a false error. Verified the full fresh-account journey
(signup → auto-login → console) plus 375px/1280px against the local stack
(screenshots in the PR). 73 ui tests green.
1.0.75 || 19.07.2026
Auth hotfix — unbreak the social login handoff. API: tiered token
minting always raised MINT because the minted TokenData never had its
provider set before can_mint compared providers (Lane A bug 1 from the
C6 sweep); set it at mint time. Verified end-to-end in the docker image:
signup -> login -> consent term record -> tiered mint -> CRUD with the
minted social-site token. SDK (web10-npm source, ships with next
publish): mintOAuthToken no longer throws an unhandled axios error on
mint failure (the raw "axios error" operators saw on every social
login); authListen no longer stores an empty-string token when the
authenticator sends null (apps believed they were signed in with a
garbage token); readToken survives a malformed token cookie instead of
white-screening at load; register_app ping is best-effort. Un-fixme'd
the consent-grant tiered-token e2e test and rewrote it to drive the
real consent -> mint -> CRUD chain. +2 API mint tests (281 green),
SDK suite 52 green.
1.0.74 || 19.07.2026
C6: e2e deep sweep — expanded harness to 40 tests across money paths.
Added marketing-api to e2e compose. New suites: consent-grant (4),
social-full (9: post, comment, reaction, DM, media upload/list),
terms-revoke (3: whitelist, blacklist, cross_origins), exporter (6:
import job, analytics, feedback), app-store (4: store render, token
handoff, system endpoints), studio-metering (5: credits, out-of-credits,
events, aggregate, studio UI). Persona seed fixture factory (seed.ts).
34/40 pass. 6 failures triaged as API bugs (Lane A): tiered token mint
(can_mint requires provider on mint_token, never set), media upload
(is_permitted needs target=PROVIDER for media service), terms cross-user
(reader token needs target=PROVIDER for whitelist check). Bug notes in
.context/ for Lane A.
1.0.73 || 19.07.2026
Dev URL scheme made consistent with prod: the dev API moves from
dev.web10.app to api.dev.web10.app, and dev.web10.app (the dev apex)
now serves marketing-ui — mirroring prod's web10.app apex. Rule:
dev host = prod host with ".dev" inserted. Changed across
ubuntu-deployment/: sync-dns.py (api.dev A record), sync-npm.py
(api.dev vhost; env apex → marketing-ui for both envs), deploy-stacks.py
+ env.dev.example (PROVIDER/API_ORIGIN/API_HOST → api.dev.web10.app —
NOTE: invalidates existing dev accounts, they were throwaway),
smoke.sh (new host map + apex checks, curl -L), README.md/AGENT-OPS.md
URL maps. Plus api: GET / now redirects to /docs so a bare API host
(api.web10.app, api.dev.web10.app) looks intentional instead of
returning {"detail":"Not Found"}.
Also: the api CI check worked for the first time ever this branch —
"api (lint + test)" had failed on EVERY run since it landed (#88)
because `uv sync --frozen` installs neither ruff nor pytest (both
were optional extras). Fixed by adding a [dependency-groups] dev
group (uv installs it by default). Then actually ran the linter the
repo always claimed to run: ruff check --fix + ruff format across
api/ (import sorting, 26 files reformatted, 2 dead variables,
per-file F401 ignore for __init__.py re-exports); 279 tests green.
Plan additions from operator reports: frontend cache-headers item
(index.html max-age=86400 leaves browsers on dead bundles for a day
after each deploy), web10-npm republish item (kills the ui/Dockerfile
sed patch), lane-B B7 auth-UI quality pass (dead restored token
strands users on an empty contracts page with no login button;
broken logo; unusable on mobile), and a concrete production-mongo
nightly-dump + restore-drill item under ops backup.

1.0.72 || 19.07.2026
A7: real MongoDB connection wired (compose + env + audit tool).
docker-compose.ecosystem.yml: api service gains extra_hosts
(host.docker.internal:host-gateway) so containers can reach the
host-native MongoDB. DB_URL is now optional with a FerretDB fallback
(${DB_URL:-mongodb://...}), so dev stays self-contained out of the
box and prod overrides via env. env.prod.example documents the
host-mongo override; env.dev.example documents the copy-for-testing
path (A7 gate). NEW api/tools/audit_mongo.py: read-only script to
inspect the real data — reports user count, app count, star-record
field inventory, {service, body} shape drift detection, service
distribution. Run on the box: `python api/tools/audit_mongo.py`.
Code review: star protection (star_found/star_selected), scoped
queries (q_t body. prefix), and aggregate sandboxing ($match
exclusion of star) are all correct against real data — no code
changes needed. Gate: prod must NOT switch DB_URL until a dev
login works against a COPY (mongodump→mongorestore into dev's
FerretDB, or a read-only host connection).
B6: authenticator revamp — the ui/ auth flow is now functional. The
critical bug: wapiAuth.js referenced wapi.defaultAPIProtocol (undefined)
instead of wapi.APIProtocol, so login/signup POSTed to
"undefined://provider/web10token" — every auth call failed. Fixed in
sdk/src/wapiAuth.js + test mock, dist bundles rebuilt. Token restoration
on page load added to Interface.tsx (refresh no longer logs out).
SignupForm no longer flashes to contracts before signup completes.
ForgotForm cancel button now uses isAuthenticated() instead of the
?auth query param string. authAdapter.ts local-detection switched from
protocol check (broken on https://localhost) to hostname check.
Branding component restyled for auth screens: keys-mark logo at 48px,
"web10" headline, tagline per design.md narrative direction. Orphaned
React atom logo.svg deleted. Phone value now passed to I.signup()
(missing 6th arg). SDK linked locally (file:../sdk) so the fix is
consumed. 73/73 ui tests green, 52/52 sdk tests green.
D18: SDK visibility + publish flow. New sdk.md docs page in
marketing-ui/public/docs/ with install instructions, API overview,
and a note on the upcoming C2 typed rewrite. Wired into Docs.tsx
sidebar. SDK link added to Home.tsx footer. npm badge + SDK link
added to README.md. npm publish verified: web10-npm@1.0.8 public on
npmjs.com, cd.yml `npm` job fires on v* tags with provenance +
`--access public`. Publish flow decision: stays tag-gated
(decisions.md D26) — auto-publish on merge rejected while C2's typed
rewrite is in flight; a v* tag forces a deliberate release decision,
preventing legacy wapi.js from drowning npm with versions nobody
should install.
D17: restore the dev docs. Recovered from `82667060^:auth/public/docs/`:
the two live demo apps (hello/ and notes/) rebuilt on the design.md
standard — dark-first zinc/violet, self-hosted fonts, token-styled
buttons, skeleton loading — served from marketing-ui's public/docs/.
New sdk.md doc page: covers the current wapi.js SDK (with runnable
examples linking to the demos) and the upcoming C2 typed SDK (no
legacy-wapi-as-the-future voice). New cli-quickstart.md: documents
the web10-cli scaffolder (`npx web10-cli create`), available templates,
and the path to `create-web10`. Docs.tsx sidebar expanded: a "Demo
Apps" section (Hello, Notes — open in new tab) alongside the updated
Documentation nav (Protocol Spec, Conventions, SDK Guide, CLI
Quickstart). AppStore.tsx "Build on web10" card now has two CTAs:
SDK Guide + CLI Quickstart (with Terminal icon). 19 tests green,
production build clean.

1.0.71 || 19.07.2026
E9 executed: deployment status page baked at build time. One URL per
env (`/status/`) served from the marketing-ui container showing
version, commit sha + squash title, deploy date, and per-service
health dots. Zero new machinery — a build script generates
`status.json` + `status.html` from git info + CHANGELOG top at Docker
build time; every auto-redeploy refreshes it. No new NPM vhost or DNS
needed; the path is served from the existing marketing-ui nginx.

1.0.70 || 19.07.2026
PRIORITY ZERO declared at the top of plan.txt (operator): the
deployed product must WORK AT A BASELINE — baseline fixes outrank
polish; the chain is A7 (real data) → B6 (auth works) → docs
reachable → D16 (real store). Conductor board reordered around it.
Live-prod fix: /docs/* 404'd (e.g. /docs/protocol-spec) — marketing-
ui's nginx /docs/ alias block shadowed the SPA fallback; now
try_files → index.html (D16.1). Recovered-work capture: the old
sharp dev docs are NOT lost — two runnable demo apps (hello/,
notes/) + sdk.md/sdk.pdf live at git `82667060^:auth/public/docs/`;
queued D17 to restore them into marketing-ui docs + revive the "make
your own web10 app with the web10 CLI" store CTA (the CLI exists at
marketing/web10-cli/ but is invisible). Queued D18+E7: document/link
the web10 sdk (github packages shows 4, none the sdk) and confirm/
extend the npm publish flow. Queued E8 (parked): mobile encryptor →
Apple/Google app stores via expo eas, post-M0.

1.0.69 || 19.07.2026
Plan refinement (A7): the legacy production MongoDB (~208 real users)
runs NATIVELY on the ubuntu host, not in Docker — captured in
plan.txt + the lane file so whoever wires it reaches it via the host
gateway / box LAN ip (not a compose service name) and keeps it
as-is. Added the explicit deliverable of surfacing total-users +
total-apps counts from the real data, like the original web10 (feeds
the D16 app-store stats). Recorded decisions.md D25 — DB backend is per-env config, not baked: dev = all-in-one containerized FerretDB (docker compose up works out of the box), prod = bootstrap on the host mongo via the db_url config item (real 208-user data, zero migration risk), with an eventual mongodump->container migration so prod is also self-contained + SSPL-clean. Corollary: the WordPress-style first-run panel already largely exists (setup wizard + NodeConfig with nice defaults); noted the gap that ConfigUpdate doesn't expose db_url yet (kept a guarded action by design) — plan.txt setup section + a new panel item updated.

1.0.68 || 19.07.2026
E3 + E5 EXECUTED — the whole ecosystem is LIVE on the box. Both
environments run as Portainer git-backed stacks (branch dev, 5-min
GitOps polling) behind an NPM edge stack with one Cloudflare DNS-01
cert over all 15 vhosts: web10-prod (public HTTPS — api/auth/rtc/
minio/social/www+apex/marketing-api.web10.app) and web10-dev
(VPN-only, the same on *.dev.web10.app → the box's LAN IP). Verified
live: every vhost 200 over HTTPS, prod money path signup→POST
/web10token returns a JWT, and the dev auth bundle calls
dev.web10.app (proving the B5/D14 origin fixes). The legacy Caddy
edge, the old bare-name staging stack, and the four *.staging DNS
records are decommissioned. The entire bring-up is now codified in
ubuntu-deployment/scripts/ (sync-dns.py, deploy-stacks.py,
sync-npm.py, smoke.sh, lib.sh) — idempotent, secret-free, reading
only the gitignored .env; these scripts replace the click-by-click
Portainer/NPM/Cloudflare steps so the deployment lives in the repo.
.env.example documents every key (Portainer/NPM/Minio-per-env creds).
Docs corrected: login is POST /web10token (not PATCH /login);
AGENT-OPS §4 now records the box as deployed and points at scripts/;
OPS-LOG has the full session. Operator to-do: rotate the CF token
(it sat world-readable in the retired Caddyfile).
Plan additions (operator direction, now that the box is live but
pointed at an EMPTY ferretdb): A7 — connect the node to the original
production MongoDB on the box (~208 real users + historical stats +
the registered apps from web10's live app-store era; config +
verification, gated on a dev login working against a copy). B6 —
authenticator revamp: the ui/ auth flow is broken in look (the web10
logo renders broken) AND function ("doesnt work"); B5 fixed the
shell, B6 fixes the real login/consent journey against real data
with a playwright guard. D16 — restore the app store as a real
curated marketplace (real registered apps from the mongo, killer app
promoted up top + third-party apps below, register-freely /
admin-approve curation, real historical stats); this reverses the
D20 "keep the catalog minimal" call, which assumed an empty catalog
— reconnected real apps make restoring it the "real company" goal.

1.0.67 || 19.07.2026
D14: web10-social backend origins parameterized — the last app-side
deploy gate. New src/lib/origins.ts reads VITE_API_ORIGIN /
VITE_AUTH_ORIGIN / VITE_RTC_ORIGIN at build time (prod origins as
fallbacks, ?local=true still wins); Web10SocialAdapter + the typed
wapi wrapper + Interface.ts's bare-username default provider all use
it. The 15 identical hardcoded cross_origins lists collapsed into one
that also includes the serving hostname, so a dev/prod deploy
authorizes its own vhost without a per-env code edit. Stale
"pending D14" notes cleared from the ecosystem compose, social
Dockerfile, and AGENT-OPS §4.1 (origin parameterization now DONE for
all three frontends). Verified: 195 vitest green (2 new origin
tests), `bun run build` clean, and an arg-set build bakes the dev
origins into the bundle (grepped the emitted JS).

1.0.66 || 19.07.2026
E3/E5 repo side: the whole ecosystem is deployable. NEW
ubuntu-deployment/docker-compose.ecosystem.yml — ONE parameterized
compose for all three environments (web10-staging / web10-dev /
web10-prod as Portainer stacks), now including web10-social,
marketing-ui and marketing-api alongside the node. Cross-stack
safety: every inter-service URL and NPM forward target uses
stack-prefixed network aliases (web10-dev-api) because bare service
names resolve ambiguously when multiple stacks share the proxy
network; the db tier (postgres/ferretdb) moved to a per-stack
internal network, off proxy entirely. Frontend origin build args
(VITE_API_ORIGIN / VITE_AUTH_ORIGIN / VITE_RTC_HOST /
REACT_APP_DEFAULT_API / VITE_MARKETING_API) are passed per env —
the app-side ARG plumbing is B5's (ui) and D12's (social) to
consume; marketing-ui's Dockerfile consumes them NOW (new ARGs).
web10-social gets its first production Dockerfile (vite build +
nginx SPA; `tsc -b` path-alias failure documented as lane-D debt) +
.dockerignore. env.staging/dev/prod.example document every required
stack var (all required-or-fail — no silently mis-originated
bundles). docker-compose.staging.yml + docker-compose.marketing.yml
DELETED (superseded — "never two divergent composes").
STAGING-RUNBOOK.md rewritten as the three-environment runbook:
VPN-only dev (CF DNS → LAN ip, DNS-01 certs), prod cutover caution
(api/auth.web10.app may point at an older deploy), dev→prod
promotion flow [✓ plan]. AGENT-OPS.md/README/prep-vm.sh updated;
known issues refreshed (rtc/minio staging DNS verified FIXED;
auth-ui bundle still hardcodes prod origins — live-checked).
Remaining for E3/E5 (lane queue updated): box execution — create
the stacks, NPM hosts, DNS records; rebuild after B5/D12 land.
Also queued E6 push-to-deploy CI/CD (dev push → dev stack, release
→ prod stack): Portainer GitOps polling first, Cloudflare-Tunnel'd
stack webhooks later — NO self-hosted runner (public repo).
Box recon (19.07 evening, SSH as the operator's user): the live
edge is NOT NPM — a root-managed Caddy container holds 80/443 with
bare-name targets and a world-readable Caddyfile embedding a live
CF API token (operator: chmod 600 + ROTATE). Operator's chosen
design = NPM-as-a-Portainer-stack (UI for every mapping, config in
a volume): NEW docker-compose.edge.yml (npm-data volume = all
proxy config, npm-letsencrypt = certs); prep-vm.sh now installs
only Docker + Portainer + the proxy network (NPM comes from the
edge stack); Caddy→NPM migration procedure in AGENT-OPS.md §4.5;
.env.example gains SSH_USER/VM_PUBLIC_IP (box SSH is a user
account, not root). AGENT-OPS also gains the everything-box
guardrail: the host is a personal machine — agents manage ONLY
the edge/web10-* stacks, never other containers.
Doc consolidation: STAGING-RUNBOOK.md folded into ubuntu-
deployment/README.md — the name was stale and README is what
GitHub renders when you browse the folder; one human doc (URL map
first) + AGENT-OPS for agents + OPS-LOG ledger. All references
repointed. THEN the staging env itself was CUT (operator call:
dev + prod is enough on one lean box — staging's only unique value
was public previews of unreleased work): env.staging.example
deleted, compose/README/AGENT-OPS/plan/lanes rewritten for two
envs, and the AGENT-OPS §4.2 migration now ends by decommissioning
the legacy *.staging stack, its DNS records, and the Caddy edge.
Drive-by CI fix: mobile/encryptor "tampered ciphertext" test was
flaky (replaced the LAST base64 char with 'x' — 1/64 runs it
already was 'x', so nothing was tampered); now flips an early char
to a guaranteed-different value.
Post-merge with D12/D13 (which took 1.0.63/1.0.64 — renumbered):
social's Dockerfile now runs the full `bun run build` (D12 fixed
the tsconfig `@/*` alias this file had worked around; build
verified green), and NEW lane item D14 queued — web10-social's
adapter origins are still hardcoded (never in D12's scope); the
compose/Dockerfile side already passes the args.

1.0.65 || 19.07.2026
B5: ui/ leveled up to the design.md standard + the urgent staging
origin unblock. Staging fix: authAdapter.ts/config.ts no longer
hardcode api/auth/rtc.web10.app — backend origins are build-time env
(REACT_APP_*/VITE_* both accepted, prod values as fallbacks) wired
through ui/Dockerfile ARGs; .context/laneE-ui-build-args.md documents
the exact build args for docker-compose.staging.yml (fixes
AGENT-OPS.md §4.1 known issue #1). Design level-up: tokens.css
migrated verbatim to design.md §13 (dark-first zinc + violet, "sync
don't fork" header); self-hosted Inter/Space Grotesk/JetBrains Mono
via @fontsource-variable (no font CDN); components/ui primitive kit
(Button/Input/Label copied from web10-social's idiom + Card/Badge/
Skeleton/Dialog built in it); ALL inline style={{}} burned down across
every screen (SetupWizard alone had 72); SideBar's literal
"style={{...}}"-string-in-className bug fixed; dead vendored Bulma
(ui/src/assets/bulma/) and dead images deleted; invisible FontAwesome
fa-* icons (never loaded) replaced with Lucide; chatscope dependency
dropped (Search → house Input); ghbtns iframe → token-styled link.
Screens: Studio restyled first (tabular-nums, success-green reserved
for money), auth as centered one-column narrative ("this is your
node"), consent/contracts with explicit permission Badges and
destructive confirmations that got MORE explicit, Settings/Config on
Card sections with skeleton loading states; new MobileNav bottom bar
(design.md §9) on all app screens. Brand: hub.png/hub.jpg (Apple's App
Store logo — trademark) and react-atom logo512/192 replaced with D13's
keys-mark icon set (NOTE: design.md §3's alternative.png row is wrong —
that file is a guitar-player illustration, not the keys mark; D13
flagged, follow-up edit to design.md queued). Pre-existing bugs fixed
in passing: SignupForm betacode null-deref, Subscription plan shown
via placeholder, Wipe button styled neutral. 73/73 tests green, clean
tsc+vite build; screenshots at 1280+375 for all 7 screens in PR.

1.0.64 || 19.07.2026
D12: web10-social level-up to the design.md standard. Wiring fixes first:
@tailwindcss/vite was missing from vite.config.ts so the v4 pipeline never
ran (app shipped un/partially styled — verified via a real production
build, confirmed brand tokens now compile); Inter + Space Grotesk are
self-hosted via @fontsource-variable/* (no CDN) and actually loaded from
main.tsx; the FontAwesome kit script is gone (Lucide only, already the
case in code — index.html was the leak); tsconfig.json was missing the
`@/*` path alias entirely, so `tsc -b` had ~90 pre-existing errors across
every file that imports it — fixed, plus a handful of real type bugs
(MediaRecord/PostRecord casts, a generic-inference test, `global` → 
`globalThis`) it had been masking; the legacy Crm/Mail/Bio exclude list in
vitest config was stale (those components no longer exist) and is now
gone. Screens: Feed rebuilt as media-forward cards (wired to real
reaction/comment counts + a working like-toggle and inline comment thread,
previously dead state), Composer restyled to feel like publishing (avatar,
drag-and-drop attach, error state), Profile gained a creator-page banner +
tabular-nums stats row (new optional ProfileRecord.banner_ref field),
DMs/Layout got skeleton loading states, data-testid hooks, 44px touch
targets, and a real focus-visible ring everywhere (global, brand-toned).
Deleted a duplicate dead FeedScreen and legacy CRA boilerplate (logo.svg,
unused images, a stray manifest.json.bak, the CRA README). Brand asset
fix: `public/alternative.png` was documented as the canonical square keys
mark but actually contained an unrelated guitar-player illustration
(invisible white-on-white, which is how it went unnoticed) — discovered
independently in this lane and in D13, converged on the same fix (see
decisions.md D24): derived the real mark from the existing lockup and
applied D13's generated icon set (logo192/512.png, favicon.ico,
apple-touch-icon.png) in this app's public/. 193 vitest tests stay green,
`tsc -b && vite build` passes clean (previously broken), screens verified
via vite preview + Playwright screenshots at 1280 and 375.

1.0.63 || 19.07.2026
D13: marketing-ui rebuilt on the design.md standard — the pitch site now
reads as a company. Bulma removed entirely (react-bulma-components +
vendored bulma.min.css gone); Tailwind v4 + @tailwindcss/vite, the
canonical design.md §13 token block, cva/clsx/tailwind-merge, and a
components/ui primitives kit (Button/Card/Input/Textarea/Label/Badge/
Dialog) copying the web10-social idiom. Self-hosted Inter/Space Grotesk/
JetBrains Mono via @fontsource-variable — no font CDN. Lucide replaces
every invisible `fa fa-*` class (FontAwesome was referenced with no kit
loaded; icons were literally invisible before this). Landing page is a
full rewrite: hero is the real keys-lockup mark on #09090b with the one
permitted violet glow + a declarative headline, a reach-gap proof section
rendering THE STORY's 1M-followers/300k-shown mechanic as two HTML/CSS
bars (math extracted to lib/reachGap.ts and unit-tested), and a 3-step
"how it works" (inbox pattern = 100% delivery by architecture) — no fake
testimonials, no stock photos, no team/funding copy. Docs pages restyled
to 65-75ch prose measure with Space Grotesk headings and JetBrains Mono
code blocks (markdown pipeline unchanged). App Store rebuilt as "Built on
web10" — curated first-party app cards (web10 social, node console, CRM,
Mail, importer) instead of an unverified third-party catalog, plus one
"Build on web10" CTA into the docs. Exporter/Navbar/ReportBug restyled on
tokens (ReportBug now a Radix Dialog; e2e-relevant strings and
data-testid hooks preserved). Education-era debris deleted from
public/layouts/ (university logos, old backgrounds, thumbnail, the
FontAwesome webfont dir) — logo_white.png survives, moved to
public/brand/logo-lockup.png. Paid the design.md §3 asset debt for all
three apps: favicon.ico + 192/512 PNG + apple-touch-icon derived from the
keys mark on #09090b, and a shared 1200x630 og-image (lockup + glow) —
dropped in .context/brand-assets/ for lanes B/D12 to apply, with a note
flagging that marketing/web10-social/public/alternative.png (design.md's
documented source for the square mark) does not actually contain the
keys mark — it's an unrelated illustration — so the icons were derived by
cropping the keys glyph out of the lockup instead; design.md §3 needs a
follow-up correction. SVG vectorization of both marks stays open (no
tracing tool — potrace/inkscape/rsvg-convert — available in this
environment; shipping a redrawn approximation was explicitly out of
bounds, so it's documented debt, not guessed art). Fixed the stale
og:image path in index.html (pointed at a nonexistent /images/ path).
19 component/unit tests green, production build green, screenshots taken
at 1280 and 375 for all four routes plus the mobile nav and report-bug
dialog states.

1.0.62 || 19.07.2026
environments + ops + e2e depth. plan.txt CROSS-CUTTING deployment now
specs TWO full-ecosystem environments on the ubuntu-deployment box:
PROD (public: marketing-ui + marketing-api + node incl. social, CF DNS
→ forwarded 80/443 → NPM TLS) and DEV (same stack, VPN-only: cloudflare
DNS pointing at the INTERNAL LAN ip — resolves publicly, unreachable
off-VPN, no dev port-forwards, TLS via DNS-01) with a documented
dev→prod promotion flow; lane items E3 (prod) recast + E5 (dev) added.
New C6 (lane C): e2e deep sweep + bug hunt — expand C5's playwright
harness across money paths and lane seams, signup-as-a-test (fresh
accounts every run) + persona seed fixtures (creator, fans, granted/
revoked terms) that also power dev-env wipe+reseed; deliverable = the
enlarged suite AND the honest bug list. Staging went LIVE and was
triaged remotely: api healthy at staging.web10.app, auth UI broken by
hardcoded origins (authAdapter.ts/config.ts bake api.web10.app into
prod builds — env-parameterization fix queued into B5, urgent),
rtc/minio DNS records missing, marketing/social not in the stack.
New ubuntu-deployment/AGENT-OPS.md: field manual for (weaker) ops
agents — SSH-in procedure off the gitignored .env, box map, ordered
diagnosis sequence with symptom table, KNOWN ISSUES from the live
triage, redeploy + CF DNS procedures, may/may-not boundaries — plus
OPS-LOG.md, an append-only coordination ledger seeded with the triage;
README.md points agents at both. Conductor board: ws4 = staging
triage + E5/E3, ws5 = C6.

1.0.61 || 19.07.2026
design.md: the binding UI/brand standard for all user-facing surfaces —
brand essence (keys mark, dark-first, restrained voice), canonical asset
inventory (logo_white.png lockup + alternative.png square mark ARE the
logos; logo512/192.png are the React atom, hub.png is Apple's App Store
glyph — purge list + asset debt queued), full token spec (zinc + violet
#8b5cf6, Tailwind v4 @theme block in §13), type (self-hosted Inter /
Space Grotesk / JetBrains Mono — never Google CDN), spacing/radius/
elevation/motion rules, component + responsive standards, a11y, and the
UI definition of done (§12: screenshot test, PR screenshots at desktop +
375px, tokens-only colors). CLAUDE.md + AGENTS.md now gate every UI task
on reading design.md first. New parallel beautification items queued:
B5 (ui/ level-up), D12 (web10-social level-up), D13 (marketing-ui
rebuild, Bulma out — per D22/D23) in plan.txt phase 2.5 + lane queues;
conductor board refreshed (ws4 = execute E1 staging deploy, blocked on
SSH + Cloudflare creds). decisions.md D23 records the design-language
call.

1.0.60 || 19.07.2026
E1: staging node deployment infrastructure — Portainer + Nginx Proxy
Manager approach. ubuntu-deploy.sh replaced by prep-vm.sh (installs
Docker, creates shared "proxy" network, deploys Portainer + NPM).
docker-compose.staging.yml rewritten as self-contained stack (no overlay
chain: gunicorn API, built UI, no hot-reload, all services on proxy
network). Old docker-compose.ui-prod.yml + rtc-prod.yml deleted.
DEPLOYMENT-PLAN.md: full architecture (Portainer + NPM + Cloudflare DNS
challenge). STAGING-RUNBOOK.md: Portainer/NPM workflow (deploy, redeploy,
volumes, wipe+reseed, e2e test, troubleshooting). README.md rewritten
as the how-to with an explicit public-vs-admin security model (the
WordPress split: app admin public behind its own auth like wp-admin;
infra panels Portainer/NPM-admin/Minio-console LAN/VPN-only like
cPanel — no DNS records, no proxy hosts, only 80/443 router-forwarded;
SSH tunnel for remote access). Minio public proxy corrected to the S3
API (:9000) — the console (:9001) was previously proxied to the
internet with default creds. MINIO_PASSWORD is now a required stack
env var (S3 API is internet-facing; sets both the Minio root password
and the API's S3_SECRET_KEY). Awaiting SSH + Cloudflare creds to
deploy. Prepares for timeline week 3 demo-node deploy (same stack,
different domain).

1.0.59 || 19.07.2026
C5: browser e2e harness — new top-level e2e/ dir with Playwright smoke
suite (10 journeys across marketing-ui, ui auth, web10-social). new
e2e/docker-compose.yml (full stack: api + ferretdb + ui + social +
marketing-ui + rtc + minio behind nginx-proxy), e2e/Dockerfile.social
(dev-mode, sidesteps tsc errors from incomplete D2.5 rectangles-npm
cleanup), e2e/wait-for-stack.sh (local health check), new
.github/workflows/e2e.yml (path-filtered CI: compose up → wait →
playwright → traces on failure). local run: E2E_HTTP_PORT=8880 docker
compose -f e2e/docker-compose.yml up --build -d && E2E_HTTP_PORT=8880
npx playwright test. auth UI full-browser flows deferred (CORS: dev
containers resolve api.localhost:80, not :8880 — API-level signup/login/
certify flows cover the money paths; full browser flows land when the
stack consolidates to a single port).

1.0.58 || 19.07.2026
D10: report-a-bug loop — feedback endpoint in marketing-api (POST
/feedback, GET /feedback, 6 new tests, 10 total smoke green),
"Report a bug" affordance + React error boundaries in web10-social
(Tailwind/Radix modal, sidebar button, console error capture, 11 new
component tests) and marketing-ui (Bulma modal, Navbar button, 11 new
component tests, --passWithNoTests removed). Lane B note in
.context/laneB-report-a-bug.md with endpoint contract + reference
implementations for ui/ integration. Dead rectangles-npm cleanup:
21 dead components and 6 dead test files removed (superseded by
D2.5/B2.5 Tailwind migration). Social test suite now 193 passed, 0
failures (was 4 pre-existing failures from dead code).
A5: P4 per-request metering events. emit_event() in documentdb.py writes
user/action/service/site/ts to a capped web10.metering_events collection
(100k max, METERING_EVENTS_MAX). Wired into all CRUD/aggregate endpoints
in crud.py as fire-and-forget (try/except — never crashes the request).
5 new endpoint tests verify events on create/read/update/delete/aggregate.
279 api tests green.

1.0.57 || 19.07.2026
PR + changelog workflow hardening for the parallel-agent conveyor.
AGENTS.md/CLAUDE.md (and the Conductor prompt) now require, right after
gh pr create: (1) an immediate conflict check (gh pr view --json
mergeable,mergeStateStatus) with local merge of origin/dev to resolve,
then (2) watching ALL checks — optional ones included, UNSTABLE is red,
not "ready to go" — and fixing until every check is green before
reporting the PR ready. Changelog conflicts defused: .gitattributes sets
CHANGELOG.md merge=union so parallel branches' entries union instead of
conflicting on local merges, with a documented renumber-after-merge step
(top entry must stay the unique highest; changelog CI already enforces).
Also in this branch, dev unbroke: LadderCard.tsx type-only import fixed
(ui docker build was red on dev after #118) and marketing/web10-social
bun.lock regenerated (frozen-lockfile install failed on every CI run,
skipping its tests entirely). web10-social's tsc build stays red with
pre-existing @/-alias + legacy rectangles-npm import errors, masked by
continue-on-error in CI (the known 1.0.48 gap) — left for lane D; its
4 unresolvable legacy tests (BioBottom/ContactAdder/Crm/Mail, imports
D2.5 removed from package.json) excluded in vite.config.ts with a note,
so the test step reports signal again (181 passing) instead of failing
on dead code.
plan.txt recovery item extended: forgot-password must be smooth, phone
AND email as first-class reset channels. New plan.txt ci item: the api
(lint + test) job has never gone green — uv sync --frozen installs
neither ruff nor pytest, and beneath the spawn error sit 104 ruff
errors + 26 unformatted files; one lane-A branch fixes workflow + debt
together. Board hygiene: #117 and #118
raced for version 1.0.55 and both merged with it — A6 (merged second)
renumbered to 1.0.56 here, lane tick updated to match.

1.0.54 || 19.07.2026
README rewritten to match the current stack: dead references removed
(auth/ dir, settings_example.py copying, skaffold/GKE deploy, hex-key
website), replaced with the real quickstart (docker compose up --build →
auth.localhost, env-var settings, FerretDB default + mongo profile),
the creator-platform framing (D20: no shadow ban by architecture, inbox
pattern), the actual repo map (ui/, marketing/*, ubuntu-deployment/),
and pointers to plan.txt / GLOSSARY.md / decisions.md / SECURITY.md.

1.0.53 || 19.07.2026
outreach batch 1 fully enriched: 20 API-verified prospects via YouTube
Data API v3 (outreach_sourcer.py). all burn events verified by video
title + timestamp, subscriber counts from channel statistics endpoint.
5 prospects have biz emails. M0 fit corrected to signal-based scoring:
10 YES fits (recipes, crafts, tutorials, fashion, finance, podcasts,
nutrition, fitness), 4 PARTIAL, 3 POOR (animation, cinematic, vlogs).
6 false positives filtered (gaming shadowbans, advice videos,
third-party references). ~2,100 quota units used (21% of free daily
tier). script reusable for batches 2-5.

1.0.52 || 18.07.2026
B2.5: ui makeover — rectangles-npm and react-bulma-components ripped out
of ui/; replaced with Tailwind CSS v4 + CSS variable design tokens
(ui/src/styles/tokens.css: color palette, type scale, spacing, radius,
dark mode). All ui/ screens restyled: login/signup/forgot, contracts,
requests, settings, setup wizard, config page. Shared components
(SideBar, TopBar, Icon, Branding) rewritten on Tailwind. Card pattern
replaces Bulma cards everywhere. Form inputs use consistent rounded
inputs with icon prefixes. 43/43 vitest tests green.

1.0.51 || 19.07.2026
D2.5: web10-social UI makeover — rectangles-npm and @chatscope retired,
replaced with tailwindcss v4 + Radix UI primitives + Lucide icons. New
M0 screens on the D4 data layer: Feed (chronological + sort dropdown:
newest/oldest/most_reacted via readFeed), Profile (display name, avatar,
bio, post/media grid via readProfile + readMyPosts + resolveMediaRefs),
DMs (conversation list + message thread via listConversations/readDms/
sendDm), Post Composer (text + photo upload via createPost/uploadMedia).
Empty states point at exporters ("Import your Instagram"). Dark-first
design tokens, responsive layout with sidebar + mobile bottom nav.
12 new component tests (226 total green, 4 legacy skipped).
Stack pick recorded in decisions.md (D2.5-stack).

1.0.51 || 18.07.2026
CLAUDE.md: new working convention — "hand off the next task": after a merge,
agents end their final message with the next unticked lane item and a
paste-ready kickoff prompt (task verbatim, gates, owned dirs, acceptance
bar) for a fresh workspace.

1.0.50 || 18.07.2026
D4: web10-social data layer — full conventions-schema stack for the M0
killer app slice. new src/data/ with typed modules: posts (CRUD + media
upload via API presigned URLs), feed (chronological inbox + sort dropdown:
newest/oldest/most_reacted via aggregate), profile (read/upsert), contacts
(conventions schema CRUD + search), dms (records-based, deterministic
conversation service names), comments (threaded), reactions (toggle,
aggregate counts). wapi.ts: thin typed fetch wrapper over legacy wapi.js.
Web10SocialAdapter wired with all 30+ new data-layer methods alongside
legacy adapter (backward compat). SMR terms extended for profile, contacts,
inbox, comments, reactions, media services. 55 new vitest tests (227 total,
all green). screens deferred to D2.5 post-B2.5 tokens.

1.0.49 || 18.07.2026
wave-0 security fixes: CORS tightened — allow_origins=["*"] replaced
with origins derived from CORS_SERVICE_MANAGERS + PROVIDER settings;
bare except clauses removed (twilio.py catches TwilioRestException,
stripe.py catches StripeError, auth.py certify() catches only
PyJWTError/ValueError/TypeError); provider URL validation added to
certify_with_remote_provider (scheme allowlist, private-IP/localhost
SSRF guard, length cap, 10s fetch timeout). 280 api tests green.

1.0.48 || 18.07.2026
plan: ui stability specced end to end. the thin playwright line in
CROSS-CUTTING quality/testing expanded into a real item: playwright-
in-docker against the compose stack, ~6-10 smoke journeys across all
three uis (ui signup/login/consent, social post->feed + grant/revoke
terms, marketing-ui route smoke), selenium rejected (flake + grid
drift), visual regression explicitly deferred until B2.5/D2.5
makeovers settle. two ci gaps recorded as items: marketing-ui has
ZERO component tests (--passWithNoTests masks it — backfill item)
and the shared js workflow runs typecheck + build with continue-on-
error (a non-compiling ui shows a green check — fix item under
ci/cd, also noted in wave-0 status). new report-a-bug loop item as
the explicit counterweight to a thin e2e layer: feedback endpoint in
marketing-api + <=2-click report affordance + error boundaries in
all three uis so white-screens convert to reports, not bounces.
ux telemetry item added with the privacy split: marketing-ui gets
full funnel analytics + self-hosted replay (posthog/openreplay --
never third-party saas); platform uis (ui, social) get content-free
aggregate events + a js error beacon ONLY -- session-recording js
there is ruled out by the manifesto ("nobody is mining you") and
phase-11 e2e encryption; replay-grade insight on the platform is
opt-in dogfood/design-partner sessions, consent as the feature.
board: lane C gains C5 (e2e/ harness), lane D gains D10 (report-a-
bug loop) and D11 (ux telemetry).

1.0.47 || 18.07.2026
board refresh: CURRENT CONDUCTOR BOARD in parallel execution.txt
re-cut for the D20/D21 pivot + timeline.md week 0 — ws1 B2.5 stack
pick/tokens, ws2 REPOINTED from C2 sdk (off the M0 critical path)
to D4 data layer, ws3 wave-0 security fixes then A6, ws4 outreach
batch 1 or E1. merge-order notes added (lane A single-branch,
D2.5 waits on B2.5 tokens, B4.5 M0 slice follows B2.5). stale
17.07 board was pointing agents at pre-pivot work.

1.0.46 || 18.07.2026
D21: user billing stripped — users are never charged; credits/space
metering repurposed as OPERATOR-SET quotas (rate/abuse throttle +
storage caps, also closing the import-storage gap); stripe stays for
the creator economy only. the studio monetization-menu screen
(rung-0 cards) promoted INTO the M0 slice — the video shows the
money screen (new lane items A6 + B4.5 M0-slice note; M0 milestone
and timeline week 2 updated). outreach story-ammo gains the x
examples (rev-share pauses, link throttling, reach-suppression as
stated policy) — x-native creators are a fresh burn segment.
KNOWN GAPS gains exporter battle-testing: D5 mappers are fixture-
tested not mess-tested (week 3 real-takeout seeding = first battle
test; promote llm-assisted mapping on first real break; white-glove
absorbs the mess through M2); pitch-honesty facts recorded — youtube
takeout exports content but in 50GB chunks from days-long jobs, the
audience never ports from any platform (content ports, audiences
are pointed), imported video plays direct-mp4 until transcode.
imported-identity relinking recorded as a two-tier accepted
tradeoff: ghost comments with origin provenance now; lazy
claim-by-matching later (joiner's own takeout contains their
comments — match origin+timestamp+text against ghosts and link
automatically, no oauth/verification infra needed).
timeline.md: dated M0→M2 execution schedule. weeks 0-4: B2.5 stack
pick + D4 slice + integration + themed/seeded demo node on the colo
box → M0 gate week (video shot by ~aug 17). weeks 5-10: the rule of
100 (10-15 founder-sent/wk) in parallel with the creator-#1 minimum
build (memberships + amazon tag card, hosted DR floor). verdict
~oct 1; M2 oct-nov if green; breakeven ~mar-apr 2027. two tracks
(machine vs founder) with founder attention named as the gating
resource; ws2 repointed from C2 sdk (not M0-critical) to D4.

1.0.45 || 18.07.2026
the user's side of THE STORY (plan.txt): fans are a CONVERSION
MULTIPLIER on the creator sale, not a second wedge — first sentence
"never miss a post from [creator] + inner-circle status", quiet
second sentence safety (delete deletes, expiry later via D16, not
mined/sold); M0 is creator-community-shaped, not friend-graph-shaped.
wannabe-creator segment added: we never out-dopamine tiktok (no
lottery, no algorithm); the pitch is the LADDER — play the platform
lottery, bank every win here where the house can't take it back —
and since every account is creator-shaped, the user base IS the
creator pipeline (the wordpress flywheel). aspirant psychology
recorded: users want to BE seen, not just see — "your number is
real here" (100% delivery flatters small accounts most; 5k = 5k),
local fame via human curation (creator spotlights, never an
algorithm), own-space-at-signup onboarding; manifesto.md gains the
"you're not just in the crowd" block. THE RISE added: the aspirant's
five-step rise-to-fame arc (free on a creator's node -> real numbers
-> local fame -> pop off -> graduate to your own node, audience
intact) with the economic rule "nobody pays before fame pays them
first" (people can't afford infra until fame pops). GRADUATION added
as a phase 10 item (mastodon Move-style follower auto-migration,
fully live at M3; M3 deliverable gains the graduation demo). ranked
communities added to phase 4 monetization: terms ACLs natively
express membership tiers/ranks (the skool/whop paid-community model
on existing machinery, ~97% payout); paid-community sellers added to
outreach.md as a founding-creator segment (already charge members,
most ban-prone segment); rule recorded: serve the mechanics, never
the aesthetic — gamification layers are post-M2. THE RISE gains its
failure branch: not popping off? switch nodes — identity/content/
followers move sideways (same phase 10 mechanism), scene-market fit
becomes searchable, nodes compete for rising talent, and operators
stay honest because mistreated members walk with their followers.
CLAUDE.md gains the D20 strategic orientation: social platform first,
protocol second — protocol decisions judged by whether they make the
creator platform better; generality for its own sake goes to later.md.
KNOWN GAPS block added to the milestones: the video gap (founding
creators #1-3 must be ones M0's format serves), memberships live
before creator #1 (hard M2 prerequisite), a production hosted-ops
floor before the first white-glove yes, and the dmca/csam t&s gate
as pre-creator-#1 under white-glove hosting. adult-content fork
decided in phase 12 (the wordpress answer, forced by stripe's terms):
inc-hosted nodes + inc rails are clean-only; self-hosted nodes with
their own processor are the operator's business under D10. onlyfans
recorded as market proof (fans pay creators directly at ~$6B/yr, 20%
take vs our ~3%, aug 2021 tried-to-evict-its-own-creators story) —
mechanics yes, positioning never; outreach.md gains the story-ammo
objection entry. phase 4 monetization menu researched + specced
(07.2026 landscape): unlock ladder rung 0-4 — memberships/affiliate
(levanta-class) day one, privacy-safe contextual fill (ethicalads-
class; mediavine journey from ~1k sessions), sponsor-marketplace
adapters (paved 30% / kit 23.5-30% takes = our 3% undercuts 10x),
tracking programmatic opt-in-if-ever (manifesto constraint), and the
M3 marketplace's nano tier ($20 promos at 5k followers — THE RISE
stage 3 gets a paycheck; fame starts paying at 5k here, not 100k).
phase 4 reframed as the STUDIO (youtube-studio mental model): one
pane for post + analytics + revenue + the monetization menu rendered
as a YPP-style unlock ladder (creators already read "X more to
unlock Y"); creator-studio and operator-console personas designed
as separable tabs from day one. zero-friction rule added: every menu
option is a one-button card, adapters do the paperwork (qualify-
gating, media-kit prefill from owned analytics, status tracking);
rung 0 gains auto-affiliate-everything (skimlinks/sovrn pattern —
links rewrite to earn at render); metric = time-to-first-dollar.
composer-level monetization added (phase 8 posting flow): one-tap
attach-product / mark-sponsored / member-gate (terms ACL on the
record) / tips — the youtube-product-tags pattern, earning as part
of the posting habit. amazon adapter v1 specced (07.2026 rules
verified): paste-tag card, render-time /dp/ASIN + ?tag= rewriting
(never cloaked), poster's-tag-wins-else-house-tag revenue routing,
compliance baked in (disclosure chip, no email tags, no stale
prices, 3-qualifying-sales-in-180-days countdown surfaced), pa-api
picker deferred (gated on sales history), levanta/influencer-
storefront as upgrade rungs. lane board gains B4.5: the STUDIO
respec on the post-makeover stack — highest-stakes ui in the repo.
AI product suggester specced (phase 4): scoped read-only llm on
posts profiles the niche → studio suggestions feed + composer-time
attach chips, always human-approved, v1 needs no pa-api; works from
follower #1 (the wannabe gets an ai revenue manager); same profiling
engine becomes the M3 marketplace's sponsor-matching brain; funded
hosted-tier / byok (D19 pattern). first ai feature in the product is
the money assistant — passes the D20 oracle where the chatbox didn't.
new business-plan.md (v1): the lean company plan — automattic model
(free software / hosted subscription / 3% rails / marketplace),
proposed pricing tiers ($49/$199/$499 + 3%; founding creators free
12mo; self-host free forever), unit economics (~$289 rev vs $70-200
COGS per hosted creator), breakeven at ~5-10 paying creators, burn
<$1.5k/mo, bootstrap-through-M2 funding posture, competition answers,
top-5 risks, and milestone gates as kill tests. all numbers marked
as estimates to falsify; pricing marked PROPOSED pending M2. CAC
staged by tier: founder-sends-every-message for 100k-1M creators
permanently (ai-sdr tools rejected for this tier — pattern-matched
as spam; the in-house agent fleet runs the sdr back office instead:
sourcing, enrichment, gap computation, draft-for-review), instantly/
clay-class volume infra only for the post-M2 starter tier, flywheel
as the scale CAC machine; outreach.md gains the agent-assisted-
founder-sent division of labor. financial projections built out
(§6a-e): 24-month bear/base/bull table (bear caps at ~$12k sunk;
base breakeven ~month 9-10, ~$170k ARR month 24; bull ~$1M ARR),
cumulative cash view ($0 outside capital required), KPI funnel
dashboard, sensitivity ranking (close rate #1), and a "where this
model lies" section (churn/LTV invented, $3k creator-revenue
assumption, flywheel-shaped growth, founder time at $0). funding
section expanded (§8a-c): no-investment path itemized (~$10-13k
to breakeven), with-investment path ranked by leverage (creator
guarantees — the substack-pro play — then designer, t&s, growth
infra; pre-seed ~$350-500k compresses timeline ~12mo), and the
raise trigger: never before the M0 gate, window opens at early M2
traction, raise to accelerate a working machine, never to discover
if it works. cost model corrected to real numbers: $200/wk tokens,
$100/mo colo (64gb xeon hosts ~10-30 early nodes → ~$5-15 COGS/
creator, 90%+ early margins), c-corp + trademark already done,
founder-made demo video; ~$10k total to breakeven at ~$1k/mo burn.
honest infra caveats recorded: single-box SPOF (off-box backups +
restore drill for founding period, redundancy by paying tiers; colo
bandwidth = video ceiling, R2 offload first) and the $6 dmca
designated-agent registration as the one immediate legal spend.
ec2/cloud compute explicitly rejected in the plan (4x compute cost,
egress pricing is poison for a social/media platform, off-message
for the ownership company); DR pattern = restore to hetzner-class
dedicated on failure, second box at paying tiers, one-container
node keeps infra reversible. horizontal-xeon scale path recorded
(creator nodes are independent → embarrassingly parallel, failure
domain 1/N per box, same-facility caveat → off-site DR floor).
kill test upgraded to the RULE OF 100 (plan.txt M0, outreach.md,
business-plan): 20 sends carry ~36% false-kill risk at a true 1/20
close rate (0.95^20) — the verdict needs 100 sends, run in batches
of 20 (batch one iterates the pitch), ~10-15 founder-sent per week
(agent-drafted) over 8-10 weeks, segment split ~35/35/30, gate
counts only with a meaningful video-watch share.
business-plan §11 added: strategic alignments + exit posture —
the open documentdb/ferretdb stack alignment as a NOW distribution
asset (vendor devrel amplification; the M0 video travels to warm
senior relationships as a progress note); plausible 5-year
strategic homes described in loose terms only (public repo — no
named companies or contacts in exit speculation); rule:
bought-not-sold, roadmap never bends toward an acquirer.
new manifesto.md: the fan-facing join-page manifesto every node ships
(templated per creator, "you're not the product here — you're the
point", no unshipped promises). site architecture settled in the docs
cross-cutting section: ONE creator-first marketing site (web10.app,
hero = THE STORY, cta = founding creator); fans convert on the
creator's node via the manifesto page (wordpress/shopify pattern);
no users tab, just a thin "powered by web10" footer explainer.

1.0.44 || 18.07.2026
outreach.md: the sales kit for M0's kill test (D20) — list-building
queries (creators self-identify: shadowban/demonetization complaints,
announced substack/rumble moves), cold email + DM + manager + call
copy, cadence, and objection cheat sheet. core frames: lead with
THEIR subs-vs-views gap; the ask is ADD not MOVE ("you already post
to 5 platforms — this is #6, except you own it"), ~24h back-catalog
onboarding via the exporters, 3 white-glove founding-creator slots,
one per niche. plan.txt STORY beat 4 sharpened to the add-not-move
frame. list-building has no prerequisites; sending waits on the M0
slice + demo video.

1.0.43 || 18.07.2026
plan refactor (D20): the proposition is creator ownership — "own your
audience, no shadow ban, this is a product for influencers." plan.txt
gains THE STORY (the influencer pitch: subs-vs-views reach gap, AI-
influencer urgency, 100%-delivery-by-architecture, hedge-not-exodus,
kick/twitch-grade slick — never fediverse jank); thesis rewritten to
lead with it. M0 redefined: "stands on its own" — post, feed
(chronological + sort dropdown ONLY), profile, dms; deliverable = the
pitch (story deck + demo video for creators), kill test = twenty
creator pitches, not a viral video. feed customizability, preset
lenses, the lens record, and the llm chatbox CUT from the roadmap to
later.md (promotion bar recorded there; D19's byok architecture
stands if it returns). lane board D4/D2.5 updated so no agent builds
the chatbox; GLOSSARY lens entry updated. new decision D20 in
decisions.md.

1.0.42 || 18.07.2026
later.md: new parking lot for far-out ideas that are deliberately NOT
roadmap — vibe-coded apps/themes (the "real gutenberg"; no template
dsl ever, tiers are theme-record now / generated apps far-later),
the amorphous generative-ui app (shell + surfaces, generate-once-
then-harden), and the conference-paper angle (lens as user-owned
algorithm, scoped llm tokens; www/cscw/soups-class venues). each
entry records why it's good AND why it's parked, with a promotion
bar: m0 video shipped + a creator asked for it. distilled from a
strategy review of plan.txt (killer-app-vs-protocol dependency,
creator p&l, m0-first focus).

1.0.41 || 17.07.2026
lens chatbox llm backing re-planned (plan.txt phase 8): BYOK-only —
v1 key stays client-side, chatbox calls go browser -> provider direct
so the node never sees the key or the chat; presets work with zero llm;
phase 11 upgrade puts the key in the phone wallet as an e2e-encrypted
record the phone beams to the apps the user picks; node-provided
inference demoted to a capped operator opt-in, never the default.
new decision D19 in decisions.md.

1.0.40 || 17.07.2026
wave 0 seatbelt — endpoint-level permission-matrix suite (45 new tests,
280 total api tests green). runs through the FastAPI app (TestClient)
so route-level bugs the unit layer misses are caught:
  - auth flows: signup (success, reserved, bad username, duplicate),
    web10token login (password, wrong password, no creds)
  - CRUD routes end-to-end: create/read/update/delete with permission
    checks (authorized, denied, no token, cross-origin, blacklisted)
  - aggregate endpoint: valid pipeline, forbidden stage ($out),
    no permission
  - star protection (I3): cannot update/delete/create star record,
    cross-collection access impossible
  - forged token rejection (I1): tokens signed with wrong key rejected
    on all CRUD + aggregate routes (JWT error handler added to main.py)
  - scoped token enforcement (I5): read-only tokens cannot create,
    no-target tokens: owner allowed, non-owner denied
  - metering/billing: charge called on create/read, services read
    unmetered, out-of-credits denied, out-of-space denied
  - certify endpoint: valid, forged, expired, anon token
  - system endpoints: stats, get_plan
  - also: bare exception handler in main.py maps legacy Exception("TOKEN")
    etc. to proper HTTP 401s; JWT PyJWTError handler catches forged/
    expired tokens before they hit the bare handler; fixed models.dotdict
    -> dotdict bug in documentdb.py

1.0.40 || 17.07.2026
Setup wizard + admin config screen (Phase 3/4 partial, lanes A3/B3/B4):
  - API: /ready (health check, reports configured status), /setup (GET status,
    POST first-run wizard), /config (GET current config, PATCH partial update).
    All endpoints hidden from OpenAPI schema (include_in_schema=False).
    New services/config.py: node_is_configured(), admin_exists(), save_config(),
    generate_jwt_keypair(), create_admin(). New models/config.py: SetupRequest,
    SetupStatus, ConfigUpdate, NodeConfig pydantic schemas.
  - UI: SetupWizard component — 6-step onboarding flow (Welcome -> Node Identity
    -> Admin Account -> Access Policy -> Storage -> Complete). Detects unconfigured
    nodes via /ready and redirects to setup automatically.
  - UI: ConfigPage component — admin node configuration panel. Editable fields for
    all node settings: identity, access policy (beta/verify/pay toggles), free tier
    defaults, S3/media storage, Twilio SMS, Stripe payments. "Node Config" link
    added to SideBar for authenticated users.
  - App.tsx: setup detection on mount, "setup" and "config" modes added to router.

1.0.39 || 17.07.2026
adapter rename: api/app/services/mongo.py -> documentdb.py. the module is
backend-agnostic (pymongo speaks to either real Mongo or FerretDB/DocumentDB),
so the name should reflect the storage layer, not the old vendor. all imports,
test files, and patch paths updated. test files renamed: test_mongo.py ->
test_documentdb.py, test_mongo_crud.py -> test_documentdb_crud.py,
test_mongo_aggregate.py -> test_documentdb_aggregate.py. 235 tests green.

1.0.38 || 17.07.2026
E2: marketing deploy — marketing-api/Dockerfile (multi-stage python 3.12 + uv +
uvicorn), docker-compose.marketing.yml (standalone compose for marketing-ui +
marketing-api), ubuntu-deploy.sh full rewrite (marketing compose copy with path
fixup, Caddy proxy with separate RTC subdomain, auto build+start for node and
marketing, proper DNS/TLS instructions). both images tested green locally.
the 5th verb — aggregate (plan phase 6, lane A4). appmakers get (nearly)
the full mongo query language without losing usage metering:
  - api: POST /{user}/{service}/aggregate. read-only by construction —
    the server prepends $match {service, body.service != "*"} ->
    $addFields body._id (stringified) -> $replaceRoot to body, so the
    dev's pipeline runs on clean user-space docs and cannot name the
    service/star fields (I3). terms treat it as "read".
  - sandbox validator: stage allowlist ($match/$project/$group/$sort/
    $skip/$limit/$unwind/$addFields/$set/$count/$facet/$bucket/
    $bucketAuto/$sample/$sortByCount); $where/$function/$accumulator/
    $lookup/$graphLookup/$unionWith/$out/$merge rejected at ANY nesting
    depth (deep scan catches $facet sub-pipelines, $group accumulators,
    expression trees). invalid pipelines 400 before touching the db.
  - resource caps: maxTimeMS 2000ms, 20-stage cap, $limit/result
    ceiling 1000 docs, allowDiskUse off.
  - usage tracking preserved: charge() gains a units param; aggregate
    is charged per pipeline stage (COST_AGGREGATE 0.000005 x stages)
    into the same credits_spent ledger, gated by the same credit/space
    check as the 4 crud verbs.
  - sdk: wapi.aggregate(service, pipeline) in wapi.js (typed variant
    comes with the C2 rewrite); cdn + node dist bundles rebuilt.
  - tests: 28 new api tests (validator, scoping, metering) — 233 green;
    4 new sdk tests — 52 green. verified live against a real mongo 7:
    scoping, star invisibility, forbidden-op rejection, per-stage
    charging, and the http endpoint (200/400/401) all exercised.
  - protocol-spec.md section 9 updated from "planned" to shipped, with
    metering table + error rows.

1.0.37 || 17.07.2026
infra: ubuntu-deployment script + Caddy reverse proxy for Proxmox staging node; LANE E added to parallel execution board.

1.0.36 || 17.07.2026
ci/cd repair — tests across the WHOLE repo now actually run:
  - js-ci: dropped the dead exporters job (dir deleted in the 1.0.31
    migration), added marketing-ui and mobile/encryptor (55 bun tests,
    previously NO ci at all). the sdk job was dying at bun install
    (no bun.lock, only package-lock.json) so its 48 tests never ran —
    bun.lock now committed for sdk + marketing-ui. test failures now
    report red: continue-on-error removed from the test step (rtc
    opts out via tests:false — it has no suite yet). test:run script
    standardized in sdk + encryptor (encryptor's script claimed jest;
    the suite runs on bun test).
  - marketing-api: had NO ci, no lockfile, no tests. new workflow
    (uv sync + ruff + pytest), uv.lock committed, ruff/pytest dev
    deps, 4 smoke tests (health, pageview, schemas, validate_record).
    ruff immediately caught two real bugs, now fixed: upload_zip used
    background_tasks without declaring the BackgroundTasks param (the
    ZIP upload endpoint crashed on every call) and instagram.py
    called find_json_entries without importing it (instagram parsing
    crashed). 7 unused imports cleaned, ruff format applied. the
    57-test exporter mapper suite is STILL OWED as pytest ports —
    the smoke tests keep the wiring honest until it lands.
  - media.yml deleted (media/ merged into api in 1.0.30; the workflow
    watched a dead path and could never trigger).
  - docker.yml + cd.yml matrices rebuilt around the Dockerfiles that
    exist (api, ui, sdk, rtc, marketing-ui); exporters/media/home/
    crm/mail entries removed — those builds failed on every run since
    the phase-7 tidy.
  - marketing-ui: fixed real type errors the old continue-on-error
    was hiding — missing vite-env.d.ts (css imports + import.meta.env
    didn't typecheck) and a spread over possibly-null ImportProgress
    state. typecheck + build green; test:run passes with no tests
    (--passWithNoTests) until a real suite lands.
  - .gitignore rewritten (was full of deleted dirs: auth2, exporters,
    rtc, web10-deploy, skaffold): global node_modules/, __pycache__/,
    .venv/, *.egg-info/, .expo/, dist for the ui builds, .env.
    untracked from the index: ui/dist (22 files), mobile/.expo,
    web10-cli's node_modules remnant. sdk/dist stays committed on
    purpose — the sdk Dockerfile serves it as the wapi.js cdn.
  - verified locally end-to-end: api 205 pytest, ui 43, sdk 48,
    web10-social 172, encryptor 55, marketing-api 4 — all green.

1.0.35 || 17.07.2026
board sync: fixed plan.txt / parallel execution.txt drift against the
changelog — C1 (media, landed 1.0.25, merged into api/ 1.0.30-31) and
D3 (mobile encryptor, landed 1.0.27) were still marked [~] in flight;
wave-0 status still said github actions ci was open (skeleton landed
1.0.32); the three cd items in plan.txt were unticked though cd.yml
shipped in 1.0.32; phase 7's crm/mail item described an examples/ move
that never happened (they became web10-social sub-apps, 1.0.30); the
conductor board was a day stale; lane C ownership still claimed the
deleted media/ dir. CLAUDE.md refreshed: api described by its 1.0.31
layered layout (models/services/endpoints), auth2 -> ui rename and
crm/mail integration reflected. drift guard added to ci: changelog.yml
gains a board-sync step — errors when the newest CHANGELOG version
isn't strictly greater than every existing entry (duplicate 1.0.30s
prompted this), warns when CHANGELOG.md changes without a plan.txt /
parallel execution.txt tick in the same pr.

1.0.34 || 17.07.2026
Created marketing/ umbrella folder and moved marketing-api/, marketing-ui/,
web10-cli/, and web10-social/ into it. These four projects share a purpose:
making web10 accessible (marketing site, import pipeline, CLI tool, social
lens app). Updated all path references: js-ci.yml workflow paths + package,
marketing-api validation.py schema path, CLAUDE.md directory listing,
decisions.md D12, plan.txt phase 2.5/7/8 references, parallel execution.txt
lane D ownership. Top-level tree now: api, ui, marketing, sdk, mobile.

1.0.33 || 17.07.2026
Consolidated rtc/ into api/rtc/ (WebRTC signaling is a backend service,
not a top-level dir) and docs/ into marketing-ui/public/docs/ (dev docs
belong on the marketing site, not as a standalone dir). Updated all
references: docker-compose.yml, web10.app.yml, web10.dev.yml, CI workflows
(docker.yml, js-ci.yml, cd.yml), marketing-api validation.py schema path,
CLAUDE.md directory listing. Top-level tree is now clean: api, ui,
marketing-ui, marketing-api, sdk, mobile, web10-social, web10-cli.

1.0.32 || 17.07.2026
ci/cd: implemented the github actions pipeline (wave 0 skeleton). seven
workflow files: api.yml (uv sync, ruff check+format, pytest, path-filtered
on api/**), media.yml (same for media/**), js.yml (reusable: bun install,
tsc, vitest, build — continue-on-error for visibility-first), js-ci.yml
(calls js.yml per package for ui/sdk/web10-social/exporters/rtc),
docker.yml (buildx matrix for all 9 Dockerfiles, gha layer cache,
linux/amd64), changelog.yml (flags PRs that touch code without updating
CHANGELOG.md, skippable with label), cd.yml (ghcr.io multi-arch push
on merge to main, npm publish with provenance on tags, release notes
from CHANGELOG). replaced stale github-packages.yml and npm.yml.
all checks report pass/fail — no branch protection yet (visibility
first, gatekeeping is a deliberate later flip).

1.0.31 || 17.07.2026
Restructured api/ into a clean layered layout: models/ (Pydantic schemas),
services/ (business logic — auth, mongo, media, stripe, twilio, records),
endpoints/ (routers — auth, crud, media, payments, system). main.py is now
just app init + middleware + router includes. Test suite expanded from 118
to 205 tests: added media models, media services, mongo CRUD + media helpers,
stripe pure logic, twilio pure logic, auth service gaps (authenticate_user,
certify_with_remote_provider, check_admin, password hash/verify).

1.0.30 || 17.07.2026
Merged media service into api/ as a single FastAPI router. The standalone
media/ service (port 6001, media.localhost) is gone — media routes now
live at api/ (port 6000) under the same app, auth, and CORS config.
api/app/media.py carries the router; models, mongo helpers, S3 settings,
and boto3 are consolidated into api/. docker-compose.yml no longer
spins up the media container; minio stays on the all-spark-proxy network
for the api to reach directly.

Removed chrome-extension/: browser extension was too high a friction
bar for mainstream adoption. it was fully isolated — zero external
references, no CI/CD, no backend integration, no docs mentions.

marketing-api: new FastAPI service — ZIP import pipeline (server-side
streaming parse, validate, dedup, batch write to user's node), analytics
endpoints (pageview tracking, funnel events). Exporter UI moved from
exporters/ into marketing-ui/ (now talks to marketing-api via job polling
instead of browser-side ZIP parsing). Instagram/Facebook/YouTube mappers
ported to Python. Legacy home/ and exporters/ dirs deleted, home service
removed from docker-compose.yml.

1.0.30 || 17.07.2026
web10-social: CRM and Mail integrated as sub-apps in the social super
app. CRM (Rolodex) has contact CRUD, color-coded priority, per-contact
notes, search, and color filtering. Mail has compose, inbox, send/receive
via the mail web10 service. Both use the existing wapi adapter with new
crm-contacts, crm-notes, and mail service registrations. 35 new vitest
tests (20 CRM, 15 Mail). Old standalone crm/ and mail/ folders removed.
Shared mock factory (mockAppInterface.ts) created for all test files.

1.0.30 || 17.07.2026
marketing-ui: new project — consolidated home/ + docs/ + App Store into
one marketing site (Vite + React 19 + TS + Bun + react-router). Home page
rebuilt from home/index.html (hero, features, stats, team, footer). Docs
page renders docs/ markdown via remark. App Store moved from ui/ to
marketing-ui/ (public-facing app discovery belongs on the marketing site,
not inside the node's auth UI). ui/ default mode changed from "appstore"
to "contracts"; AppStore component, appListingInterface, mockAppData, and
related state removed from ui/.

1.0.28 || 17.07.2026
plan: specced the github actions ci/cd pipeline in full (new
"CROSS-CUTTING — ci/cd" section in plan.txt). ci: path-filtered
monorepo jobs (api: uv+ruff+pytest; js: reusable bun+tsc+vitest+
build workflow per package; docker buildx with layer cache),
visibility-first: checks report pass/fail but do NOT block merging
— branch protection is a deliberate later flip once suites earn
trust (I1-I5 checks graduate to required first). changelog-check
job (prs touching code should touch CHANGELOG.md), fork-safe (no
secrets, mocked stripe/twilio), permission/conformance suites join
the pipeline when they land. cd: ghcr.io multi-arch images on merge + the
web10/node image on tags, npm publish (sdk, create-web10) with
provenance on tags, release notes generated from CHANGELOG entries.
skeleton is landable today against the 1.0.21 unit tests — it does
not wait for the endpoint suite. wave 0 in parallel execution.txt
now points at the spec; workflow ownership follows lane ownership.

1.0.27 || 17.07.2026
plan: added phase 6.5 — the dev on-ramp (create-web10). a scaffolder
published under the npm create-* convention (npm/pnpm/yarn/bun create
web10, npx create-web10 — one package covers every runner), with a
5-minute time-to-first-record acceptance bar, vanilla-ts + react
templates on the phase 6 sdk, a node story (sandbox node default,
local docker, or any --node url), ci that scaffolds+builds templates
so they can't rot, and an explicit no-persistent-cli-yet scope guard.
queued as C3.5 in parallel execution.txt, sequenced after C2 (sdk).

1.0.29 || 16.07.2026
plan: added phase 2.5 — the ui makeover. retire the homemade
rectangles-npm framework from every ui (ui/, web10-social/), replace
with a mainstream stack (tailwind + shadcn/ui as default candidate),
plus a story-first product design pass (shared design tokens,
narrative screens, the M0 demo as the acceptance bar). queued as
B2.5 (ui/) and D2.5 (web10-social) in parallel execution.txt; B2.5
sequenced before B3/B4 so wizard + admin panel are built on the new
stack.

1.0.27 || 16.07.2026
Lane D5 — multi-platform social import engine (Instagram, Facebook, YouTube):
  - exporters/src/: full implementation — zip parsing (@zip.js/zip.js),
    platform detection, schema mapping, AJV validation, wapi batch writer,
    import engine orchestration (parse -> map -> validate -> write)
  - Instagram mapping: posts (text, media, comments, tags, mentions,
    location), profile, follows/contacts from Meta takeout JSON
  - Facebook mapping: posts (text, privacy, location, attachments),
    photos (dimensions, description, privacy), friends list, comments
  - YouTube mapping: videos (title, description, duration, stats,
    thumbnails, privacy), comments (threaded replies), channel profile
  - React UI: platform selector cards, per-platform guided takeout
    checklists (6 steps each), drag-and-drop ZIP upload, live progress
    bar, per-service write summary table, error details
  - 57 tests (15 Instagram, 18 Facebook, 14 YouTube, 10 validation)
  - Vite + Bun + React 19 + TypeScript, multi-stage Dockerfile

1.0.28 || 16.07.2026
web10-social: full TypeScript + Vite + Bun modernization (Lane D):
  - migrated from CRA 5 (react-scripts) to Vite 6 + bun + TypeScript
  - React 18 -> 19, removed dead deps (install, npm, react-router-dom,
    react-usestateref, web-vitals, react-scripts, axios)
  - all 21 components, 5 interfaces, 8 mocks converted to .ts/.tsx with
    full type definitions (AppInterface, Post, Message, Contact, etc.)
  - eliminated giant mutable I={} anti-pattern — proper React hooks with
    typed return objects
  - fixed: Math.random(1e15) no-op, var declarations, loose equality,
    index-based keys, stale closures, defaultValue on controlled inputs,
    broken typing-indicator ternary, dead mock-data in real interface
  - removed vendored Bulma (~100 files), uses ChatScope styles
  - vitest suite: 137 tests across 12 files

1.0.27 || 16.07.2026
mobile/encryptor: complete rebuild — foundation, wallet/keyring, UI, and tests.
Expo 44->52, React 17->18, React Native 0.64->0.76, bun package manager.
crypto.js: pure ESM crypto core (no Expo deps) — HKDF-SHA256 derivation,
ed25519/x25519 keypairs, xchacha20-poly1305 encrypt/decrypt, grant wrap/unwrap,
device cert create/verify. wallet.js: SecureStore-backed persistence layer
wrapping crypto.js. React Navigation v6 tab-based UI: SetupScreen, WalletScreen,
KeysScreen, GrantsScreen, SettingsScreen. 55 bun tests across 8 files covering
helpers, key derivation, keyring verbs, signing, encryption, grants, device
certs, lifecycle — all green. Deleted obsolete encryptor.js and CodeInput.js.

1.0.26 || 16.07.2026
Phase 2 completion — auth2 parity, rename to ui, delete legacy auth/:
  - auth2 -> ui/: full rename, docker-compose updated (auth2 context -> ui,
    legacy auth/ service + volumes removed)
  - Interface.tsx: complete API integration — wapi/wapiAuth wired from
    authAdapter, setStatus for status messages, SMR listening via
    initAuthenticator, servicesLoad to load services from API, changeTerms
    to persist service updates via wapi.update, submitSIR for new service
    creation, purgeSMR for request denial, sendToken for OAuth flow,
    deleteService/wipeServiceData for destructive operations, sendCode/
    verifyCode for phone verification, changePassword, changePhoneNumber,
    getPlan for live subscription display, Stripe redirect methods
    (manageSpace, manageCredits, manageSubscriptions), DevPay methods
    (manageBusiness, businessLogin)
  - OAuth flow: OAuthBanner component in App.tsx detects referrer, shows
    pending SMRs, auto-sends token on login when no requests pending
  - RequestPage: full rewrite — renders pending SIRs/SCRs from I.SMR,
    Approve/Deny buttons wired to I.submitSIR/I.purgeSMR
  - ContractViewer: delete terms and wipe data with confirmation dialogs
    (previously [TBD] placeholders calling non-existent methods)
  - Subscription: live plan data from I.getPlan() replacing hardcoded values
  - VerifyPhone: sendCode/verifyCode wired to wapiAuth, code state tracking
  - ChangePhone: wired to I.changePhoneNumber(password, phone)
  - ChangePassword: wired to I.changePassword(current, new, retype)
  - DevPay: wired to I.manageBusiness() and I.businessLogin()
  - Form inputs (Phone, ConfirmationPass, NewPassword, ReTypeNewPass):
    accept value/onChange props for controlled usage in Settings
  - MockInterface: full parity with Interface shape (all new methods stubbed)
  - Tests: 44/44 passing (updated login/signup mode assertions: appstore ->
    contracts, the authenticator's post-login default)
  - auth/: deleted (legacy CRA React 16 app, superseded by ui/)
1.0.25 || 16.07.2026
Phase 5 media service (greenfield, Lane C):
  - media/: new FastAPI service with presigned S3 upload URLs, short-lived
    presigned read URLs (60s expiry, per-read issuance, logged per D14),
    metadata record creation in user's collection (ordinary {service:"media",
    body} per D13), and media record listing/deletion
  - Auth mirrors api's is_permitted/certify logic against the "media" service;
    terms/ACLs are the single source of permission truth with zero new concepts
  - S3 config supports any S3-compatible backend (MinIO self-hosted, R2, B2,
    Wasabi) via env vars; MinIO added to docker-compose on a dedicated
    media-network
  - pyproject.toml (uv, python 3.12, boto3), Dockerfile, models.py (upload,
    read, metadata schemas), settings.py, mongo.py (terms lookup, CRUD),
    auth.py (token verify, is_permitted), main.py (5 endpoints)
  - docker-compose: media service (port 6001, media.localhost) + minio
    (port 9000, console 9001) with minio-data volume

1.0.24 || 16.07.2026
agent task-status hygiene (agents were re-attempting merged work):
  - parallel execution.txt: lane queues now carry live status markers —
    [✓ x.y.z] merged (A1, B1, D1 ticked with their changelog versions),
    [~] in flight (C1, D3), [ ] open; wave 0 marked PARTIAL (unit layer
    landed in 1.0.21, endpoint permission-matrix suite + CI still owed);
    rule 3 extended: tick your lane item in this file on merge; stale
    "suggested first board" replaced with a dated current board
  - added AGENTS.md: orientation entry point for non-Claude agents
    (codex/qwen read AGENTS.md, not CLAUDE.md) — points to CLAUDE.md and
    states the check-before-you-start + tick-on-finish rules; QWEN.md
    pointer added too (Qwen Code's default context file)
  - added .conductor/settings.toml with a repo-wide general prompt
    reminding conductor agents to check done-status before starting
  - CLAUDE.md: new "check it isn't already done" convention; changelog
    convention now includes ticking the parallel execution.txt lane

1.0.23 || 16.07.2026
plan: phase 11 gains "the keyring api" — the record-model discipline applied
to keys: user-named keys (audience = any string, like a service name), cheap
one-call minting (hkdf from the master seed), principals are pubkeys not
usernames, wrap targets are pubkeys OR other named keys (membership, nested
circles, and backup become the same verb), a small closed verb set with
revoke as a composition, {v, suite} version ids on every wire format, a
no-policy-in-keys scope guard, and a futureproof checklist that gates the
design review (person / circle / circle-of-circles / single record / whole
service / llm agent on timed grant / device / hls stream / multi-admin
group / node migration).
decisions: D18 — keyring is generic like the record model; named keys +
closed verb set; node grows zero key-specific endpoints.
glossary: keyring.

1.0.22 || 16.07.2026
plan: phase 11 (e2e encryption) fleshed out from sketch to full design —
phone-as-wallet key hierarchy (one master seed, HKDF-derived identity +
per-service keys, key manifest record), WhatsApp-Desktop device linking over
P2P WebRTC (companions encrypt/decrypt alone, traffic never proxies through
the phone), envelope encryption with audience keys + epochs, layered
revocation (node gating instant / epoch rotation forward / optional
re-encrypt), node-enforced timed grants, media double door (presigned URL +
key), backup/recovery via trust splitting, honest operator-metadata section.
also flags rtc's unsigned-decode + trust-a-200 check as the I1 bug in
miniature (gets the JWKS fix before carrying keys).
decisions: D15 (multi-device: phone is root, linked companions, no
phone-proxying), D16 (revocation layered: node gating + epoch rotation;
timed access is the node's clock, not magic keys), D17 (crypto suite pinned
to standards — X25519/Ed25519, HPKE, XChaCha20-Poly1305, Argon2id, MLS as
graduation path; no web3, no invented crypto).
glossary: wallet, device linking / device cert, audience key / epoch, grant,
key manifest, live handout.

1.0.21 || 16.07.2026
unit test infrastructure:
  - api: added pytest suite (118 tests) covering mongo.py transformations
    (q_t, u_t, to_gui, to_db, star_found, get_approved, is_in_cross_origins),
    main.py auth logic (kosher, can_mint, certify, decode_token, is_permitted),
    models.py pydantic schemas, and web10records.py factories
  - auth2: added vitest + @testing-library suite (config, contractInterface,
    mockInterface, mocks) with jsdom environment and setup file
  - sdk: added vitest suite (48 tests) covering wapiInit (token management,
    CRUD guards & HTTP calls, peerID, authListen, SMR, P2P init, dev pay)
    and wapiAuthInit (login, signup, changePass/Phone, send/verify code,
    Stripe mgmt endpoints, SMRListen, sendToken, mintOAuthToken)
  - review fixes: gitignored api/*.egg-info build artifacts, removed a
    broken/unused conftest fixture and an ineffective import.meta stub,
    tightened a tautological is_permitted assertion, moved
    @testing-library/dom to auth2 devDependencies
  - scope note: this is the UNIT layer only (mocked DB, no HTTP).
    outstanding endpoint-level tests (FastAPI routes, star protection,
    metering, twilio/stripe) are itemized in plan.txt "testing:"

1.0.20 || 16.07.2026
D1 docs: apply review fixes to protocol-spec.md — cross-origin bypass is on
username=="anon" (not site); _id is intentionally queryable (only service is
protected); token-to-token minting checks the submission token's site; array
pull requires a top-level PULL:true flag; reads/deletes on `services` are
unmetered; verify-phone error string matches the code exactly (trailing
period); planned aggregate endpoint is POST, not GET (GET can't carry a body).
D1 docs: protocol-vs-profile layering — conventions.md now opens with a scope
note (application profile, NOT protocol; nodes never enforce these schemas;
only `services` and `*` are reserved); `service` removed from all schemas in
docs/schemas/ and inline (the service name is the URL path, not a record
field, so real wire records now validate); new additive-only Versioning rule;
schemas validate exporter (P9) / killer-app (P8) output while the conformance
suite tests protocol-spec.md only; follows convention now names the terms
whitelist (not cross_origins) for cross-node inbox delivery; plan.txt D1 and
phase-8 wording aligned ("real interop work").

1.0.19 || 16.07.2026
plan: new LATER item — schema contracts: opt-in, per-service schema enforcement
via a "schema" field on the service's terms record. Node stays generic (runs
whatever schema it's handed, like whatever ACL it's handed); no contract means
no validation. Notes the open design questions (partial updates, grandfathered
records, additive-only evolution) and flags it as a candidate to promote into
phase 6 alongside the update-widening work.

1.0.18 || 16.07.2026
D1 docs: protocol spec (docs/protocol-spec.md) — full specification of the web10
protocol derived from the codebase: data model (user collections, {service, body}
envelope, field prefixing), authentication (token format, minting, certification,
is_permitted authorization, federation migration plan), CRUD API (create/read/
update/delete with pagination, star protection), metering, error responses,
security invariants (I1-I5), and the planned aggregate endpoint (sandbox,
allowlist, denylist, resource caps).
D1 docs: social conventions doc (docs/conventions.md) + JSON schemas
(docs/schemas/*.json) — standard service schemas for all social apps and
exporters: posts, media, contacts, follows, comments, reactions, profile, inbox,
and lens. Each schema is versioned, loosely-typed (additionalProperties: true),
and includes origin/origin_id fields for imported content coexistence. The
conformance suite and exporters will validate against these files.

1.0.17 || 16.07.2026
decisions: D13 — media fits the record abstraction: "service" stays the data
namespace, no /{user}/{service}/{collection} restructure; media metadata is an
ordinary {service:"media", body} record so terms/ACLs apply unchanged.
decisions: D14 — media reads via per-request presigned URLs (30-60s expiry,
issuance logged); check-at-issue-time gap consciously accepted, API-proxy and
per-request auth-proxy alternatives rejected (proxy remains a later
tightening option, not a redesign).
plan: phase 5 read-url and metadata items tightened to carry the D13/D14
specifics (per-read issuance, expiry window, logging, record shape).

1.0.16 || 16.07.2026
plan: CROSS-CUTTING docs gains the missing explanation quadrant — "for
everyone" block ahead of the guides: "what is web10" concept pages (mental
model: node, record, tokens+terms, lens, federation), per-audience why pages
(user / creator-influencer / dev / operator, productizing pitch.txt's
vs-crypto and vs-cloud arguments), and how-it-works diagrams as code
(mermaid over plantuml — starlight/docusaurus render it natively). unlike
guides these aren't milestone-gated: the architecture exists, so they're
writable now and double as the marketing site's core copy.

1.0.15 || 16.07.2026
docs: fix D1 consumer list in parallel execution.txt — (C4, D3, D4) → (C4, D4, D5),
matching the sequencing rule "D1 before C4/D4-schemas/D5" (D3 mobile encryptor
has no D1 dependency)
plan: new CROSS-CUTTING docs section — three doc surfaces, three homes:
generated OpenAPI reference ships with the api (invest in annotations, optional
Scalar UI), protocol spec + conventions live in-repo as versioned markdown +
JSON Schema (conformance suite tests against them), docs/ becomes an MkDocs
Material site (embeds OpenAPI, mkdocstrings, sdk typedoc; no hosted SaaS docs)
plan: phase 7 — home/ + docs/ -> marketing-ui/: inc's website + dev docs as ONE
site (docs are part of a saas marketing site), rebuilt on the ui toolchain
(vite + react + bun), own vhost, never in the node compose; stays in the
monorepo by choice (one dev, lean). repo reads api / ui / marketing-ui.
docs site framework lean updated accordingly: js-native (starlight or
docusaurus) instead of mkdocs, since it lives inside marketing-ui.
decisions.md: new D12 recording the api / ui / marketing-ui repo trio.
plan: docs section simplified — split by audience not tool; adds the missing
user/creator guides (they ARE the saas marketing content, written per
milestone as features ship); dev docs = D1 spec + generated references

1.0.14 || 16.07.2026
phase 0 completion — RTC modernization + docker image rebuild + cleanup:
  - rtc service: node:15 → bun, index.js → index.ts with types, npm → bun,
    added tsconfig.json, updated package.json (web10-rtc, ESM, typescript)
  - auth2/Dockerfile: new multi-stage Dockerfile (bun dev target + static deploy)
  - auth/Dockerfile: node:14 → bun (legacy UI, deprecated in phase 2)
  - api/Dockerfile: already modern (uv, python3.12) — no change needed
  - docker-compose.yml: pipenv → uv, npm → bun, nodemon → bun run dev,
    added "ui" service (auth2), legacy auth shifted to port 3001,
    removed version: "3" (deprecated), renamed rtc volume

  - removed docker-compose-lite.yml, docker-compose-nginx.yml, custom.conf
    (one compose file is enough, people can figure out deployment)
  - removed web10-deploy/ (stale GCP configs, skaffold k8s manifests)

1.0.13 || 14.07.2026
phase 0 typescript migration:
  - renamed all 34 .jsx files to .tsx (React) or .ts (non-React)
  - added global.d.ts for Window.I augmentation
  - fixed dynamic object pattern with Record<string, any> type assertions
  - fixed document.getElementById casts to HTMLInputElement
  - fixed .toFixed().toLocaleString() type error
  - updated index.html entry point to main.tsx

1.0.12 || 14.07.2026
phase 0 auth2 toolchain modernization:
  - migrated auth2 from create-react-app to vite 6 + bun (index.html entry,
    src/main.jsx, vite.config.js, bun.lock; removed react-scripts + package-lock.json)
  - react 18 -> 19; renamed all components .js -> .jsx; vitest replaces jest
  - removed react-inject-env + web-vitals; package renamed auth2 -> web10-ui
  - gitignored auth2/dist/ build output

1.0.11 || 14.07.2026
phase 0 python toolchain modernization:
  - switch to uv for package management (pyproject.toml, uv.lock, removed Pipfile + requirements.txt)
  - python 3.12, fastapi 0.139, pydantic v2, PyJWT 2.13, stripe 15, twilio 9, gunicorn 26, uvicorn 0.51
  - pydantic v2 migration: .dict() -> .model_dump(), Optional[X] -> X | None, ConfigDict(extra="allow") on Token model
  - removed infisical dependency (pyinfisical.py, settings.py integration) — env vars only for secrets
  - pruned dead deps: python-ldap, python-gnupg, systematic, future, secrets (pypi)
  - Dockerfile: slim python3.12 image with uv (no pipenv, no nodejs base, no apt libsasl/libldap)
  - added ruff for lint+format (pyproject.toml config, legacy style issues excluded for now)

1.0.10 || 14.07.2026
added plan.txt : phased roadmap (0-12) — toolchain modernization, documentdb/
  ferretdb switch, unified ui + setup wizard, creator admin panel + analytics,
  media/s3 layer, wapi.js + aggregate verb + mcp, killer social app (first-party,
  in-repo) + the lens chatbox, social exporters, user backups, e2e encryption,
  trust & safety. plus cross-cutting quality/testing/security and milestones M0-M3.
added parallel execution.txt : 4-lane plan for running Conductor workspaces in
  parallel without merge conflicts (lane ownership + wave-0 test seatbelt).
added CLAUDE.md, GLOSSARY.md, decisions.md : agent onboarding + shared context.
documented a CONFIRMED federation security bug : providers don't cryptographically
  validate each other (HS256 symmetric signing) — fix is HS256 -> RS256/EdDSA + JWKS.
established five end-to-end security invariants (I1-I5) enforced by the test suite.

1.0.9
added infisical secrets management.
added pipenv for api python package management.
made the settings.py file have defaults.
made configs managed by .env file.
made CORS_SERVICE_MANAGERS from list to comma sep. strings.
made COST dict env var type multiple env vars.
some use case presentations in the sdk folder.

1.0.8 || 11.10.2023
Made the CHANGELOG
Any time there is an improvement / change to the project, that improvement /
change will go here
1.0.8 is the most recent release!
I don't even remember what I improved from 1.0.7.
That is the exact reason why it is beneficial to have a changelog.
