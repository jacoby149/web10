# SDK L1 Scope E Receipt

- Date: 2026-10-18. Pin: `caeed44278adb65d19f5c737ed9188ccf589b69c`.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Owned: `sdk/src/v3.ts`, logical **634-1092 inclusive: 459 lines**, 459 newline characters.
- Every owned line read, including comments, examples and blanks; no owned gaps.
- Whole file accounting only: 1,682 newlines / 1,683 logical lines, unterminated EOF.
- Context: imports/options 34-67 and factory tail/interface 1350-1683; entire real factory
  634-1557 compiled in memory for probes. No F coverage claimed by compilation/context.
- E starts the enclosing factory at 634; it continues through F to 1557. The E/F cut
  is between methods before `createGroup` at 1093, not between complete top-level functions.
- Status: coverage complete; security review pending. No PASS, independent/model-diverse
  review, three-dry, remediation, deployed vulnerability or copied-bundle coverage claim.

## Orient and Intent

- Read contract, supplied root AGENTS, security theory, learnings, I1-I6 overview,
  six-class checklist, design-intent gate, strategy thesis, current plan/lane queues,
  newest changelog, October SDK audit and SDK API/contracts KB.
- Onboarding: S-1/S-6 concern popup boundaries outside E; S-2 composes with B-4;
  S-4 metadata decode and S-5 JS-readable cookie/lifetime are intentional.
- Recession: checked request token transport and identity selection, token absence,
  login storage, contract payloads and generic server-delegated access checks.
- Obvious gap: SDK/UI identity can disagree with request identity when cookie changes;
  caller, helper and server evidence is needed before calling it a C+I failure.
- Intent: generic CRUD/query/contracts, public-grant anonymous reads, node-readable
  content and deliberate body tokens. D41/D56 and cookie design are not findings.
- Design-intent delta: receipt only, no behavior change; future fixes must preserve
  public reads, app-owned services, configured nodes and content-free telemetry intent.
- L1-008 remains open in both queues; historical SDK audit is not exhaustive sign-off.

## Exhaustive Symbol and Boundary Coverage

| Logical range | Symbols / sinks examined |
|---|---|
| 634-643 | `createV3Client`, options/default origins, state token/cookie, RTC/ICE storage. |
| 644-653 | `v3Post`: state-first cookie fallback, local 401, body spread then token override, `authPost` sink. |
| 654-683 | `pingAppRegister`: browser guard, URL query/fragment removal/index collapse, optional token nested in body, direct JSON fetch, swallowed rejection/exception. |
| 684-717 | `client`, `state` shallow copy, `setToken` state/cookie/register, `scrubToken`, cookie-first `readToken`/`isSignedIn`, `signOut` via `this`. |
| 718-736 | `login` username/password/site -> helper -> returned token storage; `signup` phone/email; `getProfile` authenticated helper. |
| 737-780 | `verifyAccess` services/operations; `changePassword`, `changePhone`, `setEmail`, `verifyPhone`, `verifyEmail`, `sendCode`, `setRecoveryPhone`; all `v3Post` sinks. |
| 781-798 | `create`: service/content/groups/ad preference/ref_value -> authenticated request; nested content cannot override envelope token. |
| 799-841 | `read`: all paging/ref/sort/tags/cursor/order/surface fields, optional token -> `/v3/read`; comments are not proof of server grants. |
| 842-856 | `readRefCounts`: service/groups/ref/count, optional token -> read helper. |
| 857-882 | `trackContentEvent`: doc/service/surface/type/payload, optional token; server delivery/dedup claims not certified. |
| 883-898 | `contentAnalytics`: service/window_days, optional token; author scoping delegated. |
| 899-915 | `contentViews`: service/doc_ids/groups, optional token; readability delegated. |
| 916-935 | `readById`: doc_id/service/surface, optional token -> read; document/media resolution delegated. |
| 936-1037 | All query documentation/examples and `query`: raw SQL/groups/group-meta/prepare/surface/content-service, optional token -> query helper. |
| 1038-1053 | `listPeopleDirectory`: pagination and optional token -> directory helper. |
| 1054-1068 | `update`, `delete`: selected IDs/content/groups/ad preference -> authenticated helper. |
| 1069-1092 | `addAppContract`, `listAppContracts`, `revokeAppContract`: origin/permissions forwarding, authenticated helper; group heading/blanks included. |

## All Six Classes

1. Access control: local token-presence gate is not certification. No issuer/expiry,
   ownership or contract enforcement implemented here; server owns I1/I3/I5. `readToken`
   decodes metadata only; `isSignedIn` is presence, not a verified authorization decision.
2. Injection: SQL is intentionally caller input forwarded as a field; no local SQL,
   HTML, shell, filesystem or eval sink. Query compiler/prepare authorization unverified.
3. Boundaries/transport: configured API origin receives passwords/tokens by design;
   no account-token URL or postMessage in E. Direct registration fetch has no explicit
   redirect/credentials options; browser policy and any harmful destination need L2+ proof.
4. Availability: paging/payload bounds and swallowed registration errors are reliability
   concerns, not C+I findings. No retry loop in E; helper-internal retries not inspected.
5. Data lifecycle: state/cookie storage, shallow state exposure and logout inspected;
   local logout is not server revocation. Persistence/expiry/cookie encoding delegated.
6. Hygiene: no literal credential or logging sink in E; synthetic errors are not
   evidence of protected-data disclosure. Body logging remains existing B-4/S-2, not new.

## Evidence and Reproduction

- Broader run, author-reported: pinned whole-factory Bun transpilation with injected
  helper/cookie/window/fetch sinks, no handwritten implementation, imports or generated files.
  Author reported all assertions succeeded, with these broader-run totals:
  13 helper calls, two registration pings, eight anonymous methods, zero network calls.
- Assertions covered canonical registration identity, state-vs-cookie precedence, nested
  token isolation, query forwarding, logout/missing-token rejection, anonymous token omission,
  error propagation without retry, and login token storage/hostname site selection.
- Compact executable replay from repository root (Bun already installed):
- The compact replay below reproduces only a subset, not every summarized case or the
  13-helper/eight-anonymous-method totals (it also triggers two stub registration pings).
  Broader-run results are author-reported, not independent minimal-replay validation.
  Both probes establish conditional local flow into helper/fetch stubs, not actual HTTP
  requests, authentication, token certification or server authorization.

```sh
bun -e 'const a=require("node:assert/strict"),{execFileSync:g}=require("node:child_process"); const s=g("git",["show","caeed44278adb65d19f5c737ed9188ccf589b69c:sdk/src/v3.ts"],{encoding:"utf8"}); const l=s.split("\n"); a.equal(l.length,1683); const js=new Bun.Transpiler({loader:"ts"}).transformSync(l.slice(633,1557).join("\n").replace(/^export /,"")); let c=null; const calls=[],pings=[]; class E extends Error{} const f=new Function("authPost","readTokenCookie","setTokenCookie","scrubTokenCookie","decodeJwt","Web10Error","window","fetch",js+";return createV3Client")(async(u,b)=>{calls.push({u,b});return {token:"LOGIN"}},()=>c,t=>c=t,()=>c=null,t=>({raw:t}),E,{location:{href:"https://app.invalid/index.html?q=1#x",hostname:"app.invalid"}},async(u,i)=>{pings.push({u,i});return {}}); const w=f({token:"STATE"}); c="COOKIE"; a.equal(w.readToken().raw,"COOKIE"); await w.getProfile(); a.equal(calls.at(-1).b.token,"STATE"); w.signOut(); const n=calls.length; await a.rejects(w.delete("d")); a.equal(calls.length,n); await w.query("SELECT 1"); a.equal("token" in calls.at(-1).b,false); await w.login("u","synthetic-password"); a.equal(c,"LOGIN"); a.equal(JSON.parse(pings[0].i.body).body.url,"https://app.invalid/"); console.log("E replay assertions succeeded; network=0")'
```

## Findings and Handoffs

- Confirmed new local finding IDs: **none**. No exploit demonstrated; no existing issue closed.
- UNVERIFIED E-C1 (L2+): cookie-first displayed identity vs state-first request identity
  demonstrably diverges after external cookie replacement. Trace actual login/popup/callers
  and server identity before alleging unintended cross-account mutation or disclosure.
- UNVERIFIED E-C2 (L2+): registration redirect/default-credential policy needs browser,
  destination and deployment evidence; inert fetch demonstrates arguments only, not leakage.
- UNVERIFIED E-C3 (L2+): certify/login/helper response trust, typed access errors/retries,
  server document/media/query/contract gates and analytics authorization remain uninspected
  boundaries. No `/certify` or media method is owned in E; their guarantees are not inferred.
- Limits: synthetic tokens/passwords only; no real origin, issuer verification, auth network,
  private records, durable storage, service reachability or artifact integrity tested.
