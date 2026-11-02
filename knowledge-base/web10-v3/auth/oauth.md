# OAuth 2.0 — Delegated Access for External Apps

## The one-liner

OAuth 2.0 is a delegated-access layer bolted onto the edge of web10. It does
not touch the protocol underneath. Nodes never see OAuth — they keep seeing
the same certified tokens they see today, plus one optional claim:
`client_id`. Everything downstream (group membership, `has_permission`, I3,
revocation) is unchanged.

**Precedent:** Mastodon. Fully decentralized, every third-party client
connects per-account over OAuth 2.0 without the federation protocol caring.
web10's federated version is the same: each provider runs its own
authorize/token endpoints on its own domain.

## What changes, what doesn't

| | Before (popup flow) | After (OAuth added) |
|---|---|---|
| Token claims | `username, provider, site, expires` | same + optional `client_id` |
| App identity | browser `Origin` header | `client_id` claim (delegated) or `Origin` (browser) |
| Consent UI | authenticator popup (`ui/`) | same UI, new entry point (`/oauth/authorize`) |
| Revocation | `POST /v3/app-contracts/revoke` | same endpoint, keyed on `client_id` instead of origin |
| Refresh | full re-login through popup | refresh-token grant (new) |
| Node-to-node traffic | unchanged | unchanged |
| Inbox delivery | unchanged | unchanged |
| Password login on hub | unchanged | unchanged |
| "Every post reaches every follower" | unchanged | unchanged |

## Token shape

A delegated (OAuth) token is a superset of a normal token. One new claim:

```json
{
  "username": "century-club-music",
  "provider": "api.web10.app",
  "site": "web10",
  "expires": "2026-12-01T00:00:00.000000",
  "client_id": "muse-connector"
}
```

- `username`, `provider`, `site`, `expires` — identical to today. Same minting
  code path, same values.
- `client_id` — present **only** on delegated tokens. A normal login token
  (popup flow) has exactly the four claims it has today.
- **No `scope` claim.** The token is the door key (who + which client + not
  expired). The locks are already on every room: group membership,
  `has_permission()` (default-deny per service/operation), I3. The consent
  screen shows what the app *will* be able to do (derived from the user's
  current grants), but the token doesn't carry a redundant copy.

## Endpoints

All on the node's own domain (e.g. `api.web10.app`). Each provider runs its
own — the federated case is "someone on provider B connects their assistant
to provider B," same shape, different domain.

### 1. `GET /oauth/authorize`

The consent entry point. The external app redirects the user's browser here.

**Query params:**

| Param | Required | Meaning |
|---|---|---|
| `client_id` | yes | The registered app (e.g. `muse-connector`) |
| `redirect_uri` | yes | Where to send the user after consent (must match the registered URI) |
| `response_type` | yes | Must be `code` (authorization-code flow; implicit is rejected) |
| `state` | no | Opaque value returned to the app (CSRF protection, app's own use) |
| `scope` | no | Reserved for future narrowing. v1 ignores it — the grant is "everything the user's existing contracts allow." |

**Flow:**

1. Node looks up `client_id` in the `oauth_clients` table. Unknown → 400.
2. Node checks the user is signed in (session cookie on the node's domain —
   the same session the authenticator uses). Not signed in → redirect to the
   authenticator login, then back here with the original params preserved.
3. Node renders the consent screen (reuses `ui/`'s `ConsentView` component
   logic): "Muse wants to act as @century-club-music. It can: post, follow,
   read your profile, read and send messages." The permission list is
   **derived** from the user's current `app_contracts` + group memberships —
   not a new grant.
4. User approves → node mints a short-lived **authorization code** (single-use,
   60s TTL, stored in ClickHouse `oauth_codes` table) and redirects:
   `redirect_uri?code=<code>&state=<state>`.
5. User denies → redirect: `redirect_uri?error=access_denied&state=<state>`.

**Security:**
- The implemented `POST /v3/oauth/authorize` JSON entry point certifies the source
  body token before code minting, then reads verified claims. It requires the local
  provider, a fresh signed non-anonymous identity and, for a delegated source, a
  live source-client registry lookup. Missing/revoked sources receive 401 without
  code persistence. Ordinary browser sessions and active delegated sources remain
  accepted; the source and target client may differ. This is registry authority,
  not source app-contract narrowing or a new scope/grant model. Real registry
  visibility, race/schema guarantees and broader delegation policy remain separate.
- `redirect_uri` must exactly match the registered URI (no prefix matching,
  no wildcards). Mismatch → 400.
- The authorization code is bound to `(client_id, username, redirect_uri)` —
  a different client or different redirect URI cannot redeem it.
- Code is single-use: redeemed once, then tombstoned.

### 2. `POST /oauth/token`

Exchanges the authorization code (or a refresh token) for tokens.

**Content-Type:** `application/x-www-form-urlencoded`

**Grant: authorization_code**

| Field | Required | Meaning |
|---|---|---|
| `grant_type` | yes | `authorization_code` |
| `code` | yes | The authorization code from step 1 |
| `redirect_uri` | yes | Must match the one used in `/oauth/authorize` |
| `client_id` | yes | The app's client ID |
| `client_secret` | yes | The app's secret (v1: static, registered once) |

**Response:**

```json
{
  "access_token": "<JWT with client_id claim>",
  "token_type": "Bearer",
  "expires_in": 5184000,
  "refresh_token": "<opaque, 256-bit>",
  "scope": null
}
```

- `access_token` — a web10 JWT with the `client_id` claim. 60-day expiry
  (`TOKEN_EXPIRE_MINUTES`), same as a normal token.
- `refresh_token` — opaque string (not a JWT), 256-bit random, stored in
  ClickHouse `oauth_refresh_tokens`. Used to mint new access tokens without
  re-consent.
- `expires_in` — seconds until the access token expires.

**Grant: refresh_token**

| Field | Required | Meaning |
|---|---|---|
| `grant_type` | yes | `refresh_token` |
| `refresh_token` | yes | A previously issued refresh token |
| `client_id` | yes | The app's client ID |
| `client_secret` | yes | The app's secret |

**Response:** same shape as above. The old refresh token is **rotated**
(tombstoned) and a new one issued. Rotation is mandatory — a replayed
refresh token is a revocation signal (the whole family for that
`(client_id, username)` pair is invalidated).

**Security:**
- `client_secret` is compared with `hmac.compare_digest` (constant-time).
- Refresh-token rotation: each use tombstones the old row and inserts a new
  one. If a tombstoned token is presented, the entire token family for that
  `(client_id, username)` is invalidated (stolen-token detection).
- The token endpoint is the only path that mints tokens with a `client_id`
  claim. The popup flow (`/v3/login`) never mints one.

### 3. Client registration (v1: static)

No dynamic registration endpoint. Clients are registered by the node operator
(or web10 Inc. for the first-party connectors) via a ClickHouse table.

**`oauth_clients` table:**

| Column | Type | Meaning |
|---|---|---|
| `client_id` | String (PK) | e.g. `muse-connector` |
| `client_secret` | String | 256-bit random, set at registration |
| `client_name` | String | Display name for the consent screen ("Muse") |
| `redirect_uris` | Array(String) | Exact-match allowed redirect URIs |
| `created_at` | DateTime | |
| `deleted` | UInt8 | Tombstone (0/1) |

Registration is an admin operation (node operator or web10 Inc.). No
self-service in v1.

### 4. Revocation

Reuses the existing `POST /v3/app-contracts/revoke` endpoint. The
`ContractPage.tsx` UI in `ui/` already lists and revokes app contracts.
For OAuth clients, the contract row is keyed on `client_id` instead of
`allowed_origin`:

- `app_contracts` table gains a `client_id` column (nullable). Browser-origin
  contracts have `client_id = NULL`; delegated contracts have
  `client_id = 'muse-connector'` and `allowed_origin = ''`.
- Revocation tombstones the row. Every subsequent call with that `client_id`
  403s (the `has_permission` lookup finds the tombstone).
- The "Manage app access" surface shows both: browser-origin apps and
  delegated (OAuth) apps in the same list.

## Enforcement: the Origin → client_id re-keying

This is the one structural change. Today, `_check_app_permission`
(`api/app/v3/endpoints/documents.py:150-159`) uses the browser `Origin`
header as the app identity, and **a missing Origin skips the check entirely**.

After OAuth:

```
if token has client_id claim:
    # delegated token — look up contract by client_id
    permitted = has_permission(user_key, client_id=token.client_id, service, op)
elif request has Origin header:
    # browser token — today's path, unchanged
    permitted = has_permission(user_key, origin=request.origin, service, op)
else:
    # no Origin, no client_id — same-origin / direct call, skip (today's behavior)
    permitted = True
```

**The no-Origin bypass is NOT closed for browser tokens** — that's today's
behavior and it's correct for same-origin calls (the node's own UI, the SDK
in a same-origin context). It IS closed for delegated tokens: a token with a
`client_id` claim always goes through the `has_permission` lookup, even
without an Origin header. The AI assistant has no Origin, but its token has
a `client_id`, so it's gated.

`certify()` (`api/app/services/auth.py:88-102`) gains one check: if
`client_id` is present, verify the client exists and is not tombstoned.
This is a fast path — the ClickHouse lookup is the same one
`has_permission` does, just hoisted to the certify step so a revoked client
fails before any data access.

## Refresh-token storage

**`oauth_refresh_tokens` table** (ClickHouse, ReplacingMergeTree, same idiom
as `app_contracts`):

| Column | Type | Meaning |
|---|---|---|
| `token_hash` | String (PK) | SHA-256 of the refresh token (never store the raw token) |
| `client_id` | String | The app |
| `username` | String | The user |
| `family_id` | String | UUID — groups all tokens in a rotation chain (for stolen-token detection) |
| `created_at` | DateTime | |
| `expires_at` | DateTime | 60 days from creation |
| `deleted` | UInt8 | Tombstone (0/1) |

- The raw refresh token is returned to the client once, then discarded.
  Only the SHA-256 hash is stored.
- Rotation: on each `/oauth/token` with `grant_type=refresh_token`, the old
  `token_hash` is tombstoned, a new one is inserted with the same
  `family_id`. If a tombstoned hash is presented, all rows with that
  `family_id` are tombstoned (the family is compromised).
- Expiry: 60 days. After that, the client must re-do the authorize flow
  (re-consent). This matches the access-token lifetime — a connection that
  lives for months is a series of 60-day rotations, not one 60-day token.

## Authorization-code storage

**`oauth_codes` table** (ClickHouse, short-lived):

| Column | Type | Meaning |
|---|---|---|
| `code_hash` | String (PK) | SHA-256 of the code |
| `client_id` | String | |
| `username` | String | |
| `redirect_uri` | String | Must match on redemption |
| `created_at` | DateTime | |
| `expires_at` | DateTime | 60 seconds |
| `deleted` | UInt8 | Tombstone (single-use) |

- Code is single-use: redeemed once, tombstoned.
- 60s TTL: if not redeemed in 60s, it's dead.
- Bound to `(client_id, username, redirect_uri)` — a different client or
  redirect URI cannot redeem it.

## The Muse connector side (client implementation)

Muse (or any external app) implements the standard authorization-code flow:

1. **Redirect** the user to:
   `https://api.web10.app/oauth/authorize?client_id=muse-connector&redirect_uri=https://muse.example.com/callback&response_type=code&state=<random>`
2. User signs in (if not already) and approves on the consent screen.
3. Muse's callback receives `?code=<code>&state=<state>`.
4. Muse's backend exchanges the code:
   `POST https://api.web10.app/oauth/token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`.
5. Muse stores the `access_token` (JWT) and `refresh_token`.
6. Muse calls the web10 API with `Authorization: Bearer <access_token>` —
   **or** the existing body-token convention (`{token: "<JWT>"}` in the
   request body, same as all v3 endpoints). Both work; the v3 body convention
   is the default since all existing endpoints read the token from the body.
7. When the access token expires (60 days), Muse uses the refresh token to
   get a new pair. No re-consent.
8. If the refresh token is revoked (user revokes in "Manage app access"),
   the refresh fails with `invalid_grant`. Muse re-directs to
   `/oauth/authorize` for re-consent.

**What Muse can do with the token:** everything the user's existing contracts
and group memberships allow. Post, follow, read profile, send messages —
whatever the user can do, Muse can do, as the user. The node enforces the
same rules it enforces for the user's own browser session.

## What does NOT change (explicit)

- **Node-to-node web10.0 traffic.** Federation is unchanged. A token minted
  on provider A is verified on provider B via JWKS (D7, in-progress). The
  `client_id` claim is opaque to the remote node — it's a local delegation
  marker, not a federation concept.
- **The token exchange between providers.** Unchanged.
- **Inbox delivery.** Unchanged.
- **Password login on the hub.** Unchanged. The OAuth flow uses the same
  session; it doesn't replace password login.
- **The popup flow.** Unchanged. Browser apps still use the popup. OAuth is
  an *additional* path for non-browser clients.
- **The "every post reaches every follower" model.** Unchanged.
- **HS256 signing.** Unchanged in v1. The `client_id` claim is signed with
  the same symmetric key. RS256/JWKS (D7) is a separate, in-progress effort
  that will cover OAuth tokens automatically when it lands.

## Security invariants (I1–I6) — no regressions

| Invariant | How OAuth respects it |
|---|---|
| I1 — cryptographic issuer verification | `certify()` still verifies the signature. `client_id` is a claim in the signed token, not a separate credential. |
| I2 — no unsigned decode | Unchanged. OAuth tokens go through the same `decode_token` path. |
| I3 — no query returns docs for an author_key the token doesn't own | Unchanged. The token's `username` is the user; I3 enforcement is on the data path, not the token path. `client_id` doesn't alter I3. |
| I4 — node-readable by design | Unchanged. OAuth doesn't add encryption or access control — it adds a delegation marker. |
| I5 — scoped/expiring/revocable tokens | The access token is expiring (60d) and revocable (contract tombstone). The refresh token is expiring (60d), rotating, and revocable (family invalidation). Scope is enforced by the existing `has_permission` (default-deny). |
| I6 — cross-node boundary is HTTP API + verified token | Unchanged. OAuth is a local delegation layer; it doesn't cross the node boundary. |

## Implementation bites (suggested order)

Each bite is one PR, ≤500 lines, one concern.

1. **`oauth_clients` table + admin registration.** ClickHouse table,
   admin-only registration endpoint (or a setup-wizard step). No user-facing
   surface yet. The table is the foundation everything else reads.

2. **`client_id` claim in `TokenData` + `certify()` check.** Add the optional
   claim to `api/app/models/auth.py`. In `certify()`, if `client_id` is
   present, verify the client exists and is not tombstoned. No minting yet —
   just the verification path. Existing tokens (no `client_id`) are
   unaffected.

3. **`_check_app_permission` re-keying.** The Origin → `client_id` branch in
   `documents.py` and `query.py`. A token with `client_id` goes through
   `has_permission(user_key, client_id=...)` instead of the Origin lookup.
   The no-Origin skip is preserved for tokens *without* `client_id`.

4. **`app_contracts` gains `client_id` column.** Nullable. Browser contracts
   have `NULL`; delegated contracts have the client ID. `has_permission`
   learns to look up by `client_id` when provided. Revocation
   (`/v3/app-contracts/revoke`) works for both.

5. **`GET /oauth/authorize`.** The consent endpoint. Session check, client
   lookup, consent screen (reuse `ui/` component logic), code mint, redirect.
   The `oauth_codes` table.

6. **`POST /oauth/token` (authorization_code grant).** Code redemption,
   access-token mint (with `client_id` claim), refresh-token mint,
   `oauth_refresh_tokens` table.

7. **`POST /oauth/token` (refresh_token grant).** Rotation, family
   invalidation on replay.

8. **Consent UI in `ui/`.** The `/oauth/authorize` screen in the
   authenticator. Shows the client name, the derived permission list,
   approve/deny. Reuses `ConsentView` patterns.

9. **Revocation UI update.** `ContractPage.tsx` shows OAuth clients alongside
   browser-origin apps. Revoke works for both.

10. **SDK: `w.oauth()` helper (optional, later).** A convenience method for
    the SDK to drive the authorize flow for non-browser clients (server-side
    SDK use). Not blocking — the raw endpoints work without it.

## Open questions (resolve during implementation)

- **Token in header vs body.** The v3 convention is token-in-body
  (`{token: "..."}` in the JSON). OAuth clients conventionally use
  `Authorization: Bearer`. v1: support both (the `user()` helper in
  `auth_helper.py` already reads from the body; add a fallback to the
  header). The body path is the default; the header is a convenience for
  clients that don't want to restructure their requests.
- **Consent screen: node-rendered or `ui/`-rendered?** The authorize
  endpoint is on the node (`api.web10.app`), but the consent UI lives in
  `ui/` (`auth.web10.app`). v1: the node redirects to
  `auth.web10.app/oauth/authorize?...` (the authenticator renders the
  screen, mints the code, redirects back). This keeps the consent UI in the
  authenticator where it belongs and avoids duplicating the component on
  the node. The node's `/oauth/authorize` becomes a redirect, not a
  renderer.
- **Client secret for public clients.** v1 requires a secret (confidential
  clients only). A public-client flow (PKCE, no secret) is a later addition
  if/when a browser-based OAuth client needs it. The AI assistant is a
  server-side client — it has a secret.
- **Multiple providers.** Each provider runs its own authorize/token
  endpoints. A Muse connector that works across providers would need to
  know each provider's domain. v1: single-provider (the four bots on
  `api.web10.app`). Cross-provider is the federated case — same shape,
  different domain, no protocol change.
