# Contact delivery — bounded implementation review, 08.11.2026

Status: OPEN. Implementer: GPT-6.1 Sol. Fresh reviewers are separate untainted
general-agent sessions in the same available family; no model-diverse sign-off.
Not a full L1–L4 campaign PASS, live provider test or rollout authorization.

## Merge receipt and preflight follow-up

PR #1435 merged as `86d663b4c4e0ea8873df39b23f61691197e52370` on 08.11.2026.
Final GitHub checks confirm API/UI tests, all four E2E shards, security gauntlet
and Docker builds passed; the 1,647-code/test-line method gate failed. The merge
does not establish a general size exemption or close provider/security/rollout
acceptance. Do not rebuild or retrospectively split the already-merged feature;
keep subsequent trust-boundary bites within the normal budget.

The 5.4.1 follow-up adds `scripts/contact-delivery-preflight{,.test}.mjs` only
plus KB alignment. Default execution is network-free; explicit `--preflight`
uses the operator-supplied exact HTTPS API for one admin status read. Cookie/
redirect denial, deadline/body bounds, strict setup-field projection and fresh
fixed errors avoid exposing sender addresses, body fields or credentials. Seven
offline tests pass; no actual admin preflight, provider send or account mutation
was executed. A successful receipt is API-reported configuration, not independent
proof of bucket policy, OAuth approval, inbox delivery or password login.
The combined preflight/PostHog script regression command passes all 17 tests.
Three fresh same-family scoped preflight reviews are dry; each independently
reran the seven focused tests. The second reviewer also exercised 42 offline
destination/schema/stream-boundary/cancellation/timeout-option probes. These do
not close the independent/model-diverse release gate.
Offline controls check the abort signal and response ceiling but do not establish
actual native-fetch timeout, stalled-body or deployed redirect behavior.

After the three findings below were repaired, three consecutive fresh same-family
scoped reviews were dry. The final two independently reran 42 focused API and
55 relevant UI tests. Final parent validation: all 2,187 API tests plus eight
subtests pass (one opt-in skip); all 292 UI tests, UI production typecheck/build
and changed-Python Ruff checks pass. Build retains a bundle-size warning. These
are local receipts, not CI/PR readiness; the combined work still needs bounded
trust-boundary PR splitting and normal checks.

## Scope and intent

Backend-first inspection: new `contact_state`, `contact_delivery` service/admin
router; direct recovery/Twilio delivery seams; existing admin certification,
private S3 adapter and D61 proof/account completion. Then authenticator handoff,
configured-origin link/complete transport, ContactDelivery settings and secret
fields. L1 inspection and targeted L2 direct-call probes are bounded coverage;
broader inherited auth/proof/SDK/deployment L2–L4 sign-off remains OPEN.

D105 keeps provider integration in the API. Gmail requests sending plus verified
account email identity, never inbox access. SendGrid sends transactional codes and
links with click/open tracking disabled; Twilio Verify remains optional SMS and
legacy compatibility email until an operator selects a replacement. New sender
credentials are encrypted in a distinct private conditional S3 bucket, not general
config. Setup/admin UI names contact presence accurately; this does not turn D61
legacy signup into verified-contact admission.

## Findings and disposition

1. **Wrong-node recovery credential dispatch.** First fresh review showed the
   existing token-provider anonymous helper would route node A's email secret to
   node B when the authenticator retained B's session. Repair: an issuer hint must
   exactly match the configured SDK HTTPS API; the hint never chooses an arbitrary
   URL. Link exchange and completion pin that origin with cookies omitted and
   redirects denied. Actual Interface A-link/B-session tests assert B receives no
   recovery secret and reject mismatched hints before any fetch. The initial
   evidence was extracted real origin-selection code, not a connected takeover.
2. **Post-reset navigation loop.** Initial App effect reapplied `mode=forgot` on
   auth transition. Repair: initial-only recovery entry plus consumed URL intent.
   Actual App/Interface/forms test drives confirmation, account/password selection
   and completion into the authenticated destination (network/SDK/account doubles).
3. **Old-link lockout of replacement challenge.** Second review reproduced an
   old consumed link incrementing a newer challenge's attempts to five. The exact
   added test fails before repair (`attempts == 5`, expected zero), then passes:
   reject stale generations before any current-attempt mutation. Fresh link remains
   redeemable after six old-link replays. This is recovery availability/isolation,
   not a newly demonstrated account takeover.

## Local evidence

- Contact API tests exercise PKCE/scope shape, callback staging, same-login finish,
  expired/replayed handoffs, disconnect generation, withheld sender keys, partial
  setup fail-closed, code/link shared single consumption, failed-send inactivity,
  expiry/attempt limits, shared send budgets and provider redirect/error sanitizing.
- Registered routes use real local signed tokens to deny non-admin/delegated
  callers. Actual recovery completion hashes the requested password, with account
  storage doubled. Existing recovery tests retain account mismatch and proof expiry.
- New UI controls cover unavailable/retry/test/disconnect, actual contact-policy
  diff payload, masked fields/reveal/re-hide, and explicit reset-link confirmation.
- Chromium synthetic component screenshots at 1440/375px cover both setup choices,
  masked SendGrid/storage keys and link confirmation. Browser controls confirm the
  secret fragment is removed, account selection accepts a new password, and reveal
  re-hides on leaving the field. These are fixture callbacks, not live OAuth/reset.
- A separately launched disposable real MinIO server exercises the actual boto3
  encrypted-state adapter. Eight concurrent link redeemers yield exactly one
  success/seven denials; stale If-Match and duplicate If-None-Match writes deny;
  stored bytes omit plaintext sender/key and anonymous object GET returns 403.
  Container is removed and no named volume retained. No existing container/bucket
  touched. Local sanitized receipt: `.context/contact-state-receipt.json`.

## Design-intent disposition and remaining gates

Fresh reviews confirm provider selection remains explicit, node-size labels are
guidance, and sender failure never becomes login authority. The existing five-
minute D61 verify-token remains reusable: single-use applies to code/link exchange,
not the entire subsequent proof/reset authority. Secret masking is shoulder-
surfing protection, not removal of admin authority or protection from screen
capture while deliberately revealed.

OPEN: model-diverse convergence/L1–L4 sign-off; bounded review/PR splits and all
normal checks; actual Google OAuth verification/round-trip/reconnect/revocation;
real Gmail/SendGrid/Twilio delivery and inbox/quotas; actual ClickHouse/account
reset/new-password login; deployed matching issuer/authenticator config; multi-
host storage/retention/lifecycle; private bucket provisioning; callback query
suppression in reverse-proxy logs and approved rollout. No provider sends or
production changes were made. The complete setup contract is
`web10-v3/auth/contact-delivery.md`.
