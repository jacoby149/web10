# L1-PREVIEW Backend Receipt

- Source pin: `db325cd3ca242774ed0afdaf743fdf35419da1e7`; date: 2026-10-18.
- Scanner: OpenCode, gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Coverage complete: three whole shipped Node backend files, 422 lines including comments/blanks; no remaining assigned lines. Not the screenshot harness.
- Disposition: no confirmed local C+I finding; security review/sign-off pending. No PASS, fix, three-dry, model-diverse or whole-service assurance claim.
- Only this receipt written; no runtime/central/git mutations, installs, servers, sockets, network, browser or real credentials. Read-only `git show` supplied pinned probe source.

## Orient And Intent

- Read root AGENTS; security theory/post-mortem, checklist and design-intent gate; current learnings, security record, I1-I6; strategy thesis/design, plan/lane security queues, changelog and D71.
- Feature context: `web10-v3/media/thumbnailing.md`, `social/share-preview.md`, and `social/rich-text.md` preview/render intent. These are context, not additional source coverage.
- Onboarding: B-1/B-3 issuer weaknesses and B-4 logging remain existing concerns, not findings automatically inherited by this anonymous adapter. No duplicate BP/B IDs assigned.
- Recession: I3 depends on every read/thumbnail enforcing anonymous public grants. Preview must not forward the viewer's authority or recover private content after denial.
- Obvious gap: markdown flattening is not escaping; the API renderer and edge split are separate trust assumptions. Dependency integrity remains assumed; availability belongs to reliability.
- Intent: app-owned permalink mapping and fallback composition over generic node primitives (D60), rich public cards, generic private-post/group cards, and public profile identity. Preserve readable-node D41, body tokens, accepted cookies, diagnostics and D56 telemetry.
- Delta: scan only, none. No conventional-standard reversal proposed. Untested intent risks: actual renderer escaping, public-grant enforcement, media capability lifetime and deployed browser/crawler routing. Fresh independent design-intent review remains owed.

## Exact Whole-File Coverage

| Path | Whole range / count | Per-symbol/range review, including intervening comments/blanks |
|---|---|---|
| `marketing/web10-social/preview/card.mjs` | 1-260 / 260 | module/import/config/limits 1-31; truncate 32-37; readDocAnon 38-50; getThumbnailAnon 51-64; renderCardAnon 65-76; readAuthorProfile 77-92; authorAvatarUrl 93-104; readGroupFace 105-121; groupCard 122-170; postCard 171-176; watchCard 177-182; shortsCard 183-188; buildPostCard 189-232; profileCard 233-260 |
| `marketing/web10-social/preview/markdown.mjs` | 1-79 / 79 | module contract 1-14; stripFencedCode 15-20; stripInlineCode 21-25; stripLinks 26-31; stripEmphasis/unflanked 32-50; stripHeadings 51-55; stripBlockquotes 56-60; stripLists 61-65; stripMarkdown 66-79 |
| `marketing/web10-social/preview/server.mjs` | 1-83 / 83 | module/import/config 1-20; callback URL parsing 21-24; health 25-30; method gate 31-39; route matching 40-53; decoding/dispatch 54-65; 404 66-71; HTML response 72-73; catch/log/generic error 74-79; listen 80-83 |

## Six Checklist Classes

| Class | File-local disposition |
|---|---|
| 1 Access control | card reads omit tokens deliberately; non-ok reads become null and private post/group paths render generic specs without thumbnail/profile lookup. Server never reads Authorization/cookies. I1/I2/I5 credential validation is delegated/not performed here, not bypassed locally; I3 API enforcement remains L2+. Profile public identity is explicit intent, not a leak. |
| 2 Injection | Markdown regexes flatten syntax, retaining quotes/raw HTML/entities/unrecognized syntax; truncate is not sanitization. Card submits JSON, not a locally interpolated HTML template. Server sends renderer response verbatim as text/html. No SQL, eval of request data, shell, deserialization-to-code or filesystem path sink. URL components are encoded in canonical URLs; escaping/scheme policy remains renderer-owned. |
| 3 Boundaries/transport | All five fetch sites use operator-configured API_ORIGIN plus constant endpoint paths; IDs/groups enter JSON only. Thumbnail URLs are passed as spec data, never fetched locally. Host affects parsing base, not outbound origin or canonical SOCIAL_ORIGIN. No account bearer URL transport, cookie/postMessage/CORS code or credential forwarding. Fetch redirect behavior is implicit; actual redirect provenance is untested. I6: no cross-store query or remote authority consumed locally. |
| 4 Availability | No fetch timeout/response cap; malformed API types can throw in truncate/author split. URL parsing precedes try; malformed URL/Host can reject callback outside handler catch. Regex cost, broad group reads and fan-out are reliability concerns, not confirmed C+I findings. No stress tests run. |
| 5 Lifecycle | No local persistent cache, secret store or mutable authorization state. Specs may carry API-produced presigned media URLs to external crawlers intentionally; revocation/expiry and crawler retention are external. Group latest-doc ordering and profile first-doc choice depend on API ordering, not a demonstrated tombstone bypass. |
| 6 Hygiene | No source credentials/default passwords. Error logger receives full error object, but no reachable protected-value source shown: no confirmed secret/content disclosure. Generic error body contains no exception. listen omits host (all-interface default); exposure requires deployment evidence and public preview intent, not an admin-port finding. |

## Confirmed Findings

None demonstrated; no confirmed L1-PREVIEW finding IDs. Conditional synthetic markup/URL forwarding is not XSS, SSRF, actual credential validation or private-data access. No manufactured secret-bearing exception used.

## Offline Real-Code Proof

P1 executed from repo root with `node --experimental-vm-modules --input-type=module -e '<JavaScript below>'` (single-quoted argument; block contains no single quotes). Actual pinned modules, inert fetch only:

```javascript
import vm from "node:vm";
import {execFileSync as git} from "node:child_process";
import a from "node:assert/strict";
const pin="db325cd3ca242774ed0afdaf743fdf35419da1e7",calls=[];
let deny=false;
const x="\"><script>alert(1)</script>";
const c=vm.createContext({process:{env:{}},fetch:async(u,o)=>{
  calls.push([u,JSON.parse(o.body)]);
  return u.endsWith("/render")?{ok:true,text:async()=>"INERT"}:deny?{ok:false}:
    u.endsWith("/thumbnail")?{ok:true,json:async()=>({thumbnail:{url:"javascript:inert",alt:x}})}:
    {ok:true,json:async()=>({body:{text:x}})};
}});
const load=n=>new vm.SourceTextModule(git("git",["show",
  `${pin}:marketing/web10-social/preview/${n}.mjs`],{encoding:"utf8"}),{context:c});
const m=load("markdown");await m.link(()=>{});await m.evaluate();
const k=load("card");await k.link(()=>m);await k.evaluate();
a.equal(m.namespace.stripMarkdown(x),x);
await k.namespace.postCard("alice","http://169.254.169.254/x");
a.equal(calls.at(-1)[1].description,x);
a.equal(calls.at(-1)[1].image,"javascript:inert");
a.ok(calls.every(([u,b])=>u.startsWith("http://api.localhost/v3/")&&!("token"in b)));
deny=true;calls.length=0;await k.namespace.postCard("alice","private");
a.equal(calls.length,2);a.equal(calls[1][1].title,"A post on web10");
a.ok(!JSON.stringify(calls[1][1]).includes(x));
console.log("P1: 7 assertions satisfied; inert fetch only");
```

- P1 result: exit 0, printed `P1: 7 assertions satisfied; inert fetch only`; Node emitted experimental VM warning only. No failed probe hidden or repaired runtime.
- Supplemental inline VM probe used the same pinned loader for all three files and SyntheticModule fake node:http (createServer captures callback, listen is no-op). Five card builders preserved synthetic markup/URL in render specs; four denied post/watch/short/group cases made only read + generic render calls. All outbound requests were fixed-origin JSON POSTs without token fields or auth headers.
- Supplemental callback checks: five permalink shapes returned inert renderer HTML/200; POST /health=200, POST /u/a=405, unknown route=404, invalid percent encoding=500. Synthetic incoming Authorization/cookie canaries never reached fetch; hostile Host did not change canonical origin. Exit 0; no HTTP listener created. P1 above is the compact replay artifact, not a claim to reproduce every supplemental case.

## UNVERIFIED L2+ Candidates

- L1-PREVIEW-C1: `card.mjs:68-75,159-169,209-231,250-259`, `markdown.mjs:68-79`, `server.mjs:72-73`: trace actual renderer escaping in text/attribute/URL contexts and scheme handling. No fake renderer sink proves executable HTML. Existing API preview review is context only, not re-scanned here.
- L1-PREVIEW-C2: `card.mjs:42-64,82-120,193-218,235-248`: verify anonymous read/thumbnail public grants, tombstones, group ordering and media authority on real sources. Stub denials prove fallback behavior only; no protected record returned or leaked.
- L1-PREVIEW-C3: `server.mjs:6-8,21-23,81-83`: verify deployed nginx routing/bind/publication. User-Agent is spoofable, not authorization; public-only data must remain safe regardless of client. No deployed reachability or browser execution established.
- L1-PREVIEW-C4: `server.mjs:74-77`: exception logging is an unredacted sink, but protected input/error provenance and log audience remain unverified. Do not promote to B-4/new disclosure without a real source.

## Limits

No live API, storage, media fetching, credentials, browser parser, renderer or nginx exercised. Operator origins are trusted configuration, not attacker-controlled SSRF proof. Source pin supplied all executed module text; working-tree reads provided line-by-line review. No broader call-graph/service coverage, dependency audit, historical exposure assessment or independent sign-off performed. Ghost posts degrade to generic cards locally despite KB ghost-404 prose; correctness mismatch, not proven security impact.
