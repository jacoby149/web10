# Current SDK Artifact L1 Receipt

Integration: fresh calibration in `l1-current-edge-review.md`; correspondence is not provenance or security PASS.

Date: 2026-10-27. Model: `openai/gpt-6.1-sol` (OpenCode; routed model ID `openrouter/openai/gpt-6.1-sol`). Pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2`, verified HEAD. Status: scoped line coverage complete; OPEN findings/provenance/sign-off. Not a protocol L1 gate closure or security PASS.

Only this report was written. No runtime/test/central documentation edits, builds, installs, services, network, credentials, commits or pushes. Existing unrelated worktree modifications were left intact. Scoped working files matched pinned blobs (`git diff <pin> -- <all 32 paths>` empty). Orientation documents were read as working-tree context; some central documents already had uncommitted updates, so their newer status prose is not treated as pinned runtime evidence.

## Orientation

Read root AGENTS, strategy directory/thesis, recent changelog, current plan/lane SDK/protocol entries, security learnings, I1-I6 overview, security method, six-class checklist, design-intent gate, SDK contracts, `.context/l1-sdk-contract.md`, `l1-sdk-index.md`, all A-F receipts, `sdk-artifact-correspondence.md`, and `repair-sdk-b01-cookie.md`.

Onboarding: A-F are historical source receipts at `caeed44278adb65d19f5c737ed9188ccf589b69c`, not artifact assurance. Browser alignment #1248 preceded cookie repair #1255, which is present at this HEAD. Working-tree receipt merge-status updates are corroborated here by actual pinned code, not assumed from prose. Recession: inspect the remaining message boundaries independently of cookie repair. Obvious gap: declared producers, source markers, dependency checksums and copy equality do not prove trustworthy production, deployment or dependency implementations. Orphan files can survive non-clean declaration emission.

The other six non-test sources (`browser.ts`, `http.ts`, `index.ts`, `types.ts`, `v3.ts`, `rtc/index.ts`) have an empty Git diff between historical pin and current pin. They retain historical A-F line coverage only; they were not re-counted as freshly scanned source. Changed `src/token.ts` was read completely, 1-98. All unique artifact text, comments, blanks and EOF were read; long one-line maps were displayed with `git show ... | fold -w 180`, without truncating their mappings. Identical browser copies are hash-mapped, not re-read.

## Exact Manifest

32 paths: four producer/configuration files + 24 dist artifacts + three public copies + one changed source. Physical totals: **6,398 logical lines / 6,377 newline bytes**. Deduplicating the four equal browser files leaves **29 unique byte streams / 3,578 logical lines / 3,557 newlines**. Runtime unique reads: IIFE 940 + core ESM 756 + RTC ESM 110 + docs RTC IIFE 85 = 1,891. Producer/configuration logical lines: 12 + 58 + 374 + 22 = 466. Changed source: 98.

Count correction: the pinned ten declarations have **1,113 logical lines**, and ten maps have **10**, totaling **1,123**, not the request's 1,224. All ten declarations lack a final newline; every map is one unterminated JSON line. Dockerfile is also unterminated. All runtime JS, lock, package, tsconfig and token source terminate with newline. No missing 101-line artifact was silently invented to match an expected denominator.

Paths below are relative to `sdk/dist/` unless prefixed otherwise. Every file was covered inclusively from line 1 to its logical count. SHA-256 is of the exact Git blob bytes, not normalized text.

| Path | Bytes | Newlines | Logical | SHA-256 |
|---|---:|---:|---:|---|
| auth.d.ts | 2914 | 83 | 84 | 2d0a40c4ec3fe47bb4082d9138872ce6da3874e9ff7a17b75dcb14c3433b0e18 |
| auth.d.ts.map | 1599 | 0 | 1 | c18707ea571cb3d4827a5d6c58fa43febc702e442b7c545cf935803730e42d5c |
| browser.d.ts | 1834 | 47 | 48 | 8c21fa32ba94ca9342dda6dd14ff3faea2bc5e56b722306f4aa5c7730928e53d |
| browser.d.ts.map | 756 | 0 | 1 | 769b9da01bd6d5c22a16825f607f3862b392916541ede9b549cc08609a2c323d |
| browser.js | 34104 | 940 | 940 | 5bb3bd1962be580e9c05a04abd9f07bf647c171eb049eb54de72410c12c6aa47 |
| client.d.ts | 3794 | 84 | 85 | 69586a2cd4863305db11fcb108d1220c1c4f7468019051d2c28ed452985bca6b |
| client.d.ts.map | 3290 | 0 | 1 | da348162856e3ce373812f5c6472d69fe7c59bfab69b83ab0a0fc5d744bf0630 |
| compat.d.ts | 662 | 15 | 16 | f729f19b9fa8d0af087f41d6e9f4cb83cee5e6651165af4b029a97ad8e8955e8 |
| compat.d.ts.map | 367 | 0 | 1 | 6fb7afd6f924283dcd3527e7de29ab30b2214530eed424e4f2ecb5ac352737c5 |
| http.d.ts | 1728 | 38 | 39 | 82c80528ba7db50326bb30c6f3badd837413d64aaa6377b227166a8f7890e64e |
| http.d.ts.map | 650 | 0 | 1 | 1786ed03bc26b281a3ecf619094eb039366af20adb10c780f3c830a126532e4c |
| index.d.ts | 1142 | 13 | 14 | d0b397c38ffce647794799780b01fd5e12ca867109f0f4cd607d32eb7724ccf3 |
| index.d.ts.map | 806 | 0 | 1 | bbcfab7683fd6d7c6e4b526a6b8a07dc748604e2f04c5b6263fbee2a8f596662 |
| index.js | 24466 | 756 | 756 | 776ca64765d9066de9d9bd50d5a3018e7b87c52faaf42b8d294cf810def42a83 |
| rtc/index.d.ts | 2462 | 79 | 80 | cef5f147d8cdf75c1b049c8a4279ccc4bd495b30a9a5b5f87f93d9f254a447e8 |
| rtc/index.d.ts.map | 1842 | 0 | 1 | 4c701ee1523d8849efe90e0c1ced7e3c4d123af68317ce5214442715ef414273 |
| rtc/index.js | 3304 | 110 | 110 | 248c57e2b91411024a1be876bc3fad983d750346ed17b6f0b23bc519e34a65f2 |
| token.d.ts | 1334 | 39 | 40 | 1509f08ac41cfc7009d7edfdf99734d3f66e36d924ac6924634d74ead991322d |
| token.d.ts.map | 578 | 0 | 1 | a6e1310541e7e57866b76f8b5a6bdea17911a93d7d2ef4258ce1d046e236e2fd |
| types.d.ts | 246 | 11 | 12 | e62f1b3cfe3b743708aeb115bf6beb777b1d308ce39222aa41f0f3072a120fc1 |
| types.d.ts.map | 308 | 0 | 1 | 1d630f41f1700da0f41cade5c232bbd4d8777bb437091e2644c869770227b287 |
| v3.d.ts | 24207 | 694 | 695 | d7408e1cde3cdb4ade1fd23fccbe3e2eba60b0358e37eb918c6fe9f76b6ff058 |
| v3.d.ts.map | 17517 | 0 | 1 | dcdb20366569cb0615cd41fb647de2c8b1fd275788babd3add4489d48362f548 |
| wapi.js | 34104 | 940 | 940 | 5bb3bd1962be580e9c05a04abd9f07bf647c171eb049eb54de72410c12c6aa47 |
| sdk/Dockerfile | 421 | 11 | 12 | b3619e599d0c71286ac9093e15fe5e815cd1ae5b28f836cb7a197bb92c32015a |
| sdk/package.json | 1795 | 58 | 58 | 2e5f67d4ecf9370140fb29732cc687abd29a496cef71e84eb24d072ccfaba697 |
| sdk/bun.lock | 41747 | 374 | 374 | 49a0483d22680304a8af53f649909aaaa4502a83d9122c421821b508c5b49167 |
| sdk/tsconfig.json | 572 | 22 | 22 | b254fdddbb008f70ab46bfa99b6867ab7488217391de78c5711b67a8e2b0c00a |
| sdk/src/token.ts | 2979 | 98 | 98 | cb3b32728a3f89ed6ad8f08ad7aec4a6b311b8bec780fa58fc68a0c1748c3a29 |
| marketing/web10-social/public/wapi.js | 34104 | 940 | 940 | 5bb3bd1962be580e9c05a04abd9f07bf647c171eb049eb54de72410c12c6aa47 |
| marketing/marketing-ui/public/docs/wapi.js | 34104 | 940 | 940 | 5bb3bd1962be580e9c05a04abd9f07bf647c171eb049eb54de72410c12c6aa47 |
| marketing/marketing-ui/public/docs/rtc.js | 2854 | 85 | 85 | f54c4db342a4aaf3b915dc3470054338cd675ff8a22dbe9aed9820ea5fead1e3 |

Equivalence class BROWSER: dist/browser.js, dist/wapi.js, social/public/wapi.js, marketing-ui/public/docs/wapi.js, four members with the hash above. All other scoped byte streams are distinct. There are four dist runtimes, ten declarations and ten declaration maps (24); adding public copies yields 27 artifact paths and 24 unique artifact streams. Dist logical total 3,869; public copies 1,965. Equality transfers the reviewed bytes and local weaknesses to each copy, not source reproducibility, security assurance, actual serving, cache state or publication evidence.

## Exhaustive Semantic Coverage

| Unit/ranges (inclusive) | Reviewed symbols and decisions |
|---|---|
| browser.js 1-45 | Bun property/export/cache helpers and entry export setup; no dynamic loading or hidden external code. |
| browser.js 46-114; index.js 1-69 | Web10Error, extractDetail, httpError, authPost/authGet: JSON/array/fallback errors, raw detail retention, fixed headers, body serialization, query coercion, status handling; fetch defaults unchanged. |
| browser.js 115-181; index.js 70-136; token.ts 1-98 | cookieDict split/first equals/URI/JSON/fallback/own data descriptors, own-token selection/falsy/coercion/SSR, set/scrub flags and lifetime, unsigned decode, custom expires handling; source comments are not server proof. |
| index.js 137-225; browser.js 182-234 | pickThumbnail (ESM only), diffGroupContract, mergeGroupRolesForReconcile, findDanglingGrants (ESM only): exact role/member/tag comparison, policy condition, additive reconciliation and shallow array aliasing. Browser tree shaking is not missing runtime code. |
| browser.js 235-331; index.js 226-322 | createV3Client/state/v3Post/pingAppRegister; configured destinations, state-first requests vs cookie-first UX, canonicalized registration URL, login/signup, access oracle, password/contact/recovery forwarding. |
| browser.js 332-464; index.js 323-455 | create/read/ref-count/event/analytics/views/by-id/query/directory/update/delete/app-contract methods: all payload fields, optional tokens, body token override, public reads, raw SQL as data, surface/content_service fields. |
| browser.js 465-632; index.js 456-623 | create/get/list/manages/update/reconcile/delete/heal/join/request/leave/member/invite/join-request/block/sharing methods: false/undefined distinctions, diff/write scheduling, tokenless byUserGroups, reserved principals and opaque IDs. |
| browser.js 633-689; index.js 624-680 | upload/read signing/confirm/list/delete/thumbnail, stats/ICE, apps/rating methods: generic forwarding, ICE presence check, optional list IDs, rating bounds; no local object permission gate certified. |
| browser.js 690-751; index.js 681-756 | base contractRequest, ready/response/timeout/cleanup, legacy contractOnReady, registration invocation, client return and ESM exports. |
| browser.js 752-801 | shared popup state, openAuthPortal URL/as/handoff/window naming/readiness and logs, authListen identity comparison/dedupe/cookie write/unsubscribe. |
| browser.js 802-891 | adapter contractRequest fast path/delegate/reuse, response listeners, readiness/timeout/send/exception branches; no request/sender binding. |
| browser.js 892-940 | checkExistingContracts app-origin/group lookup/unknown kinds, close command, aliases/global/default and IIFE EOF. |
| rtc/index.js 1-21 | PeerClass/default STUN/setPeer/getPeer configuration/error. |
| rtc/index.js 22-76 | createRTC Maps/callback, peerId, async init token metadata, explicit/fetched/fallback ICE, constructor credential/host/TLS, inbound data/close, immediate/open/timeout resolution. |
| rtc/index.js 77-110 | connect cache/reply forwarding/close deletion, immediate/deferred send, return/exports/EOF. |
| docs/rtc.js 1-85 | every wrapper/helper/connector branch: older synchronous setup, no ICE selection/default export, no outbound data handler; inbound and send/cache/timeout logic, window.web10rtc attachment and non-executable wrapper-build comment. |
| browser/index/http/token/types declarations, whole files | all imports/exports, aliases, error/transport signatures, unsigned metadata and cookie docs, TokenPayload fields; erased types are not validation. cookieDict's string-only type understates its JSON values, inherited historical contract, not a new exploit. |
| v3.d.ts 1-226 | examples/imports/options/ICE/ad/sort/event/document/group/media/thumbnail/member/spec/diff/merge/dangling declarations, additive intent and purity comments. |
| v3.d.ts 227-395 | invite/request/service/query/prepare/feed/role/contract/user/directory/membership/oracle types and client factory. All authority claims remain server-owned. |
| v3.d.ts 396-695 | entire V3Client method surface, payload/return shapes, duplicate contractOnReady, thumbnail/ICE promises, source-map reference and unterminated EOF. |
| rtc/index.d.ts 1-80 | optional import/example, ICE/setPeer/factory, connector, PeerJS options/connection/instance declarations and map reference. Old createClient example is stale, not an available root export. |
| auth/client/compat declarations, whole files | obsolete auth/billing/media/CRUD helpers and examples, missing imported legacy types, claimed legacy root/subpath APIs; declaration text does not supply corresponding JS. |
| ten *.d.ts.map, each line 1 in full | version/file/sourceRoot/sources/names/mappings; relative paths, empty names and no embedded sourcesContent; VLQ structure/source indices/positions checked below. Three absent sources, not hidden implementations. |
| Dockerfile 1-12 | floating builder/runtime tags, install, copy/build stages, listing and whole-SDK web-root copy. No secret literal. Exposure of already-public source is not itself a protected-data leak. |
| package.json 1-58 | metadata/version/files/exports, Bun 1.3.14 declaration, all scripts, dev dependencies, optional PeerJS peer and repository/license. No docs RTC or orphan producer. |
| tsconfig.json 1-22; bun.lock 1-374 | all compiler/output/include/exclude settings and every dependency declaration/version/integrity/platform/bin/peer/optional edge, including nested resolutions. Checksums are not a dependency-code audit. |

## Six Classes And Disposition

1. Access control: **S-1 OPEN**, browser.js 782-800 accepts a synthetic unrelated-origin/source auth token into the cookie. **L1-SDK-A-01 / L1-SDK-F-01 OPEN**, one consent-response class across adapter 829-838, base 702-708 and legacy 737-741; ESM 693-699/728-732. Concurrent requests consume the same forged result. Local callbacks/cookie writes are not authenticated API access or server grants. Issuer/expiry/storage enforcement is delegated, not proven by these clients.
2. Injection: **L1-SDK-B-01 repaired locally at HEAD**: token.ts 23-24/33-35, ESM 86/91-94, IIFE 131/136-139. Synthetic __proto__ is an own data property; ambient inherited token is ignored. This is not global prototype pollution and does not prove actual cookie delivery. No eval/HTML/shell/filesystem/SQL execution sink in artifact runtime; query SQL/media URLs remain opaque data. Caller-controlled cookie attribute interpolation, raw error consumers and thumbnail rendering require L2+ evidence before a new finding.
3. Boundaries/transport: **S-6 OPEN**, browser.js 745/852/920 and ESM 736 target wildcard with contract/close metadata, not outgoing bearer credentials. Base send pins authOrigin but inbound readiness does not validate sender; resulting send remains to retained popup, not rogue event.source. Body-token transport and local HTTP development remain intentional. Generic GET can encode caller-supplied credentials; actual credential-bearing callers remain existing S7/L2 work. PeerJS wire serialization/admission is not reviewed by inspecting constructor arguments.
4. Availability: malformed unrelated URI cookies throw; map/callback growth, timeout success without peer.open, missing close/error paths and sent-without-response listener lifetime remain reliability debt, outside C+I findings. No stress/fuzz/network DoS testing done.
5. Data lifecycle: cookie lifetime/flags/scrub, state precedence, popup replacement/concurrency/cleanup, reconciliation aliasing, RTC callback/maps/token timing all read. **S-3** stays functional (tokenless byUserGroups), **D-C1** shared permission-array mutation and **E-C1** cookie/state disagreement remain local correctness/handoffs, not proven cross-account requests or unintended grants. RTC **C-U1/BP-3**, **C-U2/S6**, **C-U3** remain identity/admission/teardown/consumer handoffs; docs RTC adds stale-functional behavior, not a new proven impersonation exploit.
6. Hygiene/supply chain: no embedded real credential found in scoped text. Browser logging contains URL/contracts/results/identity metadata, with no demonstrated protected-value source. **L1-SDK-ART-01 OPEN (static producer hygiene)**: Dockerfile 2/5/9 uses mutable image tags and non-frozen install; packageManager metadata does not establish that container Bun is 1.3.14. This is repeatability/control debt, not a demonstrated poisoned build or credential leak. **L1-SDK-ART-02 OPEN (provenance)**: six auth/client/compat declaration/map files have no current source producer, ship under files=dist, and name missing legacy types/exports. **L1-SDK-ART-03 OPEN (provenance/correctness)**: docs RTC has no matching declared IIFE producer and lacks current ICE/outbound forwarding. ART-02/03 label existing provenance debt, not independent newly demonstrated C+I exploits. Historical clean-build/cookie receipts are useful prior evidence, not replayed builds in this scan.

## Runnable Offline Evidence

Run from repository root with Node 24.18.0:

```sh
node --experimental-vm-modules -e 'const s=require("node:fs").readFileSync("knowledge-base/security/scans/2026-10/l1-current-sdk-artifacts.md","utf8");eval(s.split("```javascript\n")[1].split("```")[0])'
```

```javascript
(async () => {
const a=require('node:assert/strict'),vm=require('node:vm');
const {execFileSync:g}=require('node:child_process');
const {createHash}=require('node:crypto'),{stripTypeScriptTypes}=require('node:module');
const pin='f7aabdb26346752141f46f19c393dbadfd25ddd2';
const get=p=>g('git',['show',pin+':'+p],{encoding:'utf8'});
const dist=g('git',['ls-tree','-r','--name-only',pin,'sdk/dist'],{encoding:'utf8'}).trim().split('\n');
const copies=['sdk/dist/browser.js','sdk/dist/wapi.js','marketing/web10-social/public/wapi.js','marketing/marketing-ui/public/docs/wapi.js'];
const paths=[...dist,'sdk/Dockerfile','sdk/package.json','sdk/bun.lock','sdk/tsconfig.json','sdk/src/token.ts',...copies.slice(2),'marketing/marketing-ui/public/docs/rtc.js'];
const logical=s=>(s.match(/\n/g)||[]).length+Number(!!s&&!s.endsWith('\n'));
a.equal(dist.length,24);a.equal(paths.length,32);
a.equal(paths.reduce((n,p)=>n+logical(get(p)),0),6398);
a.equal(dist.filter(p=>p.endsWith('.d.ts')).reduce((n,p)=>n+logical(get(p)),0),1113);
const hashes=copies.map(p=>createHash('sha256').update(get(p)).digest('hex'));
a.equal(new Set(hashes).size,1);a.equal(hashes[0],'5bb3bd1962be580e9c05a04abd9f07bf647c171eb049eb54de72410c12c6aa47');
const tracked=new Set(g('git',['ls-tree','-r','--name-only',pin],{encoding:'utf8'}).trim().split('\n'));
const posix=require('node:path').posix,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let absent=[],segments=0;
for(const p of dist.filter(p=>p.endsWith('.map'))){
 const m=JSON.parse(get(p));a.equal(m.version,3);a.equal(m.sourceRoot,'');a.deepEqual(m.names,[]);a.equal(m.sourcesContent,undefined);
 a.equal(m.file,posix.basename(p).replace(/\.map$/,''));let si=0,sl=0,sc=0;
 const sources=m.sources.map(s=>posix.normalize(posix.join(posix.dirname(p),s)));
 for(const s of sources)if(!tracked.has(s))absent.push(s);
 for(const line of m.mappings.split(';')){let gc=0;for(const seg of line.split(',').filter(Boolean)){
  const vals=[];let v=0,shift=0;
  for(const ch of seg){const d=alphabet.indexOf(ch);a.ok(d>=0);v+=(d&31)*2**shift;if(d&32){shift+=5}else{vals.push((v&1)?-Math.floor(v/2):Math.floor(v/2));v=0;shift=0}}
  a.equal(shift,0);a.ok(vals.length===1||vals.length===4);gc+=vals[0];a.ok(gc>=0);
  if(vals.length===4){si+=vals[1];sl+=vals[2];sc+=vals[3];a.ok(si>=0&&si<sources.length&&sl>=0&&sc>=0);if(tracked.has(sources[si])){const ls=get(sources[si]).split('\n');a.ok(sl<ls.length);a.ok(sc<=ls[sl].length)}}segments++;
 }}
}
a.deepEqual(absent.sort(),['sdk/src/auth.ts','sdk/src/client.ts','sdk/src/compat.ts']);
console.log('inventory/copy equality/maps OK; decoded segments='+segments+'; absent sources='+absent.join(','));
const quiet={log(){},warn(){},error(){}};
function realm(){const listeners=new Set(),posts=[],calls=[];let cookie='';const popup={closed:false,postMessage:(...x)=>posts.push(x)};
 const x={console:quiet,atob,URLSearchParams,setTimeout:()=>1,clearTimeout(){},location:{protocol:'https:'},document:{get cookie(){return cookie},set cookie(v){cookie=v}},window:{location:{href:'https://app.invalid/view',hostname:'app.invalid'},open:()=>popup,opener:popup,addEventListener:(_,f)=>listeners.add(f),removeEventListener:(_,f)=>listeners.delete(f)},fetch:async(u,i)=>{calls.push([u,i]);return{ok:true,json:async()=>({})}}};
 const context=vm.createContext(x);return{context,x,posts,calls,popup,setCookie:v=>cookie=v,getCookie:()=>cookie,emit:data=>[...listeners].forEach(f=>f({origin:'https://rogue.invalid',source:{},data}))};}
function cookies(r,w){r.setCookie('__proto__='+encodeURIComponent('{"token":"SYNTHETIC-INHERITED"}'));a.equal(w.readTokenCookie(),null);a.equal(Object.hasOwn(w.cookieDict(),'__proto__'),true);a.equal(vm.runInContext('({}).token',r.context),undefined);
 r.setCookie('');vm.runInContext('Object.prototype.token="SYNTHETIC-AMBIENT"',r.context);try{a.equal(w.readTokenCookie(),null)}finally{vm.runInContext('delete Object.prototype.token',r.context)}
 r.setCookie('token='+encodeURIComponent('"SYNTHETIC-OWN"'));a.equal(w.readTokenCookie(),'SYNTHETIC-OWN');r.setCookie('unrelated=%');a.throws(()=>w.readTokenCookie());r.setCookie('');}
for(const p of copies){const r=realm();vm.runInContext(get(p),r.context);const w=r.x.window.web10;cookies(r,w);
 let signed=0;w.authListen(()=>signed++);r.emit({type:'auth',token:'SYNTHETIC-NOT-A-JWT'});a.equal(signed,1);a.ok(r.getCookie().startsWith('token=SYNTHETIC-NOT-A-JWT;'));
 r.setCookie('');w.openAuthPortal('https://auth.invalid');const c=w.createV3Client();let approved=0;
 for(let i=0;i<2;i++)c.contractRequest([],'https://auth.invalid',v=>{if(v.status==='approved')approved++});
 r.emit({type:'auth_ready'});a.equal(r.posts.at(-1)[1],'*');r.emit({type:'contract_response',status:'approved'});a.equal(approved,2);w.closeAuthPopup();a.equal(r.posts.at(-1)[1],'*');
 c.contractOnReady([],()=>approved++);a.equal(r.posts.at(-1)[1],'*');r.emit({type:'contract_response',status:'approved'});a.equal(approved,3);
 console.log(p+': cookie attacks denied; S-1/A-01/F-01/S-6 reproduced');}
const r=realm(),m=new vm.SourceTextModule(get('sdk/dist/index.js'),{context:r.context});await m.link(()=>{throw Error('imports forbidden')});await m.evaluate();cookies(r,m.namespace);
const c=m.namespace.createV3Client({token:'SYNTHETIC-STATE'});let answers=0;c.contractRequest([],'https://auth.invalid',()=>answers++);r.emit({type:'auth_ready'});a.equal(r.posts.at(-1)[1],'https://auth.invalid');r.emit({type:'contract_response',status:'approved'});a.equal(answers,1);
c.contractOnReady([],()=>answers++);a.equal(r.posts.at(-1)[1],'*');r.emit({type:'contract_response',status:'approved'});a.equal(answers,2);
await c.byUserGroups('synthetic');a.equal(r.calls.at(-1)[1].method,'GET');a.equal(new URL(r.calls.at(-1)[0]).searchParams.has('token'),false);
const roles=[{name:'reader',permissions:{notes:['readAll']}}],spec={roles:[{name:'reader',permissions:{notes:['readAll','create']}}]};m.namespace.mergeGroupRolesForReconcile(roles,spec.roles,m.namespace.diffGroupContract(spec,{roles}));a.equal(roles[0].permissions.notes.includes('create'),true);
const token=u=>'x.'+Buffer.from(JSON.stringify({username:u})).toString('base64')+'.x';r.setCookie('token='+token('cookie-user'));a.equal(c.readToken().username,'cookie-user');await c.getProfile();a.equal(JSON.parse(r.calls.at(-1)[1].body).token,'SYNTHETIC-STATE');
console.log('ESM: cookie denial/base+legacy response acceptance/fixed+wildcard targets/S-3/shared-array/state-cookie controls OK');
const s=realm(),sm=new vm.SourceTextModule(stripTypeScriptTypes(get('sdk/src/token.ts')),{context:s.context});await sm.link(()=>{throw Error('imports forbidden')});await sm.evaluate();cookies(s,sm.namespace);console.log('current token.ts cookie controls OK');
for(const p of ['sdk/dist/rtc/index.js','marketing/marketing-ui/public/docs/rtc.js']){const q=realm();let rtc;if(p.endsWith('docs/rtc.js')){vm.runInContext(get(p),q.context);rtc=q.x.window.web10rtc}else{const mm=new vm.SourceTextModule(get(p),{context:q.context});await mm.link(()=>{throw Error('imports forbidden')});await mm.evaluate();rtc=mm.namespace}
 const peers=[];class E{h={};on(e,f){(this.h[e]??=[]).push(f)}emit(e,v){for(const f of this.h[e]??[])f(v)}}class P extends E{open=true;constructor(id,opts){super();this.id=id;this.opts=opts;peers.push(this)}connect(id){const x=new E();x.peer=id;x.open=true;x.send=()=>{};return x}}
 rtc.setPeer(P);let seen=0;const w={state:{token:'SYNTHETIC-RTC',rtcServer:'rtc.invalid',iceServers:[{urls:'stun:example.invalid'}]},readToken:()=>({provider:'node.invalid',username:'alice',site:'app.invalid'}),getIceServers:async()=>{throw Error('unexpected helper')}};const con=rtc.createRTC(w);await con.initP2P(()=>seen++);const out=con.connect('node.invalid','bob','app.invalid');out.emit('data',{text:'inert'});const current=p.startsWith('sdk/');a.equal(seen,current?1:0);a.equal(!!peers[0].opts.iceServers,current);a.equal(peers[0].opts.token,'SYNTHETIC-RTC~');a.equal('destroy' in con,false);console.log(p+': captured ICE='+current+', outbound callback='+seen+'; fake PeerJS only');}
console.log('All offline assertions completed; real network=0; no server authority or browser delivery demonstrated');
})().catch(e=>{console.error(e);process.exitCode=1});
```

## Execution Results

Published command executed on 2026-10-27 with Node `v24.18.0`, exit 0. Inventory/equality checks passed; all ten maps parsed and **5,121 VLQ segments** decoded, current-source positions in bounds, exactly three absent source paths identified. Cookie prototype/inherited-token attacks were denied on source, core ESM and all four browser copies; own-token and malformed-URI controls passed. Each browser copy reproduced S-1, concurrent adapter response acceptance, legacy response acceptance and wildcard metadata targeting. Core ESM reproduced base/legacy response acceptance, configured-origin send, wildcard legacy send, tokenless GET, permission-array aliasing and state/cookie disagreement. RTC ESM captured explicit ICE and delivered one outbound reply; docs RTC captured no ICE and delivered zero outbound replies. Only expected VM-module/type-stripping experimental warnings appeared. No failed assertions, product tests, real network calls or server authority demonstrated.

## Design Intent And Limits

Intended behavior: generic browser/ESM CRUD/query/contracts and optional bidirectional RTC, preserving creator data ownership, public grants, automatic return-run consent and gesture-driven group setup. D41 readable-node/PWA/no-default-E2E, D56 content-blind telemetry, deliberate JSON-body tokens, unsigned UX metadata and JS-readable cookies/accepted lifetime are not vulnerabilities. The security overview's configured-authOrigin acceptance claim is contradicted by S-1; no client-only signature gate is invented as a substitute for fixing sender binding.

Behavioral delta: report only; no actor flow altered. By-design conflict: none. Conventional deviations: existing body-token/no-HttpOnly/node-readable choices retained, not new exceptions. Tests cover the delta: no product tests changed/run, only the published offline evidence. Untested intent risk: actual popup first-login/refresh/dedupe, concurrent legitimate consent, cookies in supported browsers/PWA, ICE/TURN/signaling, logout/revocation, anonymous grants, analytics, deployment/cache/publication and external consumers remain unverified. No new risk acceptance or fresh independent design-intent approval is manufactured by this self-authored receipt.

No build was performed, so historical correspondence results are explicitly not independently regenerated here. Map structural/source-position validation is not compiler reproduction or attestation; absent-source maps cannot be source-validated. No dependency implementation/CVE scan, actual image resolution, registry/package publication, credential validity, live browser, remote server, protected record, durable grant, real RTC handshake, logging exposure or rollout was tested. Offline fake peers/windows/fetch/cookies establish local behavior only. No model-diverse review, three-dry convergence, L2/L3/L4 coverage or security PASS. ART-02/03 stay OPEN absent producer/consumer proof; ART-01 needs deliberate reproducible container controls and evidence, not a claim that an image was compromised.
