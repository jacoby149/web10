# Native composition and audit pass; row setup stops on receipt-ID transport

The goal was to run the reconciled composition, then the same-store six-stage
row-model comparison. **The complete composition and its real statement audit
pass.** All response cells have exact parity and budget FAIL. The row worker
starts, but receipt collection waits for IDs the server never used; no complete
typed-family build, domain verification or assembly measurement is banked.

[results.json](results.json) contains original outcomes and scoped actuals.
[native-query-costs.csv](native-query-costs.csv) reconciles410 captured and78
auxiliary operations. [row-native-id-diagnostic.csv](row-native-id-diagnostic.csv)
is separate diagnostic evidence of57 actual setup IDs, **not accepted row-model
receipts or performance samples**.

## Fresh admission and exact source

Jacob explicitly requests another full run after PR#1605 merges. The missing
duplicate standing-RUN filename is not invented: the receipt binds this fresh
request to the existing ALL-FIXES-THEN-MEASURE/ROW-MODEL-RUN contracts and
`engagement_composition_run.py --with-row-model`, with unchanged limits/order.

Exact merged `52233c8b9036cd7d314bae7d84a0011aec700307` passes44 no-engine
suites/416 controls. All1,506 deployed hashes, banked pins and regenerated row
binding verify before restore. Manifest SHA256:
`a3b8ef3ae79fdc4aebdbdc1a5a900596fa8e7aad0768828cfb186af1f6cd40bc`.
Fresh DO622092911 is the original AMD8-vCPU/32GiB/400GiB shape innyc3 at
$0.25/hour; snapshot255003176,26.10.4.207 and32/28/22GiB are unchanged.
Window:22 November00:35:20→23 November00:35:20UTC. Two120s provider waits
expire before the same host becomes ready. No replacement/reset, guardian,
production change, baseline/B/D timing repeat or automatic native retry.
Agent checks and checkpoint collection run about every300s; both self-kill
timers remain bound to the original absolute backstop.

## Construction and hard gates

Restore/read setup/migration/billboard fixtures, infrastructure, tally and refs
construction pass. Full old/new event censuses match all-column hashes/counts
over319 days/1.6B events before exchange/retirement. This is the specified hash
census, not collision-free row equality. Layout wall:1,628.171802024s. Native
sorted rebuild:661,072ms,1.6B rows/150,399,985,516 logical bytes read,1.6B rows/
198,400,000,000 bytes written,11,450,885,763-byte peak query memory. Rebuild is
setup under the remaining backstop; its661s does not raise a600s measured limit.

| Aggregate work | Statements | Native read rows | Logical read bytes | Native duration sum |
|---|---:|---:|---:|---:|
| Daily seed INSERTs |319|1,600,000,000|131,200,547,150|1,117,934ms|
| All-time ordered key inventory |489|5,756,030,361|224,485,184,079|72,995ms|
| All-time MergeState INSERTs |489|169,015,260|42,411,327,944|412,789ms|

Every daily slice passes with exact per-day/full1.6B reconciliation. All489
all-time batches pass over2,000,001 document IDs, with exact1.6B reconciliation
and541,247,833-byte peak batch query memory. Native inventory/INSERT overread is
reported separately from matched events, never hidden in a single-pass claim.
Aggregate wall5,288.755391020s includes observation/transport and both grains;
native duration sums are neither wall time nor physical disk/network I/O.

All four formal gates pass: full refs/same-question/fat coverage, actual20-root
paired tallies in five domains, independent raw-oracle daily/all-time views,
and exact setup-pinned ads. No old failure is retroactively promoted.

## Responses: parity PASS,500ms/25MB FAIL

| Cell | Phase | HTTP sequence ms | Captured rows | Captured logical bytes |
|---|---|---:|---:|---:|
| Uniform K20 |warmup|15,352.325910|134,828,100|12,404,441,414|
| Uniform K20 |measured|13,253.115403|84,816,408|10,303,735,551|
| Paired P |warmup|7,176.031704|44,829,096|1,911,223,955|
| Paired P |measured|5,650.541754|836,737|55,959,877|
| Paired F |warmup|5,742.081679|836,038|55,934,593|
| Paired F |measured|6,486.308237|836,038|55,934,593|

All six sequences have exact response parity and budget FAIL. These are one
warmup plus one measured sample, not p95/capacity/whole-arm proof. Per measured
sequence,12 separate request-tagged auxiliary operations read60 rows/6,840
bytes and write8 rows/2,520 bytes. Warmup auxiliary costs are separately
receipted; historical baseline scopes are not adjusted or remeasured.

## D123's real audit result

The original controller's `decomposition` outcome is PASS, unlike attempt6.
Its real inventory retains all410 captured statements and separate78 auxiliary
operations. Each exact bounded raw delivery-history read is named
`delivery_dedup_raw_read`, with prior captured stage retained and all actuals
included. Measured raw dedup costs are21 rows/1,722 bytes/76ms in uniform,
20/1,640/92ms in P and20/1,640/71ms in F. Warmup raw costs remain in totals.
No raw metric fallback, retired projection or ad-inventory rejection is waived.

The CSV binds every captured identity to its SQL hash/private archive path and
the actual accepted inventory identity/stage. The11 former unclassified reads
per sequence retain their individual table-qualified/hash identities and costs:
52,096,217 measured bytes in uniform,8,128,775 in each paired cell. Uniform
preparation remains dominant at10,204,509,664 bytes; paired preparation is
32,438,735 bytes. No remainder optimization or subtractive attribution occurs.
At the controller -> row-worker handoff, the unchanged row bridge accepts the
gates, complete parity evidence and completed native accounting.

## Row-worker receipt mismatch: supervised STOP, not an assembly result

The worker creates its original `row-model/result.json` with outcome RUNNING
and submits39 setup operations, all client-complete. Its first batched receipt
collection cannot match a single requested ID. Preserved native evidence has
57 actual correlated setup IDs (extra driver-internal work is not silently
collapsed), successful QueryFinish records and zero requested-ID matches.

For example, local requested ID`row-model-00905afd7b714484a70bf3fe976342dc`
appears in native log comments, while actual query IDs are server UUIDs, including
`b2902e1b-c79a-4863-a9f4-ca87b82f1df0`. Correlation tags are not query identity.
The worker's exact-ID polling therefore cannot finish; there is no active
row-data statement to await, and no completed build-progress checkpoint.

Read-only diagnosis confirms the cause in pinned clickhouse-connect1.6.0:
`transport_settings={'query_id': requested}` becomes an ordinary HTTP header
named`query_id`, not the URL parameter/server query identity. A pure request-plan
diagnostic reproduces that routing without network or engine execution. This
does not implement or validate a fix. The next repair must prove correct actual
query/command/insert identity, including driver-internal metadata operations.

At05:20:08.863UTC the agent stops the owned row container/service after verifying
no active row-data query. No live native data work is abandoned on a client cap.
Original worker outcome RUNNING is retained byte-for-byte; a separate supervisor
STOP packet records observed termination. IDs are not remapped into PASS, and
no worker/source retry or engine restart occurs. Full-family build is NOT BANKED;
domain verification and all six canonical-versus-row assembly comparisons are
NOT RUN. D117 remains pending, not a measured row-model performance FAIL.

Two metadata-only diagnostic probes use the absent system.processes.log_comment
column and fail47; that is preserved separately, not attributed to row/data
queries. An earlier checkpoint archive command also exits1; a new collection
succeeds/hash-verifies without repeating any experiment operation.

## Custody, cost and cleanup

Private home: `~/.local/state/web10-research/web10-fanout-f-a7ed17edcd9b/`.
Final84,379,396-byte checkpoint SHA256:
`b307d04ba80674d8112cd84ab1adac9f0ab880c6652d73ce3ac4d822b7da92f7`.
Stopped30,352,048-byte original native-parts archive SHA256:
`5b7055fb924e6bc9d79cf2c8fe2f76a172841e4b5aec07f93201f02cc4aaaa04`.
Both verify off-host before deletion. The713,160-byte private ID-audit packet
SHA256 is`ee248d6a7ff870425675242f0c443b02324235cdb4e9d3bcde648206d7cc244a`;
the original native Settings/SQL and partial row state remain preserved privately.

Core cleanup verifies05:22:39.532UTC; final05:22:40.784UTC provider readback
confirms droplet/firewall/key/tag absent and snapshot255003176 retained, before
the original backstop. Conservative compute estimate$1.1972766880, not invoice;
snapshot storage separate. Admission is consumed/closed. No automatic retry or
new paid continuation follows; repair row-driver receipt transport in source
first, then obtain fresh native admission without erasing this stopped attempt.
