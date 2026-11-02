# Access-Control Cost Function Experiment

The harness for the paper's **access-control cost function** — the three-line
ablation that measures *the layer web10 adds* (auth → app-contract → candidate
→ readable-set resolution → group-meta → AST compile → serialize), with the
columnar scan held out or measured as the credited baseline. Full design + the
scope statement: [`../../digital-ocean-thinking.md`](../../digital-ocean-thinking.md)
(§"The access-control cost function"). This file is *how to run it*.

## What it measures (and what it does not)

- **Measures:** the policy layer, per phase, against **K** (the reader's
  readable-set size) and against **node size** (discover feed). The headline is
  the **causal overhead B−A** and the isolated layer **C**, plus the
  **per-group vs. batched** `readable` cost on one figure.
- **Does NOT measure:** the ClickHouse scan as a result (it's the credited
  baseline A / held-out constant C), or CDN media delivery (offloaded by
  design — see `cloudflare-plan.md`). The claim is the cost of *our* layer, not
  the performance of the engines it stands on.

## The three lines

| Line | Flags set | Meaning |
|---|---|---|
| **A** | `QUERY_EVAL_NO_POLICY=1` | no-policy baseline — the caller's SQL runs unscoped (credited ClickHouse baseline; the B−A denominator) |
| **B** | *(none)* | full pipeline, real `execute` — the actual system |
| **C** | `QUERY_EVAL_STUB_EXECUTE=1` | full pipeline, `execute` stubbed — our layer, isolated from the engine |

The readable-resolution algorithm is varied independently: `per-group`
(default, O(K) round-trips) vs. `batched` (`QUERY_EVAL_READABLE_MODE=batched`,
O(1) round-trips) — so the figure shows the bottleneck *and* the fix. All three
flags default OFF in production (`api/app/settings.py`); the bench sets them
per-cell by restarting the api container.

## The matrix (what gets run)

For each **feed × K × readable-mode × line**:
- **personal feed:** K ∈ {10, 100, 1000} (the reader's following count) — the
  curve that grows with your social graph.
- **discover feed:** K = 1 always (one board group) — the flat reference; its
  axis is node size (creators seeded), not K.
- Line A runs once per (feed, K) (the mode is irrelevant to it); lines B/C run
  per mode.

Default matrix: 2 feeds × (3 K for personal, 1 for discover) × 2 modes × 3
lines ≈ **15 cells**, each `RUNS` queries (default 20 — ≥20 for a p95).

## Files

| File | Purpose |
|---|---|
| `seed.py` | metadata-only seed through the REAL API: N creators (followers group + tiny posts), one reader following K of them, a discover board. Writes `seed-manifest.json`. |
| `bench.py` | drives the matrix (restarts the api per cell with the flags), scrapes the `[query] … timing_ms …` logs, computes per-phase percentiles + the causal overhead B−A. Pure functions are offline-tested. |
| `bench.test.py` | **offline regression tests** (no droplet/API/Docker) for the log parser, percentile math, summary, policy-total, B−A delta, matrix expansion, and per-cell env. Run this locally before spending money. |
| `run.sh` | orchestrator: compose-up (dedicated project) → wait → seed → bench → collect → teardown (only this project). |
| `results/` | per-cell JSON + `report.json` (generated; gitignored intent — copy off the box). |

## Run it (on a fresh disposable droplet)

```bash
# 1. Spin up a droplet (the ../ spinup/teardown or the DO scripts), ssh in, clone.
cd research/experiments/costfn

# 2. Offline check FIRST (no money spent yet): the pure functions are sound.
python3 bench.test.py            # must print "all bench offline tests passed"

# 3. Run the experiment (needs Docker + the stack images reachable).
./run.sh
# or tune:
CREATORS=1000 FOLLOW=100 K_VALUES="10 100 1000" RUNS=20 ./run.sh

# 4. Copy results/ OFF the box BEFORE destroying the droplet.
scp -r <droplet>:.../research/experiments/costfn/results/ ./
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
