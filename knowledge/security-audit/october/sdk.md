# October 2026 Audit — SDK (`sdk/`)

## Follow-up: 06.10.2026

The original findings below describe the pre-fix code; their line numbers are
historical. This follow-up is a static SDK and social credential-custody audit,
not an independent penetration test or a security certification.

**Fixed in this workspace:** S-1 and S-6. `sdk/src/browser.ts` now tracks the
opened popup's origin and window reference; auth, readiness, and consent
responses require BOTH. No popup means no token acceptance. Contract delivery
and close messages use exact origins. The ESM `contractRequest` has the same
sender checks; legacy opener delivery is referrer-origin-bound and fails
closed without a referrer. Regression tests drive forged origins, other
windows, null sources, popup replacement, blocked popups, valid login,
same-user deduplication, and both browser/ESM consent paths.

**Also fixed:** `sdk/src/http.ts` and the registration fetch in `v3.ts` reject
redirects (`redirect: 'error'`) and omit ambient cookies. Otherwise 307/308
responses could replay token/password JSON bodies to another recipient.
`token.ts` encodes cookie values, ignores malformed percent-encoded cookies,
uses a prototype-free cookie dictionary, and decodes UTF-8 base64url JWT
metadata with an explicit warning against authorization use. S-3's misleading
comment is corrected: `byUserGroups` is anonymous, not a token-bearing GET.
Source fixes are rebuilt into `sdk/dist` and both tracked public `wapi.js`
copies; source-only repairs would leave the deployed auth path vulnerable.

**RTC continuation:** the old RTC check ran AFTER PeerJS registration and
selected its default verifier URL from unsigned claims. Both are removed.
`api/rtc/server.ts` issues 256-bit opaque, ID-bound, one-use tickets after
calling the fixed API `/rtc/authorize`; the ticket expires in 30 seconds and
is consumed before WebSocket upgrade. The SDK puts only this ticket in the
URL, uses HTTPS/WSS outside localhost, and obtains a fresh ticket for reconnect.
Social logout destroys the peer and cancels renewal. The demo's `rtc.js` is
rebuilt from the same SDK source. Tickets cannot be used as API sessions.

**Backend logging (B-4/S-2) fixed:** credential fields and echoed values are
redacted recursively in request/response logs, validation inputs, error
messages, and metadata before truncation; non-JSON bodies are omitted. Actual
HTTP responses are preserved. Existing logs are NOT purged and already-exposed
credentials are NOT rotated by this change.

**Group-detail transport fixed locally:** SDK `getGroupDetail` sends optional
credentials only in POST JSON; the social wrapper delegates to it. Anonymous
GET remains, while GET and POST both reject any query `token`. Body credentials
are explicitly certified for signature/provider/custom expiry before principal
derivation. The existing member/unlisted/metadata semantics are retained, with
the literal-membership envelope qualification documented separately.

**The canonical implementation record is now the KB:**
[`security/hardening-2026-10.md`](../../knowledge-base/web10-v3/security/hardening-2026-10.md)
maps every finding to its repair, owning code, tests, rollout requirement, and
unresolved boundary. The linked credential, RTC, logging, and audit-runbook
documents explain the mechanics and future verification procedure in depth.

**Deployment:** API, RTC, SDK, and consumer RTC bundles must deploy together;
legacy JWT signaling is rejected. `CERTIFY_BASE_URL` is required and configured
in all checked compose stacks. Ticket state is process-local and bounded;
restart revokes it. Multiple RTC replicas need affinity or a shared atomic
store. Admission expiry does not disconnect an already-admitted peer, and
does not provide server-side revocation of an existing socket.

**Still open, in priority order:**

1. **Shared-helper expiry enforcement (I5):** v3 `user`/`user_or_anon` verify
   signatures but do not themselves certify custom expiry/provider. A local
   expired synthetic session still resolved to a principal. Group detail and
   RTC explicitly certify first; other callers need a dedicated repair/audit.
2. **Authenticator sender:** `I.goToApp` retains a wildcard target fallback
   when there is no referrer. SDK receiver fixes do not repair that sender.
3. **Recipient trust** (`sdk/src/v3.ts` client construction/registration). A configured
   `apiOrigin` receives the cookie token, including on the automatic registration
   ping. Today this is caller-supplied configuration, not a destination selected
   by a document ID. Never derive it from untrusted content. Federation needs
   an explicit credential-recipient policy before arbitrary-node fan-out.
4. **Diagnostics and XSS** remain independent app boundaries. The SDK keeps
   raw API error bodies (`http.ts`); the social error reporter forwards strings
   without credential redaction (`src/lib/analytics.ts:188-199`). An actual
   credential-bearing diagnostic was not demonstrated. XSS/third-party script
   compromise can read the cookie; masking telemetry content is not sandboxing.

**Social credential custody:** no app-owned password persistence or token copy
in localStorage/sessionStorage/IndexedDB was found. Login uses the authenticator
popup; SDK code persists the cookie. The app DOES handle credentials itself:
`src/interfaces/auth.ts:175-178` copies the cookie into the data-client state;
`src/data/{ads-catalog,moderation,imports,posts}.ts` contain direct authenticated
requests outside SDK transport. Logout clears the local cookie/client token,
not proven server-side revocation. Therefore "SDK secure => social secure" is
false even without a second persistent credential store. The authenticator's
separate account vault is outside the social origin and outside this pass.

**Verification:** 214 SDK tests, 13 real RTC HTTP/WebSocket tests, all 1,185 API
tests (including conformance/permissions), and 1,385 social tests passed.
Typechecks, Ruff on touched Python files, and SDK/RTC builds passed. The RTC
suite starts the real Python authorization router (unused storage imports
mocked), verifies a signed session, and drives the actual SDK ticket exchange
into a real WebSocket admission. It also witnesses pre-upgrade denial, replay,
expiry, wrong-ID, capacity, and verifier redirect failures. SDK tests cover
fresh-ticket renewal/backoff/logout. Full browser login, WebRTC data-channel
round-trip, and production proxy behavior are NOT covered by this pass.

Pre-PR review additionally moved ticket issuance AFTER ICE configuration: a
slow `/ice` call must not consume the 30-second ticket window before PeerJS
starts. A synthetic 31-second ICE delay now exercises that ordering.
Coordinate overlapping API/KB repairs with PR #1157 before acting on the open
API findings; their status is scoped to this checkout.

## Historical Findings (05.10.2026)

The SDK (`wapi.js`) is the client-side trust surface: it stores the token,
sends it, and receives it from the auth popup. It is small (~2.4k LOC source)
and **all of it** is security-relevant. The KB's own security model
(`knowledge-base/web10-v3/security/overview.md:86-98`, "Token Security") is the
specification — and in two places the code does **not** do what the KB says it
should.

## The token lifecycle (what the code actually does)

1. **Login** — `v3.ts` `login()` → `setToken(res.token)` (`v3.ts:711`).
2. **Store** — `setToken` writes it to a cookie: `setTokenCookie`
   (`token.ts:46-52`):
   ```js
   const secure = location.protocol === 'https:' ? 'Secure;' : ''
   document.cookie = `token=${token};${secure}path=/;max-age=${age};SameSite=Lax;`
   ```
   `SameSite=Lax`, `Secure` on HTTPS, **no `HttpOnly`** (impossible — JS must
   read it), 60-day max-age.
3. **Send** — every call puts the token **in the JSON body**:
   `authPost(`${apiOrigin}/v3/${action}`, { ...body, token })` (`v3.ts:637`).
   Not a header, not a cookie (the cookie is the *store*; the body is the
   *transport*).
4. **Receive from popup** — `authListen` (`browser.ts:84-133`) listens for a
   `postMessage` of type `auth` carrying a token, and calls `setTokenCookie`.

The cookie flags are fine for the model (S-5). The transport (body) is the
deliberate CORS defense (S-2). The two real problems are **where the token is
received** (S-1) and **what the KB promises vs. what the code does** (S-1, S-6).

## S-1 — High — `authListen` accepts a token from `postMessage` with NO origin check

`browser.ts:84-133`:

```js
function authListen(onSignedIn) {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'auth' && e.data?.token) {
      const incoming = decodeJwt(e.data.token)
      const current = readTokenCookie()
      const currentDecoded = current ? decodeJwt(current) : null
      if (currentDecoded?.username && incoming?.username &&
          currentDecoded.username !== incoming.username) {
        // reject — identity hijack
        return
      }
      setTokenCookie(e.data.token)   // ← stored on a type check alone
      ...
```

The only gate is a **username-match** check: reject if the incoming token's
user differs from the current user. There is **no `e.origin` check**.

**Why this is a real hole, not a theoretical one:**

- The KB's own model (`overview.md:96`) says: *"postMessage tokens are only
  accepted from the configured `authOrigin`."* The code does not check
  `e.origin` at all. **The code does not match the KB.** That is the finding,
  stated against the specification.
- The username-match check does **not** close it:
  - **First login** (no current token): `currentDecoded` is null → the mismatch
    check is skipped → **any** `auth` message with a token is accepted and
    stored. A malicious page that can post to the app's window can plant a
    token on first login.
  - **Same-user token swap:** if the attacker already holds a token for the
    *same* user (e.g. from a lower-privilege context, or the user is logged in
    on a compromised tab), it passes the match and is stored.
- `window.addEventListener('message', …)` receives from **any** window that has
  a reference to the app's window. The auth popup has one (`window.opener`), but
  so can any page in the opener chain. Without `e.origin === authOrigin`, the
  app cannot tell the real popup from an impostor.

**The fix is one line** (and it's what the KB already promises): capture the
`authOrigin` in `authListen` and require `e.origin === authOrigin` before
accepting. `authListen` currently takes no origin argument — it needs one (the
caller already knows it; `openAuthPortal` takes `authOrigin`).

**Severity: High.** Not trivially exploitable (the attacker needs a window
reference to the app), but it is a genuine missing check on a credential-
receiving path, and it contradicts the documented security model.

## S-6 — Medium — the SDK posts a `postMessage` to `'*'`

`browser.ts:201`:

```js
popup.postMessage({ type: 'contract', contracts }, '*')
```

The KB (`overview.md:97`) says: *"Tokens are posted only to the referrer
origin, never to `'*'`."* The **contract** message (consent metadata, not the
token) is posted to `'*'`. The token itself is posted by the *popup*, not the
SDK, so the token is not what's going to `'*'` here — but the code still
violates the stated "never to `'*'`" rule, and the *other* `postMessage` in the
SDK (`v3.ts:1415`) correctly uses `authOrigin` as the target. Inconsistent.

**Fix:** use `authOrigin` as the target origin at `browser.ts:201` (it's in
scope — `contractRequest` takes `authOrigin`). Low effort, closes the
inconsistency and matches the KB.

## S-2 — Medium — the token rides in the request body (by design, but it composes with B-4)

`v3.ts:637` puts the token in the JSON body of every call. This is the
deliberate CORS defense (the node's wildcard CORS is safe *because* the token
isn't a cookie/header — `main.py:31-37`). **But** the node's logging middleware
persists request bodies (`middleware.py`, finding B-4). So the token — a bearer
credential valid 60 days — is **written to the ClickHouse `logs` table on every
request**. The SDK design and the node logging compose into a credential-in-the-
log. Fixing B-4 (redact the `token` field from logged bodies) closes this from
the node side; the SDK transport itself is correct for the model.

## S-3 — Low — `byUserGroups` sends no token (functional gap, not a leak)

`v3.ts:1163-1173` `byUserGroups` calls `authGet` (`http.ts:90-103`), which adds
**no** token (no header, no body token, no `credentials`). The comment at
`v3.ts:1156` says "the token rides along when present" — **it does not.** The
read is therefore always anon (I3-enforced, so no leak), but a signed-in user's
private-group memberships can't actually be read through this path. This is a
**functional bug** (the comment is false), not a security hole. Decide: send
the token in the body (make the comment true) or fix the comment.

## S-4 — Low — `decodeJwt` is an unsigned decode (a footgun, used correctly today)

`token.ts:68-77` decodes the JWT payload with `atob` — **no signature
verification.** This is correct for its actual uses (reading `username` /
`expires` client-side for UX: the identity-mismatch check, the expiry check).
It becomes an I2 violation only if someone uses it to make an *authorization*
decision. **Recommendation:** rename to `decodeJwtUnverified` or add a doc
comment "NEVER use for authorization — display/metadata only," so the next
developer doesn't reach for it in an auth branch.

## S-5 — Low — cookie flags are correct for the model; 60-day window is long

`token.ts:46-52`: `SameSite=Lax`, `Secure` (HTTPS only), no `HttpOnly`
(impossible — the SDK must read the cookie in JS), 60-day max-age. All correct
given the design. The 60-day window matches the node's 60-day token TTL
(B-7) — a stolen cookie/token is valid for up to 60 days. Shortening the TTL
(node side) is the real mitigation; the cookie just follows it.

## What holds (the good news)

- **The identity-hijack check is real and correct** for the case it covers
  (`browser.ts:97-110`): a token for a *different* user is rejected, so the
  common "popup acts for the wrong user" attack is blocked. S-1 is the *residual*
  gap (first-login + same-user), not a total absence of defense.
- **The token is never in a URL** in the main path (body transport). The one
  URL-bearing call (`byUserGroups`) sends *no* token at all (S-3).
- **The popup URL is built from the configured `authOrigin`** (`browser.ts:47`),
  and the `as=` param carries only the username (not the token).
- **`isTokenExpired` fails open** (`token.ts:88-94`) — a missing/unparseable
  expiry returns `false` (not expired), matching the server's anon treatment.
  Documented and intentional, not a bug.

## The SDK verdict

The SDK is **mostly sound** — the cookie flags, the body transport, the
identity-hijack check, and the no-token-in-URL discipline are all correct. The
one **High** finding (S-1, missing `postMessage` origin check) is a genuine
missing check on a credential-receiving path, and it **contradicts the KB's own
stated model** — which is exactly the kind of KB↔code drift the audit exists to
catch. It's a one-line fix plus threading `authOrigin` into `authListen`. The
rest are Low (footguns to label, a functional gap to decide, a long TTL to
shorten on the node side).

## Recommended order of attack

1. **S-1** — add the `e.origin === authOrigin` check to `authListen` (one line +
   an argument). Closes the only High and matches the KB.
2. **S-6** — post the `contract` message to `authOrigin`, not `'*'`.
3. **S-3** — decide: send the token in `byUserGroups` or fix the comment.
4. **S-4** — rename/doc `decodeJwt` as unverified.
5. **S-5** — shorten the token/cookie TTL (pairs with node B-7).
