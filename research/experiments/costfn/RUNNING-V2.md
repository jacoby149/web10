# Run the core-feed study against frozen inputs

A run starts with a downloaded, verified dataset—not a signup loop. Preparation
may take longer than measurement. Neither its cost nor its time disappears merely
because it is outside the latency samples.

## What this measures

The primary workload is the **personal-author Newest first-page core API
sequence**: actual app/SDK-built main query, then reaction counts, comment counts
and contentViews concurrently over the returned 21 IDs, displaying 20. Group
discovery and real login happen before scheduling. Every response is checked for
exact authors/IDs/order, joined profiles, nonempty counters and delivery metrics.
It is not browser paint, media transport, an advertising-inventory workload,
tuned ranking, user writes, production adoption or whole-system assurance.

The existing simplified `bench.py` remains the separate mechanism experiment.
Its A/B difference is noncausal. `paired_trial.py` supplies the new **resolver
recomputation** experiment, not a total-authorization-cost claim.

## Inputs and storage

Operator-approved destination:

```
https://minio.web10.app
s3://web10-media/research/costfn/datasets/<dataset-id>/
```

The tracked publication receipts in `evidence/v2-*-publication.json` pin each
identity, object digest/size and the original authenticated download. On
8 November the operator separately authorizes making these two synthetic inputs
public: anonymous `s3:GetObject` for their fourteen exact table/manifest keys,
not bucket listing, uploads, neighboring objects or the whole research prefix.
The original receipts remain historical and unchanged. The bounded ops helper is
`ubuntu-deployment/scripts/public-research-datasets.py`; it defaults to dry-run,
verifies pinned bytes before apply and preserves the existing bucket policy.
Public access must be confirmed by independent anonymous downloads and digest
checks, not inferred from the policy read-back. Never copy production storage/
admin keys into a droplet, shell history, dataset or measurement receipt.

| Case | Frozen identity | Compressed table bytes |
|---|---|---:|
| Hot | `53b16c1072a8e80032b20ae23c5675040b851274ad7a314a106b7557be3b5363` | 282,574,957 |
| Dispersed | `dbed2201952f9ca1b581c30a541e44b6912a5a6ba1bec84ee166aa80575132b4` | 282,594,851 |

Each has 1M authors, 20k independent readers, 3.1M documents, 4.1M links,
1M follower contracts, 23.02M memberships/class grants and 20k app contracts.
Posts have distinct second-resolution timestamps. Profiles and likes are
populated; every tenth post has a comment. Public posts attach to followers and
default Discover. Hot readers share 1k authors; dispersed cohorts cover 1M.
Neither coverage value predicts physical reads. The same row cardinalities do
not make this a pure cache experiment: crowding also changes.

These remain clean synthetic text fixtures with one current version per document.
The small lifecycle controls test tombstones and permission changes separately;
they do not simulate write churn or deep production histories under load.

For anonymous access, download each receipt's seven exact object URLs, formed as
`https://minio.web10.app/web10-media/<object-key>`. Verify the receipt's byte count
and SHA-256 for every file, including `manifest.json`, then run the existing
all-row validator against that directory before restore:

```sh
python3 research/experiments/costfn/dataset_v2.py validate .context/hot-input
```

The existing authenticated downloader remains available where a read-only profile
is explicitly configured. From the repo root (Python 3.12+, API dependencies plus
httpx; `uv sync --project api --frozen` supplies them):

```sh
uv run --project api python research/experiments/costfn/dataset_store.py download \
  .context/hot-input --endpoint https://minio.web10.app --bucket web10-media \
  --prefix research/costfn/datasets --expected-id "$HOT_ID" \
  --receipt .context/hot-download.json
```

Use the identity from the table/trusted receipt, not from an untrusted companion
manifest. Download refuses an existing directory. Import accepts only the six
fixed tables; no SQL/DDL is read from artifacts. V1 is preserved unchanged as a
historical sparse microbenchmark control, not substituted for V2.

## Local functional floor

These commands create only a dedicated local disposable project. They do not
buy a host or run the primary study:

```sh
python3 research/experiments/costfn/dataset_v2.py build .context/v2-floor \
  --creators 40 --follow 25 --readers 2 --locality dispersed
# Set FLOOR_ID from this trusted builder's output.
python3 research/experiments/costfn/restore_v2.py .context/v2-floor \
  --project web10-costfn-frozen-local-check --port 6092 \
  --expected-id "$FLOOR_ID" --receipt .context/v2-restored.json
python3 research/experiments/costfn/acceptance.py .context/v2-floor \
  --receipt .context/v2-restored.json --out .context/v2-acceptance
```

The floor checks actual `/groups/list` discovery, nonempty core results, missing
Origin grant denial and actual next-page SQL. Lifecycle controls verify private
denial/grant/removal/regrant, app revocation/regrant and document tombstones,
before and after concurrent traffic. A separate paired smoke checks ordered
output, compiler SQL hash and EXPLAIN PLAN equivalence. The two-reader defaults
are **functional evidence only**, not latency percentiles for the manuscript.

After source changes, regenerate and review the offline first-page and pagination
captures in new versioned files; never overwrite historical captures or relabel
an old acceptance receipt as current. The current captures are
`evidence/core-feed-wire-v5.json` and `evidence/core-feed-next-page-v4.json`
(the 9 November 2026 re-capture: `feed.ts` source pin refreshed after the 5.10.1
feed tuner; all four request payloads byte-identical to v4/v3 — the workload
is unchanged, only the source pin moved).
The single-node first-page payloads are unchanged from v3. They do not capture
the federated reader's destination discovery, quotas, merge or paging sequence.
Run `readiness_v2.py` against the newly generated acceptance receipt:

```sh
python3 research/experiments/costfn/readiness_v2.py \
  --acceptance .context/v2-acceptance/acceptance.json \
  --publication research/experiments/costfn/evidence/v2-hot-publication.json \
  --publication research/experiments/costfn/evidence/v2-dispersed-publication.json \
  --require-prepared
```

Stale captures/receipts report `PREPARATION_INCOMPLETE` and exit nonzero with
`--require-prepared`. Even `PREPARED_FOR_HOST_PREFLIGHT` does not approve paid
execution or replace actual-host acceptance.

The old 24.3 image rejects the current app's QUALIFY syntax. V2 therefore uses
24.8; receipts record the exact server version, resolved image IDs, API package
versions and source/config hashes. Do not pool this with the historical 24.3
trial. The experimental resolver is explicitly batched; no production default
or deployment is changed. The overlay uses one Uvicorn process and records the
actual PID/thread-pool limit; this is a named configuration, not an optimized
universal capacity limit.

## Separate API, DB and generator hosts

No script provisions cloud hosts. After explicit approval, use **new isolated
test hosts**, never all-spark or production. Record real specs/region/prices,
source and purchased topology. Restrict DB 18123/MinIO 19000 to the API host and
API traffic to the generator/controller using the provider firewall. Private IP
binding alone is not a firewall. Keep SSH host-key verification enabled.

On the controller/generator, configure existing Docker contexts named `costfn-*`
for the API and DB hosts. The API host needs an exact-source checkout at the
recorded path for read-only research/SDK/app source mounts. Docker build context
comes from the controller; source mismatches are rejected by the observer.
Do not deploy a moving branch or change sources during an active point.

A topology file contains metadata, not keys; for example:

```json
{
  "project": "web10-costfn-frozen-trial1-hot-1000",
  "api_port": 6091,
  "docker_contexts": {"api": "costfn-api", "db": "costfn-db"},
  "api_private_ip": "10.20.0.2",
  "db_private_ip": "10.20.0.3",
  "api_repo_directory": "/opt/web10"
}
```

These addresses are documentation examples, not purchased hosts. The distributed
adapter is offline-tested; actual separate-host networking/mounts/firewalls need
connected preflight. A local floor cannot certify those seams.

```sh
python3 research/experiments/costfn/restore_distributed.py .context/hot-input \
  --topology .context/topology.json --expected-id "$HOT_ID" \
  --receipt .context/remote-restored.json
```

The importer refuses existing project resources on both contexts, starts storage
and schema before API migrations, pauses API for import, checks every table count
and performs live exact-result checks before issuing a complete receipt. A failed
restore leaves an explicitly partial owned project: inspect it, archive failures,
then clean only that exact project on both contexts before another attempt.
Download on the controller/DB host first; no generation/import runs during load.

## Paired resolver trials (P)

On an accepted stack, idle with no concurrent load or permission mutation:

```sh
python3 research/experiments/costfn/paired_trial.py .context/hot-input \
  --receipt .context/remote-restored.json --out .context/p-trial1 \
  --pairs 20 --seed 42 --mode batched
```

Repeat independently, with recorded seeds and fresh trials; do not pool unlike
hosts/engines/configurations. The comparator is a separate container CLI process,
not an HTTP policy-bypass route. Both arms use actual ASGI/handler authentication,
app checks, parser, compiler, scan, serialization and preparation. Only the exact
readable-resolver mapping is substituted. The first randomized pair is retained
as excluded warm-up. EXPLAIN checks happen outside timing. Every measured pair
must retain identical compiler SQL and ordered output hashes. After any permission
mutation, start a new trial and snapshot. Within-trial delta percentiles are not
confidence intervals or independent-trial uncertainty.

## Primary offered-load points (L)

`readiness_v2.py` produces the seeded 30-point H/S × 1k/3k/5k/10k/20k × three-trial
schedule with actual published IDs. Follow that order. Each point gets a fresh
project/restore, not an in-place telemetry reset on a running dataset. Archive and
remove only its owned resources after collection. Session setup uses real login
and actual group discovery outside timing; expiry is checked through drain.

`run_core_point.py` requires an explicit approval JSON with purpose
`synthetic-core-feed-study`, `execution_authorized: true`, the exact project and
current `provenance.sources()` map, API origin, three real host records (role,
identity, region, cpu, ram_gb, software, hourly_usd), `max_usd` ≤10,
`resource_started_epoch`, `hard_stop_epoch`, `cleanup_reserve_seconds` ≥60 and
`cleanup_watchdog_verified: true`. Supply **actual** creation clocks, not when
measurement starts. Run/verify an independent host-lifetime cleanup watchdog first.
This tool bounds its own work; it cannot cap a bill after controller/host failure.
It neither creates nor deletes droplets. Do not manufacture an approval receipt.

```sh
python3 research/experiments/costfn/run_core_point.py .context/hot-input \
  --receipt .context/remote-restored.json --approval .context/approved-run.json \
  --users 1000 --trial 1 --out .context/l-hot-1000-trial1
```

The wrapper starts resource collection automatically, runs before/after lifecycle
controls, prepares distinct sessions, schedules 60s warm-up + 180s observation at
a 60s interval, drains for at most 60s and reconciles server/client IDs. The
restore receipt is consumed once, including failure/cancellation. Three database
queries and one views request per feed are separate from virtual sessions and
instantaneously in-flight requests. At 20k readers the target is ~333 feeds/s,
1,000 query calls/s and ~333 views calls/s. Cadence never waits for a previous
feed to finish. There is no semaphore silently reducing load to fit the machine.

Retain raw requests, feeds, generator CPU/RSS/FD/event-loop traces, container
CPU/memory/network/I/O, database active-query/merge/memory and cumulative physical
read/write counters. These database counters include setup/observation work and
are **not per-service query-ID attribution**. Client completion includes queueing;
ASGI-minus-handler includes other middleware/encoding work too, not pure queue
delay. Handler residual stays unattributed. A missing successful-request phase or
source mismatch invalidates the point. Missing failed/censored server records
remain explicit; they are not made into zero-latency observations.

Request records retain client monotonic start/end timestamps; generator samples
and summaries report actual HTTP in-flight counts separately from live feed
tasks. The final functional floor peaks at three HTTP requests and drains to zero.

HTTP errors/timeouts are retained as operating-envelope evidence, not automatically
discarded. Wrong semantic results, generator missed starts, instrumentation errors
and source drift invalidate a point. At ≥100 measured failures and >10% failure
fraction, scheduling stops early; report the truncated point and reason, not a
completed 180s run. All-success percentiles are labelled success-only beside
failure/censoring counts; never present them as all-traffic tail latency.

Warm-up changes real delivery dedupe state. This is a named steady-refresh
condition, not a read-only workload or first-delivery capacity result. Delivery
and request logging remain enabled. Review generator headroom on the actual
hosts, not the laptop floor. No binary SLO/capacity pass is predeclared: report
curves, failures and resource bottlenecks, with independent-trial uncertainty.
30s cadence is a separately approved sensitivity, not silently added to primary.

No receipt here establishes production federation, production batching rollout,
literature novelty, formatting compliance or SIGMOD acceptance. Manuscript values
change only after independent review of real study observations.
