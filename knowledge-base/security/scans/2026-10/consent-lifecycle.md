# Consent Lifecycle Disposition

28.10.2026. Base: UI-owner foundation #1277 (`ef35a2f84ae30999d3fdeadec36efb168eb3c474`).
Implementation model: `openai/gpt-6-luna` via `openrouter/openai/gpt-6-luna`.
The operator assesses Luna as weaker than Sol: this is a useful security floor,
not equivalent assurance or a substitute for model-diverse review.

## Scope And Behavior

This slice covers authenticator UI lifecycle over the owned indexed replies
prepared by #1277. It does not activate strict SDK correlation or alter SDK
artifacts. IDs remain attribution only; the server remains the authority.

- Empty indexed batches settle once after identity confirmation.
- Already-granted rows are acknowledged only for the confirmed same principal
  and only when existing permissions include the exact requested permission set.
- Skip denies outstanding work. In-flight writes cannot be silently skipped.
- Logout and account change clear grant identity. Unstarted work can survive a
  same-account re-login; starting under another account clears old grants.
- Replacement terminates prior requests exactly once; stale completions and reads
  cannot settle or populate state for a later request/account.
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
