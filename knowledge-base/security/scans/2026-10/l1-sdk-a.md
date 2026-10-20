# SDK L1 Scope A: Browser Popup Adapter

- Date: 2026-10-18. Pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Status: OPEN. File-local coverage complete; security review pending. No fix or PASS.
- Owned path: `sdk/src/browser.ts`, inclusive logical lines 1-315; 314 newline bytes, 315 logical lines, unterminated EOF read. No unscanned range.
- Campaign denominator: seven source files, 2,494 newlines/2,496 logical lines; this receipt covers only one. Two test files/1,785 lines excluded. No bundle/copied-artifact coverage claimed.

## Orientation And Intent

- Read AGENTS, contract, strategy directory, thesis, plan/parallel queues (L1-008 still open), changelog, security learnings, I1-I6 overview, October SDK audit, checklist, design-intent gate, consent and SDK contracts KB; design.md read for consent-surface context only.
- Onboarding: S-1 missing auth origin, S-6 wildcard consent delivery are existing findings, not exhaustive coverage. S-4 metadata decoding and S-5 JS-readable cookie/lifetime remain by design; S-2/B-4 is transport-to-log composition, not a new body-token defect.
- Recession: the pinned adapter still lacks sender binding. Different nonempty usernames are rejected, but same-user refresh and first-login acceptance do not authenticate the sender.
- Obvious gap: readiness, response correlation, overlapping requests and popup replacement must be checked independently of the token listener. I1/I2 issuer/auth verification and I3/I5 server gates are not certified by client metadata checks; I4 readable-node and I6 API federation intent preserved.
- Design-intent lens: automatic return-run consent, lazy gesture-driven group consent, distinct windows, handoff=none and same-user callback deduplication must survive any repair. Delta here is documentation only; no deliberate choice (D41/D56/body transport/no HttpOnly) reversed. Fresh independent design-intent review and real-browser lifecycle tests remain owed.

## Exhaustive Symbol Coverage

| Inclusive lines | Symbols and reviewed flow |
|---|---|
| 1-20 | Header, imports/type seams; imported implementations explicitly outside scope. |
| 21-35 | `_authPopup`, `_popupReady`, `_readyListener`; module-local ephemeral shared state, no persistent window binding. |
| 36-79 | `openAuthPortal`, URL/as/handoff, distinct name, blocked popup, replacement listener, unbound auth_ready callback. Full href becomes redirect and log input. |
| 80-133 | `authListen`, handler, decode/current-cookie boundary, mismatch return, sameUser refresh/dedupe, unsubscribe. No origin/source gate. |
| 134-171 | `createV3Client`, saved delegate, patched contractRequest, token/open-popup branch, async existing-contract fast path and catch fallback. |
| 172-249 | `doContractRequest`, responseHandler, sendContract, readyHandler, 30s timeout, cleanup, reuse and delegate fallback. No sender/request correlation; wildcard send. |
| 250-281 | `checkExistingContracts`, app origin-only match; group cookie reread, username/provider path construction, getGroup catch, unknown-kind/empty-loop return true. |
| 282-291 | `closeAuthPopup`: wildcard close command; no state reset/confirmed close. |
| 292-315 | `web10` exports, helper aliases, window availability guard/global assignment and default export through unterminated EOF. Comments/blanks included. |

## All Six Classes

1. Access control: S-1 and L1-SDK-A-01 below; identity check is conditional metadata protection, not signature verification. Local client approval is not proof of a server grant.
2. Injection: no eval, HTML renderer, SQL, shell or filesystem sink in this file. URL redirect/as use encodeURIComponent; group-name normalization is not authorization. Helper/parser behavior unverified.
3. Boundaries/transport: S-1/S-6 reproduced; readiness and response source are unchecked. Configured authOrigin is caller input, not independently trusted here. No direct account token URL construction; full redirect href may already contain sensitive caller data (candidate only).
4. Availability: timeout, null/closed popup, listener lifetime and missing callback after a sent-but-unanswered request are reliability debt, not new C+I findings.
5. Data lifecycle: in-memory popup flags, listener removal, cookie refresh/dedupe, concurrent response fan-out and replacement examined. No request nonce; stale-window events can target outstanding handlers (A-01).
6. Hygiene: no hardcoded credential found. Logs include contracts, callback data, URL and identity metadata; no direct stored-token log in this file. Manufactured secret-bearing payloads are not evidence of protected-data disclosure.

## Confirmed Local Findings

- **S-1 (OPEN), 84-133:** hostile-origin/unrelated-source auth event writes the synthetic first-login token and signals true. Different named user is blocked; same username with changed provider refreshes the cookie without callback. Missing incoming username bypasses mismatch protection. Requires attacker window reference/message delivery; no valid signature, real login or API access demonstrated.
- **S-6 (OPEN), 192-205, 286-290:** consent payload and close command target `'*'`. Synthetic rogue auth_ready triggers consent send to the retained popup sink, NOT the attacker's event.source; the retained popup's navigation/origin is not pinned. This is wildcard consent/close metadata hygiene, not a violation of the KB's token-specific wildcard prohibition or evidence of token exfiltration. Contract metadata, not a token, is the outgoing payload. Real navigation/disclosure is untested; wildcard hygiene and conditional local delivery are demonstrated.
- **L1-SDK-A-01 (OPEN), 180-189:** forged contract_response from unrelated source/origin reaches approval callbacks and removes their listeners. One event satisfies two concurrent requests without correlation. Cross-reference: [L1-SDK-F-01](l1-sdk-f.md) records the same consent-response integrity class across a separate public implementation. Retain A-01/F-01 as location-evidence aliases, not independent fix classes. Local consent-result integrity weakness; actual grants/private reads depend on uninspected callers/server and are not claimed.

## UNVERIFIED L2+ Handoffs

- Origin-only app existence ignores requested permission delta; unknown kinds vacuously approve. The published probe exercises app and unknown-kind fast paths only, not the group branch. The group existence/policy/roles gap is source-supported only: this local branch checks getGroup success without comparing requested policy/roles or establishing caller authority. None demonstrates an unauthorized durable grant. Trace real list/get semantics, schemas and callback consumers.
- Global popup replacement, close-without-reset and readiness races need actual WindowProxy/navigation/UI sender semantics and delegate comparison. Distinct naming uses time/randomness for window separation, not a security nonce.
- Trace whether redirect href/contracts/response logs ever contain protected values and who can read them; no disclosure finding from a fabricated secret error. Token/cookie/delegate implementations and shipped distributions remain uninspected here.

## Executable Offline Proof

Run from repository root; requires installed Node with `stripTypeScriptTypes`. No install, network, browser or file writes. Execute the fenced probe from this receipt:

`node -e 'const s=require("node:fs").readFileSync("knowledge-base/security/scans/2026-10/l1-sdk-a.md","utf8");eval(s.split("```javascript\n")[1].split("```")[0])'`

```javascript
(async () => {
const assert = require('node:assert/strict'), vm = require('node:vm');
const {execFileSync} = require('node:child_process'), {stripTypeScriptTypes} = require('node:module');
const raw = execFileSync('git', ['show', 'caeed44278adb65d19f5c737ed9188ccf589b69c:sdk/src/browser.ts'], {encoding:'utf8'});
assert.equal(raw.split('\n').length,315); assert.equal(raw.split('\n').length-1,314); assert.ok(!raw.endsWith('\n'));
const code = stripTypeScriptTypes(raw.replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm,'').replace('export default web10','globalThis.result = web10'));
let cookie='', signed=0, fallback=0, posts=[], opens=[], timers=new Map(), next=0, listeners=new Set();
const decodeJwt=t=>{try{return JSON.parse(t)}catch{return null}};
const window={location:{href:'https://app.invalid/view'}, addEventListener:(_,f)=>listeners.add(f), removeEventListener:(_,f)=>listeners.delete(f), open:(url,name)=>{const p={closed:false,postMessage:(data,target)=>posts.push({data,target})}; opens.push({url,name,p});return p}};
const context={window,console:{log(){},warn(){},error(){}},cookieDict:()=>({}),readTokenCookie:()=>cookie,setTokenCookie:t=>{cookie=t},scrubTokenCookie:()=>{cookie=''},decodeJwt,isTokenExpired:()=>false,Web10Error:class extends Error{},_createV3Client:()=>({contractRequest:()=>fallback++,listAppContracts:async()=>[{allowed_origin:'https://app.invalid'}],getGroup:async()=>({})}),setTimeout:f=>{timers.set(++next,f);return next},clearTimeout:id=>timers.delete(id)};
vm.runInNewContext(code,context); const w=context.result;
const emit=data=>{for(const f of [...listeners])f({data,origin:'https://rogue.invalid',source:{}})};
const token=(username,provider='node.invalid')=>JSON.stringify({username,provider});
const off=w.authListen(()=>signed++);emit({type:'auth',token:token('alice')});assert.equal(signed,1);assert.equal(cookie,token('alice'));
emit({type:'auth',token:token('bob')});assert.equal(cookie,token('alice'));
emit({type:'auth',token:token('alice','other.invalid')});assert.equal(signed,1);assert.equal(cookie,token('alice','other.invalid'));
emit({type:'auth',token:'{}'});assert.equal(cookie,'{}');assert.equal(signed,2);off();emit({type:'auth',token:token('bob')});assert.equal(cookie,'{}');
cookie=token('alice');w.openAuthPortal('https://auth.invalid',{handoff:'none'});assert.ok(opens[0].url.includes('&as=alice&handoff=none'));
const c=w.createV3Client();let approved=0;const contracts=[{kind:'app',app_origin:'https://app.invalid',permissions:{notes:['create']}}];
c.contractRequest(contracts,'https://auth.invalid',r=>{if(r.status==='approved')approved++});
emit({type:'auth_ready'});assert.equal(posts.length,1);assert.equal(posts[0].target,'*');assert.equal(posts[0].data.type,'contract');
c.contractRequest(contracts,'https://auth.invalid',r=>{if(r.status==='approved')approved++});assert.equal(posts.length,2);
emit({type:'contract_response',status:'approved'});assert.equal(approved,2);assert.equal(timers.size,0);
emit({type:'contract_response',status:'approved'});assert.equal(approved,2);
w.closeAuthPopup();assert.equal(posts.at(-1).target,'*');assert.equal(posts.at(-1).data.type,'close_popup');
opens[0].p.closed=true;let fast=0;c.contractRequest(contracts,'https://auth.invalid',()=>fast++);await new Promise(setImmediate);assert.equal(fast,1);assert.equal(fallback,0);
c.contractRequest([{kind:'unknown'}],'https://auth.invalid',()=>fast++);await new Promise(setImmediate);assert.equal(fast,2);
cookie='';c.contractRequest(contracts,'https://auth.invalid');assert.equal(fallback,1);
w.openAuthPortal('https://auth.invalid');assert.notEqual(opens[0].name,opens[1].name);
console.log('315 logical / 314 newlines; S-1, S-6, A-01 reproduced; identity/dedupe/unsubscribe, cleanup, fast-path, fallback, distinct-window assertions completed');
})().catch(e=>{console.error(e);process.exitCode=1});
```

Results: executed with Node v24.18.0, exit 0; all assertions completed, including S-1/S-6/A-01 reproductions and identity/dedupe/unsubscribe, cleanup, fast-path, fallback and distinct-window checks. Only Node's experimental type-strip warning emitted. Helpers deliberately use synthetic JSON metadata and memory cookie; no JWT signatures verified. Window/message delivery and timers are inert stubs, not browser scheduling or origin enforcement. No production credentials, protected-data access, durable grants, artifact equivalence or model-diverse/three-dry sign-off established.
