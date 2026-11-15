# First connected diagnostic on the validated store

The immediate question is modest: can one reader get a correct feed from the
new store, and what does that sequence cost? Start with one reader, not a fleet.
Three observations are a diagnostic, not a tail-latency distribution in disguise.

## Result: restore complete, untreated baseline times out

[The compact receipt](evidence/REALISM-SMOKE-20261113.json) records the completed
13 November run. All seven node-table counts reconcile, including 88,200,300
documents and 1.6B delivery events. Total preparation is 1,287.174 seconds;
delivery import is 962.18 seconds. Independent expectations, real K20-plus-self
group discovery and wrong-Origin denial pass.

The excluded warm-up and all three measured **main** requests return HTTP 400
with native timeout code 159. Client failure observations are 11,261.854,
11,207.841 and 11,255.677 ms, not completed-feed latencies. Each failed main
reads 360,801,800 rows / 24,319,446,938 native logical bytes and peaks around
5.16–5.18 GB tracked query memory. Read bytes are not physical disk I/O; rows
can include repeated reads, not distinct documents. This newly restored serial
diagnostic does not establish controlled merge/cache steady state or causality.

No main projection returns, so exact API output, engagement follow-ups and the
live-delivery delta comparison remain **unexercised**, not passed. Keep this
negative baseline; diagnose its reads and merge/cache conditions before choosing
a treated arm, without raising the timeout. All owned run containers are stopped
by 21:00:51.700 UTC, no OOM. The original validation receipt hash and existing
host cleanup deadline are unchanged. Stopping containers does not stop host
billing; the provider host and retained volume are not deleted by this run.

## This bite

The operator authorizes the retained DigitalOcean host `618505005`, at most two
hours/$0.50 incremental compute, within the unchanged host cleanup deadline
**14 November 2026 04:38:02 UTC**. The operational window begins **13 November
20:27:26 UTC** and ends **22:27:26 UTC**; failed setup attempts do not reset it.
Host-local stop timers bound the owned containers independently of the client.
The existing provider cleanup watchdog remains responsible for eventual host
deletion; stopping containers is not a claim that provider billing has stopped.

This is a narrow diagnostic exception to the full-pilot gate, not closure of
RD2–RD4. Spaces, statistics review, lifecycle acceptance, full treated-sequence
integration, formal repeated trials and paper submission remain separate.
No production action, new machine, regeneration, public release or submission.

## Restore, discover, measure, verify

1. `restore_realism.py` binds the approved dataset ID and original independent
   validation receipt SHA-256. Recheck every Parquet file's size/hash before any
   Docker write. Refuse an existing project, volume, network or receipt.
2. Start fresh ClickHouse/MinIO/API containers, with ClickHouse **24.8.14.39**
   pinned by image digest, **28 GiB container / 22 GiB server**, API 2 GiB and
   MinIO 512 MiB. Only the API publishes a port, on loopback. No treatment,
   policy bypass or stub output. The node's ordinary ten-second query ceiling
   is unchanged. API boot runs its own current schema migrations.
3. Mount only the generated dataset read-only. No validation database is
   mounted, adopted or rewritten. The official image's recursive ownership
   adjustment is disabled for this mount; retain its unprivileged server user.
   Wait for the entrypoint to become the final server: the temporary bootstrap
   server answering `SELECT 1` does not mean initialization has finished.
4. Import the seven node tables through explicit Parquet column names and
   reconcile exact counts against the manifest plus known Discover boot rows.
   Import is preparation, never measured feed time. Keep partial failures.
5. `smoke_realism.py` selects reader **index 1** before observing responses.
   Index 0 is the conditioned viral probe and is deliberately not used here.
   Require exactly 20 followed memberships. Real app discovery also includes
   the reader's own followers group; report that extra group rather than
   quietly discarding it or changing the meaning of K.
6. Query canonical restored facts independently for ordered candidates,
   projected bodies/profiles/times/groups and group-scoped engagement. Main
   joins use the feed groups; follow-ups additionally use Discover, just as
   the captured app requests do. Cross-author reactions are not reclassified
   as authored by the followed creator. Wrong-Origin access must return 403.
7. Run one excluded warm-up and three measured sequences. Await main, reactions,
   comments and views **one at a time**. This deliberately serial smoke schedule
   differs from the app's concurrent follow-ups and is not a formal study cell.
   Verify every projected main value and exact follow-up counts. Independent
   before/after delivery reads establish the live views/reach delta; arbitrary
   overcounts do not pass. Semantic failure stops measurement. HTTP failures
   remain failures and do not become successful timing samples.
8. Retain request correlation, client elapsed times, query IDs, read rows/bytes,
   largest individual native query peak memory and exception codes. Native SQL
   attribution uses exclusive sequential sequence-time windows; it is not
   per-request distributed tracing, and largest query memory is not whole-node
   peak RSS. Exclude oracle work from measured sequence windows.

The remote operational receipts/logs live under
`/mnt/costfn-work/smoke-20261113/`. A completed restore receipt explicitly says
`connected_correctness: false` and `pilot_ready: false`; only the separate smoke
receipt can establish what actually ran. Keep setup failures as setup failures.

## Offline controls

```sh
python3 research/experiments/costfn/restore_realism.test.py
python3 research/experiments/costfn/smoke_realism.test.py
```

These controls never start an engine or touch the network. Engine execution for
this bite stays on the approved DigitalOcean host, not the shared Mac Docker VM.
