# web10 SIGMOD Experiments - Status and Gates

## Connected Application Evaluation

The [new isolated social runner](social/README.md) exercises actual browser
login/consent, composing, following, engagement, private-access denial and
revocation, then collects timed empty and 20-post Following reloads with resource
sampling. It uses production builds and fresh disposable storage, with explicit
target guards. Local regressions are not completed droplet results; run and retain
the manifest/artifacts before citing measurements.

## Legacy Query Harness

**BLOCKED: the legacy seed/bench/run harness is not validated as runnable or reproducible.**
Results are pending. Those scripts are an unfinished synthetic query-engine
experiment, not production measurements or a full social-page benchmark.
Do not provision a machine expecting the current scripts to produce valid
paper results without resolving the gates below.

## Known Blockers

References are to the current source; no code repairs are made here.

| Blocker | Source reference | Required gate |
|---|---|---|
| Python syntax: `API_BASE` is used before `global API_BASE` in `main` | `bench.py:228-238` | Pass compilation before any live run. |
| Fake password hash vs real login | `seed.py:94`; `bench.py:179-191,252-267` | Seed valid test credentials and demonstrate intended readers authenticate; do not bypass the seam. |
| Bearer header vs JSON token API | `bench.py:194-205`; `api/app/v3/endpoints/query.py` (`run_query`, `data.token`) | Send the token in the API's expected JSON field and assert returned rows/denials. |
| No Origin/app-contract workload | `bench.py:197-204`; `api/app/v3/endpoints/query.py:191-198` | Exercise the intended browser Origin and app grants. The current no-Origin, non-delegated path skips the app-contract check. |
| No prepare/media/private-access mix | `bench.py:57-78,202`; `seed.py:105-135`; query endpoint prepare branch | Add workload coverage for prepare/media, private and denied reads, membership/revocation and representative query paths. Public grants and simplified SQL do not cover these. |
| Queued reader tasks do not all execute queries | `bench.py:275-290` | Workers loop until a shared stop; only the first concurrency-sized cohort runs before queued tasks see stop. Verify actual active readers and workload scheduling. |
| Logs lack run/request filtering | `bench.py:120-138,229,247-250` | Correlate timings to this run's requests; query-ID deduplication alone does not exclude historic or unrelated logs. |
| Errors and unrepeated trials invalidate headlines | `bench.py:179-191,198-219,283-317`; `run.sh` | Count login/query failures, timeouts and rate limits; validate outputs and sample counts; add warm-up, repeated independent trials and uncertainty reporting. |

## Intended Experiment

The files are scaffolding: `spinup.sh`/`teardown.sh` manage a Digital Ocean droplet;
`seed.py` creates synthetic users/groups/documents; `bench.py` intends to
generate load and collect phase timings; `run.sh` orchestrates collection.
Their presence is not evidence these steps work end to end.

Provisioning uses `DO_API_TOKEN`; the main script defaults to `s-4vcpu-16gb`
in `nyc3` with the `web10-sigmod` tag. The separate
[`pre-experiment/`](pre-experiment/README.md) baby test defaults to `s-1vcpu-1gb`
in `nyc1` and exercises provisioning, SSH, Docker success/failure and cleanup.
That lifecycle test is independent of the query-workload validity gates above;
passing it would not validate benchmark authentication, timings or results.

web10 uses one shared ClickHouse `documents` table keyed by
`(author_key, doc_id)`. Per-user namespaces are logical, not separate physical
databases/collections. Proposed scale sweeps are synthetic experiments, not
measured user counts. **No 100K-user / 2 GB memory result is established.**

The current nonempty application feed uses **three query calls plus a
content-views request**, with discovery/group resolution and media retrieval
additional (`marketing/web10-social/src/data/feed.ts`). The harness's
simplified `FEED_SQL` is a microbenchmark, not the complete feed or historical
267-to-1 request claim. Localhost tests still include scheduling, contention,
serialization and network-stack overhead; they do not establish browser WAN
latency or isolate pure CPU/disk time.

## Metrics and Baseline

The current `overhead_pct` field (`bench.py:159-164`) is
`p50(readable) / p50(execute) * 100`: a **phase ratio only**. It is neither
total authorization overhead nor evidence of zero scan-time penalty.
Other phases contain authorization work; ratios of medians are not
per-request overhead percentiles.

Follow `../evaluation-plan.md` for all phases, client latency, errors,
resource measurements and a separate paired synthetic-only causal ablation.
The conventional baseline is not built: use matched shared tables and
equivalent group/service policies, with the same data, permitted results,
functionality and resource budget. Do not compare with an invented physical
database-per-user design or attribute engine differences solely to auth.

## Hardware, Cost and Evidence

No cheap-VPS price or configured instance label is a measurement. Record the
**actual purchased instance**: provider/model, observed CPU/vCPU, RAM, storage,
region, purchase/run dates, currency/tax, billed rate and invoice. Distinguish
compute from storage, backups and egress; verify deletion and remaining
billable resources rather than assuming all billing stops.

Before making a reproducibility claim, archive the exact revision, images,
configuration, commands, seed and workload parameters, warm/cold conditions,
raw run-filtered timings, error counts, result checks, active-reader counts,
repeated trials and hardware/cost receipts. Keep synthetic results separate
from dated production observations. All measurements and these gates remain
pending.
