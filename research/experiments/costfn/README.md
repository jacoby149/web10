# Access-Control Cost Function Experiment

> **7 November follow-up: preparation authorized, cloud study not started.**
> The operator requests runnable fixtures, comparator and core-feed tooling and
> approves immutable publication to web10 MinIO. Start with [RUNNING-V2.md](RUNNING-V2.md)
> and the receipt-driven `readiness_v2.py`, not the historical harness below.
> V1 remains a sparse control. V2 adds relational hot/dispersed inputs, actual
> discovery/Origin controls, real core HTTP scheduling, correlation/resource
> receipts and a paired resolver comparator. Sized-host restore/topology/headroom,
> explicit execution approval and budget/watchdog acceptance remain run gates.
> No provisioning, paid study or production deployment is authorized here.

Offline setup checks (no HTTP, database or cloud execution):

```sh
bun test research/experiments/costfn/capture-feed.test.ts
python3 research/experiments/costfn/study_plan.test.py
python3 research/experiments/costfn/study_plan.py --artifact-dir .context/datasets/one-million
```

The source-captured [wire contract](evidence/core-feed-wire-v3.json) verifies the
actual app/SDK builders' three queries plus views, including 21 fetched versus
20 displayed rows, prepare and delivery flags. It is fake-transport evidence,
not a live core-feed result. The planning tool has no execution mode and
`--require-ready` exits 2 while the design is blocked. Do not confuse a valid
wire capture or fixture checksum with an accepted load experiment.

## New workflow: frozen data first, measurement second

Start at [DATASET.md](DATASET.md), not the legacy combined `run.sh` below.
`dataset.py` builds/validates canonical synthetic input files offline;
`restore_dataset.py` prepares and checks a dedicated disposable stack;
`measure_dataset.py` measures an already-restored dataset and records its identity,
without signup, generation or import. The validated 1M-author + 20k-reader
artifact is ~150 MB compressed; [pinned file/manifest receipt](evidence/frozen-1m-v1.json).
This is a sparse public fixture, not measured capacity or full-feed realism.
This V1 workflow is not the V2 core-feed runner; see RUNNING-V2 for its inputs,
approved MinIO publication and actual-host gates.
The previous tier-max run was operator-cancelled (9/20 cells); receipts were
collected and the cloud droplet/local driver stopped. No new cloud run is active.

```sh
python3 research/experiments/costfn/dataset.test.py
python3 research/experiments/costfn/dataset_workflow.test.py
```

**Sixth-draft repeat: operator-cancelled (6 November 2026).**
See [execution record and capacity funnel](SIXTH-DRAFT-RESULTS.md): DigitalOcean
rejected s-8vcpu-16gb with an account-tier restriction; the operator then approved
trying the largest listed four-vCPU option (12 GB) in atl1. Startup/seed succeeded
after the bounded retry repair, but the operator cancelled at 9/20 completed
cells (180 measured samples). Partial files were collected and the host deleted.
The updated harness retains raw timing phases and excluded warm-ups and uses a
seeded randomized schedule; offline tests are not a completed connected run.
The larger-host/1M-author follow-up supersedes the old small-box-only budget
instructions below; those describe the historical K1000 microbenchmark only.

**K1000 trial:** [K=10/100/1000 results](K1000-RESULTS.md), imported from PR
#1313, records one 1,000-creator trial with all 20 cells complete (400 samples).
At K1000, B readable medians were 7,535.705 ms per-group versus 213.980 ms
batched; handler medians were 7,644.655 versus 363.305 ms. The paper now uses
this internally consistent sweep rather than pooling it with the earlier trial.
No startup/seed retry was needed; artifacts were collected and the droplet deleted.
The [summary receipt](evidence/) and `check-paper.mjs` retain/verify the numbers.
This is not capacity evidence; A is not a matched no-policy HTTP baseline and
B-minus-A is not causal authorization overhead. Full E3 remains open.

**First scaling trial:** [K=10/100 results](K100-RESULTS.md) records 100 creators,
20 samples per cell, all 15 cells complete. It includes the initial seeding
failure, source provenance and measurement limitations. Full E3 remains open.

**Connected smoke verified:** 10 creators, K=10, one post/creator, three queries
per cell completed all 10 cells (30 samples) on one sfo2 4-vCPU/8-GB droplet.
All four B-minus-A comparisons were populated. This verifies the pipeline, not
performance or tail latency. The run used `IPQoS=none` for SSH and the settings
type-preservation fix; the droplet was deleted after collecting results.

The harness for the paper's **access-control cost function** — the three-line
ablation that measures *the layer web10 adds* (auth → app-contract → candidate
→ readable-set resolution → group-meta → AST compile → serialize), with the
columnar scan held out or measured as the credited baseline. Full design + the
scope statement: [`../../digital-ocean-thinking.md`](../../digital-ocean-thinking.md)
(§"The access-control cost function"). This file is *how to run it*.

## Cost ceiling + spending safeguards (read before you spend)

This experiment is **cheap by design** — one small box, metadata-only seed, no
content, no media. The whole point of stubbing the scan (line C) and using tiny
posts is that you never buy scale hardware. Budget and guardrails:

- **One box only.** s-4vcpu-16gb nyc3 ≈ **$0.30/hr**. No ladder, no 4-box
  cross-node run (that's a separate follow-up). If you find yourself reaching
  for a bigger instance, stop — the experiment doesn't need it; something is
  wrong with the workload.
- **Hard time cap: ~2 hours wall clock.** compose-up (~5 min) + seed (minutes —
  metadata only, not a content seed) + bench (15 cells × 20 queries, paced under
  the 60/min rate limit ≈ 30–60 min) + teardown. Set a timer. **If it's still
  running at 2 hours, kill it** (`docker compose -p web10-costfn down -v` then
  destroy the droplet) and investigate — a runaway seed or a stuck cell is
  burning money for nothing.
- **Worst case ≈ $1.00** (2 hr × $0.30, rounded up). Three trials = re-run
  `run.sh` three times on fresh droplets ≈ **$3 total**. That is the entire
  budget for the paper's headline numbers.
- **The seed is the only thing that can run long.** It signs up N creators
  through the real API (rate-limited to 60 ops/min/user). At CREATORS=1000 that's
  ~17 min; if you raise CREATORS to 10k, expect ~3 hr and a bigger bill — **don't
  do that for this experiment** (the policy cost depends on K, not creator count;
  1000 creators is plenty to back K=1000). Keep `CREATORS` ≥ the max K you sweep.
- **Destroy the droplet when done — verify it.** `run.sh` tears down the local
  compose stack but does NOT destroy the cloud droplet. After copying
  `results/` off, destroy the droplet (the DO `teardown.sh` / `../teardown.sh`)
  and **confirm deletion** (DO console / `doctl compute droplet list`) — local
  Docker cleanup does not stop the cloud bill. A forgotten droplet is the classic
  blowout: $0.30/hr × days = a surprise invoice.
- **No data leaves the box except `results/`.** Copy that one directory off, then
  destroy. Nothing else is worth keeping.

**TL;DR:** one $0.30/hr box, ~2 hr cap, ~$1 per trial, ~$3 for the full
3-trial dataset, destroy + verify the droplet after. There is no scenario where
this costs more than a few dollars unless you leave the box running.

## What it measures (and what it does not)

- **Measures:** the policy layer, per phase, against **K** (the reader's
  readable-set size) and against **node size** (discover feed). The headline is
  the **pipeline-versus-scan delta B−A** and the isolated layer **C**, plus the
  **per-group vs. batched** `readable` cost on one figure.
- **Does NOT measure:** the ClickHouse scan as a result (it's the credited
  baseline A / held-out constant C), or CDN media delivery (offloaded by
  design — see `cloudflare-plan.md`). The claim is the cost of *our* layer, not
  the performance of the engines it stands on.

## The three lines

| Line | Flags set | Meaning |
|---|---|---|
| **A** | *(none)* | direct ClickHouse baseline inside the API container; executes the node-generated posts projection with the known-readable seed groups, without runtime permission resolution; HTTP policy remains enabled |
| **B** | *(none)* | full pipeline, real `execute` — the actual system |
| **C** | `QUERY_EVAL_STUB_EXECUTE=1` | full pipeline, `execute` stubbed — our layer, isolated from the engine |

The readable-resolution algorithm is varied independently: `per-group`
(default, O(K) round-trips) vs. `batched` (`QUERY_EVAL_READABLE_MODE=batched`,
O(1) round-trips) — so the figure shows the bottleneck *and* the fix. All three
flags default OFF in production (`api/app/settings.py`); the bench sets them
per-cell by restarting the api container.

Line A uses `safe_query.build_safe_query` once outside the timed loop, then
times `ch.execute_query` directly. This preserves B's `documents`/`doc_groups`
projection, deduplication, visibility filters and limit. `/v3/query` cannot
execute the raw projection: its validator rejects physical tables even with
the no-policy flag. A therefore excludes HTTP/auth/compile/serialization;
its policy phases are zero, and `queries_completed` counts direct executions
(`queries_200` is zero). `total_delta_median_ms` reports median B total minus
median A execute; the existing policy-only delta remains separate. This is a
scan-only baseline, not an equivalent no-policy HTTP request.

The standalone `compose.yml` publishes only `127.0.0.1:6000`; neither database
nor object storage publishes ports. Tiny smoke on an existing Docker host:
`CREATORS=10 FOLLOW=10 POSTS_PER_CREATOR=1 K_VALUES=10 RUNS=3 ./run.sh`.
This runs three queries per cell, not a statistically meaningful trial.

## The matrix (what gets run)

For each **feed × K × readable-mode × line**:
- **personal feed:** K ∈ {10, 100, 1000} (the reader's following count) — the
  curve that grows with your social graph.
- **discover feed:** K = 1 always (one board group) — the flat reference; its
  axis is node size (creators seeded), not K.
- Line A runs once per (feed, K) (the mode is irrelevant to it); lines B/C run
  per mode.

Default matrix: (3 personal K values + 1 discover) × (1 A + 2 modes × B/C)
= **20 cells**, each `RUNS` queries. The tiny K=10 smoke runs 10 cells, three
queries each; this is a functional check, not evidence for tail latency.

## Files

| File | Purpose |
|---|---|
| `seed.py` | metadata-only seed through the REAL API: N creators (followers group + tiny posts), one reader following K of them, a discover board. Writes `seed-manifest.json`. |
| `bench.py` | randomized matrix with excluded warm-ups; retains raw timing phases/query IDs and per-phase percentiles. Historical B−A key is not causal overhead. Pure functions are offline-tested. |
| `bench.test.py` | **offline regression tests** (no droplet/API/Docker) for the log parser, percentile math, summary, policy-total, B−A delta, matrix expansion, and per-cell env. Run this locally before spending money. |
| `run.sh` | orchestrator: compose-up (dedicated project) → wait → seed → bench → collect → teardown (only this project). |
| `RUNBOOK.md` | **the repeatable step-by-step** — provision droplet (doctl flags, SSH-key + region traps), docker + GHCR login, clone, run mini-then-full, collect, destroy+verify. Includes a troubleshooting index of every trap hit on the first connected attempt. **Read this before spending money.** |
| `results/` | per-cell JSON + `report.json` (generated; gitignored intent — copy off the box). |

## Run it (on a fresh disposable droplet)

**Start with [`RUNBOOK.md`](RUNBOOK.md)** — it's the full repeatable procedure
with the doctl flag gotchas, the SSH-reachability check (the #1 trap), the GHCR
login for the private base images, and a troubleshooting index. The short form:

```bash
# 0. Verify you can reach DO droplet :22 FIRST (the #1 trap — see RUNBOOK §1d).
# 1. Provision a droplet WITH your SSH key (RUNBOOK §1), install docker (§2),
#    log in to GHCR for the private base images (§3), clone + vhosts (§4).
# 2. Offline check FIRST (no money spent yet): the pure functions are sound.
cd research/experiments/costfn
python3 bench.test.py            # must print "all bench offline tests passed"

# 3. Mini probe first (shake out the first connected run — ~$0.10), then full.
CREATORS=100 K_VALUES="10 100" RUNS=15 ./run.sh        # probe
CREATORS=1000 K_VALUES="10 100 1000" RUNS=20 ./run.sh  # full (after probe looks sane)

# 4. Copy results/ OFF the box BEFORE destroying the droplet, then destroy + VERIFY.
scp -r root@<ip>:~/web10/research/experiments/costfn/results/ ./costfn-results/
doctl compute droplet delete <id> --force && doctl compute droplet list   # must be empty
```

## Reading the output

`results/report.json`:
- `summaries` — per cell, per phase: n / p50 / p95 / p99 / mean / max. The
  paper's per-phase breakdown comes from here. **Look at `readable` and
  `compile`** — those are the two phases that are "ours and interesting."
- `causal_overhead_B_minus_A` — per (feed, K, mode): the median policy-total
  delta (B − A) + the per-phase delta (where the overhead lives) + the % of A.
  This is the number E2 has been asking for.
- `cells` — which cells ran, how many queries returned 200, how many timing
  samples were captured (a cell with far fewer samples than `runs` had rate
  limits or errors — inspect it).

**The two figures:**
1. **Personal feed** — X = K, Y = `readable` (and total policy) ms. Two lines:
   per-group (bends) vs. batched (flat). Plus the B−A overhead per K.
2. **Discover feed** — X = node size (creators), K = 1. A/B grow with node
   size (the scan), C stays flat (one board contract). Label the flatness as a
   design choice (single board group + `limit`).

## Gates before trusting the numbers

1. `bench.test.py` passes offline (the pure functions are pinned).
2. The `group_contracts.tags` fresh-boot race is fixed on dev (every run boots
   a fresh ClickHouse — check before provisioning).
3. `DO_API_TOKEN` custody (operator's machine env only; never in the repo).
4. A cell's `timing_samples` ≈ `runs` (not gutted by 429s/errors). If a cell is
   short, re-run it — don't average the noise away.
5. ≥3 independent trials per point for the paper (re-run `run.sh` with the same
   seed; the dataset is deterministic). Report A/B variance (real-scan noise);
   C is clean (stubbed).

## Honest limits (state these in the paper)

- Synthetic users are not users; the workload (posts/creator, fan-out) is
  stated, not discovered.
- The personal curve claims "fine to K=1000," not "to infinity."
- Discover's flatness is a *design choice* (single board group + limit), not a
  free property — a fan-out discover design would bend it.
- One box, localhost, co-located browser-less load — not WAN, not capacity.
- The 4-node cross-node fan-out (the Solid comparison) is a separate follow-up
  gated on the multi-node read path.
