# October 2026 Audit — SDK (`sdk/`)

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
