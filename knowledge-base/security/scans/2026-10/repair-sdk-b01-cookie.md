# SDK-B-01 Cookie Dictionary Repair

Date: 21.10.2026. Author/reviewer: fresh OpenCode `gpt-6.1 sol` contexts
(`openrouter/openai/gpt-6.1-sol`), not model-diverse three-dry sign-off.
Baseline: `e8b5deae4b8860b615b5411bb20dd359343b7970` (alignment #1248 merged).
Status: source/artifact repair merged #1255 (3.244.1) at `f7aabdb26346752141f46f19c393dbadfd25ddd2`; deployment/sign-off not established.

## Boundary And Repair

L1-SDK-B-01: JSON-decoding a synthetic `__proto__` cookie invoked the inherited
setter on an ordinary dictionary; its substituted prototype supplied `token`
without an own token cookie. Global Object.prototype was not changed by that
cookie. Actual cookie planting, server grants and production compromise unproven.

Define every parsed cookie as an own enumerable/writable/configurable data
property; require an own `token` before existing falsy/coercion handling. Keep
ordinary dictionaries, URI/JSON behavior (including malformed-URI exceptions),
first equals, last duplicate, SSR and public signatures. No decoder, TTL, cookie
flags, transport, popup or unrelated API changes. Pure parsing logs no credentials.

## Repro And Artifact Gates

`bun run test:run src/token.test.ts` initially: 19 failed, 19 passed, before any
runtime edit. The same synthetic prototype/token attacks reached source, ESM and
all four browser copies. After repair/rebuild all passed. Fresh review independently
replayed baseline/current source and five runtime artifacts with in-memory Node
imports/VMs: original vulnerable, current denies both cookie and ambient inherited
token selection. No live fetch, browser or private data used.

Review then strengthened the ambient-prototype regression across all six
implementations rather than source alone: final focused suite has 37 cases.
It restores modified realm prototypes in finally blocks. Compatibility controls
include own-token order, reserved names, property descriptors, writable/deletable
ordinary objects, URI/JSON, first equals, duplicate/falsy tokens and SSR.

Producer: Bun 1.3.14, TypeScript 7.0.2. Rebuilt `build:all`, `build:browser` and
both public copies using the documented source-entry commands. Only source,
five runtime files and token declaration map changed; RTC and declarations unchanged.
Fresh reviewer reproduced all five runtime builds byte-for-byte; decoded all 87
declaration-map segments against source insertions. Its legacy TypeScript compiler
API emission attempt was unavailable, not an independent declaration rebuild.
Exact browser correspondence tests remain active; no orphan artifact certified.

Final verification: `bun run test:run` (208 passed), `bun run typecheck`,
`git diff --check`. New focused tests are the committed repro-gate candidate;
historical original results above preceded the final test-strengthening revision.

## DESIGN-INTENT REVIEW

Fresh same-model reviewer read thesis, security learnings and pinned receipts.
- Intended behavior: JS-readable session persistence, ordinary cookie dictionaries; server verification establishes authority.
- Changed behavior: cookie names cannot invoke inherited setters; only an own token supplies session credentials.
- By-design conflict? None; D41/D56, JS cookies, body tokens and lifetime/flags preserved.
- Conventional standard violated intentionally? Existing non-HttpOnly/body-token choices remain intentional; no new deviation.
- Tests cover the delta? Synthetic parser and ambient-prototype exploits plus compatibility across source/five runtimes; not browser/server integration.
- Untested intent risk: browser/PWA session restoration, supported engines and cached/deployed bundles remain unverified; dated bounded acceptance in learnings.
- KB write-back: repair receipt, record, learnings, changelog and queues updated; no full-file/security PASS.

Risk accepted for bounded local repair on 21.10.2026 because public signatures and
own-token semantics are preserved and source/artifact controls pass. Reopen on
cookie-helper/toolchain changes or browser/session failures; require rollout and
independent model-diverse review before broader assurance. S-1, consent/S-6, six
orphan declaration/maps, docs RTC provenance and protocol L1-L4 gates remain open.
