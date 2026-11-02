# SDK Resumption: Protocol L1 Receipt

Date: 2026-10-28. Target/observed HEAD: `49178a87dcd651337e7f17dea68b66f377ae2e05`.
Comparison: `1332abc678344d24dc6f85227549dda2b0bef9a9` (O10).
Scanner: Sol parent, OpenCode `openai/gpt-6.1-sol`, routed model ID
`openrouter/openai/gpt-6.1-sol`. No separate reviewer or different family used.
Disposition: **OPEN**, not model-diverse sign-off, three-dry convergence, security
PASS, deployment assurance or permission to advance beyond protocol L1.

## Scope And Orientation

Read AGENTS in full; browsed strategy; read thesis, plan/lane completion entries,
recent changelog, security learnings, security method and six-class checklist.
Read current index, SDK index, artifact correspondence, S-1/sender repair,
consent ownership/lifecycle and O10 source/artifact/review receipts. Onboarding:
retain issuer, provenance and server-authority limits. Recession: test sender and
cookie repairs rather than inheriting their assurance. Obvious gap: sender
identity does not attribute a reply to a request, row or complete batch.

Only this receipt is written. No runtime, tests, artifacts or central docs edited;
no install, network, secrets, real auth, browser, database, commit or push.
Existing dirty `ui/src/interfaces/Interface.tsx` remains untouched. Its diff
removes the generation/principal fence around the delayed close at 1275-1277;
this conflicts with the lifecycle receipt's intended fence and is an integration
warning, NOT a fresh whole-UI/Wave2 scan or demonstrated browser regression here.

## Complete Source Reads

Working SDK sources/artifacts were verified byte-equal to HEAD with `git diff
--exit-code HEAD -- sdk/src sdk/dist sdk/package.json sdk/tsconfig.json
marketing/web10-social/public/wapi.js marketing/marketing-ui/public/docs/wapi.js`.
All inclusive ranges below were read completely, including comments/types/EOF.
The historical seven-file denominator is now eight: `popup.ts` was added.

| Whole file | Inclusive lines | Principal checks |
|---|---:|---|
| `sdk/src/browser.ts` | 1-322 | Popup registry/readiness, auth install/dedupe, reused consent, fast path, wildcard sends, exports |
| `sdk/src/http.ts` | 1-103 | JSON transport, GET encoding, raw response error details |
| `sdk/src/index.ts` | 1-67 | All runtime/type exports |
| `sdk/src/rtc/index.ts` | 1-227 | Peer identity, token/label signaling, ICE, inbound/outbound handlers, timeout/types |
| `sdk/src/token.ts` | 1-98 | Own-property parsing/selection, cookies, unsigned decode, UX expiry |
| `sdk/src/types.ts` | 1-11 | Metadata payload type, not verification |
| `sdk/src/v3.ts` | 1-1951 | Complete declarations/helpers/factory, OAuth, all API wrappers, consent, interface/EOF |
| `sdk/src/popup.ts` | 1-28 | New private canonical-origin/window matcher and credential registry |

Total: **eight files/2,807 logical lines**; original seven: 2,779. No historical
whole-project denominator is silently promoted to this pin. UI/API callers,
server grants, external dependency implementations and operational state excluded.

## Generated Comparison And Test Producer

Full source coverage above is distinct from generated semantic-delta comparison.
Read complete prior-to-current diffs of `sdk/dist/browser.js` and `index.js`:
browser matcher 115-138, consent 867-938, opener/auth 944-1010 and reused response/
readiness changes around 1026-1063; ESM matcher 70-91, consent 855-926.
Four IIFEs are copies, not four independent semantic reviews. Changed declaration/
map paths are `sdk/dist/{browser.d.ts.map,v3.d.ts,v3.d.ts.map,popup.d.ts,popup.d.ts.map}`;
their existence/delta is inventoried, not whole-file reviewed or compiler-certified.
Historical orphan `auth/client/compat` declarations/maps and docs RTC provenance
remain OPEN. No claim to reread all dist files or independently validate every map.

Read producer `sdk/package.json:1-58`, `tsconfig.json:1-22`,
`vitest.config.ts:1-9`, `src/browserArtifacts.test.ts:1-55` and
`src/browserAuth.test.ts:1-252`. Artifact test builds into a temporary directory,
compares four copies and tests inert anonymous/API controls. Auth tests build fresh
IIFE/ESM to stdout; VM ESM export rewriting is a test convenience, not browser ESM
integration. They cover sender/lifecycle controls but do not assert request IDs,
row indices or complete-batch aggregation. No full read of the other test files.

## Six Threat Classes And Findings

| Class | Current bounded disposition |
|---|---|
| 1 Access control | Server remains authority; unsigned client metadata is not verified auth. S-1 hostile acceptance at prior pin/current denial replayed. Matching consent sender still lacks transaction attribution. No valid server grant or auth bypass proved. |
| 2 Injection | No local eval/shell/HTML/SQL execution sink found in these sources; JSON/caller SQL/URLs/keys are forwarded as data. Cookie parser own-property repair retained. Downstream execution/rendering not certified. |
| 3 Boundaries/transport | A-01/F-01 remains local L1 debt: `browser.ts:179-244`, `v3.ts:1744-1777,1799-1806` settle by type/sender, not request/batch/index. S-6 wildcards remain at browser 208/296 and v3 1808-1811, metadata hygiene, not proved token exfiltration. Body tokens/JS cookies are intentional. |
| 4 Availability | Malformed cookie decoding, polling/timeout cleanup, missing legacy timeout and reused-popup post-send lifetime are reliability/correctness concerns, not new C+I findings. No load/DoS testing. |
| 5 Lifecycle | O10 client/cache/refresh persistence and callback concerns retained below; same-window stale/concurrent consent settlement remains demonstrated. SDK does not implement indexed complete-batch ownership. UI foundation/lifecycle receipts are integration prerequisites only. |
| 6 Hygiene | No embedded real secret established. Cookie Secure-on-HTTPS/Lax/60-day and unsigned UX decode remain deliberate. Browser URL/contract diagnostics can contain caller data; no actual credential-bearing log source demonstrated. Producer equality is not supply-chain/provenance assurance. |

**Confirmed local residual:** one trusted `contract_response` invokes both pending
reused-popup callbacks, at both pins. Replay uses two empty requests and inert
windows; it proves missing callback correlation, not permission creation. Legacy
opener and fixed-name standalone reuse have the same source-level missing-ID
condition; those variants were inspected, not separately dynamically replayed.
Per-row replies can also settle a multirow SDK request before full disposition;
browser/UI cohort behavior is not independently exercised here.

**Confirmed correctness:** `v3.ts:809-818,896-907` first code exchange still needs
a preexisting delegated token/client ID; fresh exchange throws before transport.
**Conditional O10 concerns:** readable wrong-path/concurrent callback acceptance
(`837-893`); retained refresh/cache after signout and stale client-ID preference
(`763-805,910-930,949-966`); inherited refresh selection (`779-782`) with separate
ambient prototype pollution. Replayed in IIFE and ESM with synthetic transport.
No attacker-controlled real navigation/pollution, code redemption, authority after
logout, revocation bypass or cross-client access established. Caller-owned optional
state and intentional restoration are not silently replaced with new policy.
Actual `__proto__` cookie control does not pollute the prototype/select refresh.
`token.ts:84-97` still has fail-open UX expiry and stale server-matching prose;
this does not undo the server freshness repair or prove server acceptance.

## Executed Evidence And Commands

- `git status --short && git rev-parse HEAD`: requested pin; only dirty UI file initially.
- `git diff --stat 1332abc678344d24dc6f85227549dda2b0bef9a9 HEAD -- sdk marketing/web10-social/public/wapi.js marketing/marketing-ui/public/docs/wapi.js`: 14 changed SDK/copy paths; new popup source/declarations and auth test included.
- SDK cwd: `bun --version` -> 1.3.14. `bun run test` -> exit 127, `vitest: command not found`; separately `bun run typecheck` -> exit 127, `tsc: command not found`. No install attempted; historical 265 passes are NOT this run's results.
- SDK cwd: in-memory `Bun.build({entrypoints:[entry],target:"browser",format,write:false})` for `src/browser.ts` IIFE, `src/index.ts` ESM and `src/rtc/index.ts` ESM; assert emitted text equals tracked outputs. Exit 0: four browser copies, index ESM and RTC ESM exact. No dist writes or declaration regeneration.
- Node VM prior/current replay: hostile auth callbacks **1 -> 0**; one trusted reply settles two requests **2 -> 2**; current wrong-origin/bound-window rejected, legitimate queued closed-window auth accepted. Exit 0, inert timers/cookies/windows, zero network.
- O10 current replay command below: exit 0, both runtimes reproduce first-use gap, wrong callback/concurrency, refresh/logout/cache/inheritance/SSR observations; valid/deny/blocked/rotation/clear/safe-cookie controls hold. Expected experimental VM Modules warning only.

```sh
node --experimental-vm-modules -e 'const fs=require("node:fs");let s=fs.readFileSync("knowledge-base/security/scans/2026-10/l1-o10-artifacts.md","utf8").split("```javascript\n")[1].split("```")[0];s=s.replace("1332abc678344d24dc6f85227549dda2b0bef9a9","49178a87dcd651337e7f17dea68b66f377ae2e05");const begin=s.indexOf("const changed="),end=s.indexOf("const jwt=");s=s.slice(0,begin)+s.slice(end);eval(s);'
```

## Remaining Gates And Next Repair

Next repair: **A-01/F-01 strict request/batch correlation**, preserving sender
checks, queued delivery, granular decisions and valid no-op/cancel/account/lazy
flows. Require red-before/denied-after concurrent/stale/duplicate/wrong-index and
partial-batch replays, all terminal outcomes and legitimate complete batches;
regenerate/compare SDK outputs and validate the real SDK/UI browser cohort.
Resolve the dirty delayed-close integration discrepancy before relying on UI
lifecycle readiness. Do not activate strict replies based on this receipt alone.
Full SDK tests/typecheck, fresh design-intent review, declaration/provenance work,
supported-client migration, deployment/cache evidence and required model-diverse
three-dry sign-off remain owed. O10 correctness/conditional debt and central
ledger obligations remain visible; no L2/L3/L4 or Wave2 advancement claimed.
