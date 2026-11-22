# Completion lease: baseline banked; treated reads stop at the native row guard

The missing **untreated26.x complete baseline is now measured with exact parity**.
The four harness repairs are exercised on the admitted store. The intended
projection/uniform reads then hit the unchanged native row guard; they do not
produce complete responses. This is **not another uncertified fallback**, and
it is not a complete-feed PASS. The requested treated totals/parity remain
unavailable under the closed design and limits.

Receipts: [`results.json`](results.json) and content-free per-query actuals in
[`native-query-costs.csv`](native-query-costs.csv). Raw SQL, failed requests,
source manifests and stopped native parts remain in verified private archives.

## What changed, and what did not

- Actual F/engagement/P/observer wrappers pass settings by keyword; the HTTP
  composition control checks every boundary. Ordinary API/SDK/social unchanged.
- A failed baseline stops its executing controller before projection. The first
  attempt does stop, with every later stage BLOCKED. No failed receipt is rewritten.
- That failure exposes the remaining generation-encoding defect: CLI JSON uses
  UInt64 integers (`fe9d1909…`); serving explicitly hashes decimal strings
  (`8e24648e…`) for the **same parts**. A separately source-bound prepared
  continuation normalizes metadata encoding and byte-proves/rebinds certificates.
  It does not restore again, rebuild counters or relabel the failed attempt.
- Long setup operations are submitted once and awaited by exact native
  QueryFinish polling. Source projection:315.119s wall/313.820s native;
  copy projection:199.122s wall/197.423s native. Each has one submission receipt,
  QueryFinish/zero exception and88,200,363/88,200,363 projection rows.
- The26.x default344 question stays banked: rebuild mode is selected directly,
  without re-probing. Original canonical base bytes/schema/row totals remain
  identical across rebinding. Counter scope keys are preserved, not rewritten.

Jacob explicitly allowed **one initial ordinary K20 count setup**, including its
presence scope, because snapshot255003176 certifies only paired-fixture scopes.
That setup passes. Paired scopes/metadata are adopted, not rebuilt; no counter
build occurs after materialization. Stage B/D are not repeated; no aggregate or
hot fixture is seeded. Complete requests still include raw views; the banked B
aggregate is neither reseeded nor substituted arithmetically into new totals.

## One lease and one store

- DO620548967,18 November05:42:45→09:42:45UTC. No replacement or extension.
-26.10.4.207,32GiB host/28GiB container/22GiB server; ten-second measured
  native queries and10M rows unchanged. Agent checks/self-kill only; no guardian.
- Snapshot255003176 restore/verification72.091s, excluding provisioning:
 88,200,363 documents including existing fixtures;1,600,000,000 events.
  Existing fixture coverage includes both collision authors/shared route/mixed lane.
- Two provider-readiness timeouts remain preserved on the same lease.

## The valid untreated baseline

| Complete ordinary K20 | Warmup | Measured |
|---|---:|---:|
| HTTP wall time, ms |5,534.866|4,551.675|
| Native rows |4,157,101|3,244,874|
| Native logical bytes |260,155,392|222,387,685|
| Exact returned-response parity |PASS|PASS|
|500ms/25MB budget |FAIL|FAIL|

The measured HTTP requests finish at06:27:27.943749UTC. Projection materialization
starts06:28:41.691645UTC, only after baseline success/banking. The continuation
also verifies zero document projections before its baseline attempt.
One measured sequence after one warmup is not p95 or a capacity verdict.

## Treated gates: real partial work, not complete samples or engine estimates

| Cell | Failing stage | Native actual rows | Native actual bytes | Native ms | Engine-reported selection at guard |
|---|---|---:|---:|---:|---|
| A: projection, old semantics |Mixed resolution/counts|770,048|50,803,827|215|88.64M rows|
| C: uniform ordinary K20 |Mixed resolution/counts|1,359,872|94,724,839|446|70.65M rows|
| C: paired P |Preparation|229,376|21,275,333|39|88.36M rows|
| C: paired F |Preparation|229,376|21,275,333|39|88.36M rows|

All stop with158 against the unchanged10M-row setting. The selection figures
in the last column are **not rows actually scanned**. The actual native counters
are retained separately—even the K20 exception records labelled
ExceptionBeforeStart contain completed subquery work. These are partial-query
costs, not response totals or sub500ms complete-response wins.

Unlike the prior lease, certification is current. Projection rebinding moves
`8e24648e…`→`df674a92…` under the same canonical-content hash. Actual query-log SQL
matches all four bounded attachment statements, with candidate-doc scoping and
deletion-winning timestamp ties. Their native projection lists include the
appropriate `documents.ref_sorted` or `engagement_documents.ref_sorted`.
No cached-counter/canonical-fallback path is substituted.

The paired main statements themselves finish natively under their declared P/F
dispatch; **preparation then fails**. That remains a separate, explicitly
unoptimized stage—not proof that paired whole-response parity or engagement
performance passed. No preparation redesign or row-limit relaxation was attempted.

The fresh migrated copy passes all nine zero checks,32/32 exact inverse-multiset
batches and equal projection coverage. This satisfies the current-copy gates;
it does not re-open the banked design proof or manufacture returned-response parity.

## Mixed-count decomposition: a real partial list, not an empty PASS

Original executed component receipts are recovered from the native query log,
**without replaying SQL**. Three untreated cached-count components finish; each
reads1,344 rows/90,048 bytes, with30/18/17 native ms and zero returned groups.
Their scope construction and the complete baseline's parity remain checked.
The next projection/direct-reaction component stops158 after425,984 actual
rows/36,496,054 bytes/171ms. The exact four identities/hashes/native records are
in `results.json`.

The controller's decomposition stage is therefore STOP, not full decomposition
PASS. These standalone diagnostic costs are non-additive; do not subtract them
from mixed native work to invent per-table resolution cost. The three successful
component results are banked even though a later component failed.

## Required three-column comparison — measured actuals only

| Metric |PR#1578 historical24.8|26.x untreated baseline|26.x treated |
|---|---|---|---|
| Complete HTTP |4,702.160ms /3,734,802 rows /286,693,122 bytes|4,551.675ms /3,244,874 rows /222,387,685 bytes|A/C STOP; no complete sample |
| Mixed resolution/counts |208,704 rows /20,137,337 bytes|196,608 rows /16,594,275 bytes|Partial native stops above, not stage totals |
| Views |1,114,133 rows /98,542,861 bytes|1,474,978 rows /98,624,346 bytes|No complete sequence; banked B not substituted |
| Preparation remainder |863,109 rows /75,263,403 bytes|509,701 rows /44,557,339 bytes|Paired preparation STOP; not optimized |
| Unclassified remainder |1,458,197 rows /80,219,612 bytes|974,848 rows /52,096,217 bytes|No complete sequence; not optimized |

The JSON comparison includes every current baseline stage, including explicitly
classified metadata/envelope queries. Historical instrumentation/classification
and physical engines differ; these columns are observations, not a causal engine
speedup claim. No historical remainder is added to a new stage cost and presented
as a measured response. The original Config F FAIL remains banked.

## Preservation, cleanup and remaining boundary

Final private checkpoint4,200,186 bytes/SHA`bffc0bfa…445166` and stopped native
archive2,984,123 bytes/SHA`50ef0a63…347ea1` verify off-host before provider cleanup.
Every stopped query/source/codec failure and the metadata-only retrieval syntax
error remain preserved. No OOM or engine restart after final collection.

Owned droplet/firewall/SSH-key cleanup verifies **06:59:08UTC**, before09:42:45.
Elapsed compute estimate **$0.31827**, not invoice; retained snapshot storage is
separate. Temporary key material/cloud-init secret file are removed. Retained
snapshot/volume and production are untouched.

The remaining blocker is native read selection/cost, plus the separately failing
preparation stage—not stale certification or baseline ordering. Changing query
design, preparation, layouts, native caps or running another paid attempt is
outside this closed task and requires an operator decision/new admission.
