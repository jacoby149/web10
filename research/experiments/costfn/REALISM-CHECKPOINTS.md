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

## Join choices without changing verdicts (generalized, operator directive of 13 November)

The operator directed check 13 (engagement_exposure_causality) and the other
checks through 50 that might fail the lease to be addressed, and asked for the
more efficient way. The one-off deliveries_resolve admission becomes a uniform
rule for every join check:

- The build side is projected to the exact columns the check uses (narrow
  sub-selects), which also bounds the grace_hash spill when a build is not
  admitted. Every original predicate, ALL multiplicity and the nullable
  missing-reference case are retained.
- Admission is decided before the join, from the exact projected payload
  measured on the real rows: the key column length sums plus fixed column
  sizes plus one conservative per-row sparse-hash metadata constant
  (`BUILD_ROW_OVERHEAD=208`, a worst-case bound for the pinned engine, not a
  measurement). A payload at or under the check's budget fraction of the
  approved query memory admits `join_algorithm=hash`; anything above, unknown
  or NULL retains the disk-capable grace_hash. Pure streaming count joins use
  3/4 of the query memory; a join sharing its query with a large set or
  aggregate (closed_simple_graph) uses 1/2.
- A host-measured calibration receipt (`realism_calibration.py`, Digital Ocean
  only, performance profile, worst-shape synthetic table at the full-scale
  engagement size, cgroup/container memory-peak base-vs-join delta with its
  own 1.5x margin) may lower the per-row constant; it can never raise it, and
  an out-of-range, stale, tampered or unreadable measurement writes no
  receipt, leaving the conservative default in force. The receipt binds
  engine version, profile and calibration source.
- The decision binds into the verdict definition (recorded settings), so a
  resume replays the same algorithm and a changed decision is a binding
  mismatch, not a silent switch. If a hash build still hits the memory limit,
  the check name is persisted as memory-denied for this work directory and
  every later attempt, including resumes, retains grace_hash for it.

Check 13 additionally runs its exact total-good equivalent: exposures is
unique per (doc_id,reader_key), so an engagement row is bad iff it has no
exposure or precedes first_seen; the verdict stays
`total engagements - (matched AND created_at >= first_seen) == 0`, one INNER
join building the engagement side (83.2M full-scale rows) instead of the
exposure side (up to ~1.4B). The original LEFT-JOIN count is arithmetically
the same set.

The exposures derivation now also carries the per-reader impression
multiplicity (`count() AS impressions`), so post_metrics rolls it up from the
one 1.6B pass instead of rescanning content_events; full-scale
content_events passes fall from five to four (import, check 11, check 12,
exposures). No sampling, tolerance change, removed check or merged verdict
meaning. Checks 14-50 keep their exact SQL: 14/16 are bounded aggregates, 15
retains grace_hash whenever its reactions build is not measured-small, and the
small users/cohort builds are admitted where the exact payload admits them.

## Gates before any live restart

Require all 50 floor verdicts and summaries to match the current pinned receipt;
an actual mid-check kill/resume drill proving skipped completed checks, whole
interrupted-check replay and identical final receipt; tampered-verdict, changed
dataset/source, failed-verdict and stale-derived controls; the new
late-exposure mutation control (flipped check 13 denies on the actual engine
while 10/11/12 keep passing), the admission-gate and calibration-binding
controls; existing offline, actual-engine and lease suites. Prove import
survival with the exact reviewed predecessor path, reverified input
hashes/UUID/counts and unchanged lineage.

The operator directed all engine execution for this lane to the approved
Digital Ocean host only: no local Docker or native ClickHouse runs. The floor
receipt therefore re-pins on DO with the new source (the changed derived
definitions and check 13 SQL alter the sidecar bindings, not the verdicts),
the drill runs there (Docker or pinned native, both supported), and the
calibration receipt is produced there under the performance profile before any
full-scale attempt may admit the mid-size hash builds.

Only then consider restarting, and only if observed live pace projects beyond
approximately 06:00 UTC. If the live run is on track to finish, leave it alone
and land this for future runs. No live restart, paid extension or upload is
implicit in this PR.
