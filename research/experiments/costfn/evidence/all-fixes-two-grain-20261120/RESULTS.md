# Day seed partial at the original service bound; all-time and measurements unrun

**This attempt is incomplete, not PASS.** Day slicing avoids the observed22GiB
failure for the days actually processed, but repeated scans outlast the retained
four-hour lease window. The existing service guard terminates the controller
before the full day seed, all-time derivation, formal parity gates or measurements.
No native memory or scan-count refusal caused the stop.

[results.json](results.json) contains the machine-readable accounting;
[seed-slices.csv](seed-slices.csv) lists **all319 planned slices**, explicit bounds,
bucket settings, logical day counts and each available native ID/hash/memory/I/O
receipt. Blank native fields mean unexecuted, never zero work.
[source-binding.json](source-binding.json) binds the executed merged source.

## Source fixes and amendment, before deployment

- [PR#1599](https://github.com/jacoby149/web10/pull/1599/files): day-sliced copies
  of the unchanged STATES select, optional preplanned doc_id hash buckets,
  incremental native memory receipts, exact per-day/full-population reconciliation.
  Native scan counts are separate from logical counts under Jacob's explicit ruling.
- [PR#1600](https://github.com/jacoby149/web10/pull/1600/files): separate
  `content_events_aggregated_all_time`, exact countMergeState/uniqExactMergeState
  derivation from day states, direct-raw materialized views for both grains,
  all-time feed read and mandatory named daily/all-time raw-oracle parity.
- All40 no-engine suites/378 tests and focused Ruff pass; all source PR checks
  were green before merge. Exact merged source
  `8402cd5fef88b8d36fe51a9a25faf5a9ee335574` passes the suite again. All1,487
  deployed file hashes/banked pins and fresh row-source readiness verify before
  restore. No experiment source changes after deployment.

The all-time amendment arrived after DO621488571 was created but **before any
experiment deployment or restore**. The old day-only bundle is retained privately,
not executed. The amended bundle/admission replaces it on the same owned host,
retaining the original03:43:51→07:43:51UTC window rather than renewing it.

Original AMD8-vCPU/32GiB/400GiB, nyc3, snapshot255003176,
ClickHouse26.10.4.207 and32/28/22GiB remain unchanged. Agent supervision and both
owned self-kill timers are used, no guardian. Costs are receipted, not capped;
the stop is the explicitly retained service window, not a monetary ceiling.

## What ran

Banked baseline/B/D are cited, not timed again. Restore, read setup, migration
and billboard construction pass. Initial infrastructure, twelve tally scopes,
their ordinary/paired/fat/60-root-sample verification and refs-satellite build
complete. Both aggregate DDLs and both direct-raw MVs install successfully.

The raw day census totals exactly1,600,000,000 events. The seed plan contains319
single-day slices over **[2025-12-27,2026-11-11)**, one doc_id bucket each; no
hash sub-slicing is needed by any completed native statement. Whole group keys
remain disjoint. No frozen-table layout or event/schema authority changes.

| Slice completion view | Count | Meaning |
|---|---:|---|
| Controller-marked PASS |293|Indices0–292; original checkpoint unchanged|
| Native QueryFinish/exception0 |294|Includes started index293 without controller acknowledgement|
| Unstarted |25|Indices294–318 remain PLANNED|

The final original query has a successful native terminal receipt even though
the controller did not acknowledge it. It is not silently changed from STARTED
to PASS in the preserved build record. Every available native slice retains the
22GiB memory cap and a time bound no greater than600s. The final13 statements'
caps are clipped by the original cleanup margin (overall range146–600s); none
records a native exception or statement timeout. The largest observed query
memory is **2,890,041,689 bytes (about2.69GiB)**. This establishes observed-slice
fit, not completion/fit of all319 days or production capacity.

## Logical reconciliation versus native scans

After the service stop, a **read-only collection observation**, not a controller
gate, reads the stored day impression states. Every one of its294 days matches
the corresponding original raw day census exactly. The stored partial total is
**1,165,394,847 events**. The missing25 days account for **434,605,153 events**.
The required full1.6B seed reconciliation was never reached and is NOT PASS.

| Quantity | Actual | Scope |
|---|---:|---|
| Frozen logical population |1,600,000,000|Raw census / required complete seed|
| Observed partial impression total |1,165,394,847|Post-stop day countMerge observation|
| Native scan rows |470,400,000,000|294 terminal seed INSERTs only|
| Native logical read bytes |17,727,624,723,651|Engine-reported uncompressed bytes, not disk traffic|
| Max native query memory |2,890,041,689|Same294 INSERTs|
| Summed native durations |6,931,712ms|Sum of statement durations, not total seed wall|

Each executed slice scans1.6B rows. This is **403.6400× native rows per observed
partial logical event**. Dividing by the full frozen1.6B reference instead gives
294×, but that is not a completed-seed amplification figure. Native read
amplification is reported, **not treated as a correctness failure**. Inventory,
collection observations, DDLs/MVs and other setup work are excluded from these
seed-INSERT totals and retain separate private native records.

## All-time build receipt and both views parity verdicts

| All-time item | Result |
|---|---|
| DDL and direct-raw MV |Installed|
| Intended build source |`content_events_aggregated`, never another raw seed|
| MergeState derivation |**NOT RUN** — day seed incomplete|
| Post-stop physical row count |**0**, query`fanout-f-fca68907a0b94243b08d5db088a03db1`|
| Construction row count/native derivation memory |Unavailable — no build ran|

The zero count is a real empty-table observation, **not** a completed all-time
build or a zero-view result. No partial daily state is fed to all-time or timing.

| Required check | This attempt |
|---|---|
| Refs census / same-question parity |NOT REACHED|
| Ordinary/fat/sample tally checks |PASS, completed native setup|
| Paired tally actual20 roots / five domains |Completed native setup proof re-audited; prior closed gap unchanged|
| **Daily views versus raw oracle** |**NOT RUN**|
| **All-time views versus raw oracle** |**NOT RUN**|
| Exact ad identity per page post |NOT RUN; fixture construction is not parity|
| Complete-response parity |NOT RUN|

The persisted programme summary ends at billboard fixtures PASS. Furniture never
returns a result; subsequent stages have **no emitted controller result**, rather
than invented BLOCKED/PASS records. The seed's persisted outcome remains BUILDING.
This report labels the observed incomplete outcome without rewriting those files.

## Requested composition decomposition and row-model stage table

| Complete response | Warmup | Measured | Stage decomposition |
|---|---|---|---|
| Uniform K20 |NOT RUN|NOT RUN|Unavailable|
| Paired P |NOT RUN|NOT RUN|Unavailable|
| Paired F |NOT RUN|NOT RUN|Unavailable|

The unclassified-query list is unavailable, not empty. No500ms/25MB budget
verdict is assigned; seed setup I/O is not a substitute for feed I/O.

A post-run source review finds that the observer's views label still names only
the raw/day tables. This report branch adds the all-time table to that diagnostic
classification and a regression test. It is **not deployed to this attempt**;
there are no measured rows to relabel, no SQL/treatment change, and no old
instrumentation result is rewritten. The report branch passes40 suites/379 tests
and focused Ruff. Future timing must use the merged repair.

| Canonical-versus-row stage | Warmup | Measured | Assembly | Fence |
|---|---|---|---|---|
| Uniform K20 feed |NOT RUN|NOT RUN|Unavailable|Unavailable|
| Paired P feed |NOT RUN|NOT RUN|Unavailable|Unavailable|
| Paired F feed |NOT RUN|NOT RUN|Unavailable|Unavailable|
| Ordinary post open |NOT RUN|NOT RUN|Unavailable|Unavailable|
| Paired post open |NOT RUN|NOT RUN|Unavailable|Unavailable|
| Fat post open |NOT RUN|NOT RUN|Unavailable|Unavailable|

The row worker, full-family build and key/type domains never start. D117 remains
pending, no assembly verdict or whole-feed/capacity/production/§8 acceptance.

## Window stop, custody, cost and cleanup

The original systemd RuntimeMaxSec guard stops the service at
**20 November07:38:51UTC**, `Result=timeout`, signal15. This is not a600s native
statement timeout, a22GiB failure or a read-row/byte abort. Existing container/
host timers remain bound; no replacement lease, extension or retry is made.

Final off-host verified checkpoint:7,019,393 bytes,
SHA`b014ee968ee441cd6cf036615e74c32f91b83e077527201121964ca81a7c681e`.
Stopped-native archive:29,813,753 bytes,
SHA`c73ca779913a7b21aa19d0aa2bd10381d30c1f7787b70bcaaaea2eb3d30435a8`.
Private home:`~/.local/state/web10-research/web10-fanout-f-7c65ded91a9f/`.
Source, original controller/native/partial-state packets and observations remain
private; all captures precede provider deletion. No engine restart for recovery,
no container OOM, no saved partial-state snapshot replacing the original input.

Core owned cleanup verifies07:41:14.433UTC. One additional absence assertion
initially does not satisfy every flag; the recorded07:41:56.982UTC readback
confirms droplet/firewall/key/tag absent and **snapshot255003176 retained**, before
the07:43:51 deadline. Conservative admission-to-final-recorded-readback compute
estimate: **$0.9920821048**, not an invoice (core-cleanup estimate$0.9891272887).
Snapshot storage remains separate. No earlier attempt's costs are added here.

All three earlier attempt records, baseline/B/D and historical FAILs remain
unchanged. The admission is consumed/closed. Completion needs a fresh explicit
window/admission adequate for preparation,319 scans, all-time, gates and the row
cell; this partial memory/I/O evidence is not permission to extend/retry itself.
