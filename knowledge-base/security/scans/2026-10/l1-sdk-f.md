# SDK L1 Scope F Receipt

- Date: 2026-10-18; pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Status: OPEN; owned coverage complete, security review pending. No PASS, fix, three-dry or model-diverse sign-off.
- Owned: `sdk/src/v3.ts` logical **1093-1683 inclusive**, 591 logical lines / 590 newline characters, including every comment, blank and final `}` at unterminated EOF.
- Whole file: 1682 newlines / 1683 logical lines; pinned SHA256 `6f6d45f3bc331f76aeebb90cae94be4bd1f82c69ffc71fe35aff7117d4e2fa07`.
- Read working source matched pinned bytes in probe. No unscanned owned range. Other SDK source, tests and copied/generated distributions are not certified.
- Context only: `v3.ts:570-809` (factory, token helper, access-oracle types/implementation); `http.ts:1-103` (GET semantics). No E/helper coverage credit.
- Slice boundaries: D owns 1-633, E 634-1092, F 1093-1683; no method body is cut. E/F nevertheless share the same enclosing `createV3Client` factory (634-1557), so their context/probes do not establish independent whole-factory coverage.

## Orient And Intent

- Read root AGENTS, scan contract, strategy directory/plan and both L1-008 queues, changelog, thesis, security learnings, October SDK audit, I1-I6 overview, six-class checklist and design-intent gate.
- Relevant KB: `web10-v3/sdk/{api,contracts,implementation}.md` (group sections/schema/SQL context), `groups/access.md` (D58/D80 principals/ownership).
- Onboarding: S-1/S-6 are outstanding popup issues; S-3 is functional; S-2 composes with B-4, not a transport vulnerability.
- Recession: no presumed closure from old rows; this pin still has unbound consent responses and a wildcard legacy sender.
- Obvious gap: an authenticated origin alone would not bind a response to its popup/request; source-window and concurrent-request correlation need explicit review.
- Design-intent: preserve generic groups, intentional `anyone`/`authenticated` grants, public membership policy, consent, additive reconciliation and node-oracle recovery. D41/D56, body tokens, unsigned UX metadata and JS-readable cookies are not findings.
- Delta: receipt only, no actor behavior changed. No conventional-standard reversal; real browser lifecycle and server authority remain untested intent risks, not accepted safety claims.

## Exhaustive Symbol Coverage

All ranges below are `sdk/src/v3.ts`; intervening separators/comments/blanks included.

| Logical Range | Symbols / Local Review |
|---|---|
| 1093-1143 | `createGroup`, `getGroup`, `getMyGroups`, `getGroupsManages`, `updateGroup`: explicit fields, false discoverability retained, roles/members/tags/visibility forwarded; authority delegated. |
| 1144-1206 | `reconcileGroupContract`: parallel reads, diff no-op, role merge, full tag merge, join-policy replacement, sequential missing-member additions; helper correctness not certified. |
| 1207-1244 | `deleteGroup`, `healGroupOwner`, `joinGroup`, `requestJoin`, `leaveGroup`, `getGroupMembers`: fixed actions, identifiers and optional paging forwarded. |
| 1245-1286 | `byUserGroups`, `addGroupMember`, `removeGroupMember`: S-3; reserved principals accepted as intentional payload values, not local grants. |
| 1287-1332 | `inviteMember`, `acceptInvite`, `declineInvite`, `getJoinRequests`, `approveJoinRequest`, `denyJoinRequest`: fixed actions, caller keys; server role/consent enforcement delegated. |
| 1333-1371 | `blockUser`, `unblockUser`, `blockUserInGroup`, `unblockUserInGroup`, `setSharing`: explicit payloads; no local blacklist/access decision. |
| 1372-1411 | `requestMediaUploadUrl`, `getMediaReadUrl`, `confirmMediaUpload`, `listMedia`, `deleteMedia`, `getThumbnail`: defaults, arbitrary object-key/metadata forwarding, paging/IDs; signing/ownership delegated. |
| 1412-1455 | `getNodeStats`, `getIceServers`, `registerApp`, `getApps`, `rateApp`, `getAppRatings`: ICE presence gate/state-cookie precedence; anonymous registration, rating range guard, fixed endpoints. |
| 1456-1522 | `contractRequest`, `responseHandler`, `readyHandler`, timeout callback: SSR/blocked/error branches, type-only inbound checks, cleanup, fixed outbound target. |
| 1523-1557 | `contractOnReady`, nested response handler: opener guard, wildcard send, type-only callback; factory `pingAppRegister()`/return inspected, implementation outside ownership. |
| 1558-1607 | `V3Client.state`; setToken/scrubToken/readToken/isSignedIn/signOut; login/signup/getProfile/verifyAccess/changePassword/changePhone/setEmail/verifyPhone/verifyEmail/sendCode/setRecoveryPhone; create/read/readRefCounts/trackContentEvent/contentAnalytics/contentViews/readById/query/listPeopleDirectory/update/delete; addAppContract/listAppContracts/revokeAppContract declarations. No runtime gates in types. |
| 1608-1649 | Consent/group/reconcile/ownership/join/member/invite/request/block/sharing declarations, all names corresponding to implementations above. |
| 1650-1683 | All media/stats/ICE/app-store declarations above, thumbnail/ICE comments, duplicate `contractOnReady` declaration and EOF. Types do not prove access control. |

## Six Threat Classes

| Class | Disposition |
|---|---|
| Access control I1/I2/I3/I5 | No issuer verification or storage gate implemented here; API authority delegated. Forged consent callback proven below, not a grant/token forgery. |
| Injection | No eval, shell, SQL execution, filesystem or HTML sink in owned lines. Caller fields remain data to helpers; downstream render/query/URL interpretation unverified. |
| Boundaries/transport I5/I6 | L1-SDK-F-01, S-6 below; fixed authOrigin send contrasts with legacy wildcard. S-3 functional; no account token in owned URL construction. |
| Availability | 30s timeout is not popup-close detection; legacy listener can remain indefinitely; pagination/fan-out/reconciliation interruption are reliability debt, not C+I findings. |
| Data lifecycle | Cleanup on response/timeout/error reviewed; concurrent listeners lack request binding. Reconcile read-modify-replace race requires real concurrent/server evidence; no local persistence. |
| Hygiene | No literal credential, token log or credential dump in owned range. Wildcard consent metadata is S-6, not token exfiltration. Shipped bundles not inspected. |

## Confirmed Local Findings And Functional Evidence

- **L1-SDK-F-01 OPEN:** `1490-1495`, `1536-1539` accept `contract_response` using only message type, ignoring origin/source/request correlation. Injected unrelated-origin/window events invoke callbacks with `approved`; the primary path also removes legitimate listeners. Precondition: hostile sender can message the app window while pending. Distinct from S-1 (token acceptance); no token writes occur here. Real browser reachability, caller reliance and backend approval are unproven.
- Crosslink: **L1-SDK-F-01 / [L1-SDK-A-01](l1-sdk-a.md#confirmed-local-findings)** are location-specific aliases for the same consent-response integrity weakness class in separate public implementations (`v3.ts` methods here; `browser.ts:180-189` adapter there). Track joint repair coverage across both implementations, not two independently counted fixes; closing either location alone does not close the shared weakness. S-1 token acceptance remains distinct.
- **S-6 OPEN (same issue, extended location):** `1544-1547` posts consent metadata to opener with `'*'`; fake opener receives wildcard target. This is outbound metadata-targeting hygiene, not a token leak or the inbound consent-response weakness. Requires opener reference and invocation; no token payload or actual navigated-window disclosure demonstrated. `1505` correctly targets configured authOrigin even when fake foreign `auth_ready` triggers it.
- **S-3 functional, not C+I finding:** `1253-1263` omits token; pinned `authGet` forwards no Authorization/body/credentials. Inert fetch confirms GET/query only, contradicting comment. No private membership leak established.
- Additional conditional probes: ICE rejects absent token, prefers state over cookie; create/update retain false; `anyone`/`authenticated` pass unchanged; fake in-sync diff makes no writes, fake drift schedules policy/tags/member additions; media key and anonymous app registration forwarded; rating 6 rejected.

## Executable Minimal Reproduction

Run from repository root with Node 24.18.0; no installs/files/network/services/real credentials. Source is loaded from the pin, not rewritten implementations.

```sh
node <<'NODE'
const {execFileSync}=require('node:child_process'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module'),a=require('node:assert/strict');
const pin='caeed44278adb65d19f5c737ed9188ccf589b69c',src=p=>execFileSync('git',['show',pin+':'+p],{encoding:'utf8'}),s=src('sdk/src/v3.ts'),ls=s.split('\n');
a.equal(ls.length,1683);a.equal(s.endsWith('\n'),false);
const listeners=new Set(),posts=[],answers=[];let request;
const popup={postMessage:(...x)=>posts.push(x)};
const x={URLSearchParams,apiOrigin:'https://node.invalid',window:{open:()=>popup,opener:popup,addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f)},setTimeout:()=>1,clearTimeout:()=>{},fetch:async(...r)=>{request=r;return{ok:true,json:async()=>({groups:[]})}}};
vm.createContext(x);vm.runInContext(stripTypeScriptTypes(src('sdk/src/http.ts').replaceAll('export ','')),x);
vm.runInContext(stripTypeScriptTypes('globalThis.c=({'+ls.slice(1092,1548).join('\n')+'})'),x);
const emit=data=>[...listeners].forEach(f=>f({origin:'https://evil.invalid',source:{},data}));
x.c.contractRequest([],'https://auth.invalid',r=>answers.push(r.status));emit({type:'contract_response',status:'approved'});a.deepEqual(answers,['approved']);a.equal(listeners.size,0);
x.c.contractRequest([],'https://auth.invalid');emit({type:'auth_ready'});a.equal(posts.at(-1)[1],'https://auth.invalid');
x.c.contractOnReady([],r=>answers.push(r.status));a.equal(posts.at(-1)[1],'*');emit({type:'contract_response',status:'approved'});a.deepEqual(answers,['approved','approved']);
x.c.byUserGroups('synthetic',{limit:0}).then(()=>{a.equal(new URL(request[0]).searchParams.has('token'),false);a.equal(request[1].method,'GET');a.equal(Object.hasOwn(request[1],'credentials'),false);a.equal(Object.hasOwn(request[1].headers,'Authorization'),false);console.log('OK F-01 / S-6 / S-3');}).catch(e=>{console.error(e);process.exitCode=1});
NODE
```

Executed equivalent pinned VM probes: exit 0; both forged callbacks accepted, primary cleanup observed, fixed target preserved, legacy wildcard observed, GET token omission confirmed. Node emitted only its experimental type-stripping warning in addition to OK results. Broader conditional probe assertions listed above also exited 0.

## UNVERIFIED L2+ Handoffs And Limits

- Trace consent callback consumers, concurrent requests, popup navigation/opener policies and real browser origin/source binding; no actual browser authentication was exercised.
- Verify backend group ownership, consent, role assignment/revocation, hidden-membership filtering and reserved-principal union; missing local server gates are delegation, not demonstrated bypasses.
- Trace real diff/merge helpers, permission-gap behavior and reconciliation races before claiming unintended grants/clobbering; fake helpers prove scheduling only.
- Session oracle implementation is outside F: `verifyAccess` context at 746-751 and declaration at 1581 do not certify server verdict/actions or issuer/expiry checks.
- Media signing/object ownership, register metadata handling, token logging composition B-4/S-2 and artifact integrity remain separate review. No node/network/private-data access, protected-data leak, deployed exposure or actual grant mutation proved.
- Only this receipt written; no source, bundle, central-state or git mutations.
