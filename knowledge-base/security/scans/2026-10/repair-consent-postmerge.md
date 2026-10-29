# Post-Merge Consent Lifecycle Repair

28.10.2026. Base `4d9d9e9ed` (#1291 merged). Implementation/review by separate
OpenCode `openrouter/openai/gpt-6.1-sol` contexts; no diverse-review credit.
Scope: authenticator `Interface.tsx` logout and delayed credential-popup close,
with real-hook/view controls in `consentOwnership.test.tsx`. No SDK/artifact,
API, style, route, E2E assertion or permission-policy changes.

## Failure And Repair

CI #1291 shard 1 failed the nonempty consent logout/relogin fork at
`authenticator-torture.spec.ts:739`: no signed-in callback after relogin. Its
two retry-only failures were mixed app-approve/group-deny and cookie relogin.
Those transient closes are not independently diagnosed by this local repair.

Baseline current ownership suite: three failing existing close-ownership tests,
26 passes. Logout preserved untouched rows; two unit expectations required this
behavior while the real browser required cancellation. Replace those contradictory
expectations, retaining the account-picker preservation control. Add real-view
nonempty indexed and legacy logout/relogin cases: seven initial failures/24 passes.

Explicit logout now cancels all outstanding consent before signing out, including
empty/no-op requests. It clears pending rows, returns cancellation once, and
leaves credential login alive. Old in-flight completion cannot approve cancelled
rows; already-dispatched server writes cannot be rolled back. Picker selection
without logout continues to review untouched work with grants cleared.

Restore the delayed-close guard over batch/principal/token. Fresh review found
that token comparison must consult the current interface, not its captured client:
adapters are recreated per render. Add per-render snapshot-client coverage and a
handoff generation invalidated on identity reset/new handoff, covering identical
token/account restoration after a no-batch logout. Lazy-group overlap is tested
inside the 300ms close window, not only after the old timer has fired.

## Verification And Intent

`bun install --frozen-lockfile` used the pinned existing lock with no tracked
manifest/lock changes. `bun run test:run --silent`: **216 passed**, 21 files,
including **34 ownership cases**. `bun run build`: typecheck/production build
pass (existing large-bundle warning). Login screenshots inspected at 1280x800
and 375x812 under `.context/consent-repair-{desktop,mobile}.png`; no visual edit.
The first screenshot command used port 3001 while Vite binds 80; rerun on 80
completed and cleaned up its server. Images do not prove popup integration.
Fresh same-model follow-up found no remaining blocker for this bounded slice
and independently ran ownership/account-switch/view suites: 49 tests passed.

DESIGN-INTENT REVIEW: intent is D42 self-contained login and explicit consent;
delta is terminal explicit logout plus timer ownership, not grant revocation or
vault deletion. No D41/D56/D60 or intentional body-token/JS-cookie reversal, no
new conventional-standard deviation. SDK consent-error cleanup leaves its
credential listener/bound popup intact by source inspection. User-visible risk:
apps needing a cancelled grant must retry instead of inheriting old approval.
Accepted bounded tradeoff, 28.10.2026; reopen on supported-client cancellation or
credential-handoff failures, never silently grant cancelled work as a workaround.

Residuals: profile/group/admin requests and service/admin debounce callbacks are
not all account-fenced; stale UI state after logout remains separate debt. No
server authorization bypass or historical exposure is proved by those callbacks.
That source gap is now locally addressed by the separate
[account-read ownership repair](repair-account-read-ownership.md); its connected
browser/deployment gates remain open. The original 216-test count above belongs
to the logout/close slice; the combined current suite has 268 passes.
Docker daemon unavailable: actual connected E2E logout, mixed denial and cookie
return-run still require a fresh browser run. Do not claim those flakes fixed,
all-green CI, deployment, strict SDK correlation, A-01/F-01 closure or L1 PASS.
