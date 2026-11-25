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
| **This test** — sustained contract rate, mixed load | admitted DO AMD host, frozen store | concurrency / latency distribution / CPU / memory at the claim line |
| R630 on-array run (seventh-draft README, pending hardware) | assembled R630, four transplanted drives | reference-array net disk supply (rated → measured) |
| Full-store hybrid run (separate admission) | admitted host, frozen store + built satellite | hybrid band (0.54 GB/s ratio-transfer → measured) |

## 2. Store, host, and identity bindings

- **Store:** the frozen million-author store as restored by the costfn
  pipeline from retained snapshot `255003176` — the exact store of every
  banked costfn run. Before reuse, check the existing slice manifest,
  canonical generation fingerprint and native receipts (24 November
  scheduling directive); repair or rebuild only invalid work.
- **Host class:** a DigitalOcean **NVMe-backed droplet** (storage-optimized
  line or equivalent), 8 vCPU / 32 GiB class so memory and CPU comparability
  with the banked runs hold. Storage is deliberately **not a candidate for
  the binding line** on this host — see the design note, §10. The exact SKU,
  price, region and provisioned shape are verified at admission and into the
  receipt, never assumed from the catalogue label. Fallback only if the
  NVMe class is unavailable on the account tier at admission: the banked
  `s-8vcpu-32gb-amd` SKU — and then calibration must first prove disk
  headroom per §10, or the receipt is scoped to that host's storage ceiling
  and the test is re-run on the NVMe class.
- **Engine:** ClickHouse 26.10.4.207, memory envelope 32/28/22 GiB, matching
  the banked runs so single-read costs remain comparable.
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
- **Resource traces:** host RSS peak + trace, CPU utilization, ClickHouse
  parts/merge pressure, engine memory against the 22 GiB cap, OS counter
  deltas for bytes read and written with counter units and elapsed time. On a
  droplet these are virtual-device counters; the receipt says the disk line
  here is the concurrency/envelope line, not the reference-array supply line.
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

Bank the receipt as "sustained at the contract rate" only if all hold:

- **G1 rate:** achieved ≥ 95% of the offered 15 reads/s across the full
  phase-A window, with no unexplained scheduler deficit.
- **G2 correctness:** zero exact ordered response divergence against the
  independent oracle across all measured responses.
- **G3 errors:** zero 5xx, zero content-correctness errors, zero timeouts;
  any 429 is counted, reported, and attributed (a 429 under declared offered
  load is a saturation signal, not a silent drop).
- **G4 envelope:** no OOM, no engine memory-cap refusal, no disk exhaustion;
  resource traces banked and reconciled against the counter deltas.
- **G5 completeness:** every artifact in §5 present, hashes verified,
  cleanup verified, claim-boundary text present.

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
break" into "where it actually broke." The 500 ms product target is a
reported success line on the latency distribution, **not a stop condition
and not a gate** — no banked single-read arm meets it, and this test's job is
sustained offered load, not the per-read latency fix (which is the
application-side fence/assembly remainder, separate and named).

## 7. Claim boundary (carried verbatim into RESULTS.md)

**Established, if the gates pass:** the node sustains the realism contract's
peak offered rate (15 complete uniform K20 reads/s) and its daily-average
rate (2.9 reads/s) against the frozen one-million-author store, under mixed
load (publication writes and natural merges active), on the measured DO host,
within the declared resource envelope, with a banked latency distribution and
zero correctness divergence. The "sizing target, not measured capacity" line
for the contract load is retired.

**Not established, stated in the receipt:**

- Day-scale durability — the windows are bounded (≤ 40 min measured);
  long-horizon merges, TTL reconciliation and background jobs are out of
  scope and named as such.
- The stepped concurrent-user funnel (1k–20k VUs) — Study L, separate
  remainder, unchanged.
- The reference-array disk supply line — stays rating-based until the R630
  on-array run. This host's storage (measured with headroom, §10) answers the
  concurrency/envelope question only; the result does **not** transfer to
  slower storage, and no disk-supply claim is made for any machine other than
  the one measured.
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
3. **Restore preflight** on the admitted droplet: store, oracle, furniture,
   writer actors and read receipts verified (the banked restore path). Setup,
   not measurement.
4. **Calibration run:** 2.9 reads/s for 120 s plus a 15 reads/s burst of 60 s,
   verifying the measurement pipeline, oracle comparison and counter deltas,
   and — per §10 — establishing which resource lines (disk, memory, CPU,
   connections) have headroom at the contract peak. Banked as calibration,
   explicitly not a result. The sustained window is admitted **only if
   storage is provably non-binding** on this host; if storage binds first,
   the receipt is scoped per §10 and the test re-runs on the NVMe class.
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
| Host | DO NVMe-backed droplet, 8 vCPU / 32 GiB class (storage-optimized line or equivalent), nyc3; SKU/price verified at admission, provisioned shape verified into the receipt. Fallback: banked `s-8vcpu-32gb-amd` only if the NVMe class is unavailable, subject to the §10 calibration gate |
| Storage headroom | calibration-measured before the sustained window; must exceed the contract-peak read demand (~1.85 GB/s logical aggregate, planning arithmetic from the banked single-read cost) per §10 |
| Engine / envelope | ClickHouse 26.10.4.207, 32/28/22 GiB |
| Store | snapshot `255003176`, generation fingerprint and receipts checked before reuse |
| Provider backstop | 12 h poweroff failsafe |
| Compute ceiling | **$5.00** total task (estimated active window 4–6 h ≈ $1.00–1.50, not an invoice); the ceiling binds; storage is separate and reported separately |
| Admission mode | task-mode (`costfn_run_rules` + `costfn_task_id`); one admission covers the task; routine repairs re-admit nothing but each repair is bound to its executing source |
| Workload | §3 exactly as frozen; any rate change is a new admission, not a parameter tweak |
| Stops | §6 as pre-declared; the operator's cancellation always wins |

Issuance requires: step 1 merged, step 2 green, and an explicit operator
admission of this packet. This document, and any merge of it, grants none of
those three.

## 10. Design note: why the load host's storage is fast

The single-read cost was measured at 123,119,689 logical bytes with ~7,017 ms
wall time, one read at a time. At the contract peak (15 reads/s × ~7 s
in-flight) the aggregate read demand is ~1.85 GB/s logical — already above
the reference array's rated 1.09 GB/s, which is precisely why the array line
is its own pending receipt on the R630. If the load host's own storage were
on that order or slower, phase A would break on *the load host's disk* — a
third machine the paper claims nothing about — and the receipt would be
ambiguous: we would have measured a storage ceiling no claim needs. The banked
AMD SKU's disk has never been measured under sustained concurrent load; it is
a known unknown, so it is removed as a candidate rather than guessed at.

Making storage fast is what makes the test informative, by a deliberate
asymmetry:

- **A pass on fast storage is necessary but not sufficient for the array
  claim.** It establishes that the software — CPU, memory, app-side
  concurrency, delivery work — sustains the contract rate with storage
  headroom to spare. The reference-array line still requires the R630
  on-array receipt, and the arithmetic already says indexed demand exceeds
  array rating.
- **A failure on fast storage is universal.** If the node breaks while
  storage has measured headroom, the break is software — CPU, memory, or the
  application side — and it breaks on every machine, reference array
  included. That is the information the paper needs, and the only kind of
  failure the receipt can attribute cleanly.

Calibration therefore gates the sustained window (§8 step 4): it measures
disk headroom against the contract-peak read demand, and the sustained window
runs only if storage is provably non-binding. If storage binds first, the
receipt is scoped to that host's storage ceiling and the test re-runs on the
NVMe class — it is not banked as a software result.

## 11. Relationship to the standing records

- **STUDY.md (preregistered, setup only):** Study L is the stepped funnel on
  the relational datasets; this contract is the contract-rate receipt on the
  frozen costfn store. Neither supersedes the other. If this run's breaking
  point lands at or above the contract peak, Study L's low levels are the
  natural next measurement; if it lands below, the application-side
  remainder (fence/assembly latency, concurrency) is prioritized before L.
- **Seventh-draft README (pending on-array measurement):** unchanged; this
  test does not delay it and does not substitute for it.
- **HYBRID-K20-FINDINGS / RD4:** the single-read costs and the
  application-side naming (fence latency, live publish/cleanup unproven)
  stand; this test adds the sustained-rate dimension to the same store.
- **paper-submission.md:** strategy only; nothing here authorizes a
  submission or changes banked evidence.
