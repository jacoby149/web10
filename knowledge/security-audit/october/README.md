# October 2026 — web10 Security Audit

A line-by-line, invariant-driven security audit of the web10 node. **Backend
first** (the node is the trust root — if it's on lock, the rest is contained),
then the **SDK** (the client-side token/cookie/postMessage surface), then the
**frontend** (XSS / the render choke point) in a later pass.

This is an *audit*, not a fix. Each finding is recorded with evidence
(`file:line`), a severity, the invariant(s) it touches, and a status. Findings
that are confirmed bugs get a lane item + a fix PR; the audit doc is the record.

## Scope and method

**Method (AI-use-theory applied to security):** the KB is the target. The
invariants I1–I6 in `knowledge-base/web10-v3/security/overview.md` are the
specification; the code is what is being checked against it. A finding is
"the code does not do what the invariant says it should." Every finding below
was verified against the actual code (not inferred) — `file:line` is given so
each claim is re-checkable.

**Severity scale:**
- **Critical** — breaks an invariant; an attacker can read/write another
  user's data, mint a valid token, or exfiltrate a credential.
- **High** — a real weakness that lowers the cost of an attack or leaks
  sensitive material, but needs a condition to exploit.
- **Medium** — a gap that should be closed but is not directly exploitable
  today.
- **Low** — hardening / hygiene.

**What "on lock" means here:** the backend is on lock **for I3** (no query
returns another user's documents) and **for the query engine** (the caller's
SQL cannot reach a raw table) — those two are the crown jewels and they hold.
It is **not** on lock for **I1** (token verification is single-node symmetric
with a shared key — the known federation gap) and it has a **credential
hygiene** problem (secrets in source). Details in `backend.md`.

## How much code is in scope

> **Full per-layer / per-file breakdown: [`loc-breakdown.md`](./loc-breakdown.md)** —
> the v3 surface split into services / endpoints / models, the security-critical
> core file-by-file, and every SDK file. The table below is the summary.

The backend is small. The security-relevant core is very small.

| Surface | Total | Security-critical core |
|---|---|---|
| **Backend** `api/` (Python) | ~26,860 LOC (95 files) | **~13,000 LOC** production (non-test) |
| — the v3 live surface `api/app/v3/` | 9,727 LOC | the whole thing is in scope |
| — `clickhouse.py` (I3 read gate + all SQL) | 4,610 | **the single most important file** |
| — `safe_query.py` (query-engine boundary) | 535 | **the I3 wall for caller SQL** |
| — `services/auth.py` (token verify, I1/I2) | 118 | **the I1/I2 core** |
| — `middleware.py` (request logging) | 143 | logs request/response bodies |
| — `main.py` (CORS, exception handlers) | 176 | CORS + error disclosure |
| — `settings.py` (config + secrets) | 125 | **secrets in source** |
| **SDK** `sdk/` (TypeScript) | ~2,400 LOC source (8 files) | **~2,400** — all of it is the client trust surface |
| — `v3.ts` (client, token in body) | 1,589 | token handling |
| — `browser.ts` (popup auth, postMessage) | 314 | **postMessage origin check** |
| — `token.ts` (cookie + JWT decode) | 94 | **cookie flags, token storage** |
| — `http.ts` (fetch transport) | 103 | **token-in-URL path** |

So the *entire* backend is ~27k LOC, the production code is ~13k, and the
**security-critical core is roughly 5–6k LOC** (`clickhouse.py` +
`safe_query.py` + `auth.py` + the endpoints that call them + `middleware.py` +
`main.py` + `settings.py`). The SDK is ~2.4k LOC and *all* of it is the
client trust surface. This is auditable line-by-line in a bounded number of
passes — it is not a "we can't read all of it" situation.

The test suite is large (~14k LOC in `api/tests/`), and it is the *altitude*:
`test_v3_conformance.py`, `test_v3_access.py`, `test_safe_query.py`,
`test_cors_trust_boundary.py`, `test_v3_verify_access.py` mechanically enforce
the invariants. The audit uses them as the check that the invariants are
actually pinned, not just asserted.

## Findings — summary table

| # | Sev | Surface | Finding | Invariant | Status |
|---|---|---|---|---|---|
| B-1 | **Critical** | backend | **I1 is single-node symmetric: one shared HS256 key signs + verifies every token. Any node (or anyone with the key) can mint a valid token for any user.** | I1, I5 | Known gap (D7) — **confirmed in code**, see backend.md |
| B-2 | **High** | backend | **The JWT signing key + Stripe/Twilio/ClickHouse credentials are in `settings.py` source (committed).** Even if redacted in the repo, the *pattern* (secrets as module-level defaults) is the risk. | — (hygiene) | **Verify real values are env-injected in prod** |
| B-3 | **High** | backend | **`decode_token(..., private_key=False)` does an *unsigned* decode.** Any caller that uses the non-private path trusts attacker-controlled claims. Must be used only where the signature was already verified. | I2 | **Confirmed the function exists; audit every call site** |
| B-4 | **Medium** | backend | **`middleware.py` logs the full request + response body (truncated to 4KB) for every request into ClickHouse `logs`.** If a body carries a token or sensitive payload, it is persisted. | I4 (by design readable, but this is *log* storage) | **Confirm what bodies flow through; consider redacting the token field** |
| B-5 | **Medium** | backend | **CORS is `allow_origins=["*"]`.** Defended by "the token is in the body, not a cookie, so CORS can't exfiltrate" — true *today*, but it is a load-bearing assumption that breaks the moment a credentialed (cookie) path is added. | I5 | **Documented assumption — keep it, but pin it in a test** |
| B-6 | **Low** | backend | **`get_document_any_author(doc_id)` reads a doc without the author scoping.** Used by the HLS re-check; bounded by "caller holds a document-bound sig." | I3 | **Verify the sig is checked before the doc is used** |
| S-1 | **High** | SDK | **`authListen` accepts a token from a `postMessage` with NO origin check.** Any page the user has open (or a malicious tab) can post an `auth` message and, if it matches the current user (or first-login), set the cookie. The identity-mismatch check only stops a *different* user. | I5 | **Confirmed in code — add `e.origin === authOrigin` gate** |
| S-2 | **Medium** | SDK | **The token is sent in the JSON body of every call** (not a header). This is the CORS defense, but it means the token is in the request body — and `middleware.py` logs request bodies (B-4). Two findings compose. | I5 | Body transport is by design; the log is the risk |
| S-3 | **Low** | SDK | **`byUserGroups` sends NO token at all** — `authGet` (http.ts:90) adds no header, no body token, no `credentials`, so the "token rides along when present" comment (v3.ts:1156) is false. Not a leak (it reads anon, I3-enforced) but a **functional gap**: a signed-in user's private-group memberships can't be read this way. | I3 (holds anon) | **Functional bug — decide: send the token (body) or drop the comment** |
| S-4 | **Low** | SDK | **`decodeJwt` is an unsigned base64 decode** — fine for reading `username`/`expires` client-side, but it is a footgun if ever used for an auth decision. | I2 (client) | Document: never use for authorization |
| S-5 | **Low** | SDK | **Cookie is `SameSite=Lax`, `Secure` (HTTPS only), no `HttpOnly`** (JS must read it, so HttpOnly is impossible by design). 60-day max-age is long. | I5 | Acceptable given the model; note the 60-day window |

**Frontend** (XSS / the `rehype-sanitize` choke point, the `dangerouslySetInnerHTML`
surface, the markdown render) is **pass 2** — not yet started. The D85 decision
(`decisions.md:96`) says the render is the single locked sanitized choke point;
the audit verifies that claim against every render surface.

## The verdict

- **I3 (the data-isolation invariant) is on lock.** The read gate
  (`can_read_group` / `effective_role_perms`, `clickhouse.py:1379-1465`) and the
  query-engine boundary (`safe_query.py`) are genuinely well-built: the
  boundary is on the *input* tables (API-built CTEs), not an output filter, so
  aggregation / self-joins / subqueries cannot leak past it. This is the part
  that matters most and it holds.
- **I1 (token verification) is NOT on lock** — it is the known D7 federation
  gap, now confirmed in code: single-node, symmetric, one shared key. Within a
  single node it "works" because there's one key; across nodes (or against
  anyone who learns the key) it is forgeable.
- **The SDK has a real postMessage origin hole (S-1)** and a token-in-body
  design that composes with the request-body logging (B-4 + S-2).

## Next

1. `backend.md` — the backend findings in full, with the I1/I2/I3 walk-through.
2. `sdk.md` — the SDK findings in full, with the cookie + postMessage analysis.
3. `d60-genericity.md` — the D60 audit: is the node generic, or has it taken
   the shape of the social app? (It has — four product concepts leaked in.)
4. Frontend pass (XSS / the render choke point) — to be added.
5. For each **Critical/High** confirmed finding: a lane item in
   `parallel-execution.md` + a fix PR. (B-1 is the D7 lane, already in flight.)

## Late-stage: the hacker-model gauntlet

After this manual pass, the plan is to spend ~$1–3k on frontier models to
harden the node — structured so the spend becomes permanent CI signal, not a
one-off report. See `../late-stage/` (the query-engine gauntlet, I3
permission-matrix fuzzing, blind re-audit + I1 threat model, and the harness to
build first). This manual audit is the foundation that makes that spend land.
