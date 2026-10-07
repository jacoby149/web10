# Credentials Across Browser Boundaries

An account holder wants to sign in once, consent to an app, and leave without
giving the next app or an incidental URL a reusable credential. The useful
question is not merely where the token is stored. It is who receives it,
which code can read it, and what remains after logout.

Consider a creator signing into the social app through the authenticator
popup. The password goes to the configured API; the resulting session moves
from the authenticator origin to the app origin through a window message.
Each origin then has its own browser storage and its own logout state.

This is a How-layer account of the October 2026 implementation, not a claim
that browser custody is isolated from scripts. Paths below are repository-root
paths; symbols, rather than changing line numbers, identify the relevant code.
See [overview.md](overview.md) for invariants and
[the thesis](../../../strategy/thesis.md) for the data-policy trust model.

## Password To Session

1. `ui/src/interfaces/Interface.tsx` calls the SDK login method from `I.login`.
2. `sdk/src/v3.ts` `login` POSTs JSON to the configured `apiOrigin`'s `/v3/login`.
3. `api/app/v3/endpoints/auth.py` `login` lowercases the username and calls
   `ch.authenticate_user`; failure does not mint a session.
4. Success signs a JWT with `settings.PRIVATE_KEY` and `settings.ALGORITHM`.
5. The SDK `setToken` updates client memory and writes the local token cookie.
6. `I.finishLogin` remembers account identifiers and vaults the actual token.

The login body contains `username`, `password`, and `site`. The response is
`{"token":"<SESSION_JWT_PLACEHOLDER>"}`. Never put a real password or token
into a documentation example, issue, screenshot, or copied command.

The v3 login payload has `username`, `provider`, `site`, and ISO-8601 `expires`.
Do not infer that every mint path supplies the broader `target` claim shown
in older auth descriptions. Expiry is generated from `TOKEN_EXPIRE_MINUTES`;
cookie lifetime does not determine whether the API accepts the session.

`api/app/services/auth.py` hashes and verifies passwords with bcrypt, consuming
the first 72 UTF-8 bytes through `_to_bcrypt_bytes`. This is actual behavior,
not a promise that every character of a longer password contributes to its hash.
The audited social flow did not reveal app-owned persistent password storage.
That observation does not cover browser password managers or arbitrary scripts.

## Cookie Custody

`sdk/src/token.ts` `setTokenCookie` writes the following storage policy:

| Property | Actual behavior |
|---|---|
| Name | `token` |
| Scope | Host-only: no `Domain` attribute; `path=/` |
| Lifetime | Default `max-age` of 60 days; caller may override |
| Transport flag | `Secure` only when the page uses HTTPS |
| Same-site policy | `SameSite=Lax` |
| Script access | JavaScript-readable; not `HttpOnly` |
| Encoding | Cookie value is percent-encoded |

The cookie is a store. Authenticated SDK requests read it and send a JSON
body credential, rather than relying on the API receiving an ambient cookie.
Host-only is not origin-only: cookie scope does not distinguish ports, and
same-host apps share this cookie namespace. Separate authenticator and social
hosts do not automatically share their cookies.

`cookieDict` uses a prototype-free dictionary and skips malformed percent
encoding, including unrelated malformed cookies. `scrubTokenCookie` expires
the local path-scoped cookie. Neither operation revokes an already-copied JWT.

## Authenticate The Window, Not Its Story

`sdk/src/browser.ts` `openAuthPortal` records the opened popup reference and
normalizes the configured authenticator URL to its exact origin.
`isTrustedPopupMessage` requires both `event.origin` and `event.source` to
match, with an active, non-closed popup. A type named `auth` is not enough.

The same boundary applies to `auth`, `auth_ready`, and `contract_response`.
A blocked popup, null source, unrelated same-origin window, replaced popup,
or attacker origin must not establish readiness, consent, or token custody.
The one-argument `authListen` API relies on this tracked popup state; without
a trusted popup it fails closed instead of trusting any sender.

Outbound SDK contracts and close messages use exact target origins.
The ESM `contractRequest` also binds replies to its opened window and origin.
The SDK's legacy `contractOnReady` derives an exact opener origin from
`document.referrer` and refuses an absent or opaque referrer.

Do not generalize those SDK repairs to every authenticator message.
`ui/src/interfaces/Interface.tsx` still sends readiness with `'*'`, and
`I.goToApp` uses the referrer origin but falls back to `'*'` without a referrer.
These actual UI paths deserve separate review; the SDK receiver checks do not
make a wildcard token sender safe when its opener has navigated elsewhere.

## Metadata Is Not Authentication

`decodeJwt` decodes UTF-8 base64url JSON without checking a signature.
It is useful for labels, expiry hints, deterministic IDs, and mismatch UX.
It cannot establish an issuer, permissions, membership, or credential validity.
`isTokenExpired` returns false for absent or unreadable expiry metadata;
`isSignedIn` is a client presence check, not an API authorization result.

`authListen` requires a non-empty incoming username, rejects a different
username from the current cookie, refreshes a same-username cookie, and
suppresses the repeated signed-in callback for that username.
This dedupe compares username only, not `(provider, username)` or scope.
Equal usernames on different providers are not proof of equal accounts.
An invalid or stale cookie can also distort the mismatch UX until cleared.

`sdk/src/v3.ts` has deliberately different read precedence: `readToken` is
cookie-first for metadata, while `v3Post` is state-first for credential bodies.
The social adapter synchronizes memory on login and clears memory on logout.
When diagnosing an account mismatch, inspect both stores without printing
their contents. A fresh cookie does not necessarily replace stale client state.

Server-side `decode_token(..., private_key=True)` verifies local signatures;
`certify` additionally checks provider and custom expiry. The shared v3
principal helpers do not call `certify` themselves, and a synthetic expired
session still resolves there: this remains an open I5 enforcement gap outside
the repaired group-detail/RTC paths. The middleware's `_extract_user_key`
is an unsigned log-attribution hint, not verified evidence of the actor.
The issuer gap remains: HS256 and signing/configuration assumptions are not
fixed by cookie encoding, popup checks, or the RTC ticket exchange.
Review `api/app/settings.py` module defaults and the effective deployed signing
configuration privately; checked-in defaults are not evidence of unique,
environment-supplied production keys. Key provisioning/rotation needs its own receipt.

## Credential Recipients

`sdk/src/http.ts` `authPost` uses `redirect: 'error'` and `credentials: 'omit'`.
The anonymous `authGet` and the SDK app-registration fetch do likewise.
Otherwise a 307/308 could replay an unchanged password/token body elsewhere.
Omitting ambient cookies prevents an unrelated cookie session riding along;
it does not remove the explicit token in the JSON body.

`createV3Client` trusts caller configuration. Its configured `apiOrigin`
receives credentials, including a best-effort registration ping at client
creation and `setToken`. Its configured RTC host receives the session at
`/ticket`. Neither destination is a safe arbitrary-content URL.
Do not derive these recipients from a post, document ID, unsigned provider,
remote result, or unreviewed query parameter. Redirect rejection protects the
next hop; it does not establish trust in the initial recipient.

The social build config is `src/lib/origins.ts`: `VITE_API_ORIGIN`,
`VITE_AUTH_ORIGIN`, and optional `VITE_RTC_ORIGIN`, with production fallbacks.
RTC otherwise follows the API hostname. Local-mode adapter overrides must
remain deliberate. Presigned media/upload URLs are content capabilities,
not authority to forward the session token to their host.

## Group Detail Transport Migration

The coordinated repair introduces `POST /v3/groups/detail` with
`{"group_id":"provider.example/groups/users/alice/jazz","token":"<SESSION_JWT_PLACEHOLDER>"}`.
The credential is optional; missing/null/empty reads anonymously, whereas
a present invalid token is rejected. The new SDK method is `getGroupDetail`,
distinct from `getGroup`, which reads the raw group contract.

Anonymous `GET /v3/groups/detail?group_id=...` remains supported. A `token`
query key, even empty, is rejected on both methods. URLs are visible to proxy
logs and browser infrastructure outside body-redaction middleware.
Social `src/data/groups.ts` `readGroupDetail` now delegates to SDK
`getGroupDetail` instead of reading the cookie or constructing a URL itself.
The migration is implemented and tested locally, not a deployed-cohort receipt.

Transport repair must not expand access. `_group_detail` returns metadata
for existing groups regardless of listing status, but its `is_member` and
recent-posts branch use literal membership. The nested read applies roles.
Broader `anyone`/`authenticated` effective-role behavior is a separate caveat,
not something the credential move silently establishes. See
[groups/detail.md](../groups/detail.md) for the qualified contract.

## Logout And The Separate Vault

The social custody pass found no independent persistent session copy in its
localStorage, sessionStorage, or IndexedDB. It still reads the token cookie,
holds a runtime copy, and has direct authenticated fetches in
`src/data/{ads-catalog,moderation,imports,posts}.ts` outside SDK transport.
Audit their redirect/cookie settings separately; SDK fixes do not wrap them.
Remembered identifiers, preferences, and caches are not necessarily secrets.

The authenticator is different. `ui/src/lib/tokenVault.ts` stores actual live
tokens in localStorage under `web10.tokenVault`, keyed by provider/username,
most-recent-first and capped at five accounts. `vaultedAccountsFor` filters
the picker by provider; it does not cryptographically verify stored entries.
`I.logout` clears the active SDK session and UI state, not the vault.
An account can therefore remain one-tap resumable after ordinary logout.
Remembered-account identifiers and vaulted bearer credentials are different
custody classes. A vault compromise can expose several accounts, not just one.

Social logout clears its cookie/client memory and destroys RTC through
`src/data/p2p.ts` cleanup. This is local teardown, not demonstrated server-side
revocation of every copied token. See [rtc-admission.md](rtc-admission.md).

## Remaining Boundaries

Hotjar text masking/image blocking and content-free GA4 events implement D56;
they do not sandbox vendor scripts. XSS or compromised same-page JavaScript
can read the cookie, runtime token, or authenticator vault and act as the user.
Do not disable content-blind telemetry as a substitute for fixing that boundary.

Backend credential-log redaction is implemented, but SDK `Web10Error.details`
still retains raw response text and its message can retain echoed detail.
Social `reportNodeError` forwards truncated strings without credential redaction.
Diagnostic custody remains OPEN; no observed production leak is asserted here.
Tests and private incident handling are in [audit-runbook.md](audit-runbook.md).
