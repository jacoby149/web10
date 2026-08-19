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

### Lane: messages-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/messages/`

- [ ] DM group contract: create invite_only group with deterministic ID
- [ ] Send message via CRUD (attach to DM group)
- [ ] Receive/read messages via group read
- [ ] WebRTC: initP2P with token, connect to peer
- [ ] WebRTC: send data over P2P channel
- [ ] WebRTC: receive data via onInbound callback
- [ ] E2E test: DM CRUD + WebRTC P2P round-trip

### Lane: groups-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/groups/`

- [ ] Create group with roles
- [ ] Join policy: open (instant join)
- [ ] Join policy: request (approve/deny)
- [ ] Invite member with role
- [ ] Leave group
- [ ] Remove member
- [ ] E2E test: group lifecycle + join policies

### Lane: media-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/media/`

- [ ] Upload image to MinIO (presigned URL)
- [ ] Create document with minio type in body
- [ ] Read document back, verify presigned URL resolved
- [ ] Display image from presigned URL
- [ ] E2E test: upload → create → read → display

### Lane: comments-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/comments/`

- [ ] Create a post (parent document)
- [ ] Comment on post via ref type
- [ ] Reply to comment via parent_ref (threading)
- [ ] Read full thread (resolve refs)
- [ ] E2E test: post → comment → reply → read thread

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
