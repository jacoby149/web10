# Preregistered study proposal — SETUP ONLY

7 November 2026. Operator: “set up this experiment not run it, and then validate,
is this testing what we actually want to test, and is this get us what we need
to be at that sigmod industry grade”. **This supersedes the earlier run approval.**
No provisioning, measured traffic, production changes, dataset regeneration or
MinIO publication is authorized by this proposal. Offline builder capture,
planning and unit checks are setup, not study results. The initial $10 compute
budget is a ceiling for a subsequently approved run, not authorization to start.

## 1. What the paper needs to establish

| Question | Study | Defensible claim | Not established |
|---|---|---|---|
| Does batching remove the repeated-metadata bottleneck? | M: repeated K10/100/1000, both algorithms, same fixed small fixture/hardware; separate K1 board control | Algorithm tradeoff under a named workload/configuration | Browser readiness; generic capacity; total authorization overhead |
| What does recomputing readable input relations cost? | P: paired same-engine, output/plan-checked preauthorization ablation | Incremental cost of the exact checks removed | A blanket “RLS overhead” number or superiority over PostgreSQL |
| What operating envelope does the real request sequence support? | L: core-feed API load over a million-author fixture, distinct actors, hot and dispersed working sets | Throughput/latency/errors/saturation on the specified hosts, fixture and request graph | Million active production users, full browser/media experience or universal system limit |
| Why is this an industrial system rather than a benchmark wrapper? | Dated deployment evidence, real-app reuse, bounded correctness and operational lessons | A deployed integration with checkable engineering tradeoffs | Independent adoption, production federation, new authorization theory |

A big L result does not replace P, M or the deployment/lessons evidence. A null
or negative result can be useful if its cause, scope and tradeoff are explained.
Do not select the paper's claim after observing the most flattering number.

## 2. Source-grounded workload, not a made-up “feed query”

`capture-feed.ts` executes the **current app's request-building functions and
SDK payload methods** with an explicitly fake transport. The committed
`evidence/core-feed-wire-v2.json` pins app/SDK/posts/mapping and capture-source hashes
(the initial mapping-stub capture is retained as v1 setup history).
Offline tests forbid HTTP. This verifies request construction, **not** live
authorization, SQL execution, rendering or service behavior.

The personal-author, Newest, first-page core is:

1. Await the real `buildFeedQuery` SQL, with profile/reaction/comment/repost joins,
   `prepare.media`, `prepare.ads`, `prepare.face`, `surface=feed` and
   `content_service=posts`.
2. From the **returned** IDs, issue reaction-count and comment-count queries and
   `/v3/contentViews` concurrently. Follow-ups use up to **21 IDs**, before the
   app slices to 20 displayed posts. An empty result is not a four-request load.

Discovery/group resolution and login are setup. Browser rendering, media bytes,
transport retry/refresh behavior, tuned ranking and group-author face enrichment
are outside this core. Personal authors take the no-enrichment path in
`posts.ts:18–28`; group authors require extra work. Never label the four-call
core as an entire browser feed/page. A live nonempty preflight is still required.

**Origin matters:** `query.py:311–317` skips the browser app-contract gate for a
nondelegated token with no Origin. The main study should prepare an approved
synthetic app/service grant and send its real Origin, with denial/regrant
controls. A no-Origin variant must be explicitly labelled and cannot establish
app-contract enforcement cost. Do not disable signature/freshness checks.

## 3. Dataset review before any timing

Keep the frozen V1 artifact intact as a control. It has 1M post authors plus
20k readers, but all readers follow the **same first 1,000 authors**: the
following candidate-author span is **0.1%** of the pool; 999,000 authors are
outside that followed set. This does **not** prove physical scans are small:
version resolution/joins may scan more, and the hot groups contain 20M reader
membership rows. Record candidate coverage, returned-author coverage and actual
engine `read_rows`/I/O separately. Neither a follow list nor LIMIT proves physical
working-set size.
It is public/text-only, has no profiles/reactions/comments/media, one version
per document, repeated public fixture hashes/roles and identical post timestamps.
It tests a hot shared audience over a large store, not broad active-node use.

Recommended new, independently versioned fixtures (do not modify V1 in place):

- **H — hot audience:** retain shared-follow locality as an intentional case.
- **S — dispersed audience:** same author/reader/K counts and row cardinalities,
  but deterministic reader cohorts cover the million-author population. Publish
  exact coverage/skew, not “random” or “realistic” without a definition.
  This changes audience crowding as well as locality; it is not a pure cache
  experiment. Followed/input span, returned posts and physical rows read differ.
- Populate one profile per author and a declared nonempty relational mix, e.g.
  one reaction per post and a comment on every tenth post. These are **proposed
  synthetic parameters**, not observed production ratios. Validate actual
  counters and joins; add an empty-engagement sensitivity rather than allowing
  all important joins to be empty by accident.
- Match real public-post attachments: `posts.ts:32–35` attaches public posts to
  followers **and default Discover**. V1 only attaches normal posts to followers;
  its extra custom board is not default Discover. The captured views request
  scopes to default Discover, so V1 can return empty view metrics despite HTTP
  success. Validate nonempty public metrics after real delivery and exact
  reaction/comment counts, not just four successful status codes.
- Specify public/private read fixtures and app grants; verify own/readable,
  denied, missing-app-grant, revocation and deletion cases separately. Performance
  actors must have the intended access; correctness does not follow from HTTP 200.
- Give posts stable, distinct timestamps for chronological/cursor checks; freeze
  any ranking clock anchor. Current Newest SQL lacks a doc-ID tie-breaker, so
  V1's tied timestamps do not establish reproducible page order/pagination.

These choices require review before generating another large artifact. Imported
counts, logical contents, relationships and outputs must be verified independently
on a small real stack, then checked after the large restore. Never generate
accounts/posts or hash passwords during measured traffic. Session setup remains
separate; fixture credentials are public, JWTs/keys are not dataset artifacts.

## 4. Measurements must match their names

- The real feed is **not strictly read-only**: `query.py:458–467` records delivery
  impressions. `log_content_deliveries` performs a dedupe read and possible insert,
  with a **24-hour dedupe window**. Warm-up can convert first-delivery writes into
  dedupe-only refreshes. Declare cold-first-read versus steady-refresh behavior;
  keep the actual surface/prepare flags and record delivery failures/debt.
- The handler total includes delivery work that is not a named timing phase.
  Record `total − sum(named phases)` as **unattributed residual**, with rounding
  tolerance; never call it authorization. Request middleware also schedules
  metadata log inserts after handling (`middleware.py:13–16,54–94`). Retain and
  account for this work; do not silently disable logs to improve the headline.
- `run_query` is a synchronous FastAPI endpoint. Capture worker count and actual
  thread-pool limits. Handler timing begins inside the handler and does not
  measure all admission/thread-pool wait. Record client request latency, core
  feed completion latency and ASGI/handler timing as distinct quantities.
- Query diagnostic IDs are generated server-side. Middleware records latency
  but no request correlation ID. Build/validate content-free client/server
  correlation before claiming exact warm-up exclusion or phase distributions
  under concurrent load; totals and matched sample counts must reconcile.

## 5. Mechanism and matched comparator

M repeats the small K sweep independently at least three times, randomized cell
order, excluded/retained warm-ups, raw samples, exact configuration/source and
separate K1 discover workload. Twenty samples per cell support preliminary
within-trial summaries, not a stable p99. C's stubbed output is not equivalent
to B; old direct-scan A versus HTTP B remains a noncausal comparison.

For P, prefer a tightly isolated **fixed-plan readable-resolver ablation**:
authenticate/check the same app in both arms; recompute readable service groups
in the live arm, substitute the prevalidated mapping in the preauthorized arm;
retain the compiler, same SQL,
serialization and scan. Verify exact rows/fields/order and generated plan before
timing; randomize live/preauthorized arm order within each pair. Record the exact checks removed,
per-pair deltas and trial-level uncertainty. Recompute the preauthorization
snapshot between permission-control mutations, never serve it as live authority.

This estimates resolver recomputation cost, **not all authentication/enforcement
cost**. A broader treatment needs a separately reviewed equivalent baseline.
Keep any such harness outside production routes; no production policy-bypass
flags, raw-table access or new app-specific node endpoint. PostgreSQL, if used,
is RLS-on/off within PostgreSQL, not absolute milliseconds against ClickHouse.
The matched comparator is currently unimplemented; a large load curve cannot
close this gate. If omitted, remove causal-overhead claims from the paper.

**Engine positioning check:** ClickHouse does have row policies. The
[official CREATE ROW POLICY documentation](https://clickhouse.com/docs/sql-reference/statements/create/row-policy)
describes row filtering by users/roles; the
[24.3.18.7 LTS parser](https://github.com/ClickHouse/ClickHouse/blob/v24.3.18.7-lts/src/Parsers/Access/ParserCreateRowPolicyQuery.cpp)
already implements the feature. “ClickHouse has no RLS” is not a defensible
universal premise. web10's contribution is the end-user/group/service policy and
application-query integration above its shared DB account, not inventing row
filtering. The sixth draft's narrower engine-placement wording should stay;
the comparator prices our implementation, not an unsupported engine incapacity.

## 6. Load protocol and analysis to approve before running

Proposed primary matrix: H/S × 1k/3k/5k/10k/20k distinct VUs × three independent
trials, **60-second feed interval**. A 30-second interval is a separate optional
sensitivity after the primary study and budget review. K is fixed/documented
(initial proposal 1,000); do not change K together with VU count. A matched
small-pool calibration is separate from the million-author operating point.
K=1,000 is a declared heavy-follow case, not an observed typical-user statistic.
The proposed relational H/S cases have no frozen dataset IDs yet: the planning
manifest deliberately leaves them null, rather than substituting V1 silently.

- Define 60s warm-up, 180s observation and bounded drain/recovery as proposed
  durations; approve and check steady state rather than assuming these suffice.
  Restore the same frozen base and reset test-owned telemetry between trials;
  warm-up telemetry/state is part of the declared steady-refresh condition.
- Use distinct prepared readers/tokens, deterministic staggered starts, recorded
  schedules and think time. Track scheduled/offered, started and completed feed
  loads separately. A slow closed loop must not silently reduce offered load.
  Verify the session pool through the trial/drain deadline; refresh outside
  timing rather than disabling freshness checks or reusing one identity for VUs.
- Report per-trial and across-trial p50/p95/p99, sample counts/uncertainty,
  throughput, 429/4xx/5xx/timeouts, missing phase records and censored requests.
  Do not drop failures or label a successful-request percentile as all traffic.
- Record active readers, live in-flight requests, scheduler/event-loop lag,
  client CPU/memory/FD/socket/NIC limits, API queues/workers, database CPU/memory,
  I/O/network/merge/part pressure and steal time. Prove the generator has headroom;
  client saturation is not server capacity. Do not cap in-flight work to fit a box.
- Preserve content-free raw per-request/phase records, corpus/source/config/image
  identities, hardware/topology/region/price/date and verified cleanup. No JWTs,
  passwords, private bodies, signed URLs or production records in measurements.
- Predeclare saturation/error stop criteria and latency SLO, or explicitly report
  curves without a binary capacity/SLO claim. A suggested core-API p95 budget is
  a product decision, **not a SIGMOD requirement**. Do not pick thresholds later.

At 20k VUs/60s: ~333 feed loads/s, ~1,000 query calls/s plus ~333 content-views
calls/s, excluding setup/media. Concurrent sessions, offered rate and in-flight
requests are different units. The low/likely/high population funnel remains
explicit assumptions, not evidence of MAU or “1% online” as a law.

## 7. Hardware, cost, and venue gates

Proposed dedicated CPU setup: DB 8 vCPU/32 GB ($0.375/h), API 8 vCPU/16 GB
($0.25/h), generator 4 vCPU/8 GB ($0.125/h), same-region private topology.
These quoted rates total $0.75/h, not measured sizing requirements or a purchase.
The 30 primary points alone need 2.5h at the proposed 300s phase budget: $1.875
**lower bound**, excluding all preparation, login, restore, instrumentation,
diagnostics, failure recovery, tax/egress and teardown. Enforce the $10 initial
cap with actual resource creation clocks, independent cleanup and a safety
reserve; do not treat the Tier-4 payment as a research budget. Three-host
configuration, least-exposed network rules and a failure/cancellation rehearsal
are still required. No hosts are created by the planning tools.

Checked [official SIGMOD 2027 Industrial CFP](https://2027.sigmod.org/calls_industrial_track_papers.shtml)
on 7 November: innovative commercial/industrial-strength systems including open
source, novel applications/experience; at least one non-academic author; named
authors/affiliations; at most 12 pages plus references; unchanged ACM margins/
column/line spacing; deadline **24 November 2026, 23:59 AoE**; no simultaneous
overlapping submission. The CFP does not mandate a million-user benchmark,
three trials, a particular SLO, or dedicated CPUs—those are our evidence choices.

Industrial-grade evidence also needs the real deployed operating point/window,
technical contribution/related-work positioning and operational lessons. Keep
synthetic capacity separate from the dated small production snapshot. Recheck
formatting (including the draft's `footskip` adjustment), author/venue eligibility,
claims/figures and related-work gap before freezing. No experiment guarantees
acceptance. Current status: **design review required; not run-ready or submission-ready**.
