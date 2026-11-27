# Access-Control Cost Function Experiment

## Governing scheduling and handoff — 24 November 2026

Jacob's task directive replaces the older scheduling and handoff rules for
future costfn execution. One explicit admission covers the task, not each
repair, attempt, or affected measurement restart. Commit source fixes as they
are made and retain the starting and ending revisions plus the reason for
each repair. No new admission, binding, or pull request is needed inside the
task. The droplet's **24-hour poweroff timer is a failsafe, not a work deadline**;
it does not release the provider resource or guarantee billing stops. The agent
still verifies custody and deletes owned temporary resources at task end.

Keep the validated slice, seeds, fixtures and prepared store on the owned host.
Check the existing slice manifest, canonical generation fingerprint and native
receipts before reuse. Repair or rebuild only invalid work. An uncertain insert
is not evidence that nothing ran; resolve its exact original native ID before
replaying it. Repair setup defects in the same task. If a repair changes what
the arm measures, preserve the old attempt and restart that measurement only.
An exact ordered response divergence against the independent oracle stops the
task and publishes no comparison costs.

Use task-mode admissions (`costfn_run_rules` and `costfn_task_id`), not older
work-window packets. For RD4 step 2 see the [fixed-slice run contract](HYBRID-K20-PREFLIGHT.md).
The 18 November statement-level measurement policy still applies. Keep rows,
logical read bytes, largest individual statement memory, summed native duration
(not CPU time) and complete HTTP wall time distinct. The original snapshot
`255003176` remains retained. Verify private archives by SHA-256 before cleanup;
report estimated compute separately from storage and the invoice.

## Sustained-DAU load test — preflight refused, no sizing or load result

The [sustained-DAU load test contract](DAU-SUSTAINED-LOAD.md) defines the
right-sized receipt against the realism contract's load (15 reads/s peak,
2.9 reads/s average) on the frozen million-author store, on a DigitalOcean
host at the derived budget requirement (16 cores / 32 threads / 32 GB RAM,
dedicated-CPU class or closest, storage proven non-binding in calibration),
under mixed load, with the clog criterion as
the primary gate, exact ordered oracle gates, pre-declared stop criteria and
a breaking-point clause. The gate is on the slope of the debt-carrying
quantities, not their level: start/end/slope banked per window, all flat or
shrinking at the contract peak is the strong claim, a sustained positive
slope names the debt and banks time-to-bind, and the drain must empty. The paper's claim is the derived budget plus the
software proof, not a server model; production hardware (R630) is an ops
matter, out of scope.
The [banked preflight receipt](evidence/dau-sustain-20261127/RESULTS.md)
records a verified Parquet restore and native reader-authority census on the
closest c-16 host. One principal could read all 21 requested groups, not the
150 distinct readers the contract requires. Calibration and sustained windows
did not run. This receipt does not replace the full-store hybrid arm or Study L.

## D117 row-model proving cell — complete; maximal model rejected

Merged #1620 completed the full post-family load, independent parity, and six
assembly comparisons. All six crossed D117's pre-committed cost threshold;
retain queryable values as rows and payload as document content. No production
change or new admission. [Results and original receipt custody](evidence/row-model-4096-20261123/RESULTS.md).

The [hybrid K20 preflight](HYBRID-K20-PREFLIGHT.md) reproduces the no-engine
fixture and plans a three-arm native comparison before a full retained-design
cell. It separates modeled bytes, native logical bytes, and R630 physical I/O.

The [full-store hybrid contract](FULL-STORE-HYBRID.md) is **executed and
banked**: the hybrid on the full frozen store at the declared post-merge
steady state measured 92,998,217 captured logical bytes/read (two frozen
uniform K20 samples, exact ordered parity both trials), replacing the
ratio-arithmetic row; the measured steady-state ratio against the cited
banked indexed baseline (123,119,689 bytes, PR #1618) is 0.7553, while the
slice's −70.6% remains the transient pre-merge regime reference. The disk-
demand line is settled; six-case, supply and production remain separate.
[Results](evidence/full-store-hybrid-20261126/RESULTS.md).

## Skinny type-aware pin lookup —native same-store result

On the same frozen store, measured uniform reads fall from 8.85GB to 123.1MB
with exact parity and the original authorized creative SQL. The two pin reads
total 56,681 bytes. The operator stopped the unrelated full typed build at
2,104,576 of 4,000,675 identities; no typed comparisons ran. No added lease,
platform/API change or production proof. [Contract](PIN-INDEX.md) ·
[Native results and cleanup](evidence/skinny-pin-20261122/RESULTS.md).

## Workstream B —skinny pin selection, then exact materialization

The uniform research reader now resolves complete historical ref candidates with
named skinny canonical columns, then reads bodies only for exact current pin
survivors. Both statements recheck current winners/service/root/deletion; the
second retains SQL post_author omission and all D124 validation before the
unchanged authorized creative fetch. No cache, truncation or new layout.
`pin_selection` and `pin_materialization` have separate captured native costs.
[Source contract and controls](PIN-SELECT-MATERIALIZE.md). Native acceptance is
pending; the operator explicitly requests B→green checks→merge→one experiment
with five-minute monitoring. This supersedes the earlier row-first restriction
for this fresh combined run, not any historical receipt or resource limit.

## Workstream A —D124 semantics amendment, source only

The isolated pin reader/oracle/ads gate now permit agreeing full-creative pins
per post, with author precedence among agreeing placements. Distinct targets
still refuse; all eligible pins validate before coalescing. Existing canonical
winner/eligibility/creative authority and zero-pin omission remain unchanged.
This is a deliberate behaviour change, not a parity-preserving optimization.
[Amendment, controls and unchanged banked fixtures](PIN-AGREEMENT-AMENDMENT.md).
Workstream A merged separately as PR#1608. Its source change alone granted no
lease/native admission; the subsequent B/run direction is recorded above.

## Source work —row receipt repair; uniform pin-discovery inventory

The row driver now routes each requested ID through the pinned client's
recognized per-call query_id parameter, never transport headers. Insert metadata
and observation calls have distinct true auxiliary IDs; data receipts remain
exact-ID/submit-once, with unchanged native limits and treatment guards. Eleven
new controls use real1.6.0 request planning/insert-context generation and a fake
server keyed by wire identity. They reproduce the old routing failure, prove
query/command/insert and collection, and deny proven mismatches without imposing
a client abandonment cap. Source repair only; attempt7 remains stopped as banked.

The parallel [uniform consumer inventory](UNIFORM-PREPARATION-INVENTORY.md)
finds that the10GB statement is canonical billboard-pin discovery **after** page
selection. Four body-derived inputs and duplicate/malformed-pin refusals are not
answerable from current satellites. Inventory is complete; uniform reorder is
NOT IMPLEMENTED pending the documented typed-model/bounded-input fork. Three
no-engine controls pin the source facts/refusals, not an optimization result.
No cache or paired/gate/audit/oracle change. Uniform measurement remains behind
the row-model run. No lease/native run/admission is granted by either source task.

## Latest run —22 November: native composition/audit PASS, row receipt-ID STOP

Fresh post-PR#1605 DO622092911 on merged52233c8b9 completes construction,
all four gates, all three exact-parity/budget-FAIL response cells and the real
D123 statement inventory with410 captured/78 auxiliary operations. The unchanged
row bridge accepts that banked composition and launches the worker. Row setup
then hangs on receipt IDs:39 client-complete requests have zero matching native
IDs, while57 correlated server UUIDs finish. The pinned driver's query_id
transport option is an ordinary HTTP header, not server query identity.
The agent verifies no active row-data work, preserves the original RUNNING
worker packet and records a separate supervised STOP; no full-family build or
assembly result is banked. [Original results, query CSVs and diagnostic proof](evidence/all-fixes-reconciled-20261122/RESULTS.md).
State/native parts verify off-host before owned cleanup, snapshot retained,
admission closed. No source repair, native retry or new paid continuation.

## Source-only audit reconciliation —21 November, D123

Future audits admit only the exact parsed bounded delivery-history lookup as
`delivery_dedup_raw_read`, retaining all native rows/bytes/duration and the prior
captured stage. Raw metric fallbacks and every retired-query/digest/identity
check remain denied. Seventeen new no-engine controls replay both banked digests
and the complete410-statement captured set with identical additive totals.
This does not promote attempt6's failed decomposition or run the row-model cell.
Production API/gates/budgets/oracle/row bridge are unchanged. Merge this source
reconciliation before Jacob's separate fresh admission; no lease/native action
is authorized here. [Exact policy](ALL-FIXES-THEN-MEASURE.md#21-november-measurement-policy-reconciliation-source-only-d123).

## Earlier run —full batch proof PASS, responses parity PASS, audit STOP

Jacob's fresh post-PR#1603 attempt on DO621754971 passes all489 all-time batches,
2,000,001 document IDs and exact1.6B reconciliation, with565,711,161-byte peak
batch query memory. All four formal gates pass; uniform K20/paired P/F complete
warmup+measured responses have exact parity and budget FAIL. Statement auditing
then rejects the raw delivery-history max(seen_at) read, so decomposition stays
INCOMPLETE and row-model measurements do not run. This is not treatment-wide
acceptance. [Original outcomes, native costs and diagnostic query CSV](evidence/all-fixes-batched-20261120/RESULTS.md).
Receipts/native parts verify off-host before owned cleanup; original snapshot
retained, admission consumed/closed. No automatic retry or paid continuation.

## Earlier attempt —layout/day PASS, all-time241

PR#1602's admitted attempt is now closed. The full event rebuild and all319 day
slices reconcile1.6B events, but all-time MergeState derivation fails at22GiB.
No formal composition or row-model measurements run. Receipts are verified
off-host; owned cleanup is verified and the original snapshot retained.
[Native results, failure and custody](evidence/all-fixes-layout-20261120/RESULTS.md).
The operator requests bounded document-key backfill; that repair is source-only,
not permission to reuse the stopped host or start a new paid lease.

## Consumed admission —20 November analytics layout and clock repair

Jacob explicitly admits one fresh all-fixes→row-model attempt after a separate
layout/clock fix merges and exact-source controls/bindings pass. D122 lifts only
the raw analytics physical-layout fence: same complete1.6B event values, one
sorted rebuild into day partitions, old/new all-column per-day hash/count census
before atomic exchange. All other measured layouts/gates stay frozen. The owned
self-kill backstop is24 hours, not four; the programme has$1,000 and per-run
compute costs remain receipted. This supersedes older four-hour/$2 clock shapes
for this explicitly bound composition only; it never reopens an old lease.
The new rebuild is setup, not a600s measurement; it may use the remaining24h
backstop with existing22GiB/spill limits. Existing day slices and measured
statements retain600s. Full contract: [all fixes](ALL-FIXES-THEN-MEASURE.md).

## Earlier banked attempt —two grains/day slices, PARTIAL at service bound

Merged day-seed/all-time source8402cd5fe executes on original-window DO621488571.
Of319 slices,293 are controller-PASS and294 native-finished, with exact observed
partial1,165,394,847 event states; full1.6B reconciliation/all-time derivation and
formal parity/measurement stages never run. Peak observed memory2.69GiB fits;
470.4B rows/17.728TB native logical bytes are reported scan amplification, not a
failure gate. Service guard07:38:51UTC stops the controller. Receipts preserved,
owned resources deleted/snapshot retained before deadline, admission closed.
[Full accounting/319-slice CSV/bindings](evidence/all-fixes-two-grain-20261120/RESULTS.md).
All-time diagnostic label repair is source-only after this run, not redeployed.

## Earlier attempt —19 November directive, stdin fixed

Merged PR#1597/source55b68ef7f runs on fresh DO621423661: exact large billboard
stdin transport passes, and completed native tally checks now cover all20 actual
paired roots in all five domains with exact values (audited off-host against SQL
hashes/native finishes). That closes the old missing-domain proof gap, not the
composition. Aggregate seeding stops241 at22GiB; formal gates, all compositions,
decomposition and row worker are BLOCKED. Receipts are preserved, owned cleanup
verified, snapshot retained, admission closed/no retry. [Qualified results and bindings](evidence/all-fixes-stdin-20261119/RESULTS.md).

## Earlier rerun —19 November2026, restore fixed

Separate path-only fix PR#1595 merged before fresh DO621414125 ran exact source
2749c1037. Restore/read setup/migration pass. Billboard fixture setup then stops
at OS argv-size handling before native submission; all required parity gates,
compositions, decomposition and row worker remain blocked. D114 paired OPEN,
D117 pending. New receipts verified off-host before owned cleanup, snapshot
retained, admission consumed/closed; no automatic retry. Fix/tests, regenerated
binding and new-attempt-only cost/cleanup: [rerun report](evidence/all-fixes-row-model-rerun-20261119/RESULTS.md).
The first attempt's evidence is unchanged.

## First attempt —19 November2026

The explicitly admitted one-lease composed entry on merged dev1c903afb8 stopped
during restore at the existing `/opt/fanout/input` symlink collision, before any
parity gate or measurement. Row-source readiness passed before restore; the
row-model worker was blocked on unbanked composition results. D114 paired
acceptance remains OPEN; D117 assembly remains pending. Owned DO621405771 and
auxiliary resources are verified deleted, snapshot255003176 retained. Admission
is consumed/closed, no automatic retry. Exact failure/cost/custody/cleanup:
[attempt report](evidence/all-fixes-row-model-20261119/RESULTS.md).

## Directive precedence index

**As of 23 November 2026.** This index owns precedence, not design definitions
or measured values. The [decision ledger](../../../knowledge-base/strategy/decisions.md)
owns D115/D116/D118 DECIDED, D117 MEASURED, D119 DIRECTION and D120 PRINCIPLE. Evidence
reports own numerical facts. Current implementation is still documented in the
[v3 schema](../../../knowledge-base/web10-v3/db/clickhouse.md); source machinery
and a chosen direction are not native acceptance or production replacement.

Read operative documents together: source preparation includes the row model
BEFORE spending; all-fixes measurements bank BEFORE row-model assembly. This
index grants no lease, retry, extension, local engine execution or rollout.
Historical documents stay intact; a successor applies prospectively, not as a
retroactive waiver of failed or missing gates.

| Directive/document | Status and controlling successor or record |
|---|---|
|20 November layout/clock amendment above; D122 | **Operative for the newly admitted composition→row cell** — analytics layout mutable, logical events frozen,24h self-kill; supersedes prior raw-layout/four-hour fences only |
| `README.md`, Governing execution directive below | **Operative** — current execution policy; overrides older row/deadline/client/byte aborts, not receipts |
| [ALL-FIXES-THEN-MEASURE.md](ALL-FIXES-THEN-MEASURE.md) | **Operative contract** — composed read treatment and prechecks; measured attempts are in the evidence reports |
| [ROW-MODEL-QUEUED.md](ROW-MODEL-QUEUED.md) | **Executed** — original proving contract; D117 exact parity, maximal assembly rejected |
| [ROW-MODEL-RUN.md](ROW-MODEL-RUN.md) | **Runbook and attempt lineage** — explicit host/window/source binding; completed result reported separately |
| [task-block-engagement-ref-redesign.md](task-block-engagement-ref-redesign.md) | **Superseded for new treatment/run selection by ALL-FIXES-THEN-MEASURE** — retains earlier admissions, closed attempts and receipt pointers |
| [task-block-fanout-arm.md](task-block-fanout-arm.md) | **Executed and banked, qualified Config F history** — later complete-read work proceeds through ALL-FIXES-THEN-MEASURE; unearned F capacity/write gates remain OPEN |
| [ARM-F-DESIGN-CLOSURE.md](ARM-F-DESIGN-CLOSURE.md) | **Executed and banked, partial/stopped research attempts** — no whole-F acceptance; current composed-read successor is ALL-FIXES-THEN-MEASURE |
| [ARM-SATELLITE.md](ARM-SATELLITE.md) | **Executed and banked, qualified Config P attempts** — programme successor task-block-fanout-arm, then ALL-FIXES-THEN-MEASURE; not permission to restart |
| [ARM-T.md](ARM-T.md) | **Executed and banked, failed setup** — later programme task-block-fanout-arm/ALL-FIXES-THEN-MEASURE does not turn Arm T into a PASS |
| [ARM-D-REALISM.md](ARM-D-REALISM.md) | **Superseded for current programme selection by ARM-SATELLITE/task-block-fanout-arm** — historical arm contract/results retained |
| [ARM-D-ATTACHMENT-REPAIR.md](ARM-D-ATTACHMENT-REPAIR.md) | **Superseded for current programme selection by ARM-SATELLITE/task-block-fanout-arm** — retained repair contract, not a newly admitted run |
| [PLAN.md](PLAN.md) | **Superseded by REALISM-RERUN-PLAN for realism inputs, then ALL-FIXES-THEN-MEASURE for the current read composition** — historical K20-first plan retained |
| [PROTOCOL.md](PROTOCOL.md) | **Executed and banked historical protocol/results** — old treatment/abort choices are superseded by ALL-FIXES-THEN-MEASURE and current execution policy |
| [STUDY.md](STUDY.md) | **Superseded by PLAN, then REALISM-RERUN-PLAN** — old industrial-track/VU matrix is not current paper strategy or run admission |
| [DESIGN-REVIEW.md](DESIGN-REVIEW.md) | **Superseded by PLAN/REALISM-RERUN-PLAN for programme planning** — historical review, not current acceptance |
| [READYING.md](READYING.md) | **Superseded by PLAN/REALISM-RERUN-PLAN** — old primary matrix is not an alternative launch route |
| [RUNBOOK.md](RUNBOOK.md) | **Superseded for current runs by ALL-FIXES-THEN-MEASURE/ROW-MODEL-RUN** — earlier commands remain historical |
| [RUNNING-V2.md](RUNNING-V2.md), [DATASET.md](DATASET.md) | **Superseded by REALISM-DATASET and REALISM-DATASET-DECISIONS** — frozen V2 records preserved |
| [REALISM-DATASET-DECISIONS.md](REALISM-DATASET-DECISIONS.md) | **Executed and banked input decisions** — canonical realism lineage; does not authorize rebuilding validated inputs |
| [REALISM-DATASET.md](REALISM-DATASET.md) | **Executed and banked build/validation contract** — current experiment input comes from the retained verified snapshot/archive |
| [REALISM-RERUN-PLAN.md](REALISM-RERUN-PLAN.md) | **Executed and banked input/early-run history** — new treatment selection is superseded by ALL-FIXES-THEN-MEASURE |
| [REALISM-CLICKHOUSE.md](REALISM-CLICKHOUSE.md) | **Operative validation contract, executed validation banked** — validator engine/frame is distinct from the measurement engine; no validation rerun admitted here |
| [REALISM-CHECKPOINTS.md](REALISM-CHECKPOINTS.md) | **Operative validation-resume contract** — not an experiment resubmission or new-host grant |
| [REALISM-RECOVERY.md](REALISM-RECOVERY.md) | **Operative preparation-persistence contract** — preparation only, not a new experiment-checkpoint framework; old execution windows remain historical |
| [REALISM-STORAGE.md](REALISM-STORAGE.md) | **Operative frozen-input storage/custody contract** — no new object writes or paid storage implied |
| [REALISM-CLOUD-PREP.md](REALISM-CLOUD-PREP.md) | **Executed and banked preparation history** — old host admission consumed; current runs require their own explicit binding |
| [REALISM-SMOKE.md](REALISM-SMOKE.md) | **Executed and banked connected untreated diagnostic, STOP** — its main requests did not complete; no current lease or performance acceptance |
| [K100-RESULTS.md](K100-RESULTS.md), [K1000-RESULTS.md](K1000-RESULTS.md), [SIXTH-DRAFT-RESULTS.md](SIXTH-DRAFT-RESULTS.md) | **Executed and banked reports** — immutable evidence, never a new directive |

The current [paper target](../../../knowledge-base/strategy/paper-submission.md)
is separate from experiment admission. Older industrial/CIDR targets in the
retained documents are superseded by D121 (DECIDED), not silently rewritten.

## Governing execution directive — 18 November 2026

Jacob Hoffman's **“archaic execution limits removed”** directive applies to
every costfn experiment run from this directive onward, including completion
work. It overrides conflicting earlier task blocks and standing rules. Earlier
STOPs, source bindings, costs and cleanup receipts remain historical facts;
this is not permission to relabel them or reopen a deleted host.

The current order is all source fixes, including row-model preparation, before
paid proving runs. The [completion report](evidence/engagement-completion-20261118/RESULTS.md)
distinguishes pre-candidate selection estimates from actual native reads. That
distinction motivates the execution policy; estimates are never measured I/O.

- **No row-count stop:** remove experiment `max_rows_to_read`/code158 guards;
  no row-count stop applies to any experiment statement. Record actual rows and
  logical bytes per step, including partial work on failures.
- **Measurement statements have a600s native bound, not a10s run-stopper.**
  A600s timeout is a measured timeout result with partial actuals; preserve it
  and continue independent work rather than aborting the run. Missing dependent
  results stay unavailable, never PASS. Production query limits are separate.
- **No fixed client cap abandons native work.** Use exact-query native-completion
  polling (PR#1588); a300s-class client/transport timeout is not a native verdict
  and must not cause resubmission or loss of a still-running operation.
- **The13 November$40 programme compute ceiling is retired.** Receipt and report
  lease costs per run; that ceiling does not cap them. Storage charges remain
  distinct from compute.
- **500ms/25MB are success lines, not abort conditions.** Record misses and
  continue the admitted measurements, including scan-shaped completions. Earlier
  byte-gate aborts remain preserved historical outcomes, not future policy.
- **Unchanged:** exact parity oracle, adversarial fixtures and claim discipline;
  the32/28/22GiB host/container/server comparability envelope unless separately
  directed otherwise; agent supervision about every300s and droplet self-kill
  timers, with no guardian. The envelope is not a statement acceptance gate.
- **Admission remains explicit.** Runs start on an operator directive. Within
  an admitted run, no statement-level run-stoppers apply; the600s statement bound
  produces a timeout result. This policy change does not itself allocate a new
  paid host or extend a closed lease.

This entry defines policy, not blanket proof that every historical harness is
aligned. The separately admitted engagement completion now has
[native complete-response results](evidence/engagement-finish-20261118/RESULTS.md):
exact parity PASS/budget FAIL in all four cells, with preserved original startup
failures and a source-bound transport repair. Before using another research
entry point, reconcile its wrappers/controllers with this directive; do not
silently inherit retired row, deadline, client or budget-abort behavior.
Ordinary API/production behavior is unchanged.

**D114 tally run,19 November:** [qualified count results and coverage audit](evidence/engagement-tally-20261119/RESULTS.md).
Ordinary/fat/sample evidence and thousand-row scalar reads are banked, but the
required paired precheck omitted20 actual roots. Full acceptance stays OPEN;
the source verifier is repaired, not natively reaccepted. That lease is cleaned
up and consumed; no fresh paid/native retry follows automatically.

**Historical navigation below:** these earlier arm/admission notes retain their
original moment. The directive index above controls current selection; none of
the old “wait,” “run,” or host-window text reopens a consumed admission.

**Additive Arm T (14 November):** [contract and sequencing gates](ARM-T.md).
Separate group-first link layout on the unchanged validated realism input;
not a replacement for any frozen cell. Build/execution wait for the baseline
diagnosis receipt and Study B pilot launch; offline implementation is separate.

> **Current directive, 11 November 2026:** read
> [REALISM-DATASET-DECISIONS.md](REALISM-DATASET-DECISIONS.md) first, then the
> amended [REALISM-RERUN-PLAN.md](REALISM-RERUN-PLAN.md). New jointly generated
> derived realism dataset; V2 files/receipts stay untouched. Van Mierlo alone
> governs authorship, no Pew target. Feasibility/total/horizon arithmetic and an
> independent oracle precede local 10k/100k validation, then the 1M build and
> actual statistics review. No droplets, uploads or spend before those gates.
> The measured rerun is DigitalOcean on the uniform 28/22 GiB container/CH
> envelope, pilot reported before full fan-out. Tooling still needs this new
> input/oracle/envelope integration; the historical local-only instructions
> below do not authorize running V2 as the new study. Queue: RD1–RD4 in the
> plan and sigmod-paper lane.

**Full 1M validation:** [results and receipt](dataset-validation/2026-11-13-1m/README.md)
record all 50 finished-record checks passing on DO on 13 November 2026, with
1M accounts and 1.6B delivery events. This is dataset validation, not a benchmark;
operator statistics review, two verified private copies and connected pilot gates
remain open.

**Implementation/local evidence:** [REALISM-DATASET.md](REALISM-DATASET.md)
maps the executable contract, new Parquet generator, independent validator and
oracle, separate 28/22 GiB overlay, pinned environment and floor commands.
The declared default adjusts the old attention total to 1.6B impressions / 320
days at 1M accounts. The 1M build and finished-record validation are complete;
this is not a completed pilot. Node restore,
connected live-delivery delta checks and full runner integration remain gates;
new-format inputs cannot silently fall through to the V2 one-post oracle.

**Operator-approved preparation host:** [REALISM-CLOUD-PREP.md](REALISM-CLOUD-PREP.md)
records the one-host DO revision, monitoring/cleanup limits and private staging
approval for existing web10 MinIO. Local scratch refusal is not a request to
weaken the guard; the larger preparation disk is separately approved. Generated
reports are indexed in [evidence/REALISM-ARTIFACTS.md](evidence/REALISM-ARTIFACTS.md),
not committed as piles of JSON/TAR. The operator explicitly requested the compact
final 1M JSON receipt above be retained in Git; bulk data and recovery archives
stay out. Provisioning alone is not validation or fleet readiness.

**Latest storage rule:** [REALISM-STORAGE.md](REALISM-STORAGE.md): validated
private Spaces in the droplet region plus a canonical MinIO copy alongside V2,
both manifest/digest verified. No public posting before freeze and operator
review of the 1M statistics; any approved public release comes from MinIO.

**Current source capture after dev integration:** `core-feed-wire-v8.json` plus
cursor `core-feed-next-page-v6.json`. PR#1616 exported the existing exact feed
engagement reader for Shorts, changing the feed source hash only. All four
request payloads and cursor SQL are exactly unchanged from wire v7 / cursor v5. Historical
fixtures/receipts remain intact. This required test fixture is not disposable
generated-report clutter; no network or benchmark execution occurs in capture CI.

> **09.11.2026: the K=20-first plan is ratified.** [PLAN.md](PLAN.md) is the
> directive (per-request cost first, local-only, K≈20 headline, four arms,
> 37k-DAU demonstration last); [PROTOCOL.md](PROTOCOL.md) is the frozen
> claim/workload/input/arm/target unit. The 30-point VU matrix in
> `STUDY.md`/`study_plan.py` and the cloud L-point path in `READYING.md` are
> superseded as the primary study — read PLAN.md §2/§9 before running
> anything. Current captures: `core-feed-wire-v5.json` +
> `core-feed-next-page-v4.json` (09.11.2026 source repin, payloads
> unchanged). Input freeze + K=20 small-floor receipts:
> `evidence/protocol-inputs-20261109.json`.

> **Actual-host result (8 November):** the small connected floor and million-author
> restore pass, but strict concurrent acceptance fails at the ten-second SQL
> limit before the primary matrix. Preserve this failed baseline. The bounded
> partition-pruning source candidate, diagnostic parity and fresh replay/cleanup
> are tracked in [the receipt](evidence/cloud-preflight-20261108.json); this is
> neither a completed study nor a new manuscript result.

> **8 November execution follow-up:** the operator now authorizes proceeding with
> the isolated experiment and separately authorizes anonymous download of the two
> frozen synthetic V2 inputs. The initial study cap remains $10 despite the
> reported $1,000 credit. This supersedes the setup-only authorization below,
> not the actual-host restore/correctness/headroom or independent-cleanup gates.
> Public access is restricted to fourteen exact input objects; see [RUNNING-V2.md](RUNNING-V2.md).

> **7 November follow-up: preparation authorized, cloud study not started.**
> The operator requests runnable fixtures, comparator and core-feed tooling and
> approves immutable publication to web10 MinIO. Start with [RUNNING-V2.md](RUNNING-V2.md)
> and the receipt-driven `readiness_v2.py`, not the historical harness below.
> V1 remains a sparse control. V2 adds relational hot/dispersed inputs, actual
> discovery/Origin controls, real core HTTP scheduling, correlation/resource
> receipts and a paired resolver comparator. Sized-host restore/topology/headroom,
> explicit execution approval and budget/watchdog acceptance remain run gates.
> No provisioning, paid study or production deployment is authorized here.

Offline setup checks (no HTTP, database or cloud execution):

```sh
bun test research/experiments/costfn/capture-feed.test.ts
python3 research/experiments/costfn/study_plan.test.py
python3 research/experiments/costfn/study_plan.py --artifact-dir .context/datasets/one-million
```

The source-captured [wire contract](evidence/core-feed-wire-v4.json) verifies the
actual app/SDK builders' three queries plus views, including 21 fetched versus
20 displayed rows, prepare and delivery flags. It is fake-transport evidence,
not a live core-feed result. The planning tool has no execution mode and
`--require-ready` exits 2 while the design is blocked. Do not confuse a valid
wire capture or fixture checksum with an accepted load experiment.

## New workflow: frozen data first, measurement second

Start at [DATASET.md](DATASET.md), not the legacy combined `run.sh` below.
`dataset.py` builds/validates canonical synthetic input files offline;
`restore_dataset.py` prepares and checks a dedicated disposable stack;
`measure_dataset.py` measures an already-restored dataset and records its identity,
without signup, generation or import. The validated 1M-author + 20k-reader
artifact is ~150 MB compressed; [pinned file/manifest receipt](evidence/frozen-1m-v1.json).
This is a sparse public fixture, not measured capacity or full-feed realism.
This V1 workflow is not the V2 core-feed runner; see RUNNING-V2 for its inputs,
approved MinIO publication and actual-host gates.
The previous tier-max run was operator-cancelled (9/20 cells); receipts were
collected and the cloud droplet/local driver stopped. No new cloud run is active.

```sh
python3 research/experiments/costfn/dataset.test.py
python3 research/experiments/costfn/dataset_workflow.test.py
```

**Sixth-draft repeat: operator-cancelled (6 November 2026).**
See [execution record and capacity funnel](SIXTH-DRAFT-RESULTS.md): DigitalOcean
rejected s-8vcpu-16gb with an account-tier restriction; the operator then approved
trying the largest listed four-vCPU option (12 GB) in atl1. Startup/seed succeeded
after the bounded retry repair, but the operator cancelled at 9/20 completed
cells (180 measured samples). Partial files were collected and the host deleted.
The updated harness retains raw timing phases and excluded warm-ups and uses a
seeded randomized schedule; offline tests are not a completed connected run.
The larger-host/1M-author follow-up supersedes the old small-box-only budget
instructions below; those describe the historical K1000 microbenchmark only.

**K1000 trial:** [K=10/100/1000 results](K1000-RESULTS.md), imported from PR
#1313, records one 1,000-creator trial with all 20 cells complete (400 samples).
At K1000, B readable medians were 7,535.705 ms per-group versus 213.980 ms
batched; handler medians were 7,644.655 versus 363.305 ms. The paper now uses
this internally consistent sweep rather than pooling it with the earlier trial.
No startup/seed retry was needed; artifacts were collected and the droplet deleted.
The [summary receipt](evidence/) and `check-paper.mjs` retain/verify the numbers.
This is not capacity evidence; A is not a matched no-policy HTTP baseline and
B-minus-A is not causal authorization overhead. Full E3 remains open.

**First scaling trial:** [K=10/100 results](K100-RESULTS.md) records 100 creators,
20 samples per cell, all 15 cells complete. It includes the initial seeding
failure, source provenance and measurement limitations. Full E3 remains open.

**Connected smoke verified:** 10 creators, K=10, one post/creator, three queries
per cell completed all 10 cells (30 samples) on one sfo2 4-vCPU/8-GB droplet.
All four B-minus-A comparisons were populated. This verifies the pipeline, not
performance or tail latency. The run used `IPQoS=none` for SSH and the settings
type-preservation fix; the droplet was deleted after collecting results.

The harness for the paper's **access-control cost function** — the three-line
ablation that measures *the layer web10 adds* (auth → app-contract → candidate
→ readable-set resolution → group-meta → AST compile → serialize), with the
columnar scan held out or measured as the credited baseline. Full design + the
scope statement: [`../../digital-ocean-thinking.md`](../../digital-ocean-thinking.md)
(§"The access-control cost function"). This file is *how to run it*.

## Cost ceiling + spending safeguards (read before you spend)

This experiment is **cheap by design** — one small box, metadata-only seed, no
content, no media. The whole point of stubbing the scan (line C) and using tiny
posts is that you never buy scale hardware. Budget and guardrails:

- **One box only.** s-4vcpu-16gb nyc3 ≈ **$0.30/hr**. No ladder, no 4-box
  cross-node run (that's a separate follow-up). If you find yourself reaching
  for a bigger instance, stop — the experiment doesn't need it; something is
  wrong with the workload.
- **Hard time cap: ~2 hours wall clock.** compose-up (~5 min) + seed (minutes —
  metadata only, not a content seed) + bench (15 cells × 20 queries, paced under
  the 60/min rate limit ≈ 30–60 min) + teardown. Set a timer. **If it's still
  running at 2 hours, kill it** (`docker compose -p web10-costfn down -v` then
  destroy the droplet) and investigate — a runaway seed or a stuck cell is
  burning money for nothing.
- **Worst case ≈ $1.00** (2 hr × $0.30, rounded up). Three trials = re-run
  `run.sh` three times on fresh droplets ≈ **$3 total**. That is the entire
  budget for the paper's headline numbers.
- **The seed is the only thing that can run long.** It signs up N creators
  through the real API (rate-limited to 60 ops/min/user). At CREATORS=1000 that's
  ~17 min; if you raise CREATORS to 10k, expect ~3 hr and a bigger bill — **don't
  do that for this experiment** (the policy cost depends on K, not creator count;
  1000 creators is plenty to back K=1000). Keep `CREATORS` ≥ the max K you sweep.
- **Destroy the droplet when done — verify it.** `run.sh` tears down the local
  compose stack but does NOT destroy the cloud droplet. After copying
  `results/` off, destroy the droplet (the DO `teardown.sh` / `../teardown.sh`)
  and **confirm deletion** (DO console / `doctl compute droplet list`) — local
  Docker cleanup does not stop the cloud bill. A forgotten droplet is the classic
  blowout: $0.30/hr × days = a surprise invoice.
- **No data leaves the box except `results/`.** Copy that one directory off, then
  destroy. Nothing else is worth keeping.

**TL;DR:** one $0.30/hr box, ~2 hr cap, ~$1 per trial, ~$3 for the full
3-trial dataset, destroy + verify the droplet after. There is no scenario where
this costs more than a few dollars unless you leave the box running.

## What it measures (and what it does not)

- **Measures:** the policy layer, per phase, against **K** (the reader's
  readable-set size) and against **node size** (discover feed). The headline is
  the **pipeline-versus-scan delta B−A** and the isolated layer **C**, plus the
  **per-group vs. batched** `readable` cost on one figure.
- **Does NOT measure:** the ClickHouse scan as a result (it's the credited
  baseline A / held-out constant C), or CDN media delivery (offloaded by
  design — see `cloudflare-plan.md`). The claim is the cost of *our* layer, not
  the performance of the engines it stands on.

## The three lines

| Line | Flags set | Meaning |
|---|---|---|
| **A** | *(none)* | direct ClickHouse baseline inside the API container; executes the node-generated posts projection with the known-readable seed groups, without runtime permission resolution; HTTP policy remains enabled |
| **B** | *(none)* | full pipeline, real `execute` — the actual system |
| **C** | `QUERY_EVAL_STUB_EXECUTE=1` | full pipeline, `execute` stubbed — our layer, isolated from the engine |

The readable-resolution algorithm is varied independently: `per-group`
(default, O(K) round-trips) vs. `batched` (`QUERY_EVAL_READABLE_MODE=batched`,
O(1) round-trips) — so the figure shows the bottleneck *and* the fix. All three
flags default OFF in production (`api/app/settings.py`); the bench sets them
per-cell by restarting the api container.

Line A uses `safe_query.build_safe_query` once outside the timed loop, then
times `ch.execute_query` directly. This preserves B's `documents`/`doc_groups`
projection, deduplication, visibility filters and limit. `/v3/query` cannot
execute the raw projection: its validator rejects physical tables even with
the no-policy flag. A therefore excludes HTTP/auth/compile/serialization;
its policy phases are zero, and `queries_completed` counts direct executions
(`queries_200` is zero). `total_delta_median_ms` reports median B total minus
median A execute; the existing policy-only delta remains separate. This is a
scan-only baseline, not an equivalent no-policy HTTP request.

The standalone `compose.yml` publishes only `127.0.0.1:6000`; neither database
nor object storage publishes ports. Tiny smoke on an existing Docker host:
`CREATORS=10 FOLLOW=10 POSTS_PER_CREATOR=1 K_VALUES=10 RUNS=3 ./run.sh`.
This runs three queries per cell, not a statistically meaningful trial.

## The matrix (what gets run)

For each **feed × K × readable-mode × line**:
- **personal feed:** K ∈ {10, 100, 1000} (the reader's following count) — the
  curve that grows with your social graph.
- **discover feed:** K = 1 always (one board group) — the flat reference; its
  axis is node size (creators seeded), not K.
- Line A runs once per (feed, K) (the mode is irrelevant to it); lines B/C run
  per mode.

Default matrix: (3 personal K values + 1 discover) × (1 A + 2 modes × B/C)
= **20 cells**, each `RUNS` queries. The tiny K=10 smoke runs 10 cells, three
queries each; this is a functional check, not evidence for tail latency.

## Files

| File | Purpose |
|---|---|
| `seed.py` | metadata-only seed through the REAL API: N creators (followers group + tiny posts), one reader following K of them, a discover board. Writes `seed-manifest.json`. |
| `bench.py` | randomized matrix with excluded warm-ups; retains raw timing phases/query IDs and per-phase percentiles. Historical B−A key is not causal overhead. Pure functions are offline-tested. |
| `bench.test.py` | **offline regression tests** (no droplet/API/Docker) for the log parser, percentile math, summary, policy-total, B−A delta, matrix expansion, and per-cell env. Run this locally before spending money. |
| `run.sh` | orchestrator: compose-up (dedicated project) → wait → seed → bench → collect → teardown (only this project). |
| `RUNBOOK.md` | **the repeatable step-by-step** — provision droplet (doctl flags, SSH-key + region traps), docker + GHCR login, clone, run mini-then-full, collect, destroy+verify. Includes a troubleshooting index of every trap hit on the first connected attempt. **Read this before spending money.** |
| `results/` | per-cell JSON + `report.json` (generated; gitignored intent — copy off the box). |

## Run it (on a fresh disposable droplet)

**Start with [`RUNBOOK.md`](RUNBOOK.md)** — it's the full repeatable procedure
with the doctl flag gotchas, the SSH-reachability check (the #1 trap), the GHCR
login for the private base images, and a troubleshooting index. The short form:

```bash
# 0. Verify you can reach DO droplet :22 FIRST (the #1 trap — see RUNBOOK §1d).
# 1. Provision a droplet WITH your SSH key (RUNBOOK §1), install docker (§2),
#    log in to GHCR for the private base images (§3), clone + vhosts (§4).
# 2. Offline check FIRST (no money spent yet): the pure functions are sound.
cd research/experiments/costfn
python3 bench.test.py            # must print "all bench offline tests passed"

# 3. Mini probe first (shake out the first connected run — ~$0.10), then full.
CREATORS=100 K_VALUES="10 100" RUNS=15 ./run.sh        # probe
CREATORS=1000 K_VALUES="10 100 1000" RUNS=20 ./run.sh  # full (after probe looks sane)

# 4. Copy results/ OFF the box BEFORE destroying the droplet, then destroy + VERIFY.
scp -r root@<ip>:~/web10/research/experiments/costfn/results/ ./costfn-results/
doctl compute droplet delete <id> --force && doctl compute droplet list   # must be empty
```

## Reading the output

`results/report.json`:
- `summaries` — per cell, per phase: n / p50 / p95 / p99 / mean / max. The
  paper's per-phase breakdown comes from here. **Look at `readable` and
  `compile`** — those are the two phases that are "ours and interesting."
- `causal_overhead_B_minus_A` — per (feed, K, mode): the median policy-total
  delta (B − A) + the per-phase delta (where the overhead lives) + the % of A.
  This is the number E2 has been asking for.
- `cells` — which cells ran, how many queries returned 200, how many timing
  samples were captured (a cell with far fewer samples than `runs` had rate
  limits or errors — inspect it).

**The two figures:**
1. **Personal feed** — X = K, Y = `readable` (and total policy) ms. Two lines:
   per-group (bends) vs. batched (flat). Plus the B−A overhead per K.
2. **Discover feed** — X = node size (creators), K = 1. A/B grow with node
   size (the scan), C stays flat (one board contract). Label the flatness as a
   design choice (single board group + `limit`).

## Gates before trusting the numbers

1. `bench.test.py` passes offline (the pure functions are pinned).
2. The `group_contracts.tags` fresh-boot race is fixed on dev (every run boots
   a fresh ClickHouse — check before provisioning).
3. `DO_API_TOKEN` custody (operator's machine env only; never in the repo).
4. A cell's `timing_samples` ≈ `runs` (not gutted by 429s/errors). If a cell is
   short, re-run it — don't average the noise away.
5. ≥3 independent trials per point for the paper (re-run `run.sh` with the same
   seed; the dataset is deterministic). Report A/B variance (real-scan noise);
   C is clean (stubbed).

## Honest limits (state these in the paper)

- Synthetic users are not users; the workload (posts/creator, fan-out) is
  stated, not discovered.
- The personal curve claims "fine to K=1000," not "to infinity."
- Discover's flatness is a *design choice* (single board group + limit), not a
  free property — a fan-out discover design would bend it.
- One box, localhost, co-located browser-less load — not WAN, not capacity.
- The 4-node cross-node fan-out (the Solid comparison) is a separate follow-up
  gated on the multi-node read path.
