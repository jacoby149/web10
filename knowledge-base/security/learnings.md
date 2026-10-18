# Security Learnings — web10's security memory

The **knowledge** root of trust (the security record is the *coverage* root of trust). This
is the record the [orient phase](../../ai-pack/ai-security-theory/the-orient/README.md)
reads before every scan: what web10 has *figured out* about its own security — the
invariants as they've evolved, every finding→fix as a dated learning, the known
gaps, and what we've *decided not* to do.

> **The loop:** orient reads this → the scan is aimed → every fix **writes back**
> here. It is not a static doc; it is the accumulated memory of every security
> decision. A new agent (or you, six months later) reads this and knows the terrain
> without re-deriving it.

## The invariants (as they've evolved)

The model is I1–I6 in
[`web10-v3/security/overview.md`](../web10-v3/security/overview.md). The evolution
that matters for orient:

- **I1 (verify the issuer) is the known weak one.** It *assumes* a trusted key
  source. That assumption was **false** under single-node symmetric HS256 (anyone
  with the key mints any token) — the D7 gap. The fix (RS256/EdDSA + JWKS, per-node
  keypair) is the `BP-1` item. **Orient check:** is I1 still riding on an
  unverified assumption? (Until BP-1 lands, yes.)
- **I3 (no cross-user read) is the crown jewel and it holds** — but *only* because
  every read path goes through the gate. That is a **load-bearing assumption**: one
  read path that bypasses the gate is a total break, and there is **no
  defense-in-depth at the storage layer** (ClickHouse has no per-row ACL; the
  enforcement is entirely at the query boundary). **Orient check:** is there a read
  path that doesn't go through the gate?
 - **The invariants are C+I, not availability.** Unbounded query, unbounded fan-out,
   unbounded upload, ReDoS are *reliability / DoS* — a different discipline, **out of
   scope for the security invariants** (not a hole in them). If DoS ever becomes a
   real concern it is its own track + its own invariants, not an addition to I1–I6.

## Findings → fixes (the dated learnings)

Seeded from the October 2026 audit
([`scans/2026-10/`](./scans/2026-10/README.md)). **Honesty note:** the hardening
(PR 1157/1159) is **in flight, not merged** — so these are *learned* but not yet
*closed*; the repro gate is not yet green. Each closes when its fix lands + the
exploit is replayed and denied.

| ID | Date | Unit | Learning (vuln → fix) | Status |
|---|---|---|---|---|
| B-1 | 2026-10 | `auth.py`, federation | I1 symmetric HS256 — one shared key mints any token → RS256/EdDSA + JWKS (D7) | learned; fix in 1157 (unmerged) → `BP-1` |
| B-2 | 2026-10 | `settings.py` | signing key + Stripe/Twilio/CH creds in source → env-injected, no defaults | OPEN; repeatable defaults confirmed at `8704e9f5c`; [L1 receipt](scans/2026-10/l1-settings.md), no live credential validity claim |
| B-3 | 2026-10 | `auth.py :: decode_token` | `private_key=False` unsigned decode on an auth path → verify signature before any authz | learned; fix in 1157 (unmerged) |
| B-4 | 2026-10 | `middleware.py` | full request/response body logged (token in body → token in log) → redact the token field | learned; fix in 1159 (unmerged) |
| B-5 | 2026-10 | `main.py` CORS | `allow_origins=["*"]` defended only by "token in body" → pin the assumption in a test | learned; needs a pinning test |
| B-6 | 2026-10 | `clickhouse.py :: get_document_any_author` | reads without author scoping, bounded by a doc-bound sig → verify the sig is checked first | learned; verify |
| B-8 | 2026-10-18 | `settings.py:139-140` | executing the settings CLI prints globals containing environment-injected secrets → separate fix must suppress secrets while preserving nonsecret diagnostics | OPEN; five synthetic credentials recovered from captured stdout at `8704e9f5c`; [PoC + preconditions](scans/2026-10/l1-settings.md) |
| S-1 | 2026-10 | `sdk/browser.ts :: authListen` | `postMessage` token accepted with no origin check → `e.origin === authOrigin` gate | learned; fix in 1159 (unmerged) |
| S-2 | 2026-10 | `sdk/v3.ts` (token-in-body) | token in JSON body composes with B-4 (body logged) → the body transport is by design; the log redaction (B-4) is the fix | learned; see B-4 |
| S-3 | 2026-10 | `sdk/http.ts :: authGet` | `byUserGroups` sends no token — functional gap, not a leak → decide: send the token or drop the comment | learned; open decision |
| S-4 | 2026-10 | `sdk/token.ts :: decodeJwt` | unsigned base64 decode — fine for reading claims, a footgun for authz → doc: never use for authorization | learned; documented |
| S-5 | 2026-10 | `sdk/token.ts` cookie | `SameSite=Lax`+`Secure`, no HttpOnly (impossible by design), 60-day → acceptable; note the 60-day window | learned; accepted |

**The L2 lesson (why the call-graph rung exists):** B-4 + S-2 is a single
*relationship* — the token (source, `v3.ts`) flows to the log (sink, `middleware.py`)
with no redaction between. Neither file is vulnerable in isolation; only the **edge**
is. That is exactly what L2 (the direct call graph) catches and L1 (one file)
cannot. Keep this as the worked example when explaining the ladder.

### 2026-10-18: B-4 reproduced at a pinned commit (still open)

The [whole-file middleware L1 scan](scans/2026-10/l1-middleware.md) at
`d86658be6d9bb202bbab981a918a6b69c9bde966` demonstrated synthetic request and
response tokens reaching the real logger's ClickHouse insert arguments. Error
responses also duplicate the JSON into `meta` and `detail` into `message`;
truncation is not redaction. A future B-4 repair must cover those copies too.
No production exposure, live database persistence, or fix is claimed. The unsigned
JWT decode feeds log attribution only within this file; it does not demonstrate
an authorization bypass. Whether another consumer trusts that column is L2+ debt.

### 2026-10-18: settings defaults and diagnostic output (still open)

The [whole-file settings L1 scan](scans/2026-10/l1-settings.md), all 140 lines at
`8704e9f5c97968d9161c4f5f889c0d0fa0a8be6c`, confirms B-2's repeatable credential
defaults with an empty environment. Some source literals are abbreviated;
this does not establish live third-party credential validity. Environment injection
overrides the defaults, but the `__main__` diagnostic prints those injected values
(B-8), demonstrated with synthetic canaries and captured stdout. Ordinary import
does not invoke the dump. Production invocation/exposure and BP-4 rotation remain
unassessed; neither issue is fixed by this scan.

The final env loop also overwrites typed booleans with truthy strings, including
explicit `"false"` values. That local behavior is proven; consumers must be traced
at L2 before naming a security bypass or retention/TLS/recovery impact. Preserve
the intentional bootstrap-admin baseline and operator configuration (node-config
KB); the source comment's replace-vs-union mismatch is not proof of an auth bug.
B-7 already means token lifetime in the October backend audit; the new dump
finding deliberately uses B-8 instead.

### 2026-10-18: API L1 campaign, identity/system receipts

[Inventory](scans/2026-10/l1-api-index.md) separates full source accounting from
security sign-off. A/B/D record local manifest fetch routing, unused remote-helper
destination/status trust, expired signed-token principal production and weak
session-expiry classification. See their scoped IDs for exact proofs and limits.
No live private-network access or database mutation is claimed. Manufactured
secret-bearing errors only demonstrate an unredacted sink: until a reachable
protected-value source is shown, that disclosure remains UNVERIFIED. These
receipts do not close B-1/B-3 or imply the caller/storage gates are safe.

### 2026-10-18: media/reporting API L1 receipts

Scopes C/H/I add media services and media/import/preview/reporting endpoints.
L1-H-01 shows a source-level object-authorization concern: the read-URL handler
discards the authenticated identity and passes caller-selected keys to signing
without an intervening object check. Its dynamic proof uses fake auth/signing
sinks; actual authenticated HTTP access and private-object retrieval are not
demonstrated. Preserve authorized cross-user/group media and public thumbnails
when fixing it; arbitrary object-key forwarding is not the same as an authorized
document capability. C/I have no confirmed local findings, not a safety PASS.

## Known gaps (the "obvious gap" register)

Gaps the orient has surfaced. Each is either a `BP-n` or a standing note:

- **Supply chain is not in the invariants.** I1–I6 are C+I of the *node's own code
  and data*; they assume the **dependencies are trustworthy**. A compromised
  `react-markdown`, a malicious transitive dep, a poisoned lockfile is a C+I break
  the invariants don't name. *(Standing note — mitigate with frozen lockfiles +
  dependabot + a dependency-integrity check; decide whether it warrants an
  invariant.)*
- **No defense-in-depth at the storage layer.** I3 is enforced only at the query
  boundary; ClickHouse has no per-row ACL. One boundary bug = total loss, no
  backstop. *(Standing note — it's a strength (boundary on the input) and a risk
  (no backstop); the query-engine gauntlet is the mitigation.)*
- **The query engine is a triple-threat** (I3 + injection + DoS) and is the natural
  home for a dedicated gauntlet (`scans/late-stage/`). *(Standing note.)*

*(Not a gap: **availability / DoS** is reliability, a different discipline — out of
scope for the security invariants, its own track if it ever becomes a concern.)*

## Considered and declined (decided — don't re-raise)

The orient checks this list so it doesn't re-raise a decided question:

- **No E2E encryption by default (D41).** web10 is a data-policy platform, not a
  privacy platform. The node is readable by design (discovery, search,
  auditability); access is terms-controlled (I3), not cryptographic. E2E is
  opt-in / third-party, never the default. The phone-as-keychain encryptor app was
  deleted. *(Do not re-raise "should we add e2e?" — it's decided.)*
- **Token in the request body, not a header (by design).** This is the CORS
  defense (a credentialed cookie path would break `allow_origins=["*"]`). The risk
  is the *log* (B-4), not the transport. *(Don't "fix" the transport; fix the log.)*
- **Cookie is not HttpOnly (impossible by design).** The SDK (JS) must read the
  token, so HttpOnly is off the table. The mitigations are `Secure` + `SameSite=Lax`
  + the 60-day cap. *(Don't re-raise HttpOnly.)*

## Considered and found-safe (negative learnings)

The other half of the map. A **failed exploit** — the scanner suspected a vuln,
built the exploit, and it **failed** — is a *confirmed non-vulnerability*, recorded
here so the orient doesn't re-investigate it. Each entry says **why it's safe**
(because of `<reason>`), because that reason is what a future change might remove —
and when it does, this entry goes stale and the orient's recession prompt catches
it. *(Empty until the first exploit-first scan runs; this is where the negative
results land.)*

| Date | Unit | Looked like | Exploit result | Why it's safe | As of commit |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## How to update this file

- **A fix lands** → append a row to Findings→fixes (date, unit, vuln→fix, status),
  and flip the matching security record row to PASS (repro gate met).
- **An exploit is attempted and fails** → append a row to Considered-and-found-safe
  (date, unit, what it looked like, the failed result, *why it's safe*, commit). A
  negative result is a learning, not a discarded false positive.
- **A new assumption or threat class is found** → add it to the invariants / known
  gaps, and add the signature to the checklist.
- **A concern is decided against** → move it to Considered-and-declined with the
  decision + the D-number.
- **A recession is found** (orient prompt 2) → the pinning test goes red (code
  recession) or this file notes the eroded consideration (conceptual recession);
  either way it re-opens the finding. A found-safe entry whose "why it's safe"
  reason was just removed is a recession too.
