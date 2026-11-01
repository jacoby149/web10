# Thinking Note — the Digital Ocean Experiment

**Status: thinking, not a plan.** This is the pre-mortem for the droplet
evaluation before any money is spent. It is deliberately separate from
`evaluation-plan.md` (what to measure) and `experiments/README.md`
(known harness defects): this file is about *what the experiment actually
is, what it can and cannot claim, and what the paper should say about it
either way.*

## What we actually have

Two independent harnesses share the DO story but must not be conflated:

| Harness | What it is | Status |
|---|---|---|
| Legacy query harness (`spinup.sh`/`teardown.sh`/`seed.py`/`bench.py`/`run.sh`) | Synthetic load: compose-up → seed N users → hammer `/v3/query` → scrape phase timings | **BLOCKED** — eight validity gates open in `experiments/README.md` (syntax error, fake password hash, wrong token transport, no Origin/app-contract path, no prepare/media/private mix, broken reader scheduling, unfilterable logs, no repeated trials) |
| Connected social runner (`social/run.sh`) | Real browser journey on a fresh droplet: signup, popup auth, compose, follow, engage, 20-post feed reloads, interop joins, evidence collection | **Implemented, not yet executed on a droplet** — local Docker daemon unavailable in the implementation workspace; 13 Node + 24 Python offline tests pass |
| Pre-experiment baby test (`pre-experiment/`) | Spin up s-1vcpu-1gb nyc1 → docker hello-world → error container → verify survival → destroy | De-risks the DO lifecycle only. Passing it proves nothing about the benchmarks. |

The DO layer itself is thin and sound: `DO_API_TOKEN`, tag-scoped
provisioning (`web10-sigmod` / `web10-sigmod-pre`), `trap cleanup EXIT`
destroy-on-every-exit, stale-droplet sweep, kill -9 recovery by tag. The
Hetzner → DO migration (3.251.0) is a cost/region choice, not a
methodology change.

## The three claims the paper could make, and which survive

1. **"web10 runs a real social app on one generic node."** Survives today.
   E4b + the live pilot (28.10) already carry it. No droplet needed.
2. **"The authorization layer costs X."** Requires the connected runner's
   phase timings (E2) with warmups separated, repeated trials, and the
   causal ablation. The legacy `bench.py` `overhead_pct` is a phase ratio
   of medians and must never be cited as overhead.
3. **"It scales to N users at $/month."** Requires the legacy harness
   fixed, or a scale sweep added to the connected runner. **Nothing
   establishes a 100K-user or 2GB result today.**

The industry track rewards (1) + operational honesty about (2) and (3).
It does not require (3) to be a big number.

## What the droplet is and is not

- It is a **disposable, co-located localhost experiment**: browser and
  services on the same box, only proxy `127.0.0.1:80` + MinIO `:9000`
  published. It measures the node under a real application workload.
- It is **not** a WAN/browser-experience benchmark (no remote client).
- It is **not** a capacity/scaling experiment (the runner explicitly
  excludes it; no p99, no max-capacity claim).
- It is **not** the E3 baseline (PostgreSQL RLS shared-table comparison —
  unbuilt).
- It is **not** production. The live Ubuntu server (597 accounts, 593
  documents, 49 groups) is a separate, dated observation. The paper must
  keep these two populations labeled apart.

## The honest cost story

DO s-4vcpu-16gb nyc3 ≈ $0.30/hr, hourly billing, destroyed on exit.
The baby test costs under $0.05. The real run's cost is dominated by
wall time (builds, 20+20 repetitions with 61s rate-limit quiet windows),
not by the instance. **Record the actual purchased instance, region,
dates, billed rate and invoice** — the E6 gate. A "cheap VPS" label is
not a measurement; the paper's cost section (E3) needs the invoice, not
the price page.

## The decision points (answer before spending money)

1. **Which harness runs first?** Recommendation: the connected social
   runner, because it is already implemented and its evidence (real
   auth, real feed path, interop joins) is what E2/E4/E4b actually need.
   The legacy harness stays blocked until its eight gates clear — do not
   "just run it" and discover the numbers are invalid after the fact.
2. **One droplet or two?** The runner and the legacy bench are mutually
   exclusive on one box (different compose projects, different seeds).
   Run them sequentially on one droplet, or parallel on two. Sequential
   is cheaper; parallel is faster. Decide by deadline pressure (freeze
   Nov 20).
3. **Repetitions.** Default 20 per distribution with 2 warmups. p95 is
   emitted only at n ≥ 20 and labeled same-session. If we want p99, we
   need more repetitions and a stated reason — otherwise skip it and say
   so (the runner already refuses to invent it).
4. **What do we do with a failed run?** A run that fails or collects too
   few samples exits nonzero. **A failed run is still paper material**:
   the manifest + interrupted journal record what broke. The industry
   track values the failure account. Do not silently re-run until green.
5. **Evidence custody.** Artifacts land in `.context/evaluation/<runid>/`
   on the droplet. Copy them off **before** destroying the host; verify
   the droplet is actually deleted (billing check), not just "teardown
   printed success."

## What the paper section should say (draft posture)

- Name the experiment exactly: "a disposable Digital Ocean droplet
  (s-4vcpu-16gb, nyc3, Ubuntu 24.04), co-located browser and services,
  fresh storage per run, destroyed after collection."
- State the placement honestly: localhost, no WAN latency, browser shares
  resources with services.
- Report: phase timings (all ten phases, not just readable/execute),
  empty vs nonempty feed distributions, error counts, active-reader
  counts, warmup separation, repetition count, and the interop join
  results (denial → grant → revoke cycles).
- Keep the legacy-harness status visible in the paper's limitations:
  "a synthetic scale harness exists but was not used for the reported
  numbers because its validity gates were open at submission time."
  That sentence is a strength, not a weakness, for an industry track.
- Never: cite `overhead_pct` as overhead, cite synthetic users as active
  users, or merge droplet numbers with live-server numbers.

## Open questions

- Is the E2E CI blocker (`group_contracts.tags` schema race, plan.md)
  fixed on dev? A fresh droplet boots a fresh ClickHouse — the race may
  bite the runner's `POST /setup/configure` exactly like it bit the e2e
  shards. **Check before provisioning.**
- Does the runner's one-hour Playwright limit hold at 20+20 repetitions
  with the 45-query/61s pacing? Estimate wall time before the run; if it
  doesn't fit, reduce repetitions and say so.
- Who holds the `DO_API_TOKEN` and where does it live (env on the
  operator's machine only — never in the repo)?
- Do we want a second region or instance size as a variance point? Cheap
  to add (one more baby-test-sized run), and it turns "one box" into
  "we checked it wasn't the box." Optional; deadline-dependent.

## The scale-sweep experiment (1k / 10k / 100k / 1M users)

The operator's question: *what hardware handles 1k, 10k, 100k, 1M users?*
That is the E3 cost-curve experiment, and it is the legacy harness's real
job. The honest framing first, then the design.

**The honest framing.** "Handles N users" is not a property of the data —
it is a property of the *workload on* the data. The answer is always a
pair: (instance, sustained QPS at p95 ≤ S ms). A 1M-user dataset is
cheap to *store*; it is the *query fan-out* that eats hardware, because
the feed query's cost scales with the reader's follower count and the
authors' post counts, not with the table size (the `(author_key, doc_id)`
primary key keeps per-author scans tight). So the sweep must fix the
workload definition and vary both scale and instance.

**Workload definition (fix before running anything).**
- Seed shape per scale: `posts_per_user=50`, `comments_per_post=2`,
  `reactions_per_post=3` (the `run.sh` defaults). Document counts:
  1k → ~90k docs; 10k → ~900k; 100k → ~9M; 1M → ~90M.
- Reader population: 100 active readers per scale, each following a
  fixed fan-out (e.g. 50 creators). Fan-out is a *named parameter* — the
  1M run's cost is dominated by it, and the paper must say which fan-out
  was used.
- Offered load: ramp concurrency (20 → 50 → 100 → 200) until p95
  degrades past the SLO (state the SLO, e.g. p95 ≤ 250 ms), or until a
  fixed duration per ramp. Record the max sustained QPS per instance.
- The current `FEED_SQL` in `bench.py` is global — its engagement
  subqueries aggregate over *all* reactions/comments, so at 1M users the
  join blows up regardless of the reader's groups. **The query must be
  scoped to the reader's readable groups before any number is trusted**
  (this is also blocker #5 in `experiments/README.md`).

**Storage math (the cheap part — plan the disk).**
Roughly ~90 bytes/row compressed for the synthetic body shape:
1k ≈ 8 MB, 10k ≈ 80 MB, 100k ≈ 800 MB, 1M ≈ 8 GB of `documents`
(+ `doc_groups` ~2× rows, `group_members` 2 rows/user). All four scales
fit on a single 80 GB SSD. **Storage is never the constraint; RAM and
CPU are.** Do not buy disk for this experiment.

**The instance ladder (DO, nyc3, hourly billing, destroy after each run).**

| Scale | Start here | Why |
|---|---|---|
| 1k | s-2vcpu-4gb (~$0.15/hr) | de-risks the whole pipeline cheaply; if the harness is broken, find it for $0.05 |
| 10k | s-4vcpu-16gb (~$0.30/hr) | the current default; the baseline point of the curve |
| 100k | m-4vcpu-16gb (~$0.60/hr) | same RAM, dedicated cores; the first point where ClickHouse memory limits bite |
| 1M | m-8vcpu-32gb (~$1.20/hr) | ~8 GB dataset must fit in CH's working set; 32 GB leaves headroom for merges + the API |

The curve is the deliverable: for each scale, the smallest instance that
holds the SLO at the target QPS, with the billed rate next to it. That
table *is* the paper's E3 cost model. If 1M doesn't hold on
m-8vcpu-32gb, the next point is m-16vcpu-64gb — record the failure,
don't hide it.

**Run protocol (one droplet per scale, sequential).**
1. Baby test first (s-1vcpu-1gb) — lifecycle only, as designed.
2. Per scale: spin up → compose-up (api + clickhouse + minio) → seed
   (record seed time; at 1M it is the longest phase, budget ~30–60 min)
   → warm-up (fixed N queries, excluded) → ramp → collect
   (`results/scale-<N>-<instance>.json` + `docker-stats` + `system-info`)
   → copy results off → destroy → verify deletion + bill.
3. Repeated trials: ≥3 independent runs per (scale, instance) point,
   fresh storage each time. One run is an anecdote.
4. Record the actual purchased instance, region, dates, billed rate and
   invoice per point (the E6 gate). The price page is not a measurement.

**What this answers and what it does not.**
- Answers: "the smallest DO instance that serves X QPS of feed reads at
  p95 ≤ S ms over a synthetic N-user dataset with fan-out F, at $/hr."
- Does not answer: active-user scale (synthetic users are not users),
  write-heavy or media-heavy workloads, WAN latency, or the E3
  *baseline* comparison (the same sweep must be run against the
  PostgreSQL-RLS shared-table backend to be a comparison — today it is
  web10 alone, which is still a legitimate cost curve).

**Gates before the first dollar (in order).**
1. Fix the eight legacy-harness blockers in `experiments/README.md`
   (syntax, real credentials, JSON token transport, Origin/app-contract
   path, workload mix, reader scheduling, log filtering, repeated
   trials). The scale sweep inherits all of them.
2. Scope `FEED_SQL` to the reader's readable groups (above).
3. Verify the `group_contracts.tags` fresh-boot race is fixed on dev —
   every scale run boots a fresh ClickHouse.
4. Confirm `DO_API_TOKEN` custody (operator's machine env only).

**Cost ceiling (worst case, all four scales, 3 trials each).**
1k: 4 × ~$0.10 · 10k: 4 × ~$0.20 · 100k: 4 × ~$0.40 · 1M: 4 × ~$0.80
≈ **$7–8 total** if every run is ~1 hour including seed. The 1M seed
time is the swing factor; if it exceeds the hour budget, that is a
harness finding, not a reason to skip the point.

## The one-paragraph version

The Digital Ocean experiment is a disposable-host, co-located,
application-realism evaluation: a fresh droplet, a real browser journey
through real auth and the real feed path, repeated timed reloads with
warmups separated, interop joins with denial/grant/revoke cycles, and
evidence collected to a manifest before the box is destroyed. It answers
"does the authorization layer survive a real application workload, and
what does it cost per phase" — not "how many users does it scale to"
(legacy harness, still blocked) and not "how does it compare to
PostgreSQL RLS" (E3, unbuilt). The paper should report it exactly that
way, with the invoice, the failure modes, and the open gates named.

The scale-sweep question ("what hardware handles 1k/10k/100k/1M users?")
is the legacy harness's job: fix its eight validity gates, scope the feed
query to the reader's groups, then run a fixed-workload sweep across a
DO instance ladder (s-2vcpu-4gb → m-8vcpu-32gb) with ≥3 trials per
point, recording the smallest instance that holds the SLO at the target
QPS with the billed rate — that table is the E3 cost curve, and it costs
under $10 to produce.
