# SDK L1 Source Coverage And Artifact Map

Pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`, 2026-10-18.
Scanners: OpenCode `gpt-6.1 sol` (API ID `openrouter/openai/gpt-6.1-sol`).
This is first-party source coverage, not a security PASS or shipped-bundle audit.

## Source Denominator

| Whole tracked file | Newlines | Logical lines |
|---|---:|---:|
| `sdk/src/browser.ts` | 314 | 315 |
| `sdk/src/http.ts` | 103 | 103 |
| `sdk/src/index.ts` | 63 | 63 |
| `sdk/src/rtc/index.ts` | 227 | 227 |
| `sdk/src/token.ts` | 94 | 94 |
| `sdk/src/types.ts` (type-only, included) | 11 | 11 |
| `sdk/src/v3.ts` | 1,682 | 1,683 |
| Total: 7 non-test source files | 2,494 | 2,496 |

Only browser/v3 lack terminal newlines; complete logical EOF reads required.
Tests excluded: `sdk/src/http.test.ts` 86 and `sdk/src/v3.test.ts` 1,699 lines
(2 files/1,785 lines). Entire tracked src tree: 9 files/4,281 logical lines.
No source JS/declarations or hidden v2/v3 source directories at this pin.
Packaging, locks, dependencies, tests, docs/assets and generated/copied bundles
are not credited as runtime source scans. Context reads do not add coverage.

## Receipt Integration

| Scope | Owned logical ranges | Count | Receipt | Integration |
|---|---|---:|---|---|
| A | Whole browser.ts | 315 | `l1-sdk-a.md` | Recorded |
| B | Whole http/index/token/types.ts | 271 | `l1-sdk-b.md` | Recorded |
| C | Whole rtc/index.ts | 227 | `l1-sdk-c.md` | Recorded |
| D | v3.ts 1-633 | 633 | `l1-sdk-d.md` | Pending |
| E | v3.ts 634-1092 | 459 | `l1-sdk-e.md` | Pending |
| F | v3.ts 1093-1683 | 591 | `l1-sdk-f.md` | Pending |

Recorded rows claim line coverage only, not security sign-off. D/E/F have no
gaps/overlap; E/F split between methods inside the same enclosing factory, not
independent top-level functions. Mechanical accounting against pinned Git blobs
reconciles every source line and includes type-only declarations. Pending rows
are assignments, not published coverage.

## Shipped Artifact Manifest (Mapped, Not Scanned)

Exactly 24 tracked artifacts under `sdk/dist/`:

```text
browser.js                 index.js                 rtc/index.js
wapi.js
auth.d.ts                  auth.d.ts.map
browser.d.ts               browser.d.ts.map
client.d.ts                client.d.ts.map
compat.d.ts                compat.d.ts.map
http.d.ts                  http.d.ts.map
index.d.ts                 index.d.ts.map
rtc/index.d.ts             rtc/index.d.ts.map
token.d.ts                 token.d.ts.map
types.d.ts                 types.d.ts.map
v3.d.ts                    v3.d.ts.map
```

`sdk/package.json` is `web10-npm@2.0.0`: root ESM/types exports use dist/index;
`./rtc` uses dist/rtc/index. Bun build src/index -> ESM dist/index; src/rtc/index
-> ESM dist/rtc/index; TypeScript emits declarations/maps excluding tests.
Browser build src/browser -> IIFE dist/browser.js; no package script generates
dist/wapi.js. SDK Docker runs these builds; UI/social/e2e consume tracked dist.
Maps for auth/client/compat name source paths absent at this pin: provenance
debt, not evidence that retained declarations are safe or harmful.

Copied artifacts: `marketing/web10-social/public/wapi.js`,
`marketing/marketing-ui/public/docs/wapi.js` and
`marketing/marketing-ui/public/docs/rtc.js` (RTC source marker, IIFE described
in messages HTML, no matching IIFE package script). Marketing Docker rebuilds
the browser entry over its docs copy; social's package build does not refresh
its public wapi copy. Reproducible source-to-artifact correspondence is unverified.

Pinned SHA-256 checks: dist/browser.js, dist/wapi.js and social/public/wapi.js
are identical: `d07f2cbaaac93b2ac61b270043d2468495a7cf3df4df015428dd9054be646806`.
Marketing docs/wapi.js differs: `56e545d65589bc27d8fe47169c4ecb511cc017b1d1ea3e9a5b6145029fdf2fd8`.
Reproduce with `git show <pin>:<path> | shasum -a 256`. Equality is not source
correspondence, credential safety, dependency audit or generated-artifact coverage.

## Evidence And Assurance

SDK's 166 existing tests and `tsc --noEmit` passed after frozen dependency install;
no source, lock or tracked distribution changed. Existing green tests do not
close S-1/S-6 or establish untested sender/credential behavior.
Fresh same-model reviewers replayed the published minimal probes and checked
coverage/calibration. Broader author-reported probe summaries are labeled as
such, not all independently reproduced. No browser/network/real credentials or
server grants tested; no three-dry/model-diverse sign-off or fix claimed.
Source reads do not cover the copied artifacts above or close existing findings.
