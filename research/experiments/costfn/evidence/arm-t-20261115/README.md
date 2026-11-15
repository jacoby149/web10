# Arm T diagnostic — baseline admission evidence

This is additive evidence under the operator's four-hour/$2 diagnostic exception,
not a frozen study cell, an Arm T result or a submission-readiness claim.
The preserved [13 November negative receipt](../REALISM-SMOKE-20261113.json)
is unchanged.

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
the source committed with this evidence. The second partial table is retained;
its final row count is not asserted here. Both attempts stop the owned
containers, neither reaches a transpose feed/parity request, and neither is a
read-performance result. No snapshot completion or successful memory bound is
inferred from selecting a disk-capable join algorithm.
