# Finish the checks we have already paid for

The operator's 13 November directive adds check-layer recovery to the existing
import recovery. The live validator runs immutable staged sources and must not
be patched in place. Its in-memory verdicts cannot be recovered by this change:
a first retry under the new source starts at check 1, reusing only verified
imports. The existing 06:40 worker stop, 06:50:22 cleanup, $5 ceiling and retained
volume remain unchanged.

## Durable check phase

After each verdict, write one atomic fsynced JSON record containing its name,
boolean verdict and elapsed seconds. The record also binds its definition,
verified table dependencies and a context digest. Context binds the dataset ID,
complete manifest file inventory, executing entrypoint/engine/checkpoint source,
ClickHouse version and explicit resource profile/settings. Checks without a
completed record rerun whole. Explicit resume verifies every binding; mismatches
refuse, never rewrite lineage. A recorded false verdict halts and cannot be
skipped. Checksums detect modified records, not a hostile operator who can
rewrite both a record and its checksum.

Reports use separately bound completed-query results so a resumed run assembles
the same summary fields without repaying completed summary queries. Final passing
receipts keep their existing shape: checkpoint timing/progress is sidecar evidence,
not a new statistical report format. A timeout is interruption, not a false
statistical verdict; preserve its negative receipt before resuming.

Derived tables use producing SQL/order/source/context and dependency bindings,
plus actual UUID and exact row count. Verify before reuse. Unmarked or stale
tables are not adopted: drop/rebuild that derived table, while refusing stale
dependent check/result records. Do not unconditionally drop every derived table.
Imported tables retain their separate, stricter preserve-and-verify policy.

Stage output includes elapsed time and completion/reuse status. Long-query
heartbeats surface throttled internal join/aggregation progress as well as input
read counters; neither is called a completion percentage.

## Join choices without changing verdicts

Use hash joins only after exact counts admit a small build side, with narrow
projected build columns. In particular deliveries_resolve may use hash for
originals/users, retaining both joins, ALL multiplicity, nullable missing-reference
checks and every original predicate. Large build sides retain grace_hash. No
sampling, tolerance changes, removed checks or merged verdict meanings.

## Gates before any live restart

Require all 50 floor verdicts and summaries to match the current pinned receipt;
an actual mid-check kill/resume drill proving skipped completed checks, whole
interrupted-check replay and identical final receipt; tampered-verdict, changed
dataset/source, failed-verdict and stale-derived controls; existing offline,
actual-engine and lease suites. Prove import survival with the exact reviewed
predecessor path, reverified input hashes/UUID/counts and unchanged lineage.

Only then consider restarting, and only if observed live pace projects beyond
approximately 06:00 UTC. If the live run is on track to finish, leave it alone
and land this for future runs. No live restart, paid extension or upload is
implicit in this PR.
