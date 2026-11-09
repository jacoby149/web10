# Matched date-query comparison — protocol, 9 November 2026

## Question

C (date filter plus candidate pruning) already ran locally and failed strict
acceptance. A and B did not run beside it. Comparing that failure count with
an older cloud result confounds hardware, topology and input timestamps.
This comparison changes query treatment, not the machine underneath it.

## Fixed conditions

- Local only; no cloud purchase, production access or deployment.
- Restore the existing `web10-costfn-date-v1` input once: identity
  `e15e8bce6f2730ccb5eed1d0115ffbbdee9a6c8dc3df0cec2b0cdfedf2491291`.
  Small-floor preparation uses the existing 1,000-creator derivative first.
- Same ClickHouse/API instances and image/package/source pins. Docker has eight
  logical CPUs/about 8 GB; ClickHouse is capped at 5 GB with a 4-GB volatile data
  filesystem. API is restarted identically before each arm; database is retained.
- Install/materialize the generic date projection before **all** arms. Its
  availability is constant; whether the plan can use it is treatment-dependent.
- No timeout increase, policy bypass, stub, hidden load semaphore or result cap.
  SQL retains ten seconds; complete requests retain the existing HTTP deadlines.
- Real delivery writes and owned before/after lifecycle controls remain. These
  change logging/dedupe state, not seeded content. No database/cache reset is
  claimed. This is a warm/steady-refresh local diagnostic, not a cold-cache study.

## Treatments and order

| Arm | App-built main query | Candidate compiler |
|---|---|---|
| A | Original all-time Newest query | Off |
| B | Same query with the fixed inclusive 30-day lower bound | Off |
| C | Same dated query as B | On |

Use fixed balanced blocks **ABC, BCA, CAB**. Each arm appears three times and
once in each within-block position. Restart API for every arm; wait for previous
HTTP/native work to drain. Record background merges and resource contention,
not a claim of perfectly identical cache state. The original frozen January
experiment and its two-of-four cloud result remain historical, unchanged.

Each arm first runs one excluded serial warm-up feed, then one measured serial
feed for each of the two readers. Then run the unchanged concurrent sequence:
two readers, five-second interval, five-second warm-up, ten-second observation,
up to 60-second drain. Retain failures and censoring; no success-only percentile
is presented as an all-traffic result. Twelve measured concurrent feeds per arm
are diagnostic samples, not a capacity curve or credible p99 estimate.

## Correctness and attribution

The fixture has 50 recent posts in each reader's 1,000 groups. Its first 21
Newest rows are therefore identical for A/B/C. Require independent exact
IDs/order/author/profile/engagement checks and live view receipts. Validate
permissions/deletions before and after each arm. Token values stay in memory.

Record actual compiled SQL hashes and whether candidate SQL was emitted. Only
C may emit candidates. Research-only query-ID instrumentation links native SELECT
work, including failures, to the real HTTP request; SQL, parameters, tokens and
exception contents are never copied into observer records. Connection startup
and command/insert work are not falsely claimed as tagged SELECT work.

Outside timed traffic, a container-only diagnostic uses real login/discovery and
the registered query handler to obtain the canonical compiled main query. Save
the **full** `EXPLAIN indexes=1` plan and its hash, not only candidate lookup.
This diagnostic changes neither policy nor returned results.

## Gates and interpretation

Record native rows/bytes, duration, memory and exception codes per tagged query,
alongside complete feed/HTTP latency and failures. Keep raw resources, request
correlations, serial observations, plan/source hashes and arm order. Semantic
errors, source drift, missing attribution or a wrong arm witness invalidate the
comparison, rather than being counted as performance failures.

If B beats A but C does not beat B, the date filter—not the extra candidate
plan—is the useful treatment. If all arms time out, report censored observations
and inspect plans/work rather than claiming a winner or raising the limit.
Do not extrapolate local outcomes to the blocked matching-cloud topology.

The controller owns a fresh unpredictable project and a 60-minute total local
deadline, with independent exact-project cleanup verification on success,
failure or timeout. Read-only diagnostics never access a rejected existing
target. No production promotion or further optimization is part of this task.

## Preparation receipts

The small A/B/C floor completes with exact ordered outputs, all four measured
feeds per arm passing, actual compiled-arm witnesses and exact native ID
attribution. Its owned containers/volumes/network are verified absent. This is
functional preparation only, not million-author evidence.

Preparation also retains failed probes instead of silently accepting them:
clickhouse-connect's `transport_settings` sends HTTP headers, so IDs must be
passed through its supported `settings.query_id` route; a native 24.8 replay
checks both successful and failed terminal IDs. The first floor refuses the
unsupported `currentQueryID()` function before any arm; quiescence now uses
24.8's self-inclusive `system.processes` count. Review-found missing failed-HTTP
correlation and unpinned memory-overlay cases have red→green controls. All
active Compose bytes now enter the source guard, and missing attribution makes
the comparison invalid, not a performance failure.

The million-author run uses the same 5-GB ClickHouse/4-GB data limit as the prior
local C run, with one restore and all nine scheduled treatments. Its cached API
image is pinned by immutable image ID; no new cloud spending is authorized.
The earlier small-floor instance is cleaned up. No matched million-author arm
results have been obtained; the operator pauses experiments and requests a PR.

Before the first matched arm, the initial large preparation attempt receives an
HTTP error from an unoptimized B follow-up and aborts, with no arm measurements
and verified cleanup. Requiring that full B feed to meet the latency deadline
would condition admission on the very outcome being compared. The next attempt
therefore admits only after all-row import/count proof, real login/discovery,
an exact-document authorized query and wrong-Origin denial. It does not claim a
full-feed latency pass during preparation. Every successful main response is
checked immediately, before follow-ups, so a later counter failure cannot hide
wrong main rows. Successful complete feeds still undergo the independent full
profile/count/view oracle; all original performance deadlines remain unchanged.

## Handoff state — paused for PR

The full attempt above is a preparation failure, not nine completed treatments.
Its owned project and the independent controller both verify empty cleanup. The
later structural-admission, immediate-main-check and native-error classification
repairs have offline controls but have **not** been replayed as a full matched
million-author comparison. The successful small ABC floor predates those last
repairs. No A/B/C winner, regression or capacity conclusion is available.

The fresh-project 60-minute controller used during local work lives in the
gitignored workspace `.context/`; it is not a portable controller shipped by this
PR. Before any replay, provide/review an independent exact-project lifetime
controller and obtain fresh local execution approval. No experiment is currently
running, and no new cloud spend or deployment is authorized by the PR request.
