# Batched scoped-counter attempt p2 — bounded native T1 PASS

The separately approved retry completes15 November13:03:31UTC, taking
943.382s including native fixtures, builds and independent comparisons.
**This establishes the bounded count T1 gate, not complete-feed correctness
or serving performance.** The original failed p1 table/receipt stays intact.

Eight stable doc_id batches keep every version, same-ID author and attachment
together before canonical history windows. Same-service/reference recipes
share one scan. All batch completion and duplicate-key checks finish before
scope consolidation; the canonical source generation closing check matches.

Native fixtures pass: fifteen same-author reactions/comments outside the
readable groups count zero; shared attachment row2/DISTINCT1; same-ID authors
row4/DISTINCT1; positive comments; type/reference edits; document and attachment
tombstones. The full-store independent checks cover26 stratified targets for
one ordinary reader, not every reader or every stored count:

| Scope | Counter | Positive checked targets | Sum of checked values | Exact parity |
|---|---|---:|---:|---|
| Main | Like / dislike / comment / repost | 0 each | 0 each | PASS |
| Reactions (including Discover) | Like | 26 | 150,380 | PASS |
| Reactions | Dislike | 0 | 0 | PASS |
| Comments (including Discover) | Comment | 26 | 47,912 | PASS |

All60 recorded batch/consolidation queries finish without native exceptions;
their maximum tracked query peak is5,158,887,567 bytes. This is **not** a
server RSS/whole-process maximum. Setup native sums in `report.json` exclude
oracles/startup/generation checks and are explicitly partial setup attribution,
never feed latency/bytes. Read-serving performance has not been measured.

The driver stops its owned containers afterward. Remaining metadata builds
may consume this exact passing receipt/table only after a current source
generation check. T2, lifecycle/rebuild, storage/maintenance budget and full
response latency/bytes remain OPEN. Views counters and fanout stay off; the
original15:38:32UTC deadline and resource limits are unchanged.

`result.json`, all60 executed batch/consolidation SQL files, approval, driver
and query ledger are retained unchanged. `report.json` binds those artifacts
and the executing batch/count/compiler-wrapper source hashes.
