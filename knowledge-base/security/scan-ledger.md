# Scan Ledger — web10 coverage record

The altitude. One row per **(unit, level)**. This is the coverage record — the
thing you point at to prove forward progress. Format, status, and staleness rules
live in the cartridge: [`ai-pack/ai-security-theory/the-ledger/`](../../ai-pack/ai-security-theory/the-ledger/README.md).

> **Status key:** `PASS` = no open backlog for this unit at this level (everything
> found is fixed or deferred to a `BP-n`). `OPEN` = scanned, has unfixed/undeferred
> findings (live scan debt). `STALE` = last check relatively old, re-scan owed.
>
> **Level key (the scope ladder):** `L1` = file-scan (the file itself) · `L2` =
> call-graph-scan (the file + its direct call graph, one hop) · `L3` = service-scan
> (the whole service, transitive closure) · `L4` = project-wide-scan (all services,
> the final boss). The order is L1 → L2 → L3 → L4, each to 100% before the next,
> backend-first. When all four are 100%, the surface has **passed the AI pentest**.

## Seed state — from the October 2026 audit

Source scan: [`scans/2026-10/`](./scans/2026-10/README.md) (invariant-driven,
`file:line` evidence). **Honesty note:** the hardening for most of these (PRs
1157 + 1159) is **in flight, not merged** as of this ledger's date. Until they
land, the affected rows are **OPEN**, not PASS — a PASS would be a corrupted
measure. Re-scan after the hardening merges to flip them.

| Unit | Level | Status | Model | Date | Last-pass | Sys | Finding / note |
|---|---|---|---|---|---|---|---|
| `api/app/services/auth.py :: decode_token` | L1 | **OPEN** | (audit) | 2026-10 | — | auth | B-3 unsigned decode path; B-1 I1 symmetric HS256. Hardening in 1157 (unmerged) |
| `api/app/settings.py` | L1 | **OPEN** | (audit) | 2026-10 | — | config | B-2 secrets in source (signing key + Stripe/Twilio/CH creds). Hardening in 1157 (unmerged) |
| `api/app/middleware.py` | L1 | **OPEN** | (audit) | 2026-10 | — | logging | B-4 full request/response body logged. Redaction in 1159 (unmerged) |
| `api/app/main.py :: CORS` | L1 | **OPEN** | (audit) | 2026-10 | — | boundary | B-5 `allow_origins=["*"]` — load-bearing assumption, needs a pinning test |
| `api/app/v3/services/clickhouse.py :: read path` | L1 | PASS | (audit) | 2026-10 | — | query-engine | I3 read gate on lock (the crown jewel holds) — `can_read_group` / `effective_role_perms` |
| `api/app/v3/services/safe_query.py` | L1 | PASS | (audit) | 2026-10 | — | query-engine | I3 wall for caller SQL on lock — boundary on input CTEs, not output filter |
| `api/app/v3/services/clickhouse.py :: get_document_any_author` | L1 | **OPEN** | (audit) | 2026-10 | — | media | B-6 reads without author scoping; bounded by doc-bound sig — verify sig checked first |
| `api/app/v3/services/import_worker.py` | L1 | PASS | (D90 review) | 2026-10 | 2026-10-18 | import | D90 durability pass (3.235.1) — L1 read of the reworked worker: the trace handler + `record_event` are fail-open (never raise into the job); the trace endpoint is owner-gated via `_owned_job` (I3 — a token never reads another user's job; 404 unknown / 403 not-owned, test-pinned); `KEEP_IMPORT_EXPORTS` is a debug switch that only RETAINS the job owner's own export parts (default off — the privacy promise holds; no cross-user reach); the stuck sweep re-queues only the node's own jobs (idempotent re-run). No new trust boundary introduced (the import was already token-gated end-to-end). |
| `sdk/src/browser.ts :: authListen` | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-1 `postMessage` token accepted with no origin check. Hardening in 1159 (unmerged) |
| `sdk/src/v3.ts` (token-in-body) | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-2 token in JSON body — composes with B-4 (body logged). By design; the log is the risk |
| `sdk/src/http.ts :: authGet` | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-3 `byUserGroups` sends no token — functional gap, not a leak |
| `sdk/src/token.ts :: decodeJwt` | L1 | PASS | (audit) | 2026-10 | — | sdk-auth | S-4 unsigned base64 decode — acceptable for reading claims; doc: never for authz |
| `sdk/src/token.ts :: cookie` | L1 | PASS | (audit) | 2026-10 | — | sdk-auth | S-5 `SameSite=Lax`+`Secure`, no HttpOnly (impossible by design), 60-day — acceptable, noted |
| `api/rtc/` (admission) | L4 | **OPEN** | — | — | — | rtc | RTC socket admission / certify gate (cross-service RTC↔API) — see `BP-3`. Hardening in 1159 (unmerged) |
| federation signing (I1) | L4 | **OPEN** | — | — | — | federation | B-1 / D7 — HS256 → RS256/EdDSA + JWKS (cross-node). See `BP-1` |
| delegation model (I5) | L3 | **OPEN** | — | — | — | auth | scoped app-management delegation (within the API service). See `BP-2`. Hardening in 1157 (unmerged) |

## Not yet scanned (scan debt)

The October audit covered the backend core + SDK. **Not yet scanned** (all STALE
by definition — never scanned):

- **Frontend / render surface** — the XSS surface, the `rehype-sanitize` choke
  point, every `dangerouslySetInnerHTML`, the markdown render. (The audit's
  "pass 2," never started.)
- **`api/app/v3/endpoints/`** — the endpoint layer that calls the services (the
  audit scoped the services; the endpoints are the next L1 slice).
- **`marketing/web10-social/src/data/`** — the social app's data layer (token
  handling, the permission requests).
- **`ui/`** — the authenticator (consent, session restore, the token vault).

These are the next scan scopes. See
[`ai-pack/ai-security-theory/running-it/`](../../ai-pack/ai-security-theory/running-it/README.md)
for how to slice + run them in parallel.
