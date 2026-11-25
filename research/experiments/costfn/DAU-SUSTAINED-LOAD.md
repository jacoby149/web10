# Sustained-DAU load test — contract

**Status:** planning contract, dated 25 November 2026. This document defines the
experiment that retires the "sizing target, not measured capacity" line for the
realism contract's load at one million accounts. It authorizes **no runner, no
host, no admission, no measurement, and no submission**. The legacy
`bench.py`/`seed.py`/`run.sh` harness is BLOCKED on record
(`../README.md#known-blockers`, eight named defects) and is not reused. The
runner, when written, is new committed source on the existing costfn
machinery, with offline controls, in a separate source PR before any
provisioning.

## 1. Why this experiment, and why this size

The paper's budget line prices one quantity: the complete uniform K20 response
at the contract's offered load. The realism contract fixes 0.25 page reads per
account per day at 1,000,000 accounts — 250,000 page reads per day, an average
of ~2.9 reads/s, and a declared peak of **15 reads/s**
([HYBRID-K20-FINDINGS](HYBRID-K20-FINDINGS.md)). Every banked per-read cost
(123,119,689 logical bytes and ~7,017 ms HTTP for the full-store indexed
uniform K20, PR #1618) is a **single-read** measurement. What has never been
measured is the node *sustaining that rate* — the ~105 in-flight reads that
15 reads/s × 7 s wall time implies, with publication writes and merges active,
under a resource envelope, with a latency distribution.

This test is that measurement, right-sized to the claim the paper actually
makes (the contract rate at one million accounts), not to the larger stepped
funnel of [STUDY.md §6](STUDY.md) (H/S × 1k/3k/5k/10k/20k VUs), which remains a
separate remainder and is not run, restoped, or superseded by this contract.

Three-receipt map, no substitution between them:

| Receipt | Machine | Line it upgrades |
|---|---|---|
| **This test** — sustained contract rate, mixed load, clog criterion | the budget's reference node (or scoped rental, §10), frozen store | clogging / steady state / CPU / memory on the machine the budget names |
| R630 on-array run (seventh-draft README, pending hardware) | assembled R630, four transplanted drives | reference-array net disk supply (rated → measured); shares machine and restore with this test |
| Full-store hybrid run (separate admission) | admitted host, frozen store + built satellite | hybrid band (0.54 GB/s ratio-transfer → measured) |

## 2. Store, host, and identity bindings

- **Store:** the frozen million-author store as restored by the costfn
  pipeline from retained snapshot `255003176` — the exact store of every
  banked costfn run. Before reuse, check the existing slice manifest,
  canonical generation fingerprint and native receipts (24 November
  scheduling directive); repair or rebuild only invalid work.
- **Host class — the budget's machine, or nothing.** The claim this test
  supports is the budget's: *this* machine at *this* load. A test earns its
  place by running on the machine the budget names; on any other machine the
  result floats free of the claim (a pass would prove the budget
  over-specified, a failure would prove only about the foreign machine). The
  primary host is therefore the reference node of
  `ubuntu-deployment/HARDWARE-UPGRADE-PLAN.md`: Dell R630, 2× Xeon E5-2698 v3
  (32C/64T total), 128 GB / 8-channel DDR4 (transplanted sticks, ~136 GB/s),
  four 2 TB SanDisk SSD Plus in two mirror pairs (~4 TB usable, 1.09 GB/s
  rated one-drive-per-pair), 10 GbE. Restore target: an owned research
  volume/VM on that machine (the hardware plan's new-pool VM), never the
  production stack. Gated on the hardware landing; not purchased or
  assembled as of the 22.11.2026 ledger.
  A **scoped rental alternative** is admitted only for the window before the
  hardware lands: a 64-thread / ≥128 GB cloud rental matches the CPU and
  memory dimensions but cannot match the SATA mirror array — cloud storage is
  not the budget's disk line and the array is not rentable. On such a host
  storage must be NVMe-backed and calibration-measured non-binding per §10,
  and the receipt carries the scope restriction: CPU/memory/concurrency
  clogging established; the disk line remains the R630 receipt. Availability
  is verified at admission; the actual provisioned shape is verified into the
  receipt, never assumed from the catalogue label.
  The banked 8-vCPU droplet is **not** a test host: at 15 reads/s the banked
  single-read costs (~1.1–1.3 s summed native duration each) ask for
  ~17–20 thread-seconds of engine work per second against 8 available
  vCPUs — it clogs by arithmetic before the first measurement, and its
  breaking point would be the droplet's, not the design's. An optional
  machinery-validation run on it (scoped "no claim, pipeline check only") is
  default-off and never banked as a result.
- **Engine:** ClickHouse 26.10.4.207 (pinned for single-read cost
  comparability). Memory envelope: the banked 32/28/22 GiB on the rental
  path; the reference node's own declared limits on the primary path.
- **Engine boundary:** at the API -> ClickHouse boundary, the API supplies
  authorized SQL; the engine executes it. The load test exercises that
  boundary under concurrency; it adds no node surface, no policy-bypass flag,
  no raw-table access, and no app-specific endpoint (D60).
- **Reader identity:** the exact frozen uniform K20 request and authority of
  the banked runs, extended to a pool of **150 distinct prepared reader
  tokens** — above the ~105 peak in-flight expectation, so no token refreshes
  inside the timed windows. Freshness is maintained outside timing, never by
  disabling checks. Deterministic staggered round-robin schedule, recorded and
  persisted before execution.
- **Fixture caveats, carried into the claim boundary:** the frozen store is
  the hot shared-audience, text-only, single-version microbenchmark fixture
  (all readers over the same followed span; no profiles, reactions, comments
  or media). The receipt makes no audience-diversity, media or app-page
  claim. The app's four-call page core is out of scope on this store by
  construction (STUDY.md §3: empty joins on V1) and belongs to Study L on the
  V2 relational datasets.

## 3. Frozen workload

**Reader arm (the measured unit).** One virtual read = one complete uniform
K20 response through the public API, exactly as banked — same request, same
authority, same prepare flags — including its delivery-implication work
(`log_content_deliveries` dedupe read and possible insert, 24-hour dedupe
window). The workload is therefore not strictly read-only, and that is
declared, not hidden.

**Offered-load profile** (all rates node-level, pre-declared, frozen):

| Phase | Duration | Offered rate | Role |
|---|---|---|---|
| W warm-up | 300 s | 15 reads/s | converts cold-first-delivery writes into dedupe-only steady refresh; engine settle. Retained, excluded from headlines |
| A peak | 600 s | 15 reads/s | **measured window** — the contract peak sustained |
| B average | 1,800 s | 2.9 reads/s | **measured window** — the daily-average rate sustained |
| D drain | bounded | — | in-flight completes; retained |

The offered rate is open-loop with back-pressure accounting: scheduled,
offered, started and completed are tracked separately, and a slow closed loop
must not silently reduce offered load (STUDY.md §6). In-flight expectation at
phase A is ~105 (planning arithmetic from the banked single-read wall time;
not a gate).

**Writer stream (mixed load, declared assumption).** A constant publication
stream of **1 post/s** from 100 distinct fixture writer actors, public
text-only posts, no media, no group beyond the writer's own followers plus
default Discover, active from phase W through phase D. The rate is a frozen
declared parameter, **not a contract constant** — the contract fixes reads,
not writes — and the receipt says so. The stream exists to make disk load
mixed (writes plus natural merges) so the read measurement is not a read-only
fantasy. Default ClickHouse merge policy; no manual merges during the
windows; parts and merge pressure are recorded, not managed. A sensitivity
note records that the gates are read-side and the writer rate does not gate
them.

**Steady-state declaration.** Delivery/dedupe state is as restored plus the
phase-W conversion; the measured windows are the declared steady-refresh
condition, stated in the receipt. No account or post is generated, and no
password is hashed, during measured traffic (DATASET.md contract).

## 4. Oracle and correctness gate

Every response in every measured window is compared, offline and
asynchronously, against the **independent complete-response oracle** frozen
per reader identity from the frozen input — exact ordered complete-response
parity including policy, versions and payloads, the standing house rule. The
oracle is computed offline from the frozen store; it is not a second live
run. Any exact ordered divergence **stops the task immediately and publishes
no comparison costs** (24 November directive). Correctness is never waived by
a performance failure, and a performance stop banks the curve **without** a
capacity claim.

## 5. Measurement and receipt schema

Banked under `evidence/dau-sustain-YYYYMMDD/`:

- **Per-request raw records** (content-free: latency, phase, reader ID,
  outcome, error class — no bodies, tokens, signed URLs or production
  records): offered/achieved reconciliation, p50/p95/p99 per window and
  across windows with sample counts and uncertainty, 429/4xx/5xx/timeout
  counts — failures are counted and reported, never dropped, and no
  successful-request percentile is labelled as all traffic.
- **Resource traces:** in-flight request count across the window (the clog
  trace, §6 G1), host RSS peak + trace, CPU utilization, ClickHouse
  parts/merge pressure, engine memory against its declared cap, OS counter
  deltas for bytes read and written with counter units and elapsed time. On
  a rental these are virtual-device counters; the receipt says so, and no
  disk-supply claim is made for any machine other than the one measured.
- **Native statement receipts** via the pinned driver's existing receipt
  adapter: rows, logical bytes, largest individual statement memory, and
  summed native duration per statement class — kept distinct from CPU time
  and from complete HTTP wall time (18 November statement-level policy).
- **Identity receipt:** source revision, runner SHA-256, engine version,
  snapshot ID, dataset ID, schedule hash, host SKU/region/price/dates,
  admission ID and window.
- **Cost receipt:** estimated compute (seconds × $0.25/hour), **not an
  invoice**, separate from storage; provider cleanup verified by readback,
  droplet list confirmed empty, snapshot `255003176` retained, private
  archives SHA-256 verified before cleanup.

## 6. Gates and pre-declared stops

The point of this test is **clogging, not latency**: does work pile up
faster than it drains until the node chokes? A node where every read is slow
but completes at the rate it arrives runs forever; a node where reads arrive
at 15/s and complete at 13/s is dead in an hour, no matter how fast the first
read was. The primary gates say that directly; the latency percentiles are
banked in the receipt and **reported, not gated**.

Bank the receipt as "sustained at the contract rate" only if all hold:

- **G1 steady state, no unbounded growth (the clog gate):** across the
  phase-A window, after the warm-up conversion, the in-flight count levels
  off and stays bounded (declared band, no sustained upward trend across the
  window); host RSS and engine memory plateau; the ClickHouse parts count
  and merge backlog stay bounded (merges keep up with the writer stream and
  delivery writes); and achieved holds ≥ 95% of the offered 15 reads/s with
  no unexplained scheduler deficit. Any one of these climbing without bound
  is the clog forming — it is named as the failing line, and that naming is
  the result.
- **G2 drain (the verdict):** when the offered load stops, the backlog
  empties — all in-flight work completes within the declared drain bound
  (3× the median single-read wall time from load stop, pre-declared here, not
  chosen later), queues are empty, and no resource trace resumes growth
  afterwards. A clogged node fails here even if the window itself looked
  stable.
- **G3 correctness:** zero exact ordered response divergence against the
  independent oracle across all measured responses.
- **G4 errors:** zero 5xx, zero content-correctness errors, zero timeouts;
  any 429 is counted, reported, and attributed (a 429 under declared offered
  load is a saturation signal, not a silent drop).
- **G5 envelope:** no OOM, no engine memory-cap refusal, no disk
  exhaustion; resource traces banked and reconciled against the counter
  deltas.
- **G6 completeness:** every artifact in §5 present, hashes verified,
  cleanup verified, claim-boundary text present.

**Reported, not gated:** p50/p95/p99 per window and across windows, with
sample counts and uncertainty. The 500 ms product target remains a reported
success line — no banked single-read arm meets it, and this test's job is
sustained offered load, not the per-read latency fix (which is the
application-side fence/assembly remainder, separate and named).

**Pre-declared stop criteria** (STUDY.md §6: declare them, or report curves
without a binary claim — this contract declares them):

1. Any exact ordered divergence → immediate stop, no comparison costs.
2. Engine memory-cap refusal, OOM risk, or disk exhaustion → stop, bank the
   curve to that point with the failing resource named.
3. Sustained offered-load collapse: achieved < 50% of offered for 60 s
   consecutive → saturation stop; the achieved maximum sustained rate and
   its resource attribution are the result.

A stop under 2 or 3 is **not a failed run**: it banks the breaking point,
the failing resource, and the curve, and converts "where the budget says you
break" into "where it actually broke."

## 7. Claim boundary (carried verbatim into RESULTS.md)

**Established, if the gates pass on the reference node:** the machine the
budget names sustains the realism contract's peak offered rate (15 complete
uniform K20 reads/s) and its daily-average rate (2.9 reads/s) against the
frozen one-million-author store, under mixed load, reaching steady state
without unbounded growth and draining when the load stops. The budget was
right, stated as a measurement on the named machine, and the "sizing target,
not measured capacity" line for the contract load is retired.

**Established, if the gates pass on a scoped rental:** the CPU/memory/
concurrency dimensions of the budget hold at the contract rate with storage
proven non-binding; the budget's disk line remains the R630 receipt.

**Not established, stated in the receipt:**

- Day-scale durability — the windows are bounded (≤ 40 min measured);
  long-horizon merges, TTL reconciliation and background jobs are out of
  scope and named as such.
- The stepped concurrent-user funnel (1k–20k VUs) — Study L, separate
  remainder, unchanged.
- The reference-array disk supply line under mixed load — stays rating-based
  until the R630 receipt banks it. On a rental it stays out of scope by the
  §2 scope restriction, and no disk-supply claim is made for any machine
  other than the one measured.
- Full-store hybrid savings — the 0.54 GB/s remains ratio-transfer arithmetic
  until the full-store hybrid arm runs.
- Audience diversity, media, engagement and the app's four-call page — the
  frozen store's fixture caveats, §2.

## 8. Sequence (each step a separate gate; no step implies the next)

1. **Source PR (separate, reviewable):** committed runner on the existing
   costfn machinery — `dau_sustain_workload.py` (frozen workload definition:
   phases, rates, reader pool, writer stream, schedule generator; pure and
   offline) and `dau_sustain_run.py` (host-side driver: restore-verification
   hooks, phase execution, stop criteria, receipt emission; reuses the
   pinned client, receipt adapter, oracle comparison and statement
   inventory). Offline/no-engine controls pin, at minimum: schedule and
   offered-vs-achieved accounting (no silent closed-loop reduction); all
   three stop criteria and their bank behavior; writer-stream discipline
   (rate, actor rotation, no media, no grants beyond the fixture); receipt
   accounting (additive totals, content-free records); oracle-gate wiring and
   divergence stop; calibration-vs-measured separation. `bench.py` is not
   touched and not reused.
2. **Green checks, merge.** Source only; the merge grants no admission.
3. **Restore preflight** on the admitted host: store, oracle, furniture,
   writer actors and read receipts verified (the banked restore path). Setup,
   not measurement. On the reference node this is the same restore the
   seventh-draft on-array measurement uses — the two receipts share machine
   and store.
4. **Calibration run:** 2.9 reads/s for 120 s plus a 15 reads/s burst of 60 s,
   verifying the measurement pipeline, oracle comparison, counter deltas and
   the clog-trace instruments (§6 G1/G2), and establishing which resource
   lines (disk, memory, CPU, connections) have headroom at the contract
   peak. Banked as calibration, explicitly not a result. On a rental host
   the sustained window is additionally admitted **only if storage is
   provably non-binding** (NVMe-backed, headroom measured); on the reference
   node no line is excluded — the criterion's job is to find and name
   whichever binds first, disk included.
5. **Sustained run:** phase W → A → B → D per §3, under the task-mode
   admission, agent supervision at ~300 s intervals and the provider
   backstop (24 November directive: the poweroff timer is a failsafe, not a
   deadline).
6. **Receipt, verification, cleanup:** §5 artifacts, off-host SHA-256
   verification, owned cleanup with provider readback, RESULTS.md with the
   §7 claim boundary verbatim.

## 9. Admission packet (binds the run; no admission exists until issued)

| Parameter | Value |
|---|---|
| Host (primary) | the budget's reference node — R630 per `ubuntu-deployment/HARDWARE-UPGRADE-PLAN.md` (2× E5-2698 v3 32C/64T, 128 GB / 8ch DDR4, 4× 2 TB SanDisk SSD Plus in two mirror pairs, 10 GbE), owned research volume/VM, production stack untouched; gated on hardware landing |
| Host (scoped rental alternative) | 64-thread / ≥128 GB cloud rental, NVMe-backed storage proven non-binding in calibration per §10; receipt scoped per §2; availability verified at admission |
| Storage headroom | rental path only: calibration-measured before the sustained window, must exceed the contract-peak read demand (~1.85 GB/s logical aggregate, planning arithmetic from the banked single-read cost). Reference-node path: no exclusion — the clog gate names the binding line |
| Engine / envelope | ClickHouse 26.10.4.207; 32/28/22 GiB on the rental path, declared reference-node limits on the primary path |
| Store | snapshot `255003176`, generation fingerprint and receipts checked before reuse |
| Provider backstop | rental path: 12 h poweroff failsafe. Reference-node path: task window bound by the admission, owned machine, no provider timer |
| Compute ceiling | rental path: **$25.00** total task (64-thread class rate verified at admission; storage/egress separate, reported separately; not an invoice). Reference-node path: owned hardware, no per-hour cost; time/electricity reported as estimate, not an invoice |
| Admission mode | task-mode (`costfn_run_rules` + `costfn_task_id`); one admission covers the task; routine repairs re-admit nothing but each repair is bound to its executing source |
| Workload | §3 exactly as frozen; any rate change is a new admission, not a parameter tweak |
| Stops | §6 as pre-declared; the operator's cancellation always wins |

Issuance requires: step 1 merged, step 2 green, and an explicit operator
admission of this packet. This document, and any merge of it, grants none of
those three.

## 10. Design note: the test runs on the machine the budget names

The budget's job is to derive what one million accounts need — as a machine:
this much CPU, this much storage bandwidth, this much memory. A sustained
test earns its place by running on *that* machine; run it on a different one
and the result floats free of the claim. The arithmetic makes the small-host
case explicit: at 15 reads/s the banked single-read costs (~1.1–1.3 s summed
native duration each) ask for ~17–20 thread-seconds of engine work per
second. An 8-vCPU droplet has 8 thread-seconds available. It clogs by
arithmetic before the first measurement, and its breaking point — the
droplet's CPU — is a statement about the droplet, not the design. Even a
clean pass on a foreign, smaller machine would only prove the budget
over-specified. So the host is the reference node, full stop, with one
scoped exception below.

On the reference node **no resource line is excluded by design** — including
storage, where the arithmetic already says indexed peak demand (~1.85 GB/s
logical aggregate from the banked single-read cost) exceeds the array's
rated supply (1.09 GB/s one-drive-per-pair). That is not a flaw in the test;
it is the test. The clog criterion (§6 G1/G2) does not presuppose which line
binds: it finds the line, names it, and banks the curve. If the disk line
clogs first on the reference node, the receipt says exactly that — which is
the paper's storage argument measured, and the full-store hybrid arm's case,
not a failed test.

The scoped rental exception exists for the window before the hardware lands.
A 64-thread rental matches the CPU and memory dimensions but cannot match
the SATA mirror array — the budget's disk line is not rentable. Storage is
therefore made deliberately non-binding on a rental (NVMe-backed, headroom
calibration-measured per §8 step 4), and the receipt carries the scope
restriction. The asymmetry there is the same as before:

- **A pass on a rental is necessary but not sufficient for the array
  claim.** It establishes that the software — CPU, memory, app-side
  concurrency, delivery work — sustains the contract rate with storage
  headroom to spare; the disk line remains the R630 receipt.
- **A failure on a rental is universal.** If the node breaks while storage
  has measured headroom, the break is software and it breaks on every
  machine, reference node included. That failure binds the program, not just
  the rental.

## 11. Relationship to the standing records

- **STUDY.md (preregistered, setup only):** Study L is the stepped funnel on
  the relational datasets; this contract is the contract-rate receipt on the
  frozen costfn store. Neither supersedes the other. If this run's breaking
  point lands at or above the contract peak, Study L's low levels are the
  natural next measurement; if it lands below, the application-side
  remainder (fence/assembly latency, concurrency) is prioritized before L.
- **Seventh-draft README (pending on-array measurement):** shares the
  machine and the restore with this test on the reference node; the two
  receipts sequence at the operator's choice once the hardware lands. This
  test does not substitute for the disk-supply measurement — the clog gate
  names the binding line, the on-array receipt measures the net supply.
- **HYBRID-K20-FINDINGS / RD4:** the single-read costs and the
  application-side naming (fence latency, live publish/cleanup unproven)
  stand; this test adds the sustained-rate dimension to the same store.
- **paper-submission.md:** strategy only; nothing here authorizes a
  submission or changes banked evidence.
