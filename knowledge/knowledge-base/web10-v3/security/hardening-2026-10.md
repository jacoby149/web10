# October Credential Hardening Receipt

The operator asked for the SDK to be secure and for the social app not to keep
another credential store. The investigation showed why those are different
questions: an app can avoid a second persistent vault and still leak its
session through a request URL or diagnostic sink.

This is the implementation record for the work in this workspace on
06.10.2026. **Fixed locally is not deployed, independently audited, or proven
secure against every attacker.** The changes are uncommitted at this receipt.
The changelog's `3.222.1` and `4.0.0` entries identify local repair batches;
they are not evidence of a completed production rollout.

## Read The Correct Layer

| Need | Canonical document |
|---|---|
| Security invariants and map | [overview.md](overview.md) |
| Who holds and receives credentials | [credentials.md](credentials.md) |
| Exact signaling admission protocol | [rtc-admission.md](rtc-admission.md) |
| API diagnostic sanitizer | [logging.md](logging.md) |
| Repeatable security verification | [audit-runbook.md](audit-runbook.md) |
| Group-detail transport and access qualifications | [../groups/detail.md](../groups/detail.md) |
| Original, historical October findings | [../../../security-audit/october/README.md](../../../security-audit/october/README.md) |

The historical audit uses pre-fix line numbers and contains conclusions that
this continuation corrected. Keep it as provenance, not as the description of
the current implementation. Use file/symbol references below to locate code.

## Findings And Repairs

### H1: An Auth Message Was Its Own Proof

The browser SDK accepted `type: 'auth'` plus a token without authenticating the
sender. Username mismatch checks did not protect first login or same-user
substitution. A hostile page needs a reference to the app's window; this is not
proof that any arbitrary forged JWT would pass backend signature verification.

**Fixed locally:** `sdk/src/browser.ts` tracks the SDK-opened window and exact
authenticator origin. Both `event.source` and `event.origin` must match, and
there must be an active popup. Malformed token metadata is refused. The
one-argument listener remains usable because `contractRequest` fallback also
opens through the trusted-popup path. Regression: `sdk/src/browser.test.ts`.

### H2: Readiness And Consent Could Be Spoofed Or Broadcast

Readiness and consent-response listeners also lacked sender binding; some
contract/close messages used `'*'` as their destination.

**Fixed locally:** browser and ESM consent listeners bind origin AND source.
Contracts and close messages use exact targets. Legacy `contractOnReady` uses
the browser referrer origin and fails closed without it. This is SDK behavior,
not a repair of every message sender in the authenticator. Regression:
`sdk/src/browser.test.ts`, including legitimate consent and deduped callbacks.

### H3: A Redirect Could Replay The Credential Body

The SDK relied on fetch's default redirect following. A 307/308 can replay the
same JSON token/password body to another destination; header stripping does not
protect a credential embedded in JSON.

**Fixed locally:** `authPost`, `authGet`, and registration use
`redirect: 'error'` and `credentials: 'omit'`. RTC exchanges similarly reject
redirects, with bounded timeouts. SDK option fixtures and the real RTC Axios
redirect fixture cover their respective scopes. A real browser redirect test
is still a separate missing receipt; direct app fetches are not automatically
wrapped by these SDK settings.

### H4: Cookie Parsing And Metadata Were Too Permissive

Unencoded cookie values could alter cookie syntax; malformed unrelated cookies
could throw from decoding; an ordinary object allowed special cookie names to
affect its prototype. JWT parsing was not proper UTF-8 base64url handling.

**Fixed locally:** percent-encode values, tolerate malformed cookie encoding,
use a prototype-free dictionary, and decode only object-shaped three-part JWT
metadata with UTF-8/base64url support. The decode remains unverified, and expiry
hints remain fail-open as documented. No HttpOnly isolation or shorter server
TTL was introduced. Regressions: `token.test.ts` and existing token tests.

### H5: RTC Put The Whole Session In Its URL

PeerJS's `token` option becomes a WebSocket query parameter. The SDK originally
supplied the session JWT and label. URL-recording infrastructure could retain a
reusable API credential. Actual production retention was not demonstrated.

**Fixed locally:** exchange the session in a POST body for a 256-bit opaque,
ID-bound, one-use, 30-second ticket. Only that ticket enters signaling's URL.
It cannot authenticate ordinary API requests. New-ticket reconnect, backoff,
localhost-only plaintext exceptions, and logout cancellation are tested.
Admission expiry is not continuous socket authorization or global revocation.

### H6: RTC Verification Happened After Admission

The old `connection` callback verified asynchronously after PeerJS had already
registered the peer and could deliver signaling. Its default verifier address
was selected from an unsigned token's provider, permitting an untrusted
recipient to assert success and creating an outbound-request trust problem.

**Fixed locally:** `/ticket` asks only the fixed configured API
`/rtc/authorize`; the API verifies a local session and derives identity.
`WebSocketServer.verifyClient` consumes the ticket BEFORE HTTP 101, registration,
or `OPEN`. Raw JWTs, expired/replayed/wrong-ID tickets, malformed queries, and
verifier failures do not reach admission. Resource bounds and disabled discovery
are tested. Source: `api/rtc/server.ts`; regression: `server.test.ts`.

### H7: Body Transport Composed With Credential Logging

Tokens/passwords in request bodies, newly issued response tokens, and credential
echoes could be persisted by API middleware in ClickHouse.

**Fixed locally:** recognized credential fields and their echoed string values
are redacted recursively before truncation, including validation input, errors,
and metadata. Non-JSON/excessively nested diagnostic bodies are omitted without
changing responses. Source: `api/app/middleware.py`; regression:
`api/tests/test_log_redaction.py`. This does not erase prior records or rotate
anything already exposed. See [logging.md](logging.md) for exact limits.

### H8: Social Group Detail Bypassed SDK Transport

`readGroupDetail` read the cookie directly and added the session to a GET query.
This is a background API fetch, not address-bar navigation; ordinary browsing
history exposure was not demonstrated. Proxy/access/diagnostic URL capture is
the relevant risk, and the credential was a session token, not a group-only key.

**Fixed locally:** typed optional-token POST `/v3/groups/detail`, SDK
`getGroupDetail`, and social delegation through that method. Anonymous GET
remains for the marketing site. Both methods reject even empty/duplicate token
query keys with a safe 400, and present invalid body credentials fail closed.
The shared detail implementation retains metadata/unlisted/member behavior;
it does not silently grant broader access. API, SDK, social transport, and E2E
floor specifications were updated. Existing raw `getGroup` remains distinct.

### H9: The Public Membership Comment Promised A Token It Did Not Send

`byUserGroups` used an anonymous GET while comments described authenticated
transport. This was a functional/documentation gap, not demonstrated disclosure.

**Corrected locally:** document anonymous public-visibility reads accurately.
No query credential was added to make the old comment true.

### H10: Verified Decode Does Not Enforce Custom Session Expiry

**Confirmed OPEN, urgent:** shared `v3/endpoints/auth_helper.py` `user` and
`user_or_anon` derive a principal from verified decode without calling
`certify`. Web10's expiry field is `expires`, not JWT's standard `exp`.
Signature verification alone therefore does not establish the intended I5
expiry/provider checks.

A local synthetic-session probe with `expires: '2000-01-01T00:00:00'`
returned `audit-synthetic-user` from `user_or_anon`. No credential was printed,
no live account was used, and no production data access was attempted. This is
direct evidence of the helper gap, not an end-to-end exploit receipt for every
caller. RTC and the repaired group-detail path explicitly call `certify` first;
the remaining callers require a dedicated repair and audit.

For a future regression, mint an expired synthetic session under the fixture
key, exercise BOTH shared helpers and their real route callers, and require
401 before any group/document lookup or mutation. Include wrong-provider,
malformed/missing custom expiry, standard-expiry, and anonymous positive cases.
Do not make this disappear by shortening cookie storage or checking the SDK's
unverified expiry hint. The boundary must be on the server.

## Findings Not Closed By These Repairs

| Boundary | Actual remaining issue or qualification | Next verification |
|---|---|---|
| SDK/app diagnostics | Raw `Web10Error` text and unredacted app reporters can retain credential echoes | Inject synthetic secrets into API errors and rejected promises; inspect every sink |
| Shared principal derivation | Signature verification does not enforce custom `expires` or provider in the shared helper; expired synthetic principal confirmed | Repair helper and audit callers before declaring I5 enforced |
| Authenticator sender | `I.goToApp` has a wildcard target fallback; readiness also uses wildcard | Verify opener/redirect/referrer binding and navigation races; repair sender separately |
| Identity dedupe | Browser mismatch/dedupe compares username, not provider + username/scope | Exercise cross-provider same-name sessions before changing identity semantics |
| Configured recipients | Client creation can forward the cookie to its configured API; RTC receives it in `/ticket` | Establish trusted-origin/federation policy before arbitrary-node fan-out |
| Issuer/signing configuration | HS256/federation and effective signing-key provisioning remain outside SDK repair | Private deployed-config/issuer review and independently gated migration |
| JavaScript custody | Cookie, runtime state, vendor scripts, XSS, and the authenticator vault share script trust | Frontend render/script/dependency audit, not a claim of HttpOnly isolation |
| Logout/revocation | Local teardown does not revoke all copied JWTs; vault accounts remain resumable | Explicit revocation policy and account-vault tests |
| Group detail model | Literal-membership envelope is narrower than intended principal-class detail semantics; recent preview is still the existing `posts` service | Dedicated I3/D60 review; do not conflate with transport migration |
| Historical exposure | Old API/proxy logs, backups, or exports may retain usable credentials | Approved incident assessment, cleanup, and credential invalidation |
| Deployment scale | RTC tickets are process-local; replicas need affinity/shared atomic state | Multi-instance and rolling-restart receipt |

No production exploit or vendor exfiltration is asserted merely because an
unsafe sink exists. Conversely, absence of an observed leak is not a repair.

## Verification Receipt

The latest local checkout passed 214 SDK tests, 1,185 API tests, 1,385 social
tests, 168 authenticator tests, and 286 marketing UI tests. The final RTC suite
passed 13 HTTP/WebSocket integration cases. SDK/API/social suites include group transport
positive and negative cases, credential-log preservation tests, and the API
permission/conformance suite. Test counts describe this receipt, not a permanent
acceptance contract. Reproduce using the commands in [audit-runbook.md](audit-runbook.md).

The RTC test starts the real Python authorization router, uses real signature
verification, and drives the actual SDK exchange into a real WebSocket. Unused
storage imports are mocked; the client-side peer is a signaling adapter. It is
not a complete browser login or WebRTC data-channel test. API permission tests
also use fixtures, not the production database.

The group E2E floor specifications were migrated and Playwright discovered all
36 cases across the two selected specs, but the Docker browser suite
has not been executed for this checkout. Production TLS/proxy/telemetry behavior,
historical retention, dependency supply-chain review, and an independent external
audit remain unclaimed. These gaps should be gates, not footnotes lost at release.

The separate E2E-wide `npx tsc --noEmit` check fails in untouched exporter,
gauntlet/media, messages, profile, Stripe, and takeout fixtures. The same command
was run in a detached `origin/dev` checkout at `86361ea88` and produced the same
errors; none are claimed repaired by this branch. Selected Playwright discovery
is not a substitute for a clean E2E typecheck or executing the Docker suite.

## Deployment And Future Repairs

Deploy the API, RTC, SDK, social consumer, and demo/browser bundles together.
JWT signaling and credential-bearing group GETs are deliberately rejected;
there is no insecure compatibility fallback. Review generated npm/browser files,
not just TypeScript. D89 records the RTC decision in `strategy/decisions.md`.

The next bounded repair is diagnostic redaction plus authenticator sender review,
with separate tests for each owning boundary. Keep unresolved items on the lane
board, and attach distinct receipts for code repair, deployed verification, and
any historical-exposure operation. Nobody benefits from a reassuring fiction.

**Coordination:** [PR #1157](https://github.com/jacoby149/web10/pull/1157) changes
API security and overlapping KB/bundle files. The open API observations here
describe this branch's checkout, not an assumed result after that PR merges.
Reconcile its fixes and ownership before launching duplicate API work or merging
the overlapping cohorts; this receipt is not an instruction to get ahead of it.
