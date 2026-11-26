# Full-store hybrid K20: the missing two-by-two cell, measured

**Status: EVIDENCE_COLLECTED.** The hybrid (dual) layout ran on the full
frozen store at exact ordered oracle parity, twice. The measured
steady-state demand replaces the ratio-arithmetic row; the measured ratio
is reported, not assumed from the slice; no live-maintenance, supply or
production claim follows.

## Scope and sequence

Task `rd4-hybrid-k20-full-store` (one operator approval; task-mode admission;
24 h host failsafe armed and verified), host `web10-fanout-f-5c6e4c8f8554`
(DO `s-8vcpu-32gb-amd`, nyc3, $0.25/h), restored from retained snapshot
`255003176`. Engine 26.10.4.207, 32/28/22 GiB envelope. Source bound
`abeaf1220` at admission; the run ended on `9c5de4ab` after three
PR-reviewed in-task source repairs merged to dev (#1660 settled-OPTIMIZE
no-op, #1663 one-shot K20 re-entry, #1665 gate expectations on resume).
Admission vehicle corrections v1→v5 (billboard seed string, scope
`F_GATES_ONLY`, banked P citation key, source re-bind) are recorded in the
private archive; the workload, host and budget were unchanged throughout.

Setup (not measurement): declared post-merge steady state — `OPTIMIZE FINAL`
on the version-carrying canonical hot tables with parts census banked
pre/post (documents single part, 88,200,363 rows; doc_groups single part;
content_events 3 parts, 1,600,000,000 rows; the v5 steady-state receipts
state their own: documents 177.8 s, doc_groups 93.7 s, group_members 29.6 s
native — the post-mutation part set was not yet consolidated). The banked
full-store adoption then ran: K20 count setup, prepared-snapshot receipts,
fanout (PR #1572 P Step0 cited, not re-measured), tallies, pairs, pin index,
and the event aggregate seed — 319 owned-day slices PASS with exact
per-day reconciliation to the frozen census, then the bounded all-time
backfill (489 batches). The four composition gates (refs, paired-tallies,
views, ads) passed; the views gate's independent raw-oracle query needed one
warm-cache retry against its banked 120 s setup cap after a cold first touch
(120.004 s; recorded, not a native stop).

## Satellite build (charged setup, separate from the reads)

Skinny attachment-history satellite built on the full store from canonical
`doc_groups`: DDL + 32 receipted chunked INSERTs (one per owned
`cityHash64` subdivision — no single statement carried the whole history)
+ `OPTIMIZE FINAL` + freeze + 32×2 exact censuses. **All 32 buckets: 0
mismatches, 0 tombstone ties.** Total copy: 92,201,626 rows written
(exact full-key history, versions and multiplicity preserved), 122.1 s
native summed across the 32 statements. The canonical `doc_groups` part
digest was verified unchanged before and after (the build never wrote the
source).

## Measured reads (the result)

Two repeated frozen uniform K20 samples through the hybrid path
(`hybrid-K20-r1-attempt-6`, `r2`), each warmup + measured, each passing the
independent complete-response oracle at **exact ordered parity** (policy,
versions, payloads):

| Trial | Phase | Complete HTTP wall | Captured logical bytes | Summed native ms | Peak individual statement memory |
|---|---|---:|---:|---:|---:|
| 1 | warmup | 8,896.143 ms | 116,354,702 | 2,154 | — |
| 1 | measured | 9,510.402 ms | **92,998,217** | 1,533 | 106,237,961 B |
| 2 | warmup | 7,769.764 ms | 92,998,217 | 1,261 | — |
| 2 | measured | 8,721.972 ms | **92,998,217** | 1,390 | 110,199,130 B |

Captured read rows: 1,424,566 per measured sample. The two measured samples
are byte-identical in captured logical demand (deterministic store, frozen
request).

## What this settles — and only this

The hybrid's per-read logical-byte demand at 1 M-author scale is
**92,998,217 bytes/read (≈ 88.7 MiB)** in the post-cleanup steady state.
Against the cited indexed baseline (banked PR #1618 same-store receipt:
123,119,689 logical bytes, ≈ 7,017.152 ms complete HTTP, exact parity,
**cited, not re-measured**), the measured steady-state ratio is
**0.7553 (−24.5 %)**. This replaces the arithmetic row
(123.1 MB × 0.294 ≈ 36.2 MB/read → ≈ 0.54 GB/s at the 15 reads/s contract
peak): the measured demand is 2.5× the slice-arithmetic estimate, in the
transient→steady direction the contract allowed for in either direction.

The slice's banked −70.6 % (620.85 → 182.34 MB) remains the **transient
pre-merge regime** reference — the slice's retained history is what that
number priced; this run prices the steady state. Both are reported, neither
is relabelled.

Complete HTTP wall time rose vs the cited indexed single-read (8.7–9.5 s
measured vs ≈ 7.0 s cited) — consistent with the slice finding that the
hybrid wins logical reads but not wall time; wall time is reported, and the
500 ms product line remains unmet by both layouts (no single-read arm meets
it).

**Not settled** (stated in the receipt): live concurrent publish/cleanup
(the six-case gate stays closed — this run is reads on a frozen store), any
array's net supply under mixed load, day-scale durability, and any
production change. The fault suite is NOT_RUN; six-case NOT_ADMITTED.

## Custody and cleanup

- Private archive `hybrid-receipts-20261126.tgz` (144,361,576 bytes,
  SHA-256 `7d4d47770d9e106bfa040b46b0978cb9cc61586352d7d3645fd57f5eca659be4`)
  verified off-host: full run root — task records (all five admission
  vehicle revisions and the attempt-1…6 history), steady-state receipt,
  satellite proof + 32-bucket census, gate parity receipts, aggregate-build
  receipt (319 slices + 489 all-time batches + reconciliation), both hybrid
  cells (captured stages, SQL digests, native receipts, request-tagged
  auxiliary inventory), admissions, and repair receipts (count DDLs, fanout
  DDLs, billboard round-trip, Seed-anchor removals).
- Snapshot `255003176` retained, untouched.
- Owned resources (droplet, firewall, SSH key, tag) deleted with provider
  readback; final state verified off-host before deletion.
- Estimated compute: host 01:05 → 17:35 UTC ≈ 16.5 h × $0.25/h ≈ **$4.12,
  not an invoice**; storage separate (none retained beyond the snapshot).
