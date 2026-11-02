# L1-OAUTH-SOURCE-01 Source Certification

28.10.2026. Local repair on base `0f559ddfe0bd3180a6ac264544df6f6440ad9593`.
Author and fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol`
contexts, not different model families. No merge/deployment or L1 PASS claim.

## Orientation And Repro

The Sol resumption P2 showed that actual certify rejected a signed fresh source
delegation whose registry lookup returned None, but authorize returned a code.
The target lookup was not a source-authority check. D92 already requires live
client registration at certify; reuse it rather than duplicate or broaden policy.
Issuer-key trust, unsigned metadata, source-contract delegation limits, code
atomicity/schema and real registry visibility remain open, not repaired here.

New actual-route tests use real signing/decoding/certification and inert registry,
code storage and log storage. Initial run: five failures/five passes. Two
missing/revoked-source cases and a between-request revocation replay returned
200 before the repair; an active-source lookup assertion failed, and a signed
foreign-provider claim also returned 200. The latter is certification consistency,
not a demonstrated foreign-key forgery. Missing/revoked simulations both model the
getter's None result; these do not prove real ClickHouse tombstone visibility.

Repair calls `certify(Token(...))` before the existing verified claims decode and
code generation. Anonymous/absent-user rejection remains explicit. Target lookup,
redirect matching, response type, code/user/target/URI/TTL binding and state are
unchanged. Fixed before/after certification logs contain no claims/credentials.
The second verified decode follows the established auth-helper pattern; no
shared verifier API refactor is needed for this slice.

Twelve new tests pass: missing/revoked sources, browser/active-delegation success,
revocation between requests, anonymous/missing user, expired/malformed expiry,
wrong provider and malformed/wrong-signature tokens. Success asserts exact storage
binding, state, source lookup and no source app-permission helper calls.

The first full suite exposed three freshness tests re-raising certify's mapped
bare TOKEN exception. Their TestClient now inspects real HTTP responses with
`raise_server_exceptions=False`; exact 401 body and no-write assertions remain.
No production exception-handler or freshness policy change was made to get green.

Verification in `api/`: `uv run pytest -q --disable-warnings` -> **1,343 passed,
four subtests passed**. Focused ruff lint passes; formatting corrected for the new
test. Fresh review initially ran source/OAuth/freshness: 124 passed/three harness
failures, then proved 127 passed with the harness change applied in memory.
Follow-up independently ran all three modules without overrides: 129 passed.
It found no remaining source blocker; its nonblocking wrong-signature control
suggestion was applied so that token now has otherwise valid fresh/local claims.

## DESIGN-INTENT REVIEW

1. Intent: confidential external apps use authenticated identities and existing
   contract/group permissions; delegated source registration must remain live.
2. Delta: uncertifiable sources cannot mint a target code. Existing local-provider
   certification now applies here too. Browser and active delegated sources work.
3. By-design conflict: none identified. No source-contract narrowing, scope claim,
   delegation ban, D41 privacy reversal or app-specific node surface introduced.
4. Standard deviation: none new. Intentional body-token transport, confidential
   clients and deferred public-client/PKCE work are unchanged.
5. Untested intent risk: connected consent/redemption, registry failures/visibility,
   concurrent revocation and supported issuer/browser deployments remain unverified.

Accepted bounded implementation tradeoff, 28.10.2026: delegated authorization now
depends on source registry availability and rejects previously accepted nonlocal
provider claims. This aligns with existing certify semantics; active local/browser
controls are pinned. Reopen on a supported deployment/issuer or operational
failure; do not restore revoked-source acceptance as a workaround. No claim of
source-contract attenuation, durable issuance, contract escape, issuer migration,
production exposure, rollout or model-diverse three-dry sign-off.
