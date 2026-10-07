# Auditing Credential Boundaries

An operator needs to know whether a repair closes the demonstrated attack,
without confusing green unit tests with a secure production browser session.
The practical unit of evidence is a boundary, an exploit attempt, and a receipt
showing what actually happened on both sides.

Suppose a report says a session appeared in a URL or diagnostic. First identify
the owner of the credential and every recipient, then reproduce with synthetic
credentials in a controlled fixture. Do not spread the original secret into
the very logs and tickets intended to investigate it.

This runbook applies [AI Use Theory](../../../ai-use-theory/ai-use-theory.md):
orient, generate, compare, repair, supported by KB -> logs -> tests -> features.
It covers credential-boundary verification, not a general penetration-test
certificate. Paths and commands below are repository-root references unless
a working directory is explicitly specified.

## Orient: Establish The Contract

Read [overview.md](overview.md), [credentials.md](credentials.md), and
[rtc-admission.md](rtc-admission.md), then the matching implementation.
Read [thesis.md](../../../strategy/thesis.md): node-readable content is intended;
unauthorized document access, credential disclosure, and unsigned authority are not.
Read the recent changelog and [findings receipt](hardening-2026-10.md) before opening work.

Write down the actor, capability, intended recipient, verifier, and observable
failure. Distinguish a password, session JWT, admission ticket, presigned URL,
remembered account identifier, and unverified metadata. They are not interchangeable.

Use these source seams rather than historical line-number citations:

| Boundary | Source and symbols |
|---|---|
| Cookie and metadata | `sdk/src/token.ts`: `cookieDict`, `decodeJwt`, `setTokenCookie` |
| Popup receiver | `sdk/src/browser.ts`: `isTrustedPopupMessage`, `authListen` |
| ESM consent/opener | `sdk/src/v3.ts`: `contractRequest`, `contractOnReady` |
| HTTP recipient | `sdk/src/http.ts`: `authPost`, `authGet`, `Web10Error` |
| Implicit forwarding | `sdk/src/v3.ts`: `createV3Client`, `pingAppRegister` |
| Local signature | `api/app/services/auth.py`: `certify`, `decode_token` |
| RTC verified identity | `api/app/endpoints/system.py`: `rtc_authorize` |
| Pre-upgrade ticket gate | `api/rtc/server.ts`: `createRtcServer`, `verifyClient` |
| RTC renewal | `sdk/src/rtc/index.ts`: `initP2P`, `destroy` |
| Backend log sink | `api/app/middleware.py`: `log_requests`, `_redact` |
| Authenticator custody | `ui/src/lib/tokenVault.ts`; `Interface.tsx`: `I.logout` |
| Social diagnostic sink | `marketing/web10-social/src/lib/analytics.ts`: `reportNodeError` |

Confirm the exact checkout and dirty-worktree state. A sibling agent may be
changing group-detail transport while an older test still expects query auth.
Record that mismatch; do not silently undo their code or treat docs as a deploy
receipt. A signing-key/configuration flaw is not repaired by an SDK transport fix.

## Generate: Produce Safe Signal

Use generated test sessions and placeholder credentials, never live accounts.
For injected echoes, use a distinct synthetic marker and assert its absence
from every sink. Preserve outcome, status, method, destination, timing, and
registration state, not the bearer value.

Logging should show before/after asynchronous boundaries and conditional paths.
Use filterable prefixes such as `[wapi-rtc]`, `[rtc]`, and `[rtc-authorize]`.
Never log whole Axios/fetch errors without review: clients may retain request
bodies. Keep useful sanitized instrumentation after the repair.

`log_requests` parses complete request and response JSON before truncation.
It collects strings beneath normalized credential-field names from both sides,
redacts those names and echoed values recursively, and removes validation
`input` values. It redacts error details and metadata as well as body columns.
Non-JSON and excessively nested bodies are omitted safely; response bytes are
preserved. `_extract_user_key` remains unsigned log attribution, not identity proof.

This mechanism is not universal secret detection. An unknown credential field,
a secret present only in a free-form string, another service's logs, or historical
records require separate scrutiny. Truncation alone is not redaction.
SDK raw errors and app diagnostic reporters remain OPEN independent sinks.

## Compare: Negative Test Matrix

For each attempted exploit, collect the response and the protected downstream
side effect. A 401 after registration is not a successful pre-admission denial.

| Attempt | Required observation | Reference suite |
|---|---|---|
| Forged popup origin | No cookie write, callback, readiness, or consent | `sdk/src/browser.test.ts` |
| Correct origin, other/null source | Same denial; both sender properties matter | `sdk/src/browser.test.ts` |
| Closed/replaced/blocked popup | No stale-window authority | `sdk/src/browser.test.ts` |
| Valid popup then same username | Cookie refresh; deduped callback, not crypto proof | `sdk/src/browser.test.ts` |
| ESM forged consent/opener reply | No completion from unrelated window/origin | `sdk/src/browser.test.ts` |
| Malformed cookie/UTF-8 JWT metadata | Safe parse; no authorization inferred | `sdk/src/token.test.ts` |
| 307/308 after credential POST | No second-recipient body replay | `sdk/src/http.test.ts`; RTC upstream test |
| Ambient cookie present | Credential helper fetch uses `omit` | `sdk/src/http.test.ts` |
| Unsigned/forged/expired/foreign RTC JWT | 401; no provider-selected network fetch | `api/tests/test_rtc_authorize.py` |
| Anonymous RTC session | No authenticated peer identity | `api/tests/test_rtc_authorize.py` |
| Custom `expires` is past in shared v3 helper | Must reject before deriving a principal; current helper does NOT enforce this | Open I5 item; local probe in the findings receipt |
| Ticket missing/JWT-shaped/duplicate query | No upgrade, `OPEN`, or registry entry | `api/rtc/server.test.ts` |
| Wrong ID, then correct-ID replay | First attempt burns ticket; both denied | `api/rtc/server.test.ts` |
| Exact expiry deadline/replay/active duplicate | No additional signaling admission | `api/rtc/server.test.ts` |
| Verifier redirect/malformed output | Fail closed; generic error, no credential echo | `api/rtc/server.test.ts` |
| Capacity/body/payload excess | Bound work; oversized message not delivered | `api/rtc/server.test.ts` |
| RTC disconnect/logout during renewal | Fresh ticket/backoff; no logout resurrection | `sdk/src/rtc/index.test.ts` |
| Social logout | Connector destroy and local memory cleanup | Social `src/__tests__/data/p2p.test.ts` |
| Body/validation/error credential echo | No marker in stored log fields; same response bytes | `api/tests/test_log_redaction.py` |
| Unauthorized document/query read | Author/group scope remains enforced | API conformance/access/query suites |

The group-detail transport migration adds an independent matrix: anonymous
GET, POST with missing/null/empty token, valid member, valid non-member,
invalid non-empty token, nonexistent ID, and a query `token` key on either method.
Verify token-free request URLs and unchanged metadata/content semantics.
Inspect `api/tests/test_v3_endpoints.py` group-detail tests,
`sdk/src/group-detail.test.ts`, and social
`src/__tests__/data/groupDetailTransport.test.ts`; the screen mocks alone do not
witness a token-free URL. Add missing transport cases through their owners.
The current literal-membership envelope is a caveat, not a reason to expand
access while moving the credential into a body.

Include positive controls. An all-denied implementation can pass a collection
of negative tests while breaking legitimate login or peer readiness.
Use two deliberately different usernames/providers for account-custody checks;
username-only dedupe does not cover cross-provider identity equivalence.

## Commands And Receipt Scope

Run each command in the named working directory. The SDK/social commands use
the package-local installed runner; the API uses its uv environment.
Dependencies must be installed first. Do not launch a foreground dev server.

Working directory `sdk/`:

```sh
bun run test:run
bun run typecheck
```

Working directory `api/rtc/`:

```sh
bun run test:run
```

This invokes test TypeScript checking and Bun tests, including the Python
subprocess receipt. That integration case needs `uv` and API dependencies.

Working directory `api/`:

```sh
uv run pytest tests/test_rtc_authorize.py tests/test_log_redaction.py -v
uv run pytest tests/test_auth_services.py tests/test_certify_endpoint.py -v
uv run pytest tests/test_v3_conformance.py tests/test_v3_access.py tests/test_safe_query.py tests/test_query_endpoint.py -v
uv run pytest tests/test_v3_endpoints.py -k detail -v
uv run pytest
```

Working directory `marketing/web10-social/`:

```sh
bun run test:run
bunx tsc --noEmit
```

For authenticator vault behavior, working directory `ui/`:

```sh
bun run test:run src/__tests__/tokenVault.test.ts
```

Check package scripts before reusing commands after tooling changes. The API
fixtures mock storage dependencies; passing permission tests is not proof of
a production database, reverse proxy, or complete live stack configuration.
SDK HTTP unit tests inspect mocked fetch options, not real browser redirect
delivery. The RTC suite separately witnesses a real Axios 307 refusing its
second recipient; browser 307/308 verification remains a distinct receipt.

The RTC integration test starts the real Python authorization router and local
HTTP server, verifies a signed session, runs the actual SDK ticket exchange,
and drives a real WebSocket to `OPEN`. Unused storage imports are mocked and
the PeerJS client is a signaling adapter. This is meaningful admission evidence,
not full browser login, full PeerJS WebRTC/data-channel delivery, or production
TLS/proxy testing. Do not write a receipt that claims those missing scopes.

Record commit/checkout, runtime versions, commands, outcomes, mocks, and omitted
scopes. Avoid exact permanent test counts; cases change. For PR failures use
`scripts/ci-failures.sh <PR_NUMBER>` and verify every check, including optional
ones. A green historical changelog is not evidence for a newer dirty checkout.

## Repair: Close The Boundary, Then Recheck

Change the smallest owning seam, add a regression that witnesses the exploit,
and rerun its positive control and relevant neighboring permission suites.
Do not add app-specific concepts to `api/` to repair a client flow (D60).
Do not remove useful logs or turn off D56 telemetry to hide credential echoes.
Content-blind recording stays enabled; diagnostic inputs need proper sanitizing.

Generated bundles are part of the boundary. Check `sdk/package.json` build
scripts and tracked `sdk/dist` outputs against source, both public `wapi.js`
copies, and `marketing/marketing-ui/public/docs/rtc.js`. Review runtime behavior
under deployed Bun, `ws`, PeerJS server/client, Axios, and Express versions,
not merely their intended configuration. Preserve the Bun message-size guard.

Coordinate API/RTC/SDK/demo deployment together. Verify required
`CERTIFY_BASE_URL` stack settings, external HTTPS/WSS, denied JWT fallback,
and instance affinity or shared atomic consumption before adding replicas.
Document uncertainties and hand the coordinator a scoped receipt; don't edit
someone else's findings ledger or declare an in-flight migration shipped.

## Historical Exposure Is A Separate Operation

The logging repair neither purged old credential-bearing logs nor rotated
credentials. It prevents recognized new disclosures in that middleware only.
If old logs may contain secrets, triage privately with the operator and limit
access immediately. Preserve necessary evidence in restrictive storage with
explicit access and retention decisions; do not paste raw rows into public PRs.

Inventory affected services, time range, credentials, viewers, exports, backups,
and downstream sinks. Use sanitized incident identifiers in shared work.
Determine whether a credential is still usable and which authority can revoke
it. Local cookie removal is not revocation of a JWT already copied elsewhere.

Plan cleanup, session invalidation, signing-key rotation, and other credential
rotation as deliberate operations, separately approved and checked for service
impact. Signing-key rotation can invalidate a node's users, not just one token.
Preserve evidence before approved retention cleanup and account for replicas
and backups. This runbook provides no automatic destructive cleanup commands.

Close an incident only with distinct receipts for the software repair, deployed
cohort verification, exposure assessment, and any approved cleanup/revocation.
Unresolved issuer configuration, raw SDK/app diagnostics, XSS/script trust,
authenticator wildcard sending, or missing full-browser tests stay explicit
uncertainties. A tidy document is not an authorization to call them solved.
