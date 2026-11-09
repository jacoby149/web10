# Fast browsing, explicit deep search — planning only

## Direction and reference

People should browse quickly, then deliberately narrow a deeper search when
they want to mine old material. Operator, 9 November 2026:

> “then if people want to mine for stuff, we can have an advanced search.”
> “actually we should add that to the plan to have advanced search right?”
> “maybe a lmit 100k somewhere! would make things lighter”

Reference: `.context/attachments/assets/752043a0-924e-4403-8142-ec423b204064/image.png`.
It shows YouTube's Filters panel grouped by type, duration, upload date,
features and prioritization. Adopt its discoverability and grouped controls,
not unsupported YouTube-specific features or branding. The operator subsequently
settles the product direction: “for feed performance doesnt go back > than 1
month. for discover” and “if you want to see older need to go advanced mode, and
might lag”. **Normal Discover has a transparent one-month eligibility window;
ranking remains tunable within it.** Exact calendar-month/rolling-day UTC boundary
and cursor encoding are AS1 details to settle before code. A 100,000-candidate
cap and automatic exclusion of zero-engagement posts are not selected defaults.

No UI/API/schema, deployment flag, timeout extension or feed eligibility change
ships with this plan. Existing S1–S10 search work is reused, not rebuilt. This is
not revival of rejected Q02 or proof the failed experiment is now solved.

## Current-source findings

- `components/Search/GlobalSearch.tsx` provides the existing front door, category
  previews and URL `q` handoff. `data/search.ts` filters small loaded pools
  (currently 50) client-side; that is neither full-history search nor a complete
  server-side date/author/duration/engagement filter system. Do not advertise
  exhaustive “no results” from that pool.
- `data/feed.ts::buildFeedQuery` joins reaction, repost, comment and profile
  aggregates before its final page LIMIT, including Newest. The ranking knobs
  select a weighted power-mean score; a large weight is **not** an eligibility
  predicate. The current likes-ranking signal uses total likes plus dislikes,
  whereas displayed likes are distinct. Review that semantic before defining
  “likes-only” filters or pruning rules; do not silently change it for speed.
- The experiment has 3.1M documents across services, not 36M unique feed posts.
  Its K=1,000 reader has about 1,000 eligible creator posts. Repeated input scans/
  CTE work read about 36M rows. A 100k eligible-candidate cap alone therefore
  need not reduce that failed query's work.
- `documents` stores `body String`, top-level `created_at`, and sort key
  `(author_key, doc_id)`. The fresh experimental schema has no date-specific
  index/projection. Reactions/comments are documents; their displayed counts
  are aggregates, not indexed counter columns. A WHERE clause or output LIMIT
  is not proof of physical skipping, especially outside latest-history windows.

## Product and correctness contract to settle before implementation

### Fast feed versus older-content access

Implement the approved recent-window direction for **normal Discover**, with
explicit Older / Advanced mode to go beyond one month. It is not deletion or a
blanket restriction on Following, profiles, direct links, playlists or every app;
those surfaces retain their contracts unless separately changed. Investigate
candidate-count budgets, page-first Newest and rank-specific safe pruning within
the eligible window. Define what is bounded: result count, distinct
authorized/current candidates, physical rows/bytes, memory, elapsed time and
cross-request concurrency are different quantities.

Expose “last month” coverage and the **Older / Advanced search** escape hatch;
the knobs rank that visible recent pool, not the entire archive. Do not silently
widen the window, remove older records, imply exhaustive all-time ranking, or
undermine ownership/delivery promises. Empty recent feeds/infrequent creators
need a clear advanced-mode action, not a claim that the creator has no content.
Exact cutoff inclusivity/timezone/fixed clock, any exceptions and whether a
separate 100k cap applies per source/query/session still need explicit contract
and measured costs. “Nobody scrolls that far” is not a measured resource bound.

For pure Newest, test selecting the exact authorized current post page **before**
optional engagement/profile/media enrichment. Do not compute global engagement
ranking merely to sort by timestamp. Preserve service grants, exclusions, group
multiplicity, stable tie-breaking/cursors and delivery accounting; no N+1
enrichment or arbitrary LIMIT on raw histories before the read boundary.

### Filters and weighted ranking are different

The approved Discover date window and explicit advanced date/`comments >= 1`
filters change eligibility transparently. Weights still rank within that eligible
set; they do not independently justify dropping zero-engagement posts or further
shrinking the window. Mixed signals, sparse results and ties can still put those
posts in the top page. Any mathematically safe top-k pruning needs a bound
showing excluded candidates cannot outrank retained ones. Otherwise label the
candidate-window ranking as bounded/approximate and get product approval.

All filters/aggregate counts retain live app/group/visibility gates and canonical
latest/tombstone semantics. Never pre-filter a mutable historical JSON value or
deletion flag so an older version can reappear. Date predicate placement needs
an actual immutability/current-state proof, not an assumption. A cached global
engagement count must not reveal private/removed reactions or comments.

### Advanced search

Add an accessible Filters entry and grouped controls. Inventory real metadata
before locking the MVP: query text, content/entity type, creator/group, date
presets/custom range/all time, supported duration ranges, explicit engagement
minimums and clear sort/prioritization. Unsupported resolution, captions, license,
location or live-state filters do not appear as fake working controls.

Applied filters, query, source scope, sort, continuation and meaningful open-panel
state belong in the URL; refresh/back/forward/share and login return preserve
them. No credentials in URLs; raw query/filter contents do not enter third-party
telemetry, recordings or diagnostic payload logs. Use safe operation/count/timing
signal. Use real authorized node queries, not filtering another tiny preview pool
and calling it complete. Preserve existing category destinations and previews.
First implementation may be home-node-only; cross-node scope follows explicit
destination consent/credential/source ownership, not ambient token forwarding.

Deep/all-time searches may have a separately approved budget longer than normal
browsing, but never indefinite execution. Define cancellation, progress, retry,
bounded concurrency/fairness and timeout/budget-exhaustion states. No global
ten-second-limit increase, hidden partial results or “no matches” on a truncated
search. If a queued-job design is needed, principal ownership, cancellation and
live authorization at retrieval are separate review gates.

## Generic storage/access paths — research gate, not migration approval

The node must serve notes/music/shops as well as social. Keep documents and
service/app schemas generic; no social-only node endpoint, `likes_count` column
or privileged raw-table search path. New indexing/query capabilities require
separate small reviewed API/storage bites, not an app-specific search backend.

### First priority: a date access path for recent Discover

Test the actual posted-time predicate plus a generic range/skip index or
time-ordered projection/access path **before** a broad JSON-indexing project.
The operator's old/recent split could permit >10× less scan work if old blocks
are actually skipped; it is not a claim about the current repeated 36M-row read.
Min/max metadata on poorly clustered dates may span old and new values in every
block, dropping none. A usable time-oriented physical layout/projection may be
needed, with current-version/tombstone semantics preserved.

Acceptance needs EXPLAIN parts/granules, native rows/bytes/memory and complete
query latency on recent-heavy, old-heavy and mixed-block inputs. Verify that
the predicate reaches a safe read stage; a date filter after global windows
can leave the broad work intact. Bound engagement/profile/repost work to valid
recent candidates/page where ranking permits; a posts date index does not
automatically restrict every other service aggregate. A 35M-old/1M-recent example
is a scenario, not measured production distribution or guaranteed end-to-end
speedup. No posts are removed, and the frozen January study is not relabelled.

### Read-first priority and eventual generic JSON indexes

Operator: “the reads being fast is more important with social media” and “would
be cool to minmax index every field in the json + the lookup indexes”. Deliberate
storage duplication, extra indexes and heavier writes are acceptable to obtain
fast reads; do not reject a useful read path merely for those costs. Still record
them for capacity/operations and protect foreground reads from merge/backfill
contention. The acceptance objective is read latency/concurrency and correctness,
not single-table minimalism or minimum write work.

Broad, generic JSON-path lookup plus appropriate range indexes is the eventual
capability target **if practical**, not a claim that ClickHouse already provides
one automatic all-path/all-operator index. Min/max per scalar path helps only
selective ranges on suitable layouts; equality/key lookup needs its own tested
access path. An index that reads metadata but skips nothing can hurt reads too.
Keep path/type/missing/null/array behavior generic across apps, and preserve live
authorization/latest/deletion checks. A separate writer/read-optimized deployment
is a future option, not the current requirement or a new active implementation
lane. All-time/deep search may be slower, but remains explicitly budgeted.

Evaluate three distinct tools with actual EXPLAIN/rows/bytes and mutation costs:

1. Existing String bodies with tested expression skip indexes/materialized
   extraction for declared paths; indexes only help compatible predicates/data
   layouts and still must preserve history resolution.
2. Generic sort keys/projections/access paths for common service/owner/time/ref
   reads. A date column is not automatically a date index. An engagement count
   aggregated from other authorized documents is not just a JSON leaf to index.
3. A supported-version native JSON experiment: dynamic subcolumns can avoid
   full-string field parsing, but do not automatically locate arbitrary matches
   or make joins/top-k/current-history work cheap. Per-service/path declarations,
   type handling and quotas may be appropriate; an unbounded “index every key”
   policy incurs write/storage/merge costs and dynamic-path overflow.

Official [JSON docs](https://clickhouse.com/docs/sql-reference/data-types/newjson)
mark production readiness from **25.3**, later than the study's **24.8.14.39**.
They also document full-object reconstruction/insert/storage overhead and
null/absent, dotted-key, numeric/type behavior. Any experiment must preserve the
existing arbitrary JSON round trip, SDK/SQL compatibility, private/current reads,
backfill/deletion/repair behavior and rollback; no in-place `String`→`JSON`
migration or version upgrade is authorized here. Benchmark whole-object CRUD as
well as selected-path filters across unrelated app schemas. The
[skip-index docs](https://clickhouse.com/docs/optimize/skipping-indexes) require
matching expressions and sufficient block selectivity; a declared index is not
evidence that a query actually skips data. Newer documented text/search/index
features require explicit version checks, not assumptions about 24.8 support.

**The operator's “index everything in the JSON” question is a real capability
target, not another name for native JSON storage.** Compare JSONB GIN-style
whole-document key/value indexing (PostgreSQL) and wildcard path indexes
(MongoDB) as isolated capability references, alongside ClickHouse's path storage
and declared-expression indexes. State exactly which key-existence, containment,
equality, range, ordering and aggregation queries each structure accelerates;
none makes arbitrary derived counts/joins/top-k free. Include write/storage
amplification, mixed types/arrays, quotas and canonical current-state permission
checks. Any alternative-engine research must also price preserving the existing
query compiler/API, history and ownership model; this is not authorization to
replace ClickHouse or add a second production database.

### IX1 candidate: shared typed path/value index tables

**Future direction explicitly requested by the operator:** developers use
pre-existing generic typed index capabilities rather than create physical
indexes. The design/prototype/planner/validation and follow-up-paper phases are
tracked in `research/shared-typed-indexes-follow-up.md`; no migration is approved
by recording that direction. IX-DATE remains the near-term priority.

Operator supplies the cross-workspace design discussion at
`.context/attachments/2THNnq/pasted_text_2026-11-09_08-30-46.txt`. Retain it as an
architecture hypothesis, not evidence of implementation or performance. The
concrete capability is canonical documents plus a fixed family of derived
access-path tables: new services/paths become indexed **rows**, not a physical
table or `ALTER` for every app field. This is compatible with D60; “price” or
“fuel” remain app-defined paths, not node concepts.

Organize families by typed access pattern, not literally one table per
ClickHouse index type. An illustrative range ordering is
`(service, path, typed_value, author_key, doc_id)`; an actual design must also
carry version/array-element identity as required. Numeric/date ranges, string
equality/prefix, path presence and text tokens may need different structures.
Keep exact integers/decimals distinct from lossy Float64 conversion; JSON strings
that look like dates do not acquire date semantics without an explicit rule.
Arrays need same-element identity, and path encoding must distinguish literal
dots/keys from nesting. Supported automatic extraction and optional schema-guided
query/type intent can coexist; developers do not choose physical indexes/DDL.

The planner finds/intersects bounded candidates, then retrieves authorized
current canonical documents and confirms predicates/order. It normally does
not reconstruct document bodies from index rows. Keep arbitrary canonical JSON
round trips unchanged initially; covering/index-only reads are a separate proof,
not permission to bypass current author/service/group/tombstone checks. New raw
index tables are node infrastructure and must not become caller-accessible SQL.

**Stale hits and missing entries are different failure modes.** Canonical
rechecks can deny a stale candidate; they cannot discover a newly matching
document missing from the index. A design needs coverage/watermark/readiness
semantics for new paths, partial writes, backfill, retries, deletion, rebuild and
concurrent writes. ClickHouse source/index writes are not assumed to be an
atomic cross-table transaction. Until coverage is proved, exact queries need an
authoritative fallback or an explicitly approved/visible lagged-search contract;
never silently return an incomplete result as exhaustive. Preserve version/tie
behavior and prevent private/stale index counts from leaking authority.

Benchmark selective and broad ranges, huge predicate intersections, JSON
reconstruction, current-history resolution, read-after-write/failure recovery
and actual foreground concurrency. Accepted extra storage/writes do not guarantee
low read cost, and an indexed scalar does not maintain authorized cross-document
engagement aggregates. This candidate must feed usable identity restrictions
into canonical reads; indexing values but then repeating the same broad history
windows is not acceptance. No schema/indexer/planner migration or new host run is
authorized here; IX-DATE remains the first storage investigation.

## Small independent implementation bites

| Bite | Ownership | Acceptance / gates |
|---|---|---|
| **AS1: filter/budget contract** | Planning KB; coordinate search/feed/media owners | Encode approved one-month normal Discover + explicit older Advanced mode; settle exact cutoff/URL/source/sparse behavior, metadata/ranking and any separate 100k proposal. Preserve screenshot reference; no runtime work. |
| **AS2: advanced-filter UI/data** | Social `components/Search/`, `data/search.ts`, focused tests; route/board seams reserved with owners | URL-owned apply/reset/cancel/history and login return; true authorized server-side filtering beyond the 50-row preview; supported fields only; tokens/states/accessibility and desktop/375px inspected screenshots under design.md. Depends on AS1 and existing primitives; missing generic capability is a separately scoped handoff. |
| **FB1: bounded feed candidate/page strategy** | Social `data/feed.ts`, feed/board adapters and focused tests; API boundary only by separately claimed bite | AS1/product sign-off; exact Newest page-first and justified mixed-ranking behavior; date/budget boundaries, old/zero-count/sparse nodes and cursor ties; live grants/tombstones; measure native scans/windows/joins plus client latency and existing accounting. Keep rejected Q02 out; 100k is not an accepted threshold. |
| **IX-DATE: recent Discover range-read feasibility** | Isolated ClickHouse/API research/tests + social query seam reservation + KB | First storage investigation: current-version-safe date predicate/index/projection with actual old-block skipping. Test old-heavy/recent-heavy/mixed granules, full aggregate/profile work, top-k/cursors/access parity and read-first latency/concurrency. No production migration or fresh paid run without approval. |
| **IX1: generic access-path feasibility** | Isolated API/ClickHouse tests/research + KB, coordinated storage/security owners | EXPLAIN indexes/parts/granules, actual rows/bytes, CRUD/ingest/storage/merge costs, declared-path/JSON compatibility, history/security and sparse/broad/overlap parity. Compare current engine and an explicitly approved upgrade experiment separately. No app-specific API/table or production migration. |
| **AS3: deep-search execution budget** | Generic execution primitive only if needed, separately claimed backend/SDK and client-status bites | AS1 plus real filters; explicit bounded long-running semantics, cancellation, fairness, current credentials/visibility and response completeness. Default-off until independently reviewed; no broad timeout relaxation. |

All bites retain normal PR checks; trust-boundary code/test units stay within the
existing ≤500-line gate. No runtime implementation, screenshots of a fake feature,
new host purchase, input publication or production change is part of this plan.
The frozen K=1,000 study remains unchanged: its January 2026 timestamps would all
fall outside “last month” in November. Adding `now()-30 days` to make that fixture
empty is not a successful optimization. Any filtered/K=20 study is a new labelled
workload with its own correctness gates and explicitly approved execution.
