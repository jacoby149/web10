# Batched all-time backfill passes; response parity passes, audit blocks row model

The task was to get past the all-time memory failure and measure the composed
response, then the same-store row model. **The batching fix is natively proven
on this input.** All three response cells finish with exact parity and budget
FAIL. The statement audit then refuses a raw delivery-history read, so composed
treatment acceptance stays OPEN and no row-model measurement runs.

[results.json](results.json) owns machine-readable facts.
[native-query-costs.csv](native-query-costs.csv) contains every captured statement
and separately scoped request-tagged auxiliary operation. This is a post-stop
diagnostic export, **not a promoted controller decomposition PASS**.

## Admission and source

Jacob explicitly requests the fresh run after PR#1603 merges. Exact merged
source `ffa4b5066ba164519b9be0a5a2e32e87bf0e4755` passes42 suites/395 no-engine
controls; all1,498 deployed hashes, banked pins and regenerated row-source
readiness verify before restore. Manifest SHA256:
`902d36163bd035b30c5ef666ff0cb93dac38a69d9570b39d83a22c020e354b62`.

Fresh DO621754971 uses the original AMD8-vCPU/32GiB/400GiB shape innyc3,
$0.25/hour, snapshot255003176, ClickHouse26.10.4.207 and32/28/22GiB. Two120s
provider-readiness waits expire before the same host becomes ready; no
replacement or clock reset. Original window:20 November20:21:53→21 November
20:21:53UTC, with owned container/host self-kill timers and agent~300s checks.
No guardian, automatic native retry, extension, baseline/B/D timing repeat or
ordinary API change. All five earlier attempts and their failures remain intact.

## Full construction and verification

Restore/read setup/migration/billboards, infrastructure, tally verification and
refs construction pass. Old/new all-column count/hash censuses match across
all319 days and1.6B events; exchange/retirement pass. This is the specified hash
identity check, not a collision-free multiset proof. Total layout wall is
1,025.015121369s. Native rebuild reads1.6B rows/150,399,985,516 logical bytes,
writes1.6B rows/198,400,000,000 logical bytes, takes472,723ms and records peak
query memory14,629,220,542 bytes. Census costs remain separate.

| Historical construction | Statements | Native read rows | Logical read bytes | Native ms sum | Peak query memory bytes |
|---|---:|---:|---:|---:|---:|
| Daily INSERT slices |319|1,600,000,000|131,200,472,337|799,188|3,950,336,849|
| All-time key inventory |489|5,748,255,949|224,181,981,679|57,425|305,222,600|
| All-time MergeState INSERTs |489|169,016,080|42,410,866,715|319,586|565,711,161|

Every daily slice is controller-PASS/native-finished; exact per-day countMerge
reconciliation totals1.6B. All489 all-time batches pass, covering2,000,001
distinct document IDs and writing2,000,001 coarse state rows. Final all-time
countMerge reconciliation is exactly1.6B. Exact reader sets merge across days
and inserts; daily distinct counts are never summed. Maximum completed-batch
query memory is about539.5MiB, not the old22GiB global-merge failure.

Key inventory is bounded in returned keys and observed memory, **not a
single-pass native scan**. Its5.748B rows/224.182GB remain explicit. INSERT
overread is likewise native work, separate from matched logical events. Total
aggregate-build wall4,600.433812224s includes daily seeding, all-time inventory,
INSERTs, observations and transport; native sums are not wall time or disk I/O.

All four formal gates pass: refs census/same-question checks; paired tallies
with actual20 roots in all five domains; independently named daily/all-time
views parity against raw events; and exact setup-pinned ad identity.

## Complete responses: exact parity PASS,500ms/25MB FAIL

All bytes below are captured-query logical reads in the existing comparison
scope, not whole-node/physical traffic. Each measured sequence additionally
has12 request-tagged auxiliary operations reading60 rows/6,840 bytes and
writing8 rows/2,520 bytes. Warmup auxiliary actuals are separately receipted in
the JSON/CSV; they are not substituted into the historical baseline.

| Cell | Phase | HTTP sequence ms | Captured rows | Captured bytes | Parity | Budget |
|---|---|---:|---:|---:|---|---|
| Uniform K20 |warmup|11,987.313498|134,603,229|12,760,268,545|PASS|FAIL|
| Uniform K20 |measured|10,365.824491|84,770,480|10,666,667,270|PASS|FAIL|
| Paired P |warmup|5,865.178209|44,558,718|1,901,881,931|PASS|FAIL|
| Paired P |measured|4,878.588020|828,545|57,281,695|PASS|FAIL|
| Paired F |warmup|4,083.590713|827,846|57,256,411|PASS|FAIL|
| Paired F |measured|4,604.044889|827,846|57,256,411|PASS|FAIL|

These are warmup plus one measured sample, not p95, capacity or whole-arm PASS.
Paired P's extra candidate lookup and warmup read costs are retained, not
silently made equal to F. Canonical oracle checks are outside HTTP timing.

## Why the controller stops after these responses

`engagement_composition.statement_inventory()` rejects any AST table named
`content_events`. Every sequence includes exactly one such read:

`SELECT doc_id,max(seen_at) ... WHERE service=... AND reader_key=... AND surface=... AND event_type='delivery' AND doc_id IN (...) GROUP BY doc_id`.

Source: `api/app/v3/services/clickhouse.py`, `log_content_deliveries()`. This is
the existing24h delivery deduplication read, not a count/reach metric fallback.
All-time aggregate metric queries also execute in each sequence. No retired
`ref_sorted`, retired ad-inventory hash or positive node-ad inventory predicate
is found by the post-stop replay of the existing audit conditions.

The raw delivery-query SHA256 is
`522806ca9abf1ca1da36fc2481e0e884ad32526ba83d8b021b2263f58e51f02a`
for uniform, and
`8ea0e3427a6da7f1c1bd1d045ad68ec3727a88ce90d47c2977a0f9d3d7f22561`
for paired. Measured raw deduplication reads are21 rows/1,722 bytes for uniform
and20 rows/1,640 bytes for each paired cell. Warmup costs can be much larger
and remain in the captured totals. No raw read is excluded or renamed away.

The original decomposition outcome stays INCOMPLETE with its original
traceback. The row bridge correctly refuses unbanked per-statement accounting;
service exit is20 November23:54:19UTC. There is no source patch, audit waiver,
native replay or row-worker launch on this lease. All six canonical-versus-row
assembly comparisons remain NOT RUN; D117 stays pending.

## Diagnostic statement inventory, not acceptance

The CSV reconciles410 captured statements and78 separately scoped auxiliary
operations, all with exception0. Every captured row binds its original query
ID, exact SQL hash/archive path, unchanged captured stage and native actuals.
The formerly unclassified11 queries per sequence are named individually:
current app-contract permissions or current group-membership resolution,
distinguished by full SQL hash. The old `unclassified` stage is preserved.
Those reads cost52,096,217 captured bytes in measured uniform and8,128,775
in each measured paired cell. No remainder optimization occurs here.

Uniform's main remaining cost is a canonical current-document/body fetch from
`pairs_refs` candidates: SHA256
`cf9889ddb8aa6dd88be5a74d2a3f8e8e51b1f1b1dd4ec6895d3c97179a2fb59e`,
82,988,650 actual rows/10,543,615,726 bytes/3,872 native ms. It is not the
retired node-ad inventory query. Total measured preparation is10,567,452,419
bytes in uniform,33,628,057 in each paired cell. Full per-stage totals are in
JSON, with no subtractive attribution or new claims of query-engine optimization.

## Custody and verified cleanup

Private home: `~/.local/state/web10-research/web10-fanout-f-10a587f19595/`.
Final pre-deletion checkpoint79,625,729 bytes/SHA256
`e06d5ca4954bf3747fd46652d2d6d49734ec5fc98b06a8ab9d1c4c670d8a29f5`;
stopped original native query-log parts25,953,643 bytes/SHA256
`3389b9ca96e1175d01d1a35d121f0148c26f3954e7795e88ea6d3dee4b62007c`.
Both verify off-host before deletion. Native Settings/SQL and original controller
packets remain private; no local engine or engine restart is used for recovery.

One provider SSH-key deletion error is preserved; owned cleanup finishes on
21 November00:01:03.406UTC. Final00:01:04.641UTC readback verifies droplet,
firewall, SSH key and tag absent, original snapshot255003176 retained, before
the original backstop. Conservative admission-to-final-readback compute estimate
is$0.9133084235, not invoice; snapshot storage separate. Admission closed.

Next is a source-only reconciliation of the delivery-deduplication audit rule:
retain its exact cost and deny raw metric fallbacks; do not simply remove the
guard. A new native/paid action still needs separate admission. This report's
artifact checks are not a retroactive controller PASS or row-model proof.
