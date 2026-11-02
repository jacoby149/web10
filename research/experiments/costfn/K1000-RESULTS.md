# First K=10/100/1000 Connected Trial

One 1,000-creator dataset, one post per creator, one reader following all 1,000.
Personal queries explicitly select 10, 100 or 1,000 of those groups; discover
selects one board group. Groups have public read grants and the reader joins
the followed groups. These are readable-group checks, not mixed allowed/denied
or non-member class-grant workloads.

## Setup And Completion

- Source: `1a983520e58e4ba661d04f7af54f1186effcd086`, no local source patches.
- DigitalOcean sfo2, s-4vcpu-8gb, Ubuntu 24.04, Linux 6.8.0-147-generic.
- Docker 29.1.3; running ClickHouse version queried as `24.3.18.7`.
- Localhost HTTP to the API; single Uvicorn process; SSH uses `IPQoS=none`.
- Seed 42; 1,000 creators, one post each, reader follows all 1,000. The board
  additionally receives ten posts. Seed completed on the first attempt in
  818.3 seconds. No startup/seed retry was needed in this trial.
- Twenty samples per cell, both feeds, both resolvers, A/B/C: all 20 cells
  completed with 20 samples each, for 400 measurements.
- All 320 B/C HTTP requests returned 200. The 80 A executions completed
  directly in ClickHouse; their HTTP success count is correctly zero.
- Eight B-minus-A report comparisons populated; each baseline is reused for
  both resolvers. These are not matched causal authorization measurements.
- Local artifacts: `.context/costfn-k1000-results/`,
  `.context/costfn-k1000-bench.log`, `.context/costfn-k1000-seed.log`,
  `.context/costfn-k1000-startup.log`. These are workspace-local, not an archive.
- Droplet 614936287 deleted after collection; empty account droplet list verified.

## Personal Query Results

Milliseconds, median / p95. B executes the document query; C substitutes a
fixed 20-row result. Total is internal handler time, not client HTTP latency.

| K | Resolver | B Readable | B Total | C Readable | C Total |
|---:|---|---:|---:|---:|---:|
| 10 | per-group | 75.030 / 93.295 | 129.355 / 171.177 | 76.360 / 88.839 | 104.955 / 134.298 |
| 10 | batched | 23.470 / 31.174 | 81.275 / 98.907 | 27.070 / 33.600 | 59.910 / 85.526 |
| 100 | per-group | 764.385 / 843.210 | 831.350 / 915.175 | 693.675 / 806.755 | 731.740 / 848.744 |
| 100 | batched | 41.775 / 51.651 | 99.415 / 139.469 | 40.445 / 49.454 | 71.790 / 90.970 |
| 1000 | per-group | 7535.705 / 8504.610 | 7644.655 / 8679.235 | 8388.385 / 9102.205 | 8529.745 / 9204.188 |
| 1000 | batched | 213.980 / 284.032 | 363.305 / 435.028 | 222.570 / 281.195 | 299.590 / 350.270 |

For B, increasing K from 10 to 1,000 increased readable median by 100.44x
per-group versus 9.12x batched. At K1000, batched readable was 35.22x faster
and handler median 21.04x faster. C shows the same qualitative separation:
K1000 readable 8,388.385 vs 222.570 ms and handler 8,529.745 vs 299.590 ms.

The per-group path successfully returns results but its multi-second cost is
a practical bottleneck for this workload. Batching reduces database round trips
to three; it does not make metadata size, SQL generation or total cost constant.
Batched B compilation median rose from 13.115 ms at K10 to 48.775 ms at K1000.
The observed batched handler still grew 4.47x over the 100-fold K increase.

## Baseline And Discover

A precompiles the known-readable projection outside the timed interval, then
times direct ClickHouse execution. Median / p95 in milliseconds:

| Query | K | A Scan |
|---|---:|---:|
| personal | 10 | 28.646 / 35.945 |
| personal | 100 | 29.989 / 46.065 |
| personal | 1000 | 54.166 / 67.959 |
| discover | 1 | 29.918 / 38.108 |

Discover B readable medians were 9.525 ms per-group and 25.370 ms batched;
handler medians were 75.975 and 87.510 ms respectively. The small-K fixed-cost
tradeoff persists. Discover was measured at only one node size in this trial.

## Interpretation Limits

This extends the earlier [100-creator trial](K100-RESULTS.md), but the dataset,
host and source snapshot differ. Do not pool their samples or treat them as
independent repetitions of the same configuration. All three K values above
use the same 1,000-creator dataset and host.

There is one sequential trial, no offered-load/concurrency sweep, no randomized
cell order and no explicit warmup exclusion. Twenty samples give preliminary
p95 estimates only. Per-cell files retain summaries rather than raw samples.
The query selects doc_id/body with ordering and LIMIT 20; it is not full feed
assembly, and does not exercise engagement joins, media preparation, browser
latency or the Origin-based app-contract gate. Success counts do not certify
permission equivalence or correct result contents across all policies.

The report's causal_overhead_B_minus_A key is historical: A lacks HTTP-handler
authentication, compilation and serialization, so its difference from B is a
pipeline-versus-scan comparison, not clean causal authorization overhead.
K1000 is now measured for this workload; full E3 still needs independent trials
and the remaining workload/correctness/measurement gates.

Measurement command after seeding:

```bash
python3 -u bench.py --manifest seed-manifest.json --k 10 100 1000 --runs 20 \
  --compose "docker compose -f $PWD/compose.yml -p web10-costfn" --out results
```
