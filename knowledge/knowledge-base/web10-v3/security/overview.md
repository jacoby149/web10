# Security Model

A creator needs to give an app enough access to work, without giving it the
keys to the node. This reference defines the target and the current enforcement
boundary. It is not a certification that every endpoint is secure.

## Six Invariants

| Invariant | Required property |
|---|---|
| **I1** | Verify a token's issuer cryptographically; never trust its own issuer or key-location claims. |
| **I2** | Authorization uses verified claims, never unsigned payload decoding. |
| **I3** | Reads return owned documents or documents authorized through the relevant group/service grants; references and query projections are not grants. |
| **I4** | The node is a readable, accountable broker. Operator-blindness is not a goal; content is node-readable by design (D41). |
| **I5** | Delegated actors operate under scoped, expiring credentials and current, revocable app contracts. Self credentials are owner authority, not app credentials. |
| **I6** | Cross-node interaction uses the HTTP API and verified credentials, never another node's ClickHouse. Remote content is data, not local query control or a grant. |

These are review targets. Tests supply evidence for particular paths, not a
blanket guarantee. See [the threat model](threat-model.md) for adversaries and
[operations](operations.md) for the deployment and live-assurance gates.

## Trace an App Request

1. Password login or contact recovery issues `credential_kind: "self"` to the
   authenticator. Old sessions without an explicit kind must log in again.
2. The person approves a contract for an exact canonical origin, such as
   `https://notes.example.com`. `/v3/delegate` requires a self credential and
   an active contract, then issues `credential_kind: "app"` with signed
   `app_origin`. It does not hand the self credential to the app.
3. The API verifies the signature, local provider/issuer, target when present,
   credential kind and expiry. App origins must be canonical HTTPS origins
   (HTTP is allowed for localhost development only).
4. App checks look up the latest contract by verified username and signed
   `app_origin`. Missing or revoked contracts deny access. A supplied `Origin`
   must match; omitting or spoofing the header does not select another contract.
5. The current contract must grant the operation. Document `*` permissions
   never grant reserved `group`, `node`, `user` or `imports` capabilities.
6. The person's group role or current node-admin status must independently
   authorize management. A grant to an app cannot manufacture person authority.

The API deliberately serves wildcard, non-credentialed CORS. CORS is not the
authorization wall; signed credentials and server-side checks are. web10-social
uses the same consent boundary as any other app.

The exact reserved capability list, consent behavior and popup binding are in
[delegation](../auth/delegation.md). Account credentials, contacts, contract
approval/revocation, node secrets and the admin list remain self-only. Delegated
node configuration exposes only moderation/monetization policy allowlists.

The reserved app keys are `group` (the exact structural operations listed in
delegation), `node` (`moderate`, `manageMonetization`), `user` (`blockUsers`, `rateApps`) and
`imports` (`create`, `read`). Imports are delegated, not self-only: job access
is owner- and app-origin-scoped, and worker writes recheck persisted credential
scope, expiry, current grants and target authority without storing bearer tokens.
See [operations](operations.md#delegated-import-jobs) for the execution boundary.

## Document and Query Boundary

The shared `documents` table is not an isolation mechanism on its own. Direct
reads and writes must check author identity, actual service, group permissions,
and the operation's app grant. Group reads combine literal membership with
reserved `anyone` and `authenticated` grants, per service. Blocking, sharing,
hidden documents and node bans further constrain applicable reads.

Membership alone grants neither reading nor creation. `can_read_group` requires
effective `readAll` for the actual service; `can_write_group` requires effective
`create`. Point, batched and query-boundary reads use the effective role union.
Old custom groups need explicit service grants; there is no blanket automatic
role migration. The social app reconciles its own canonical followers contract,
not arbitrary groups. Media metadata uses `media_metadata` (or `public_media`),
not a legacy `media` permission key; body references cannot change that scope.

Caller SQL is hostile input. `safe_query.py` replaces permitted document-service
tables with API-built, visibility-filtered boundary CTEs, rejects raw tables and
table functions, and bounds results. Joins and aggregation operate inside that
boundary. The prepare pass re-fetches canonical authorized carrier/face/ad data
before minting media capabilities; a projected `doc_id`, author or media ref is
not provenance. These paths require both regression tests and live ClickHouse
evidence, including tests with background merges disabled.

Canonical carrier checks do not certify every referenced record: media-reference
resolution still filters tombstones before latest-version selection and may mint
fresh URLs from deleted metadata while objects remain (SEC-012/015).

## Signing and Federation Status

`services/auth.py` issues RS256 when `AUTH_SIGNING_KEY` is configured. Its RSA
private key must be at least 2048 bits. The local public key is published at
`GET /v3/.well-known/jwks.json`, with `AUTH_KEY_ID` as `kid`. Verification selects
only locally configured keys; it does not fetch token-supplied `jku`, `x5u` or
provider URLs.

Explicitly configured HS256 `PRIVATE_KEY` remains a legacy mode. With RSA
enabled, HS256 verification additionally requires a future
`AUTH_LEGACY_VERIFY_UNTIL` deadline. Without RSA, explicit HS256 mode does not
enforce that deadline. Operations requires RSA plus a bounded legacy migration,
not indefinite legacy mode.

Foreign providers/issuers are rejected. Local asymmetric signing is progress
toward I1, **not completed federation**: canonical issuer-qualified principals,
foreign key trust and cross-node authorization remain future work. Current
bare local usernames must not be populated from foreign claims. I6 remains the
architectural constraint for that future implementation.

This local Python verifier is not a stack-wide verification guarantee. RTC still
unsigned-decodes `provider` to select a remote certification destination when
`CERTIFY_BASE_URL` is absent, then trusts HTTP 200 (SEC-029). That separate trust
path remains open; local JWKS publication does not repair it.

## Credential Exposure and Revocation

SDK cookies are script-readable, `SameSite=Lax`, and `Secure` on HTTPS; the
default cookie lifetime is 60 days. The authenticator also keeps up to five
self credentials in its persistent account vault. XSS on an app can steal its
app credential; XSS on the authenticator can steal owner credentials, with a
much larger blast radius. Client-side JWT decoding is a UI hint, not I2 proof.

The server default session lifetime is `TOKEN_EXPIRE_MINUTES=87840` (61 days).
Delegation cannot outlive the parent session. Revocation or permission reduction
is enforced on subsequent checked requests through latest-row contract reads,
without waiting for ClickHouse merges. There is no per-token denylist; logout
or a password change is not server-side invalidation of an already stolen self
JWT. Already minted storage/HLS capabilities have their own expiry windows.

Imports recheck recorded app scope during execution; queued transcodes do not
retain that scope or recheck live app grants. Local RTC certification checks
session validity, not app revocation, and its handler does not periodically
revalidate connected sockets. These exceptions remain open, not covered by a
blanket revocation promise. Public first-run setup also remains unauthenticated
and non-atomic (SEC-030); provision it privately before exposing the node.

## Further Reading

- [Authentication](../auth/auth.md): token and contact flows.
- [Operations](operations.md): provisioning, rotation, limits and gauntlet.
- [Threat model](threat-model.md): trust assumptions and assurance layers.
- [Group access](../groups/access.md): principal classes and person authority.
- [Contract schemas](../sdk/contracts.md): persisted app/group permissions.
- [Findings ledger](findings.md): remediation evidence and open issues (separately maintained).
- [October audit](../../../security-audit/october/README.md): historical audit snapshot, not a verdict on the current working tree.
