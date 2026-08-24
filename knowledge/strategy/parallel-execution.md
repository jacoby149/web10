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
- [ ] WebRTC: initP2P with token, connect to peer
- [ ] WebRTC: send data over P2P channel
- [ ] WebRTC: receive data via onInbound callback
- [ ] E2E test: DM CRUD + WebRTC P2P round-trip (DM CRUD half done in 3.5.0; WebRTC P2P half open)

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

- [ ] Create/join discover group (open, auto-join)
- [ ] Post to discover group
- [ ] Create followers groups for 2-3 test users
- [ ] Follow creators (join followers groups)
- [ ] Read combined feed from discover + followers
- [ ] E2E test: post → follow → read combined feed

### Lane: sharing-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/sharing/`

- [ ] Create group, post to it
- [ ] Block sharing per group (toggle off)
- [ ] Verify posts hidden from members when sharing blocked
- [ ] Unblock sharing (toggle on), verify posts reappear
- [ ] User-wide blacklist: block a user
- [ ] Per-group blacklist: block a user from one group
- [ ] E2E test: share → block → verify hidden → unblock → verify visible

### Lane: retire-obsolete-e2e (Phase 1)
**Owns:** `e2e/tests/`

Pre-v3 e2e specs testing removed endpoints / ghost demo locations / broken
flows. Approach: **cut the broken bodies**; STUB (`test.skip` + comment) where
the feature still belongs in v3 (the stub documents the v3 intent + rewrite
path); DELETE where the feature is gone in v3. Coverage absorbed by the Phase
1 per-demo E2E lanes + `api/tests/test_v3_conformance.py` (I3 contract
enforcement).

**DELETED (whole spec — ghost location / removed endpoints):**
- [~] `demo-cr-flow.spec.ts` — ghost `sdk.localhost/demos/` location (demos moved to `marketing.localhost/docs/`) + old `/v3/documents/*` paths. Groups browser flows → `groups-demo` lane. (PR #648)
- [~] `consent-grant.spec.ts` — legacy `/signup` + removed `/certify`/`/posts`/`/services`. v3 consent → `auth-popup-roundtrip.spec.ts`. (PR #648)
- [~] `terms-revoke.spec.ts` — removed `/posts`/`/services`. v3 contract-revoke → `auth-popup-roundtrip.spec.ts`. (PR #648)

**GUTTED + STUBBED (feature belongs in v3 — rewrite later):**
- [~] `app-store.spec.ts` — "token handoff" (v2 `/certify` + `/{username}/posts`) → v3 app-contract + `/v3/create`. (PR #648)
- [~] `social-post-feed.spec.ts` — "signup+token+CRUD" (v2 `/certify`) + social render. (PR #648)
- [~] `studio-metering.spec.ts` — 3 metering tests (v2 star-record `credits_spent`) → v3 billing. "aggregate" DELETED (v2-only `/aggregate`, gone in ClickHouse). (PR #648)
- [~] `exporter.spec.ts` — marketing-api `/health` + `/import` pipeline (v2 node API). (PR #648)
- [~] `social-full.spec.ts` — posts/comments/reactions/DM (v2 `/{username}/*`) → v3 service-based CRUD + DM groups; social render. (PR #648)
- [~] `gauntlet.spec.ts` — 5 social-app render tests + 2 v3-API tests (join-approval, cross-user isolation I3) that were FAILING on correct v3 login → investigate (possible real bugs). (PR #648)

### Lane: hls (Phase 2)
**Owns:** `api/app/v3/endpoints/media.py`, `api/app/services/media.py`, `marketing/web10-social/` (player + upload flow), `e2e/tests/hls.spec.ts`

HLS is v3 (D44) — "the one feature that makes this legit legit youtube vs
bs." Upload → in-process ffmpeg worker (dedicated thread, NOT the FastAPI
request pool, bounded concurrency 1–2) → HLS renditions (360p/720p/1080p) +
master manifest + thumbnails → MinIO → signed manifest + JWT on every
segment (bifurcated auth) → hls.js playback (Safari native). The KB is
aligned and is the spec: `knowledge/knowledge-base/web10-v3/media/`
(`transcoding-foundation.md` = the model, `transcoding.md` = the pipeline,
`minio-auth-bifurcated.md` = the auth split, `streaming.md` = the layers).
P2P stays v4 — do not build it here.

- [ ] Transcode worker: video upload → ffmpeg (subprocess) → 360p/720p/1080p HLS renditions + master manifest + thumbnails → MinIO → document updated with `transcoding_settings` (enabled, variants, thumbnails)
- [ ] Signed manifest + segment serving: API synthesizes the master manifest from `transcoding_settings.variants` (document is the source of truth), JWT sig on manifest + every segment (10-min TTL), middleware validates on video paths only, token expiry → manifest re-fetch → group membership re-check
- [ ] hls.js player in web10-social (Safari native fallback), reads `transcoding_settings` from the document; progressive range-request fallback for non-transcoded files
- [ ] E2E: upload a small video → transcode completes → manifest + segments 200 with token; 403 without token / with expired token (anti-tests, I3)
