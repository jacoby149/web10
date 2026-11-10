# PROTOCOL — K=20-first experiment, frozen unit

> **Status: FROZEN 09.11.2026** (input identities complete below; dataset files
> local-only). This file is the single frozen unit of **claim, workload,
> inputs, arms and targets** for [PLAN.md](PLAN.md) (the ratified directive of
> the Nov 9, 2026 planning conversation). Where any older document
> (`STUDY.md`, `READYING.md`, `RUNNING-V2.md`, `study_plan.py`, PR #1417 /
> #1424 designs) conflicts with PLAN.md or this file, **PLAN.md + this file
> win**. Nothing here authorizes a CMT submission, a production deployment, or
> a production table rebuild — each waits for Jacob's explicit go-ahead at its
> gate. All execution is local on the operator's Mac: Docker, loopback, $0.

## 1. Claims (the two-claim rule)

Two separate claims, never conflated:

1. **Per-request cost** — bytes read per feed request on a frozen input.
   Hardware-independent; the paper's evidence core (Phase 0 + Phase 1).
2. **Fleet capacity** — matched silicon only: "a recorded local setup sustained
   the derived peak load of a 37k-DAU node on the K=20 workload" (Phase 2,
   bounded operating-point demonstration).

K≈20 is the realistic headline case. K=1,000 is a crazy heavy-follow stress
case. Measure both; never relabel one as the other; never call either a
"typical user" statistic. No fixed-dollar fantasy: the claim is POOLED SIZING
(a bigger instance, not a different architecture); machine counts come from
the §7 formula, not slogans.

## 2. Workload

The **personal core-feed sequence** — the real app/SDK request builders,
pinned by source-captured wire (no HTTP in the capture; fake transport):

- Main query: `buildFeedQuery` Newest preset, profile/reaction/comment/repost
  joins, `prepare.media/ads/face`, `surface=feed`, `content_service=posts`,
  `LIMIT 21`.
- Then, concurrently over the **returned** IDs: reaction counts, comment
  counts, `/v3/contentViews`.
- K≥21 inputs: 21 fetched, 20 displayed (the capture's declared shape).
  **K=20 inputs: 20 fetched, 20 displayed** — the main query's `LIMIT 21`
  meets exactly 20 eligible posts (20 followers × 1 post each); the second
  page is empty. Declared, not hidden: `check_result` compares against
  `sorted(followed, reverse=True)[:21]`, so both shapes are oracle-exact.

Current captures (source pins moved 09.11.2026 after the 5.10.1 feed tuner
touched `feed.ts`; **all four request payloads byte-identical to v4/v3** —
the workload is unchanged, only the pin moved; review receipt in
`evidence/protocol-inputs-20261109.json`):

| capture | file |
|---|---|
| first page (current) | `evidence/core-feed-wire-v5.json` |
| pagination builder (current) | `evidence/core-feed-next-page-v4.json` |
| first page (historical) | `evidence/core-feed-wire-v4.json` (unchanged) |
| pagination (historical) | `evidence/core-feed-next-page-v3.json` (unchanged) |

Ground rules:

- Real login + real `/v3/groups/list` discovery; real app grants; real
  `Origin` (`https://costfn.research.invalid` — the fixture's app-contract
  origin). No Origin-free shortcuts, no policy-bypass or stub flags
  (`research_api` refuses them at boot).
- Delivery impressions and request logging stay **enabled**; the feed is not
  read-only. Condition declared: **steady-refresh after warm-up** (warm-up
  mutates real delivery dedupe state; that is the named condition, not a
  defect).
- Production/native SQL timeout stays **10 s**. No timeout increase, ever, in
  this study.
- **Engine pin: ClickHouse 24.8** (research overlay image
  `ghcr.io/jacoby149/base-clickhouse:24.8`; the dev app SQL uses `QUALIFY`,
  which historical 24.3 rejects). One engine version for the whole study;
  results across engine versions never pool. Every receipt records the
  resolved server version + image ID + source pins (`provenance.runtime`).
  Historical 24.3 cloud trials stay 24.3 records.
- Readable-resolution mode is declared per cell: `per-group` is the
  **production default** (the paper says so wherever it appears); `batched`
  is the research variant under Study A.

## 3. Inputs (frozen)

All inputs: generator `dataset_v2.py` (seed 42), **20,000 readers uniformly
in every input** (reader-side cardinality held constant across N so Study B
isolates the author-side 100× lake growth; Phase 2 needs ≥1,400 distinct
reader sessions; Phase 1 randomized reader order has headroom). One post per
creator; distinct second-resolution timestamps from 2026-01-01 (declared
**all-recent shape**: the full 1M-author span is ≈11.6 days — see §4 Arm B).
Profiles + likes populated; every tenth post has a comment; public posts
attach to followers **and** the default Discover board. V2 format, all-row
validator replayed before every restore (`dataset_v2.py validate`).

New inputs are **local-only** under `.context/inputs/<slot>/` — not
published to MinIO unless Jacob separately authorizes it. The two K=1,000
inputs reuse the existing frozen (public) identities, re-validated locally
before restore.

| slot | creators (N) | K | locality | readers | use |
|---|---:|---:|---|---:|---|
| `k20-1m-dispersed` | 1,000,000 | 20 | dispersed | 20,000 | **Phase 0 headline**; Study B (1M); Study C (K20-d); Study P; Phase 2 |
| `k20-1m-hot` | 1,000,000 | 20 | hot | 20,000 | Study C (K20-h) |
| `k100-1m-dispersed` | 1,000,000 | 100 | dispersed | 20,000 | Study C (K100-d); Study A (K100) |
| `k100-1m-hot` | 1,000,000 | 100 | hot | 20,000 | Study C (K100-h) |
| `k10-1m-dispersed` | 1,000,000 | 10 | dispersed | 20,000 | Study A (K10) |
| `k20-100k-dispersed` | 100,000 | 20 | dispersed | 20,000 | Study B (100k) |
| `k20-10k-dispersed` | 10,000 | 20 | dispersed | 20,000 | Study B (10k) |
| (existing) `k1000-1m-dispersed` | 1,000,000 | 1,000 | dispersed | 20,000 | Study C (K1000-d); Study A (K1000) |
| (existing) `k1000-1m-hot` | 1,000,000 | 1,000 | hot | 20,000 | Study C (K1000-h) |

Dataset identities (SHA-256 of the manifest; recorded in
`evidence/protocol-inputs-20261109.json` alongside row counts, compressed
bytes, generator hashes and validator receipts):

| slot | dataset_id |
|---|---|
| `k20-1m-dispersed` | `424cdf26029869728e73033921583160d47764d76175f2ec4b3f7b2a5d1ea0d2` |
| `k20-1m-hot` | `ed2e8a02c2c213eb12d4d2fb1ce78c1ec13b6f58b7de0c4f968eca0a45bbf637` |
| `k100-1m-dispersed` | `2fededb9dfd73ffca1d81904b5c3b96bad4d955f4fc6f3286d4dddec4ce74656` |
| `k100-1m-hot` | `017949e4ae89d87f28683cf07ae7e751070d1cabce9e4895ca6b48b42066c839` |
| `k10-1m-dispersed` | `880adce4e61aca0110d6ebbe6fbf14dd7aa136b1f4cebcf520357fd30b12b9d3` |
| `k20-100k-dispersed` | `43d14a2b8abd062ceed71c2952ca1fa34d386245adb4ad95fb75a9d77de6d92d` |
| `k20-10k-dispersed` | `6118af723d7918049d891f1245255d723e0e5a9f0ae951b746c3634aad0bd692` |
| `k1000-1m-dispersed` (existing frozen) | `dbed2201952f9ca1b581c30a541e44b6912a5a6ba1bec84ee166aa80575132b4` |
| `k1000-1m-hot` (existing frozen) | `53b16c1072a8e80032b20ae23c5675040b851274ad7a314a106b7557be3b5363` |
| `k20-1m-longspan` (**date-k20 derivative** — 09.11.2026 operator engineering: "~1/30 of the posts 30 days old") | derived from `k20-1m-hot` by `dataset_v2_date.py` (format `web10-costfn-date-k20-v1`; identity recorded in the `evidence/protocol-inputs-20261109.json` addendum): pinned clock 2026-11-09T12:00Z, cutoff = clock − 30 d; cohort = creators 0..19 (every reader's hot followed set) re-stamped to the newest 20 s; background = last 33,333 creators spread across the window (~1/30 of the posts in-window, ~1.1% of all docs); all other creators keep the old January stamps. Only `documents` + `doc_groups` re-stamped; new dataset identity. Purpose: make the date mechanisms (Arms B/C) non-vacuous on the personal feed while every arm's top-20 = the cohort (output parity by construction) |

All seven new base inputs: all-row validator replayed 09.11.2026 (generator
`4ef34b16…`, shared `f0c6d148…`); row counts 12.46M–14.26M at N=1M; 222–228 MB
compressed each. Floor inputs (40 creators / K=20 / 2 readers, 534 rows each):
`99f3faec…` dispersed, `44a0a1cd…` hot. Full receipts:
`evidence/protocol-inputs-20261109.json`.

**Small-floor gate (the #1417 rule, applied before any input is treated as
frozen):** the workload must be proven on a small K=20 input — `creators=40,
follow=20, readers=2`, both localities, local disposable stack, strict
`acceptance.py` pass: exact nonempty results, real joins firing (reactions
nonempty on all followed posts; comments nonempty on every-tenth), Discover
links present, distinct timestamps, missing-Origin denial, and next-page
oracle where applicable. Floor receipts:
`evidence/protocol-inputs-20261109.json` (`small_floor_strict_acceptance`).
Small-floor success is a **functional gate only** — it never claims transfer
to the full store (#1452 rule).

## 4. The four arms (Phase 0 — get ONE query fast)

Same frozen input (`k20-1m-dispersed`, with `k20-1m-hot` as the crowding
control), same real query. **An arm whose output IDs/order differ from Arm A
is INVALID, not slow — fix or drop it, never average over the discrepancy.**
Dense/broad case first, pre-declared regression budget: **any arm >2×
baseline memory on any shape kills the arm** (Q02's standing rule; no
single-group carve-outs).

| Arm | Treatment | Storage change |
|---|---|---|
| **A** | Today's table, `ORDER BY (author_key, doc_id)`, merged source (Q01 #1448 exact-ID pruning + #1447 attachment-history partition pruning both in the pin) | none |
| **B** | A + 30-day `created_at >= cutoff` as **pure SQL** (no new index, no design change; on today's key it is a column scan + filter, not a range seek — it shrinks the candidate set for downstream steps, it does not skip the table) | none |
| **C** | B + a time **PROJECTION** on the same `documents` table (engine-maintained alternate time order; generic service/time/identity fields — the #1464 tool family — one DDL + materialization; research stack on the frozen input only) | one projection, same table |
| **D** | A **rebuilt** `documents` table `ORDER BY (author_key, created_at, doc_id, updated_at)` — date in the **middle** (first breaks the author-prefix ownership lookup; last sorts only versions of one doc) — same frozen rows re-loaded, all other tables unchanged; the query is written to exploit the key (author set + time predicate pushed into the scan; rank-everything-then-filter invalidates the comparison's point) | research-stack variant table = a measurement, not a migration |

The permitted query/compiler iteration is **only**: the two merged measures
above, the 30-day bound, and the arm treatments. No Q02 revival (#1449:
rejected, 8.3× duration / 34.2× memory on overlap). No new optimizer idea,
no D109/IX build, no production rebuild.

**Arm D treatment mechanics (the key-exploiting query the directive
mandates: "author set + time predicate pushed into the scan"):** on the
personal feed, "readable via my 20 followers groups" collapses to
"posted by my 20 followed authors" — verified by 20 group-ownership point
checks (member + owner-of-group, cheap seeks on the group tables'
`group_id` keys), not the 4.1M-row `doc_groups` full-scan. The posts read
then becomes 20 author-prefix seeks on the re-keyed `documents` table
(+ the time predicate where declared). The collapse is valid under the
fixture's posting semantics and the I3 gate (no document returns for an
`author_key` the token doesn't own or sit in); it is declared in the arm
receipt as the treatment, measured against Arm A's un-rekeyed mechanism.
On the date-k20 input the time predicate additionally prunes to the
in-window cohort (the ~1/30 minority the operator engineered).

**Step-1 sequence treatments (declared 10.11.2026, operator task: "finish
the feed sequence"):** beyond the main-query treatment above, the full
sequence carries two more, both bounded and evidence-backed (Q01/#1448
family — no new optimizer ideas):
- **(a) Engagement follow-ups (reactions/comments counts): exact-ID
  pushdown.** The compiled follow-up's one boundary CTE (full `documents`
  window + full `doc_groups` window over 21 groups) is rewritten to push
  the returned-ID list into both windows: `doc_id IN (ids)` on
  `doc_groups` (its key prefix — 20 seeks, not the 4.1M scan) and
  `doc_id IN (ids)` alongside `collection_name='<svc>'` on `documents`.
  The join and every gate (group-keyed AND author-keyed) are RETAINED —
  a pure readability-resolution rewrite. Declared residual: the
  documents-side service read remains a full-service scan on the D key
  (`collection_name`/`ref_value` carry no key prefix) — on this input
  ~3.1M native rows filtered to ~310k reactions / ~31k comments; recorded
  in every receipt, not hidden. No counts satellite is built in this step.
- **(b) Node-ad inventory: verified TTL short-circuit (chosen option; the
  alternative — declaring it an exclusion — was not chosen).** The
  inventory read is a shared node-level surface (PLAN §1.4: cache where it's
  the same for everybody): the research layer serves one live, verified
  read per 60 s window to all sessions; the live-read count, cache hits and
  creatives seen are recorded per request. This input has zero node ads, so
  the live read returns [] — the short-circuit is verified, not assumed.

**Phase 1.5 — the `counting_numbers` satellite (amendment, declared
10.11.2026 BEFORE any run it affects; operator task "Branch continued"):**
one GENERIC typed satellite, named after a type, never after an app or
feature (D60): `counting_numbers(doc_id String, counter_name String,
value Int64) ORDER BY (doc_id, counter_name)` — ReplacingMergeTree
snapshot (rebuilt wholesale, no incremental maintenance in this study, no
claim about any). `counter_name` is application-supplied DATA: this
study's values are `reactions:like`, `reactions:dislike` (the app oracle
needs the like/dislike split; a single `reactions` total cannot satisfy
it — the split is data values, not schema) and `comments`. No
app/feature words in the schema; the word "engagement" may appear only in
receipts. The wider typed family (floats, strings, dates, refs) is NOT
built here — counting_numbers only, at counts scope.

- **Build (dedup-correct, receipted):** `INSERT SELECT` from the canonical
  `documents` on the frozen input — latest version per
  (doc_id, author_key) FIRST (rn = 1, deleted = 0 — the tombstone
  invariant; dedup before filter), then count DISTINCT live engagement
  doc_ids grouped by `ref_value`, one row per (target doc_id,
  counter_name). Counting raw rows/versions is a correctness bug.
  Receipt: source dataset ID, build SQL hash, rows written, distinct
  target docs, per-counter-name row/value totals, duration.
- **Freshness contract:** a snapshot of the frozen input, rebuilt after
  any fixture or lifecycle writes and before every measured window. NOT
  incrementally maintained; a measured feed whose counts could postdate
  the last rebuild invalidates the cell (rebuild, re-run).
- **Treatment (follow-ups only; main + ad TTL unchanged):** the Step-1
  readability verification is unchanged; only the counting step changes —
  counts come from `counting_numbers` via `(doc_id, counter_name)`
  point-seek subqueries (one per returned ID per counter), zero-filled
  for absent posts (absence is a value, not an error). The rewritten
  follow-up SQL is golden-pinned per service; drift refuses. Gated by
  `COSTFN_SATELLITE=1` (research entry point only; off by default).
- **Gates (receipts retained either way):** (1) count parity — satellite
  counts equal the Step-1 treated follow-up outputs on every probe and
  measured feed; disagreement = the arm is INVALID, the oracle is never
  adjusted; (2) the sequence gate re-run on the same stack/input —
  strict acceptance passes, per-shape native table published, follow-ups
  verified in the native log at point-seek scale (if rows read is still
  large, the key is not being used — investigate, do not report around
  it); (3) ablation statement — sequence bytes/request before (~255 MB)
  vs after; follow-up rows/bytes before vs after. Phase 2 runs on
  D + counting_numbers; if the gates fail, Phase 2 does NOT silently
  fall back to the 255 MB sequence — report and stop for operator
  decision.

**Phase 1.6 — the views follow-up (amendment, Step-0 classification
10.11.2026, BEFORE any code change; operator task "Phase 1.6"):**

The views follow-up (`/v3/contentViews`, the `contentViews` entry of the §2
workload) was never treated in Step-1 (no views golden was declared). Step-0
classified it on a fresh Arm-A debug stack (k20-10k) + source citation;
full receipt: `results/phase1.6-step0-views-classification.md`.

- **Returns COUNTS, not rows -> Branch A.** `content_event_views_for_docs`
  (`api/app/v3/services/clickhouse.py:4920`) runs
  `SELECT e.doc_id, count() AS impressions, countDistinct(e.reader_key) AS reach
  FROM content_events e WHERE e.service='posts' AND e.event_type='delivery'
  AND e.doc_id IN (<returned ids>) AND e.doc_id IN (SELECT doc_id FROM doc_groups
  WHERE group_id IN (<readable>) AND deleted=0) GROUP BY e.doc_id` and returns
  `{doc_id: {impressions, reach}}` (absent doc_id = absent key = 0). The same
  counts-shaped object as the reactions/comments satellite counters.
- **Pure read, but the source is refreshed (steady-refresh).** The
  `/v3/contentViews` call does not write. The study's MAIN FEED (`/v3/query`
  with `surface` + `content_service`, which the feed wire carries) logs a
  delivery impression per returned doc (`query.py:478` -> `log_content_deliveries`),
  **window-deduped** (`clickhouse.py:4714`: re-delivery within the window is
  gated). Empirically `content_events` stays constant across repeated in-window
  feeds. In a fresh study stack it holds only the study reader's ~20-40 deliveries.
- **Cost is the `doc_groups` readability subquery, not content_events.**
  Arm-A native read @10k: contentViews = 41,040 rows / 3.73 MB / 113 ms,
  dominated by the I3 `doc_groups` subquery; the content_events read is ~40 rows.
  The reactions/comments follow-ups read ~72,000 rows each @10k (-> ~3.6M @1M)
  — THAT is the `followup-armA` shape Studies B/C flagged, not the views.
- **Discrepancy vs the task premise (declared, not papered over):** the task
  stated "views ~3.7M rows / 215 MB per call" and "Phase 2 cannot run with views
  untreated (23 loads/sec x 3.7M rows)". The 3.7M is the reactions/comments
  service-partition read; the views query's real dominant cost is the
  `doc_groups` readability subquery (~2M @1M) and it is classified `other` in
  `native_breakdown` (a top-level SELECT, not `WITH...`), not `followup-armA`.
- **Branch A implementation (declared before the build):**
  1. Extend the Phase-1.5 satellite build: `counting_numbers` gains the views
     counters as `counter_name` DATA values `views:impressions` (count) and
     `views:reach` (countDistinct reader_key), built from `content_events`
     (event_type='delivery', service='posts') grouped by doc_id. No schema change
     (D60). Same wholesale rebuild + receipt.
  2. Rewrite the contentViews call (research-only, mirroring the node-ad
     monkeypatch): readability via the Step-1 exact-ID pattern (point-scale
     `doc_id` seeks on `doc_groups`, dropping the full subquery) + counting via
     `counting_numbers` point-seeks (`doc_id IN returned ids,
     counter_name IN (views:impressions, views:reach)`), absent row = 0.
     Golden-pin the rewrite; drift refuses. Gated by `COSTFN_SATELLITE=1`.
  3. Freshness: the views snapshot is built AFTER the trial reader's delivery
     logging has settled (window-deduped, so stable) and before the measured
     window, matching the Phase-1.5 freshness contract.
- **Gate (receipts retained either way):** views counts equal the current
  untreated contentViews outputs on every probe/measured feed (oracle = the
  Arm-A-shape contentViews on this fixture; disagreement = arm INVALID, oracle
  never adjusted); native rows per views calls at point-seek scale (hundreds,
  verified in the query log — if still large, the key is not used: investigate,
  do not report around it). Then per-shape sequence table with views
  before/after + parity, before Phase 2.

**Study configurations (declared 10.11.2026 for Phase 1):** Study B/C run
the winning configuration (D layout + all three sequence treatments,
batched resolver mode as the research default; the paper notes the
production default remains per-group). Study A (mechanism repeat) runs the
UN-treated Arm A query with the readable-resolution mode varied
(per-group vs batched) — the treatment is removed from the measured path
so the resolver mechanism is what's priced. Study P (paired resolver
ablation) uses the #1424 comparator on the un-treated query. The
attribution control declared by the operator: the main-query author-set
treatment applied to the OLD Arm A key (author_key is the prefix on both
keys) — prices mechanism vs layout separately.

**Arm B cutoff anchor (declared constant per dataset):**
`cutoff = input max(created_at) − 30 days` on the base all-recent inputs;
the date-k20 long-span input uses its pinned manifest `date_contract`
cutoff (2026-10-10T12:00Z = clock − 30 d). `arm_b.cutoff_for(manifest)`
resolves the declared constant per input. Anchored to the frozen input, not
wall-clock, so receipts stay reproducible. On the all-recent base inputs
this makes Arm B a **declared vacuous control on the personal feed**: a
K=20 reader has exactly 20 eligible posts (one per follower), all inside
any 30-day window that keeps the output identical — so the bound cannot
shrink the candidate set without changing the result. Expected:
neutral-to-negative (cost of a no-op predicate; #1464's all-recent-NEGATIVE
evidence predicts no win). That is a publishable finding, not a failure to
hide. The **non-vacuous** personal-feed date measurement runs on the
**date-k20 long-span input** (~1/30 of the posts in-window; the measured
cohort = the reader's followed set; every arm's top-20 = the cohort, so
output parity holds by construction). The **Discover balanced feed**
(rolling-30-day lower bound — the surface that honestly applies the bound;
the personal Newest surface has none) remains the second declared
non-vacuous site. A scattered-layout "no win" stays a publishable answer.

**Trial-1 mechanism record (09.11.2026, preserved):** on the base
`k20-1m-dispersed` input under the pinned 5 GB allocation, every core-feed
request natively read **7,200,000 rows / ~0.9 GB** (whole `documents` +
whole `doc_groups`: the boundary CTEs resolve the 20 readable groups by
full-scan — `doc_groups` is ordered `(doc_id, group_id)`, so group→docs is
not a prefix seek) with ~1.6 GB per-query memory peaks; warm
single-threaded main = 1.4–3.9 s execute + up to 5.2 s prepare; concurrent
follow-up fan-out hit 3× code-241 total-memory-limit kills. Evidence:
`.context/disp2-trial1/` (query_log export + observer log; local).

**Pre-declared success targets to proceed (Phase 0 → Phase 1):**
**p95 < 500 ms AND bytes read per feed request < 25 MB at K=20 / N=1M on the
recorded local setup.** Adjustment allowed exactly **once**, in this file,
reason recorded below. No silent adjustment.

Amendment log: _(empty — targets as declared)_

## 5. Phase 1 — the per-request studies (the paper's evidence core)

All local, on frozen inputs. Discipline (every study, every cell):

- ≥3 independent trials per cell; **fresh restore per trial** (new disposable
  project, full import, receipts).
- ≥30 measured samples per cell after ≥3 excluded warm-ups.
- Randomized reader/cell order; seed recorded in each trial receipt.
- Raw per-request records + native ClickHouse metrics (rows/bytes/
  duration/memory, query IDs) retained for every cell.
- **Failed/timed-out cells are RESULTS** — report counts and native metrics,
  never drop them; never present success-only percentiles as all-traffic
  numbers.
- Delivery + request logging enabled; steady-refresh condition declared.
- **Primary metric: bytes read per feed request.** Secondary: rows read,
  native duration/memory, p50/p95 latency + failure counts.
- After any merged query change the source pin moves and affected cells
  re-run (#1448 ledger rule) — or the paper keeps the older failure as its
  result.

| Study | Cells | Question |
|---|---|---|
| **B — store-size scaling (headline)** | one reader, K=20, dispersed, N ∈ {10k, 100k, 1M} | As the lake grows 100×, does the read stay in its own slice, or pay for everyone's data? |
| **C — K cost function** | N=1M, K ∈ {20, 100, 1,000} × {hot, dispersed}, at the Phase-0 winning configuration | The cost function itself. K=1,000 cells are expected to be hard (Q01 failed 2/4 feeds, code-159, ~36M rows / ~3.7 GB) — if they fail again locally, **that is the measured stress bound; report it, do not fix it mid-study** |
| **A — mechanism repeat** | K ∈ {10, 100, 1,000} × {per-group, batched}, N=1M dispersed, real core-feed workload, same sampling discipline | Does batching remove the repeated-metadata bottleneck? (If `bench.py`'s simplified query is ever used instead, captions say **mechanism-only**.) Note in the paper: production default remains per-group. |
| **P — paired resolver ablation** | ≥20 pairs × ≥3 trials, randomized arm order, identical compiler-SQL + ordered-output hash per pair, first pair excluded warm-up | Resolver **recomputation cost only** — not total auth overhead. The #1424 `paired_trial.py` comparator, locally. |

Configuration for Studies B/C: the Phase-0 arm that meets the §4 targets
(declared in Phase-0 receipts; if none meets them, the studies run Arm A and
the paper's cost story is the failed baseline — that is also a result).

## 6. Phase 2 — the 37k DAU load demonstration (last; only if Phase 0 passes)

Operating point (the paper's own funnel arithmetic; 1 session/DAU/day, 15%
of DAU in peak hour, 15-min sessions):

> 37,000 DAU → 5,550 peak-hour sessions/hr → **~1,400 concurrent sessions** →
> **~23 feed loads/s at 60 s think time** (46/s at 30 s).

- **Mix** (per the cache principle, modelled at the node boundary, declared
  10.11.2026): Discover-balanced is a shared surface — one computation per
  refresh interval served to all — so the node sees **≤1 Discover
  computation per 60 s** (the miss); the other Discover sessions are cache
  hits that never reach the node. Following reads are computed live per
  user at K=20: **~23.3 live Following feeds/s** from ~1,400 concurrent
  distinct reader sessions at 60 s think time. The receipt states the mix.
- **Input:** the FULL 1M-author store (`k20-1m-dispersed`) — deliberately
  bigger than a real 37k-DAU node's store; conservative, declared.
- **Setup:** everything on the Mac. Docker allocations pinned and recorded in
  the run receipt (Docker VM memory, ClickHouse RAM/data caps, API cores —
  e.g. the prior local runs' 8 logical CPUs / 5 GB ClickHouse cap). Generator
  headroom proven: generator CPU < 50% while the server is the bottleneck.
- **Success criteria (pre-declared here, before running):** sustain the
  target rate for a **10-minute window**; error rate **< 1%**; p95 client
  latency within the Phase-0 budget; **zero correctness failures** —
  lifecycle controls (allow/deny/revoke/tombstone) pass before AND after.
- **Claim allowed:** "a recorded local setup sustained the derived peak load
  of a 37k-DAU node on the K=20 workload" — an operating-point
  demonstration. Loopback latency disclosed; server throughput, errors and
  handler latency are the evidentiary core.
- **If Phase 0 fails at K=20, Phase 2 does not run.** There is nothing to
  load-test yet.

## 7. Sizing arithmetic (for the paper, labelled derived)

```
Concurrent sessions = peak-hour sessions × session minutes ÷ 60
Offered rate        = concurrent sessions ÷ think time
In-flight requests  = offered rate × per-request latency
Machines (16 cores) = peak feeds/s × core-seconds per feed ÷ (16 × 0.6 utilisation)
```

For 37k DAU (23 feeds/s): 1 machine at ≤0.4 core-s/feed, ~3 at 1 core-s, ~10
at 4 core-s, absurd at today's multi-second scan cost. At ~9.4k concurrent
sessions (1M-MAU): ~167 loads/s — either ~8 in flight at 50 ms/read or
~1,670 at 10 s/read. **Per-request cost decides the hardware, every time.**
The paper states the formula + measured core-seconds; it does not promise a
machine count for unmeasured costs. 1M scenarios (registered/MAU/DAU) stay an
explicitly-assumed funnel table — assumptions, never results.

## 8. Non-goals (explicit)

No cloud of any kind. No 1k–20k VU matrix. No timeout increase. No
production changes or deployments DURING the experiment. No new demos. No
D109/IX1/IX2 builds before the freeze (Arm D is a copy of existing data into
a re-keyed research table, not the D109 redesign). No number in the
manuscript that doesn't trace to a raw record in one step. No CMT upload or
submission without Jacob's explicit go-ahead. Internal freeze Nov 20, 2026;
deadline Nov 24, 2026 11:59pm AoE.

## 9. Superseded (record, so it isn't repeated)

- **The 30-point H/S × 1k/3k/5k/10k/20k × three-trial offered-load matrix**
  (`STUDY.md` / `study_plan.py` `LEVELS` / READYING "L" points / the
  approval-gated `run_core_point.py` cloud path): **cancelled as the primary
  study** — load before cost. `study_plan.py` remains the wire-oracle
  module; its matrix is history. The cloud execution-approval machinery is
  not used; local-only replaces it.
- **The 30-point concurrent VU matrix of PR #1417 / #1424 and the cancelled
  Nov 6 tier-max cloud run (9/20 cells):** historical receipts, unchanged.
- **K=1,000 as headline:** replaced by K=20 headline + K=1,000 stress bound.
- The Nov 9 Q01 preflight failure (`evidence/Q01-PREFLIGHT-20261109.md`,
  K=1,000, cloud, 24.8, code-159 ×2 at ~36M rows / ~3.7 GB) is the **kept
  failed baseline at heavy K** — preserved, not rerun-on-cloud, not a Phase-0
  result.
- `revised-experiment-plan.md` (planning-conversation draft, kept in the
  planning workspace): working draft of PLAN.md; this repo's
  [PLAN.md](PLAN.md) is the ratified consolidation.

## 10. Gates and authority

- **Local execution:** authorized by PLAN.md (ratified Nov 9, 2026) for
  Phases 0–2 on the frozen inputs, on the Mac, $0.
- **Arm C/D storage treatment:** research stack on the frozen input only.
  "No storage rebuild" means no PRODUCTION rebuild and no D109/IX redesign
  during the experiment.
- **Production migration (PLAN.md §8):** executes AFTER the experiment and
  only on Jacob's explicit go-ahead at the gate: Arm D must beat A/B/C at
  K=20/N=1M on the primary metric, meet the Phase-0 targets, with exact
  output parity AND no regression on the ownership point-lookup path
  (author-prefix probes stay point reads — verified before the flip). One
  rebuild bundles the date sort key + D109 Stage-1 integer version if ready;
  Jacob decides at the gate whether to wait or ship the key alone.
- **Manuscript:** seventh draft per PLAN.md §5 (copy `research/sixth-draft/`
  → new working folder; v6 stays frozen). Formatting vs CFP incl. footskip;
  author = Jacob Hoffman / Web10 Inc. only.
- **Receipts:** every phase's output is named before it starts; receipts are
  written with the bite they belong to (`evidence/`); raw records retained
  for independent recomputation of every headline number.

## 11. Local setup record (pinned for receipts)

- Host: operator's Mac, 8 logical CPUs, 16 GB RAM; Docker VM 7.654 GiB
  (09.11.2026; other workspaces' e2e stack ≈1.5 GiB — recorded, not a
  guarantee). ClickHouse RAM/data caps declared per run in the receipt.
- Disposable project per trial: `web10-costfn-<study>-<slot>-trial<n>`;
  ports recorded per restore receipt (floor uses 6092/6093).
- Python 3.12.6 (harness), Bun 1.3.14 (captures). Generator/validator/
  restore/acceptance pins are in every receipt via `provenance.sources()`.
