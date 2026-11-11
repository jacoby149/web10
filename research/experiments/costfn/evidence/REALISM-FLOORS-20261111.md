# Derived realism floors — 11 November 2026

This is **local dataset preparation**, not node performance, a pilot, production
traffic, cache residency or private/lifecycle assurance. No uploads, paid
provisioning or spend. The operator's
[directive](../REALISM-DATASET-DECISIONS.md) and
[implementation map](../REALISM-DATASET.md) govern continuation.

## Current floor receipts — both pass

[`realism-10k-20261111-v4.json`](REALISM-ARTIFACTS.md#floors) contains the current
partitioned validator's independent statistics and all **50 passing checks**,
including like-zero fraction. Earlier 49-check and unpartitioned receipts stay
unchanged as history. The dataset itself is unchanged across validator retries.

The current **100k**
[`v4 receipt`](REALISM-ARTIFACTS.md#floors) also passes **all 50 checks** at
the same 2 GB validator budget. No samples, row dropping or study-envelope
increase were used to obtain this pass.

| Quantity | Actual |
|---|---:|
| Registered accounts (readers included) | 10,000 |
| Original posts | 40,000 |
| Reactions / comments | 640,000 / 192,000 |
| Actual delivery-event rows | 16,000,000 |
| Node-ad documents, active/tagged/Discover-linked | 300 |
| Accounts with no original posts | 85% |
| Post shares: top 1% / next 9% / bottom 90% | 74.7% / 24.0% / 1.3% |
| Following / followers median | 75.5 / 47 |
| Impressions median / maximum | 50 / 1,000,000 |
| Parquet bytes across all nine tables | 192,552,427 |
| Nonempty readers in each of eight K/locality cohorts | 16 / 16 |

| Quantity | 100k actual |
|---|---:|
| Registered accounts | 100,000 |
| Original posts | 400,000 |
| Likes / comments | 6,400,000 / 1,920,000 |
| Physical delivery events | 160,000,000 |
| Node-ad documents | 300 |
| Original-post nonposting | 85% |
| Top 1% / next 9% / bottom 90% post shares | 74.7% / 24.0% / 1.3% |
| Following / followers median | 75.5 / 37 |
| Impression median / maximum | 50 / 1,000,000 |
| Parquet bytes across all nine tables | 2,007,445,814 |
| Independent checks passing | 50 / 50 |

All eight 100k cohorts are nonempty for every declared reader; ordinary and
conditioned viral-probe metrics are separate in the JSON. Four declared joint
correlations are positive. These are synthetic-model validation results, not
observations of production or node capacity. The observed follower medians
(47 at 10k, 37 at 100k) remain visible rather than being printed as the
approximate design target of 30.

Dataset ID: `cc38c3cd7785dd98ee5763b69f248d9d662c89ced3b97d58138ca7cde0898d8c`.
All four declared joint correlations are positive; exact values and ordinary
versus conditioned-viral-probe cohort distributions remain in the JSON. Do not
equate positive correlations with proof of a specific real platform's full
joint distribution. One current document version per ID is generated; the
canonical selector is present, but these data do not prove a history/churn or
permission-lifecycle workload. Parquet size is not ClickHouse native/cache size.

The declared attention correction is 400 impressions/post: 1.6B at 1M accounts
over 320 days. The floor has 16M **physical** event rows, not weighted
multiplicities. Repeated viewers obey the actual node's 24-hour delivery window;
the historical viral probe is separate from ordinary cohort summaries.

## Repeat and 100k admission

A second fresh 10k generation has the same manifest and every Parquet digest;
the independently rehashed
[`repeat receipt`](REALISM-ARTIFACTS.md#floors) records that result. The
pipeline refused to start 100k until both 10k validation and repeat passed.

The 100k generator completed: **400,000 original posts, 6.4M likes, 1.92M
comments, 160M physical deliveries**, 8,820,300 document rows, 9,220,600 links
and 15,200,288 memberships. Its dataset ID is
`9893c0c0ad8bb375b3d68864c66aea8dd8191ecc060b55dd4f5637b2a4024c2f`.
Generation took 424.5 seconds on this local attempt; not a repeat-trial or node
performance number. The first
[`100k validation receipt`](REALISM-ARTIFACTS.md#earlier-attempts) is **FAILED**:
the validator exhausted its own 2 GB local working budget. This is a preparation
failure, not a marginal pass, a ClickHouse failure or evidence of node capacity.

The bounded-memory retry keeps 2 GB, uses one worker and disables insertion-order
preservation, adds named stage diagnostics and a like-zero-fraction check, and
reruns **both** datasets under the new source pin. Old receipts stay unchanged;
no old pass can authorize 1M under a changed validator. Updated outcomes must
be recorded before claiming the 100k gate. Do not infer a pass from an existing
output directory. The measured ClickHouse 28/22 GiB envelope is not changed.

The v2 retry isolated the remaining OOM at `engagement_targets`: inlined
canonical-document ranking duplicated window state across the join. v3's
one-time full canonical materialization also exceeded the 2 GB budget. Both
failed receipts remain. The v4 validator makes one streamed, row-count-checked
disk partitioning pass by the complete version key `(doc_id, author_key)`,
then ranks each of 64 bounded buckets. It similarly partitions delivery
window/distinct-audience work by `(doc_id, reader_key)`, so all rows of each
window/group remain together. This is exact validation, not sampling or a
changed model, and still uses 2 GB. A regression verifies materialized
canonical scratch and deletion-wins behavior. v4 **both 10k and 100k pass all
50 checks**; old failed receipts remain. 1M is not started.
The 1M build requires current source/byte-bound independent passes at **both**
10k and 100k, plus sufficient local resources. No automatic paid fallback.

## Kept development failures and repairs

Earlier attempts are retained under `.context/realism-*`; they are not pooled
with this input or relabelled as measurements:

- `realism-10k-r1`: setup failure before export — DuckDB interval multiplication
  narrowed a multi-day millisecond value to INT32. Use `to_milliseconds(BIGINT)`;
  the retained regression covers the >INT32 interval.
- Earlier validator runs: parser/setup failures from implicit aliases using
  reserved words (`comments`, `following`). Explicit aliases and a small full-SQL
  execution fixture now exercise the entire validator before large checks.
- `realism-10k-r5`: valid negative generator result: following median 102 and
  impression median 53.5, not the contract. Preserve the acceptance criteria;
  repair the generator's even-population middle order statistics. Regressions
  pin 75.5 and 50 rather than changing tolerance after the fact.
- `realism-10k-r6`: the core model's checks pass, but source review found that
  the initial ad fixture did not exercise actual node inventory eligibility.
  The subsequent fixture uses `ad` + `node_ad`, active body status and Discover
  attachments; the independent check now mirrors that source contract. r6 is
  not the current pilot-admission input.
- First 100k validation: local validator `OutOfMemoryException` at its 2 GB
  limit; the retained receipt is failed. Attempt ledger:
  [`realism-attempts-20261111.json`](REALISM-ARTIFACTS.md#earlier-attempts). Retrying
  preparation must not quietly increase the measured study allocation, drop
  checks/rows or call generation alone validation.

No failed raw attempt, V2 file or historical receipt was discarded. The new
format/manifest/source hashes distinguish every revised input. Regression
suites and Compose-config-only verification are separate evidence from actual
dataset validation; no container was started for the 28/22 GiB config check.

## 1M local resource admission — retained blocker

Both current floor receipts/source pins and actual input hashes passed the
1M prerequisite check. The subsequent local disk admission refused **before
creating output**: 80,147,483,648 estimated bytes including reserve versus
31,109,308,416 free. Receipt:
[`realism-1m-local-admission-20261111.json`](REALISM-ARTIFACTS.md#scratch-and-resource-assessment).
This is the conservative guard, **not measured proof that a 1M build is
impossible**. At the observed compression, 1M Parquet alone projects to roughly
20 GB, but generator staging, exact validator scratch and free-space reserve
also need admission. Do not equate that compressed-file extrapolation with
peak scratch or ClickHouse/cache size, silently remove the guard, delete older
attempts, shrink distributions, increase the study envelope or rent a host.

Next resource bite: measure/admit total scratch requirements or use an
operator-approved larger local scratch volume; separately review these floor
statistics before any paid-substrate decision. Complete the Parquet-to-node/
selected-cohort adapter and independently receipted exact live-delivery deltas
before connected execution. Exact SKU eligibility, pilot budget and independent
resource-lifetime cleanup remain gates. No automatic paid fallback; report the
pilot before the full-study fan-out. No production change or CMT submission.
The adapter must also prove per-service group/attachment semantics and full
projected-row/count parity on cross-author engagement, not assume that an old
V2 author-set treatment transfers because its original fixture/IDs passed.

**Scratch audit complete (5.22.0):**
[measured assessment](REALISM-SCRATCH-20261111.md) records a fresh byte-matched
100k generation and all 50 independent checks passing. Sampled allocated
dataset+scratch peaks were 8.71 GB / 7.37 GB for the sequential generation /
validation phases. Sampling/non-atomic scans and 1,250× cohort growth prevent
using a naive 10× projection as admission proof; ~27.38 GB free does not justify
removing the current guard. RD3-SCRATCH is complete; RD3-RESOURCE awaits an
approved larger local scratch location or separately approved preparation-host
revision. No jobs continue in the background after this audit.
