# RTC Whole-File L1 Receipt

- Source: `db325cd3ca242774ed0afdaf743fdf35419da1e7`; date: 2026-10-18.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Disposition: **OPEN**, existing **BP-3** admission/certify finding; no duplicate ID.
- Coverage complete for these five tracked files, not service security sign-off.

## Inventory And Coverage

Every line, including comments/blanks and lock declarations, read against all six checklist classes:

| Whole-file path | Inclusive range | Newline LOC | Symbols / declarations inspected |
|---|---|---:|---|
| `api/rtc/index.ts` | 1-74 | 74 | imports/types 1-10; certify configuration 12-19; PeerServer 21-25; connection/token shape 27-40; certify/identity/success/close/catch 42-69; disconnect 71-74 |
| `api/rtc/Dockerfile` | 1-13 | 13 | mirrored base, workdir, manifest/lock copy, frozen install, source copy, exposed port, Bun entrypoint |
| `api/rtc/package.json` | 1-19 | 19 | module/scripts, three runtime dependencies, compiler/type development dependencies |
| `api/rtc/tsconfig.json` | 1-16 | 16 | all compiler/output/include/exclude settings |
| `api/rtc/bun.lock` | 1-370 | 370 | header/workspace 1-18; all package/version/hash/dependency/platform/bin/nested-resolution declarations 19-370 |

Total: **5 files / 492 newline LOC**, no gaps/overlap. `git ls-tree -r --name-only <pin> -- api/rtc` matched exactly; `git diff --exit-code <pin> -- <five paths>` returned 0. Counts independently obtained from pinned `git show` output. Lock coverage is inventory/artifact declarations, not external implementation review. No tests/generated/vendor implementation added to denominator; no `api/app` coverage claimed.

## Orient And Intent

- Read AGENTS, security theory/post-mortem, learnings, security record/backlog, I1-I6 overview, six-class checklist, design-intent gate, strategy thesis and current plan/lane/changelog scan entries.
- Onboarding: BP-3 already owns RTC admission; S6 remains open. API certify parity and fail-closed rejection work do not close pre-upgrade admission or issuer trust.
- Recession: `.catch` remains present; rejected promises now request close. No return to the historical missing-catch behavior was observed.
- Obvious gap: issuer selection assumes unsigned provider claims identify a trustworthy verifier; dependency integrity and pre-admission signaling semantics remain assumptions, not certified properties.
- Intent: generic signaling for apps/P2P; preserve readable-node D41, body-token transport, operator-configured HTTP certify base and useful diagnostics. No runtime delta/fix; fresh independent design/security review pending.

## Checklist Dispositions

1. **Access control (I1/I2/I3/I5): BP-3 OPEN.** `jwt.decode` at 36 supplies provider/username/site without local verification; 50 selects the verifier from that provider unless operator configuration overrides it. Only HTTP status 200 and the locally constructed identity are checked (54-60), not authenticated response claims, audience, expiry, revocation or one-use consumption. Delegating verification to a genuinely trusted API is not itself a missing gate. There is no local document/storage query for I3.
2. **Injection:** no local SQL, shell, filesystem-input, template/render or executable-deserialization sink. Decoding does not itself execute payloads. URL construction is addressed under boundaries, not claimed as code injection.
3. **Boundaries/transport (I5/I6): BP-3.** A fake unsigned provider selects the outbound HTTPS destination and receives the fake token body; fake HTTP 200 retains matching fake identity. This is conditional local trust/routing proof, not actual SSRF/private-network access or token validation. No local cross-store query. `CERTIFY_BASE_URL` is operator control, not an attacker-controlled setting finding. Actual PeerJS token URL transport/origin policy needs L2 inspection.
4. **Availability:** no explicit request timeout or pending-auth bound; synchronous decode/post exceptions are outside the promise catch. Route hangs/errors to reliability, not new C+I findings.
5. **Data lifecycle:** authentication is asynchronous inside an already-fired `connection` callback; this file does not pause traffic, bind a single-use ticket or recheck expiry/revocation after success. Pending fake requests do not request close. Actual pre-verification signaling/impersonation or replay remains L2+/BP-3 evidence debt, not demonstrated traffic access.
6. **Hygiene:** no credential literals found in these files; hashes are artifact integrity metadata, not secrets. Docker uses frozen lockfile and targeted copies, but a mutable base tag without digest; provenance/build contents require artifact review. Identity logs (57-58) and error message (66) are unredacted sinks; no reachable protected-secret source demonstrated, so secret disclosure is UNVERIFIED. Do not remove useful diagnostics wholesale. No external advisory/package-code safety claim.

## BP-3 Evidence And Close Paths

Confirmed local behavior at 36/50-60: fake decoded `{provider:"evil.invalid", username:"victim", site:"app.invalid"}` selects `https://evil.invalid/certify`; fake status 200 plus ID `evil_invalid victim app_invalid tab` produces zero closes. This proves token-selected verifier/status trust conditional on the fake dependencies, not real credentials or another user's identity takeover. Same issue stays **BP-3**, zero new confirmed IDs.

Source and execution agree: non-string token (29-32), falsy decode (37-40), mismatched ID or resolved non-200 (63), rejected request (65-68), and disconnect (71-74) request close if a socket exists. Matching 200 returns without close. Optional absent socket is tolerated. Dot-to-underscore identity canonicalization is lossy; label is unverified and extra `~` segments are discarded (34), source-inferred only. No claim that this produces a cross-user collision.

## Safe Reproduction

Executed with Node v24.18.0, no installs, files, real sockets, network or PeerServer. TypeScript/esbuild packages were unavailable; built-in `stripTypeScriptTypes` and experimental VM modules were available. No source implementation was rewritten. Run from repository root:

```sh
node --experimental-vm-modules --input-type=module -e '
import vm from "node:vm"; import {stripTypeScriptTypes} from "node:module";
import {execFileSync} from "node:child_process"; import assert from "node:assert/strict";
const pin="db325cd3ca242774ed0afdaf743fdf35419da1e7";
const source=stripTypeScriptTypes(execFileSync("git",["show",`${pin}:api/rtc/index.ts`],{encoding:"utf8"}));
async function run(name,{claims={provider:"evil.invalid",username:"victim",site:"app.invalid"},raw="synthetic~tab",id,base,status=200,reject=false,pending=false,noSocket=false,decodeThrow=false,postThrow=false,disconnect=false}={}){
 const handlers={},calls=[],logs=[]; let closes=0,resolve,rejectPromise;
 const promise=new Promise((a,b)=>{resolve=a;rejectPromise=b;});
 const context=vm.createContext({process:{env:base===undefined?{}:{CERTIFY_BASE_URL:base}},console:{log:(...x)=>logs.push(x),error:(...x)=>logs.push(x)}});
 const deps={axios:{default:{post:(...x)=>{calls.push(x);if(postThrow)throw Error("sync post");return promise;}}},jsonwebtoken:{default:{decode:()=>{if(decodeThrow)throw Error("decode");return claims;}}},peer:{PeerServer:()=>({on:(event,fn)=>handlers[event]=fn})}};
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(Object.keys(deps[spec]),function(){for(const [k,v] of Object.entries(deps[spec]))this.setExport(k,v);},{context})); await module.evaluate();
 const expected=`${claims?.provider} ${claims?.username} ${claims?.site} tab`.replaceAll(".","_");
 const client={getToken:()=>raw,getId:()=>id??expected,getSocket:()=>noSocket?undefined:{close:()=>closes++}};
 let thrown=false;try{handlers.connection(client);}catch{thrown=true;}
 const before=closes;
 if(!pending){if(reject)rejectPromise(Error("synthetic rejection"));else resolve({status});}
 await new Promise(r=>setImmediate(r)); if(disconnect)handlers.disconnect(client);
 console.log(JSON.stringify({name,before,closes,thrown,calls})); return {before,closes,thrown,calls};
}
let r=await run("untrusted-provider-200");assert.equal(r.closes,0);assert.equal(r.calls[0][0],"https://evil.invalid/certify");
r=await run("configured-base",{base:"http://api"});assert.equal(r.calls[0][0],"http://api/certify");assert.equal(r.closes,0);
for(const [name,opts] of [["nonstring",{raw:42}],["null-decode",{claims:null}],["wrong-id",{id:"different"}],["status-201",{status:201}],["status-401",{status:401}],["rejected",{reject:true}],["disconnect",{disconnect:true}]]){r=await run(name,opts);assert.equal(r.closes,1);}
r=await run("pending",{pending:true});assert.equal(r.closes,0);assert.equal(r.before,0);
r=await run("no-socket",{raw:42,noSocket:true});assert.equal(r.closes,0);assert.equal(r.thrown,false);
for(const opts of [{decodeThrow:true},{postThrow:true}]){r=await run("sync-exception",opts);assert.equal(r.thrown,true);assert.equal(r.closes,0);}
console.log("all assertions satisfied; fake dependencies only");
'
```

Result: all assertions satisfied across 13 cases; only expected experimental warnings. The first two cases retained sockets; seven close-path cases each closed once; pending/absent-socket cases closed zero times; both injected synchronous exceptions escaped with zero closes. No failed probe was concealed or repaired by replacing application logic.

## Unverified Handoffs And Limits

- **L2/BP-3:** inspect actual PeerServer upgrade/registration/routing order and whether offers/messages or ID reservation are usable before certification; fake callbacks prove only no local pause/close, not usable traffic.
- **L2+/BP-3:** establish trusted issuer allowlist/API verification and response binding, actual JWT decode shape/error behavior, Axios URL/redirect/proxy behavior, expiry/revocation/replay enforcement and canonical ID collision reachability.
- **L2+/artifact:** trace actual logging sources/access, PeerJS handshake credential transport, image provenance and package integrity/advisories. No protected-data disclosure, production reachability, exploit against real dependencies, build, dependency audit or deployed configuration validation performed.
- Scan only; no fix, central-doc/runtime/git mutations, security PASS, whole-service assurance, three-dry or model-diverse sign-off. Required independent review remains pending.
