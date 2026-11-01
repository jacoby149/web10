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
