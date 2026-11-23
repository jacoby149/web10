# D117 post-family proving cell — complete; maximal decomposition rejected

**Exact parity passed, but all six measured assembly comparisons rejected the
maximal model under D117's pre-committed cost rule.** Retain the refinement:
store queryable values as rows and keep payload as document content. This is a
decision about this storage experiment, not a production migration or a
performance claim for an untested replacement.

## Scope and completion

- Fresh disposable DO622443335 in NYC3, AMD32GiB host / 28GiB ClickHouse
  container / 22GiB server, ClickHouse 26.10.4.207. Executing source: merged
  [#1620](https://github.com/jacoby149/web10/pull/1620),
  `385f33a9e92645f2ef3c06f3c033945f0042bcfe`, with 1,525 verified source files.
- This run supersedes neither the one-source probe metrics nor the previous
  composed run's native Code 168 stop. Both remain in the
  [runbook](../../ROW-MODEL-RUN.md). The new scratch preflight exercises three
  lanes natively: 4,096 identities, 4,097 versions, one verified checkpoint,
  a cross-lane deletion tie, and 67 exact native statement receipts.
- Daily/all-time construction completed in 319/489 batches; all four
  composition gates, three complete-feed cells and statement accounting passed.
  This is not a feed latency-budget pass or a new skinny-pin benchmark.
- The full typed loader completed **4,000,675 identities and 4,000,675 versions**
  in 977 batches. From the worker's first native setup submission at 08:36:07
  UTC to the last batch checkpoint at 11:02:20 UTC: **about 2h 26m**, or about
  456 identities/s including setup. The earlier one-source projection was not
  a full composed-store ETA. All 19,823 row-worker data statements have native
  completion receipts; the largest individual query used 2,330,704,953 bytes.
  Preflight/auxiliary requests and process-wide memory are separate.
- Full typed verification passed on the ordinary (21), paired (21), fat (1),
  sample (64), edit (1), deletion (1), shared-value (2), and zero-payload (2)
  domains. The verifier confirmed physical sharing, the actual zero-pointer
  document and the frozen native parts. All six warmups and all six measured
  comparisons returned exact key/type/value parity on both sides.

## Measured assembly, canonical → maximal typed

| Case | Native rows | Logical bytes | Wall time (ms) | Axes ≥10× |
|---|---:|---:|---:|---|
| Uniform K20 feed | 8,192 → 1,809,318 | 1,293,268 → 154,450,951 | 39.044 → 398.293 | rows, bytes, time |
| Paired P feed | 8,192 → 244,185 | 169,943 → 21,591,973 | 43.611 → 208.638 | rows, bytes |
| Paired F feed | 8,192 → 244,185 | 169,943 → 21,591,973 | 39.275 → 197.954 | rows, bytes |
| Ordinary post-open | 8,192 → 1,817,510 | 1,293,268 → 155,195,815 | 37.959 → 333.025 | rows, bytes |
| Paired post-open | 8,192 → 252,377 | 169,943 → 22,382,346 | 36.293 → 214.443 | rows, bytes |
| Fat post-open | 1 → 90,115 | 130 → 7,961,452 | 28.248 → 133.091 | rows, bytes |

| Case | Largest single assembly query, canonical → typed (bytes of memory) | Typed wall time including generation fence (ms) |
|---|---:|---:|
| Uniform K20 feed | 9,701,515 → 6,737,205 | 479.194 |
| Paired P feed | 5,503,842 → 9,317,912 | 302.830 |
| Paired F feed | 5,503,858 → 9,312,088 | 271.755 |
| Ordinary post-open | 9,699,643 → 6,737,109 | 401.801 |
| Paired post-open | 8,038,145 → 9,317,896 | 290.793 |
| Fat post-open | 5,115,878 → 6,154,471 | 210.366 |

The memory column is the maximum recorded ClickHouse `memory_usage` of any
individual assembly statement, not request-wide memory or process RSS. It is
separate from logical read bytes, which drove the rejection in every case.

Numbers are isolated assembly costs, not the whole feed, p95, engagement-thread
assembly, or native CPU time. The fat control is one post's payload, not its
engagement thread. Each row compares one warmed observation. The table excludes
separately timed generation-fence work and receipt observations; the raw packets
retain both the exclusive and inclusive assembly scopes. The threshold is ≥10×
on **any** measured axis, so lower latency ratios in five cases do not undo the
I/O rejection. No other family, orphan-value GC, live write maintenance, or
production rollout is accepted by these observations.

## Evidence and cleanup

The worker finalized `OBSERVATIONS_COMPLETE` at 11:02:35 UTC on 23 November.
Both private archives were copied and SHA-256-verified before deletion:

| Archive | Bytes | SHA-256 |
|---|---:|---|
| Final state and exact packets | 1,483,137,288 | `bc53392d421ff5fb533c1aabff353e63a451cfc4dc1be4c19272123268877cfc` |
| Original stopped native query-log parts, no restart | 518,604,586 | `775759995668cce09dee239cb1c0262a115348a90ffd0753e2673358f23b2640` |

DO-owned cleanup verified at **11:06:20 UTC** against the original 24-hour
lease, starting at 04:40:02 UTC. The source snapshot `255003176` remains.
Elapsed compute estimate **$1.609642**, not an invoice; snapshot storage is
separate. No new lease or production action is authorized by this record.
