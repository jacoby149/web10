# Preparing the core-feed study

The goal is a downloadable input and a runnable, falsifiable experiment—not a
large number of synthetic accounts dressed up as production adoption.

The 7 November instruction authorizes implementation, local disposable-stack
acceptance, new offline fixtures and publication to web10 MinIO. It does not
authorize the measured cloud study, production deployment, bucket-policy changes
or new infrastructure purchases. The operator approves the exact target
`https://minio.web10.app`, bucket `web10-media`, prefix
`research/costfn/datasets/<dataset-id>/`; existing media/policies stay untouched.

## Claim and workload contract

- **M:** repeat the existing K sweep; report the batching tradeoff, not browser
  performance. The historical direct-engine A/B comparison remains noncausal.
- **P:** compare live readable resolution with an exact prevalidated mapping in
  the same HTTP/compiler/execution path. Randomize pairs, verify rows and compiled
  SQL, retain per-pair observations. This isolates resolver recomputation only.
  The substitution exists only in a research entry point, never production.
- **L:** personal-author Newest core-feed API completion: await the actual main
  query, then run two engagement queries and contentViews concurrently over the
  returned IDs. Discovery/login are preparation. Text-only fixtures do not
  measure media transport, avatar signing, advertising inventory, browser paint,
  writes by users, tuned ranking or production adoption.

V1 stays unchanged. V2 has canonical `/followers` group names, distinct post
timestamps, one profile and like per author, a comment on every tenth post, and
public-post links to both followers and default Discover. Hot and dispersed
recipes have identical table cardinalities and K. Dispersed cohorts start at
`reader_index * K mod author_count`; this changes crowding as well as locality.
One current version per normal document is a declared limitation. Independent
small-stack lifecycle controls exercise private grants and tombstones separately.

The core-feed stack uses ClickHouse 24.8: actual app discovery/feed SQL uses
QUALIFY, which the legacy 24.3 microbenchmark image rejects. Record the resolved
image digest and exact server version. Do not pool new 24.8 results with the
historical 24.3 trial or silently change the historical repeat's engine.

The live cursor control exposed a separate real app failure: passing a String
to `toUnixTimestamp64Milli` returns HTTP 400/code 43. The operator explicitly
authorizes the bounded social-app fix: parse a finite epoch-millisecond cursor
and compare it with the column's millisecond value. Offset/invalid-cursor
regressions and new source captures accompany it. No query is silently repaired
inside the load runner; no general tied-timestamp pagination guarantee is added.

Primary load: H/S × 1k/3k/5k/10k/20k readers × three trials; K=1000,
60-second scheduled interval, 60-second warm-up and 180-second observation.
Use an open schedule: slow requests never postpone later scheduled arrivals.
Record missed starts rather than hiding generator overload. Drain is bounded;
uncompleted requests are censored failures. No binary capacity claim or latency
SLO: publish offered/achieved curves, including overload. Stop an unhealthy point
after a declared sustained error threshold, retaining all preceding evidence.

Restore a fresh disposable project for each independent trial/point. Preflight
and session preparation precede warm-up; warm-up delivery state is retained for
the explicitly named steady-refresh condition. Do not disable delivery/logging.
Preserve first-delivery versus deduped-refresh observations separately.

## Evidence gate

Readiness is earned by receipts: source and dataset hashes; live nonempty exact
results; real group discovery; missing/revoked app grant and private membership
controls; matched compiler/output comparator; correlated concurrent requests;
resource collection and clean failure/drain behavior. Offline tests alone cannot
set readiness. Local acceptance does not certify the future cloud generator's
headroom, machine budget, production batching default or submission acceptance.

MinIO objects live under an immutable research-only dataset-ID prefix. Upload
table files first, manifest last, refuse different existing bytes, download and
verify against a separately pinned identity. Credentials and JWTs never enter
datasets or receipts; no anonymous bucket policy is required.
