FINAL experiment plan — get one query fast, prove its cost, then prove 37k DAU

CURRENT AMENDMENTS (11 November 2026): this ratified November 9 directive is
preserved as history. For the current derived realism dataset and measured DO
rerun, read REALISM-DATASET-DECISIONS.md first, then REALISM-RERUN-PLAN.md.
They supersede conflicting local-only/input/authorship instructions here;
the source workload, gate discipline, separate production/submission approval
and failure-retention rules remain. No droplets, uploads or spend until the
new generator/independent oracle and local 10k/100k floors pass and the actual
statistics receipt is presented for operator review. Implementation is open.

INSTRUCTIONS FOR THE WORKSPACE (read first)
This file IS the directive. It contains, in full detail, everything the
workspace needs from the Nov 9, 2026 planning conversation — principles,
failed-PR ledger, phases, arms, targets, schedule, non-goals, and the
production-migration gate. Where any older document (STUDY.md, PR #1417 /
#1424 designs, revised-experiment-plan.md, sixth-draft tasks) conflicts
with this file, THIS FILE WINS. Do not re-derive strategy from older
plans; execute this one. Work bite-by-bite (repo rule D66): each phase's
output is named before it starts, receipts are written with the bite they
belong to, and nothing in this plan authorizes a CMT submission, a
production deployment, or a production table rebuild — each of those
waits for Jacob's explicit go-ahead at its gate.
Ratified by Jacob, Nov 9, 2026 ("lets make that the plan actually").
This is the consolidated, current plan. It supersedes:
the 30-point concurrent VU matrix in STUDY.md / PR #1417 / PR #1424
  (cancelled as the primary study — see "What was unreasonable before"),
revised-experiment-plan.md in this folder (working draft of this plan;
  kept, this file is the clean consolidation).
Target: SIGMOD 2027 Industrial Track submission.
Deadline Nov 24, 2026, 11:59pm AoE. Internal freeze Nov 20, 2026.
Limit: 12 pages body + references. Paper: sixth draft on origin/dev
(#1410); the seventh draft (Task 5) incorporates what this plan finds.
No CMT upload or submission without Jacob's explicit go-ahead.

1. The principles (Jacob's decisions, Nov 9 — do not re-litigate)
Per-request cost first. The core question: does ONE user on ONE node
   still get a fast read when the node's ClickHouse store holds a lot of
   stuff? Concurrency is arithmetic after that (Little's Law) and theater
   before it.
**Everything runs locally on Jacob's Mac. No DigitalOcean, no cloud at
   all** — including the load test. Frozen inputs, Docker, loopback, $0.
   Cloud added nothing in Nov 6–9 but tier blocks (HTTP 422), a ClickHouse
   restart failure, and SSH timeouts on ports 22 and 443.
**K≈20 is the realistic headline case. K=1,000 is a crazy heavy-follow
   stress case.** Measure both; never relabel one as the other; never call
   either a "typical user" statistic.
Cache where it's the same for everybody, eat it where it's personal.
   Discover in "balanced" mode is shared/public → cached (one computation
   per refresh interval, served to all). Personal Following feed is
   per-user → computed live. The load workload's MIX must reflect this.
Documents stay all in one place. The single canonical documents
   table is the data-lakehouse strength. Per-kind tables (numbers, dates,
   text/inverted, strings, refs/edges) are DERIVED satellites keyed by
   doc_id — access paths, rebuildable, never authoritative.
   Split the layout, never the lake.
No fixed-dollar fantasy. "$200/mo for 1M active users" is
   preposterous: a million people actually coming simply needs more
   hardware (Meta has datacenters). The claim is POOLED SIZING — a bigger
   instance, not a different architecture — and machine counts come from
   the core-seconds formula (§4), not slogans.
Two-claim rule. Per-request cost (bytes read per request on a frozen
   input — hardware-independent) and fleet capacity (matched silicon only)
   are separate claims and are never conflated.
Future architecture is future work. Integer per-document version,
   typed satellite tables, time-ordered layouts (D109 / IX1 / IX2, PR
   #1467) do NOT get built before the freeze. They change the system under
   test and belong to the follow-up paper. The SIGMOD paper cites them as
   future work only.
2. What was unreasonable before (record, so it isn't repeated)
Load before cost: a 1k–20k VU study designed before one request's cost
  was known. Two synthetic readers (peak 8 in-flight requests) were already
  enough to fail strict acceptance (Q01, Nov 9).
Stress as headline: K=1,000 primary; the realistic K=20 input was never
  even generated.
A 30-point matrix, each point needing a fresh million-row restore, on
  rented 3-host cloud setups — days of ceremony, zero completed points.
A fixture that fought the claim: hot-only readers (same first 1,000 of
  1M authors = 0.1% coverage), empty engagement joins, missing
  default-Discover links, tied timestamps.
Capacity cosplay: simulating million-user traffic for a platform whose
  dated production snapshot is hundreds of accounts, when the defensible
  claim was always sizing, not traffic.
Engine confusion in early drafts: "ClickHouse has no RLS" is false
  (24.3/24.8 have row policies). The contribution is web10's group/service
  policy + query integration, priced by a same-engine paired ablation —
  never a Postgres-vs-ClickHouse absolute-ms race (engine gap swamps auth).
2b. The failed-PR ledger — each one, its mistake, and the rule in this plan that prevents a repeat
Read this before starting any task. Every failure below already happened
once, with receipts. The rule column is binding on this plan's work.
PR
What it was
What went wrong / the mistake
Rule in this plan
#1417
Frozen V1 dataset + preregistered STUDY/DESIGN-REVIEW
Setup-only that never became a run. The fixture it froze was invalid for its own claims: hot-only (all 20k readers follow the same first 1,000 of 1M authors, 0.1% coverage), no profiles/reactions/comments/media, no default-Discover links, tied timestamps — and measure_dataset.py still ran the simplified bench.py query (doc_id/body, no joins, no prepare flags) while being positioned toward a full-feed study. It also shipped the false premise "ClickHouse has no RLS."
Freeze inputs only AFTER a small-floor check proves the workload on them: exact nonempty results, real joins firing, Discover links present, distinct timestamps (Phase 0 gate, Phase 1 input rules). The workload is the real app/SDK sequence, never a renamed microbenchmark. Verify engine facts against docs/source before they enter a claim.
#1424
Runnable V2 datasets (hot + dispersed, MinIO) + core-feed runner + paired comparator + local acceptance
Preparation was mistaken for progress: status PREPARED_FOR_HOST_PREFLIGHT, submission_ready: false, main.tex untouched, batched still not the production default — yet it was easy to talk about as if the experiment were "ready." It also changed engines mid-stream (24.3 → 24.8, because 24.3 rejects the app's QUALIFY), quietly breaking comparability with the historical K1000 trial.
"Runnable" is not "run" and is never reported as a result (§2, Task discipline in Phase 1). Pin ONE engine version for the whole study in PROTOCOL; results across engine versions never pool. State the shipped-default status next to every mechanism number.
Nov 6 tier-max run (pre-#1447)
First actual K1000 repeat attempt on DigitalOcean
Host saga ate the experiment: s-8vcpu-16gb blocked by a 422 account-tier restriction; the tier-max retry's ClickHouse restarted between schema templates and failed before seeding; the successful retry was cancelled at 9/20 cells (180 samples, no report). A provisioning problem was allowed to masquerade as a scaling result.
No cloud at all (§1.2). A provisioning/setup failure is recorded as a setup failure, never as data about the system. Partial cells are retained and labelled partial — never incorporated as a trial.
#1447
Attachment-history partition pruning candidate
The candidate's same-engine diagnostic looked great (main SQL 7,606 → 2,423 ms, identical output) while physical rows read stayed 36M — a latency win that was NOT scan pruning — and fresh strict acceptance still failed (3 of 4 measured feeds, HTTP 400). Single-pass diagnostics were nearly promoted to an end-to-end claim.
Bytes/rows read is the PRIMARY metric (§3, Phase 1); a latency improvement without a read reduction is reported as exactly that. No optimization graduates on a diagnostic alone: it must pass the same strict acceptance as the baseline, on the full fixture.
#1448 (Q01)
Exact-ID canonical-lookup pruning — merged, all checks green
Merged and correct, but NOT sufficient: the Nov 9 Q01 actual-host preflight (#1452) still failed 2 of 4 measured feeds with native code-159 timeouts at the unchanged 10 s limit. "PR merged + tests pass" was available to be misread as "experiment fixed."
A merged optimization changes the baseline; it does not close the study. After ANY merged query change, the study's source pin moves and the affected cells re-run — or the paper keeps the older failure as its result.
#1449 (Q02)
Readable-join / semijoin optimization — investigated, REJECTED, code removed
The intuitively-obvious fix regressed catastrophically on broad overlap: 8.3× duration, 34.2× memory vs baseline, because early joins duplicate attachment/document histories per readable link. Sparse cases won; dense cases paid. It also burned time because its appeal was argued from the sparse case first.
Every optimization is tested on the DENSE/broad case first (that's where this workload lives), with a pre-declared regression budget: any arm >2× baseline memory on any shape kills the idea, no single-group carve-outs to save it. Intuition is not evidence; Q02 is the standing example.
#1452
Q01 preflight record + shared-index roadmap
Not a failure itself — the honest record of one — but it documents the pattern: local exact-ID gains were real and the million-author run STILL failed, because local small-fixture wins were implicitly expected to transfer to the full store.
Small-floor success is a functional gate only. Nothing is "expected to transfer": every claim runs at the full 1M-author size it will be printed at, or it isn't claimed.
#1464
Date-projection / date-pruning experiment (branch jacoby149/hello-chat-v3)
A friggin mess, in Jacob's words, and a failed MERGE VEHICLE: 63 files mixing API changes, social UI (30-day Discover), an experimental compiler flag, and research receipts in one PR. The experiment inside it was also mixed-evidence: clustered layout 381 MB → 5.3 MB, scattered layout no win, all-recent NEGATIVE — and both cloud attempts were SSH-blocked (22 and 443), so no cloud run ever happened; the local million-author run failed 0/4 measured feeds; the matched A/B/C was paused unfinished.
One PR = one concern, ≤ the repo's bite-size gates; research receipts ride with the bite they belong to, never inside a product PR. Mixed evidence is reported as mixed (the date plan stays default-off for exactly this reason). Unfinished matched comparisons are labelled paused — never cited as if a winner exists. Research branches that fail as merge vehicles stay frozen as evidence archives (cited with that provenance), they are not force-merged later.
#1467
D109 salvage: docs-only capture of the version/per-service decisions from #1464
NOT a failure — the model response to one. It salvaged the ideas (integer version, per-service layout, two-claim rule, IX2 lane) with zero runtime code, and explicitly recorded #1464 as failed. Its one overreach, per Jacob Nov 9: Stage 2's split reads like the service tables become the store.
Salvage ideas as decisions, not code (§1.5/§1.8 refine D109: satellites are derived; documents stay canonical and in one place). Every salvage doc names what it does NOT authorize — #1467 did, and its non-authorizations are binding on this plan.
Cross-cutting mistakes, distilled:
Preparation kept being sold as results (#1417, #1424, the cancelled
   tier-max run). → In this plan, only Phase-gated measurements count, and
   each phase's outputs are named before it starts.
The fixture and the claim drifted apart (#1417's empty joins,
   K=1,000-as-typical, hot-only coverage). → PROTOCOL freezes claim,
   workload, and input as one unit (Phase 0/1 gates).
Cloud logistics consumed the science (422s, restarts, SSH). →
   Local-only, full stop.
Wins were checked on easy shapes first (#1447's diagnostic, #1449's
   sparse case, #1464's clustered case). → Dense/broad/full-size first,
   with regression budgets declared in advance.
Big mixed PRs made failure expensive (#1464). → Small bites,
   research separated from product, salvage-by-docs when a branch dies.
3. The sequence
Phase 0 — Get ONE query fast (the critical path)
The personal core-feed query — the real app/SDK sequence from #1424:
main query, then reaction counts, comment counts, and contentViews over
the returned 21 IDs (20 displayed) — at **K=20 on the full 1M-author
store**, locally, one reader.
Iterate ONLY with bounded, already-evidenced query/compiler measures:
  merged Q01 exact-ID pruning (#1448), readable group-partition pruning
  before window ranking (#1447), the 30-day date bound where the surface
  honestly applies it. Production timeout stays 10 s. No Q02 revival
THE 30-DAY BOUND IS TWO DIFFERENT THINGS — never conflate them:
  (a) The SQL predicate (created_at >= cutoff) needs NO new index and
  NO design change, but on today's (author_key, doc_id)-ordered table
  it is NOT a range seek: ClickHouse scans the (single, compressed)
  created_at column and filters; it shrinks the candidate set for the
  expensive downstream steps, it does not skip the table. Modest,
  honest benefit; measure it as Arm B (see MATCHED-DATES design).
  (b) A physical TIME LAYOUT — a ClickHouse PROJECTION on the same
  documents table, alternate ORDER BY including created_at,
  engine-maintained on insert — IS a storage-layer addition: one DDL
  statement + materialization, still ONE table, no new fields, no
  per-service tables, no app/SQL change. It is the ONLY storage change
  this plan permits, and ONLY in the research stack on the frozen
  input; a production decision on it is separate and not implied.
  Evidence discipline for (b): #1464's projection numbers are
  layout-conditional (clustered 381 MB → 5.3 MB; scattered no physical
  win; all-recent negative) — so the projection is measured as Arm C
  against Arm B on the SAME input before anyone calls it a fix, and a
  scattered-layout result of "no win" is a publishable answer, not a
  failure to hide.
  (#1449: rejected, 8.3× duration / 34.2× memory on overlap). No storage
  rebuild (§1.8).
Keep every failed baseline measurement. Baseline-vs-tuned is the
  paper's cost story; a lone good number is not.
Pre-declared success targets to proceed (adjust ONCE in PROTOCOL,
  with reasons recorded, never silently): p95 < 500 ms AND bytes read
  per request < 25 MB at K=20 / N=1M on the recorded local setup.
THE FOUR ARMS (same frozen input, same real query; an arm whose
  output IDs/order differ from Arm A is INVALID, not slow — fix or drop
  it, never average over the discrepancy):
Arm A — today's table, ORDER BY (author_key, doc_id), the
    failed baseline. Kept; it is the paper's comparison.
Arm B — Arm A + the 30-day created_at filter as pure SQL
    (no new index; a column scan + candidate shrink, §3 Phase-0 note).
Arm C — Arm B + a time PROJECTION on the same documents table
    (engine-maintained alternate time order; research stack only).
Arm D — a REBUILT documents table with the date in the sort
    key: ORDER BY (author_key, created_at, doc_id, updated_at)
    (date in the MIDDLE — first would break the author-prefix ownership
    lookup, last would sort only versions of one doc). Same rows loaded
    from the same frozen input; all other tables unchanged. The query
    must be written to exploit the key (author set + time predicate
    pushed into the scan); a rank-everything-then-filter query wastes
    any key and invalidates the comparison's point.
  "No storage rebuild" in §1.8 means no PRODUCTION rebuild and no
  D109/IX redesign during the experiment; Arm D's research-stack variant
  table is a measurement, not a migration. Production follows §8.
Phase 1 — The per-request studies (the paper's evidence core)
All local, on frozen inputs, ≥3 independent trials per cell (fresh
restore per trial), ≥30 measured samples per cell after ≥3 excluded
warm-ups, randomized reader/cell order, raw per-request records + native
ClickHouse metrics (rows/bytes/duration/memory, query IDs) retained for
every cell. Failed/timed-out cells are RESULTS — report counts and native
metrics, never drop them, never present success-only percentiles as
all-traffic numbers. Workload uses real app grants + real Origin
(no Origin-free shortcuts). Delivery impressions and request logging
stay enabled (the feed is not read-only; condition is declared
steady-refresh after warm-up).
Study B — store-size scaling (headline): one reader, K=20,
  dispersed, at N ∈ {10k, 100k, 1M authors}. Inputs generated with the
  existing parameterised V2 generator at each size (new dataset IDs,
  all-row validation). Question: as the lake grows 100×, does the read
  stay in its own slice, or pay for everyone's data?
Study C — the K cost function at N=1M: K ∈ {20, 100, 1,000} ×
  {hot, dispersed}. K=1,000 cells are expected to be hard (Q01 failed
  2/4 feeds, code-159, ~36M rows / ~3.7 GB per query) — if they fail
  again locally, that IS the measured stress bound; report it, do not
  fix it mid-study.
Study A — mechanism repeat: batched vs per-group K sweep
  (K ∈ {10, 100, 1,000}), both modes, same sampling discipline. If
  bench.py's simplified query is used, captions say mechanism-only.
  Note in the paper: production default remains per-group.
Study P — paired resolver ablation: the #1424 comparator, locally:
  ≥20 pairs × ≥3 trials, randomized arm order, identical compiler-SQL
  and ordered-output hash per pair, first pair excluded as warm-up.
  Claim: resolver RECOMPUTATION cost only — not total auth overhead.
Primary metric throughout: bytes read per feed request.
Secondary: rows read, native duration/memory, p50/p95 latency + counts.
Phase 2 — The 37k DAU load demonstration (last, and only if Phase 0–1 pass)
Operating point (the paper's own funnel arithmetic, one session/DAU/day,
15% of DAU in peak hour, 15-min sessions):
37,000 DAU → 5,550 peak-hour sessions/hr → **~1,400 concurrent
  sessions → **~23 feed loads/sec at 60s think time (46/s at 30s).
Workload MIX per §1.4: Discover-balanced reads from the shared cache,
  Following reads computed live per user at K=20, on the FULL 1M-author
  store (deliberately bigger than a real 37k-DAU node's store —
  conservative).
Setup: everything on the Mac. Pin and record Docker allocations
  (API + ClickHouse cores/RAM, e.g. the earlier local run's 8 logical
  CPUs / ClickHouse 5 GB cap); generator runs with proven headroom
  (generator CPU < 50% while the server is the bottleneck).
Success criteria (declare in PROTOCOL before running): sustain the
  target rate for a 10-minute window; error rate < 1%; p95 client
  latency within the Phase-0 budget; zero correctness failures —
  lifecycle controls (allow/deny/revoke/tombstone) pass before AND after.
Claim allowed: "a recorded local setup sustained the derived peak
  load of a 37k-DAU node on the K=20 workload" — an operating-point
  demonstration. Loopback latency disclosed; server throughput, errors,
  and handler latency are the evidentiary core.
If Phase 0 fails at K=20, Phase 2 does not run. There is nothing to
  load-test yet.
4. The sizing arithmetic (for the paper, labelled derived)
Concurrent sessions = peak-hour sessions × session minutes ÷ 60.
Offered rate = concurrent sessions ÷ think time.
In-flight requests = offered rate × per-request latency.
  (At ~9.4k concurrent sessions — the 1M-MAU scenario — that's ~167
  loads/s, and either ~8 in flight at 50 ms/read or ~1,670 at 10 s/read.
  Per-request cost decides the hardware, every time.)
**Machines (16 cores) = peak feeds/s × core-seconds per feed ÷
  (16 × 0.6 utilisation).** For 37k DAU (23 feeds/s): 1 machine at
  ≤0.4 core-s/feed, ~3 at 1 core-s, ~10 at 4 core-s, absurd at today's
  multi-second scan cost. Paper states the formula + the measured
  core-seconds; it does not promise a machine count for unmeasured costs.
1M scenarios (registered / MAU / DAU) stay an explicitly-assumed
  funnel table — assumptions, never results.
5. The seventh draft (incorporate findings, don't resynthesise)
Copy research/sixth-draft/ → new working folder. v6 stays frozen.
§9 evaluation rebuilt on Phases 0–2: cost-function table (K sweep),
  store-size scaling table (the pooling evidence), paired resolver
  deltas, failed K=1,000 cells as measured stress bounds, the 37k DAU
  demonstration, sizing arithmetic as a labelled derivation.
Fold in the found lessons, with receipts: prune-before-rank doesn't
  shrink scans if the physical layout is wrong; intuitive join
  optimizations can regress 34× in memory (Q02); date bounds win only
  when the layout correlates (clustered 381 MB → 5.3 MB; scattered
  nothing; all-recent negative); cache the shared surface, eat the
  personal one; load tests are the LAST step, sized from DAU arithmetic.
D109 / shared typed indexes / integer version appear ONLY as future
  work, citing PR #1467's record with its unmerged-branch provenance
  where applicable.
Abstract/intro/conclusion aligned to measured claims; every capacity
  or dollar sentence audited against §1.6–1.7. Limitations carries:
  single-reader primary studies; concurrency derived except the one
  bounded demonstration; local-machine latencies (bytes read is the
  portable metric); production default still per-group.
Formatting verified against the CFP (incl. the footskip question);
  author = Jacob Hoffman / Web10 Inc. only (employer must NOT be
  listed); 12pp body + references, build clean.
6. Schedule
Nov 10–11: PROTOCOL frozen; K=20 + N-scaling inputs generated and
  validated; small-floor workload check.
Nov 11–13: Phase 0 (get the query fast; iterate locally in minutes).
Nov 13–15: Phase 1 studies B / C / A / P.
Nov 16: Phase 2 load demonstration + full analysis; independent
  recomputation of every headline number from raw records.
Nov 17–19: Seventh draft integration + review (claims vs data vs
  limitations).
Nov 20: FREEZE. Nov 24: deadline (upload only on Jacob's go-ahead).
7. Non-goals (explicit)
No cloud of any kind. No 1k–20k VU matrix. No timeout increase. No
production changes or deployments DURING the experiment. No new demos.
No D109/IX1/IX2 builds before the freeze (§8 is a copy of existing data
into a re-keyed table, not the D109 redesign). No number in the
manuscript that doesn't trace to a raw record in one
step.
8. Production migration — YES, if the experiment goes great (Jacob, Nov 9, 2026)
Jacob's direction: if Arm D wins, production migrates to the date sort
key too. This section is that decision, with its gates — it executes
AFTER the experiment (and after the Nov 20 freeze if timing requires),
on Jacob's explicit go-ahead at the gate:
Win condition: Arm D beats A/B/C at K=20 on the full 1M-author
   store on the primary metric (bytes read per request) and meets the
   Phase-0 targets, with exact output parity, AND no regression on the
   ownership point-lookup path (author-prefix probes — the I3 checks
   and canonical exact-ID lookups must stay point reads, verified
   before the flip).
One rebuild, both changes: create documents_v2 with
   ORDER BY (author_key, created_at, doc_id, <version>) and the
   server-assigned integer version as the ReplacingMergeTree version
   column (D109 Stage 1) IN THE SAME TABLE CREATION — production is
   rebuilt once, not twice. If the integer-version work is not ready
   when the migration runs, Jacob decides at the gate whether to wait
   for it or ship the key alone; do not silently split or bundle.
**Mechanics (small at current scale — hundreds of accounts, ~600
   live documents in the Oct 28 snapshot):** create new table →
   INSERT SELECT copy (the copy IS the re-sort) → parity checks
   (row/version counts per author, spot document lookups, feed output
   comparison old vs new on the live node) → flip reads/writes → keep
   the old table untouched as the rollback path until Jacob says to
   drop it (keep-every-iteration rule).
Paper honesty: if the migration lands before submission, the
   paper's system description may describe the new key as the shipped
   layout, citing the experiment as its evidence. If it lands after,
   the paper describes it as measured-and-adopted future work. Never
   describe an unshipped layout as the production system.
Amendment 3 (Jacob, Nov 9, 2026) — just rebuild it: sort-key variant is a Phase-0 arm
Jacob: "who cares, just rebuild all the production tables, if this is
better. Rebuild the experiment data, load the ClickHouse for the test
with that sort key right?" Right — with the test first:
Phase 0 gains Arm D: a sort-key variant table built from the SAME
  frozen input, ORDER BY (author_key, created_at, doc_id, updated_at)
  on the documents table (all other tables unchanged), measured against
  Arm A (today's (author_key, doc_id) key), Arm B (date filter only),
  and Arm C (time projection). Same rows, same query semantics; exact
  output IDs/order must match Arm A or the arm is invalid, not slow.
The date goes in the MIDDLE of the key, never the end (end = sorts only
  versions of one doc) and never first (breaks the author-prefix point
  lookup the ownership invariant relies on).
Jacob's scale point stands: at the current production size (hundreds
  of accounts), rebuilding the production table is a copy, not a saga —
  IF an arm wins, production migration is create-new-table → copy →
  parity-check → flip, and it should be bundled with the integer-version
  rebuild (D109 Stage 1) so the table is rebuilt ONCE for both changes.
  What is NOT authorized by this amendment: doing that production
  rebuild before the arm has won on the frozen input.
