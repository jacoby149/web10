# Account Read Ownership Repair

28.10.2026. CORRELATION/STALE-READS follow-up to the uncommitted
[logout/close repair](repair-consent-postmerge.md), on base `4d9d9e9ed`.
Author and fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol`
contexts, same-model only. Local source repair, not merged/deployed or L1 PASS.

## Repro And Scope

Five account display reads in `ui/src/interfaces/Interface.tsx`: profile,
admin, app contracts, member groups and managed groups; plus the service/admin
debounce timers. New `accountReadOwnership.test.tsx` uses the real hook, synthetic
per-render snapshot clients and delayed HTTP/profile responses. Initial 36 cases:
**24 failed, 12 passed**. Old successes restored prior-account display data;
old failures cleared newer state. Identical-token relogin defeated the previous
contracts token-only fence, and a queued admin read still dispatched after logout.
This establishes local UI-state misattribution, not server admin access or a
demonstrated cross-user API authorization bypass.

Reads now capture identity generation, current principal/token and a per-surface
request sequence. Check ownership both before delayed dispatch and after promise/
JSON completion, including error handlers. Explicit logout, picker identity reset
and completed login invalidate prior reads, cancel debounce work and immediately
clear phone/verified/admin/contracts/group state. Current profile responses set
both true and false verification values. Retained callbacks resolve the current
client/auth rather than their old render snapshot. No transport/protocol change.

Fresh review exposed three intermediate gaps and reproduced them independently:
an old admin method sent Alice's token while checking Bob's ownership; retained
signed-out methods cleared Bob's lists; older same-session completions still
overwrote newer results. Current-client entry checks and per-surface sequences
repair these. Newer request outcomes win even when an older successful response
arrives later; a newer failure keeps the existing empty/error behavior.

## Verification

- Full UI suite: **268 passed across 22 files**, including **52 account-read**
  and **34 consent-ownership** controls. TypeScript/production build pass;
  the existing large-bundle warning remains. `git diff --check` passes.
- Added current-response controls, success/error across logout/different-account/
  same-token relogin, ten same-session ordering cases, old-render admin credential
  and signed-out list callbacks, delayed admin JSON and actual picker selection.
- Fresh same-model follow-up independently ran 164 focused cases, all 268 UI tests
  and TypeScript; six real-hook/real-SDK list ordering probes and retained-callback
  probes passed. It also verified automatic fresh-login/picker profile hydration
  with mocked HTTP, without the manual reload used by the committed picker test.
- Desktop 1280x800 and mobile 375x812 login screenshots inspected under
  `.context/account-read-repair-{desktop,mobile}.png`; no visual/route edit.
  Docker remains unavailable, so images/local probes do not close connected E2E.

## DESIGN-INTENT REVIEW

1. Intent: display the current account's state and keep valid login/picker loads.
2. Delta: abandoned generations and superseded reads cannot mutate current UI;
   old-render calls use current credentials, not an older account's snapshots.
3. By-design conflict: none found with D42/D45, persisted vaults, body tokens,
   D41/D56 or generic D60 primitives. Logout is not grant/vault revocation.
4. Standard deviation: none new. This is UI ownership, not a server auth redesign.
5. Untested intent risk: connected browser login/recovery/picker and consent
   integration remain open; all asynchronous mutations are not covered here.

Accepted bounded behavior, 28.10.2026: reset account display data until current
reads load and let latest-request outcomes win. Reopen on supported-client load,
recovery or account-switch regressions; do not restore old-account results as an
offline fallback. No rollback/cancellation of already-dispatched server work,
historical exposure, server authorization assurance, CI/deployment sign-off,
strict SDK correlation, A-01/F-01 closure or protocol L1 PASS is claimed.
