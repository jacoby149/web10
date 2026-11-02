# O10 Evidence And Design Review

Integration: input reports were promoted from `.context/` alongside this review; the current index incorporates the new pin and calibrated dispositions.

Date: 2026-10-27. Reviewer/model: `openai/gpt-6.1-sol`, routed `openrouter/openai/gpt-6.1-sol` (OpenCode). Fresh review context, same model family as both authors: **not model-diverse convergence or three-dry sign-off**.

Target: `1332abc678344d24dc6f85227549dda2b0bef9a9`. Comparison/observed working HEAD: `f7aabdb26346752141f46f19c393dbadfd25ddd2`. Reviewed `.context/l1-o10-source.md` (103 lines) and `.context/l1-o10-artifacts.md` (196 lines). Verdict: **bounded evidence accepted with qualifications below; security gate OPEN**. No new independently demonstrated C+I exploit. First-use correctness blocker confirmed. No repair, deployment assurance, L2 advancement or security PASS.

Only this scratch file written with apply_patch. Existing dirty B-8 settings/test work, central documents and untracked receipts preserved. Runtime evidence uses Git objects, not the older working runtime. No product/test/central edits, installs, commits, pushes, live credentials or actual network. In-memory VM/build execution is not a product test-suite run.

## Orientation

Read security method, six-class checklist, design-intent gate, learnings, thesis, D92, complete OAuth KB, strategy directory and relevant plan/lane/changelog entries; current index and exact exclusion supplement. The current index is explicitly at f7, not the O10 pin. Its table line 17 says **16 current API whole-file refresh paths**, not 17; O10 adds SDK drift, not a newly reviewed API file. Working queues still list O10 open, but pinned implementation exists. No reimplementation or queue correction authorized here.

Onboarding: retain issuer/default/freshness/store debt, S-1, joint A-01/F-01, S-6 and artifact provenance obligations. Recession: repaired cookieDict/access-token selection is not proof the new refresh selector is guarded. Obvious gap: callback readability, result authenticity and caller transaction ownership are distinct; so are local logout, refresh persistence and server authority. Availability is not a new C+I finding.

## Scope And Correspondence

The source receipt accounts for complete `v3.ts` **1-1939** plus `index.ts` **1-67**, **2,006 logical / 2,005 LF**. Its contiguous ranges cover declarations, helpers, factory, OAuth, retained wrappers/consent, interface and EOF. Fresh review inspected the pinned OAuth types and full initialization/OAuth/token-management bodies plus exports and receipt accounting; this is **not a second independent exhaustive 2,006-line scan**. Original whole-file credit remains attributed to its scanner.

The artifact receipt covers nine changed paths: `sdk/dist/{browser.js,wapi.js,index.js,index.d.ts,index.d.ts.map,v3.d.ts,v3.d.ts.map}`, social `public/wapi.js`, marketing `public/docs/wapi.js`. Complete changed declarations/maps and two 152-line compiled semantic deltas are author-attributed reads, not nine fresh whole-runtime reads by this reviewer. Independent execution loaded both complete unique runtimes and validated both maps.

Independently checked all nine raw-byte manifest SHA-256 values, bytes and exact 22-path Git delta. Nine artifacts total **238,017 bytes / 6,049 LF / 6,053 logical**, six unique streams **2,777 logical**; maps decode **3,710 VLQ segments**, source positions in bounds. Structural validity does not regenerate declarations or establish their semantic/compiler correctness.

| Pinned stream | Independently verified SHA-256 |
|---|---|
| `sdk/src/v3.ts` | `46352baef2c6a4cbb1fdd463994b3e410a837f3678278915d8e6ab60e9053405` |
| `sdk/src/index.ts` | `694fb3fdac1a4090b7cde46f60e6b5afbfea2e88cfdbbbc4b25f604f65e5b0fa` |
| Browser IIFE: browser.js, wapi alias, social copy, marketing copy | `50785e1b687e9f454f8a1eebcdc46483be39afeab3aef1d2e0501bb46be9e6fa` |
| ESM `sdk/dist/index.js` | `a9194c02e0d372174fe05d61526021cd9e22f80daeaeae89b49d0624aab3800f` |
| `sdk/dist/index.d.ts` | `3fae4b692a337deebd79898736d8c1fdfdaba3185bcb5eb91bb0921cc5d833b6` |
| `sdk/dist/index.d.ts.map` | `281240dbe4dcbaff0b02f9264015aa45ad6898a259af4a7ee7a31ce80f139548` |
| `sdk/dist/v3.d.ts` | `e66e91d3ccab898750fb252fc35b9a834df5b1b679673928b8d47bba2c47a1e6` |
| `sdk/dist/v3.d.ts.map` | `f2faa0de01d0d103bcaa5867b010feb2d2c11a21453fb1c38a90fa255cfaf906` |

Replayed the receipt's Git-backed, SDK-cwd, write:false Bun 1.3.14 producer: **index.js exact match; browser.js exact match**, exit 0. Together with four-copy equality this establishes correspondence for **all five current pinned runtime outputs**, not merely three browser files. No normalization or working-source substitution. No TypeScript declaration compiler reproduction, binary provenance, package publication, deployment or cache-freshness assurance.

Exact selected accounting remains **171 paths / 31,537 logical lines**, versus f7's 171/30,451: two sources +260, nine artifacts +826, total +1,086. Other 160 selected paths unchanged by exhaustive delta. Whole tracked tree 1,512 -> **1,518**; exclusions 1,341 -> **1,347**, the six added research documents. Modified tests/four central docs are excluded from production credit. This is reconciliation against the current supplement's explicit selector, not a fresh full-tree read. Node/Bun/TypeScript, Python packages, npm/transitives, images/actions, vendor libraries and other external implementations have **no code-safety assurance** from lock syntax, hashes or these builds.

## Findings And Downgrades

1. **Callback result binding: conditional local integrity concern, not established authentication bypass.** `sdk/src/v3.ts:836-891`; IIFE 352-377; ESM 343-368. Independent replay confirms wrong path, wrong/missing state and overlapping popup consumers resolve. Additional isolated controls show wrong path with correct state resolves, and correct path with wrong or absent state resolves. OAuth KB:71 and source:440-442 explicitly assign optional state to the connector. Therefore **wrong-state acceptance alone is not a demonstrated violation of chosen policy**, and mandatory SDK-generated state/PKCE is not a justified repair requirement. A caller comparison rejects wrong/missing state. Wrong-path acceptance still conflicts with the helper's advertised callback-landing semantics, but attacker-controlled readable navigation and caller reliance must be established before treating it as an exploitable C+I break. Same-origin readability is a browser prerequisite, not proved by fake Window. No real code redemption, login CSRF, session substitution or valid grant demonstrated. Source O10-01 and ART-01 are one concern, not two vulnerabilities. Their moderate/medium labels must remain conditional, not unconditional severity claims.

2. **First exchange: confirmed correctness/design blocker, not security exploit.** `v3.ts:809-818,895-906`; IIFE 385-398; ESM 376-389. Fresh authorize supplies clientId only to the URL; exchange requires an existing delegated token. Both published replays fail before transport, despite the instruction to run authorize + exchange first. Primed exchange is a valid control but cannot validate initial connection. SSR restoration of refresh+secret alone also lacks client identity. Resolve the client-identity API/ownership design and test first connection; do not recommend a synthetic/unsigned token as an application workaround. No unauthorized access follows from this denial.

3. **Refresh after signout: retention proved; authority remains conditional.** `v3.ts:762-804,909-930,948-965`. Both runtimes retain refresh material and cached clientId after signOut; synthetic success reinstalls synthetic access only when the caller separately supplies a client secret. Source:764-765 explicitly intends refresh after scrub/expiry. OAuth KB describes contract/family revocation, not a promise that local signOut revokes the server family. Additional negative transport control returns invalid_grant after signOut: refresh rejects and access remains null. Thus **not proven continuing authority after logout, revocation bypass, or secret-free reauthentication**. Retain O10-02/ART-02 as one lifecycle/ownership decision with conditional C+I impact. Do not silently mandate deleting deliberately restorable credentials. Cached A clientId surviving setToken(B) and shared cookie selection are reproduced request-composition defects/candidates, not demonstrated cross-client authorization.

4. **Inherited refresh selection: conditional new-selector candidate, not old cookie regression.** `v3.ts:778-780`; IIFE 277; ESM 268. Source probe stubs cookieDict and is insufficient to establish the real parser's behavior. Stronger artifact probe uses the actual helper with VM-local ambient `Object.prototype.refresh_token`; inherited material is selected/sent with synthetic delegated identity and secret. Clearing the pollution and supplying a `__proto__` cookie does not alter Object.prototype or select that cookie's refresh material. Separate attacker-controlled ambient pollution remains unproved. Preserve merged SDK-B-01 parser/access-token repair status; consider own-property selection narrowly, not an invented browser/global pollution exploit.

5. **Retained classes stay open.** Source P7 independently reproduces F-01 unbound consent acceptance and S-6 wildcard metadata target. Neither demonstrates valid credentials or token exfiltration. S-1 is outside this fresh probe and remains historical/open; no O10 closure. Issuer, expiry, server single-use/rotation, schema and delegated revocation concerns from the f7 index are not repaired or freshly certified by this SDK delta. No additional new finding allocated from timer/close/cookie-malformation reliability behavior.

All six classes considered in this review: access-control authority remains server-owned; no new demonstrated injection execution sink; callback/transport limits as above; availability routed separately; refresh lifecycle bounded; hygiene/provenance and inherited selection remain explicit. Unsigned client_id extraction is request metadata, not local server authorization. Merely bundling a confidential-client helper does not prove a secret was embedded or exposed.

## Executable Proof Verdicts

Executed 2026-10-27, exit 0 for both published evidence blocks and producer replay. Expected Node experimental VM/type-stripping warnings only. All URLs/credentials/cookies/results synthetic; real network calls zero.

| Proof | Result | What it does not prove |
|---|---|---|
| Source P1-P7 | All seven groups passed | Not full SDK suite, real browser or server authorization |
| Artifact inventory/copies/maps | All assertions passed; 3,710 segments | Not declaration regeneration or external provenance |
| IIFE and ESM VM controls | First-use gap, callback mismatch/concurrency, valid/deny/blocked, refresh/logout/cache/inheritance/SSR reproduced | Not SOP, real timer/cookie delivery, valid tokens or server rotation |
| Five-runtime correspondence | Two exact in-memory builds plus four IIFE-copy hashes passed | Not installed/published/served/cached-version assurance |
| Additional separated callback controls | Correct-state/wrong-path, wrong-state/correct-path and absent-state/correct-path all resolve; caller comparison rejects mismatched/absent state | Does not prove SDK state ownership or real attacker navigation |
| Additional denied refresh after signOut | Synthetic invalid_grant rejects; state.token remains null | No authority-after-logout conclusion from an always-success fake server |

Repeat published artifact probe from repo root:

```sh
node --experimental-vm-modules -e 'const s=require("node:fs").readFileSync("knowledge-base/security/scans/2026-10/l1-o10-artifacts.md","utf8");eval(s.split("```javascript\n")[1].split("```")[0])'
```

Additional controls below reuse only its in-memory realm definitions, not its assertion loop. The script is executable offline and writes no files:

```sh
node --experimental-vm-modules <<'NODE'
const fs=require('node:fs');
let s=fs.readFileSync('knowledge-base/security/scans/2026-10/l1-o10-artifacts.md','utf8').split('```javascript\n')[1].split('```')[0];
s=s.slice(0,s.indexOf("for(const p of ['sdk/dist/browser.js','sdk/dist/index.js'])"));
s+=`
for(const path of ['sdk/dist/browser.js','sdk/dist/index.js']) {
 const r=await realm(path),c=r.api.createV3Client({apiOrigin:'https://api.invalid'});
 const opts={clientId:'client-a',redirectUri:'https://app.invalid/callback',state:'EXPECTED'};
 for(const [url,state] of [
  ['https://app.invalid/other?code=FAKE&state=EXPECTED','EXPECTED'],
  ['https://app.invalid/callback?code=FAKE&state=WRONG','WRONG'],
  ['https://app.invalid/callback?code=FAKE',null]]) {
  const pending=c.oauth.authorize(opts);r.popup.location.href=url;r.poll();
  const result=await pending;a.equal(result.state,state);
  a.equal(result.state===opts.state,state==='EXPECTED');
 }
 c.setToken(jwt('client-a'));c.oauth.setRefreshToken('SYNTHETIC');
 await c.oauth.refresh({clientSecret:'SECRET'});c.signOut();
 r.x.fetch=async()=>({ok:false,status:400,statusText:'Bad Request',json:async()=>({detail:'invalid_grant'})});
 await a.rejects(c.oauth.refresh({clientSecret:'SECRET'}));a.equal(c.state.token,null);
 console.log(path+': separated callback and denied-after-signOut controls passed');
}
})().catch(e=>{console.error(e);process.exitCode=1});`;
eval(s);
NODE
```

## DESIGN-INTENT REVIEW

- Intended behavior: D92/OAuth KB adds optional confidential-client delegated connection without changing contracts, groups or I3. A connector can obtain its first code and exchange it, persist/rotate credentials, and use caller-managed optional state. Browser convenience must not silently promise stronger callback authentication than implemented.
- Changed behavior: this review changes no runtime. O10 adds URL/popup completion, exchange, eager refresh-cookie loading and refresh persistence for SDK consumers. Initial connectors cannot complete exchange without preexisting delegated identity; existing consumers gain separate refresh state whose ownership is not specified by old signOut semantics.
- By-design conflict? No proposed policy reversal. Preserve D60 generic node, D41 readable-node/PWA/no-default-E2E, D56 content-blind telemetry, body-token transport and JS-readable cookies/lifetimes. A mandatory PKCE/public-client conversion conflicts with v1 confidential-client scope (OAuth KB:381-384).
- Conventional standard violated intentionally? Optional connector-managed state is cited at OAuth KB:71/source:440-442; lack of built-in comparison is not itself a newly chosen violation. Callback-path/concurrency guarantees and local logout/account/client persistence ownership are insufficiently specified: decision required, not acceptance manufactured here.
- Tests cover the delta? Partially. Replayed synthetic probes validate local outcomes and negative/legitimate controls; primed-token tests do not cover initial enrollment. No product suite, browser integration, real rotation/revocation or declaration compiler run. Hash/build equality covers emitted correspondence only.
- Untested intent risk: callback restrictions could reject legitimate callback query/path configurations or overlapping flows; indiscriminate logout clearing could break intended restoration; identity caching repair could route credentials incorrectly. First enrollment, account/client switches, browser/PWA cookies and real confidential-server custody need focused tests and explicit ownership decisions. Risks remain OPEN, not newly accepted.
- KB write-back: intentionally none under scratch-only authorization. This fresh same-model review is not author self-approval, diverse convergence, implementation risk acceptance or a completed repair gate.

## Remaining Blockers

First-use exchange correctness; callback ownership/real-browser/caller evidence; explicit refresh/logout/account/client semantics; conditional selector hardening disposition; retained f7 findings and red/green repairs; TypeScript declaration reproduction and orphan/docs-RTC provenance; publication/deployment/cache evidence; external-code assumptions; central receipt incorporation and required model-diverse three-dry sign-off. L2 direct edges, L3 transitive service work, L4 integration and Wave 2 consumer/session/cache scans remain owed. No real protected records, DB atomicity/schema behavior, live credential custody, historical exposure or durable authority was tested. Selected read accounting is not security assurance.
