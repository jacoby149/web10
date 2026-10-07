# Security Threat Model

A user should be able to try an untrusted app without giving it unrestricted
account or node authority. Suppose Alice approves a notes app to read notes;
that app must not obtain her recovery contacts, manage her groups or read Bob's
private documents. This is the threat model for testing that boundary, not a
claim that every attack has already been exhausted.

## Assets and Trust

Protect account identity, passwords/OTP proof, self and app credentials, signing
and infrastructure secrets, app contracts, group roles, document visibility,
storage capabilities, node policy and service availability.

The node operator and its API/database/storage runtime are trusted to enforce
policy and can read hosted content. web10 is a data-policy platform, not an
operator-blind privacy platform (D41). There is no default end-to-end encryption.
A malicious operator or full server compromise defeats content confidentiality
and local authorization; contractual accountability, portability and operational
containment matter, but are not cryptographic defenses against that operator.

The authenticator is a high-trust origin: it holds self credentials, obtains
password/OTP proof and approves contracts. Consumer apps, including web10-social,
are delegated actors, not privileged authenticators. Third-party scripts on
either origin share that origin's exposure. HTTPS and deployment secret/storage
isolation are operating assumptions, not protections supplied by a JWT alone.

## Adversaries and Boundaries

| Adversary | Attack to exercise | Required boundary / residual risk |
|---|---|---|
| Untrusted app | Ask for another origin's contract, omit/spoof Origin, approve itself, mint self credentials, turn document wildcard into management/blocking/import authority | Signed exact `app_origin`, latest contract checks, self-only grants/delegation and explicit reserved `group`, `node`, `user`, `imports` capabilities. Consent is required for social too. |
| Malicious authenticated user | Guess IDs/object keys, attach another user's media, alter groups/roles, mint URLs through crafted query projections | Verified local principal plus actual author/service/group checks. A reference is not a grant; canonical prepare reads must re-prove provenance. |
| Anonymous caller | Read private groups, invoke mutations, exhaust query/OTP/manifest/import resources | Only public principal-class read grants; bounded query results/work and best-effort rate limits. Global abuse controls remain an operational concern. |
| Hostile query caller | Raw tables, table functions, joins/aggregation escaping scope, forged body/author/ID aliases | Service boundary CTEs, parser restrictions, read-only execution and canonical authorized capability minting. Live engine behavior must be tested. |
| Hostile browser window or popup | Forged auth/consent messages, wrong source, redirect/origin substitution, stale account handoff | Exact configured authenticator origin and popup source binding; exact opener target; only origin-matching app credentials handed off. |
| Stolen app credential | Replay from another client without Origin; continue after reduction/revocation | Header absence cannot bypass contract grants. Current app/person authority still required. Already minted media capabilities have TTLs; reapproval may revive an unexpired token. |
| Stolen self credential | Change contacts, grant apps, use account/admin authority | Highest credential blast radius. No per-token revocation/epoch exists; logout/password changes do not invalidate stolen JWTs. Containment may require node-key rotation. |
| Hostile file/metadata supplier | Prefix/path traversal, oversized objects, archive expansion, worker/resource exhaustion | Owner-prefix, size/parser/queue checks and worker revalidation. Owner prefix is not upload-ticket proof. |
| Delegated import caller | Inspect another app's job, replay old unscoped jobs, keep writing after expiry/revocation or target-role removal | Owner/app-origin job privacy; persisted kind/origin/expiry without tokens; current service/group/contract and target-authority rechecks at worker mutation boundaries. Prior writes are not rolled back. |
| Foreign issuer or key-location claimant | Forge a local username with foreign issuer/key, induce outbound key fetch | Python sessions use local configured keys and reject foreign providers/issuers; federation is not implemented. RTC's unsigned-provider remote-200 fallback remains a separate open boundary (SEC-029). |
| Hostile RTC peer | Select a certification server, use revoked app credentials or keep a socket past expiry | Trusted local certification must not depend on unsigned claims. Current local `/certify` does not check app contracts; no periodic socket revalidation is present. |
| First-run caller | Claim bootstrap administration or race setup/signup | Setup is unauthenticated and non-atomic, with config saved before account creation succeeds. Private provisioning is a mitigation, not endpoint closure (SEC-030). |
| Log/artifact reader | Recover bearer tokens, presigned URLs, OTPs or old signing secrets | Current safe request metadata is not historical cleanup. Operators must rotate git-exposed secrets and review retained logs/backups/proxies. |

Node management is an intersection, not an upgrade: even an app granted
`node: moderate` or `node: manageMonetization` needs a current node-admin user.
Group management likewise needs person authority for the exact operation.
Secret/admin-list config is self-only; delegated config is field-allowlisted.
See [delegation](../auth/delegation.md) for the complete capability matrix.

`user: blockUsers` delegates user-wide blocking; `user: rateApps` delegates rating/review
submission as the person. Neither grants recovery-contact or credential changes.
`imports: create/read` delegates job admission/progress, not arbitrary
worker authority. Neither is granted by document `*`. Effective group roles must
grant `readAll` to read and `create` to attach content on the actual service;
membership alone is insufficient. Old custom roles receive no automatic upgrade.
The social app reconciles its canonical followers contract only. References in a
body cannot substitute legacy `media` grants for `media_metadata`/`public_media`.

Background tasks are not interchangeable: import scope is persisted/rechecked,
but transcodes retain only document/author identifiers and do not recheck the
initiating app's expiry/grants. Archive budgets do not bound thumbnail HTTP
responses: those are materialized without a byte cap and follow redirects. The
current parser starts at the YouTube CDN; arbitrary-host SSRF is not established.
Media-reference resolution also retains a pre-latest tombstone filter that can
sign stale metadata if the carrier remains readable and the object remains.

## Deliberate Non-Goals

Public group content is public by its `anyone` service grant. Discoverability
and join policy are not confidentiality controls. Authorized readers can copy
content; revocation cannot retract their downloads. Signed storage/HLS URLs
are short-lived bearer capabilities, not promises of instantaneous revocation.

D56 telemetry remains the product policy: GA4 and Hotjar on user-facing surfaces,
Hotjar text masking/image blocking, content-free analytics events and advertising
features off. Content must not enter recordings/events. This threat model neither
turns telemetry off nor adds a privacy-consent model; credential/content leakage
in telemetry or diagnostic logs is still a security defect.

## Assurance, Not Adjectives

The six invariants in [overview](overview.md) are the target. Mocked API tests
prove handler decisions for supplied fixtures; they do not prove ClickHouse
latest-row semantics, real object-store policies, provider OTP behavior, browser
window binding or deployment secrets. Live database/storage tests, browser
gauntlets and built-container tests close different gaps. An independent external
audit adds a separate adversarial review and is explicitly outstanding.

Open concerns include historical false contact-verification flags, the non-atomic
contact check/write race, persistent self-token theft, media upload provenance,
complete endpoint grant coverage, multi-worker abuse limits, deployment key wiring
and foreign principal migration. Do not silently promote an intended control to
verified coverage. [Operations](operations.md) provides the live checklist;
[the findings ledger](findings.md) owns evidence and
closure details. [The October audit](../../../security-audit/october/README.md)
is a historical snapshot, not a fresh verdict on concurrent changes.
