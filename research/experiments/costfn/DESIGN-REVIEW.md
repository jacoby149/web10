# Experiment design review — 7 November 2026

## Verdict

**Not yet testing enough to support the broad claims we want.** The frozen-input
foundation is useful and its small restore works, but it is not a finished
million-user/full-feed experiment. More VUs or a larger dedicated machine would
not repair the validity gaps below. Keep execution paused.

V1 is not worthless or invalid: it can answer the narrower question “how does
this hot, sparse, public selection behave over a million-author store?” A
dispersed case strengthens breadth/skew claims; it is not a CFP requirement.
The missing real app seams, nonempty-result validation, attribution and generator
checks still need attention before selling the result as the intended core-feed
operating envelope. Choose that scope explicitly rather than changing it later.

The revised [study proposal](STUDY.md) separates mechanism, matched resolver-cost
and core-feed operating-envelope questions. Completing that package would make
the evaluation substantially more defensible for SIGMOD's Industrial Track.
It is not an acceptance prediction, proof of every invariant, or a substitute
for deployed-system experience, novelty positioning and the final paper review.

## Findings, evidence and close conditions

| Priority | Finding | Evidence | Required action |
|---|---|---|---|
| High | A million stored authors is not a million-author followed/returned working set | V1 `dataset.py:rows`: every reader follows the same first K creators; 1k/1M = 0.1% candidate-author coverage | Keep V1 as a hot/crowded control; add a separately frozen dispersed case; report candidate, returned and physical-read coverage independently |
| High | The new measure wrapper still executes the simplified microbenchmark | `measure_dataset.py` invokes `bench.py`, whose query selects doc_id/body, without joins or prepare/surface flags | Build the actual core-feed executor; never rename this wrapper as a full-feed load test |
| High | The corpus can make important work empty | V1 contains posts only, no profile/reaction/comment/media services; normal posts lack default-Discover links | Version a reviewed nonempty relational fixture; check exact joins/counts and public contentViews after delivery, not only status codes |
| High | No-Origin calls omit an important enforcement seam | `query.py:311–317`; current `bench._run_queries` sends no Origin; SDK-only wire capture has no browser transport | Prepare app grants and actual Origin for the primary core study; run missing/revoked-grant controls; label any direct/no-Origin sensitivity separately |
| High | A/B subtraction currently cannot establish causal authorization overhead | Direct engine A omits B's HTTP/auth/compile/serialization; C has different synthetic outputs | Implement the paired fixed-plan resolver treatment in STUDY §5, or remove causal claims; name the component actually isolated |
| High | Concurrent phases and queueing cannot yet be attributed correctly | `run_query` is sync, starts its clock inside the handler, generates its own query ID; middleware has no shared correlation ID | Validate metadata-only client/ASGI/handler correlation and counts, warm-up boundaries, admission/thread-pool wait and generator headroom before capacity inference |
| Medium | It is not a purely read-only workload, and warm-up changes it | Query delivery accounting, 24h dedupe in `log_content_deliveries`; asynchronous request-log inserts | Retain real accounting/logging; distinguish first delivery from deduped refresh, reset telemetry between trials, collect failure/backlog/drain evidence |
| Medium | Named phase sums do not equal full handler work | Delivery accounting occurs between serialize and prepare timers; total includes it, individual phase fields do not | Publish an unattributed residual; do not assign it to authorization; report client completion separately from handler totals |
| Medium | Tied timestamps do not validate Newest pagination/order | V1 constant timestamps; `buildFeedQuery` orders Newest by created_at without doc-ID tie-breaker | Use stable distinct timestamps in a new fixture and verify deterministic outputs/cursors; don't silently change app SQL to improve the test |
| Medium | A four-request core is not an entire user-visible page | `readFeedPage` also resolves groups; group-author enrichment is conditional; rendering/media/transport are outside capture | Name this “personal-author Newest core-feed API sequence”; keep browser/media/discovery and group-author scope explicit |
| Medium | Case count and warm-up alone do not make statistics rigorous | Proposed matrix is 30 points; baseline microbench has 20 samples/cell; no concurrent execution yet | Publish raw observations, three independent trials, per-kind counts/percentiles and uncertainty; retain errors/timeouts/censoring and missed schedules |
| Medium | Cost and teardown are not implemented by a planning manifest | $0.75/h quote; primary phases alone cost at least $1.875, before any setup | Review actual topology/price and enforce resource-lifetime/budget/cleanup independently before a run; latest instruction remains setup-only |

“Hot” is a **selection/skew description**, not proof the database reads only
1,000 rows: the same hot groups contain 20M reader-membership rows, and the
engine may scan wider histories. A dispersed case changes crowding as well as
cache locality. Do not attribute all differences to cache or infer physical I/O
from a follow list or LIMIT. Query plans, read_rows and resource evidence matter.

### Source-grounded request check completed (offline)

The captured app/SDK builders produce **three `/v3/query` requests plus one
`/v3/contentViews` request** for a nonempty personal-author first page. The main
SQL includes profile/engagement/repost joins and real prepare/delivery flags.
Follow-ups use **21 fetched IDs before slicing to 20 displayed posts**, and run
after the main response in parallel. Empty feeds produce only one request.
The capture executes selected trusted source functions with fake transport and
declared mapping/discovery exclusions; it is **not a live API/browser result**.
Three Bun tests pass with fetch forbidden. Seven planner tests check current
source hashes, request shape, rate arithmetic, repeated-case coverage, the
working-set distinction and refusal to become “ready” or accept `--execute`.

The machine audit also rechecks the existing blob/manifest digests without
regenerating the data or contacting a node. The actual load runner, dispersed/
relational fixtures, app-grant preflight, concurrent correlation and paired
comparator remain unimplemented. No new measured performance result exists.

## Important positioning correction

Do not build the argument on “ClickHouse has no RLS.” Its
[row-policy documentation](https://clickhouse.com/docs/sql-reference/statements/create/row-policy)
describes engine row filtering, and the exact benchmark-version
[24.3.18.7 parser](https://github.com/ClickHouse/ClickHouse/blob/v24.3.18.7-lts/src/Parsers/Access/ParserCreateRowPolicyQuery.cpp)
implements it. This source check does not benchmark those policies or prove
equivalent app semantics. It does rule out a blanket absence claim.

The defensible contribution is web10's user-managed group/service policy,
application-query interface and authorized relational composition under its
shared database service account, exercised by real applications. The sixth
draft already uses narrower engine-placement language; preserve it. A matched
same-engine control measures the cost of that implementation, not exclusive
engine capability, superiority over PostgreSQL, or competitor runtime behavior.

## Does this get the paper to “SIGMOD industrial grade”?

**It can supply the missing quantitative part if completed and honestly scoped;
the current setup by itself does not.** Recommended evidence package:

1. Independent repeated K sweep with the small-K counterweight.
2. A paired, equivalent-output/plan-checked resolver-cost comparator, or an
   explicit decision not to claim causal overhead.
3. Hot and dispersed core-feed load curves on reviewed nonempty inputs, with
   real app-grant checks, distinct actors, generator headroom and saturation.
4. Bounded allow/deny/revoke/deletion controls before and after load, with exact
   expected results and limitations, rather than “all 200s = correct.”
5. Dated real deployment/use-window evidence and engineering lessons, kept
   separate from synthetic populations and lab federation/domain prototypes.
6. A contribution/related-work review and a paper whose claims, tables, curves,
   dataset/config/source identities and artifacts agree, including bad results.

These are our scientific acceptance criteria, **not an official mandatory
benchmark rubric**. The [official 2027 Industrial CFP](https://2027.sigmod.org/calls_industrial_track_papers.shtml)
(checked 7 November) welcomes industrial-strength/open-source systems and
applications/experience; requires at least one non-academic author, named
authors/affiliations, up to 12 pages plus references, unchanged ACM layout and
no overlapping simultaneous submission. Deadline: **24 November, 23:59 AoE**.
It does not require a million users, Tier 4, three repetitions or a particular
latency SLO. The draft's page count is not proof its spacing tweaks are compliant;
review the `footskip` adjustment and final template before submission.

## Next action — no execution

Approve/revise the protocol's claim scope, graph/mix, K, cadence, comparator,
SLO/stop criteria, reset/correlation and budget lifecycle. Then implement and
independently inspect the missing pieces. Only after a new explicit execution
approval should sized hosts be provisioned. MinIO publication still needs a
destination/approval. No study, provisioning, publication, new large generation
or production action was performed for this review.
