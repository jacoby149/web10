# Layout and full daily seed pass; all-time historical merge stops at22GiB

The purpose was to get through complete setup and measure the composed feed,
then the same-store row-model cell. **Neither measured cell ran.** PR#1602's
layout repair works on the full input; the next all-time aggregation is a
separate native memory failure, not another service-clock stop.

## Source, host and order

Exact merged source `24b435779db1cfe2de39cff2ac0f324c473481d8` passes42
no-engine suites/388 tests before deployment. All1,496 deployed hashes and the
fresh row-source binding verify before restore. The manifest SHA256 is
`149c0b5b7ef379b98914a47fb00e021f6a63ea5470eb8580f9bf5ce5da3dbc06`.

DO621597571 uses the original AMD8-vCPU/32GiB/400GiB SKU innyc3 at$0.25/hour,
snapshot255003176, ClickHouse26.10.4.207 and the32/28/22GiB envelope. Its
20 November11:14:48→21 November11:14:48UTC window binds the24h backstop.
No guardian, extension, replacement or native retry. Baseline/B/D are cited,
not repeated; all four prior attempts remain unchanged.

Restore/read setup/migration/billboard fixtures pass. Initial infrastructure,
fanout bootstrap, tally construction/verification and refs construction complete.
Those setup receipts are not the later formal composition gates, which stay
BLOCKED after furniture fails.

## Native layout result

Every live event column is cloned, including payload and timestamp precision.
Old/new per-day counts and all-column city/sip hash censuses match for all319
days and1,600,000,000 events. Atomic exchange and old-table retirement pass.
This is the specified hash-census identity test, not collision-free row equality.

| Statement | Native ms | Read rows | Logical read bytes | Written rows | Logical written bytes | Peak query memory bytes |
|---|---:|---:|---:|---:|---:|---:|
| Old census |448,824|1,600,000,000|150,399,971,267|0|0|24,729,578|
| One sorted rebuild |596,276|1,600,000,000|150,399,971,267|1,600,000,000|198,400,000,000|11,866,781,599|
| New census |453,242|1,600,000,000|150,395,090,161|0|0|39,726,810|

Total layout setup wall:1,517.784108723s, including observations/DDL/swap, not
just the rebuild. The service-observed597.673s rebuild wall is distinct from
its596.276s native duration. Logical bytes are not disk or network traffic.

## Full daily seed, then the next failure

All319 planned slices finish natively and are controller-PASS. Each day's
countMerge total matches the raw census; the complete total is exactly1.6B.

- Seed INSERTs read1,600,000,000 native rows /131,200,697,016 logical bytes.
- Native row amplification is1.0× for these INSERTs only; census/rebuild and
  observation work remain separate, not hidden in a whole-run1.0× claim.
- Summed slice native duration:1,100,195ms; maximum query memory:3,947,429,963 bytes.
- The1,906.987127485s aggregate-build wall includes the failed all-time step;
  it is not daily-seed-only timing.

All-time derives from these daily states, not raw events. Its original query
`fanout-f-7e556fc596ae47b7a487ba7012cbb9e0` stops with native241 while executing
`AggregatingInOrderTransform`: total RSS would exceed22GiB. Actuals:

| Native duration | Read rows | Logical read bytes | Partial written rows | Partial written bytes | Recorded query memory |
|---:|---:|---:|---:|---:|---:|
|35,433ms|34,185,216|9,366,749,184|537,686|47,854,054|22,396,518,252 bytes|

The failure is the total-server22GiB cap; recorded query memory need not equal
total RSS. Partial writes are failed work, not a completed all-time table.
The service exits13:54:57UTC. The row bridge then refuses unbanked composition
accounting; that secondary refusal is not the underlying failure.

| Required result | Verdict |
|---|---|
| Layout/schema/count+hash identity |PASS|
| All319 daily slices/full1.6B count reconciliation |PASS|
| All-time construction |FAIL, native241|
| Formal refs / paired tally / daily+all-time views / ads gates |BLOCKED|
| Uniform K20 / paired P / paired F complete responses |NOT RUN|
| Stage decomposition / unclassified-query inventory |Unavailable, not empty|
| Six canonical-versus-row assembly comparisons |NOT RUN|

No feed latency,500ms/25MB verdict, p95, capacity, live-write or production
acceptance follows. D117 remains pending.

## Custody, monitoring and cleanup

Monitoring moves to this workspace at the operator's request. Public-IP changes
require two exact owned SSH `/32` replacements; pinned host keys, other firewall
rules, worker PID and absolute deadline remain unchanged. Five-minute checks
continue until the operator pauses; there is no continuous-supervision claim
during that absence. The worker stops independently and preserves its failure.

Private home: `~/.local/state/web10-research/web10-fanout-f-e642f0b39a9c/`.
Final checkpoint before deletion:9,251,030 bytes, SHA256
`9c75f48a88b448ad8ecfc32c1a8ab551b89dd79cb577a83c6c1204a467d11e4a`.
Stopped original native query-log parts:2,207,298 bytes, SHA256
`fb0f7ad9ea17ebe832f13efe372ed0c53a09f7e306dee5891293475343d34b0d`.
Both verify off-host; no engine restart or query replay is used for collection.

Both census packets are51,414 bytes with identical SHA256
`eda25e86ecf4b4ad20a201470bbc9223203b9bfa2043e90779ae45f4a51a5b6d`.
Original aggregate build packet:217,222 bytes, SHA256
`9eddac982c41a2e69ccd8aab3fc0529f69b27f02b7417c0b16b62b0d62c25641`.
Original programme summary:13,484 bytes, SHA256
`bd105417e4bcc0cdd1d12753ee661700916058e0b1426a6a02a611d00c8ce935`.

Core cleanup verifies20:03:17.708UTC. Final20:07:00.460UTC provider readback
confirms droplet/firewall/key/tag absent and snapshot255003176 retained, before
the original backstop. Conservative admission-to-final-readback compute estimate:
$2.2175319522, not invoice; this includes idle time after the worker stopped.
Snapshot storage is separate. Admission is consumed/closed.

## Source repair, not a retroactive native result

Jacob requests bounded historical all-time backfill. The new source uses ordered
4097-key lookahead pages to build disjoint ranges of at most4096 document IDs,
retaining every day/service/event for each document. Exact MergeState semantics,
live MVs, final population/parity gates and22GiB/600s limits stay unchanged.
Failures retain their original receipts and refuse implicit retry/reseed.
The full source suite passes42/395 with seven new controls; the actual-install
batching regression fails against the exact old one-shot source. These controls
are not native memory-fit proof. Another paid attempt needs fresh admission.
