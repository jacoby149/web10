# SDK Browser Artifact Correspondence

Baseline: `89323cd93b7ae273f88fbf01b8a8d6d56152e911`, 20.10.2026.
Agent: OpenCode `gpt-6.1 sol` (`openrouter/openai/gpt-6.1-sol`).
Prerequisite to L1-SDK-B-01, not the cookie repair or an auth security PASS.

## Clean Build Research

Archived only `sdk/src`, package/lock/tsconfig into a unique `.context` fixture;
no old dist files were present to mask missing producers. Frozen install and
actual package `build:all` + `build:browser` succeeded with Bun 1.3.14
(`0d9b296a`), TypeScript 7.0.2 and Node 24.18.0 on macOS arm64.

17 fresh outputs: **16 byte-identical to baseline** (14 declarations/maps and
index/RTC ESM); only browser.js differed. Browser drift is existing source's
surface/contentService handling and content event/analytics/view methods, not a
cookie fix or mere formatting. Marketing's older docs copy additionally gains
existing-source group reconciliation, membership visibility, owner healing,
ICE configuration/access and anonymous-capable read/readRefCounts/readById.
These are real consumer-visible deltas, not new source features or auth fixes.
Existing callers supplying `surface` can now trigger D86 delivery accounting;
this is not a new GA4/Hotjar integration or arbitrary content recording.

| Runtime output/copy | Baseline -> clean source build, Git lines |
|---|---|
| `sdk/dist/index.js`, `sdk/dist/rtc/index.js` | +0/-0, unchanged |
| `sdk/dist/browser.js` | +39/-1 |
| `sdk/dist/wapi.js` | +39/-1 |
| `marketing/web10-social/public/wapi.js` | +39/-1 |
| `marketing/marketing-ui/public/docs/wapi.js` | +152/-5 |

This alignment is deliberately separate from changing token.ts: otherwise the
security fix would silently carry this analytics/API parity delta too.

## Producers And Regression

`build:browser` now explicitly emits its existing dist/wapi alias from the actual
browser build. Both public copies are regenerated from the same src/browser.ts
entry/flags in the SDK working directory, not edited by hand. Refresh commands:

```sh
cd sdk
bun run build:browser
bun build src/browser.ts --target browser --format iife --outfile ../marketing/web10-social/public/wapi.js
bun build src/browser.ts --target browser --format iife --outfile ../marketing/marketing-ui/public/docs/wapi.js
```

The new browserArtifacts test builds into a fresh temporary directory, compares
all four shipped files with the real build and checks current analytics API shape
in a VM with inert window/fetch, plus group/ICE method presence and one simulated
anonymous public-read packet. The fixture omits the page URL, suppressing the
existing app-registration ping; zero constructor calls in this fixture is not
a zero-network claim for real browsers. Analytics methods remain caller-invoked.
No live browser,
service, credentials or publication; server authorization is not tested here.
Before alignment: **4 failed, 1 passed**, exact stale hashes detected; initial
jsdom URL fixture failed before tests, corrected to the intended Node environment.

After alignment: **5 passed**, full SDK **171 passed**, typecheck passed. Fresh
same-model code/design review found no blocking regression. On 20.10.2026 the
source-parity delta is accepted for this prerequisite because only real generated
outputs are included and API shape/request controls are pinned; actual analytics,
anonymous-read authorization, group mutations, ICE/server integration and deployed
versions still need integration/release evidence. Reopen on source, toolchain,
producer or copied-output changes; hash equality is not security sign-off.

## Open Gates

Resume verification, 21.10.2026: fresh same-model reviewer independently ran all
171 SDK tests and typecheck; coordinator reran five artifact tests and typecheck.
No blocking runtime finding; missing dated intent-risk write-back was corrected
in learnings. Historical four-red/17-output research was not independently replayed.
PR #1248 initially detected four hash mismatches with CI's floating Bun 1.4.3;
SDK package metadata and its CI job now pin producer Bun 1.3.14, preserving exact
comparison rather than normalizing away compiler differences; upgrades require rebuilds.

DESIGN-INTENT REVIEW (fresh `openai/gpt-6.1-sol`, not model-diverse sign-off):
- Intended behavior: generic browser SDK primitives, server-authorized public reads and D86 measurement.
- Changed behavior: browser consumers gain existing analytics; older marketing copy gains group/ICE/read parity.
- By-design conflict? None found with D41/D56/D80/D86; auth source remains unchanged.
- Conventional standard violated intentionally? Existing JS-readable cookies/body tokens remain by design; no new deviation.
- Tests cover the delta? Exact browser correspondence, API shape and one anonymous packet; not live integration.
- Untested intent risk: analytics/group/ICE/browser/deployed flows accepted only for correspondence, dated in learnings.
- KB write-back: receipt, record, changelog and queues aligned; risk/reopen note added to learnings.

Six retained declaration/maps (`auth`, `client`, `compat`) still have no current
source producer; do not delete or certify them without consumer evidence. Docs
RTC IIFE has no matching producer and is not interchangeable with RTC ESM.
Only browser correspondence is aligned; full 24-artifact integrity is not closed.
No package version/publishing, dependency/lock, RTC runtime, source auth/consent,
cookie parser, transport flags or TTL changes. L1-SDK-B-01 and S-1/S-6/consent
findings remain open; real cookie delivery, server grants and deployed versions
remain unverified. Next: separate ordinary-object/own-token repair, preserving
public helper compatibility, followed by regenerated affected runtime artifacts.
