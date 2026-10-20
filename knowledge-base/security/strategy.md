# Security Campaign Order

Decided by the operator, 18.10.2026: **API + SDK through L1-L4 first, then
everything else through L1-L4.** This is web10's execution order for the portable
[security method](../../ai-pack/ai-security-theory/README.md), not a change to
the method's scope ladder or a restriction on vulnerability reporting.

```text
Wave 1: protocol (API + SDK + RTC)   L1 -> L2 -> L3 -> L4
                                      complete its gates
Wave 2: remaining project surfaces  L1 -> L2 -> L3 -> L4
```

Do not spread the campaign across every app's L1 before finishing the protocol's
deeper levels. Parallelize disjoint scopes within the current wave and level;
do not parallelize away the gates between levels or waves.

## Wave 1: Protocol First

- **Node API:** `api/app/`, including authentication, contracts, groups,
  documents, query/storage boundaries, media and asynchronous imports.
- **SDK:** `sdk/src/`, including credential storage/transport, auth messages,
  consent callbacks and the optional RTC client.
- **RTC:** `api/rtc/`, including signaling admission, identity and lifecycle.
- **Required protocol edges:** actual shipped SDK artifacts/copies and the
  configuration, packaging, issuer/federation and deployment contracts needed
  to substantiate the protocol guarantees. This is not a general operator-tool
  or unrelated frontend inventory sweep.

Run the levels in order across this protocol scope:

1. **L1:** complete file-local coverage and resolve local findings through
   small, one-finding fix PRs with exploit red -> denied green evidence.
2. **L2:** inspect direct caller/callee and source/sink edges, including token
   verification, permission checks, query/storage, document/media signing and
   message/credential-store boundaries.
3. **L3:** inspect complete API, SDK and RTC service flows, including revocation,
   recovery, concurrency, asynchronous authority and lifecycle composition.
4. **L4:** inspect protocol-wide integration: API/SDK/RTC composition, issuer
   trust, shipped artifact versions, configuration and coordinated rollout.

Read or exercise an outside component when necessary to verify a protocol edge;
do not turn that context read into a claimed whole-component scan. If an outside
dependency blocks a guarantee, record the blocker and the required evidence.
Do not declare the protocol gate passed by excluding the troublesome dependency.

## Wave 2: Everything Else

After Wave 1's gates are met, run L1 -> L2 -> L3 -> L4 on the remaining project
surfaces. Prioritize the authenticator UI's consent/session/configuration flows,
then social/shared rendering and data layers, marketing and remaining operational
surfaces by criticality. Inventory tests, generated/vendor code, artifacts and
configuration explicitly; exclusion is not a safety claim.

The second wave's L4 includes interactions with the protocol, not merely apps
reviewed in isolation. Changes that invalidate earlier protocol evidence require
a targeted re-scan. A protocol-scoped L4 is **not** a whole-project L4 or a claim
that the authenticator and all applications are secure.

## Advancement Gates

- **Coverage is not PASS.** Every current-level unit needs pinned evidence and
  finding disposition, not just a completed line-count receipt.
- **Deferral is not repair.** Architectural dependencies may be explicitly
  assigned to their proper level/backlog item, with rationale and release impact;
  they remain open until their own close conditions are met. Do not move local
  repair debt into a later bucket simply to advance, or mark a blocked guarantee
  passed because its finding has a backlog reference.
- **Keep evidence classes separate:** demonstrated findings, unverified L2+
  candidates, accepted by-design choices and reliability-only issues.
- **Fix small:** one finding per PR, target about 100 changed lines, maximum
  500; repro gate, fresh design-intent review, tests and KB write-back required.
- **Required security sign-off remains required:** fresh, independent,
  model-diverse three-dry review where the method demands it. Same-model receipt
  review and green CI do not substitute for that evidence.
- A wave completes only when its required level/sign-off gates are evidenced
  and unresolved blockers are reported honestly, not hidden behind a broad
  "secure" label. Whole-project AI-pentest claims require both waves and their
  cross-surface integration evidence.

## Current Position

API and SDK source L1 coverage receipts are merged, with RTC evidence also
recorded. **Open findings, artifact correspondence and security sign-off remain;
L1 has not passed merely because coverage is complete.** The next work is to
reconcile demonstrated protocol L1 findings, their dependencies and repair order,
then close the local holes before advancing through the protocol's deeper levels.
The authenticator UI campaign is deferred to Wave 2, not cancelled as a security
obligation. Existing out-of-order receipts remain useful historical evidence.

Live tasks: [plan](../strategy/plan.md) and
[lane queue](../strategy/parallel-execution.md). Evidence and knowledge remain in
[the security record](security-record.md) and [learnings](learnings.md).
