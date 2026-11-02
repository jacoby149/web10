# Consent UI Ownership Foundation

28.10.2026. Baseline `40a515fcc1e16ef7add39f0724e6b98dafaa7d91` (#1275 merged).
Author/fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol` contexts,
same-model, not diverse three-dry sign-off. Local UI preparation, pending PR merge;
no strict SDK activation, full-batch support, deployment or A-01/F-01/L1 PASS.

## Target And Scope

The UI lost envelope identity/index when normalizing contracts. Per-contract
replies were uncorrelated; completion of A's approve-all could clear and hand off
over B's newly displayed batch. `_source`-based removal also conflated aliased
rows. Simply making the SDK require IDs would break no-op and batch lifecycles,
so this bite prepares the responder without changing SDK source/artifacts.

Normalized rows now carry distinct private ownership, original index/count and
batch identity. Optional indexed replies echo `requestId` and `contractIndex`
to the captured requester at its actual message origin, not requested app_origin.
IDs are attribution, never permission; ownership fields are excluded from API
writes. Valid preparation envelopes are nonempty unified arrays with 1-128-char
`[A-Za-z0-9_-]` IDs. Present malformed metadata/containers, opaque origins or
missing sources are ignored, never silently treated as legacy approval.
This is envelope validation, not a semantic contract-authority validator.

A per-window/origin ledger rejects repeated indexed delivery for this UI page.
Per-row guards prevent duplicate apply/decision, including shallow alias clones.
Removal is exact; superseded completions still reply to their own requester but
cannot remove/confirm/hand off over a newer batch. API invocation remains
immediate inside try/catch; synchronous failures share the error responder.
Approve-all removes only completed owned work, retains retryable failures, and
does not finish over in-flight rows. Indexed errors are terminal; a fresh request
is needed. Unversioned replies and explicit legacy retry remain compatible.
Legacy SMR expansion now carries captured ownership and independent local rows,
but emits no indexed wire metadata; ID-bearing legacy SMR is unsupported.

## Evidence

Real useInterface hook tests dispatch MessageEvents and stub only adapter/API/
window boundaries. Independent Vite load-plugin replay substituted baseline hook
source in memory: all seven corrected initial tests failed, plus three malformed
row exceptions. The initial draft had six failures and a shallow-equality pass;
that assertion was repaired to identity before implementation. No test weakening.

Fresh review also reproduced A's delayed status reset clearing B's denial. Its
durable regression failed before, passes after batch-fencing the timer. This is
not a claim of universal async/account/lifecycle fencing.

Thirteen controls pin indexed approve/deny/error, stale approve-all/no handoff,
duplicate delivery/clicks, aliased rows, synchronous/asynchronous failures, invalid
downgrade, per-window IDs, legacy retry, timer ownership, mixed single/all/in-flight
decisions, legacy expansion and app/group API metadata exclusion. Full UI suite:
195 passed; typecheck and production build pass. SDK unchanged: 265 tests and
typecheck pass. Frozen UI dependency installation changed no manifest/lock.
Fresh review replayed baseline/probes and final 13 controls; the full-suite/build
results are the author's runs. No real API, browser SDK/UI exchange or grant proof.

Desktop 1280x800 and mobile 375x812 screenshots were captured and read in order:
`.context/consent-ownership-{desktop,mobile}.png`, using the self-booting harness.
They show the unchanged mock consent-login layout only, not ownership integration.

## DESIGN-INTENT REVIEW

- Intent: preserve granular explicit app/group consent while associating outcomes with original operations; matching IDs grants no authority.
- Delta: owned indexed replies, duplicate guards and exact removal; older batch completion/timer cannot overwrite newer state. Legacy wire/retry retained.
- By-design conflict: none with generic node primitives, D41, D56 or token transport; SDK/grant predicates and UI layout unchanged.
- Conventional deviation: legacy unversioned/wildcard replies remain compatibility debt, not a new security guarantee.
- Limits: empty/no-op/skip/logout/account-change/replacement/full-batch lifecycle, strict SDK/artifacts and browser cohort are NOT verified or activated.

Accept only this bounded local UI foundation, 28.10.2026. Reopen on replay,
duplicate/stale ownership, metadata leakage or legacy regression. New indexed
terminal errors require fresh requests; browser delivery and per-page ledger
lifetime/resource behavior remain unverified. Do not activate strict SDK replies
until explicit no-op acknowledgements, cancellation/disposition, account identity,
complete-batch semantics and real browser integration are repaired/tested. The
current SDK's executable cross-request PoC remains in `repair-consent-senders.md`;
correlation is still local L1 debt, not an L2 deferral or closed finding.
