# Batching And Request Fan-Out

Status: planning inventory, source-audited 02.11.2026. No optimization implemented
by this document. Owners claim individual bites in `parallel-execution.md` before
editing; this is not permission for a project-wide refactor.

## Goal

A creator with 100 identities or a reader following 1,000 groups should not pay
one network/database round trip for every row on screen. Fetch the required set
once, evaluate/map it in memory, then render. Keep the permissions, not the trips.

This inventory covers inspected API, SDK, social, authenticator and marketing
hot paths. It is not an exhaustive performance certification. Counts below are
source-derived variable work, excluding fixed auth/config overhead, unless a
measurement is explicitly cited. Line numbers are audit anchors; function names
are the durable references.

## Evidence And Non-Goals

The simplified K1000 trial measured per-group versus batched readable resolution:
B handler median 7,644.655 versus 363.305 ms; readable 7,535.705 versus 213.980 ms.
At K1 Discover, batched readable was slower (25.370 versus 9.525 ms).
`research/experiments/costfn/K1000-RESULTS.md` records the single-trial limitations.
It excludes full feed enrichment, media preparation, browser latency and the
Origin app-contract gate. These numbers do not measure the proposals below.
The original trial used an evaluation option. The operator-requested production
helper promotion is locally implemented in 4.16.3 with explicit rollback; this
does not establish deployment or turn the historical trial into a current result.

Do not replace Python `for` loops indiscriminately. In-memory permission checks,
mapping and offline URL signing can remain loops. `Promise.all` overlaps calls;
it does not batch them. Moving fan-out behind first paint helps perceived latency
but does not reduce request count. Pagination, bounded concurrency, batching and
single-flight deduplication are separate tools.

## Gates For Every Bite

- Record before/after DB command counts, HTTP request counts, payload sizes and
  result correctness at 1/10/100 items (1,000 for authorization/import workloads).
  Distinguish fixed, per-distinct-key and per-chunk costs. Do not call a nested
  per-row SELECT a batch merely because the browser sent one HTTP request.
- Assert request/command ceilings in deterministic tests; compare outputs with
  scalar behavior, including denied, missing, deleted and duplicate inputs.
  Measure connected p50/p95 and first-paint/settled latency separately before
  claiming user-visible improvement. No new cloud spend without authorization.
- Preserve I3/app-contract/group grants, human versus `author_as` authority,
  service-specific roles, current revocation, uploader provenance and audit fields.
  Permission optimizations require security-method review and negative controls.
- Request-local permission maps are preferred. UI single-flight keys include API
  origin, client/credential generation and exact semantic options. Account name
  alone is insufficient. Rejections must be retryable; obsolete completions must
  not update the next account, identity, route, page or search.
- No settled cross-request permission TTL initially. Every write retains live
  node checks; focus/explicit refresh and membership/role mutations invalidate UI
  hints. Do not dedupe writes, consent actions or reconciliation mutations.
- Preserve ordering, limits/cursors, latest-row/tombstone semantics and per-parent
  quotas. A global LIMIT does not replace one LIMIT per group/comment. Preserve
  delivery accounting, surface/content-service and prepare options when sharing reads.
- Chunk large sets with explicit bounds; avoid unbounded SQL IN lists and one
  giant import insert. Isolate partial failures. Keep `api/` generic (D60): no
  identity-picker, feed, mutual-friend or DM-specific node endpoint.
- Each item is a queue of small PRs, not one combined PR. Trust-boundary bites
  must satisfy the existing <=500 code/test-line gate. Split equivalence tests,
  wiring/promotion and connected verification where necessary; never exempt the
  gate just because the feature is large.

## Backend Queue

Paths in this section are under `api/`. Priority is source-based, not production
traffic measurement. Each checkbox remains open until its own gates pass.

### Q01/Q02 - P1: History work exposed by the million-author preflight

- [✓ 5.9.2 local; release gates OPEN] Q01: canonical media/ad reads supply internal exact IDs to both history
  inputs before ranking; all versions, current authority and ambiguity checks
  remain. Twenty-four controls, twelve actual ClickHouse cases and a native 3,000-UUID
  query-byte fallback pass; local
  100k-identity diagnostics reduce bytes/window memory, not the failed full-feed
  concurrency gate. Owns compiler/canonical-helper hunks and focused API tests.
  [Evidence](../security/scans/2026-11/query-exact-id-pruning.md).
- [ ] Q02: use readable attachment candidates to narrow the main document
  history input. Separate bite after Q01; retain complete histories, visibility,
  multi-group multiplicity and canonical authority. Actual ClickHouse plans and
  rows/bytes parity precede unchanged strict concurrency acceptance. No paid
  execution or production changes without approval.

### B01 - P1: Readable-Set Authorization

- Evidence: `app/v3/endpoints/query.py:223` (`run_query`),
  `app/v3/endpoints/documents.py:290` (`read_documents`), and
  `app/v3/services/clickhouse.py` (`readable_groups`, `can_read_group`,
  `effective_role_perms`, `readable_groups_batched`). K groups times S services
  repeated scalar checks at the original audit; even all-membership candidates
  cost S*K member queries. The 4.16.3 helper promotion replaces those calls with
  byte-bounded batch chunks: one query for all-member chunks, otherwise up to
  three per service/chunk, not three for an entire multi-service request.
- [✓ 4.16.3 local] Production default: generic helper and query selection,
  validated rollback, explicit research references, byte-bounded chunks and
  one-query all-member chunks. Twelve real ClickHouse Memory-history parity
  combinations and member K1/10/100/1000 budgets pass. See
  `../security/scans/2026-11/readable-resolution-default.md` for scope and exclusions.
- [ ] B01a remaining: differential scalar/batch tests for membership, reserved principals,
  wildcard/service grants, revoked/tombstoned groups and D42 explicit-group denial;
  extend local Memory-history evidence to real schema/merge lifecycle and pin
  mixed/public command budgets and the K1 tradeoff.
- [ ] B01b remaining: approved dev/production verification of the promoted query
  resolver, mixed-public crossover/load and diverse review; no guessed small-K
  cutoff, no no-policy/stub evaluation flags in production.
- [ ] B01c remaining: verify ordinary document/group and carrier reads under the
  promoted shared-helper default on the real schema; the helper already routes
  existing callers. Preserve duplicate/order behavior and unreadable groups.
- Acceptance: high-K policy DB round trips bounded by service count/chunks,
  no permission widening, connected full-feed evidence separate from the paper.

### B02 - P1: Page-Wide Owner-Scoped Media Metadata

- Evidence: `clickhouse.py:3514` (`resolve_media_urls`) and `:3641`
  (`resolve_media_urls_in_docs`). Metadata fetch is batched within one document,
  then repeated for each main document/ad/node-ad occurrence; up to 3N SELECTs
  for N media-bearing posts with both ad slots. Repeated ads repeat the work.
- [ ] B02a: collect/dedupe main-document `(media_owner, media_doc_id)` tuples,
  batch metadata in bounded chunks and scatter results.
- [ ] B02b: extend the same request-local mechanism to pinned/node ads with their
  own uploader context; do not inherit the carrying post's owner.
- Acceptance: mixed uploaders/group authors, repeated refs, invalid foreign keys,
  valid siblings and missing refs match existing behavior; no foreign/stale URL
  fallback; metadata SELECT count follows chunks, not documents/ad occurrences.

### B03 - P1: Face Preparation Reuse

- Evidence: `app/v3/endpoints/query.py:104` (`_prepare_face`) resolves metadata
  inside its row loop. N rows carrying face refs can cause N metadata SELECTs.
- [ ] B03a: request-local `(declared author, media ref)` deduplication.
- [ ] B03b: reuse B02's owner-scoped metadata batch for distinct faces.
- Acceptance: 50 rows sharing a face use one lookup; same ref ID under different
  owners cannot collide; malformed/missing faces retain safe fallback.

### B04 - P2: Group-List Owner Self-Healing

- Evidence: `app/v3/endpoints/groups.py:202` loops caller-created groups through
  `heal_followers_group_owner`; `clickhouse.py:1398-1444` rereads contracts and
  membership per owned group. Base listing is already batched; the heal adds
  C contract reads and potentially C member reads plus repair writes.
- [ ] B04a: batch contracts/current member rows for actual caller-owned groups.
- [ ] B04b: batch only necessary repairs; reuse list metadata only after proving
  it has equivalent freshness/meaning.
- Acceptance: healthy 100-group listing has bounded queries; drift heals once;
  contracts without owner roles remain unchanged; non-creators and delegated
  `author_as` listings never enter human owner repair.

### B05 - P2: Group Creation Members

- Evidence: `app/v3/endpoints/groups.py:160-166` contains two identical member
  existence loops: 2M SELECTs plus missing-row inserts.
- [ ] B05a: remove the duplicate pass with idempotency/role-preservation tests.
- [ ] B05b: batch existence reads and missing-member inserts independently.
- Acceptance: mixed existing/new/duplicate members retain established roles;
  creator-owner handling unchanged; bounded reads/writes as M grows.

### B06 - P2: HLS And Carrier Permission Checks

- Evidence: `app/services/hls.py:91` (`can_view_doc`) checks direct memberships
  serially; `clickhouse.py:1116` (`can_read_carrier_post`) checks carrier groups
  through scalar readability helpers. G/H groups add G/H policy calls.
- [ ] B06a: batch carrier readability using B01's verified semantics.
- [ ] B06b: batch direct membership existence separately; do not conflate it
  with broader class/public readability or cache authorization across requests.
- [ ] B06c: reuse verified readable-set checks for media document attachment
  authorization (`app/v3/endpoints/media.py:151`), which currently calls
  `can_read_group` for attached groups until one succeeds. Preserve short-circuit
  allow semantics and avoid turning a singleton fast path into extra work.
- Acceptance: identical public/private/revoked playback decisions, uploader/reader
  separation and signed class preserved; calls bounded across large G/H.

### B07 - P2: Import Writes And Progress

- Evidence: `app/v3/services/import_worker.py:943` (`_write_records`) performs
  document + attachment inserts per valid post/comment: about 2(P+C) inserts.
  `update_import_job:235` also reads/inserts/reads progress periodically.
- [ ] B07a: chunk post document/attachment inserts, retaining generated IDs and
  origin-ID resume semantics. Do not assume two ClickHouse inserts are atomic.
- [ ] B07b: chunk comments after post-ID mapping; pin orphan/partial-failure retry.
- [ ] B07c: reduce redundant progress rereads with explicit version/ownership rules.
- Acceptance: resume/retry does not duplicate origin records; staging privacy,
  target authority, dates and mappings unchanged; writes scale with chunks;
  failure between document/attachment inserts remains recoverable.

### B08 - P3: Retroactive Moderation Writes

- Evidence: `app/v3/endpoints/moderation.py:47` (`moderation_auto_hide`) loops
  selected Discover posts through N hide/unhide storage calls.
- [ ] B08: bounded bulk moderation rows/tombstones for the selected IDs.
- Acceptance: admin gate, Discover-only scope, actor attribution and best-effort
  semantics retained; repeated hide/restore correct; 1,000 docs use chunked writes.

### B09 - P2: Multi-Destination Write Authorization

- Evidence: `app/v3/endpoints/documents.py:241` filters create destinations through
  `can_write_group`; `:430` checks update destinations similarly.
  `clickhouse.py:1586` delegates to `effective_role_perms`, so T destinations
  repeat membership/contract/class database reads. This is actual write-policy
  fan-out, not simply an in-memory list comprehension.
- [ ] B09a: establish scalar/batch write-policy equivalence and command budgets
  for human/group principals, per-service grants, reserved classes and revocation.
- [ ] B09b: batch target permission metadata within each create/update request;
  reuse only proven policy-loading seams from B01, not read grants as write grants.
- Acceptance: create still filters unauthorized targets and denies when none of
  the requested targets are writable; update still denies any unauthorized new
  target. Human app-contract gate, group's independent target authority, moderation
  actor and `posted_by` remain unchanged. Bounded calls for 1/10/100 targets and
  no cross-request permission cache; mixed-target negative tests mandatory.

## Client Queue

Paths are relative to repository root. Prefer existing generic query/face seams;
batch metadata separately from permission-sensitive membership enumeration.

| ID / Priority | Source And Current Cost | Smallest Bites And Acceptance |
|---|---|---|
| C01 / P1 | Social `src/data/mutationAuthority.ts:9-48`: N group-authored cards independently call `getGroup`, then repeat on focus. | [ ] C01a: coalesce in-flight raw group reads per distinct credential/group. [ ] C01b: coordinate focus refresh. Derive posts/comments permissions separately; no settled authority cache. N same-group cards => one concurrent read; logout/token replacement, rejection/retry and revoke-before-write tests. |
| C02 / P1 | Social `ActingIdentitySwitcher.tsx:64-91`: each open costs 1 membership list + G group details + E eligible text identities. Selected face also rereads identity and requests avatar/banner. | [ ] C02a: batch latest text identities by eligible group using existing query seams; reuse C01 concurrent details. [ ] C02b: inspect list role completeness before eliminating detail reads; if insufficient, spec a generic seam separately. [ ] C02c: reuse avatar result's name and omit unused banner via C03. Budgets at 1/10/100 identities; retain service-specific eligibility, partial-error retry and no personal fallback. |
| C03 / P1 | `marketing/shared/discover/src/face.ts:125` (`resolveFaceMedia`) requests avatar and banner even for avatar-only consumers; Python row fanout is separately B03. | [ ] C03: optional requested fields; convert switcher/card consumers first, retain full profile callers. Avatar-only => no banner query; identical owner scoping/name/fallback and stale-result handling. |
| C04 / P1 | Shared `CommentThread.tsx:225` prefetches R reply parents; social `comments.ts:295-395` enriches each reply page separately. At least reply+counts+own-state per parent, plus group authority/faces. | [ ] C04a: visible/expanded-parent prefetch with bounded concurrency. [ ] C04b: collect loaded IDs and batch reaction/own-state enrichment across pages; reuse C01/B03. Preserve per-parent quotas/cursors and draft/action generations; one failed parent must not suppress siblings. Prove request ceilings with many reply parents. |
| C05 / P1 | Social `search.ts:100-120` Video and Posts both call `readDiscoverFeed(null,50)`; `GlobalSearch.tsx:467` launches both. | [ ] C05: share only that identical in-flight board pool; keep independent category state/filtering/errors. One pool read instead of two; scope by credentials/options. Rapid query/account switch fenced; Shorts not merged without equivalence proof. |
| C06 / P1 | Social `posts.ts:704-768` (`resolveMediaRefs`/refresh helpers): list then M original and up to M thumbnail read-URL calls; duplicate refs/keys repeat signing. | [ ] C06a: dedupe refs and object-key refresh within a resolution wave. [ ] C06b: verify list/inline response contracts and skip redundant refresh. Inline resolved refs => zero calls; shared keys => one per key. Direct refresh remains owner-only; foreign media uses authorized document preparation, never ignored `_owner` arguments. Test expiry and foreign stale fallback denial. |
| C07 / P2 | Social `DiscoverScreen.tsx:625` and `posts.ts:16` (`resolvePostAuthors`): A per-author profile helper calls, repeated across pages. | [ ] C07a: batch latest text profiles/prepared avatars over existing readable groups. [ ] C07b: share overlapping-page in-flight reads. Full provider-qualified author keys; group authors use group identities. Three authors/50 posts => one profile chunk; missing/private faces degrade, base content still paints. |
| C08 / P2 | Social `Bio/ProfileFeed.tsx:80-140`: N `readReactions` + N `countComments`; other repost/view helpers already batched. | [ ] C08a: grouped comment counts. [ ] C08b: reaction counts/own-state batches. Budgets independent of N except chunks/pages; exact counts beyond read limits, full acting-author keys and stale-switch fences. |
| C09 / P2 | Social `feed.ts:541-674`: Following page has separate reaction/comment aggregates and views after base; constant fanout, not N+1. | [ ] C09: consolidate compatible aggregates into one keyed query after measuring benefit; coordinate existing paint-on-read lane. Never add Discover to the base post scope: engagement groups differ from follower post groups. Preserve ranking/cursors, private post isolation, reply counts and delivery accounting. |
| C10 / P2 | Social `people.ts` directory and follower/following helpers: mutuals make one member request/person; follower/following cards make per-person profile reads; redundant follower-group count read. | [✓ 4.6.1 local] C10a: reconcile prior tick and restore directory-first progressive snapshots, independent faces/graph and deferred hidden browsers; synthetic 1/10/100 request budgets, no connected timing claim. [ ] C10b: batch latest profile text and reuse equivalent list counts. [ ] C10c: bound/background mutuals; propose generic membership batch/intersection only after privacy design. C10a backgrounds but does not batch/bound enumeration. Exactness across membership pagination and hidden-member denial required; follow state remains human-scoped. |
| C11 / P2 | Social `saved.ts:193-294`: C collection identity reads + C full saved-doc reads capped at 1,000 just for counts; covers already deduplicated. | [ ] C11a: grouped attachment counts, including zeros and >1,000 items. [ ] C11b: batch latest identity docs. Count one doc in each attached collection, not globally once; preserve private/public/group-owned rules and invalidate on save/remove/rename. |
| C12 / P2 | Social `dms.ts:177` N member reads; `groupChat.ts:92` M identity reads; `DmsScreen.tsx:1130` background previews add N+M latest-message reads. | [ ] C12a: batch chat text identities/coalesce membership reads. [ ] C12b: latest-message-per-group query prototype. Keep personal authority and independent membership visibility; global LIMIT 1 is not per-chat latest. No full-history transfer; unreadable chat isolation and account-generation fencing. |
| C13 / P3 | `ui/src/components/Groups/ContractHealth.tsx:34-63`: 2G group/member reads; SDK `v3.ts:1430` reconciliation uses same pair. | [ ] C13a: bound check concurrency and single-flight identical reads. [ ] C13b: consider generic multi-group reads only after measuring. Fence current client/token/request generation; unread groups cannot be certified healthy. Never coalesce reconciliation writes. |
| C14 / P3 | `marketing/marketing-ui/src/pages/GroupDirectory.tsx:46-95`: directory + D anonymous text-face reads, awaited before list display. | [ ] C14a: paint directory base independently. [ ] C14b: chunk latest group-identity text query using existing face semantics. Public-only/node-scoped; missing faces retain slug; node change/unmount fenced. |

Social paths abbreviated above begin at `marketing/web10-social/src/` unless a
different prefix is explicit. Split each table cell's sub-bites into separate
claims/PRs. New generic multi-group member/detail APIs are design candidates,
not approved APIs or prerequisites for every low-risk client improvement.

## Already Batched And Existing Work

- `clickhouse.py:4508` (`log_content_deliveries`) already does one dedupe SELECT
  and at most one multi-row INSERT. Do not rewrite its in-memory row loop.
- `resolve_pinned_ads` already fetches distinct ad targets together; B02 concerns
  the later media metadata pass, not ad-document loading.
- Group directory/list/managed-list member counts already use
  `_get_group_member_counts`. Their row mapping is not N database calls.
- Presigned URL generation in media resolution is offline signing, not one S3
  HTTP request per signature. Client read-URL refresh is a separate HTTP cost.
- Import thumbnail fetching already has bounded eight-worker concurrency.
  Blob bytes still require per-object work; start with DB metadata/write batching.
- Existing `paint-on-read` lane owns Following, Shorts and GroupDetail first-paint
  tasks. Link C09/C14 instead of cloning their acceptance work. People was marked
  complete, but the audited helper still awaits mutuals/face enrichment: C10a
  must reconcile source/test/intent before treating the tick as current evidence.
  C10a's repair target is directory-first progressive snapshots, independent face
  and graph work, no follow action before its state is known, and no late snapshot
  overwriting an action or another page. Hidden Groups work starts on first visit.
  Settled helper callers remain compatible; this does not batch mutual requests.
- Messages paint-on-read work moved previews and parallelized inner fanout; it
  did not eliminate per-conversation membership/identity requests. C12 is request
  reduction, not a claim that the prior work never happened.
- `global-search.md` preserves independent category loading; C05 shares only the
  equivalent underlying read. Existing shared face resolver remains canonical.
- Full E3, the public-node evaluation-flag guard, CDN/HLS offload and acting-
  identity connected revocation acceptance remain their existing lane items.
  Batching does not complete any of those gates or justify new performance claims.

## Execution Order

1. Backend: B01a -> B01b; B02a -> B02b; B03a -> B03b (B02 dependency).
   B01c/B06 follow verified policy equivalence, not merely faster benchmark output.
2. Identity: C01a -> C01b; C02a can reuse C01; C03 -> C02c. These improve the
   current feature without introducing permanent authorization caches.
3. Independent client bites: C05, C06a, C08a, C11a; then comments C04, profiles
   C07, people C10 and messages C12. Serialize shared data/face edits.
4. Maintenance/background: B04, B05, B07, B08, B09, C13/C14. Prioritize further using
   actual request traces rather than the aesthetic dislike of a loop.

Directory ownership overlaps existing lanes: reserve exact functions/files before
starting; no two agents edit `clickhouse.py`, shared face, or social data seams
concurrently. A test proving lower call counts is not evidence of lower production
latency. Keep both measurements when claiming the result.
