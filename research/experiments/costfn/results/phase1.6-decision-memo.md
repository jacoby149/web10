# Phase 1.6 decision memo — views follow-up (10.11.2026)

Status: **Step 0 done (classified); Branch A (satellite) rejected on the evidence;
1M confirmation pending.** No code built. This memo corrects the gate-B / task-block
premise and records why the treatment is NOT the `counting_numbers` satellite.

## The correction (why this exists)
gate-B (and the task block) carried the label *"views = the 3.7M / 215 MB
`followup-armA` shape"* and a Phase-2 threat of "23 loads/s × 3.7M rows". Step 0
captured the raw `query_log` on a fresh Arm-A k20-10k debug stack (one feed +
follow-ups = **44 native queries**, grouped by SQL fingerprint) and the label is
wrong. It is now retracted in `gate-B.md` (ERRATA).

## What the 10k fingerprint shows
| SQL fingerprint | ×/feed | rows @10k | endpoint |
|---|---|---|---|
| `WITH comments AS …` (service partition) | 3 | ~168k each | main-feed engagement + comments follow-up |
| `SELECT gc.group_id …` (readable-group resolution) | 1 | 460k | groups/readable resolution |
| `WITH reactions AS …` (service partition) | 2 | ~72k each | main-feed engagement + reactions follow-up |
| **`SELECT … FROM content_events` (contentViews)** | **1** | **41,040** | **`/v3/contentViews` — the actual views follow-up** |

- **The `followup-armA` 3.7M/214.7 MB bucket @1M is the reactions/comments
  service-partition `WITH` CTEs, NOT views.** `n≈124`/window ≈ 3–4 `WITH … group_id
  IN` CTEs × 33 feeds. That is **Phase 1.5's** `counting_numbers` job.
- **The views follow-up is a top-level `SELECT … FROM content_events`** → classified
  `other` (not `WITH…`), so it is not in `followup-armA` at any scale. Its read is
  dominated by the `doc_groups` I3-readability subquery (41k @10k); `content_events`
  is ~40 rows (the study reader's own window-deduped deliveries).

## Step 0 classification (recap)
- Returns **counts**: `impressions = count()`, `reach = countDistinct(reader_key)`,
  keyed by doc_id, from `content_events` (event_type='delivery'). Surface looks like
  Branch A.
- The `/v3/contentViews` **call is a pure read**, but `content_events` is **written by
  the act of reading the feed**: the main `/v3/query` logs a delivery per returned doc
  when the wire carries `surface` + `content_service` (`query.py:478` →
  `log_content_deliveries`), **window-deduped** (`clickhouse.py:4714`). Stable within
  the study window; not static in principle.
- `content_events` is **not in the fixture** (`dataset.py TABLES`) → in a fresh study
  stack it holds only the study readers' window-deduped deliveries.

## Why Branch A (the satellite) is the wrong tool for views
1. **Freshness conflict.** A `counting_numbers` snapshot is "rebuilt before every
   measured window". The views source (`content_events`) is written *during* the study
   (the sample reader's own delivery logging), so a pre-window snapshot misses it → the
   gate "treated == live on every measured feed" would fail for the sample reader.
2. **`reach = countDistinct`, not a sum.** A `counting_numbers` row can hold the
   number, but it does not behave like reactions/comments under any freshness story —
   it is derived from a per-reader event stream, not a static partition.
3. **It would not touch the cost driver.** The real cost is the `doc_groups`
   readability subquery. A `counting_numbers` row solves the (already minimal)
   counting, not the subquery.

## Decision
**Do not build Branch A as written.** The classification changed the treatment. The
two outcomes, to be confirmed by the pending 1M `query_log` re-capture:
- **Views is small at 1M** (contentViews' `doc_groups` subquery stays modest because
  `content_events` is minimal) → **Phase 1.6 closes as "premise corrected, no
  treatment needed"**; `gate-B.md` erratum stands; Phase 2 was never threatened by
  views. (Best outcome, cheap.)
- **The `doc_groups` readability subquery is the ~2M @1M** → the treatment is the
  **Step-1 move, not the satellite**: replace the readability subquery with exact-ID
  point verification (the returned post IDs are already I3-verified by the main feed),
  so contentViews reads a handful of `content_events` rows by `doc_id` seek at any
  scale. **No `counting_numbers`, no freshness contract, no reach problem.**

## 1M confirmation (done 10.11.2026) — outcome #2
Re-captured one clean Arm-A 1M feed's raw `query_log` (fresh `views1m` stack,
k20-1m-dispersed; the B/C aggregate-only retention meant a re-capture). Confirmed:

| follow-up | native rows @1M | MB | ms | owner |
|-----------|----------------|-----|----|-------|
| reactions | 7,200,000 | 872 | 1081 | reactions service-partition CTE |
| comments  | 7,200,000 | 808 | 833  | comments service-partition CTE |
| **contentViews (views)** | **4,100,060** | **372.8** | **670** | **the `doc_groups` I3-readability subquery** (`content_events` itself is 60 rows) |

So the "3.66M `followup-armA`" is the reactions/comments service-partition reads
(**Phase 1.5's** `counting_numbers` job), and views' real cost is the **`doc_groups`
readability subquery at ~4.1M @1M — not small.** **Outcome #2: the treatment is the
Step-1 readability move, not the satellite.**

## Treatment (implemented, gated `COSTFN_VIEWS_TREAT=1`, research-only)
The contentViews query's inner `doc_groups` subquery gains `doc_id IN (<returned ids>)`
(`doc_groups` is `ORDER BY (doc_id, group_id)` → a prefix seek). The outer `e.doc_id IN`
already intersects, so the result is byte-identical; only the native read drops.
- `arm_d_rewrite.views_treated_sql(doc_ids, service, group_ids)` — builds the treated
  SQL, golden-pins the point-scale marker (`doc_groups WHERE doc_id IN (`), parse-validates.
- `research_api.py` — monkeypatches `ch.content_event_views_for_docs` (mirrors the node-ad
  pattern) when `COSTFN_VIEWS_TREAT=1`; `research.compose.yml` exposes the flag.
- `arm_d_rewrite.test.py` — 2 new tests (point-scale marker, empty case).

## Gate (1M, reader 5's 20 returned posts)
| | rows | MB | ms |
|---|---|---|---|
| ORACLE (untreated contentViews) | 4,100,060 | 372.8 | 670 |
| TREATED (`COSTFN_VIEWS_TREAT=1`) | **1,240** | **1.2** | **5** |

**Parity: PASS** — 20 docs, byte-identical impressions + reach. Native read
4,100,060 → 1,240 rows (~3,300×), 372.8 → 1.2 MB (~300×), 670 → 5 ms (~130×).
The 1,240 rows = `content_events` (60) + the `doc_id IN` point-seek on `doc_groups`.
Point-seek scale confirmed; the key is being used. **Phase 1.6 closes: views is
treated by the Step-1 readability move; Phase 2 may now run the full sequence with
views at point-seek scale.** No `counting_numbers`, no freshness contract, no reach
problem.

## Method note (for the paper's journey section)
Second confident shape-label that turned out to be a misattribution. The per-shape
`native_breakdown` buckets are only as trustworthy as the fingerprinting behind them —
which is exactly why Step 0 demanded the compiled SQL + a captured response, not an
inference from the label.
