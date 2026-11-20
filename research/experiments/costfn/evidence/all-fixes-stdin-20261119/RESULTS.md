# Stdin transport passes natively; aggregate seed stops at22GiB

**Attempt three reaches native tally verification, then stops during aggregate
setup with ClickHouse241. No complete-composition or row-model measurements run.**
The transport fix works on the actual185,447-byte billboard INSERT. Separately,
completed native tally evidence now covers all20 actual paired roots in all five
domains and matches exactly. That closes the first tally run's missing-domain
proof gap; it does not make this stopped composition pass.

[results.json](results.json) owns this attempt's native failure/cost/cleanup facts.
[source-binding.json](source-binding.json) records the freshly generated source
bindings. [paired-tally-evidence.json](paired-tally-evidence.json) records the
offline audit of completed native checks, not a new engine run. The first two
attempt records remain byte-identical and retain their own costs and outcomes.

## Transport-only fix, merged before spending

[PR#1597](https://github.com/jacoby149/web10/pull/1597/files) changes only the live
modern/native bridge and its controls. SQL leaves argv and is encoded once as
UTF-8 into file-backed stdin. The parent descriptor closes immediately after
spawn, before polling; the child inherits readable bytes and EOF without a
potentially full pipe. The caller supplies the exact existing read/write-prefix
classification explicitly. A native finish with lost read-result transport
still refuses; eligible completed writes retain their prior handling. Query
IDs, completion polling and submit-once discipline are unchanged. Historical
arm scripts and both banked failure records are untouched.

All38 no-engine suites/361 tests and focused Ruff pass. Four new controls include
a real local subprocess consuming185,447 UTF-8 bytes, including non-ASCII data,
with exact hash/EOF and parent-close-before-poll checks; small statements use
the same flag-only shape. Read/write guard, prefix classification, non-waiting
transport and the existing timeout/native-exception/no-repeat controls pass.
All three PR checks were green before merge. Full controls pass again on merged
dev`55b68ef7f786920458a86196f633924eb4c01e18` before this lease.

The realistic-size control's actual argv, with its generated ID normalized, is:

```text
docker compose exec -T clickhouse clickhouse-client --user web10 --password web10 --database web10 --query_id QUERY_ID --max_execution_time 600 --receive_timeout 610 --max_memory_usage=23622320128 --max_threads=4 --max_rows_to_read=0 --max_rows_to_read_leaf=0 --max_bytes_to_read=0 --max_bytes_to_read_leaf=0 --max_result_rows=0
```

Those are fixed public research-fixture credentials. No SQL or `--query` argument
appears. The native run retains its configured Compose-file prefix and setup
settings; this is the real-process no-engine control, not a claimed engine test.

## One fresh lease, exact source

DO621423661, original8-vCPU/32GiB/400GiB AMD innyc3, restored snapshot255003176,
ClickHouse26.10.4.207, unchanged32/28/22GiB frame. Bound window:
19 November23:08:08→20 November03:08:08UTC. Two provider-readiness timeouts stayed
on this host; no replacement/extension. Both owned self-kill timers were active,
with agent supervision and off-host checkpoints, no guardian. Costs are
receipted, not capped; legacy budget fields are compatibility metadata only.

All1,480 deployed hashes/banked pins and regenerated row-source readiness pass
before restore. The new admission binds the merged commit and all three live
bridge/restore hashes. The11-file row-model dictionary is regenerated too; its
hashes remain equal because neither transport module belongs to that dictionary.
The run source is unchanged throughout.

| Setup stage | Outcome |
|---|---|
| Banked baseline/B/D citation | PASS — no timing rerun |
| Restore | PASS,89.693s bridge wall time; not provider-provisioning performance |
| Read setup / migration | PASS |
| Billboard fixtures | **PASS:**338 documents and950 links, both native QueryFinish/client0 |
| Initial scopes/metadata/fanout | Completed within furniture |
| Generic tally build/verification | **PASS:**12 scopes;2,764.820s setup;60 sample roots/fat checks |
| Refs satellite build | Completed; census parity still not run |
| Aggregate views seed | **STOP — native241, query memory limit22GiB** |

The original billboard SQL SHA`b7c5f1b512759a40a4a341d2dd84791db395607959616a6699ae3218a0eeb207`
now finishes natively at364ms,338 written rows/185,293 logical bytes. SQL argument
size185,447 bytes and native logical bytes are different quantities. Its exact
ID/stdio/single-submission receipt is in the JSON report and private archive.

## Aggregate failure: real partial actuals, not a feed sample

`composition_aggregate_setup_2`, query
`fanout-f-55f2521e468e410fa3ad5cf35d8ef7fc`, is submitted once on stdin. Native
`ExceptionWhileProcessing`241 reports:

```text
Query memory limit exceeded: would use22.00GiB (attempt to allocate4.01MiB),
maximum22.00GiB: While executing SourceFromNativeStream.
```

| Failed setup statement | Native actual |
|---|---:|
| Duration |247,336ms|
| Read rows |1,600,000,000|
| Logical read bytes |131,199,996,416|
| Written rows before failure |13,214,911|
| Logical written bytes before failure |1,202,556,901|
| Recorded memory usage |23,620,075,140 bytes|
| Native time/memory settings |600s /23,622,320,128 bytes|

This is a query-memory refusal, not container OOM or a600s timeout. The written
counts are native reported actuals, not proof of committed rows after failure;
they do not constitute a complete aggregate. The controller preserves furniture
`INCOMPLETE`, blocks every subsequent stage and refuses the row worker because
composition accounting has not banked. No statement is retried, no memory limit
raised, and no partial aggregate is consumed by measurements.

## Each parity verdict — distinguish native tally proof from blocked stages

| Check | Banked evidence | Composition controller stage |
|---|---|---|
| Refs full census / same-question parity | NOT RUN | BLOCKED |
| Ordinary/fat/store-sample tally parity | **PASS**, completed native setup checks | Wrapper not reached |
| **Paired tally: actual20 roots in all five domains** | **PASS**, completed native value/domain proof, audited off-host | `verify-paired-tallies` BLOCKED |
| Raw versus aggregate views parity | NOT RUN — aggregate seed incomplete | BLOCKED |
| Exact ad identity per page post | NOT RUN — fixture construction is not identity parity | BLOCKED |
| Complete-response parity | NOT RUN | BLOCKED |

For the paired proof, each domain explicitly queried101 IDs including all20
actual roots, with zero missing roots. Main reactions/comments/posts have exact
empty maps; follow-up reactions and comments have128 and32 matching value keys
across their whole verification domains. No positive count is inferred for an
actual paired root from those domain-wide totals. Oracle/stored maps compare
exactly, and prepared-page/follow-up parity passes with explicit domain refusal.

The audit reconstructs both original SQL hashes, including `FORMAT JSON`, for
all ten query IDs, verifies their native QueryFinish/exception0 records, and
replays the unchanged filesystem-only paired contract. It neither runs an
engine nor rewrites the failed programme summary. **The old missing20-root
verification gap is closed by new native evidence; the formal composition stage
remains blocked.** No refs/views/ads/full-composition acceptance follows.

## Requested measured compositions and unclassified inventory

| Complete response | Warmup | Measured | Per-stage decomposition |
|---|---|---|---|
| Uniform K20 | BLOCKED | BLOCKED | Unavailable |
| Paired P | BLOCKED | BLOCKED | Unavailable |
| Paired F | BLOCKED | BLOCKED | Unavailable |

The unclassified-query list is **unavailable**, not empty. No500ms/25MB budget
verdict is assigned. Setup actuals above are not substituted for feed costs.

## Row-model stage table — assembly separate, all unrun

| Canonical-versus-row stage | Warmup | Measured | Assembly | Generation fence |
|---|---|---|---|---|
| Uniform K20 feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired P feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired F feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Ordinary post open | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired post open | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Fat post open | NOT RUN | NOT RUN | Unavailable | Unavailable |

The full-family build/key-and-type verification/row worker never starts. D117
remains pending; no assembly verdict, page-scale/feed-budget/capacity/production
or§8 acceptance. `PARTIAL_MEASUREMENTS` is not claimed either.

## Custody, new-attempt cost and cleanup

Private controller:`~/.local/state/web10-research/web10-fanout-f-25a00cf5079b/`.
The final6,819,867-byte state archive SHA
`5456a3fd4d64019b31338d1a2debaf6d0601b24d085658778324c32dbff6b2e2`
and13,219,526-byte stopped-native archive SHA
`87485432c15e70b3907b2c1b9061363de93d2a63b79152cf8e8f7a6232c6ca96`
were copied/hash-verified off-host before deletion. Original failures, source,
bindings, controls, native576-record setup collection and private payloads remain
private. Of those scoped root-ledger records,575 have exception0 and the aggregate
has241;575 carry600s bounds and the existing membership-setup call120s. This is
not exhaustive all-child-setup/observer accounting or measured feed decomposition.

Owned droplet/firewall/key cleanup verifies **20 November01:01:50.392UTC**;
the tag is also deleted. Final provider readback01:02:45.277UTC confirms all four
absent and **snapshot255003176 retained**; droplet list empty. Provider settling
and transient key-delete errors are retained. No engine restart for collection;
all container OOM flags false. Partial derived state is destroyed with this host,
not saved into the retained original snapshot.

This attempt only:6,822.391994 seconds×$0.25/hour = **$0.4737772218 estimated
compute**, not an invoice; ongoing snapshot storage separate. No costs or verdicts
are carried from the earlier attempts. Baseline/B/D and historical FAILs stay
banked unchanged. Admission consumed/closed; no automatic repair or paid retry.
Next source-only work is the aggregate seed's241, preserving exact merged reach,
the full frozen input and the unchanged600s/22GiB frame.
