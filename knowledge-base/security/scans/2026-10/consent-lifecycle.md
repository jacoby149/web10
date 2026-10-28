# Consent Lifecycle Disposition

28.10.2026. Baseline: `ef35a2f84ae30999d3fdeadec36efb168eb3c474` (#1277 UI-owner foundation merged).
Implementation/review model: `openai/gpt-6-luna` via `openrouter/openai/gpt-6-luna`.
This model is assessed by the operator as weaker than the prior Sol model; the
result is a useful security floor but not equivalent assurance. No independent
model-diverse sign-off is claimed. SDK strict correlation remains inactive.

## Scope

This slice settles UI lifecycle behavior over the owned indexed replies prepared
by #1277. It owns only the authenticator hook, `ConsentView`, and their real-hook
tests. It does not change SDK code/artifacts, request permission semantics,
server authority, rollout, or the A-01/F-01 finding's overall disposition.

## Lifecycle Behavior

- Empty indexed batches receive one terminal response after identity confirmation;
  no permission write is performed.
- Already-granted app rows are acknowledged only after explicit identity
  confirmation and only when the existing grant contains every requested
  permission. Approve-all applies this same exact inclusion predicate.
- Skip denies outstanding rows rather than silently closing an unanswered
  request. In-flight writes cannot be skipped as if they had not started.
- Logout/account change clears grant identity. Unstarted rows remain reviewable
  by the selected account; started or partially settled batches terminate with
  errors and must be retried by the caller. Late completions cannot approve for
  a different principal.
- Replacement cancels the previous batch exactly once. Old completions and
  delayed close timers cannot mutate or close over a newer batch/account.
- Late app-contract reads are ignored when the active token has changed.

Request IDs remain attribution only. Existing permission inclusion is preserved;
the node's authorization checks remain authoritative. The responder currently
supports the prepared indexed protocol, but this slice does not activate strict
SDK correlation or demonstrate a real browser SDK/UI cohort.

## Evidence

`ui/src/__tests__/consentOwnership.test.tsx`: 27 tests pass, including real
`useInterface` + `ConsentView` flows for no-op, empty batch, skip, mixed
approve-all, account selection/change, logout, replacement, in-flight failure,
and delayed handoff/close. Full UI suite: 209 tests pass. `bun run build`
passes TypeScript and Vite production build. Dependencies installed with
`bun install --frozen-lockfile`; tracked manifests and lockfiles remain unchanged.

## DESIGN-INTENT REVIEW

- Intent: associate consent decisions with the originating request/batch while
  preserving explicit account confirmation and the exact permission predicate.
- Delta: settle empty/no-op and terminal paths; fence cancellation, replacement,
  account changes, stale reads and delayed closes. No SDK activation.
- By-design conflict: none with D60, D41, D56, body-token transport or node-side
  authorization. IDs grant no authority; permission checks remain unchanged.
- Conventional deviation: no-op approval is permitted only after explicit
  identity confirmation and exact requested-permission inclusion.
- Untested intent risk: actual browser popup scheduling, strict SDK correlation,
  generated artifacts, cross-version delivery, deployment and model-diverse
  review remain open.

## Remaining Gates

A-01/F-01 remains OPEN. Before strict SDK activation, separately verify complete
batch and cancellation semantics with the real browser SDK/UI cohort, rebuild and
compare generated artifacts, obtain fresh design-intent review and required
model-diverse three-dry sign-off. Do not claim protocol L1 PASS or advance to L2.
