# Arm T diagnostic — baseline, setup and measured outcome

This is additive evidence under the operator's four-hour/$2 diagnostic exception,
not a frozen study cell, a formal repeated result or a submission-readiness claim.
The preserved [13 November negative receipt](../REALISM-SMOKE-20261113.json)
is unchanged.

## Completed diagnostic outcome

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
