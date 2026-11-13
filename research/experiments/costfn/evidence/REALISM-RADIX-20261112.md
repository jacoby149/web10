# Recover validation without regenerating the input

The 1M dataset survived. Its validator ran out of working disk, not input data.
The repair belongs in partition materialization; buying a larger disk would
merely give the same global sort more room to spill.

## Observed failure and retained evidence

On droplet `618505005`, the volume guard stopped the worker at **19:19:05 UTC
on 12 November**. At 21:26 UTC, the service was inactive and the expected
filesystem UUID remained mounted. The last validator log was the 1024-bucket
event COPY, after histogram admission of all **1,600,000,000 rows**, largest
bucket **1,567,748 rows**. There was no passing validation receipt.

The grouped-COPY implementation sorts every full event row by bucket. Its
interrupted external sort left **327,477,231,616 bytes** of DuckDB spill in
28 files. The 400-GiB volume had only about 20 GiB free. A small local timing
improvement had not established full-scale scratch safety.

At **21:30:48 UTC**, the existing completed-stage verifier rechecked the
manifest identity, unchanged generator/contract and every final table's exact
size and SHA-256. Dataset:
`2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
The old status and complete spill filename/size inventory were saved as
`/mnt/costfn-work/costfn-prep/radix-incident-20261112.json`, with a local copy
under `.context/`. Only those exact inventoried `duckdb_temp_storage_*` files
were unlinked after checking the service was inactive and paths were regular,
non-symlink files. Free space returned to **348,845,494,272 bytes**. The final
dataset, old validation database, partial Parquet partitions, logs and source
remain; no partial partition is adopted as a completion checkpoint.

## Bounded hash digits instead of a global sort

Keep the existing complete-key histogram, row-volume planner and maximum
2.5M-row bucket admission. Replace the global `ORDER BY bucket` with radix
materialization: at most **32 destinations per COPY**, with 32 open writers and
the existing 8192-row flush threshold. For 1024 final buckets, the first pass
uses `hash(keys) % 32`; each resulting group uses `(hash(keys) // 32) % 32`.
No writer is evicted to make room for another destination, and no all-event
sort is needed. The 4096-bucket ceiling requires at most three digit levels.

Each group must match the sum of its admitted final-bucket counts. Verified
leaf directories move to their final bucket names. Intermediate Parquet files
are removed only after their children verify; this cleanup is confined to the
new invocation's temporary directory. All-column rows and multiplicities stay
intact, complete keys stay together, and every final bucket is checked again.
An exception retains failed work when requested, never yields a success witness,
and restores writer settings. Empty inputs remain supported.

This deliberately trades one globally sorted write for bounded sequential
digit passes. It is not the previous oversized-bucket repair, a distributed
validator, a scheduler or a checkpoint framework. Keep the **2 GB engine / one
thread** settings; add a **100 GB DuckDB spill ceiling** so a future query
fails before consuming the whole volume. That ceiling covers DuckDB spill,
not all Parquet/database files or process RSS; the mounted-volume reserve
monitor remains necessary.

## Verification and remaining gate

All ten realism Python suites pass locally, including seven partition controls:
exact all-column `EXCEPT ALL` parity in both directions, duplicate-key
co-location, schema/count bounds, indivisible-skew refusal, setting restoration,
COPY failure, corrupted-intermediate refusal and three-level exact bucket
assignment. A local existing 10k/16M-delivery input independently passes all
**50 checks** with this validator; this is not a repeated cloud prerequisite.
The two remaining research CI Python suites, all five offline Bun capture tests
and research-surface Ruff lint also pass (twelve Python suites in total).

Candidate validator SHA-256:
`593e881dbac66cf1de74e8b1b3557d3352f7ece41ffa6f6d7f0f71e4332f622d`.
Same-host probes are staged separately on the persistent volume at
`radix-recovery-20261112/`, not over the live source. All seven controls pass
there. A single paired 2M-real-event/1024-bucket probe gives:

| Measure | Grouped global sort | Bounded radix |
|---|---:|---:|
| Partition seconds | 6.070 | 12.075 |
| Maximum process RSS, including input materialization | 512,651,264 bytes | 328,658,944 bytes |
| Final Parquet files | 1024 | 1024 |
| Final Parquet bytes | 26,481,751 | 30,477,931 |
| Conserved rows / largest bucket | 2,000,000 / 2,091 | 2,000,000 / 2,091 |

The small probe is slower with radix. This repair buys bounded partition
materialization without the global sort, not an unmeasured speedup. A separate
32M-real-event partition probe completes all 1024 buckets and conserves every
row, then its unpartitioned two-way `EXCEPT ALL` comparison exhausts the 2 GB
engine allowance. That failed probe and traceback remain in `probe-run.log`;
it is not a passing parity receipt. The comparison is repaired to cover all
32M input rows and all output files in 32 disjoint complete-hash groups, with
two-way all-column `EXCEPT ALL` for every group and no sampled rows or raised
memory budget. That bounded parity probe precedes deployment.

Full 1M validation is still OPEN. Keep the existing **02:50:22 UTC
13 November** compute deadline, $5 ceiling, compute-only cleanup and retained
volume. Private Spaces/MinIO digest checks, statistics review, connected
acceptance and experiment approval remain separate gates.
