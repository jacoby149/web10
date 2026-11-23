# D117 refinement: hybrid K20 preflight

**Status:** no-engine model reproduced; baseline-only runner, fixed-slice
constructor and current-arm evidence adapter checked offline. Native baseline
reproduction is pending; challenger arms and the fault suite remain deferred. The
[D117 result](evidence/row-model-4096-20261123/RESULTS.md) rejected maximal
payload decomposition, not every way to store queryable values separately.
The next question is whether a hybrid is worth its extra writes and repair
work once the best canonical query has had a fair shot.

## What the fixture found

Run `python3 research/experiments/costfn/hybrid_fixture.py` from the repository
root. The fixture uses 256 synthetic posts, ~8 KiB bodies, repeated document IDs
across authors, mixed visibility, and rank ties. The independent input oracle
and both modeled readers agree on the exact ordered top 20, including versions
and payloads.

| Read path | Modeled bytes touched |
| --- | ---: |
| Canonical, whole documents scanned | 2,110,820 |
| Canonical, only key/version/policy/rank scanned, then winner documents fetched | 170,389 |
| Hybrid, current-version manifest and skinny rows scanned, then winner documents fetched | 189,253 |

The hybrid touches **11.15× fewer modeled bytes** than a full document scan,
but **11.1% more** than the projected canonical model. The hybrid total includes
18,864 manifest bytes, 5,476 skinny-row bytes and 164,913 winner-document bytes.
These are synthetic serialization counts (including raw digest lengths), not
ClickHouse `read_bytes`, device I/O, or latency. The fixture does not show that
the real canonical layout can prune payload or that the hybrid can reproduce
the whole-scan ratio on a complete feed.

The model also leaves a staged edit invisible, refuses a publish with a missing
staged row, resolves an identical retry after an assumed lost commit response,
ignores a superseded public row, rejects missing/corrupt current rows and a
corrupt winner payload, and restores parity after a satellite rebuild. Python
state transitions model these outcomes; they do not establish ClickHouse
atomicity, receipt semantics, or cleanup safety under concurrency.

## Small native comparison

**Execution amendment: baseline first, then stop.** After the fixed-slice
source merges and the host/window are bound, run `hybrid_k20_run_current.py`
on the verified snapshot 255003176 and the pinned engine. The constructor
seeds historical posts using only the authenticated main post scope and reader
ownership. Follow-up scopes stay authoritative for reads but do not seed the
global candidate inventory. Inbound dependencies are selected from the fixed
post roots; only retained keys are parsed for outgoing references. The constructor
retains document/attachment/event history, records all three slice lanes and receipts in
`hybrid-k20-slice.json`, and rejects a slice that disagrees with the independent
unsliced canonical oracle before measurement. Rebuild furniture and certificates
for the sliced generation rather than inheriting the snapshot's full-store receipts.
Report the original indexed K20 reproduction and stop whether it passes or fails;
the following three-arm plan applies only after a successful baseline.

Use a fixed, representative post-family slice with enough parts/granules to
expose payload pruning and with real K20 history, policy checks, and ranking.
Record the slice manifest and use the same frozen input and authorized request
for three arms, on the same pinned ClickHouse build and resource envelope:

1. **Current:** the indexed canonical K20 path, including preparation and
   response assembly. Keep the actual query inventory as the baseline.
2. **Projected canonical:** retain canonical storage and authority. Resolve
   current version, eligibility and rank using only the necessary fields, then
   fetch the winning documents by exact key and version. Verify the actual
   ClickHouse plan and native receipts; if the layout cannot prune the payload,
   report that rather than assume it can.
3. **Hybrid:** read typed Verify/Rank fields from versioned skinny tables;
   fetch the same whole JSON winners by ordered full key and exact committed
   version. No payload subpath extraction in the hybrid read. Recheck required
   authority and charge version/digest checks, fallback and any refill to the
   arm. Missing or mismatched committed data must reject the read or use a
   verified canonical fallback; it must not silently drop or reorder winners.

At the API -> ClickHouse boundary, use the same request authority in all three
arms. Gate cost comparisons on exact ordered complete-response parity against
the existing independent oracle, including policy, versions, and payloads.
Keep the candidate window and ranking semantics fixed; a smaller answer is not
a faster answer. For each arm bank native query IDs, plans, actual rows,
logical bytes and duration by stage and in total, plus end-to-end wall time.
Separate setup, auxiliary receipt work, and write/rebuild costs; record cache
conditions and repeated samples without calling the small fixture a p95 or
capacity measurement. Keep assembly-to-assembly and complete-to-complete
comparisons separate.

Before advancing, run the publish/repair faults on the isolated native store:
crash before commit; dropped data write; lost commit acknowledgment then retry
of the same immutable operation; deliberately committed version missing a
required row; stale rows after edit/tombstone; missing or corrupt winner payload;
and satellite loss/rebuild. Verify exact agreement after repair and that cleanup
cannot reclaim an in-flight publish or data still needed by a reader. Compare
observed rows and payloads against canonical committed facts, not just two
stored digests. An absent receipt is **unknown** until resolved, not proof
that an insert never landed. The record distinguishing committed versions from
staged data is canonical state, not a disposable index. A census is detection
and repair, not a substitute for safe reads before it runs.

**Decision:** advance to the six-case frozen-data cell only if the hybrid
shows a repeatable, material complete-read gain over the best viable canonical
arm with exact parity and all fault gates passing. State the observed gain and
the incremental publish/rebuild cost in the decision. If projection captures
most of the gain, favor canonical storage and avoid the extra machinery. Keep
the six-case assembly threshold on comparable assembly stages; do not apply
the assembly-only denominators to complete Verify/Rank/Return work.

## Budgets and run boundaries

The [indexed K20 receipt](evidence/skinny-pin-20261122/RESULTS.md#complete-feed-captured-query-work)
is 123,119,689 logical bytes and 7,017.152 ms end to end. Both pin stages
together used 56,681 logical bytes; the named raw delivery-history read was
1,722 bytes in that measured request. The 1,332 ms sum is native query duration,
not CPU time. Do not assume the hybrid can remove 100 MB of the total until
the complete stage inventory identifies and measures the work it replaces.

- **DigitalOcean:** report logical bytes, not a hard byte cutoff. Keep 25 MB
  as a historical logical-byte reference, not a gate for this comparison.
  Around 30 MB logical would be a useful result, not a physical-disk verdict.
- **R630:** 1.09 GB/s divided by 15 reads/s gives ~73 MB of **gross physical
  disk throughput per read**, before writes, merges and headroom. Both inputs
  are planning assumptions. Measure sustained device I/O on the actual array
  with cold caches and concurrent work; logical bytes are not a physical upper
  bound. Disk is a candidate bottleneck, not a proven one.
- **Latency:** retain 500 ms end to end as a separate target. A disk-budget
  pass is not a latency pass.

Follow the [costfn execution directive](README.md#governing-execution-directive--18-november-2026).
Bind the small native fixture to its source, owned DigitalOcean host and time
window before execution. A full run requires its own explicit binding and
admission after review of the small native result. This preflight records no
native execution, creates no lease, and changes no production path.
