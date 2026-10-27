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
| B-4 | 2026-10 | `middleware.py` | arbitrary HTTP content copied into logs -> metadata-only automatic logging; field-name redaction is insufficient | Source repair merged #1225; [repro evidence](scans/2026-10/repair-b4-middleware.md); deployment/exposure/sign-off not closed |
| B-5 | 2026-10 | `main.py` CORS | `allow_origins=["*"]` defended only by "token in body" → pin the assumption in a test | learned; needs a pinning test |
| B-6 | 2026-10 | `clickhouse.py :: get_document_any_author` | reads without author scoping, bounded by a doc-bound sig → verify the sig is checked first | learned; verify |
| B-8 | 2026-10-18 | `settings.py:139-140` | executing the settings CLI prints globals containing environment-injected secrets → separate fix must suppress secrets while preserving nonsecret diagnostics | OPEN; five synthetic credentials recovered from captured stdout at `8704e9f5c`; [PoC + preconditions](scans/2026-10/l1-settings.md) |
| S-1 | 2026-10 | `sdk/browser.ts :: authListen` | `postMessage` token accepted with no origin check → sender binding required | OPEN; [current pinned A receipt](scans/2026-10/l1-sdk-a.md) reproduces synthetic acceptance, not valid credentials/API access |
| S-2 | 2026-10 | `sdk/v3.ts` (token-in-body) | token in JSON body composes with B-4 (body logged) → the body transport is by design; the log redaction (B-4) is the fix | learned; see B-4 |
| S-3 | 2026-10 | `sdk/http.ts :: authGet` | `byUserGroups` sends no token — functional gap, not a leak → decide: send the token or drop the comment | learned; open decision |
| S-4 | 2026-10 | `sdk/token.ts :: decodeJwt` | unsigned base64 decode — fine for reading claims, a footgun for authz → doc: never use for authorization | learned; documented |
| S-5 | 2026-10 | `sdk/token.ts` cookie | `SameSite=Lax`+`Secure`, no HttpOnly (impossible by design), 60-day → acceptable; note the 60-day window | learned; accepted |
| S-6 | 2026-10 | Browser/v3 consent senders | wildcard consent/close metadata target → bind the intended recipient while preserving consent lifecycle | OPEN; [A](scans/2026-10/l1-sdk-a.md)/[F](scans/2026-10/l1-sdk-f.md), metadata hygiene, not demonstrated token exfiltration or token-specific KB violation |

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

### 2026-10-18: document/group/query endpoint L1 receipts

E/F/G distinguish generic authority delegation from proven local sinks. L1-E-01
records account-token URL transport: intentional body tokens and scoped HLS
capabilities do not exempt account credentials in query strings. Existing S7
already owns the related transport repair. L1-G-01 reproduces caller SQL literals
in INFO logging with separate request/stub-compiled assertions, not SQL injection
or demonstrated credential theft. Actual compiler preservation, log access and
retention remain unverified. F's unchecked helper boundaries remain L2 debt.

### 2026-10-18: import traces and compiler L1 receipts

L1-J-01 reproduces cross-job log attribution using two synchronized synthetic
job contexts, actual handlers/event functions and an in-memory insert sink.
Shared logger handlers lack a job/thread filter, so A's message is inserted into
A and B traces. Concurrency/overlap is a precondition; production concurrency,
cross-owner endpoint disclosure and historical exposure remain untested. The
old worker PASS is withdrawn: an owner gate on reads cannot isolate already
misattributed stored events. Preserve detailed per-job diagnostics in a fix.

K's parser still reads the whole remaining stream; that contradicts flat-RAM
durability prose but is reliability debt, not an added C+I finding. L's compiler
acceptance probes do not execute ClickHouse: qualified names, scalar functions
and settings are handoffs, not demonstrated raw-store access or injection.

### 2026-10-18: storage foundations L1 receipts

M/N/O account for ClickHouse lines 1-2412 without finding a demonstrated local
exploit. Legacy migration classification, member permission shortcuts, selected
tombstone reads, revocation ties and optional membership joins remain explicit
L2+ candidates, not blanket access-control failures. `read_documents` ranks
versions before filtering deleted rows; do not generalize prefilter behavior from
different getters. D80 social membership visibility and intentional public grants
must survive future fixes; no helper or migration is certified safe by this scan.

### 2026-10-18: storage reads/accounts/analytics L1 receipts

P/Q/R complete ClickHouse lines 2413-4944. Arbitrary-key forwarding to a fake
signer establishes local flow, not a reachable private-object read; relate it to
H's handler-level concern without double-counting a proven exploit. Recovery,
revocation, metadata, prepared-query and app/analytics authority still need real
caller/schema evidence. Analytics delivery candidates must honor the one-hour
same-type dedup and one-day preceding-delivery windows; merely passing a string
event type does not demonstrate counter inflation. No new confirmed finding or
whole-store PASS is claimed. All 59 API app files now have line-coverage receipts;
broader project L1, findings/fixes and required independent sign-off remain owed.

### 2026-10-18: broader backend inventory, RTC and bootstrap L1

[Backend inventory](scans/2026-10/l1-backend-inventory.md) accounts for 109
additional tracked runtime/configuration/dependency-manifest files, not scanned
or trusted by enumeration alone. It identifies the shipped Node share-preview
adapter as backend code rather than excluding it with the frontend.

RTC's 13 synthetic dependency cases support local routing/close behavior only;
unsigned provider selection, HTTP-status trust and asynchronous admission remain
**BP-3**, not new or closed findings. Actual PeerServer timing/traffic, verifier
trust and replay require L2+ evidence. B1's root/bootstrap credential fallbacks
expand **B-2**, values withheld; static port/socket declarations do not establish
deployed reachability or host compromise. Preserve legitimate local bootstrap,
operator overrides, HTTP development certify wiring and useful diagnostics.

### 2026-10-18: marketing API app L1 coverage

MA/MB/MC cover all 16 marketing API Python files/2,096 lines at `db325cd3c`.
The KB retires the HTTP/v2 importer; do not infer it is unmounted or active just
from either prose or retained source. MA adds B-2 default-credential evidence;
mapper URL/path/body propagation is not demonstrated SSRF/XSS/authority bypass.
Cleanup is attempted, not guaranteed; existence/source checks and errors affect it.

L1-MC-01 reproduces local ungated payout cancellation; L1-MC-02 reproduces repeated
caller-supplied commission arithmetic. Both are scaffold-state integrity findings
using synthetic records and inert persistence, not real provider money movement,
durable deployed corruption or proof of settlement authority. Stripe invocation
is commented out; the unsigned webhook stub reads no event and mutates no state.
No payment forgery follows from its acknowledgment. Preserve D57's deferred rails
and require proper authority/provenance before any future payment activation.

### 2026-10-18: shipped Node share-preview L1 receipt

The three preview adapter files/422 lines are shipped backend source, now covered
at `db325cd3c`; excluding them as frontend would have left a real inventory gap.
Pinned VM probes use inert fetch/HTTP sinks: specs retain synthetic markup/URLs
and fixed-origin anonymous calls, denied reads make generic cards, incoming auth
does not forward. These are local composition controls, not proof of renderer
escaping or actual public grants. Missing posts return generic cards/HTTP 200,
contrary to ghost-404 intent; this is correctness debt, not demonstrated private
content access. Preserve content-free private fallbacks while tracing real API,
renderer and routing boundaries at L2. No new confirmed vulnerability or PASS.

### 2026-10-18: D91 retires the unused marketing API

Caller tracing found no current frontend/SDK product operation using the service;
node imports, reporting and analytics already own those flows. D91 removes the
legacy service and its wiring, not the independent social preview server. The
old MA/MB/MC receipts remain historical at their pin. Removed source is not a
remediated deployed endpoint: live containers, historical data, external callers,
DNS/proxy records and credentials still require deliberate operational assessment.
L1-MC-01/02 are source-retired only, and shared B-2 remains OPEN elsewhere.

Refresh live inventory after the deletion/wiring edits; do not subtract removed
files and call them newly scanned. SDK exhaustive L1 is the next priority;
seed October SDK rows never established full current file coverage. See
`marketing-api-retirement.md` for preservation and cutover requirements.

### 2026-10-18: SDK L1 browser/token/RTC receipts

A/B/C at `caeed4427` cover browser, token/HTTP/export/type utilities and optional
RTC client. S-1 still permits synthetic hostile-origin token acceptance; different
username filtering is not sender verification. S-6 is wildcard consent/close
metadata hygiene, not token exfiltration or a breach of a token-specific rule.
A-01 and F-01 describe one consent-response integrity class in separate public
implementations; retain both locations under joint repair coverage, not duplicate
independent bugs. No forged server grant or valid credential demonstrated.

L1-SDK-B-01 proves __proto__ cookie parsing replaces the returned dictionary's
prototype and inherited token selection follows. Object.prototype is unchanged;
actual browser cookie planting and downstream authority remain unverified.
Unsigned UX decoding, JS-readable cookies/lifetime and JSON-body token transport
remain intentional. RTC fake-peer behavior is not a real impersonation/logout
exploit. Generated/copied bundles are explicitly mapped, not security-certified.

### 2026-10-18: SDK v3 source receipts complete

D/E/F finish all 1,683 logical lines of v3.ts, including unterminated EOF. No
method body is cut at the E/F boundary, although both belong to one factory.
F-01 and A-01 remain one response-integrity class in separate public consent
implementations; repairs must test both, preserving configured-origin legitimate
responses, unchanged return-run consent and gesture-driven group setup.
No callback result by itself establishes server permissions or authentication.

The merge helper mutates a shared permission array despite its purity description;
that is a proven local correctness defect, not a proven unintended server grant.
Cookie/state precedence differences are conditional helper-flow evidence, not
actual cross-account requests. Keep S-3 functional and S-6 metadata-only rather
than promoting them to disclosure. Published minimal replays are independent
from broader author-reported runs; neither covers shipped bundle correspondence.

### 2026-10-18: B-4 metadata-only source repair

Stop automatic request-body reads, response buffering/reconstruction, raw
path/header capture, unsigned JWT attribution and error/meta copies. Log only
allowlisted method, server route template, status, severity and response-availability
latency; preserve the table layout with content/attribution fields empty and return
the original response. Insert errors emit fixed diagnostics without traceback.
This retains useful signal without another credentials/content store; D41/D56 and
intentional JSON-body tokens remain unchanged. S-2's B-4 composition is addressed
for this middleware only, not all log producers or historical exposure.

Nine committed regressions fail on the pinned original and pass with repair;
the full API suite has 1,138 passes after syncing dev on 20.10.2026. Fresh same-model reviews do not constitute
the required model-diverse three-dry sign-off. Shutdown/disconnect, delayed/mounted routing and
real-storage integration remain untested here; the dated intent-risk acceptance
and re-open conditions are in the repair receipt. Deployment, retained logs,
backups, proxies and approved credential rotation remain separate obligations.

### 2026-10-20: SDK browser delivery prerequisite, not cookie closure

B-4 source repair is merged #1225; historical/operational exposure and sign-off
remain open. The next SDK repair cannot rely on source tests alone: a clean
pinned build found 16/17 outputs byte-equal but stale browser bundles/copies.
Aligning them also delivers existing-source analytics and older marketing-only
group/ICE/anonymous-read parity, so this is a separate prerequisite, not hidden
inside L1-SDK-B-01. Fresh-build tests compare all four browser files; the package
now produces its existing wapi alias explicitly. Public-copy refresh is documented.

L1-SDK-B-01 is still unfixed. Preserve the public cookie dictionary's ordinary
object behavior with safe own-property writes and explicit own-token selection;
do not import malformed-cookie, JWT-decoder, TTL or popup changes into that repair.
Six orphan declarations and docs RTC IIFE still need separate provenance work;
matching hashes are not security or deployed-version assurance.

Intent-risk acceptance, 21.10.2026: browser alignment could alter analytics
accounting, anonymous reads, group mutations, ICE and constructor registration;
real-browser/server flows and deployed/cached versions are not verified here.
Accepted for this bounded correspondence prerequisite because outputs reproduce
existing source and API/request controls are pinned, not because integration is
proven. Revisit on source, toolchain, producer/copy changes or integration failures;
release/deployment evidence and required security sign-off remain open.
CI's floating Bun 1.4.3 reproduced hash drift; SDK metadata/CI now pin producer 1.3.14. Compiler upgrades must deliberately rebuild artifacts, not weaken equality.

### 2026-10-21: SDK-B-01 own-property repair (local, not deployed)

Alignment #1248 is merged. [Cookie repair](scans/2026-10/repair-sdk-b01-cookie.md)
uses data-property definitions to prevent inherited setters and an own-token check
to reject ambient inherited credentials. Keep ordinary objects, existing parsing,
SSR and own-token coercion; a null-prototype/API change is unnecessary. Source and
five generated runtimes deny the synthetic exploit; actual cookie planting and
server authority remain unproven. Source repair merged #1255 (3.244.1); no deployment or security PASS.

Intent-risk acceptance, 21.10.2026: real browser/PWA restoration, supported-engine
integration and deployed/cached versions remain untested. Accepted for bounded local
repair because public signatures/own-token behavior and generated correspondence
are pinned; not acceptance of a deployment guarantee. Reopen on cookie-helper,
toolchain or browser/session changes/failures; rollout and model-diverse sign-off owed.

### 2026-10-27: B-8 fixed-output settings diagnostic (local)

[B-8 repair](scans/2026-10/repair-b8-settings.md) replaces the globals dump with
a fixed load-completion message. Script/module canary regressions are red before,
green after; normal imports/overrides/derived config unchanged. B-2 defaults,
issuer trust, environment type erasure and historical exposure remain OPEN.
This independently safe hygiene slice does not discharge higher-impact debt.

Accepted intent risk, 27.10.2026: external tooling parsing the old dump may break;
retaining credential-bearing output is unsafe and documented admin configuration
is unchanged. No repository invocation found by fresh review; external/deployed
consumers unverified. Reopen on an operational dependency with a separately
specified safe diagnostic, not a globals-dump restoration. Source repair local,
deployment/log retention/rotation and model-diverse sign-off still owed.

### 2026-10-27: Current L1 read pass and claim calibration

[Current ledger](scans/2026-10/l1-current-index.md) accounts for all selected
protocol paths, including post-scan OAuth and packaging/artifacts/deploy edges.
Signature verification again accepted expired custom claims at OAuth authorize
(D-01 root); fake storage limits issuance claims. A forced two-active-snapshot
code replay proves missing local atomic consumption, not real ClickHouse issuance.
Schema/version-column and delegated bulk-tombstone/key defects need real store
evidence. Operator URI userinfo reaches successful audit/export outputs; protected
account backup contents are intentional, redundant connection credentials are not.

Fresh same-model review corrected two overclaims: refresh invalidation alone is
availability/order, not demonstrated C+I; a documented exemption's deliberate skip
is not an accidental security bypass. Backup mode risk remains conditional absent
filesystem evidence. Exact copy hashes and lock syntax are not provenance or
external-code assurance. Keep read completion, finding repair, deployment and
model-diverse sign-off separate; pending receipts do not pass the L1 gate.

### 2026-10-27: O10 drift rescan

[O10 review](scans/2026-10/l1-o10-review.md) at `1332abc67` verifies new source/
artifact correspondence without assuming helper safety. Wrong-path/concurrent
popup acceptance is conditional callback-integrity debt; state is explicitly
caller-managed, not a mandatory new policy. Refresh material/client cache survives
signout; a denied-server control leaves access null, so real authority after logout
is unproved. First-use code exchange requires a prior delegated token: confirmed
correctness/design blocker, not a security exploit. Inherited refresh selection
needs separate ambient pollution; repaired cookie parsing did not regress.
Selected accounting is now 171 paths/31,537 lines, security gate still OPEN.

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
