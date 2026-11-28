# Diverse-reader c-32 serving bundle: calibration resource stop

**`CALIBRATION_RESOURCE_STOP` — expensive response preparation held all four
reader pools at their handler limit.** At the 60.273-second calibration drain
gate, only 41 of 1,248 scheduled, offered and started feeds had completed.
All eventually finished; that does not change the failed gate. Warm-up, the
measured peak and average, the publication stream, storage calibration and the
contracted final drain were **NOT RUN**. No sustained throughput, concurrent
parity, storage-supply or production-capacity claim follows.

## Same-store replay and effective configuration

One DigitalOcean `c-32`, droplet `624078329` (`nyc1`), exposed 32 logical CPUs
and 62.79 GiB of usable RAM. The 24-hour failsafe was verified. Original
preparation `9f2837d343c0` verified the frozen Parquet and retained fixture,
selected the same 150 readers from 20,000 eligible, and passed all four formal
composition gates. The replay rebound the 150 banked oracle packets to the
matching census without changing oracle values or grants. The completed
indexed mixed-cell checkpoint verifies all 750 reader-route comparisons.

[PR #1758](https://github.com/jacoby149/web10/pull/1758) records the [one
configuration treatment](../../DAU-SERVING-CONFIGURATION.md). On `f17354d85`
the owned engine restart and original 28/22 GiB container/server limits
verified, as did the canonical certificate. All five API processes started,
but the readiness observer tried to read the pool on the driver backend
wrapper. No calibration ran on that attempt; its off-host archive is retained.
[PR #1759](https://github.com/jacoby149/web10/pull/1759) repaired only the
readback. Calibration ran on merged `ac52bb6555ed`, reusing the completed
mixed-cell checkpoint on the same lease. Effective settings:

- Four loopback read processes with five AnyIO slots each, one separate
  publication/login process with four. The publication process was idle during
  the calibration offers. Every process verified a nonblocking engine pool
  retaining up to 16 connections per host. At most six idle connections were
  sampled per reader process; retention is not a hard concurrency ceiling.
- ClickHouse `26.10.4.207`: one thread per captured query, 40 concurrent queries,
  merge pool 8, merge/mutation ratio 2, free-entry thresholds 4/4/8. Event merges
  were left enabled; the existing physical certificate fences were restored.
- API/engine descriptors were 65,536/262,144 soft and hard, respectively; the
  driver read back 65,536 soft and 1,048,576 hard. The worst sampled API process
  used 385 descriptors; the engine preflight had 277 open.

Compared with the earlier [single-worker stop](../dau-sustain-diverse-20261127/RESULTS.md),
the four workers distributed API work and 20 instead of three complete feeds
finished in the 120-second average offer window. Both bursts had zero in-window
completions. This is a comparison of separate attempts, not an ablation or a
causal estimate for any one setting.

## Calibration utilization

| Observation | Average offer: 2.9/s for 120 s | Burst offer: 15/s for 60 s |
|---|---:|---:|
| Scheduled / offered / started | 348 / 348 / 348 | 900 / 900 / 900 |
| Finished during the offer window | 20 (0.167/s) | 0 |
| Finished after allowing all issued work to settle, including in-window finishes | 348 | 900 |
| Resource samples / first-to-last span | 9 / 118.0 s | 5 / 56.3 s |
| Guest busy CPU, first-to-last | 61.77% | 62.94% |
| Busiest logical CPU over the phase sample span | 89.12% | 94.63% |
| ClickHouse CPU, core equivalents | 17.99 | 18.32 |
| Reader CPU, ports 6101–6104 (core equivalents) | 0.38 / 0.37 / 0.37 / 0.37 | 0.39 / 0.36 / 0.36 / 0.34 |
| Max active workload engine queries (ceiling 40) | 20 | 19 |
| Peak borrowed tokens on each reader (limit 5) | 5 / 5 / 5 / 5 | 5 / 5 / 5 / 5 |
| Max AnyIO waiters per reader, per-process maxima | 109 / 107 / 105 / 105 | 351 / 355 / 345 / 346 |
| Sampled in-flight feeds, first to last | 1 → 328 | 349 → 1,190 |
| Guest device `vda1` read / write rate, sampled average | 2.42 / 5.66 MB/s | 2.89 / 5.13 MB/s |
| End sample: ClickHouse cgroup / API cgroup / host cache and buffers | 2.08 / 0.70 / 47.11 GiB | 2.42 / 0.76 / 47.40 GiB |
| Merge debt / pending mutations at sampled endpoints | 0 B / 0 | 0 B / 0 |

CPU uses actual `/proc/stat` deltas for [each logical CPU](per-core.csv) and
separate process ticks; the private receipt retains each interval. The CPU
spans are first to last observation, not whole-window estimates. cgroup current and host
page cache overlap and are not added. Guest I/O rates are actual counter
deltas, not a disk-supply test. AnyIO counts are endpoint tasks, not unique
feeds; the three follow-ups can run concurrently. Later completion of all
reads took about 43 minutes from the start of the average offer, not the
60.273 seconds required after the burst. All work settled without a supervisor
cancellation. The 41 at the gate and the eventual 1,248 are distinct counts.

## Isolated read: what held the slots

The three idle feed sequences took 21.00, 19.97 and 20.09 s. In the first
sequence the main HTTP request took 20.42 s and the reaction, comment and view
follow-ups took 274, 351 and 571 ms, respectively; those follow-ups overlap.
Main-handler timings: authentication 0.7 ms, app contract 57.7 ms, parse and
validation 4.4 ms, readable resolution 38.9 ms, compile 2,052.3 ms, response
preparation 18,020.4 ms, serialization 0.2 ms, with 231.8 ms unattributed.
Unattributed time is not a direct measurement of queue wait.

The 46 captured main statements and 26 follow-up statements matched their
exact native finishes. Eight main `preparation` statements took **17.806 s
summed native elapsed** and read **12.975 GB logical**, almost all in four
authority-preserving service lookups:

| Preparation lookup | Native elapsed | Native logical rows | Native logical GB |
|---|---:|---:|---:|
| Posts | 3.170 s | 86,718,875 | 2.491 |
| Reactions | 6.395 s | 86,718,875 | 4.329 |
| Comments | 5.700 s | 86,718,875 | 4.316 |
| Profile | 2.529 s | 86,718,875 | 1.838 |

The remaining four were small generation checks. ClickHouse was doing
substantial work below its configured query ceiling; low disk traffic does
not make these logical reads cheap. The effective handler slots held by
expensive preparation are the observed binding boundary. This does not show
that raising the slots would be sufficient or that a full core, disk, pool
or memory cap was reached. No read-path rewrite was made.

## Custody and cleanup

- Preparation archive, 175,880,220 bytes, SHA-256
  `d265fa951cc3e099087db1ca63bf5ee98ebc3f11eaef2281331f57576d8b7729`.
- Bundle startup refusal preserved separately, SHA-256
  `f8f3d230c53a8d46d89ee3e8e40d089f53c537ea8112a6276ac60090bc2d467f`.
- Final archive, 193,736,442 bytes, SHA-256
  `67fb7b87a3d076cc9e72aa5020cf95b4ece5c6e1870d14b7588dbb084a49b158`.
- After API shutdown and a zero-active-query check, the separate native log
  extract banked 91,890 tagged finishes (distinct IDs, zero exceptions,
  `max_threads=1` in every recorded setting). SHA-256
  `22a8d0ab58ca140c410f54d89206a944abc4d1f17c8f8073828f97caed987158`.

The final archive and native receipt verified off-host before deletion.
Owned cleanup verified **28 November 2026, 02:00:46 UTC**. Snapshot
`255003176` remains in `nyc3` and `nyc1`. Estimated compute **$6.8084 of $25**,
not an invoice; snapshot storage is separate. Admission is closed.
