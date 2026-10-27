# O10 SDK Source L1 Rescan

Integration: `l1-o10-review.md` governs calibration. Callback/refresh concerns are conditional; caller-managed state and deliberate restoration are not policy violations by themselves. No new independently demonstrated server C+I exploit.

- Date: 2026-10-27. Scanner/model: `openai/gpt-6.1-sol` (OpenCode).
- NEW pin: `1332abc678344d24dc6f85227549dda2b0bef9a9`, resolved from `1332abc67` and observed `origin/dev`; literal `at1332abc67` is not a revision. Comparison: `f7aabdb26346752141f46f19c393dbadfd25ddd2`.
- Status: whole-file read complete, OPEN findings; NOT security PASS, repair, deployment assurance, independent/model-diverse three-dry review, or L2 advancement.
- Only this receipt written. Existing dirty tracked/untracked work preserved; no runtime/test/generated/central edits, installs, commit, push or live network. Tests below are diff evidence, not added tests or an executed product test suite.

## Orientation And Manifest

Read AGENTS top-to-bottom, strategy directory, thesis, D92, plan/parallel OAuth and security queues, changelog top, security method/checklist/design-intent gate, learnings, I1-I6 overview, OAuth KB, SDK scan contract and prior F receipt. Working KB is orientation, including concurrent dirty updates, not immutable evidence about the new pin. Queues still mark O10 open; source at the exact pin nevertheless contains it. This is the requested rescan, not implementation or queue repair.

Onboarding: preserve S-1, joint A-01/F-01, S-6 and known issuer/expiry/store debt. Recession: no closure inferred from O10 or cookie repair. Obvious gap: a readable popup URL is not proof of the intended callback/transaction; refresh credentials add logout and multi-client lifecycle boundaries. New client-ID decoding selects request metadata, not server authorization; no unsigned-authorization bypass inferred.

| File | Prior logical/newlines | New logical/newlines | NEW SHA-256 |
|---|---:|---:|---|
| `sdk/src/v3.ts` | 1683/1682 | 1939/1938 | `46352baef2c6a4cbb1fdd463994b3e410a837f3678278915d8e6ab60e9053405` |
| `sdk/src/index.ts` | 63/63 | 67/67 | `694fb3fdac1a4090b7cde46f60e6b5afbfea2e88cfdbbbc4b25f604f65e5b0fa` |

Total **2 files, 2,006 logical lines / 2,005 newlines**, +260 logical lines from prior 1,746. v3 has unterminated EOF; index has terminal newline. Complete NEW bodies read using `git show PIN:path`: numbered v3 windows 1-500, 501-1000, 1001-1500, 1501-1939; index 1-67 in one full window. No range omitted, including comments/blanks/types/EOF. Prior hashes: v3 `6f6d45f3bc331f76aeebb90cae94be4bd1f82c69ffc71fe35aff7117d4e2fa07`; index `71bb5789db0421caaeb3cbc73a0419c89b01d0565fb5e529d90c63d0d8715ba6`. Prior is comparison, not an independently reread full-body scan. Diff: v3 258 additions/2 deletions; index 4 additions; test evidence `sdk/src/v3.test.ts` +278 lines. Dist/copied artifacts, other source/helpers/callers/backend and full tests excluded from new coverage.

## Every-Line Accounting

All ranges inclusive and contiguous within each file; all six classes applied throughout. Types/comments express intent, not runtime security guarantees.

| File/range | Complete symbols and review |
|---|---|
| v3 1-177 | Module examples/imports; V3ClientOptions/State/Body; ad, sort, event, document, group, resolved-media and thumbnail types; configurable destinations and credential fields. |
| v3 178-294 | pickThumbnail full body; group-reconciliation intent/spec/diff types; URLs returned as data, no DOM sink. |
| v3 295-422 | diffGroupContract, mergeGroupRolesForReconcile, findDanglingGrants full bodies; invite/join/service-contract types. Shared permission-array mutation remains correctness debt, not demonstrated server grants. |
| v3 423-500 | OAuth authorize/code/token/client types and query result; confidential-secret requirement, optional state and refresh persistence contract. |
| v3 501-704 | PrepareFace/Prepare/feed/role/member/app/group CR, user/login/directory/membership/access-health types and factory documentation. |
| v3 705-754 | createV3Client initialization, v3Post presence/body-token path, pingAppRegister URL normalization/token-bearing best-effort fetch. |
| v3 755-806 | lastClientId/currentClientId, refresh cookie read/write, oauthState, oauthTokenRequest; unsigned metadata, credential retention/installation, no response schema validation. |
| v3 807-893 | authorize complete URL/SSR/opt-out/popup body; cleanup/fail/succeed/poll callbacks; no callback/state comparison; cross-origin exceptions and timers. |
| v3 894-932 | exchangeCode, refresh, getRefreshToken, setRefreshToken full bodies; last-ID preference, presence guards, fixed token endpoint and payload. |
| v3 933-1032 | client state getter, setToken/scrubToken/readToken/isSignedIn/signOut, oauth installation; login/signup/profile/verifyAccess/password/phone/email/code/recovery methods. |
| v3 1033-1187 | create/read/readRefCounts, trackContentEvent/contentAnalytics/contentViews/readById complete bodies; optional anonymous credentials, explicit fields; API authorization delegated. |
| v3 1188-1342 | query complete docs/body, listPeopleDirectory, update/delete and add/list/revokeAppContract; SQL forwarded as data, compiler/gates not certified. |
| v3 1343-1458 | create/get/list/manages/update groups; reconcileGroupContract full body including parallel reads, full merged writes and sequential member additions. |
| v3 1459-1558 | delete/heal/join/requestJoin/leave/members/byUserGroups/add/remove/invite/accept/decline methods; S-3 token omission retained as functional debt. |
| v3 1559-1663 | join-request decisions, user/group block/unblock, sharing; upload/read-url/confirm/list/delete/thumbnail media wrappers; ownership/signing delegated. |
| v3 1664-1707 | stats, getIceServers, register/get/rate/ratings app methods; presence/rating checks, fixed endpoints, configurable node. |
| v3 1708-1809 | contractRequest complete response/ready/timeout/error handling; contractOnReady complete opener/response path; factory ping/return/close. F-01 and S-6 remain. |
| v3 1810-1939 | Entire V3Client interface: state/token/auth/OAuth/CRUD/query/app-contract/consent/group/reconcile/invite/request/block/sharing/media/stats/ICE/app-store declarations, duplicate contractOnReady and EOF. |
| index 1-11 | Module doc and runtime factory/thumbnail/reconciliation/dangling-grant exports. |
| index 12-51 | Entire type-export list, including all four new OAuth types. No runtime gate. |
| index 52-67 | Token utility runtime exports, HTTP error/detail exports, shared TokenPayload type and EOF. Re-exported helpers not newly certified. |

## Six Classes

| Class | Disposition |
|---|---|
| 1 Access control | OAuth callback-result integrity weakness below; server signatures/expiry/client secret/contracts/I3 delegated. No local server bypass demonstrated. Existing S-1 outside owned source retained, not closed. |
| 2 Injection | No eval/shell/filesystem/HTML execution sink. URLSearchParams encodes authorization values. Caller SQL, URLs, keys and objects forwarded; downstream injection/sanitization remains unverified. |
| 3 Boundaries/transport | O10-01 plus existing F-01/S-6. Code-in-callback query is intentional OAuth, not an account token URL leak. Client secret/access/refresh values use body/helper/cookie paths; configured insecure origins need deployment context. |
| 4 Availability | Timer not cleared on settlement; closed/cross-origin popup may wait to timeout, named-window reuse and concurrent refresh ordering need integration. Reliability track, not new C+I findings. |
| 5 Lifecycle | O10-02 retention; bootstrap/client-ID functional debt and inherited refresh-selection candidate below. Server atomic consumption/rotation not assessed. |
| 6 Hygiene | No hardcoded live credential or token logging in owned source. JS-readable cookies/body tokens/60-day cap intentional; no HttpOnly finding. New refresh reader lacks own-property guard; conditional candidate, not re-opening repaired token parser. |

## Current Findings And Historical Disposition

- **L1-O10-01 OPEN, moderate local integrity, high confidence** (`v3.ts:839-891`): authorize accepts any readable popup href containing code, including wrong path and mismatched/missing state; no comparison with redirectUri/options.state. Probe P2 resolves synthetic forged code/wrong state, P3 legitimate control succeeds. Requires pending popup and ability to navigate it to an attacker-influenced readable same-origin page (or equivalent compromised flow); fake Window does not prove real cross-origin readability. No code redemption, login CSRF/account substitution, valid tokens or server grant demonstrated. Distinct from message-based F-01 and S-1. Optional caller-managed state is documented; SDK callers can compare returned state, but built-in completion does not do so. Repair must preserve callback semantics and caller-managed SSR mode, not invent scope or client-side JWT authorization.
- **L1-O10-02 OPEN lifecycle concern, conditional security impact, high confidence in retention** (`v3.ts:766-804,909-930,948-965`): signOut/scrubToken erase access only; stored refresh token and remembered client ID survive. After a primed refresh, P4 signs out then successfully reaches inert refresh transport and reinstalls synthetic access. Requires same client instance and separately supplied clientSecret; actual reauthentication depends on server acceptance. This is not proof a refresh token alone bypasses client authentication, revocation, or user consent. Whether signOut should terminate delegated refresh is an explicit product decision/repair obligation, not a claimed violation of a documented server revocation promise.
- **L1-O10-C01 correctness, confirmed, not security finding** (`809-818,895-906`): first authorize never saves clientId; fresh exchangeCode requires an already delegated access token and fails before transport. P1 proves this circular prerequisite. Added tests prime delegated tokens and explicitly expect fresh exchange failure, leaving intended first-time connector flow untested rather than validating it.
- **L1-O10-C02 UNVERIFIED lifecycle candidate** (`767-780,898,913`): inherited `refresh_token` selected from a non-own prototype (P6). cookieDict deliberately stubbed; no browser cookie planting or actual repaired parser bypass proved. Ambient Object.prototype pollution would be an additional precondition. Cached lastClientId also outranks subsequently changed tokens; multi-client routing/cookie-slot collision remains integration/correctness debt, not demonstrated cross-client access.
- **Existing L1-SDK-A-01 / F-01 OPEN**, one shared consent-response class, current v3 locations `1742-1748,1787-1794`: P7 unrelated origin/source invokes approved callback. No valid credential/server approval. **S-6 OPEN**, `1796-1799`: wildcard metadata target reproduced; not demonstrated token disclosure. **S-1 OPEN** remains historical/out-of-owned-file browser authListen evidence; not independently rerun here or presumed repaired. **S-3** remains functional. **S-2/B-4** body/log composition and source logging repair do not certify other sinks/history. **L1-SDK-B-01** parser repair remains merged per KB; new unchecked refresh selection is not proof it regressed. S-4/S-5 deliberate UX decode/JS cookies/lifetime retained.

## Runnable Minimal Evidence

Executed from repo root with Node (type-stripping experimental warning only), exit 0. Loads complete pinned implementation into VM, strips imports/types, and mocks only dependency boundaries. No filesystem output, network/service, real credentials, product test runner or backend. Fixed .invalid URLs; fetch throws if reached. Synthetic JWT is metadata only. This is the executed seven-group probe, with manifest printing omitted for brevity.

```sh
node <<'NODE'
const {execFileSync}=require('node:child_process'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module'),a=require('node:assert/strict');
const pin='1332abc678344d24dc6f85227549dda2b0bef9a9';
let cookie={},intervals=[],posts=[],listeners=new Set(),writes=[];
const popup={closed:false,location:{href:'about:blank'},postMessage:(...v)=>writes.push(v)};
const jwt=id=>'h.'+Buffer.from(JSON.stringify({client_id:id,username:'synthetic'})).toString('base64')+'.s';
class Web10Error extends Error{constructor(m,status){super(m);this.status=status}}
const x={URL,URLSearchParams,Web10Error,location:{protocol:'https:'},document:{set cookie(v){writes.push(v)}},cookieDict:()=>cookie,readTokenCookie:()=>null,setTokenCookie:()=>{},scrubTokenCookie:()=>{},decodeJwt:t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64'))}catch{return null}},authPost:async(u,b)=>{posts.push({u,b});return{access_token:jwt(b.client_id),refresh_token:'synthetic-rotated',token_type:'Bearer',expires_in:1}},authGet:async()=>({}),fetch:()=>{throw Error('NETWORK FORBIDDEN')},setInterval:f=>(intervals.push(f),intervals.length),clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},window:{open:()=>popup,opener:popup,addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f)}};
vm.createContext(x);const s=execFileSync('git',['show',pin+':sdk/src/v3.ts'],{encoding:'utf8'}).replace(/^import .*$/mg,'').replaceAll('export ','');vm.runInContext(stripTypeScriptTypes(s),x);
(async()=>{
const fresh=x.createV3Client({apiOrigin:'https://api.invalid'});
const url=await fresh.oauth.authorize({clientId:' CLIENT-A ',redirectUri:'https://app.invalid/cb',state:'expected',openPopup:false});a.equal(new URL(url.url).searchParams.get('client_id'),'client-a');
a.throws(()=>fresh.oauth.exchangeCode('synthetic-code','https://app.invalid/cb',{clientSecret:'synthetic-secret'}),/No delegated token/);a.equal(posts.length,0);console.log('P1 URL encoded; first exchange blocked before transport');
let p=fresh.oauth.authorize({clientId:'client-a',redirectUri:'https://app.invalid/cb',state:'expected'});popup.location.href='https://app.invalid/unrelated?code=synthetic-forged&state=wrong';intervals.at(-1)();let result=await p;a.equal(result.code,'synthetic-forged');a.equal(result.state,'wrong');console.log('P2 wrong callback path and state accepted');
p=fresh.oauth.authorize({clientId:'client-a',redirectUri:'https://app.invalid/cb',state:'expected'});popup.location.href='https://app.invalid/cb?code=synthetic-legit&state=expected';intervals.at(-1)();a.equal((await p).code,'synthetic-legit');console.log('P3 legitimate callback control accepted');
const c=x.createV3Client({apiOrigin:'https://api.invalid',token:jwt('client-a')});c.oauth.setRefreshToken('synthetic-old');a.equal(c.oauth.getRefreshToken(),'synthetic-old');await c.oauth.refresh({clientSecret:'synthetic-secret'});a.equal(posts.at(-1).b.grant_type,'refresh_token');a.equal(c.oauth.getRefreshToken(),'synthetic-rotated');c.signOut();a.equal(c.state.token,null);a.equal(c.oauth.getRefreshToken(),'synthetic-rotated');await c.oauth.refresh({clientSecret:'synthetic-secret'});a.ok(c.state.token);console.log('P4 refresh rotation and refresh after signOut observed with inert response');
await c.oauth.exchangeCode('synthetic-code','https://app.invalid/cb',{clientSecret:'synthetic-secret'});a.equal(posts.at(-1).b.grant_type,'authorization_code');a.equal(Object.hasOwn(posts.at(-1).b,'token'),false);console.log('P5 primed exchange sends secret/code in body, no user token');
c.oauth.setRefreshToken(null);a.equal(c.oauth.getRefreshToken(),null);cookie=Object.create({refresh_token:'synthetic-inherited'});a.equal(c.oauth.getRefreshToken(),'synthetic-inherited');console.log('P6 own clear works; inherited refresh selection conditional on cookieDict prototype');
c.contractRequest([],'https://auth.invalid',r=>writes.push(r.status));for(const f of [...listeners])f({origin:'https://evil.invalid',source:{},data:{type:'contract_response',status:'approved'}});a.ok(writes.includes('approved'));c.contractOnReady([]);a.equal(writes.at(-1)[1],'*');console.log('P7 existing F-01 and S-6 reproduced');
console.log('ALL 7 PROBE GROUPS OK; no network, real credentials, files or services');
})().catch(e=>{console.error(e);process.exitCode=1});
NODE
```

New test diff provides happy URL/popup/deny/blocked/timeout, primed exchange/refresh, invalid_grant propagation and getter/setter controls. It does not prove real SOP/navigation, wrong-state/path rejection, initial exchange usability, logout termination, cross-client isolation, browser cookie flags, response schema, atomic backend rotation/replay or supported-browser integration. Mocked invalid_grant is not actual server family invalidation. No new suite execution claimed.

## Design-Intent Review And Limits

Intended behavior: D92 adds confidential-client delegated authorization-code exchange/rotation under existing contracts/groups, not a new permission model. Preserve existing browser popup consent and generic SDK behavior, D41 readable-node/PWA/no-default-E2E, D56 content-blind telemetry, body tokens, JS cookies and accepted lifetimes. Delta: report only; no actor flow changed. By-design conflict: none introduced. Conventional deviations retained intentionally; absence of PKCE/public clients is decided, not a new vulnerability. Optional state is caller-managed in KB, but builtin browser result authenticity still needs explicit binding or clearly limited contract. OAuth KB's draft form/path/header language differs from source's v3 JSON/auth UI entry; this receipt does not resolve backend wire compatibility.

Tests cover only synthetic local behavior above; no fresh independent design-intent approval manufactured. Untested intent risks: first connector enrollment, legitimate concurrent callbacks, cross-origin redirect handling, secret custody in browser use (v1 intended server-side confidential clients), logout expectations, restore/multi-provider sessions, cookie engines/PWA, real contracts/revocation/signatures/expiry, server storage atomicity, deployment/published-cache correspondence. No new risk acceptance asserted. Two new local entries (one conditional lifecycle concern), one confirmed functional defect and one conditional candidate do not close retained findings. Follow-up repair/disposition/sign-off and all L2+ work remain owed.
