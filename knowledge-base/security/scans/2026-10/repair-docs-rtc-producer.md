# Docs RTC Producer Repair

29.10.2026, local source repair on baseline
`b22fdb2ea89aec7a8aa686859bb5ac8d69246bf4`.
Author and fresh reviewer: separate `openrouter/openai/gpt-6.1-sol` contexts;
no model-diverse convergence credit. No L1 PASS or demonstrated exploit closure.

## Intent And Delta

The [provenance follow-up](l1-artifact-provenance-followup.md) established an
active docs RTC consumer with no current producer. Add a tracked wrapper exposing
exactly `window.web10rtc.{createRTC,setPeer}`, a Bun 1.3.14 producer, production
Docker generation and SDK CI path coverage. The generated asset now corresponds
to current RTC source. Six legacy declarations/maps remain untouched.

This delivers existing-source outbound reply forwarding and asynchronous ICE
helper selection/fallback to the docs demo. It preserves URL/global API,
constructor credential format, port selection, cache/close and immediate/deferred
sends. Demo CRUD remains durable truth; P2P remains best effort. No RTC core,
admission, main browser bundle or package export changes.

## Evidence

From `sdk/`, after frozen installation:

| Command | Result |
|---|---|
| `bun run test:run src/rtc/browserArtifacts.test.ts`, before regeneration | 5 failed, 8 passed: stale hash, three ICE-selection paths, outbound reply |
| `bunx bun@1.3.14 run build:rtc:browser` | regenerated docs asset |
| same focused test, final wiring control included | 14 passed |
| `bun run test:run` | 279 passed |
| `bun run typecheck` | passed |
| `git diff --check` from root | passed |

Fresh reviewer independently ran 279 SDK tests, 19 combined browser/RTC artifact
controls and typecheck. Fresh-build/shipped SHA-256:
`918e7618a18e668cdd427331e6c3a2526c8efe160a965af53f5dd4b746da6902`.
Inert peers and synthetic credentials only. Tests check source/fresh/shipped
behavior and exact producer output; Docker/workflow string assertions only guard
wiring, not actual execution.

## Review And Remaining Gates

DESIGN-INTENT REVIEW, fresh same-model context:

- Intent: reproducible optional docs RTC asset, unchanged public API and CRUD-first delivery.
- Delta: outbound replies, ICE helper lookup before peer construction, generated asset and CI routing.
- By-design conflict: none found; no D41/D56/D60 or RTC admission policy change.
- Conventional deviation: none newly introduced; existing token transport remains uncertified.
- Untested intent risk: real PeerJS, readiness/error/timeout, offline recipients and Alpine image execution remain open.

Review found a pre-existing core defect at `sdk/src/rtc/index.ts`: ICE lists are
passed as top-level `iceServers`; the demo's PeerJS 1.5.5 consumes
`options.config.iceServers`. The inert tests pin source correspondence and local
selection, NOT effective ICE configuration. This repair intentionally does not
change the shared core. Next separate slice must pin the PeerJS-consumed shape
red/green, update core and affected generated outputs, then test real integration.
Do not describe these controls as proof that TURN/STUN configuration works.

Accepted bounded intent risk, 29.10.2026: docs consumers gain existing-source
asynchronous helper lookup and outbound replies without connected verification.
A stalled lookup can delay construction before the readiness timeout starts.
Acceptance is for producer correspondence only, not signaling availability or
real-browser compatibility. Reopen on helper stalls, browser delivery regressions,
producer/toolchain changes or failed production-image verification.

Docker daemon unavailable: Linux image build and connected two-browser/offline
messages tests NOT run. Deployment/cache verification, legacy retirement decision,
effective ICE repair and model-diverse sign-off remain OPEN. No commit or PR.
