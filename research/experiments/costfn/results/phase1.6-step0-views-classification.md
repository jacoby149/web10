# Phase 1.6 Step 0 — views follow-up classification (one receipt, no code changes)

Date: 10.11.2026. Local, $0, pinned ClickHouse 24.8.14.39, 5 GB CH cap + 4 GB server
throttle. Evidence from a fresh `web10-costfn-frozen-views-debug` stack on
k20-10k-dispersed (port 6098), Arm-A shape (no COSTFN_ARM_D), plus source citation.

## Question
What does the views follow-up return — per-post view COUNTS, or the view
documents/rows? And does the call mutate under the study's steady-refresh condition?

## Compiled SQL (verbatim, from `content_event_views_for_docs`)
Production endpoint `/v3/contentViews` (`api/app/v3/endpoints/documents.py:600`) runs
(`api/app/v3/services/clickhouse.py:4920`):
```
SELECT e.doc_id,
       count()                       AS impressions,
       countDistinct(e.reader_key)   AS reach
FROM content_events e
WHERE e.service = 'posts' AND e.event_type = 'delivery'
  AND e.doc_id IN (<returned post ids>)
  AND e.doc_id IN (SELECT doc_id FROM doc_groups
                   WHERE group_id IN (<readable groups>) AND deleted = 0)
GROUP BY e.doc_id
```

## Captured response (k20-10k, reader c42-reader, 20 returned posts)
```
{"<post doc_id>": {"impressions": 1, "reach": 1}, ... }
```
A dict keyed by doc_id, each value = two COUNTS (impressions, reach). Absent doc_id =
absent key (the caller treats absent as 0). This is `dict[doc_id -> counts]`, NOT a
list of view rows.

## Classification: **COUNTS → BRANCH A**
The views follow-up aggregates `content_events` (event_type='delivery') into
per-doc `impressions` (count) + `reach` (countDistinct reader_key). It returns
counts, keyed by doc_id — the same shape as the reactions:like / reactions:dislike /
comments satellite counters. **Branch A.**

## Mutation / steady-refresh finding (the crux)
- The `/v3/contentViews` CALL is a pure read.
- BUT the study's **main feed** (`/v3/query` with `surface` + `content_service`, which
  the feed wire carries) logs a delivery impression per returned doc
  (`api/app/v3/endpoints/query.py:478` -> `log_content_deliveries`).
- That logging is **window-deduped** (`clickhouse.py:4714`): a delivery is recorded only
  if the last one for that (doc, reader, surface) is outside the delivery window; a
  re-delivery within the window is gated. Empirically: `content_events` stayed at 40
  rows across repeated feeds within the window.
- So the views source (`content_events`) is **refreshed by the study's own main-feed
  delivery logging, but stable within the study window**. In a fresh study stack,
  `content_events` starts empty and holds only the study reader's window-deduped
  deliveries (~20-40 rows).

## Cost profile (Arm-A debug, 10k dataset — native query_log)
| follow-up | native rows | MB | ms | dominant source |
|-----------|-------------|----|----|-----------------|
| reactions | 72,000  | 8.68 | — | `documents` (reactions service partition) |
| comments  | 72,000  | 8.04 | — | `documents` (comments service partition) |
| **views (contentViews)** | **41,040** | **3.73** | **113** | **`doc_groups` I3-readability subquery** (content_events itself is ~40 rows) |

**Discrepancy vs the task premise.** The task states "views ~3.7M rows / ~215 MB per
call" and "Phase 2 cannot run with views untreated (23 loads/sec x 3.7M rows)". The
3.7M `followup-armA` shape in Studies B/C is the **reactions/comments** follow-ups
(72k @10k -> ~3.6M @1M), NOT the views. The views query's real dominant read is the
`doc_groups` readability subquery (~41k @10k -> ~2M @1M); the `content_events` read is
minimal (~40 rows) because the study's content_events only holds the study reader's
window-deduped deliveries. The views query is classified `other` in `native_breakdown`
(it is a top-level SELECT, not `WITH...`), not `followup-armA`.

## Consequences for Branch A (declared before implementation)
1. Moving the counts to `counting_numbers` (point-seek) is cheap already — the
   content_events read is minimal in the study. The dominant cost is the
   `doc_groups` readability subquery.
2. So the views rewrite must ALSO apply the Step-1 exact-ID readability pattern
   (point-scale `doc_id` seeks on `doc_groups`, dropping the full subquery), not just
   swap the counting source. (Branch A's "readability verification unchanged
   (Step-1 exact-ID pattern)" is exactly this.)
3. Freshness: the `counting_numbers` views snapshot is built from `content_events`,
   which the study's main feed refreshes (window-deduped). The build must run after
   the delivery logging has settled for the trial's reader(s) so the snapshot matches
   the live contentViews output (the oracle).

## Branch taken: **A**
Basis: the views follow-up returns per-doc COUNTS (impressions + reach) keyed by
doc_id, from `content_events`, as a pure read whose source is refreshed by
window-deduped main-feed delivery logging. Extend the Phase-1.5 satellite with the
views counters + apply the Step-1 exact-ID readability to the contentViews call.
