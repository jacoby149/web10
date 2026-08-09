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

### Lane: Docs (Phase 0)
**Owns:** `marketing/marketing-ui/public/docs/`

- [ ] Docs audit
- [ ] Protocol overview
- [ ] SDK docs
- [ ] Developer quickstart
- [ ] Conventions & schemas
- [ ] Discovery & groups
- [ ] Screenshot test pass

### Lane: SDK (Phase 1)
**Owns:** `sdk/`

- [ ] SDK API surface (CRUD, groups, `$sort`, `$match`, `$query`)
- [ ] ClickHouse SQL implementation
- [ ] Service contracts

### Lane: DB (Phase 1)
**Owns:** ClickHouse setup, migrations

- [ ] ClickHouse schema & tables
- [ ] Indexes & patterns

### Lane: Groups (Phase 1)
**Owns:** Groups primitive

- [ ] Groups overview (policy containers, roles, join policies)
- [ ] Group identity (profiles, URLs, service-scoped roles)

### Lane: Social (Phase 1)
**Owns:** `marketing/web10-social/`

- [ ] 11 screens per `web10-social-v3/` docs
- [ ] CRUD + groups + refs only

### Lane: Media (Phase 1)
**Owns:** Media pipeline

- [ ] MinIO integration
- [ ] Transcoding
- [ ] Streaming

### Lane: Apps Rebuild (Phase 2)
**Owns:** `ui/`, `marketing/web10-social/`, demo apps

- [ ] Authenticator v3
- [ ] Social app v3
- [ ] Demo apps v3
