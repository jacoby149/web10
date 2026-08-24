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

- [ ] **Messages** (`messages/`) — DM group contract (invite_only, deterministic ID) + WebRTC P2P. Send/receive via CRUD and via data channel. E2E.
- [✓] **Groups** (`groups/`) — group management: create, roles, join policies (open/request/invite_only), invite, join, leave, approve/deny. E2E.
- [✓] **Media** (`media/`) — MinIO upload, `minio` type in document body, presigned URL on read, display. E2E.
- [ ] **Comments** (`comments/`) — refs: comment on a post via `ref`, reply to comment via `parent_ref` (threading), read the thread. E2E.
- [✓] **Feed** (`feed/`) — discover group + followers groups, multi-group read. Post to discover, follow creators, read combined feed. E2E.
- [✓] **Sharing** (`sharing/`) — block sharing per group, user-wide + per-group blacklists. E2E.

**Authenticator consent forks (the shared seam every demo drives):**

- [✓] **Approve-all fork** — drive "Approve all & continue" through the real popup (was untested; carried a real bug — the app-contract response was dropped, so the opener's callback fired late). Fixed via a shared `approveOne` helper.
- [✓] **Full fork audit** — every remaining fork driven through the real popup (deny app / deny group / skip / all-set / logout / details diff / mixed / edge / fix-access), plus the core-core authenticator torture test (signup, login, state rule, config wizard, security-model anti-tests) — `e2e/tests/authenticator-torture.spec.ts` (36 tests). Caught 8 real bugs (wizard POSTed config to the status endpoint; v2 Mongo admin that can't log in; dead "already configured" guard; empty passwords accepted; wizard Storage→Welcome off-by-one; `I.wapi` never assigned so the desktop logout menu never rendered; wizard swallowed configure errors; fix-access e2e seam violation). All fixed. The `auth-consent-forks` lane is complete.

## Phase 2 — HLS: The Video Spine

**Where:** `api/app/v3/` (media endpoints + worker), `marketing/web10-social/` (player)

HLS is v3 (D44) — "the one feature that makes this legit legit youtube vs
bs." Adaptive bitrate is user-visible at every scale; P2P delivery is a
bandwidth-economics play that only pays off at M2+ concurrent-viewer scale
(and ships a security surface we don't need yet) — it stays v4. The KB is
the spec: `knowledge/knowledge-base/web10-v3/media/`.

- [ ] **Transcode worker** (`api/app/v3/endpoints/media.py`, `api/app/services/media.py`) — video upload → in-process ffmpeg worker (dedicated thread, bounded concurrency) → 360p/720p/1080p HLS renditions + master manifest + thumbnails → MinIO → document updated with `transcoding_settings`.
- [ ] **Signed segments** (`api/app/v3/endpoints/media.py`) — API synthesizes the master manifest from `transcoding_settings.variants`; JWT sig on manifest + every segment (10-min TTL); middleware on video paths only; expiry → manifest re-fetch → group membership re-check.
- [ ] **Player** (`marketing/web10-social/`) — hls.js (Safari native fallback) reading `transcoding_settings` from the document; progressive range-request fallback for non-transcoded files.
- [ ] **E2E** (`e2e/tests/hls.spec.ts`) — upload small video → transcode completes → manifest + segments 200 with token; 403 without token / expired token (anti-tests).
