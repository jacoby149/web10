# Full-store hybrid K20 — contract

**Status:** planning contract, dated 25 November 2026. This document defines
the next RD4 measurement — the missing cell of the two-by-two: the hybrid
(dual) layout on the full frozen store. It is the next experiment to run. It
authorizes **no source change, no host, no admission, no measurement, and no
submission**.

## 1. What it settles, and only that

RD4 measured the hybrid on the fixed slice
([findings](HYBRID-K20-FINDINGS.md): 620.85 → 182.34 MB captured logical
bytes, −70.6%, exact ordered parity, both orders) and the indexed layout on
the full store (123,119,689 logical bytes, ~7,017 ms HTTP, PR #1618). The
missing cell is **the hybrid on the full store**. Today that cell is ratio
arithmetic: 123.1 MB × 0.294 ≈ 36.2 MB/read → ~0.54 GB/s at the 15 reads/s
contract peak. This run replaces that row with a measurement.

**Settled:** the hybrid's per-read logical-byte demand at 1M scale, and with
it the budget's disk-*demand* line on the dual layout (the derived
production cap arithmetic — array rating ÷ measured demand — follows in the
receipt, labelled arithmetic). The measured ratio may differ from the
slice's −70.6% in either direction: the slice is deliberately
attachment-history-heavy (323+54 granules), the full-store fixture is
lighter and text-only; the receipt reports the measured ratio, not the
slice's.

**Not settled:** live concurrent publish/cleanup (the six-case gate stays
closed — this run is reads on a frozen store), any array's net *supply*
under mixed load (ops matter, separate), day-scale durability, and any
production change.

## 2. Store, host, and identity bindings

- **Store:** the frozen million-author store from retained snapshot
  `255003176` — the exact store of PR #1612/#1618. Before reuse, check the
  canonical generation fingerprint and native receipts (24 November
  directive); repair or rebuild only invalid work.
- **Host:** the banked DO AMD 8-vCPU / 32 GiB / 400 GiB SKU (nyc3,
  $0.25/hour) — this is single-read measurement, not sustained load; no
  sizing beyond the banked envelope is required. Actual provisioned shape,
  region, price and dates verified into the receipt.
- **Engine:** ClickHouse 26.10.4.207, 32/28/22 GiB envelope — matching the
  banked runs.
- **Reader identity:** the exact frozen uniform K20 request and authority of
  the banked full-store runs.
- **Engine boundary:** at the API -> ClickHouse boundary, the API supplies
  authorized SQL; the engine executes it. The satellite is a research arm
  beside the canonical store under the RD4 write discipline — no platform
  schema, API or live-maintenance change (D60).

## 3. Workload (frozen)

1. **Satellite build (setup, not measurement):** build the skinny
   attachment-history satellite on the full store from canonical history —
   all historical placements, exact versions/tombstones/multiplicity
   retained, the independent edge census and frozen parts preceding any
   read, canonical documents remaining the sole content source. Reuse the
   RD4 machinery (`hybrid_k20_attachment.py` builder and
   `hybrid_k20_slice.py` patterns). Any source change is a separate reviewed
   PR with offline controls, merged green, before any host work — the run
   is bound to its executing source.
2. **Hybrid reads (measured):** the frozen uniform K20 request through the
   hybrid path (`hybrid_k20_attachment_api.py`), **two repeated samples**,
   banked separately — not a p95, not a capacity measurement.
3. **Indexed baseline:** cited from the banked PR #1618 receipt (exact
   parity, 123,119,689 logical bytes, ~7,017 ms), not re-measured — the
   standing pattern (cited banked baseline, no repeat).

## 4. Gates

- **G1 parity (pre-committed, before any cost is published):** each hybrid
  sample passes the independent complete-response oracle at exact ordered
  parity — policy, versions and payloads. Any divergence stops the task
  immediately and publishes no comparison costs (24 November directive).
- **G2 costs:** native query IDs/plans, actual rows, captured logical bytes,
  summed native duration and complete HTTP wall time by stage and in total,
  plus peak individual statement memory; the satellite build's rows/bytes/
  duration charged as separate setup cost, never folded into the read.
- **G3 custody:** state/native parts verify off-host before owned cleanup;
  cleanup verified by provider readback; snapshot `255003176` retained;
  private archives SHA-256 verified before cleanup; estimated compute
  reported separately from storage and the invoice.
- **Claim boundary (carried verbatim into RESULTS.md):** the measured
  full-store hybrid demand replaces the arithmetic row; the measured ratio
  is reported, not assumed from the slice; no live-maintenance, supply or
  production claim follows.

## 5. Admission packet (binds the run; no admission exists until issued)

| Parameter | Value |
|---|---|
| Host | DO AMD 8-vCPU / 32 GiB / 400 GiB, nyc3, $0.25/hour, actual shape verified |
| Engine / envelope | ClickHouse 26.10.4.207, 32/28/22 GiB |
| Store | snapshot `255003176`, generation fingerprint and receipts checked |
| Provider backstop | 24 h poweroff failsafe (24 November directive: failsafe, not deadline) |
| Compute ceiling | **$5.00** total task (estimated active window 4–8 h ≈ $1.00–2.00, not an invoice); the ceiling binds; storage separate |
| Admission mode | task-mode (`costfn_run_rules` + `costfn_task_id`); one admission covers the task; routine repairs re-admit nothing, each bound to its executing source |
| Workload | §3 exactly as frozen; any change is a new admission, not a parameter tweak |
| Stops | G1 divergence; native 22 GiB / 600 s caps; provider backstop; operator cancellation always wins |

Issuance requires: the source state (step 3.1) merged green — new source or
verified existing — and an explicit operator admission of this packet. This
document, and any merge of it, grants neither.

## 6. Relationship to the standing records

- **HYBRID-K20-PREFLIGHT / FINDINGS:** the slice results stand unchanged;
  this run is the scale cell of the same two-by-two, not a repeat of RD4.
- **The six-case gate:** stays closed. Live publish/cleanup is a separate
  remainder; this contract implies no admission for it.
- **DAU-SUSTAINED-LOAD.md:** independent — a different question (software
  clog on a budget-sized NVMe host vs. per-read disk demand on the frozen
  store) and a different host class. No shared dependency; the operator
  sequences the two.
- **paper-submission.md:** strategy only; this run authorizes no submission
  and changes no banked evidence — it adds one measured cell.
