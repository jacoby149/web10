# S-1 Auth Sender Binding

28.10.2026. Baseline `b828736b426e4d36b9fbc334f2b142e9468b9856` (#1271 merged).
Author/fresh reviewers: separate OpenCode `openrouter/openai/gpt-6.1-sol`
contexts, same-model, not diverse three-dry review. Source repair merged #1273
at `c258ce048`; delivery/diverse sign-off pending, protocol L1 OPEN.

Publication: [all four browser E2E shards](https://github.com/jacoby149/web10/actions/runs/40634797677)
and applicable SDK/package/Docker/security checks passed on a2262c620 without
reruns. SDK, browser copies and sharing fixture are byte-identical in the merge.
This is current CI evidence, not external legacy migration or deployment proof.

## Boundary And Repair

An unrelated window/origin could inject a synthetic first-login token into the
cookie and trigger sign-in. Ten initial fresh-source/four-browser-copy cases
failed before repair, including a blocked replacement's stale sender.
No valid credential, server grant or account takeover was demonstrated.

A private registry binds credential handoff to the current SDK-opened window and
canonical configured origin. Both explicit login and standalone contractRequest
openers register it; the latter's handshake, targets and timeout stay unchanged.
Wrong/null source, wrong/empty/opaque origin and unknown windows are denied.
Credential opens clear trust before window.open (including throws/null results).
Latest credential flow replaces earlier trust; consent-only handoff=none neither
replaces that trust nor authorizes its own token. No .closed check: genuine queued
delivery may outlive the sender. Identity filtering/dedupe/unsubscribe remain.

Review found the documented authenticator-opens-app path would break. The
operator clarified that contractOnReady stays: its two-argument metadata call
remains, with optional third trusted authOrigin for source-bound opener tokens.
It is app configuration, never inferred from an incoming message. User grants
decide repeated-consent skipping, not sender trust; no new skip-consent permission
or server auto-approval is implemented. A-01/F-01 and S-6 remain OPEN.

## Evidence And Design Review

Twenty table cases exercise fresh source and all four shipped browser copies:
hostile/unknown sender rejection, canonical origins, queued close, replacement,
consent overlap, throw/block, identity/dedupe, unsubscribe, original standalone
handshake/timeout, fast path, lookup fallback and configured legacy handoff.
246 SDK tests and typecheck pass; pinned Bun 1.3.14 reproduces five runtime outputs.
The new helper declarations/maps and affected existing maps are generated, not
hand-edited. Existing orphan declarations/RTC provenance remain separate debt.
Sharing E2E now rejects an app self-post then injects a duplicate from a real
SDK-opened authenticator-origin popup; it is not a full UI login proof.
Playwright lists all 14 sharing tests; actual browser CI remains required.

Fresh review independently replayed baseline acceptance/current denial and
matched all five runtime builds. Intent: D42 consent and D45 repeat delivery;
delta: only configured, bound credential senders accepted; no conflict with
JS cookies/body tokens/D41/D56. Existing consent authorization is unchanged.
The legacy blocker was resolved with explicit trust configuration, not arbitrary
opener acceptance. Actual browser/PWA cold/return/lazy flows remain unverified.

Accepted bounded migration risk, 28.10.2026: external opener-handoff callers must
configure trust; competing login attempts use latest-credential-wins. Reopen on
supported caller migration, overlap/queue/origin discrepancies, separately loaded
SDK-instance interactions or toolchain/artifact changes. No server crypto/token
policy change, deployment assurance or model-diverse/security PASS is claimed.
