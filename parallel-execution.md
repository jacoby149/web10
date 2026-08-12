# Parallel Execution

Companion to `plan.md`. That file says **what** and **why**; this file
says what can happen **at the same time**.

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

### Lane: KB Diagrams (Phase 0)
**Owns:** `knowledge/knowledge-base/web10-v3/`

- [✓ 3.0.1] SDK api.md — request flow + group operations sequence
- [✓ 3.0.1] DB clickhouse.md — ER diagram + data flow
- [✓ 3.0.1] Groups overview.md — two-contract diagram + group architecture
- [✓ 3.0.1] Social overview.md — social app architecture
- [✓ 3.0.1] Encryption auth.md — auth flow sequence
- [✓ 3.0.1] FAQ oltp-to-olap-patterns.md — OLTP vs OLAP architecture

### Lane: Docs (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/`

- [✓ 3.0.9] Docs audit
- [✓ 3.0.9] Protocol overview
- [✓ 3.0.9] SDK docs
- [ ] Developer quickstart
- [✓ 3.0.9] Conventions & schemas
- [✓ 3.0.9] Discovery & groups
- [ ] Screenshot test pass

### Lane: SDK (Phase 2)
**Owns:** `sdk/`

- [✓ 3.0.7] SDK API surface (CRUD, groups, `$sort`, `$match`, `$query`)
- [ ] ClickHouse SQL implementation
- [ ] Service contracts

### Lane: DB (Phase 2)
**Owns:** ClickHouse setup, migrations

- [✓ 3.0.2] ClickHouse schema & tables
- [✓ 3.0.12] Bug reports table and endpoints
- [ ] Indexes & patterns

### Lane: Groups (Phase 2)
**Owns:** Groups primitive

- [ ] Groups overview (policy containers, roles, join policies)
- [ ] Group identity (profiles, URLs, service-scoped roles)

### Lane: Social (Phase 2)
**Owns:** `marketing/web10-social/`

- [✓ 3.0.13] Bug report button hooked up — screenshots, paste-to-attach
- [ ] 11 screens per `web10-social-v3/` docs
- [ ] CRUD + groups + refs only

### Lane: Media (Phase 2)
**Owns:** Media pipeline

- [✓ 3.0.11] Transcoding foundation KB — `media/transcoding-foundation.md`: `transcoding_settings` on `minio` type — variants array, thumbnails, v3 `enabled: false`, v4 adaptive bitrate
- [ ] MinIO integration
- [ ] Streaming

### Lane: Apps Rebuild (Phase 3)
**Owns:** `ui/`, `marketing/web10-social/`, demo apps

- [✓ 3.0.15] Marketing API v3 — /v3 prefix, section routers, pay + affiliate, Everything page
- [✓ 3.0.14] API v2 cleanup — strip 34 v2 endpoints, add v3 app store admin + media pipeline
- [✓ 3.0.7] Authenticator v3
- [✓ 3.0.9] Auth UI v2→v3 contracts — contracts page shows v3 app contracts, consent v3-only, dead v2 components deleted
- [✓ 3.0.10] SMR/SIR/SCR → ACR/GCR — unified contract request model, no new/change distinction, SDK + KB + UI + tests
- [ ] Social app v3
- [✓ 3.0.7] Demo apps v3
- [✓ 3.0.20] Demo test suite — headless Playwright, 18 tests (hello 3, notes 7, messages 8), mock SDK + fetch override
- [✓ 3.0.32] Groups demo GCR flow — groups demo no longer creates/edits groups directly via API; opens auth UI popup, sends GCR, user approves, auth UI creates group. Auth UI sends contract_response back to app, handles create_group and update_group actions.
