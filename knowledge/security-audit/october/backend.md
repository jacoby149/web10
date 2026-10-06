# October 2026 Audit — Backend (`api/`)

The node is the trust root. This pass audits the backend against the invariants
I1–I6 (`knowledge-base/web10-v3/security/overview.md`). Every claim is
`file:line`-verified against the code.

## The crown jewels: I3 and the query engine — **ON LOCK**

These two are the part that matters most, and they hold.

### I3 — no query returns another user's documents

The read gate is `can_read_group` / `effective_role_perms`
(`api/app/v3/services/clickhouse.py:1379-1465`). The model (D58):

- A **member** can read all services in the group (`clickhouse.py:1434`).
- A **non-member** can read only if the group's `anyone` / `authenticated`
  reserved-class member row grants `readAll` on the service
  (`clickhouse.py:1436-1437`, `_effective_allows` at `:1419`).
- The effective role is the **union** of every principal class the reader
  belongs to: `anyone` (always), `authenticated` (if a valid token), and the
  reader's own member role (`clickhouse.py:1400-1416`).

Every read path funnels through this: the group read, the read-by-id (watch
page), the people directory, and the query engine. The `authenticated` flag is
passed from the token so an anon read **cannot** be upgraded to authenticated
grants (`can_read_carrier_post`, `clickhouse.py:994-1032`, mirrors it).

This is real, not a comment. The D58 backfill that renames the legacy `anon`
member row to `anyone` is in the code (`clickhouse.py:613-623`), and the read
gate matches both keys during the transition (`:1403`).

### The query engine — the I3 wall for caller-written SQL

`api/app/v3/services/safe_query.py` is the security boundary for the D73 query
engine, where a *caller* writes ClickHouse SQL. The design is sound:

- The raw string is **never executed**. It is parsed into an AST by sqlglot
  (`safe_query.py:489`), every table reference is walked
  (`_validate`, `:327-372`), and the result is re-emitted.
- The boundary is on the **input tables**, not an output filter. Each service
  the query references is replaced by an **API-built boundary CTE**
  (`_boundary_cte_sql`, `:129-240`) that is already filtered to the caller's
  `readable_groups` (computed by the D58 read gate) with the
  block/sharing/hidden anti-joins. So aggregation, self-joins, and subqueries
  **cannot leak past it** — the raw tables are simply unreachable
  (`safe_query.py:30-31`, the "wall not membrane" argument).
- Raw node tables are rejected by name (`RAW_TABLES`, `:62-81`); table
  functions (`file()`, `s3()`, `numbers()` — the escape hatches off the node)
  surface as a `Table` with an empty name and are rejected (`:353-356`); only a
  single SELECT is allowed (`:429-430`); a round-trip re-parse is the backstop
  (`:528-533`).

**Honest caveat (stated in the code, `:42-47`):** the guarantee rests on
sqlglot parsing ClickHouse SQL faithfully. A query sqlglot *mis-parses* in a
way that hides a table reference would be the failure mode. This is the one
thing to stress-test in the frontend/query pass — see the gauntlet below.

**Verdict: I3 is on lock.** The two mechanisms that keep one user's data from
leaking to another — the read gate and the query boundary — are correctly
built and are the strongest part of the codebase.

## I1 / I2 — token verification — **NOT on lock (the known D7 gap, confirmed)**

### B-1 — Critical — I1 is single-node symmetric, one shared key

`api/app/services/auth.py:36-43`:

```python
def decode_token(token: str, private_key: bool = False) -> TokenData:
    if private_key:
        payload = jwt.decode(token, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
    else:
        payload = jwt.decode(token, options={"verify_signature": False})
```

`settings.py:21-22`: `ALGORITHM = "HS256"`, `PRIVATE_KEY = "8cbec8....."`.

- **Symmetric (HS256):** the key that *signs* a token is the key that
  *verifies* it. There is no public/private split. So any node that shares the
  key — or anyone who learns the key — can **mint a valid token for any
  `username`**. That is exactly I1 broken: "a provider verifies any token's
  issuer cryptographically, without trusting the token's own claims." With one
  shared symmetric key, a provider *cannot* distinguish a token it minted from
  one another node (or an attacker) minted.
- **Within a single node** this "works" because there is one key and one
  signer. **Across nodes** (federation) it is forgeable. This is the D7 gap
  (`decisions.md:3099-3104`), and it is **confirmed in code**: the asymmetric
  fix (RS256/EdDSA + JWKS) is decided but the scaffolding is **dead** —
  `certify_with_remote_provider` (`auth.py:76-81`) is defined and only called
  by tests (`test_auth_services.py`), never by the live v3 path.

**Impact:** a node operator (who has the key) can impersonate any user on that
node; and the federation story — the whole "own your data across nodes" pitch —
cannot be trusted until I1 is asymmetric. This is the #1 thing to close.

**Status:** known, in flight (D7 lane, `parallel-execution.md` "B: cross-node
token verification"). The audit **confirms it is real and still open** and
confirms the fix is not yet wired in.

### B-3 — Low (downgraded) — the unsigned-decode path exists but is benign today

`decode_token(..., private_key=False)` does an **unsigned** decode
(`auth.py:40`) — it trusts the token's claims without verifying the signature.
That is an I2 footgun *if* used for an authorization decision. But the audit of
every call site shows it is **not** used that way:

- `api/app/endpoints/system.py:325` — bug-report endpoint. Extracts `username`
  for **attribution only** (an optional field), wrapped in `try/except`, and a
  forged username there just mislabels a bug report. Not an auth decision.
- `api/app/services/auth.py:77` — inside `certify_with_remote_provider`, which
  is **dead code** (only tests call it).

Every real auth path uses `private_key=True` (verified signature):
`auth_helper.user` / `user_or_anon` (`auth_helper.py:9,27`), `groups.py:151`,
`appstore.py:53`, `account.py:86`, `clickhouse.py:4047`, and `certify` /
`check_admin` (`auth.py:93,115`).

**So I2 holds in practice** — authorization decisions use only verified token
data. The residual risk is a future developer calling the `private_key=False`
path for an auth decision. **Recommendation:** delete the `private_key`
parameter entirely (force verification) or rename it `for_attribution_only` so
the unsafe path can't be reached by accident. Low severity because it is not
currently exploitable.

## I5 — scoped, expiring, revocable tokens + app contracts

- **Expiry is enforced.** `certify` checks `datetime.utcnow() > expires`
  (`auth.py:98`). Note the token carries an ISO `expires` claim, not the JWT
  `exp` — and `access.py:52` comments that PyJWT doesn't check it, so it's
  checked manually. Consistent.
- **App contracts (the per-origin permission gate) exist and are enforced.**
  `_check_app_permission` (`documents.py:131`) gates CRUD by the app contract's
  per-service permissions; `app_contracts` is a real table
  (`clickhouse.py:2024-2115`) with `revoke_all_app_contracts` (`:2096`) — the
  "revoke all apps" kill switch.
- **Revocation is real** (contract-level). There is no per-token revocation
  list — a token is valid until it expires (up to 60 days, `TOKEN_EXPIRE_MINUTES
  = 87840` ≈ 60 days, `settings.py:23`). That is a long window; see B-7.

## Credential hygiene — **High**

### B-2 — High — secrets live in `settings.py` source

`api/app/settings.py` carries, as **module-level defaults**:

- `PRIVATE_KEY` (the JWT signing key, `:22`)
- `STRIPE_LIVE_KEY = "sk_live_..."` (`:48`), `STRIPE_TEST_KEY` (`:47`)
- `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_NUMBER` (`:38-41`)
- `CLICKHOUSE_PASSWORD` default `"web10"` (`:59`), `S3_SECRET_KEY` default
  `"minioadmin"` (`:72`)

The repo shows them redacted (`"8cbec8....."`, `"sk_live_51Khyui......"`), which
means **either** they are genuinely env-injected in prod (the `for v in
globals(): env_val = os.getenv(v)` loop at `settings.py:110-113` does exactly
that) **or** the redaction is cosmetic and the real values are in git history.

**This is the single most important thing to verify before "on lock":**
1. Confirm the real values are **only** in the deployment env, never committed
   (check `git log -p -- api/app/settings.py` for a real `sk_live_` / JWT key).
2. If any real secret was ever committed, **rotate it** — it is compromised
   regardless of later redaction.
3. The *pattern* (secrets as importable module defaults) is the risk: any
   process that imports `app.settings` with the env unset gets a live-looking
   default. The fix is to make these `os.environ[...]` (hard fail if absent in
   prod) rather than `os.getenv(..., default)`.

**Status:** needs operator confirmation of the deployment env. If the values
are env-injected and were never committed, this drops to Medium (pattern
hardening). If any were committed, it's Critical (rotate now).

## Logging — **Medium**

### B-4 — Medium — request + response bodies are logged to ClickHouse

`api/app/middleware.py:74-141` (`log_requests`) buffers the **full request body
and response body** (truncated to 4KB, `MAX_BODY = 4096`) and inserts them into
the `logs` ClickHouse table for **every** request. Since the SDK sends the
token **in the JSON body** (see SDK S-2), **the token is in the logged request
body** — and so is any document body being written.

- This is *by design* for an open-source, auditable node (I4: the node is
  readable/accountable; copious logging is a stated feature).
- But the **token** specifically should not be persisted in a log row. It is a
  bearer credential valid for up to 60 days.
- **Recommendation:** redact the `token` field from the logged request body
  (it's the one field that is a credential, not data). Keep logging the rest.

### B-5 — Medium — CORS is `allow_origins=["*"]` (a load-bearing assumption)

`api/app/main.py:38-43` sets wildcard CORS, and the comment (`:31-37`) explains
why it's safe *today*: the token is in the request **body**, not a cookie, so a
cross-origin page can't exfiltrate it via credentialed CORS. That is correct —
**as long as no credentialed (cookie/`Authorization`-header) path is ever
added.** The moment a cookie or header-based auth is introduced, wildcard CORS
becomes an exfiltration vector.

**Recommendation:** this is a defensible design choice, but it is a *load-
bearing assumption*. Pin it with a test (the `test_cors_trust_boundary.py`
suite) that fails if `allow_credentials=True` is ever combined with
`allow_origins=["*"]`, and add a comment that the body-transport design is what
makes wildcard CORS safe.

## Lower-severity / verify

### B-6 — Low — `get_document_any_author` reads without author scoping

`clickhouse.py:965-991` reads a doc by `doc_id` alone (no `author_key`). The
docstring says it's for the HLS manifest re-check, where the caller already
holds a **document-bound sig**. **Verify** the sig is checked *before* the doc
is used (in `services/hls.py`), so this is not an enumeration surface. The
function itself is not a hole — it's the caller's responsibility, and the
comment asserts it.

### B-7 — Low — 60-day token lifetime

`TOKEN_EXPIRE_MINUTES = 87840` (`settings.py:23`) ≈ 60 days. Combined with
no per-token revocation (only contract-level), a stolen token is valid for up
to 60 days. The SDK cookie is also 60 days. For a data-ownership platform this
is a long blast radius. **Consider** shortening to 7–14 days with silent
renewal, or adding a per-token revocation list. Low because the token is
scoped (I5) and the contract can be revoked.

## What holds (the good news)

- **I3 is on lock** — the read gate + query boundary are the strongest part.
- **I2 holds in practice** — all real auth paths verify the signature.
- **I5 is substantially implemented** — app contracts, per-service permissions,
  revocation, expiry checks are all real code, not aspirational.
- **The exception handler is careful** — `main.py:140-165` surfaces only the
  exception *type* + message to the client and keeps the full traceback (which
  can carry secrets) server-side, keyed by a correlation id. Good instinct.
- **SSRF guard exists** — `_validate_provider_url` (`auth.py:58-73`) rejects
  private/loopback/link-local targets before any outbound fetch in the
  federation certify path.

## The backend verdict

**On lock for the data-isolation invariants (I3, and I2 in practice). Not on
lock for I1 (the known federation gap, confirmed real and still open) and not
clean on credential hygiene (B-2 — verify the secrets are env-only).** The two
things that would actually let an attacker read another user's data are the
parts that are built correctly. The things that are weak are the
*cross-node* and *operational* ones — exactly the ones that matter once the
node is public and multi-node, which is the product's whole point.

## Recommended order of attack

1. **B-2** — verify/rotate secrets (1 hour, operator + `git log -p`). Do this
   first; it's the only one that might already be a breach.
2. **B-1** — land the D7 asymmetric fix (already a lane; the audit confirms it
   is the right priority and that the scaffolding is still dead).
3. **B-4** — redact the token from logged request bodies (small, high value).
4. **B-3** — delete/rename the unsigned-decode path so it can't be misused.
5. **B-5** — pin the CORS assumption in a test + comment.
6. **B-6 / B-7** — verify the HLS sig ordering; consider shorter token TTL.
