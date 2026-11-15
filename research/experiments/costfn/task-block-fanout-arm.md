# Task block — the Fanout Arm (Config F)

Operator direction, 15 November 2026. Retained, structured transcription of the
corrected task block supplied in this session; not a measurement receipt.
**Subsequent operator approval/corrections govern:** canonical membership
single-pass count/recipients (no membership counter); append-only insertion with
read-time logical cap/amortized background trim; research coordinator approved;
settings range deferred. Exact artifacts, approval and granted four-hour/$2
admission live in the linked closure file. No fifth planning document is needed.
Architecture: [D113](../../../knowledge-base/web10-v3/db/group-delivery.md).
Approval worksheet: [ARM-F-DESIGN-CLOSURE.md](ARM-F-DESIGN-CLOSURE.md).

## Why

Config P's bounded native count/metadata checks and semantic complete-response
parity passed. Preserve the earlier exact-creative failure: 300 node-ad inventory
records share one timestamp. Its three serial complete-sequence observations
were 3,323 / 3,606 / 3,287 ms and approximately 484 MB logical reads, missing the
500 ms / 25 MB targets. These are diagnostic observations, not formal T6/p95 or
capacity evidence. They motivate this proposed write-side arm; they do not waive
design closure or provide fresh operational admission.

The supplied block's 37k DAU / approximately 23 loads per second and approximately
11 GB/s arithmetic are sizing hypotheses, not measured sustained throughput. Its
structural conclusion and the proposed v7 headline remain hypotheses to test.

## Settled design

- Canonical documents remain the sole content source. Canonical attachments,
  grants/policies and events/follows retain their separate authority.
- The physical table is **`fanout`**: generic delivery infrastructure shared by
  every app, no app-specific columns. It holds recipient/document pointers,
  not bodies or cached permissions. The minimal sketch is
  `(reader_key, created_at, doc_id)`; D113 requires full-key identity and route
  provenance to be resolved before executable DDL.
- Every document published into a group invokes group-contract delivery
  maintenance; there are no document-type exceptions or first-read triggers.
- One declared `fanout_member_cutoff`, default **2,000 members**, controls routing.
  Below the cutoff: one pointer per entitled recipient. At/above it: zero
  recipient pointers; seek through `doc_groups_t`. The 1,999 default bound is
  **per small-group publication**, not across all groups attached to a document.
- Approximately **200 logical pointers per reader**, enforced logically at read
  and by amortized background trim. Foreground inserts are append-only and never
  re-rank a reader's existing list; per-insert ranking is a build defect. Cap
  changes storage, not eligibility; older/filtered/refill fallback is required.
- Follow of a small group backfills its recent documents up to the cap in the
  same session. Follow of a large group writes no pointers; time the first seek.
  Unfollow removes that group's contribution without deleting another valid route.
- Merge recipient pointers and seek slices; multi-group documents appear once
  in the intended document stream. Full-key identity, generic query multiplicity
  and exact oracle ordering must be reconciled explicitly in design closure.
- Keep Config P satellites unchanged. Counts retain exact scopes; resolve
  bodies/profiles canonically. Views **treatment** stays OFF; do not omit the
  original view path from complete-response cost or delivery checks.
- Pointers never authorize. Resolve current canonical versions, attachments and
  permissions; reject deleted/revoked/denied candidates and refill.
- Rebuild from canonical documents, attachments, grants/policies and actual
  subscription/event sources, never from another satellite as the root of truth.
- Publish classification and recipients come from **one complete canonical
  `group_members` pass**, using the returned recipient set's length for the lane.
  **No membership counter/recipe**: `counting_numbers` stays engagement-only.
  Up-crossing 2,000 stops new fanout; existing pointers age out and seek covers
  reads. Down-crossing reuses bounded follow-backfill. Do not invent a separate
  crossing system; specify durable scheduling and race handling for these paths.

## Programme and admission

1. D113 research design is approved with corrections; exact DDL and source-bound
   hook manifest are in the closure file. Native build/behavior remain gates.
   The settings field/range is deferred to integration, not an experiment blocker.
2. Fresh isolated DigitalOcean admission is **granted** in the4-hour/$2 shape,
   with independent layered cleanup and a stated deadline. Bind the actual
   host/start/deadline before execution; no expired lease reuse. Restore dataset
   `2d6bbc4d…` from its MinIO archive using the full manifest identity; never
   regenerate. Keep 32 GiB host / 28 GiB container / 22 GiB ClickHouse and the
   ten-second measured-read deadline unchanged. Cap hit means stop and report.
3. **Step 0:** reproduce Config P's serving sequence on the fresh restore and
   retain exact native per-stage SQL/query-ID attribution. Report the stage table
   before building F under the programme's stricter sequence.
4. Build the table, publish hook, follow/unfollow, cap trim and merged read in
   the isolated research arm. Before any test, retain DDL/granularity, constants
   and effective cutoff, code locations, hook file/line references, implemented
   recipient predicate and canonical dependency manifest.
5. Run the gates below in order. Any parity/rebuild failure or stop-rule hit
    stops the arm and reports. No silent comparator changes or improvisation.
   Step 5 also requires the concurrent **R+W** gate below before the arm passes;
   quiet T4 and read-only T6-F results cannot substitute for it.
6. Only if every required gate passes, write a separate staged, flag-gated
   broader-integration proposal. A PASS permits a proposal, not deployment.
7. Only on a separate explicit operator go, implement broader protocol integration:
   unconditional write maintenance, layout-aware reads, persisted node-admin
   cutoff default 2,000, parity against the old path before changing defaults.
8. Only afterward, produce additive **draft v7**, preserving all prior drafts,
   using receipt-supported claims and personal **Independent** affiliation, never
   Web10 Inc or the employer. Target **CIDR next cycle**, not SIGMOD 2027; no
   submission is authorized. Failure leaves later steps waiting for the operator.

## Gates and report order

| Order | Gate | Required result |
|---|---|---|
| 1 | Step 0 | Config P native stage decomposition, retained SQL/query IDs |
| 2 | Build receipt | Actual DDL, constants, hook locations, recipients and sources |
| 3 | T4 | At approximately 10 / 500 / 999 / 1,999 members, pointers equal entitled recipients; at/above 2,000, zero. Report physical amplification and added publish-path p95 |
| 4 | T2-F | Independent complete-response parity, mixed lanes and multi-group dedup; exact core/order/counts/profiles/creator ads, existing semantic eligible-node-ad comparator |
| 5 | T6-F | Three trials, K=20, full store; complete-response p95 <500 ms **and** <25 MB total logical reads, with P-versus-F stage table; >10M rows in a single read stops |
| 6 | T3-F | Fresh reader follows 39 mixed-lane groups; same-session feed including first seek; >60 seconds fails |
| 7 | T5-F | Drop **only** `fanout`, rebuild from canonical alone, repeat T2-F/T4 spot checks; reproduce pre-drop logical feed |
| 8 | T8-F | Stale-pointer deletion/revocation/entitlement replay, latest-version-first tombstones and refill; serving a deleted document fails immediately |
| 9 | Boundaries | 1,999↔2,000 both ways, multi-route removal, same-ID/different-author, cap overflow, crash/retry and concurrent publish/follow/rebuild |
| 10 | T7 | K=1000 only after T2-F and T6-F pass; separately admitted under the programme |
| Required load extension | R+W | Ten minutes of full reader load concurrently with100 real publishes/sec and10 follows/sec; read budget, delivered rates, errors and delivery correctness must hold as specified below |

## Addendum — the load model is DAU R+W, not readers alone

**Operator direction,15 November 2026.** This amends programme Step 5 and what
the arm must prove, not the settled design. Fanout moves work onto publication
and follow; measuring only reads would test the cheap half. Both streams must
run concurrently for the full measured cell, not before/after it.

### Declare both profiles before launch

Use the full frozen realism store and the **37k DAU reader load model**:
approximately **1,400 peak concurrent sessions**, approximately **23 complete
feed loads/sec at60-second think time** (approximately **46/sec at30 seconds**).
Pin the chosen think-time/rate profile, session scheduling, arrival model,
reader cohort/K and sample schedule in admission. Do not retrospectively choose
the easier rate or call configured virtual users achieved concurrency.

The supplied writer model is approximately **12,500 publishes/day** at the
1M-user shape, approximately **0.2/sec average** and **1–2/sec realistic peak**
at37k DAU. These are operator-supplied sizing assumptions, not new observed
traffic. The test deliberately stresses writers at approximately **50–100×**
that assumed peak, rather than testing at the realistic rate:

| Stream | Sustained target during the full measured cell | Required execution |
|---|---|---|
| Readers | Declared approximately23/sec (60s think), or46/sec (30s think) | Full Config F response sequence, not only the candidate/main query |
| Publishes | **100/sec**, mixed under-cutoff group sizes through1,999 members | Real authorized write path through the §4 maintenance coordinator, group-contract hook, **full canonical `group_members` count and recipient-set query**, canonical publication and fanout writes |
| Follows | **10/sec**, mixed under/at/over-cutoff groups | Real follow path; bounded small-group backfill and large-group no-backfill/first-read seek classification |

**No direct table inserts or precomputed recipient shortcuts in the workload.**
The hook's legitimate derived writes occur inside the real path. Include auth,
membership enumeration, coordinator queueing/retries and derived work in write
latency/accounting; enqueue acknowledgement alone is not completion. The approved
single canonical pass supplies both count and recipients; do not reintroduce
counter maintenance or exclude canonical enumeration cost.

### Required cell and acceptance

Run **10 sustained minutes at the declared target rates**, either as a declared
T6-F load extension or a separately reported R+W cell after T6-F. It is mandatory
before the arm is called passed. Frozen source files/receipts remain immutable;
restore an admitted disposable copy and declare workload mutations, storage
headroom and cleanup. Writes must affect the serving workload, not an unrelated
side database. No higher memory/query limits, automatic lease extension or new
paid admission follows from this addendum.

- Complete-response **read p95 <500ms AND <25MB total logical reads per
  complete sequence**, counting all native stages, while both writers run.
  Retain unchanged query/resource and >10M-row single-read stop rules.
- Report **publish-path p95 latency under load**, not only quiet T4 timing,
  and **follow/backfill completion latency under load**, including backlog and
  drain status. No numeric publish/follow latency threshold is invented here;
  T3-F's separate same-session/>60s gate remains unchanged.
- Receipt actual publish recipient-pointer writes/sec against the **actual sum
  of entitled recipients for the measured publications** and the declared
  maximum **publish rate ×1,999**. Define a publication as one group route for
  this bound: multi-group document writes require summed route accounting, not
  a false document-wide1,999 ceiling. Pin route mix before launch.
- Report follow-backfill pointers separately from publish pointers; also report
  retries, trim/tombstone/bookkeeping writes and total physical amplification.
  The publish bound is not a ceiling on all physical storage operations.
- **Errors <1% for reads and writes**, with read/publish/follow counts and error
  denominators separately retained as well as the combined result; one quiet
  stream cannot hide another's failure. Record offered/started/completed rates,
  actual concurrency, timeouts, rejected arrivals, queued work and unresolved
  acknowledgements. Throttling/draining later cannot manufacture sustained rates.
- Independent canonical parity and an operation/recipient/route reconciliation
  must detect lost or duplicated logical delivery under concurrency. Distinguish
  idempotent retry versions and intentional200-window eviction from duplicate
  delivery or loss; inspect receipts/history as well as the final retained window.
  Any parity failure, lost/duplicated delivery or stop-rule hit stops and reports.

A PASS supports only the declared reader/writer mix and measured envelope. It
does not establish arbitrary load, forecast traffic or unmeasured write-latency
headroom. A read-only T6-F PASS cannot close the arm or admit broader integration.

Pin unchanged baseline/Arm T/P receipts and distinguish main-only scopes from
complete-sequence scopes. Historical comparators are approximately 361M rows /
24.32 GB for the failed baseline, 1.72M rows / 156.5 MB for Arm T core stages,
and approximately 3.3 seconds / 484 MB for Config P complete sequences. They
are not interchangeable measurement scopes. Frozen cells/inputs/receipts stay
untouched; no production change is authorized by programme Steps 1–6.

## Registered follow-on: Sort-Order Arm — PLANNED, NOT ADMITTED

Operator addition,15 November2026, before Fanout implementation resumes. F
retains its existing admission/code/cells/gates/R+W scope. **No projection build,
Sort-Order cell, counter retirement or combination cell is admitted in the F run.**
Do not create another planning document for this registration.

F's Step0 stage table must retain **rows, bytes and time for count/engagement
reads per complete response**, distinct from candidate selection, canonical
resolution and preparation. Preserve actual query IDs/SQL and distinguish pure
count reads from embedded/mixed queries; do not invent component bytes from a
whole-query total or count a separate diagnostic twice as request cost. Retain
any additional isolated count probes separately. These measurements confirm
Sort-Order's target before its cells are finalized. If counts are negligible in
P, label this lower-priority production-shape simplification, not the owner of
the484MB miss. Historical approximately3.7M rows/215MB follow-up numbers remain
source/scope-specific historical comparators, not a fresh P-stage measurement.

**P1 — ref projection.** Proposed replacement for feed engagement counters:
an engine-maintained projection on canonical `documents`, ordered by
`(ref_value, collection_name, …)`, with narrow count fields and full identity/
version/deletion columns needed for latest-wins semantics. Counts are derived
at read for the page's references, including exact current attachment/group/
policy scope. The location of that scope in the projection versus canonical
gate is settled by independent parity fixtures and receipted; a fast unscoped
count is invalid (Arm D's15/15-versus0/0 regression stands). Verify actual
ClickHouse24.8 projection selection and FINAL/window/delete/merge behavior;
engine maintenance alone is not proof of latest-authorized count semantics.
No projection DDL or runtime activation is authorized by registration.

**P2 — schema audit.** For each hand-built layout (`doc_groups_t`, time layout,
metadata indexes), state whether it is a pure re-sort of one canonical table
(projection candidate), or contains joined/derived payload a projection cannot
produce (name that payload). `fanout` is excluded: documents×membership delivery
is not a re-sort. `counting_numbers` is an aggregate, not a layout, and remains
unchanged until P1's separately admitted cells pass. This does not change F.

**Separately admitted cells, one variable each:**

- Exact count parity against the independent canonical T1 fixture set, including
  same-author/outside-group0/0, scope-qualified/shared/version/tombstone cases;
  mismatch stops, never change the oracle.
- Follow-up count cost: standard K20 winner page, versus historical derivation
  and current counter point reads; rows/bytes/time, viral-tail page separate.
- Knob cell: rank the declared retained200 candidates using P1 counts and take
  the page; report actual cost, not arbitrary whole-history ranking.
- Projection overhead: storage delta and canonical insert/merge cost delta at
  the100-publish/sec writer rate, with its allowable overhead bound declared
  **before** launch. No overhead limit is invented by registration.
- **Combination last:** only after F's required gates and P1's cells pass and
  separately admitted: Config F+P1, complete response K20, three trials,
  p95<500ms AND<25MB, same stop rules, with candidates/counts/resolution/
  preparation stages alongside P and F. Passing one arm cannot substitute for
  the other or establish the combination result.

Same envelope/engine/stop rules; no production action. Fresh host/window/cap/
cleanup approval is separate, after F's gates. Failed/unreached cells remain
results/open gates. Resume F implementation now; this section only registers
the follow-on and the required Step0 reporting granularity.
