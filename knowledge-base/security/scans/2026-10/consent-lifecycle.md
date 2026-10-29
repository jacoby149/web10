# Consent Lifecycle Disposition

28.10.2026. Base: UI-owner foundation #1277 (`ef35a2f84ae30999d3fdeadec36efb168eb3c474`).
Implementation model: `openai/gpt-6-luna` via `openrouter/openai/gpt-6-luna`.
The operator assesses Luna as weaker than Sol: this is a useful security floor,
not equivalent assurance or a substitute for model-diverse review.

## Scope And Behavior

Post-merge Sol repair: [logout and close ownership](repair-consent-postmerge.md).
Source #1282 retained the logout/browser mismatch and lost the close guard; the
earlier test-pass numbers below are historical author-reported evidence, not a
fresh source guarantee. Current local suite: 216 UI tests, 34 ownership cases;
connected E2E remains blocked locally by the unavailable Docker daemon.

This slice covers authenticator UI lifecycle over the owned indexed replies
prepared by #1277. It does not activate strict SDK correlation or alter SDK
artifacts. IDs remain attribution only; the server remains the authority.

- Empty indexed batches settle once after identity confirmation.
- Already-granted rows are acknowledged only for the confirmed same principal
  and only when existing permissions include the exact requested permission set.
- Skip denies outstanding work. In-flight writes cannot be silently skipped.
- Explicit logout clears grant identity and cancels all pending consent. Account
  selection without logout may preserve untouched work for review as that account.
- Replacement terminates prior requests exactly once; stale consent completions
  cannot settle later work. Contract reads have a token fence; profile/group/admin
  read ownership is separate unresolved lifecycle debt, not covered by this claim.
  Follow-up [account-read repair](repair-account-read-ownership.md) now covers
  those five read paths locally; connected browser and broader mutation gates
  remain open, not implied by consent completion tests.
- A completed app-login transaction cannot close a popup after a new lazy group
  request has started; close timers are fenced by the consent generation.

## Evidence And Current Disposition

`ui/src/__tests__/consentOwnership.test.tsx`: 29 focused tests pass, including
real `useInterface` + `ConsentView` flows for empty/no-op, skip, replacement,
same-account re-login, account switch, in-flight work and lazy group follow-up.
Full UI suite: 211 tests pass. TypeScript and production build pass. Dependency
installation used the existing frozen lockfile; manifests and lockfiles are
unchanged.

Two CI E2E runs exposed the same-account logout/relogin cancellation and then a
lazy-group popup close race. Candidate fixes and focused regressions are now
present, but no post-fix browser shard has passed yet. Docker is unavailable in
the local workspace, so local real-browser replay is blocked. Do not call this
slice browser-verified until a fresh CI E2E run passes.

## DESIGN-INTENT REVIEW

- Intent: preserve explicit consent attribution and authenticate the selected
  account before any no-op approval; preserve lazy group setup after login.
- Delta: lifecycle terminal paths, grant identity fencing, and popup close
  generation fencing. Strict SDK correlation remains inactive.
- By-design conflict: none with generic D60 primitives, D41 node readability,
  D56 telemetry, body-token transport, or server authorization.
- Untested intent risk: corrected real-browser behavior, SDK/artifact cohort,
  deployment and supported-client compatibility remain open pending CI and
  independent review.

## Remaining Gates

A-01/F-01 remains OPEN. Re-run and pass the real browser E2E shard after the
candidate fixes. Then separately integrate strict SDK correlation, regenerate
and compare artifacts, validate the browser SDK/UI cohort, obtain fresh
design-intent review and required model-diverse three-dry sign-off. No protocol
L1 PASS or L2 advancement is claimed.
