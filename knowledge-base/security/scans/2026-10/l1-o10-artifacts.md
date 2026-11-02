# O10 Shipped-Artifact L1 Delta

Integration: source rescan is complete in `l1-o10-source.md`; fresh calibration in `l1-o10-review.md` supersedes unconditional vulnerability/severity readings of the conditional observations below.

Date: 2026-10-27. Model: `openai/gpt-6.1-sol`; routed ID `openrouter/openai/gpt-6.1-sol` (OpenCode). Target: **`1332abc678344d24dc6f85227549dda2b0bef9a9`**, equal to local `origin/dev` at scan time; prior: **`f7aabdb26346752141f46f19c393dbadfd25ddd2`**. The literal ref `origin/dev1332abc67` does not exist; both the abbreviated commit and the then-local `origin/dev` resolved to the target. No fetch/network used during that scan. This is a read-only L1 artifact-delta receipt, not a source closeout, security PASS, model-diverse review or L2 advancement.

Only this file is written, with apply_patch. Dirty settings, tests, central documents and old working artifacts are untouched. All runtime evidence comes from Git objects, never presumed-current working files. No installs, credentials, actual network, browser, database, product tests, operational scripts, commit or push. Builds below use Bun's in-memory producer, not package scripts that overwrite dist. Working documentation is orientation, including uncommitted receipts/status; it does not attest pinned runtime or deployed behavior.

## Orientation

Read AGENTS in full; browsed strategy; read thesis, D92, OAuth KB, current plan/lane O10 entries and recent changelog; security method, six-class checklist, design-intent gate and learnings; complete current SDK artifact/index/edge-review receipts and SDK artifact correspondence; selected-denominator/exclusion accounting. Working queues still show O10 open, but pinned Git evidence shows #1260 shipped it. Do not reimplement it. Existing source/artifact receipts remain historical at their stated pins.

Onboarding: retain S-1, joint A-01/F-01, S-6, repaired SDK-B-01 access-token handling and ART-01/02/03 provenance limits. Recession: new refresh-cookie selection must not silently inherit the access-cookie repair's assurance. Obvious gap: new OAuth polling is a callback boundary even though it does not use postMessage; map structure/copy equality cannot establish it safe. Confidential clients only is deliberate (OAuth KB:381-384); shipping an optional helper in browser bundles is not evidence that any real client secret is embedded or exposed. No PKCE/public-client policy is invented.

## Complete Git Delta Inventory

`git diff --name-status <prior> <target>` returns exactly **22 paths**, 16 modified and six added. There are **nine changed artifact paths**, all modified, no added/deleted artifacts. No other tracked runtime/configuration drift occurs except O10's two source files and its test file.

| Kind | Exact paths |
|---|---|
| Modified artifacts (9) | `sdk/dist/browser.js`, `sdk/dist/wapi.js`, `sdk/dist/index.js`, `sdk/dist/index.d.ts`, `sdk/dist/index.d.ts.map`, `sdk/dist/v3.d.ts`, `sdk/dist/v3.d.ts.map`, `marketing/web10-social/public/wapi.js`, `marketing/marketing-ui/public/docs/wapi.js` |
| Modified source (2) | `sdk/src/index.ts`, `sdk/src/v3.ts` |
| Modified test (1), not production read credit | `sdk/src/v3.test.ts` |
| Modified central docs (4), no runtime credit | `knowledge-base/changelogs/CHANGELOG.md`, `knowledge-base/security/security-record.md`, `knowledge-base/strategy/parallel-execution.md`, `knowledge-base/strategy/plan.md` |
| Added excluded research docs (6) | `research/README.md`, `research/brief.md`, `research/conferences.md`, `research/draft/outline.md`, `research/evaluation-plan.md`, `research/related-work.md` |

### Exact Changed Artifact Manifest

SHA-256 of raw Git bytes. Newlines count LF bytes; logical lines include unterminated EOF. Runtime JS ends with LF; all four changed declaration/map files do not. Coverage of declarations/maps is their full inclusive `1..Logical` range, not just their diff. Runtime fresh coverage is the complete new semantic lines below plus unchanged adjacent token/client context; unchanged body credit stays with the prior receipt.

| Path | Bytes | LF | Logical | Prior logical | SHA-256 |
|---|---:|---:|---:|---:|---|
| `marketing/marketing-ui/public/docs/wapi.js` | 39945 | 1092 | 1092 | 940 | 50785e1b687e9f454f8a1eebcdc46483be39afeab3aef1d2e0501bb46be9e6fa |
| `marketing/web10-social/public/wapi.js` | 39945 | 1092 | 1092 | 940 | 50785e1b687e9f454f8a1eebcdc46483be39afeab3aef1d2e0501bb46be9e6fa |
| `sdk/dist/browser.js` | 39945 | 1092 | 1092 | 940 | 50785e1b687e9f454f8a1eebcdc46483be39afeab3aef1d2e0501bb46be9e6fa |
| `sdk/dist/index.d.ts` | 1223 | 13 | 14 | 14 | 3fae4b692a337deebd79898736d8c1fdfdaba3185bcb5eb91bb0921cc5d833b6 |
| `sdk/dist/index.d.ts.map` | 855 | 0 | 1 | 1 | 281240dbe4dcbaff0b02f9264015aa45ad6898a259af4a7ee7a31ce80f139548 |
| `sdk/dist/index.js` | 30003 | 908 | 908 | 756 | a9194c02e0d372174fe05d61526021cd9e22f80daeaeae89b49d0624aab3800f |
| `sdk/dist/v3.d.ts` | 27546 | 760 | 761 | 695 | e66e91d3ccab898750fb252fc35b9a834df5b1b679673928b8d47bba2c47a1e6 |
| `sdk/dist/v3.d.ts.map` | 18610 | 0 | 1 | 1 | f2faa0de01d0d103bcaa5867b010feb2d2c11a21453fb1c38a90fa255cfaf906 |
| `sdk/dist/wapi.js` | 39945 | 1092 | 1092 | 940 | 50785e1b687e9f454f8a1eebcdc46483be39afeab3aef1d2e0501bb46be9e6fa |

Changed physical total: **238,017 bytes / 6,049 LF / 6,053 logical**, previously 5,227 logical: **+826**. Four browser members are equal: canonical browser.js plus **three copies** (wapi alias, social, marketing). Hash-mapping these yields **six unique changed streams / 118,182 bytes / 2,773 LF / 2,777 logical**. This is not three total browser files. Unique whole changed declarations: 775 logical; maps: two logical. Diff physical additions/deletions: **829/3**; unique additions/deletions: **373/3**. Fresh runtime semantic lines: **304**, two distinct compiled streams of 152 each, not four copies counted as independent reads.

### Exhaustive New Semantic Coverage

Both runtime diff blocks were read in full independently; they differ in indentation, not decisions. All changed declarations, comments and complete map strings were displayed/read; long map strings were wrapped for display without dropping segments. No declaration type is treated as runtime validation.

| Browser inclusive range | ESM inclusive range | Decisions read |
|---|---|---|
| 268-275 | 259-266 | lastClientId cache; unsigned current token decode; nullable client_id and truthy cache update |
| 276-290 | 267-281 | inherited-capable refresh-cookie lookup, string guard; SSR/no-token clearing; encodeURIComponent; HTTPS Secure, path, 60-day max-age, Lax |
| 291-299 | 282-290 | eager cookie read at construction; JSON POST; access-token install before refresh update; remembered client; nullable response refresh persistence |
| 300-324 | 291-315 | client ID trim/lowercase, required fields, encoded query/state, derived/overridden authenticator host/protocol; no-window/openPopup=false URL result |
| 325-351 | 316-342 | fixed-name popup/open failure, settled guard, interval cleanup, reject/resolve, echoed state |
| 352-383 | 343-374 | href try/cross-origin catch, empty href, closed delay, URL parsing, code accepted before error, state extraction, error mapping, 500ms poll, uncancelled timeout |
| 384-399 | 375-390 | exchange validation, cached/current client selection, no initial client ID retained from authorize, flat authorization_code JSON |
| 400-418 | 391-409 | secret/refresh/client validation, cached refresh vs cookie fallback, rotation request, getters/setters and cookie persistence |
| 443 | 434 | oauth attached to existing client; existing scrub/signOut do not clear new refresh/cache state |
| `index.d.ts` 1-14 | entire file | four new type re-exports plus all retained exports/module comments/map reference |
| `v3.d.ts` 1-761 | entire file | retained primitives/options/helpers/contracts/access/CRUD/groups/media/analytics/consent/ICE surface; OAuth options/results/token/client 241-305; `oauth` member 501; EOF/map reference |
| two maps line 1 | entire JSON each | version/file/sourceRoot/sources/names/mappings; no sourcesContent; sources index.ts/v3.ts; no external code embedded |

## Minimal Producer Correspondence

Local Bun reports **1.3.14**, revision **`1.3.14+0d9b296af`**, equal to pinned packageManager and historical producer requirement. Pinned package.json/tsconfig unchanged. In-memory `Bun.build` uses Git-backed onLoad for every SDK TS input, browser target, ESM index entry and IIFE browser entry. Byte-exact matches: **30,003-byte ESM** and **39,945-byte IIFE**. All four browser files equal that IIFE. No normalization, source substitutions or dist writes. The initial root-directory attempt failed equality because Bun's source-marker paths are cwd-relative; rerunning in SDK cwd with identical pinned inputs matched exactly. That failed attempt is not hidden or a security finding.

Exact producer input identity (raw SHA-256; counts are LF/logical, not new scan credit):

| Git input | LF/logical | SHA-256 |
|---|---:|---|
| `sdk/src/index.ts` | 67/67 | 694fb3fdac1a4090b7cde46f60e6b5afbfea2e88cfdbbbc4b25f604f65e5b0fa |
| `sdk/src/v3.ts` | 1938/1939 | 46352baef2c6a4cbb1fdd463994b3e410a837f3678278915d8e6ab60e9053405 |
| `sdk/src/browser.ts` | 314/315 | a0429a4c41983394e16269d5225b03a558e27bd2ca83ede3bd76b6490a865150 |
| `sdk/src/token.ts` | 98/98 | cb3b32728a3f89ed6ad8f08ad7aec4a6b311b8bec780fa58fc68a0c1748c3a29 |
| `sdk/src/http.ts` | 103/103 | 3c72034c995a167461d0b761c38057872ca24651e9a597cbaad5d3215dd7f859 |
| `sdk/src/types.ts` | 11/11 | 523a18616ab3ff3f8e457a2e842e5c0e8da71ec494ba4fbd939695a4b12b4341 |
| `sdk/package.json` | 58/58 | 2e5f67d4ecf9370140fb29732cc687abd29a496cef71e84eb24d072ccfaba697 |
| `sdk/tsconfig.json` | 22/22 | b254fdddbb008f70ab46bfa99b6867ab7488217391de78c5711b67a8e2b0c00a |
| `sdk/bun.lock` | 374/374 | 49a0483d22680304a8af53f649909aaaa4502a83d9122c421821b508c5b49167 |

Types are erased; type-only inputs and compiler configuration identify the source contract, not additional emitted runtime dependencies. RTC input/output is unchanged and not rebuilt here. Pinned changed source diff was read for correspondence, without claiming an exhaustive renewed source scan.

No local SDK TypeScript package is available (`require('./sdk/node_modules/typescript')` fails); no install attempted. Declaration/map regeneration was **not** performed. Complete text and structural/source-position map checks are separate evidence, not exact TypeScript compiler reproduction. Existing ART-01 mutable producer/container controls, six orphan declaration/maps and docs RTC producer debt are unchanged. Runtime byte correspondence does not attest producer binary, third-party code safety, registry publication, actual serving or cached/deployed versions.

## Findings And Handoffs

**O10-ART-01, MEDIUM conditional callback integrity, OPEN.** IIFE 352-377 / ESM 343-368 accepts any readable popup URL containing `code`, including wrong callback path and mismatched state, without comparing requested redirectUri or state. Two authorize calls also use the same named popup; both consume one observed result. VM probes establish wrong-path/wrong-state and concurrent acceptance, with a correct callback control. Browser SOP constrains readability: a real unrelated cross-origin URL is not assumed readable. Prerequisites are a readable same-origin navigation/query controlled or influenced outside the intended callback, or overlapping legitimate flows. No real code redemption, login CSRF, authenticated session swap or account takeover demonstrated. Caller-side state comparison is explicitly the app's responsibility in the KB; state echo alone is therefore not an independent server-auth bypass. The helper's advertised approved-result semantics and unbound callback destination/concurrency remain a local integrity concern requiring caller/real-window evidence and explicit API ownership before repair. Do not label this S-1 postMessage or close S-1 through it.

**O10-ART-C01, confirmed first-use correctness gap, not C+I exploit.** IIFE 385-398 / ESM 376-389 needs an already-delegated token to exchange the first code, but authorize(clientId) never remembers that clientId. Fresh client -> authorize URL -> exchangeCode throws locally before any fetch. This contradicts D92's initial connector workflow. Existing tests preseed a delegated token, so their exchange success is not first-connection evidence. Server-side restoration also cannot refresh with only a refresh token + secret: client ID must be recovered separately through an access token.

**O10-ART-02, conditional refresh lifecycle integrity, OPEN, no server revoke bypass established.** IIFE 291,400-417,425-442 / ESM 282,391-408,416-433 retains refresh token and lastClientId across signOut/scrubToken. After one fake successful refresh establishes the cache, signOut clears access state but getRefreshToken still returns the old account's refresh token and a later caller supplying clientSecret sends it again. A token switch to client B also keeps client A's cached ID because `lastClientId ?? currentClientId()` never rechecks B. VM fake-response controls prove old refresh material/request composition only. Real client-secret availability, session authority, revocation and server rotation/grants remain unverified. OAuth KB promises revocation through contracts, not automatic backend family invalidation on local signOut; do not invent that promise. Required follow-up: define local signout/account/provider/client ownership and persistence semantics, retain deliberate restoration, then test legitimate rotations and account switches. A global unnamespaced refresh cookie also permits multiple client/provider instances to select the same stored material; actual cross-provider disclosure needs real caller/configuration evidence.

**O10-ART-C02, inherited refresh selection, bounded regression candidate.** IIFE 277 / ESM 268 lacks the own-property check used by repaired readTokenCookie. Synthetic ambient `Object.prototype.refresh_token` is returned and sent to inert fetch when a synthetic delegated token and secret are supplied. Plain `__proto__` cookie input still cannot modify the dictionary prototype: repaired cookieDict remains safe. No attacker-controlled prototype source, global pollution or valid token demonstrated; do not count this as a new independently exploitable pollution vulnerability or reopen the repaired access-token bug. Apply its own-property lesson to this new selector in a separate repair if accepted.

Six-class review: access-control authority remains server-owned; unsigned client_id is request metadata, not a demonstrated signature bypass. No new eval/HTML/shell/SQL execution sink in added code; query encoding is data construction. Transport uses configured apiOrigin JSON body, no token/secret in authorize query, no new secret literal/log line. Browser-side clientSecret callers are an explicit confidential-client integration risk, not a proved shipped credential leak. D41/body-token/JS-cookie/Lax/60-day choices remain by design. Lifecycle issues above are distinct from intentional persistence. Cross-origin polling errors, closed-window detection after href read, uncancelled timeout and malformed-cookie constructor failures are availability/correctness debt, not additional C+I findings. Declarations' authorize prose confusingly says false rejects then resolves; return type/runtime resolve URL, a documentation defect. New paths do not repair inherited sender/consent, API freshness/single-use/schema or external-code/provenance findings.

## Runnable Offline Evidence

Run from repository root. Extract only this report's JavaScript block; no product code or artifact is written:

```sh
node --experimental-vm-modules -e 'const s=require("node:fs").readFileSync("knowledge-base/security/scans/2026-10/l1-o10-artifacts.md","utf8");eval(s.split("```javascript\n")[1].split("```")[0])'
```

```javascript
(async () => {
const a=require('node:assert/strict'),vm=require('node:vm');
const {execFileSync:g}=require('node:child_process'),{createHash}=require('node:crypto');
const pin='1332abc678344d24dc6f85227549dda2b0bef9a9',prior='f7aabdb26346752141f46f19c393dbadfd25ddd2';
const get=(p,r=pin)=>g('git',['show',r+':'+p],{encoding:'utf8'});
const changed=g('git',['diff','--name-only',prior,pin],{encoding:'utf8'}).trim().split('\n');
const artifacts=changed.filter(p=>p.startsWith('sdk/dist/')||p.endsWith('/wapi.js'));
const lf=s=>(s.match(/\n/g)||[]).length,lines=s=>lf(s)+Number(!!s&&!s.endsWith('\n'));
a.equal(changed.length,22);a.equal(artifacts.length,9);
a.equal(artifacts.reduce((n,p)=>n+lines(get(p)),0),6053);
a.equal(artifacts.reduce((n,p)=>n+Buffer.byteLength(get(p)),0),238017);
const copies=['sdk/dist/browser.js','sdk/dist/wapi.js','marketing/web10-social/public/wapi.js','marketing/marketing-ui/public/docs/wapi.js'];
for(const p of copies)a.equal(createHash('sha256').update(get(p)).digest('hex'),'50785e1b687e9f454f8a1eebcdc46483be39afeab3aef1d2e0501bb46be9e6fa');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let segments=0;
for(const p of artifacts.filter(p=>p.endsWith('.map'))){
 const m=JSON.parse(get(p));a.equal(m.version,3);a.equal(m.sourceRoot,'');a.equal(m.sourcesContent,undefined);a.equal(m.names.length,0);
 a.equal(m.file,p.split('/').at(-1).replace(/\.map$/,''));a.equal(m.sources.length,1);
 const source=get('sdk/'+m.sources[0].replace('../','')).split('\n');let si=0,sl=0,sc=0;
 for(const line of m.mappings.split(';')){let gc=0;for(const seg of line.split(',').filter(Boolean)){
  const vals=[];let v=0,shift=0;for(const ch of seg){const d=alphabet.indexOf(ch);a.ok(d>=0);v+=(d&31)*2**shift;if(d&32)shift+=5;else{vals.push((v&1)?-Math.floor(v/2):Math.floor(v/2));v=0;shift=0}}
  a.equal(shift,0);a.ok(vals.length===1||vals.length===4);gc+=vals[0];a.ok(gc>=0);
  if(vals.length===4){si+=vals[1];sl+=vals[2];sc+=vals[3];a.equal(si,0);a.ok(sl>=0&&sl<source.length);a.ok(sc>=0&&sc<=source[sl].length)}segments++;
 }}
}
console.log('inventory/copies/maps OK; segments='+segments);
const jwt=cid=>'x.'+Buffer.from(JSON.stringify({username:'synthetic',client_id:cid})).toString('base64')+'.x';
async function realm(p){
 const jar=new Map(),calls=[],intervals=new Map(),timeouts=[];let tick=0;
 const popup={closed:false,location:{href:'about:blank'}};
 const x={console:{log(){},error(){},warn(){}},URL,URLSearchParams,atob,location:{protocol:'https:'},
 document:{get cookie(){return [...jar].map(([k,v])=>k+'='+v).join('; ')},set cookie(s){const [pair,...attrs]=s.split(';'),i=pair.indexOf('=');const k=pair.slice(0,i);if(attrs.includes('max-age=-1'))jar.delete(k);else jar.set(k,pair.slice(i+1))}},
 window:{location:{hostname:'app.invalid'},open:()=>popup,addEventListener(){},removeEventListener(){}},
 setInterval:f=>{intervals.set(++tick,f);return tick},clearInterval:i=>intervals.delete(i),setTimeout:(f,ms)=>{timeouts.push([f,ms]);return timeouts.length},clearTimeout(){},
 fetch:async(u,i)=>{calls.push([u,JSON.parse(i.body)]);return{ok:true,json:async()=>({access_token:jwt('client-a'),refresh_token:'SYNTHETIC-ROTATED',token_type:'Bearer',expires_in:1})}}};
 const context=vm.createContext(x);let api;
 if(p.endsWith('index.js')){const m=new vm.SourceTextModule(get(p),{context});await m.link(()=>{throw Error('imports forbidden')});await m.evaluate();api=m.namespace}else{vm.runInContext(get(p),context);api=x.window.web10}
 return{api,x,context,calls,popup,jar,poll:()=>[...intervals.values()].forEach(f=>f()),intervals};
}
for(const p of ['sdk/dist/browser.js','sdk/dist/index.js']){
 const r=await realm(p),c=r.api.createV3Client({apiOrigin:'https://api.invalid'});
 const opts={clientId:'CLIENT-A',redirectUri:'https://app.invalid/callback',state:'EXPECTED'};
 const u=await c.oauth.authorize({...opts,openPopup:false});a.equal(new URL(u.url).searchParams.get('client_id'),'client-a');
 a.throws(()=>c.oauth.exchangeCode('SYNTHETIC-CODE',opts.redirectUri,{clientSecret:'SYNTHETIC-SECRET'}),/No delegated token/);a.equal(r.calls.length,0);
 const wrong=c.oauth.authorize(opts);r.popup.location.href='https://app.invalid/not-callback?code=SYNTHETIC-WRONG&state=WRONG';r.poll();
 const result=await wrong;a.equal(result.code,'SYNTHETIC-WRONG');a.equal(result.state,'WRONG');a.equal(r.intervals.size,0);
 const valid=c.oauth.authorize(opts);r.popup.location.href='https://app.invalid/callback?code=SYNTHETIC-VALID&state=EXPECTED';r.poll();a.equal((await valid).state,'EXPECTED');
 const p1=c.oauth.authorize(opts),p2=c.oauth.authorize({...opts,state:'OTHER'});r.poll();a.equal((await p1).code,(await p2).code);
 const denied=c.oauth.authorize(opts);r.popup.location.href='https://app.invalid/callback?error=access_denied';r.poll();await a.rejects(denied,/Consent denied/);
 const saved=r.x.window.open;r.x.window.open=()=>null;await a.rejects(c.oauth.authorize(opts),/Popup blocked/);r.x.window.open=saved;
 c.setToken(jwt('client-a'));c.oauth.setRefreshToken('SYNTHETIC-OLD');await c.oauth.refresh({clientSecret:'SYNTHETIC-SECRET'});
 a.equal(r.calls.at(-1)[1].client_id,'client-a');a.equal(c.oauth.getRefreshToken(),'SYNTHETIC-ROTATED');
 c.signOut();a.equal(c.state.token,null);a.equal(c.oauth.getRefreshToken(),'SYNTHETIC-ROTATED');await c.oauth.refresh({clientSecret:'SYNTHETIC-SECRET'});
 a.equal(r.calls.at(-1)[1].refresh_token,'SYNTHETIC-ROTATED');
 c.setToken(jwt('client-b'));await c.oauth.refresh({clientSecret:'SYNTHETIC-SECRET'});a.equal(r.calls.at(-1)[1].client_id,'client-a');
 c.oauth.setRefreshToken(null);a.equal(c.oauth.getRefreshToken(),null);
 vm.runInContext('Object.prototype.refresh_token="SYNTHETIC-INHERITED"',r.context);
 try{const d=r.api.createV3Client({token:jwt('client-a')});a.equal(d.oauth.getRefreshToken(),'SYNTHETIC-INHERITED');await d.oauth.refresh({clientSecret:'SYNTHETIC-SECRET'});a.equal(r.calls.at(-1)[1].refresh_token,'SYNTHETIC-INHERITED')}finally{vm.runInContext('delete Object.prototype.refresh_token',r.context)}
 r.jar.clear();r.jar.set('__proto__',encodeURIComponent('{"refresh_token":"SYNTHETIC-PROTO"}'));
 a.equal(r.api.createV3Client().oauth.getRefreshToken(),null);a.equal(vm.runInContext('({}).refresh_token',r.context),undefined);
 r.jar.clear();delete r.x.window;const server=r.api.createV3Client();a.ok((await server.oauth.authorize(opts)).url);server.oauth.setRefreshToken('SYNTHETIC-SERVER');a.throws(()=>server.oauth.refresh({clientSecret:'SYNTHETIC-SECRET'}),/No delegated token/);
 console.log(p+': first-use gap, callback mismatch/concurrency, valid/deny/blocked controls, refresh/logout/cache/inheritance/SSR controls OK');
}
console.log('offline assertions completed; actual network=0; synthetic cookies/windows/fetch only');
})().catch(e=>{console.error(e);process.exitCode=1});
```

Producer replay (Bun 1.3.14 required; no output files, package scripts, installers or network):

```sh
bun -e 'import {execFileSync as g} from "node:child_process";import path from "node:path";import a from "node:assert/strict";a.equal(Bun.version,"1.3.14");const pin="1332abc678344d24dc6f85227549dda2b0bef9a9";process.chdir("sdk");const get=p=>g("git",["show",pin+":"+p],{encoding:"utf8"});for(const [entry,format,out] of [["index","esm","index.js"],["browser","iife","browser.js"]]){const r=await Bun.build({entrypoints:["./src/"+entry+".ts"],target:"browser",format,write:false,plugins:[{name:"git-only",setup(b){b.onLoad({filter:/\/sdk\/src\/.*\.ts$/},args=>({contents:get("sdk/"+path.relative(process.cwd(),args.path)),loader:"ts"}))}}]});a.ok(r.success,JSON.stringify(r.logs));a.equal(r.outputs.length,1);a.ok(await r.outputs[0].text()===get("sdk/dist/"+out),out+" mismatch");console.log(out+" exact match")}'
```

## Execution Results

Executed the published VM block on 2026-10-27 with Node **v24.18.0**, exit 0. Exact inventory/copy controls passed; both complete changed maps parsed and **3,710 VLQ segments** decoded with source indices/positions in bounds. Both unique changed runtimes reproduced all stated callback/first-use/lifecycle/inheritance observations and passed legitimate callback, denial, blocked-popup, rotation, explicit clear, safe __proto__ cookie and no-window URL controls. Only the expected experimental VM Modules warning appeared. Fake timers do not model real scheduling/SOP, and fake cookie jars do not prove browser delivery. No denied-server exploit or real token was involved.

Both in-memory Bun producer comparisons succeeded at the revision above. The root-cwd comparison attempt failed as disclosed; the subsequent SDK-cwd comparison passed without any byte normalization. Whole-tree Git path counts independently confirmed 1,512 -> 1,518. Scoped Git numstat confirmed source +4/0 and +258/2. Final Git status retained the original dirty/untracked central work; this scratch file is ignored by Git, not silently staged. No product tests or TypeScript declaration compiler were run.

## Denominator And Design Intent

**Yes: O10 is the only selected-runtime drift from the prior pin. The selected path denominator stays 171, but its line denominator changes.** Its changed selection is exactly nine artifacts + two sources = 11 paths. Other 160 selected paths are unchanged by the exhaustive diff; six new research docs and the modified test/central docs remain outside that production selector. Full tracked paths increase 1,512 -> **1,518**, excluded paths 1,341 -> **1,347** under the same selection. Selected logical total **30,451 -> 31,537 (+1,086)**: artifacts +826 and source +260 (index.ts +4; v3.ts +256). SDK dist stays 24 paths, **3,869 -> 4,391** logical; non-test SDK source stays seven paths, **2,500 -> 2,760** logical. Prior 32-path SDK artifact/producer/token manifest becomes **7,224 logical / 7,203 LF**, unique byte streams remain 29, **3,948 logical / 3,927 LF**. These are accounting updates, not fresh full-file reads of 171 paths or source coverage for the new v3.ts body. O10 source delta still requires its own explicit source receipt before claiming restored selected full-read coverage.

DESIGN-INTENT REVIEW (self-authored bounded scan, not independent approval):

- Intended behavior: D92 adds optional generic confidential-connector authorize/exchange/refresh, preserving existing per-contract/group authorization. Initial connection must be usable without already possessing the delegated token it is meant to obtain; refresh rotation/persistence must remain explicit and provider/client-correct.
- Changed behavior: this report changes nothing. Shipped O10 gives browser and ESM consumers a new OAuth surface, eager refresh-cookie reads, callback polling and credential persistence. It is a real functional delta, not artifact formatting or producer-only drift.
- By-design conflict: no policy reversal proposed. Preserve D60 generic primitives, D41 readable node/PWA/no-default-E2E, D56 content-blind telemetry, JSON-body tokens and JS-readable cookies. Confidential-client integration must not be silently converted into a public-client/PKCE feature.
- Conventional deviation: body transport/cookies and confidential-client-only v1 are documented choices. Unbound callback acceptance and refresh ownership are not certified by those choices; caller-owned state comparison needs explicit ownership rather than a guessed server requirement.
- Tests cover delta: no product suite run or changed. Synthetic controls and exact runtime builds support only local claims; declaration regeneration, genuine first connection, callback SOP/concurrency, real refresh rotation/revocation/logout/account switching and deployed copies are untested.
- Untested intent risk: a later callback gate could reject legitimate redirect/query/state handling; refresh cleanup could break intended reconnection/persistence; client-ID repair could route a secret incorrectly. No new acceptance granted. Require focused exploit/negative/legitimate controls plus fresh independent review before repair. Central KB write-back intentionally not performed under the scratch-only instruction.

No external-code audit, dependency/binary provenance, actual credentials, live HTTP/browser/DB, protected records, durable grant, publication, rollout/cache state, independent model-diverse three-dry convergence, L2/L3/L4 or security PASS is claimed. Static map validation and byte equality are not external-code safety.
