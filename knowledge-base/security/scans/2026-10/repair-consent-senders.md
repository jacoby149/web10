# Consent Response Sender Slice

28.10.2026. Baseline `c258ce048e4771fb8b27daf85fe1d3083e8f54c8` (#1273 merged).
Author/fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol` contexts,
same-model, not diverse three-dry sign-off. Source sender slice merged #1275 at
`40a515fcc`; rollout/diverse review pending. A-01/F-01 and protocol L1 remain OPEN.

Publication: [browser E2E](https://github.com/jacoby149/web10/actions/runs/40677112637),
SDK/package, six Docker builds and security checks passed on db5703900; the
SDK/browser-copy inputs are byte-identical in the merge. Social unit/E2E jobs
needed unchanged reruns, documented in the PR. This is CI, not deployment or
correlation closure; current SDK cross-request settlement remains reproduced.

## Boundary And Delta

Reused-browser, standalone-v3 and legacy-opener consent callbacks accepted
unrelated source/origin responses, then removed legitimate listeners. Readiness
was also unbound. A private matcher now checks the captured window and canonical
configured origin, rejecting null/empty/opaque/invalid trust. Modern callbacks
also require that the contract was sent. Wrong messages do not settle or remove
the real listener. Queued replies after sender closure remain allowed.

The legacy callback captures the opener at invocation, not a later window.opener.
`contractOnReady(contracts, callback)` now immediately returns a configuration
error without sending or installing a listener; migrate to
`contractOnReady(contracts, callback, AUTH_ORIGIN)`. The third parameter already
exists from #1273. No-callback metadata fire-and-forget remains supported.
User grants/fast paths are unchanged; no blanket consent bypass is implemented.

## Proof And Limits

Nineteen initial runtime cases failed before the fix. Current tests cover fresh
IIFE/source, four browser copies, fresh ESM and tracked ESM: wrong sender,
pre-send reply, correct approval/denial, queued close, duplicate delivery,
malformed/opaque configuration, synchronous legacy error/no outbound/no listener,
captured opener replacement and standalone timeout/late-message cleanup.
`bun run test`: 265 passed; typecheck and diff checks pass. Five runtime outputs
match pinned Bun 1.3.14 builds; affected private declarations/maps are generated.
No real credentials, server grants or browser scheduling are proved by VM tests.

Fresh review replayed baseline hostile acceptance/current denial, exact runtime
correspondence and extra legacy/config/timeout controls. It found no additional
sender-slice implementation blocker; migration/write-back was required before
acceptance. Real UI readiness/reply shapes were inspected, not exercised here.
Browser CI and actual cold/return/lazy-group compatibility remain required.

## Correlation Is Still A Close Condition

Independent current VM replay: open one popup, start two contractRequest calls
against it, deliver matching auth_ready then one matching approved response.
Both callbacks fire. Configured legacy calls sharing an opener have the same
residual. This is unfixed local callback-integrity debt, not an L2 deferral or
proof of a server permission grant. The UI still sends uncorrelated type/status/
errors replies, including per-contract replies. Request/batch attribution needs
its own protocol/lifecycle repair before A-01/F-01 can close. S-6 outgoing
wildcards, fast-path permission completeness and general popup lifetime debt
also remain separate; do not label this whole consent security PASS.

Current residual replay from repo root (stdlib Node, inert windows/store, no
credentials/network/writes). Success demonstrates the remaining flaw, not safety:

```sh
node --input-type=module -e '
import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm"; import assert from "node:assert/strict";
const listeners=new Set(), popup={closed:false,postMessage(){}}, origin="https://auth.invalid";
const window={location:{href:"https://app.invalid/"},open:()=>popup,addEventListener:(_,f)=>listeners.add(f),removeEventListener:(_,f)=>listeners.delete(f)};
runInNewContext(readFileSync("sdk/dist/browser.js","utf8"),{window,document:{cookie:""},URL,console:{log(){},warn(){},error(){}},setTimeout:()=>1,clearTimeout(){}});
const w=window.web10; w.openAuthPortal(origin); const c=w.createV3Client({apiOrigin:"https://node.invalid"}); let a=0,b=0;
c.contractRequest([],origin,()=>a++); c.contractRequest([],origin,()=>b++);
for(const type of ["auth_ready","contract_response"]) for(const f of [...listeners]) f({data:{type,status:"approved"},origin,source:popup});
assert.equal(a,1); assert.equal(b,1); console.log("matching_reply_callback_counts=1,1; correlation remains OPEN");'
```

## DESIGN-INTENT REVIEW

- Intent: D42 ask-once/return/lazy consent with decisions from the intended authenticator; sender trust is not permission.
- Delta: only bound readiness/replies settle sent requests; legacy callbacks require configured trust. No-callback metadata remains.
- By-design conflict: none with D41/D42/D56 or grants; documentation must expose the legacy callback migration.
- Conventional deviation: existing wildcard metadata remains S-6; accepting queued closed-sender replies preserves message lifecycle rather than requiring .closed=false.
- Limits: external callers, real browser ordering/named-window reuse/redirects and deployed copies are unverified. Same-model review is not diverse sign-off.

Accepted bounded migration risk, 28.10.2026: external two-argument callback users
must configure AUTH_ORIGIN; invalid/untrusted callbacks must not approve by
default. Reopen on supported-caller migration, normal consent failure, queue/
origin differences or artifact/toolchain changes. Resolve correlation as local
L1 work, not by weakening sender checks or hiding it behind green tests.
