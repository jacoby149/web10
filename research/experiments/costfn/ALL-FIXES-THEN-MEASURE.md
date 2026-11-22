# All fixes first, then one experiment

Jacob Hoffman, 19 November 2026. Governing directive supplied in full in this
workspace's `pasted_text_2026-11-19_05-59-19.txt` attachment. This record captures
the executable contract; the attachment remains the operator's original text.

The goal is a complete response that composes the fixes, not another isolated
cheap stage presented as a cheap feed. Source implementation comes first. No
engine or lease belongs in that phase. Only after all source gates pass may one
fresh DigitalOcean lease restore snapshot 255003176 and verify every treatment
before measuring anything.

## 20 November amendment —layout fix, then new admission

Jacob's “FIX the analytics layout and the clock, then RUN it again” overrides
only the earlier raw-layout fence and four-hour/$2 service clock. D122 makes
platform analytics layout a platform choice, including production intent; no
production deployment is part of this research run. All1.6B events and every
value stay frozen. Documents, fanout, tally, refs and both aggregate layouts
remain unchanged. All four earlier attempts/receipts stay banked.

With API writers stopped and before installing either aggregate/MV, clone the
live event schema (including payload and timestamp precision), create day
partitions retaining `(doc_id,reader_key)`, then rebuild in ONE INSERT SELECT
ordered by `(toDate(seen_at),doc_id,reader_key)`. Never use per-day source inserts.
Preserve full old/new per-day censuses: counts plus all-column tuple cityHash64
and sipHash64 overflow sums and sipHash64 XOR; compare their exact values and
full1.6B totals before atomic exchange. Hash census equality is the operator's
identity check, not a claim of collision-free row-by-row multiset proof. A
mismatch/failure blocks exchange and every dependent consumer; no automatic
replay. Retire the old table only after identity is banked and exchange finishes.
Receipt rebuild rows/bytes read/written, native duration/peak memory and total
setup wall time separately from both censuses and seed work.

Merge the source fix in its own PR, pass all source controls, regenerate source
and row bindings/admission, then create one fresh lease. Bind24h at creation;
both owned timers and service lifetime derive from that same absolute backstop,
never an inherited four-hour timer. The programme has$1,000; receipt SKU/rate,
elapsed compute and storage separately. The new one-statement rebuild is setup
and uses the remaining backstop, not the600s measurement deadline. Existing day
seed statements, parity gates,600s measurements and22GiB envelope are unchanged.
No guardian or automatic extension/replacement/retry. The RUN sequence remains
restore→furniture (including rebuilt events/identity)→ordered hard-stop gates→
composition bank→same-store row-model cell→off-host receipts→verified cleanup.
Report each seed slice's actual native rows/bytes and amplification without a
near-one amplification requirement becoming a gate.

## Treatment

### 21 November measurement-policy reconciliation —source only, D123

The operator admits the existing bounded delivery-deduplication question, not
raw event metrics. Classify by the exact parsed single-table shape:
`SELECT doc_id,max(seen_at) FROM content_events WHERE service=<string> AND reader_key=<string> AND surface=<string> AND event_type='delivery' AND doc_id IN (<nonempty string list>) GROUP BY doc_id`.
The conjunction may be parenthesized/reordered; no additional predicate, selected
column, aggregate, join, subquery, HAVING or extra clause is admitted. Count,
reach, sum and per-day raw metric reads remain denied. A digest allowlist is not
the classifier, since future reader/service/candidate literals change hashes.

The inventory names this exact read `delivery_dedup_raw_read` and preserves every
native row/byte/millisecond in additive captured totals, alongside its original
captured stage. Projection/ad-inventory/digest/duplicate checks remain intact.
Replay both banked digests and the complete410-statement captured set offline,
requiring the same totals. Production API, gates/budgets/oracle and row bridge
are untouched. Attempt6's original INCOMPLETE decomposition/blocked row outcome
and all evidence remain immutable. This is no lease/native/fresh admission;
the next run requires the separate reviewed merge and Jacob's word.

### Latest execution —batched backfill passes, audit remains open

Jacob explicitly admits one fresh post-PR#1603 run in this session. Exact merged
source passes full489-batch/2,000,001-document all-time construction and1.6B
reconciliation, with all four formal gates PASS. Complete response parity passes
in uniform K20/paired P/F; budgets FAIL. The statement audit rejects raw delivery
deduplication's max(seen_at) read, leaving decomposition INCOMPLETE and the row
bridge blocked. Original outcomes and failed guard are preserved; the diagnostic
query CSV is not a replacement PASS. Owned cleanup is verified, snapshot retained
and this admission closed. [Native results and scope accounting](evidence/all-fixes-batched-20261120/RESULTS.md).

### 20 November repair —bounded all-time historical backfill

The layout attempt on merged PR#1602 completes the old/new event censuses and
all319 daily slices, reconciling exactly1.6B events. Its subsequent single
all-time MergeState statement fails natively241 at22GiB; composition and row
measurements remain blocked. That failure is preserved, never replayed into PASS.

Jacob requests a source repair: derive all-time from the completed daily states
in sequential, non-overlapping document-key ranges. Bound each range to4096
distinct document IDs using a4097-key ordered lookahead; retain every service,
event type and day for each owned document. Record each inventory and INSERT's
original native ID, memory and read/write actuals. Retain countMergeState and
uniqExactMergeState, then require the full1.6B reconciliation and both existing
raw-oracle parity gates. Neither daily reach summation nor a second raw seed is
allowed. Both live raw-insert MVs, schemas/layouts and600s/22GiB limits stay
unchanged. One unusually large document can still exceed memory; batching is
not a native fit guarantee. A failed batch stops dependent work without retry,
and an existing partial build cannot be resumed or overwritten implicitly.
This repair does not admit another paid lease or reopen the stopped attempt.

1. A generic derived pairs satellite indexes every governing `ref_value` and
   finer body target. It carries document identity, ref identity, author payload
   and role-as-data (`root`/`target`), sorted by `(ref_id, doc_id)`. Exactly one
   governing root controls scope. Historical edges may propose candidates; only
   current canonical winners, tombstones, attachments and policy decide access.
   No reverse layout. No new authority. Retire `ref_sorted` in this composition,
   not in old source or receipts. The previous mandatory-projection rule is
   superseded for this treatment.
2. Static billboard ads are documents; placement is a versioned pin document
   with the post as root and the ad as target. Author pins always win. Otherwise
   a seeded setup-time roll against the recorded node ratio chooses whether to
   pin a node ad; round robin selects from the collection. Never repick on read,
   mine readers, or scan history for ad inventory. Setup records each page
   post's exact author-pin/node-pin/none identity for an independent oracle.
3. Complete responses actually query `content_events_aggregated`, merging exact
   impression/reach states across dates and inserts. No arithmetic substitution.
   Raw events remain the independent verification oracle outside measurement.

Carry D114 tally recipes/scope fences and Config F delivery forward unchanged.
Setup builds satellite/tallies/aggregate on the migrated disposable store.
Production write maintenance and post-time ad placement are NOT implemented.

## Pre-measurement gate

Every requirement is mandatory; any failure blocks all measurement:

- Exact full ref-set census against an independent oracle, including multi-ref
  documents, pins and the fat fixture's complete engagement universe.
- Existing tally page/fat/store-sample checks plus all 20 ACTUAL paired oracle
  roots explicitly in all five verification domains. No zero-filled omission.
  Publish this paired-tally verdict separately.
- Exact page impressions/reach parity on the actual store.
- Exact expected ad identity per page post from immutable setup records, checked
  independently of serving. Publish the ads verdict separately.

Then measure uniform K20 and paired P/F complete responses, warmup + measured,
in the same captured-query accounting scope as PRs #1590/#1591. Preserve and
report auxiliary request-tagged work separately. Decompose every stage, naming
each formerly unclassified query by identity, SQL/source and actual native cost.
Do not optimize those remainders in this task.

## Banked evidence and claim limits — canonical report links

Dataset identity remains `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
The reports own counts, timings, byte scopes and their original verdicts:

- [Untreated modern baseline and migration prerequisites](evidence/engagement-completion-20261118/RESULTS.md).
- [Treated complete responses, standalone counts and old inventory statement](evidence/engagement-finish-20261118/RESULTS.md).
- [Ordinary tally observations, fat/sample verification and OPEN paired-domain audit](evidence/engagement-tally-20261119/RESULTS.md).
- [Independent raw/aggregate views and lossless migration evidence](evidence/engagement26-20261118/RESULTS.md).

Do not remeasure baseline/B/D timings or reinterpret their numerical scopes.
D114 full acceptance is OPEN until actual paired roots pass the repaired gate.
The retired inventory statement's identity remains
`4bc916c85c420f45a56d98424274efe1f83483092363c8c9fdae1194c24765f6`;
neither it nor an equivalent read-time inventory scan may execute in a measured sequence.

All old Config F/#1590/#1591 budget FAILs stand. The expected aggregate views,
unclassified work (~52MB) and preparation remainder may still exceed 25MB.
Composition parity is not budget acceptance. No p95, capacity, population
backfill, R+W, candidate-to-canonical revision, §8 or production claim.
Aggregate TTL reconciliation remains a separate production gate.

## Execution

ClickHouse 26.10.4.207; 32GiB host / 28GiB container / 22GiB engine. Approved
Intel substitution applies if AMD is unavailable in nyc3; record hardware and
treat cross-SKU latency comparisons as indicative. No row-count stops. Native
measurement statements have 600s bounds; timeout/partial actuals are results,
not whole-run aborts. No fixed client abandonment; poll original completion.
500ms/25MB are success lines, never abort limits. Retired $40 programme ceiling
does not return. Receipt each lease's cost. Agent ~300s supervision and host
self-kill timers only; no independent guardian. No local engine execution.
Preserve failed attempts, source bindings, native receipts and cleanup.

## Day-sliced/two-grain contract —attempt four admission closed

Latest receipt: [partial run](evidence/all-fixes-two-grain-20261120/RESULTS.md).
The original service bound stops the controller after293 acknowledged/294 native
successful day slices. Partial observed logical counts match their raw prefix,
not the full1.6B population; all-time derivation, formal parity and timing are
unrun. Native read amplification is not a gate failure. Owned cleanup verified,
snapshot retained, no automatic extension/retry. The contract below remains the
target, not a fresh paid grant or proof that complete seeding passed.

**Subsequent two-grain amendment:** retain the day table for analytics; add
`content_events_aggregated_all_time` without day for feed reads. Both materialized
views consume raw platform inserts directly. With writers stopped, install both
DDLs/MVs, seed day slices, then derive all-time only from the seeded day table
using countMergeState/uniqExactMergeState. This order cannot double seed all-time
through a chained MV. Initial derivation groups the complete doc/event/service
key; later insert states remain correctly mergeable rather than a promise of
one physical row during live merges. The feed uses the coarse table; both grains
must independently match the raw oracle on the actual pages before measurement.
The build receipt records all-time source/table row count and exact event total.

Jacob19 November directs a seed-execution-only repair, then a fresh unchanged
all-fixes→row-model run after the separate fix merges. The composed entry installs
DDL then MV with API writers stopped, plans every day explicitly (optional
preplanned doc_id hash buckets), and uses the original STATES select plus only
the slice predicate. Day and doc_id belong to the group key; no group is split.
Every slice has original native memory/I/O receipts and no implicit retry/reseed.
Final per-day countMerge impressions must equal the frozen census/1.6B events;
the existing raw-versus-aggregate views parity gate still follows before timing.

**Operator-confirmed accounting clarification:** retain the source layout and
separate exact once-only matched-event reconciliation from actual native scan
rows/bytes, including repeated granule reads. Day predicates on the doc/reader-
first unpartitioned source cannot promise a single physical pass or131GB total.
Receipt inventory/reconciliation/observation work separately. All old attempts,
native241 partial actuals, paired proof and FAILs stay banked unchanged. No lease
is bound merely by this source preparation; no automatic partial-slice replay.

## Latest banked attempt —stdin fixed

PR#1597/source55b68ef7f clears the large native billboard INSERT. On fresh
DO621423661, completed tally checks natively cover all20 actual paired roots in
all five domains with exact values; off-host SQL/native audit banks that proof.
The aggregate seed then stops241 at22GiB before the formal composition gates.
Their BLOCKED statuses remain unchanged; no feed/row measurements or automatic
retry. Owned cleanup verified, snapshot retained, admission closed. [Failure, qualified paired proof, bindings and cost](evidence/all-fixes-stdin-20261119/RESULTS.md).

## Earlier admitted rerun —19 November2026

After separate restore fix PR#1595 merged, fresh DO621414125 on exact source
2749c1037 passes row readiness, restore, read setup and migration. Billboard
fixture setup then stops before native submission because its185,447-byte SQL
is carried in one process argument. No parity gate/measurement/row worker runs;
D114 paired remains OPEN and D117 pending. Receipts verified off-host before
owned cleanup, snapshot retained, admission consumed/closed, no automatic retry.
Fix/binding/new-attempt cost/failure: [rerun report](evidence/all-fixes-row-model-rerun-20261119/RESULTS.md).
The first attempt's banked evidence remains unchanged.

## First admitted attempt —19 November2026

The merged-source composed entry was executed on DO621405771 with row readiness
verified before restore. Restore stopped at the snapshot's existing input path;
all required prechecks and measured cells were blocked. The row-model bridge
refused unbanked composition results. No paired-tally acceptance, new performance
result or assembly verdict follows. Owned cleanup is verified, snapshot retained,
and the one-lease admission is consumed/closed. Failure, source, off-host receipts
and cost: [RESULTS.md](evidence/all-fixes-row-model-20261119/RESULTS.md).

## Historical cancellation and source-preparation state

Jacob explicitly cancelled the previous coverage-repair lease in this session.
DO621021141 and its owned auxiliary resources are deleted; provider cleanup
verified 19 November 11:02:55.431 UTC, before 14:36:09 UTC. Latest verified
off-host checkpoint: `finish-checkpoint-20261119T105345Z.tar.gz`, 1,896,739 bytes,
SHA256 `1d7d3cce0743456695c6bb535e5d15f5f53ab56d2c6b0955827ef8e8ff6fc135`.
Direct SSH timed out during cancellation, so no final native result or final
checkpoint is claimed. Private cancellation and lease receipts remain in the
original controller state directory. No reuse, replacement host or extension.

Phase 1 is in progress. Jacob's subsequent clarification requires row-model
SOURCE preparation too, before spending on either proving run. Its measurement
still follows all-fixes banking. No combined lease is bound or automatically
launched by passing source controls. The cancellation does not close the paired
tally gate. Canonical JSON is retained for proof/current compatibility, not as
the destination or a permanent hybrid design; see `ROW-MODEL-QUEUED.md`.
