# Treated completion: exact parity, scan-shaped cost

All requested treated complete responses now exist. **Projection K20, uniform
K20 and both paired modes pass exact response parity and fail500ms/25MB.**
The row stop is gone; these are actual completed reads, not selection estimates.
No baseline, Stage B/D, lossless-design proof or counter retirement was repeated.

Machine-readable receipts: [results.json](results.json), plus
[native-query-costs.csv](native-query-costs.csv). The CSV reconciles454 captured
read-query records and102 additional request-tagged records across eight complete
sequences (one warmup and one measured sequence per cell). Raw SQL/content and
the original failed cells remain in the verified private checkpoint.

## Completed responses

Numbers below use the **captured read-query scope of the banked baselines**.
HTTP time is complete-sequence wall time, not summed native query durations.

| Measured cell | HTTP ms | Actual rows | Actual logical bytes | Exact parity |500ms/25MB |
|---|---:|---:|---:|---|---|
| Projection K20, old semantics |25,815.782|646,223,530|59,461,806,191|PASS|FAIL|
| Uniform K20 |156,892.952|553,857,605|52,097,155,602|PASS|FAIL|
| Uniform paired P |150,027.498|88,916,228|9,969,184,052|PASS|FAIL|
| Uniform paired F |166,358.107|88,915,529|9,969,158,768|PASS|FAIL|

Every warmup also completes with exact parity; its costs remain in JSON/CSV,
not silently mixed into the measured sample. This is not p95, a formal repeated
T6/capacity result or a whole-F-arm PASS. The historical Config F FAIL remains.

### Inclusive request accounting, not a hidden remainder

The captured query ledger does not instrument all logger/insert-driver metadata.
Exact native request tags recover that additional work. Each **measured** sequence
has12 additional records totaling60 read rows/6,840 read bytes; their native
written totals are8 rows/2,520 bytes. Keep those separate when comparing with the
banked historical scope, whose inclusive totals are not invented here.

| Measured cell | Request-tagged inclusive rows | Request-tagged inclusive bytes | Native records |
|---|---:|---:|---:|
| Projection K20 |646,223,590|59,461,813,031|67|
| Uniform K20 |553,857,665|52,097,162,442|71|
| Paired P |88,916,288|9,969,190,892|69|
| Paired F |88,915,589|9,969,165,608|68|

These include exact request-correlated auxiliary logging, which may finish after
the HTTP response. They are not a second wall-time sample. CSV rows explicitly
label this stage `request_tagged_auxiliary`; JSON keeps both accounting scopes.

## Required three-column comparison

The26.x baseline is **cited from the closed earlier lease**, never remeasured.
Its parity PASS/budget FAIL remains4,551.675ms/222,387,685 bytes. Historical
24.8 instrumentation and engines differ; these are observations, not an engine
speedup claim. A/C are both shown within the treated column, not combined.

| Metric, captured-query scope | PR#1578 historical24.8 | Banked untreated26.x | Treated26.x: A projection / C uniform |
|---|---:|---:|---|
| Complete HTTP ms |4,702.160|4,551.675|25,815.782 /156,892.952|
| Complete actual rows |3,734,802|3,244,874|646,223,530 /553,857,605|
| Complete logical bytes |286,693,122|222,387,685|59,461,806,191 /52,097,155,602|
| Mixed resolution/count bytes |20,137,337|16,594,275|21,310,993,131 /12,610,659,119|
| Standalone follow-up count bytes |891,072|343,856|37,945,364,162 /29,376,882,876|
| Views bytes |98,542,861|98,624,346|98,624,346 /98,624,346|
| Preparation bytes |75,263,403|44,557,339|44,557,359 /9,948,720,152|
| Unclassified bytes |80,219,612|52,096,217|52,096,217 /52,096,217|
| Exact parity / budget |PASS / FAIL|PASS / FAIL|PASS / FAIL in both|

Every current stage's rows/bytes/native durations is retained in JSON, and each
native statement is in CSV. Preparation and unclassified remain named remainders.
Complete requests still use raw views; banked Stage B is not arithmetically
substituted into these measured totals.

## The formerly stopped statements, completed unchanged

All eight main statements (four cells, warmup/measured) match their actual native
SQL prefixes, retain candidate-doc attachment scope/deletion-winning ties and
use the correct `ref_sorted`. The rendered hashes are unchanged from the stopped
completion lease:

- A main: `4de991ae…a8a81a4`, `documents.ref_sorted`.
- C main: `9641d20d…9d63800`, `engagement_documents.ref_sorted`.
- Both paired main statements: `680227a2…0030ca`, same migrated projection.

The separate node-ad preparation statement is still
`4bc916c85c420f45a56d98424274efe1f83483092363c8c9fdae1194c24765f6`.
It now **finishes** with zero native exception, without a preparation rewrite:

| Measured cell | Actual rows | Actual bytes | Native statement ms |
|---|---:|---:|---:|
| Uniform K20 |88,364,203|9,933,017,043|135,304|
| Paired P |88,364,203|9,933,017,043|143,401|
| Paired F |88,364,203|9,933,017,043|160,137|

These are statement costs, not whole-response times or p95s. The previous
88.36M selection/229,376-row partial STOP remains preserved in the old lease.
The new completed reads demonstrate the actual scan-shaped cost that was missing.

### Real mixed-count decomposition

All three old-semantics main count components finish, each returning zero groups
for the independently checked ordinary page. No whole-main query is passed off
as a component, and none of these diagnostics is subtracted from a mixed total.

| Component | Actual rows | Actual bytes | Native ms |
|---|---:|---:|---:|
| Reaction like/dislike aggregate |91,897,589|7,097,470,372|2,405|
| Repost aggregate |176,400,726|7,778,559,804|3,251|
| Comment aggregate |247,081,302|17,060,447,628|8,277|

Statement digests/query IDs and native receipts are retained in JSON. The list
is diagnostic and **non-additive**, not per-table apportionment or a speedup.

## Execution and preservation

- One DO620634285 lease:18 November11:02:47→15:02:47UTC; no replacement/extension.
  Engine26.10.4.207;32/28/22GiB; agent~300s/self-kill only, no guardian.
- Snapshot255003176 restore/verification125.539s excludes provisioning. One
  ordinary K20 setup build precedes projection; paired scopes are adopted.
- Source/copy projection coverage is88,200,363/88,200,363. Rebuild-mode wall
  materializations are431.678s/250.612s; covered parent parts1/1 and6/6.
  Default344 is cited, not re-probed. Nine current-copy checks are zero; the
  prior lossless proof is cited, not re-executed. Certificates refresh, counters
  do not rebuild after materialization.
- Original executing source`5d4259a29` verifies1,434 files/16 approved pins.
  Its A/C/paired cells fail before readiness because pinned driver1.6 subtracts5
  from `send_receive_timeout=None` during progress-header initialization. Those
  startup logs, original failed summary/comparison and empty decomposition remain
  intact, not renamed or relabelled as successful measurements.
- Transport-only continuation`8fd92437294275f035a950c273f13ab0e73cb0a1` verifies1,435
  files and reuses that exact certified store. It initializes numerically then
  disables the actual backend read cap/retries. New cell directories and a new
  summary preserve the original failures. No SQL/candidate/preparation redesign,
  restore, setup, projection, B/D or aggregate seed is repeated.
- After measurements stop, native collection retrieves575 tagged terminal
  records with **zero exceptions**. All454 captured sample read statements have
  native changed-settings evidence of`max_execution_time=600`; zero-valued row
  settings are absent from that changed-settings map, not fabricated into it.
  Actual over10M QueryFinish receipts establish that the old row stop did not
  cut off these reads. Auxiliary INSERT/metadata settings are retained privately;
  the read-query600s assertion is not a claim about their settings.
- Final checkpoint9,931,254 bytes/SHA
  `dbda467c7213d1d3b50afea3267863d5dfd2e3e7be281a40bc19da31ffe81ace`
  and stopped-native archive3,083,121 bytes/SHA
  `bc9dc96224281aa444f6db77ad6f98e145a8fdaceb1f486171358f1f76320fba`
  verify off-host before deletion. There is no OOM or engine restart after final
  collection. The system-Python metadata-export import error is preserved and
  repaired by using the pinned venv; no measured SQL is replayed for collection.
- Owned droplet/firewall/key cleanup verifies **12:55:15.517UTC**, before the
  original15:02:47 deadline. Estimated elapsed compute **$0.468647**, not invoice;
  retained snapshot storage is separate. Temporary private keys/cloud-init secret
  file are removed. Snapshot/retained volume and production remain untouched.

The measurement task is complete; the performance goal failed. Any
candidate-to-canonical or preparation revision now has actual costs to argue
against, but remains a separately admitted proposal. No counter retirement,
production/§8 action or new paid attempt follows from these results.
