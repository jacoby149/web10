# web10 SIGMOD Experiment — Query Engine Evaluation

The evaluation harness for the SIGMOD 2027 industry track paper. Measures the
query engine's phase-level latency (the access decision vs. the data read) on
a synthetic dataset, on a single cheap VPS. The "lite hardware" story: the
entire web10 node runs on a small Digital Ocean droplet.

## The experiment

1. **Spin up** a Digital Ocean droplet (s-4vcpu-16gb: 4 vCPU AMD EPYC, 16 GB,
   ~$0.30/hr, nyc3).
2. **Clone the repo**, bring up the docker-compose stack (api + clickhouse +
   minio).
3. **Seed** a deterministic synthetic dataset (N users, each with a followers
   group, M posts, K comments/reactions).
4. **Bench** the query engine: N concurrent readers replay the feed query
   (the 267→1 query) for T seconds. The API's phase-level timing telemetry
   (added in 3.247.0) logs each query's per-phase duration.
5. **Collect** the results: p50/p95/p99 per phase, throughput (qps), memory
   per container, the hardware spec.
6. **Tear down** the droplet. Billing stops.

The whole measurement is localhost — no external traffic, no network noise.
The latency is pure CPU + disk + the docker bridge.

## The files

| File | What it does |
|---|---|
| `spinup.sh` | Creates the DO droplet, waits for the IP, prints it. |
| `teardown.sh` | Destroys the droplet. Billing stops. |
| `seed.py` | Deterministic synthetic data generator (users, groups, docs). |
| `bench.py` | Query-engine load generator + phase timing collector. |
| `run.sh` | The orchestrator: compose up → seed → bench → collect → results. |
| `results/` | The output: `bench-results.json`, `seed-summary.json`, `docker-stats.txt`, `system-info.txt`. |
| `pre-experiment/` | The baby test: spin up → docker hello-world → error → teardown. De-risks the lifecycle. |

## Quick start (on your machine, to get the box)

```bash
export DO_API_TOKEN=<your-digital-ocean-api-token>
cd research/experiments
./spinup.sh
# → prints the IP, e.g. 159.XX.XX.XX
```

## On the box (the go-go-go)

```bash
ssh root@<ip>
git clone <repo-url> ~/sucre
cd ~/sucre
git checkout jacoby149/sigmod-industry-paper   # the branch with the telemetry
cd research/experiments

# install deps (one-time)
apt-get update && apt-get install -y python3-pip docker.io docker-compose-v2
pip3 install clickhouse-connect requests

# run the experiment (defaults: 10K users, 50 posts/user, 100 readers, 20s)
./run.sh

# or a bigger scale:
USERS=100000 POSTS=20 READERS=500 CONCURRENCY=50 DURATION=120 ./run.sh
```

## Collect the results

```bash
# from your machine:
scp -r root@<ip>:~/sucre/research/experiments/results/ ./results/
```

## Tear down

```bash
export DO_API_TOKEN=<your-token>
cd research/experiments
./teardown.sh
# → "destroyed. billing stopped."
```

## The scale curve (the paper's E3 cost model)

Run `run.sh` at multiple scales to get the cost + latency curve:

```bash
# 1K users (the "small creator" case)
USERS=1000 POSTS=50 ./run.sh
# copy results/ back, rename to results-1k/

# 10K users (the "mid-tier creator" case)
USERS=10000 POSTS=50 ./run.sh
# copy results/ back, rename to results-10k/

# 100K users (the "established creator" case)
USERS=100000 POSTS=20 ./run.sh
# copy results/ back, rename to results-100k/
```

The paper plots: latency (p50/p99) vs. scale, memory vs. scale, cost vs.
scale. The "scales up like crazy" selling point: at 100K users, ClickHouse
is using ~2 GB RAM on a 16 GB box. The per-user key-space model doesn't blow
up memory because it's a single columnar table with an `author_key` filter,
not a database per user.

## The headline number

The bench computes `overhead_pct` = `readable_p50 / execute_p50 * 100`.
This is the access-decision overhead as a fraction of the data read. If
`readable` is 2 ms and `execute` is 15 ms, the access model costs 13%
overhead. If `readable` is 0.5 ms and `execute` is 15 ms, it's 3%. That's
the "zero scan-time penalty" claim, with numbers.

## Reproducibility

The experiment is fully reproducible:
- **Hardware:** Digital Ocean s-4vcpu-16gb (4 vCPU AMD EPYC, 16 GB), nyc3
  (New York 3). The spec is in `results/system-info.txt`.
- **Software:** the repo at the commit you cloned. The docker-compose stack
  (api + clickhouse 24.3 + minio). The ClickHouse schema is in
  `clickhouse-init/`.
- **Data:** `seed.py --seed 42` is deterministic. The same seed produces the
  same dataset. The scale is in `results/seed-summary.json`.
- **Bench:** `bench.py --readers N --concurrency C --duration T`. The feed
  query is in `bench.py` (the `FEED_SQL` constant). The timing is parsed
  from the API's `[query] … timing_ms` log lines.

Anyone can re-run this on a small DO droplet in ~10 minutes.

## The baseline (future)

The head-to-head against a conventional backend (Postgres 16 + RLS per
group, same seed, same queries) is a second compose file + a second bench
run. Not built yet — the web10 numbers come first.
