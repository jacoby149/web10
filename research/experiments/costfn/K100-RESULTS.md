# First K=10/100 Connected Trial

Historical trial record. The later [1,000-creator sweep](K1000-RESULTS.md)
measures K10/100/1000 and is now the manuscript's main table. It does not turn
this earlier dataset into an independent repetition of the later configuration.

One 100-creator dataset, one post per creator, one reader following all 100.
Personal queries explicitly select 10 or 100 of those groups; discover selects
one board group. Groups have public read grants and the reader joins the
followed groups. This is not a mixed private/denied policy workload.

## Setup

- Host: DigitalOcean sfo2, s-4vcpu-8gb, Ubuntu 24.04, Linux 6.8.0-147-generic.
- Docker: 29.1.3. SSH required `-o IPQoS=none` on the driving network.
- Source: `cf7943c8899f95e7efc808a75c328579fcd3d6c5`, plus the local settings
  type-preservation fix. Remote settings.py SHA256:
  `99800959a5e26bd116d991c385cb62b8a4502d4be0354ee57e0d80668a284611`.
- Seed: 42, CREATORS=100, FOLLOW=100, POSTS_PER_CREATOR=1.
- Bench: K=10/100, RUNS=20, both feeds, both resolvers, A/B/C.
- 15 cells completed with 20 samples each: 300 measurements. All 240 B/C HTTP
  requests returned 200; 60 A executions used ClickHouse directly.
- Artifacts: `.context/costfn-k100-results/`, `.context/costfn-k100-bench.log`.
  These are local workspace artifacts, not tracked paper evidence.
- Droplet 614918237 was deleted after collection; empty droplet list verified.

## Results

Milliseconds, median / p95. B is the real query pipeline; C stubs the scan.
`total` is server-internal pipeline time, not end-to-end HTTP latency.

| Feed | K | Resolver | B Readable | B Total | C Readable | C Total |
|---|---:|---|---:|---:|---:|---:|
| personal | 10 | per-group | 83.410 / 97.625 | 147.665 / 171.627 | 87.860 / 96.986 | 123.535 / 150.315 |
| personal | 10 | batched | 26.985 / 29.419 | 86.195 / 105.776 | 26.455 / 30.441 | 56.855 / 70.658 |
| personal | 100 | per-group | 887.560 / 1042.400 | 952.505 / 1137.536 | 826.470 / 949.465 | 866.235 / 1008.330 |
| personal | 100 | batched | 45.080 / 53.737 | 116.375 / 142.943 | 45.750 / 52.735 | 86.925 / 103.564 |
| discover | 1 | per-group | 9.210 / 10.538 | 72.165 / 94.940 | 9.635 / 11.313 | 44.855 / 54.182 |
| discover | 1 | batched | 28.140 / 31.872 | 94.455 / 108.300 | 26.785 / 30.264 | 63.060 / 80.095 |

B readable median grew 10.64x for the per-group resolver when K increased 10x,
versus 1.67x for batched. At K100, batched readable was 19.69x faster and total
was 8.18x faster in this trial. At K1, per-group was cheaper than batched.
This supports investigating a small-K/large-K crossover, not blindly switching
every request to batched resolution. Batched cost was not constant in K.

A direct-scan median / p95 was 30.486 / 38.942 ms at personal K10,
32.256 / 40.289 ms at personal K100, and 30.119 / 39.125 ms for discover.
A excludes auth, compilation and serialization and precompiles the known-readable
group projection. B-minus-A is therefore a pipeline-versus-scan difference,
not clean causal authorization overhead from matched HTTP requests.

## Limits And Failed Attempt

This is one sequential trial, not concurrent capacity testing. Twenty samples
provide a preliminary p95, not a robust tail estimate. There is no explicit
warmup exclusion or randomized cell order. Discover was measured at one node
size only. K1000, mixed-access workloads, independent trials and the actual
production feed SQL remain separate work; these queries project doc_id/body
with ordering and a limit. Raw per-request records are not persisted by the
current harness; retained files contain per-cell summaries.

The first fresh-stack attempt failed during creator group creation with repeated
HTTP 500 responses. Automatic teardown removed its containers before server
logs were collected, so the cause is unknown, not proven to be the schema race.
The host's second fresh stack seeded all 100 creators in 89.9 seconds without
code changes, then completed the benchmark. The first failure log is retained
at `.context/costfn-k100-initial-failure.log`. This is evidence of a remaining
startup/reliability gap, not a clean unattended-orchestrator success.

Reproduce the measurement after seeding:

```bash
python3 bench.py --manifest seed-manifest.json --k 10 100 --runs 20 \
  --compose "docker compose -f $PWD/compose.yml -p web10-costfn" --out results
```
