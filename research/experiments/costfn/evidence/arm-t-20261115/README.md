# Arm T diagnostic — baseline, setup and measured outcome

This is additive evidence under the operator's four-hour/$2 diagnostic exception,
not a frozen study cell, a formal repeated result or a submission-readiness claim.
The preserved [13 November negative receipt](../REALISM-SMOKE-20261113.json)
is unchanged.

## Completed diagnostic outcome

### Subsequent single-part consolidation diagnostic

`consolidated/result.json` retains the identical-query experiment after physical
OPTIMIZE of only this isolated store's documents/original links/transpose. Every
table reaches one active part in its sole partition; UUID/schema/count and
order-independent sum/xor row hashes match before/after. Hashes are not exact
row-equality proof. Setup steps total460.767s; measured sources and all three
native query hashes match the previous merge-first run.

All four main pages pass exact independent IDs/order/checked-projection parity.
Native footprints are stable across all four observations:

| Component | Before rows | Single-part rows | Single-part logical bytes | Measured native duration |
|---|---:|---:|---:|---:|
| Group slices/global page | 1,204,224 | 172,032 | 17,102,572 | 394–456ms |
| Bounded canonical verification | 1,477,403 | 188,460 | 18,191,170 | 101–134ms |
| Final main/related metadata | 4,945,374 | 1,359,872 | 121,169,701 | 379–496ms |
| Total | 7,627,001 | 1,720,364 | 156,463,443 | summed874–1086ms |

Measured sums are1086/996/874ms; first two stages alone read35.294MB. Part
consolidation materially reduces physical read amplification, but neither a
5–10MB combined budget nor tens-of-milliseconds total follows. Both targets
remain missed. Main HTTP observations are73.364/67.418/63.925s; reactions still
return HTTP400/native159, inventory/preparation still hits native241, and
comments/views are not reached. Full sequence remains NOT_ESTABLISHED.

Only filesystem/service progress was inspected during these measurement windows;
there is no live SQL-inspection contamination in this run. Attribution still
uses serial wall windows, not per-request distributed tracing. Preserve the
previous run's caveat rather than pooling sequence or latency observations.
All owned containers are stopped, service exit0. No further run, satellite/ad
rewrite, formal cell/p95/K1000/production/submission authorization follows.

### Subsequent merge-first diagnostic

`merge-first/result.json` records the operator-approved query-order revision on
the same verified snapshot, without changing original build receipts or tables.
All four returned main pages pass exact independent parity. The three real main
stages read **7,627,001 rows / 520,454,044 logical bytes** each:

| Component | Rows | Logical bytes | Measured native duration |
|---|---:|---:|---:|
| Group slices/global page | 1,204,224 | 101,778,249 | 473–556ms |
| Bounded canonical verification | 1,477,403 | 91,172,167 | 100–133ms |
| Final main/related metadata | 4,945,374 | 327,503,628 | 393–455ms |

Measured native sums are999/1116/1057ms. This is about3× fewer core rows than
v1, not a target pass. Main HTTP observations are64.023/68.544/64.572s; reactions
still fail HTTP400/native159 and preparation/inventory still hits native241.
Comments/views are not reached; full-sequence parity stays NOT_ESTABLISHED.

**Instrumentation caveat:** live progress SQL used the measured ClickHouse user
during sequence windows. A system.query_log inspection contains stage-marker
strings; the loose classifier incorrectly includes its query ID
`f0e49276-1e41-41c9-a0d3-9b13ecb30323` as a fourth core stage in the last sample
(1,223 rows/2,599,957 bytes/19ms). Raw receipts are unchanged. The derived result
excludes exactly that identified inspection query, leaving matching three-stage
hashes/read footprints in all four samples. Raw sequence-window totals remain
nonexclusive, and observed HTTP times are not a clean latency benchmark. This
iteration does not authorize a clean rerun or further optimization/engine work.

Three pre-run snapshots have no active merges and stable4 document/9 original
link/7 transpose parts. That establishes observed idle state, not a single-part
store. Owned containers are stopped, service exit0; provider deadline remains
05:17:51UTC. No formal trials/p95/K1000/production/submission claim.

### Original v1 diagnostic

[`result.json`](result.json) separates three verdicts:

- **Snapshot VERIFIED:** 92,200,600 links; full metadata reconciliation passes.
  Full-sorting-merge copy takes 326.63s, reconciliation 409.99s, and total setup
  873.233s. Both earlier failed variants are retained and contain zero rows.
- **Main-page projection PASS:** the excluded warm-up and all three measured
  main responses return HTTP 200 and match the independent canonical reference's
  21 IDs/order and checked projected values. Whole returned-row hashes also match
  across all four pages. See `main-projection-parity.json`.
- **Full sequence NOT_ESTABLISHED; targets MISSED:** every reaction follow-up
  returns HTTP 400 with native code159 timeout. Comments/views and exact live
  delivery verification are not reached. This is not a wrong-main-page mismatch,
  a successful full sequence, a p95 estimate or a formal K20 cell.

All three measured observations have the following **core SQL** footprint:

| Component | Rows read | Logical bytes read | Native duration range |
|---|---:|---:|---:|
| Candidate selection + canonical point checks | 18,107,119 | 1,129,464,553 | 2,104–2,491 ms |
| Final canonical main + related metadata | 4,945,374 | 327,503,628 | 363–401 ms |
| Both statements combined | 23,052,493 | 1,456,968,181 | summed 2,467–2,869 ms |

This is approximately 15.7× fewer core rows / 16.7× fewer core logical bytes
than the preserved failed main, **not** whole-request savings. It still exceeds
the 25-MB budget before preparation is counted. The sub-500-ms final SELECT
alone is not the main read path: candidate selection and Python compilation
are real work too.

Complete measured main API responses take **59.5–64.5 seconds**. Preparation
accounts for roughly55–60s, including four additional service-scoped reads of
86,744,923 rows each and a node-ad inventory query that fails with native memory
code241 after roughly51–55s. The input contains 300 synthetic node-ad posts;
no empty-inventory result is verified. Reaction errors are native timeouts,
not evidence of malformed payloads. Existing sequence treatments are off in
this isolated main-only arm. Preserve that distinction when comparing Arm D;
no Arm D realism comparator is available here.

`attempt3-build.json`, `native-core-breakdown.json`, `main-request-observations.json`,
`request-metadata.json` and `sequence-parity.json` retain exact source/query/request
bindings. Sequence native totals use exclusive serial HTTP-sequence windows,
not per-query distributed tracing; logical read bytes are not physical disk I/O,
and largest-query tracked memory is not whole-host peak RSS. No further cells or
K1000 run. Diagnostic containers are stopped; the original compute-cleanup
deadline remains 15 November 05:17:51 UTC, and private operational state is not
committed. Frozen input/receipts and production runtime are unchanged.

## Admission and prior setup evidence

`diagnosis.json` binds that receipt's source fingerprints and measured query IDs
to the recovered exact query and native plan. An own-store replay on droplet
619371600 uses the identical query SHA-256 and reads **360,801,800 rows** on
each excluded-warm-up/three measured timeout attempts. New native logical bytes
are **24,374,786,309**, reported separately from the preserved baseline's
24,319,446,938; do not silently substitute or pool them.

The plan selects all **10,767/10,767 document granules** and all
**11,259/11,259 link granules** in each of five planned boundary instances
(four service CTEs, with posts referenced twice). All five policy tables are
empty/NullSource; no background merge is active at the recorded snapshot.
The observed native total equals two complete document/link pairs before the
deadline. That per-table allocation is full-table-equivalent accounting, not
direct per-table runtime counters or evidence the entire planned query completed.
The broad group-first boundary reads are confirmed; historical cache state and
latency causality are not reconstructed.

The first replay setup attempt times out in its independent Discover engagement
oracle at the unchanged 120-second setup ceiling, before any feed request.
An additive exact-ID bound retains the same canonical FINAL/deletion/reference/
group/count semantics without using the transpose. `oracle-native-controls.json`
records equality on five native scopes including document updates/deletions,
removed links, overlapping attachments, cross-author engagement and private/
missing groups; `oracle-query-rewrites.json` also records full-store reader-scope
equality. Frozen oracle files and measured API SQL are not edited; production
SQL remains capped at ten seconds. This is setup evidence, not Arm T parity.

The runtime admission and private operational state remain outside Git. No
credential, signed storage URL, raw dataset or provider management key is present
in these files. Transpose build, connected parity and request measurements are
recorded separately when they actually complete.

`attempt1-build.json` and `attempt1-archival.json` retain the first transpose
setup failure: filling the right join side exceeded the unchanged 22-GiB query
ceiling (22.01 GiB attempted). No feed/parity request ran and the partial table
contains zero rows. Its UUID/table is retained under a failed-build name; only
that experimental table was renamed. The executing builder exactly matches
`a15e6341d:research/experiments/costfn/arm_t.py`. The retry explicitly bounds join
memory/spilling without raising the query/container envelope and uses a new
build receipt. This is a setup failure, not a slow or parity-invalid feed result.

`attempt2-build.json` records that retry, which also fails at 22.00 GiB during
JoiningTransform despite explicit join/spill controls. Its builder SHA matches
`dca44aa0d:research/experiments/costfn/arm_t.py`. The second partial table is
retained under its own failed-build name with zero rows, as recorded by
`attempt2-archival.json`. Both attempts stop the owned
containers, neither reaches a transpose feed/parity request, and neither is a
read-performance result. No snapshot completion or successful memory bound is
inferred from selecting a disk-capable join algorithm.
