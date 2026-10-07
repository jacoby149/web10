# Audit Surface — Lines of Code

> Historical measurement (05.10.2026), not recounted after the concurrent
> security changes. LOC is a scoping aid, not security coverage. Current
> findings and independently executed focused tests are in the
> [ledger](../../knowledge-base/web10-v3/security/findings.md); the old
> conformance skeleton is not blanket invariant evidence.

How much code is in scope for the security audit, and where the weight is.
Measured with `wc -l` over `.py` (api) / `.ts` source (sdk), excluding
`__pycache__` / `node_modules`. Dated 05.10.2026.

## The API (`api/`) — 26,860 LOC, 95 files

| Layer | LOC |
|---|---|
| **Production (non-test)** | **12,902** |
| — `api/app/v3/` (the live surface) | 9,727 |
| — legacy v2 `app/endpoints` + `services` + `models` | 1,908 |
| — `main.py` / `middleware.py` / `settings.py` / `exceptions.py` / `docs.py` | 676 |
| — `tools/` (migrations, audits) | 591 |
| Tests (`api/tests/`) | 13,958 |

### The v3 live surface (9,727) — where the audit weight is

| Sub-layer | LOC | What's in it |
|---|---|---|
| `services/` | 6,264 | **`clickhouse.py` 4,610** (I3 read gate + all SQL), `import_worker.py` 763, **`safe_query.py` 535** (query-engine boundary), `bugbot.py` 185, `moderation.py` 107, `thumbnail.py` 64 |
| `endpoints/` | 2,705 | `groups.py` 586, `documents.py` 328, `query.py` 270, `media.py` 262, `recovery.py` 193, `access.py` 145, `imports.py` 136, `preview.py` 109, `moderation.py` 99, `appstore.py` 96, `account.py` 95, `contracts.py` 81, `logs.py` 71, `auth.py` 70, `auth_helper.py` 30, `users.py` 25, `blocking.py` 23 |
| `models/` | 758 | Pydantic schemas (all small) |

### The security-critical core — ~5,600 LOC

The part that needs line-by-line scrutiny, not the whole 13k:

| File | LOC | Why it's in the core |
|---|---|---|
| `v3/services/clickhouse.py` | 4,610 | I3 read gate (`can_read_group`/`effective_role_perms`), every SQL read/write, the D58 effective-role model |
| `v3/services/safe_query.py` | 535 | the I3 wall for caller-written SQL (the query-engine boundary) |
| `v3/endpoints/` (auth-bearing) | ~1,200 | `documents`, `query`, `groups`, `media`, `access`, `auth`, `auth_helper` — where tokens become principals |
| `services/auth.py` | 118 | **the I1/I2 core** — `decode_token`, `certify`, `check_admin` |
| `middleware.py` | 143 | logs request/response bodies (finding B-4) |
| `main.py` | 176 | CORS + exception handlers (B-5, error disclosure) |
| `settings.py` | 125 | **secrets in source** (B-2) |

## The SDK (`sdk/`) — 2,400 LOC source, 8 files

All of it is the client trust surface. (Shipped `dist/` bundle: 2,620 LOC.)

| File | LOC | Role |
|---|---|---|
| `v3.ts` | 1,589 | the client — token-in-body transport, all CRUD/query calls |
| `browser.ts` | 314 | popup auth, **postMessage** (finding S-1) |
| `rtc/index.ts` | 227 | WebRTC data channels |
| `token.ts` | 94 | **cookie + JWT decode** (S-4, S-5) |
| `http.ts` | 103 | fetch transport (the `authGet` no-token path, S-3) |
| `index.ts` | 62 | exports |
| `types.ts` | 11 | types |

## Bottom line

- **~13k** production backend, **~2.4k** SDK.
- The part that actually needs line-by-line scrutiny is **~5.6k** — one big file
  (`clickhouse.py`, 4,610) plus a handful of small, high-leverage ones.
- It's small enough to audit line-by-line in a bounded number of passes — not a
  "we can't read it all" situation. The test suite (13,958 LOC) is the altitude
  that keeps the invariants pinned.
