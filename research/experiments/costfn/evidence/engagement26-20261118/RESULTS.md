# Engagement A–D: one26.x lease, partial results, no complete-feed PASS

The question was whether one root-reference projection, uniform document refs
and insert-maintained event aggregates bring engagement reads under the existing
500ms/25MB complete-response lines. This run does **not** establish that. It
does bank exact migration parity, an aggregate views measurement and a complete
hot-thread computation. The missing baseline and invalid complete-read dispatch
are not stage wins in disguise.

Machine-readable, content-free receipts: [`results.json`](results.json).
Private source/SQL/failures/request observations and stopped native parts remain
in hash-verified off-host archives identified there.

## Lease and restore

- One existing admitted DO620491569,18 November01:43:57→05:43:57UTC. This
  workspace created no replacement host and did not extend the deadline.
- ClickHouse26.10.4.207; unchanged32/28/22GiB envelope, ten-second measured
  native limit and10M-row guard. Agent supervision/self-kill only; no guardian.
- Prepared snapshot255003176 restores cleanly:88,200,363 documents including
 63 existing fixture rows,1,600,000,000 events. Restore/verification73.471s
  excludes provider provisioning; restore plus rehearsal104.068s.
- Owned droplet/firewall/key cleanup verifies04:41:06UTC, before deadline.
  Elapsed compute estimate **$0.73814**, not invoice; retained snapshot storage
  remains separate. No production, retained-volume or retained-snapshot mutation.

## A — projection coverage, but no valid complete baseline

The executing original controller stopped during untreated login, then advanced
to projection setup. Consequently there is **no pre-projection26.x untreated
complete response**. An empty decomposition list in its original A-decomposition
PASS record is not measured decomposition; treat it as unavailable.

Default projection mode still refuses344; explicit rebuild mode is required.
The original materialization client timed out after300 seconds, but the exact
query's native QueryFinish proves completion at404.258s. A same-store continuation
verified88,200,363/88,200,363 rows and1/1 active parent parts, without repeating
materialization. The transport STOP remains preserved. Projection-only views
remain UNAFFECTED. No old-semantics treated complete response was obtained.

## B — exact views parity; fewer bytes, no demonstrated latency win

The banked page has423,814 true raw delivery events. Its raw views query reads
1,474,936 rows/98,621,175 bytes; an IN filter is not multiplying event rows.
The diagnostic selects RAW_EVENT_AGGREGATION, not an invented join-fanout branch.

Writers were fenced and the aggregate seeded once. The original OPTIMIZE client
also timed out after300 seconds; its exact native QueryFinish is426.369s. The
continuation reused that completed state—no reseed—and compared both raw and
aggregate HTTP results independently against canonical events.

| Measured views cell | Raw26.x diagnostic | Aggregate26.x |
|---|---:|---:|
| Native views rows |1,474,936|344,064|
| Native views logical bytes |98,621,175|46,216,238|
| Native views duration, ms |132|168|
| HTTP wall time including authorization, ms |238.931|240.909|
| Exact impressions/reach parity |PASS|PASS|

These are single measured views cells after one warmup, not complete-feed/p95
results. Native rows fall76.7% and bytes53.1%; this sample does not show a latency
improvement. The aggregate stage alone remains over25MB. Insert aggregation does
not subtract expired raw events; TTL reconciliation remains a production gate.

## C — exact full-store migration; complete reads invalid

All nine validation checks return zero. All32 inverse-multiset batches return
zero mismatches across88,200,363 original/copied physical rows, retaining
versions, tombstones, body fields and multiplicity. The copy's single projection
also covers88,200,363/88,200,363 rows. This is a valid migration proof.

Two research-wrapper settings bugs were reproduced and repaired without changing
authorization, native limits or the oracle. New source-bound read cells then
reached the first main request, but all three declared cells—ordinary K20 and
paired P/F—selected `canonical_fallback / uncertified_generation` rather than the
intended treatment. The physical generation after projection is `f7696ae6…`;
counter/metadata/fanout certificates still bind `fe9d1909…`.

ClickHouse refuses these fallback queries with158/ExceptionBeforeStart: the
reported estimate is92.20M rows against10M allowed. Native actual read_rows and
read_bytes are both **zero**. Do not report the estimate as measured scanning,
the fallback as a treated cost, or these failed requests as complete responses.
Returned-response parity and complete/paired measurements remain OPEN. No native
limit was raised and no more measurement attempts followed these gate results.

## D — full400k hot engagement, exact parity, budget FAIL

The existing fixture is reused:50,000 comments,13,462 reaction documents split
6,731 post/6,731 comment reactions, and336,538 event rows. The view/reaction ratio
follows frozen totals after fixing the50k-comment stress stratum; positive comment
reactions are an explicit added coverage stratum absent from the frozen corpus.

The measured HTTP computation retrieves the post, computes/fetches the full
thread, groups reactions by each target, reads aggregate views and assembles the
tree in memory. Independent exact checks cover all50,000 parent edges,6,732
reaction targets and canonical raw impressions/reach including live delivery.

| Measured component | Native rows | Logical bytes | Native duration sum, ms |
|---|---:|---:|---:|
| Post/authorization |57,345|3,197,431|123|
| Comments and full thread |260,071|27,981,664|290|
| Post and per-comment reactions |141,237|12,967,708|116|
| Aggregate views/authorization |57,349|3,010,232|102|
| Total |516,002|47,157,035|631|

Wall time is **1,847.902ms**, including449.740ms thread assembly; maximum tree
depth4. Component native durations are sums, not additive wall attribution;
follow-ups overlap. Warmup is1,842.991ms/51,464,735 bytes. Both samples pass exact
parity; neither meets500ms/25MB. This is not p95 or a complete-feed result, and
does not justify retiring `counting_numbers`. Conversely it does not isolate a
proof that cached counters alone would solve the full-thread payload cost.

## Required three-column comparison

| Metric | PR#1578 historical24.8 |26.x untreated complete baseline |26.x treated |
|---|---|---|---|
| Complete HTTP |4,702.160ms /3,734,802 rows /286,693,122 bytes, parity PASS/budget FAIL |MISSING |No valid complete response |
| Views native stage |1,114,133 rows /98,542,861 bytes |MISSING; independent raw B diagnostic above |344,064 rows /46,216,238 bytes, independent B cell only |
| Mixed resolution/counts decomposition |208,704 rows /20,137,337 bytes, mixed |MISSING |Not measured |
| Preparation remainder |863,109 rows /75,263,403 bytes |MISSING |Not optimized or separately measured |
| Unclassified remainder |1,458,197 rows /80,219,612 bytes |MISSING |Not optimized or separately measured |

Do not add historical remainders to new stage costs and call the sum a measured
complete response. The original Config F FAIL remains banked.

## Next acceptance gate

Before any separately admitted new lease: drive the complete HTTP composition
with keyword/positional settings, require an actual untreated response before
projection, and exercise generation refresh after materialization across the
counter/metadata/fanout certificates. Fail before measurements if treatment
dispatch is uncertified; never bypass its guard. The bounded candidate-doc
attachment selector and deletion-winning ties must be observed in the actual
measured SQL. Then obtain the missing same-engine baseline, treated K20/paired
responses and mixed-cost decomposition under the unchanged oracle/limits.
No new paid work is authorized by this result or by the remaining overall budget.
