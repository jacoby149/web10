# SDK L1 Scope B Receipt

Date: 2026-10-18. Pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`.
Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
Status: OPEN local parser weakness; coverage complete, security review pending.
No fix, PASS, independent/model-diverse review, three-dry or shipped-artifact claim.

## Accounting
Every line, including comments, blanks and EOF, read in these complete files:

| Path | Inclusive logical range | Newlines | Logical lines |
|---|---|---:|---:|
| `sdk/src/http.ts` | 1-103 | 103 | 103 |
| `sdk/src/index.ts` | 1-63 | 63 | 63 |
| `sdk/src/token.ts` | 1-94 | 94 | 94 |
| `sdk/src/types.ts` | 1-11 | 11 | 11 |
| Total: four files | no gaps | 271 | 271 |

All terminate with newline. Probe compared each working blob hash to the pin.
Only file-local L1 certified as read; helpers/callers, tests, bundles and copies excluded.

## Orient And Intent
Read root AGENTS, scan contract, strategy thesis/plan/current L1-008 queue,
recent changelog, security theory/checklist/design-intent gate, learnings,
I1-I6 overview, October SDK audit and relevant SDK API/contracts material.
Onboarding: S-2 is intentional JSON-body transport composing with B-4 logging;
S-3 is tokenless-GET functionality, S-4 unsigned metadata, S-5 accepted JS cookie.
Recession: verify those boundaries rather than repeat historical safety verdicts.
Gap: cookie-name/object-prototype handling and fetch defaults deserve explicit checks;
issuer verification, read gates and distribution integrity are not proven here.
Intent: JS-readable persistence, metadata UX and generic HTTP; server owns authority.
Design-intent delta: none, read-only receipt. Preserve body transport, no HttpOnly,
accepted lifetime, local HTTP development, D41 readability and D56 telemetry.
Untested intent risks: real browser cookies/redirects, callers and server enforcement.

## Exhaustive Symbol Coverage
- `http.ts:1-22`: `Web10Error`, constructor/status/details; raw body retained, no logger.
- `http.ts:23-67`: `extractDetail`, array callback and private `httpError`; JSON parsing,
  string/array/object/null/fallback branches; no eval or render sink.
- `http.ts:68-103`: `authPost`, `authGet`; stringify, fixed headers, query coercion,
  existing-query separator, null omission, non-2xx/text rejection and JSON handoffs.
- `token.ts:1-24`: type import and `cookieDict` reducer; absent document, splitting,
  first equals, trim, URI/JSON decode, catch and ordinary-object accumulator.
- `token.ts:25-60`: `readTokenCookie` falsy/coercion/catch; `setTokenCookie` document
  guard, age arithmetic, conditional Secure and raw interpolation; scrub assignment.
- `token.ts:61-94`: `decodeJwt` split/atob/parse/catch; `isTokenExpired` missing,
  invalid and past/future ISO expiry comparisons. Metadata only, not verification.
- `index.ts:1-63`: every runtime/type re-export, including all V3 names, token
  utilities, HTTP errors and payload type; no local validation or runtime gate.
- `types.ts:1-11`: `TokenPayload` and all six fields; erased interface, no validator.

## Six Classes
1. Access control: no local protected-data gate; S-4 metadata may accept nonobjects,
   two segments and unverified claims. Missing/invalid expiry returns false by intent.
2. Injection: confirmed returned-dictionary prototype injection below; raw cookie
   attribute interpolation is a caller-input handoff. No SQL/shell/eval/HTML sink.
3. Boundaries/transport: fixed Content-Type/Accept, no Authorization added; POST
   serializes caller body. GET serializes any supplied token into URL but adds none.
   Redirect/credentials options absent (fetch defaults); actual forwarding untested.
4. Availability: unrelated malformed URI cookie throws; unbounded parse/body reads
   and no timeout are reliability observations, not C+I findings.
5. Lifecycle: accepted 60-day default, caller age override, scrub path=/; HTTPS
   Secure/SameSite=Lax, intentionally JS-readable. No ticket/OTP/race primitive.
6. Hygiene: no embedded credentials or console/log calls in these four files.
   Error details preserve response text, but no reachable protected-value source
   was demonstrated. B-4/S-2 composition requires separate server evidence.

## Confirmed Local Finding
`L1-SDK-B-01` OPEN: `token.ts:18,23,31` permits a parsed `__proto__` cookie to
replace the returned dictionary prototype; `readTokenCookie` reads inherited token.
Synthetic cookie containing only that name returned `SYNTHETIC-INHERITED`, despite
no own `token` property. Global Object.prototype was unchanged. This is local
object/credential-selection integrity evidence, not global prototype pollution,
verified identity forgery, real cookie planting, private-data access or auth bypass.
Precondition: such a cookie reaches document.cookie; attacker delivery is unverified.

## Executable Core Repro
Run from repository root; Node 24.18.0, no installs/writes/network:
```sh
node --input-type=module <<'JS'
import {execFileSync as git} from 'node:child_process';
import {stripTypeScriptTypes as strip} from 'node:module';
import assert from 'node:assert/strict';
const pin='caeed44278adb65d19f5c737ed9188ccf589b69c';
const src=git('git',['show',`${pin}:sdk/src/token.ts`],{encoding:'utf8'});
const t=await import('data:text/javascript;base64,'+Buffer.from(strip(src)).toString('base64'));
globalThis.document={cookie:'__proto__='+encodeURIComponent('{"token":"SYNTHETIC-INHERITED"}')};
assert.equal(Object.hasOwn(t.cookieDict(),'token'),false);
assert.equal(t.readTokenCookie(),'SYNTHETIC-INHERITED');
assert.equal({}.token,undefined);
document.cookie='unrelated=%';assert.throws(()=>t.readTokenCookie(),URIError);
console.log('local inherited-token reproduction confirmed; malformed cookie throws');
JS
```
Result: assertions succeeded; Node emitted only its experimental strip-types warning.
Author-reported standalone pinned in-memory probe succeeded: four blob/count checks; POST body
and fixed headers; tokenless GET and explicit query token; absent fetch overrides;
HTTPS cookie flags/5184000 age/scrub; unsigned array/two-segment decode; past expiry
true, invalid/missing false; Web10Error raw detail and extractDetail array/fallback.
Fetch was an inert capture stub, cookie a plain object; no browser/service contacted.
That broader harness is not published here; those broader assertions were not
independently replayed with this minimal reproduction, which covers only B-01's
dictionary (not global) prototype behavior and the malformed-cookie exception.

## UNVERIFIED L2+ Handoffs
Actual caller-supplied URL credentials (existing extraction S7), redirect replay and
ambient same-origin cookies require caller/browser evidence, not a new local leak.
Trace cookie planting authority, token interpolation inputs and downstream reliance
on inherited/unsigned claims. Trace real error sources/rendering/logging separately.
S-3 caller omission, B-4/S-2 log composition and issuer/expiry enforcement remain
outside this file-local claim. No other confirmed ID; no central state was changed.
