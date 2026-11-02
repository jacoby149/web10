# PeerJS ICE Configuration Repair

29.10.2026; baseline `e33195921e67910ebffc0c1173c187730a1821b2`.
Author and fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol`
contexts, not model-diverse sign-off. Local source repair; connected acceptance
and protocol L1 remain OPEN. This is a compatibility defect, not a demonstrated
unauthorized-access exploit.

## Intent And Repair

The [producer review](repair-docs-rtc-producer.md) found that the RTC core supplied
selected ICE servers at the wrong constructor level. PeerJS 1.5.5, loaded by the
messages demo, defaults `options.config` in
[`peer.ts`](https://github.com/peers/peerjs/blob/v1.5.5/lib/peer.ts) and passes
`provider.options.config` into `RTCPeerConnection` in
[`negotiator.ts`](https://github.com/peers/peerjs/blob/v1.5.5/lib/negotiator.ts).
Both author and fresh reviewer checked these upstream sources independently.

Change the core to `config: { iceServers }` and update its minimal constructor
type. Keep public `state.iceServers`, explicit/fetched/fallback selection,
lookup timing, host/port/path/token, callbacks, cache/close and send behavior.
Regenerate RTC ESM, RTC declarations/map and docs IIFE only, using Bun 1.3.14;
declaration emission runs in temporary staging. Legacy declarations and main
browser SDK bundles remain untouched.

## Repro And Verification

The old 14-control correspondence suite passed despite ineffective configuration.
Before fixing runtime code, the consumed-config regression produced **9 failures,
6 passes**. A dependency-contract fixture models only PeerJS's default/config
merge and RTCPeerConnection handoff; it explicitly demonstrates ignored top-level
options versus consumed nested options. PeerJS itself is not installed/executed.
Do not mistake this fixture for dependency or network integration.

Final controls exercise source, package ESM, fresh docs IIFE and shipped IIFE for
explicit/fetched/fallback configuration, including synthetic TURN credentials.
Existing constructor, inbound/outbound delivery, connection reuse/close and
immediate/deferred-send controls remain. Fresh ESM is byte-equal and fresh docs
output matches the shipped SHA-256.

Commands from `sdk/`:

| Command | Final result |
|---|---|
| `bun run test:run src/rtc/browserArtifacts.test.ts` | 19 passed |
| `bun run test:run src/rtc/browserArtifacts.test.ts src/browserArtifacts.test.ts` | fresh reviewer: 24 passed |
| `bun run test:run` | author and reviewer: 284 passed, six files |
| `bun run typecheck` | author and reviewer: passed |
| `git diff --check` from root | passed |

Fresh reviewer also emitted declarations into external temporary staging:
RTC declaration byte-equal; map mappings and other fields match with only the
expected output-location-dependent source-path difference. Runtime/code-test
diff before documentation: six files, +42/-12.

## Design-Intent Review

Fresh same-model reviewer found no additional patch findings:

- Intent: optional generic P2P with configured/node/fallback ICE, CRUD as durable truth.
- Delta: selected ICE now reaches the configuration consumed by PeerJS rather than retaining its defaults.
- By-design conflict: none found with D41/D56/D60 or optional best-effort delivery; admission unchanged.
- Conventional deviation: none new; use the dependency's existing WebRTC configuration seam.
- Untested risk: browser acceptance, candidates, TURN authentication/relay, NAT traversal and bidirectional delivery remain unverified.

Accepted bounded intent risk, 29.10.2026: supplied servers now replace PeerJS
defaults as intended, so invalid or unreachable operator/client configuration can
affect connectivity. Local contract and parity evidence justify this narrow
source correction, not a network guarantee. Reopen on supported PeerJS-version
changes, browser configuration rejection or connected-demo regressions.

Docker daemon unavailable; no Linux image or connected two-browser/offline-recipient
messages tests run. Playwright discovery was blocked by missing `@playwright/test`;
no server was started. Actual dependency execution, STUN/TURN traffic, forced
relay, rollout/cache verification and model-diverse review remain OPEN. Existing
helper stalls, readiness/reinitialization and RTC admission are separate debt.
