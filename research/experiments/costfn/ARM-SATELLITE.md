# Satellite arm: pull first

Jacob's amended 15 November 2026 directive governs this additive arm.
The goal is a complete Following response without repeatedly deriving shared
facts. Config P uses transpose slices, full-key canonical winner resolution,
and derived metadata/counts. There is **no written feed and no fanout**.
Config F is conditional on a parity-valid Config P cost failure; a correctness
failure or a stop-rule hit never authorizes it.

## Operator approval: 15 November 2026

Jacob explicitly approved both follow-up questions: rebuild from the existing
canonical tables (documents plus original attachments, grants/policies and
events), with scope-qualified exact DISTINCT/reader-policy counts; and one new
isolated 32-GiB DO host for at most four hours/$2 compute with independent cleanup.
Keep container/ClickHouse limits at 28/22 GiB and the read deadline at ten seconds.
The operational clock starts at this run's recorded admission, never extends
automatically, and never reuses the expired Arm T lease. Canonical records stay
in their existing tables. No written-feed/fanout implementation is approved
before Config P's gate. The conflicts below are historical findings resolved by
this approval; live setup, correctness and cost gates are not thereby passed.

## First receipt, before building

`arm_satellite.py inventory --out <fresh-path>` reads preserved Arm T receipts
and current source. It does not import the API, execute SQL, start Docker, or
contact a provider. Its output is a **retained-evidence inventory**, not a new
realism-store profile. Missing native attribution stays missing. In particular,
comments and views were not reached after reactions failed. Neither gets an
invented measurement.

The receipt includes the three native main stages, HTTP sequence outcomes,
preparation timings, an S/P/C decomposition, source hashes, an exhaustive Python
literal-location census for the audited files, and reviewed structural pins.
The census is a mechanical index, not a claim that every literal is a defect.
The reviewed findings distinguish fixture assumptions, safety pins and resource
bounds. Prior implementations remain intact as historical controls; RETIRED
means forbidden in the new design, not deleted from frozen evidence.

### Inventory decisions

| Work | Class | Treatment / reason |
|---|---|---|
| Group/time selection | S | Retain `doc_groups_t`; page-size-derived slices and continuation/refill, not fixed 22 |
| Standalone canonical verification | C | Fold live checks into winner resolution; no separate verification query/stage |
| Winner body/version/deletion | C | Current canonical full `(author_key, doc_id)` identity; never trust a copied body |
| Winner attachment/permission/policy | C | Live original link/grant/policy state; a pointer is not authority |
| Main and follow-up engagement counts | S | Build attachment-aware counts; reader scope must be represented exactly |
| Repost/ref metadata | S | Derived exact reference/identity index; resolve returned bodies canonically |
| Profile discovery | S | Derived author-to-profile identity index; resolve returned bodies canonically |
| Node-ad inventory | S | Shared derived inventory, including nonempty inventory and lifecycle changes |
| Ad selection/media issuance | C | Current eligibility/access/provenance; cache does not grant signing authority |
| View impressions/reach | S (exploration only) | Snapshot exploration; Phase 1.6 feed-treatment conflict remains OPEN |
| Discover/Recent/Trending inputs | S | Shared time/ranking layouts; personalization/policy still applies at serve time |
| Existing exact full-key reads | P | Keep only where actually bounded; physical native cost still needs proof |
| Authentication/app authority | C | Current credentials and app grants, never a stored access decision |

Everything marked S remains required. This preparation does not claim any new
satellite is built. Profile/ref/ad/view native substage timings are not separately
attributed by the retained main split, and shared surfaces have no new receipt.

## Contract conflicts found before engine work

0. **Views versus closed Phase 1.6.** `PROTOCOL.md` Phase 1.6 selected the
   readability point-seek repair, explicitly not `counting_numbers`, because
   delivery logging refreshes impressions and reach is distinct-reader state.
   `REALISM-RERUN-PLAN.md` names write-maintained counters as future production
   work, not proof that a snapshot can replace the approved treatment. View
   snapshots are exploratory only and require `--explore-view-snapshots`; the
   ordinary metadata build skips them. They cannot satisfy Config P acceptance
   or replace the Phase 1.6 treatment without a separately recorded decision,
   live delivery/repeat-reader parity, current document authorization and full
   response cost. The untreated profile continues to measure the original view
   path. No view-counter feed activation is approved by this exploration.
1. **Rebuild source.** `documents` has no attachment, membership or event history.
   `clickhouse-init/001-init-v3-schema.sql.template` defines these independently
   as `doc_groups`, `group_members`/`group_contracts`, policy tables, and
   `content_events`. Identical documents with different links produce different
   correct counts. A transpose cannot be rebuilt from documents alone. T5 needs
   Jacob's approval to mean *canonical tables alone*, with an explicit dependency
   manifest; no source table moves and no production migration are proposed.
2. **Count scope.** Existing `satellite.py` counts global live engagement docs by
   reference. It never reads `doc_groups`. The same target has zero in Following
   scope and nonzero in Discover scope. One unqualified `(doc_id, counter_name)`
   scalar cannot return both. Per-group totals cannot simply be summed either:
   the same engagement can occur in two groups, while the oracle uses DISTINCT.
   Reader-specific policy can change counts too. Approve a scope-qualified typed
   representation (semantics in data) and exact overlap/policy handling before
   building. Do not quietly activate the old global builder as T1.
   The old follow-up constructor also uses zero-based `numbers(n)` as the index
   to one-based `arrayElement(ids, number)`; this needs its own native control,
   not inheritance as supposedly proven realism tooling.
3. **Output multiplicity.** Production boundaries expose one row per readable
   attachment (`safe_query.py:173–180`). A pointer keyed only by doc_id cannot
   silently deduplicate that output. Config P must preserve oracle multiplicity,
   tie behavior and refill after denied/deleted winners.
4. **Operational admission.** The prior host 619371600 was absent in a read-only
   provider check at 11:24:40 UTC; its 05:17:51 UTC lease expired and cleanup was
   verified. No old lease is reused. A fresh bounded DO budget/lifetime and
   independent cleanup are needed before restore/profile/build. No paid action
   follows from running the inventory command.

## Hardcoding audit conclusions

- Fixed PAGE=21, LIMIT22/23, four named services, 1..1001 groups, timestamp-tie
  refusal, synthetic-identifier grammar, and byte-exact golden matching occur
  in Arm T. They are retained safety restrictions of that experiment, not a
  general feed implementation. Config P derives page bounds from its request
  and must refill rather than underfetch after live exclusions.
- Arm D additionally pins four joins/projections/gate segments and twelve main
  reader literals; its follow-up pins three reader literals and exactly one
  non-followers group, interpreted as Discover. The owner-path regex, synthetic
  group CASE, empty policy-table admission and assumed engagement attachment
  completeness are fixture restrictions, not general authorization mechanisms.
- The repaired hint constructor retains the four-boundary/golden pin and takes
  a precomputed exact group-author inventory. Correctly fail-closed, but still
  structurally pinned. No hints enter Config P.
- **Refute the literal empty-inventory-bypass claim:** `research_api.py:64–83`
  caches the result of a real first inventory read for 60 seconds, including a
  nonempty result. Arm T disables Arm D, so it does not install that cache.
  Empty-fixture coverage and an untreated realism preparation scan are real
  limitations, but they are not evidence of an unconditional `return []`.
- Production `_boundary_cte_sql` uses actual service/readable-group/member
  inputs, and `build_safe_query` takes `max_limit`; it has no fixed four-service
  or page-22 pin. Its broad historical scans are a cost issue. Standard SQL
  constants and denial predicates are not fixture-shaped candidate machinery.

## Gates and next execution

Current native receipts: all nine metadata build steps complete, transpose
92,200,600/92,200,600 with zero mismatches, five independent signed-multiset
checks PASS, and reaction-presence native T1 PASS. See
`evidence/arm-satellite-20261115/metadata-complete/`. The first full-API attempt
then stops during ordinary group discovery with HTTP500/native159, before any
feed warm-up. Its separate `full-api-setup-stop/` receipt is not T2 or performance
evidence. A local red-then-green timeout-scope repair preserves original setup
behavior while keeping marked feed reads at ten seconds; a repaired native
attempt and all downstream gates remain unestablished.

Serving integration uses an explicitly opted-in, research-only ASGI adapter.
The ordinary endpoint still authenticates, checks the app contract and resolves
current per-service grants before compilation. A current canonical-part
generation must match the built scopes. Pull/refill resolves winners through
the original full-identity document/link/policy windows, counts through exact
scope-qualified tables, and profiles through indexed identities with canonical
bodies. Live resolved rows are held only inside that request and consumed once
by its execution seam; they are never fabricated, saved body-cache rows or
observer/log payloads. Ordinary serialization, canonical preparation, media/ad
issuance and delivery accounting still run. Every measured native read has the
ten-second/22-GiB limit and10M-row stop; login/group discovery is setup, not a
hidden claimed feed sample. Unsupported predicates/grouping/ranking refuse.

Reaction presence is separately built and canonically checked so an unknown
reaction type can still produce the original zero-valued aggregate row. Node-ad
inventory pointers only narrow the original canonical history/eligibility read,
including cutoff ties. Views use the closed Phase1.6 exact-ID readability repair,
not snapshot counters; all live event counting/reach remains original.

The first full-API diagnostic uses an independent canonical-table-only prepared
reference (no transpose/strings/counter or treatment-result oracle). Its setup
reads may take900s under the same memory cap; serving still has ten seconds.
Compare complete render-ready main rows plus the unchanged independent
follow-up/delivery oracle, then report one excluded warm-up and three serial
observations. These are not formal fresh-restore trials, a population p95, a
T6 pass or fanout admission. Any HTTP/native/safety/parity failure stops the
remaining sequences. Preserve private reference bodies outside Git; retain
only content-free hashes/receipts publicly. All later gates remain explicit.

**Autonomous continuation,15 November:** Jacob asks to keep rolling through
the whole experiment, checking every300 seconds and advancing after each
successful step, involving him on failure. This does not waive parity, resource,
deadline or fanout gates. Independent full-multiset identity/profile/reference/
inventory/time comparisons run before serving activation. Complete-response T2
must pass before any performance claim; no idle build is called a performance
test. The original15:38:32UTC cleanup remains unchanged.

**Batched retry approval,15 November12:42UTC:** Jacob explicitly says
"great, batch and proceed please!" after the native241 STOP report. One
separate batched setup attempt may use the same host, unchanged memory limits,
original budget and15:38:32UTC deadline. Preserve the failed table and receipts;
new partial/final tables and a fresh output directory must not adopt old rows.
Partition both document and attachment histories by the same stable doc_id
hash before their version windows. All versions and authors sharing a doc_id
stay in one batch. Thus row multiplicity is preserved, and DISTINCT doc_id
sets are disjoint between batches: per-batch exact counts can be summed.
Never partition by group (overlap) or mutable body/ref/version fields.
Require every batch to finish, reject duplicate partial keys, consolidate once,
then compare independent canonical values. Native regression fixtures must
exercise zero/positive/shared attachments and changed/deleted histories before
full-store setup. Batch count is a physical setup parameter, not a page or
correctness pin. Setup cost stays separately recorded; no fanout, views
replacement, new host, limit increase or automatic lease extension follows.

The first count setup stopped with native241 at the server-total22GiB cap;
see `evidence/arm-satellite-20261115/counts-stopped/`. Main-scope comparisons
were zero-only; broader positive/shared parity and closing generation checks
were not reached. T1 is NOT_ESTABLISHED. Owned containers are stopped and no
treated feed, retry or fanout is admitted by this failure. Preserve the partial
build and require a separate admission/receipt for any repaired setup attempt.

Live Step0 is retained at `evidence/arm-satellite-20261115/untreated/`.
Main/reactions/comments fail with native159; the separate views call completes
in70.426s, but its original direct query has no explicit timeout and is not
ten-second-compliant budget evidence. These are untreated diagnostic probes,
not Config P trials. Actual post-gate groups differ between main and follow-ups.
The inventory was reported before scoped-count setup/T1 started; no satellite
feed adapter or view-counter treatment was activated by this receipt.

`arm_satellite.py gate <receipt>` evaluates only an explicit three-trial Config P
receipt. Every trial must contain complete-sequence samples with parity, latency
and **all** native stages. Missing/malformed evidence holds the gate; a mismatch
invalidates the arm; any single read above ten million rows stops it. Only then
are whole-response p95 and bytes compared to 500 ms / 25 MB. K1000 failure is
reported to Jacob, never automatic Config F admission. This evaluator authorizes
no resource creation or written-feed build; it records a gate decision only.

The bounded native count T1 passes in p2; receipts are in
`evidence/arm-satellite-20261115/counts-batched-p2/`. The actual scope is one
ordinary reader,26 stratified targets plus native history/multiplicity fixtures,
not exhaustive all-reader parity. Live untreated profiling is complete. Native
T2/T3/T5/T6/T8 and whole-response performance remain OPEN.
T4 is gated off. T7 waits for T2+T6. After source/scope/DO admission is resolved:
profile, report Step 0, build every S item with reconciliation/setup receipts,
run T1 before T2, then the lifecycle/rebuild/budget tests. Preserve baseline,
Arm D and Arm T evidence unchanged. No production, migration or paper work.

## Executing modules

- `arm_satellite_runtime.py` binds every operation to the new actual DO identity,
  original approval window, frozen restore and 28/22-GiB envelope. It writes an
  fsynced query-ID/source-hash ledger before execution. Setup has separate spill
  limits/timing; measured reads retain ten seconds and the ten-million-row stop.
- `arm_satellite_profile.py` calls each untreated shape once. Failed-main
  follow-ups use independently selected canonical IDs, explicitly labelled as
  separate stage probes, not a successful response sequence. It never injects
  those IDs/Discover into the main Following request.
  Its isolated, read-only observer records actual per-service readable groups
  after the real read gate. The counter builder consumes those exact scopes;
  it never assumes membership implies the same grants for every service.
- `arm_satellite_sql.py` stores `counting_numbers` by
  `(doc_id,counter_name,scope_key)`. The scope binds actual reader/service groups,
  source generation and recipe semantics. The application chooses its counter
  names, body reference fields, predicates and row/DISTINCT mode as data. Reads
  refuse unbuilt/stale scopes. No `numbers(n)` array-index construction remains.
- `arm_satellite_counts.py` builds requested scopes from the unmodified
  compiler's canonical boundaries, then compares an independent FINAL-table
  reference. The captured feed actually uses countIf/count row multiplicity,
  not DISTINCT; changing that would change the query. T1 separately constructs
  fifteen same-author outside-group likes/comments (expected zero), a
  cross-author shared attachment (row count two, DISTINCT one), ordinary/zero,
  high-engagement and longest-history-author strata. It does not activate a
  feed adapter. Materializing requested scopes is not an all-reader cache
  size, ongoing maintenance or scale claim.
- New typed satellites use a declared physical `index_granularity=64` to avoid
  paying 8,192-row marks for sparse point keys. This is a storage/read-amplification
  parameter, not a page bound or a correctness assumption. The original
  canonical tables and Arm T/D layouts/receipts are not reconfigured.
- `arm_satellite_metadata.py` builds the current transpose and generic `strings`
  identity/reference/inventory pointers and `timestamps` shared ordering layout.
  It accepts the explicit passing p2 receipt/table, refusing the failed default
  and changed canonical generations. Document identities are indexed by stable
  doc/service keys; profile pointers retain every current profile identity,
  never an assumed single profile per author. View snapshots remain opt-in
  exploration and are skipped for this setup. Bodies remain in documents. Native
  reconciliation, independent parity and live delivery maintenance must be
  receipted separately; a snapshot alone is not T2 completion.
- `arm_satellite_pull.py` implements request-sized merge/refill with a supplied
  complete ordering key and canonical winner resolver. More than one slice of
  denied/deleted pointers still fills correctly; shared attachment multiplicity
  survives. These are offline algorithm controls, not native T2/T8 receipts.
- `arm_satellite_batch.py`, `arm_satellite_batch_fixture.py` and
  `arm_satellite_batch_run.py` implement the separately approved p2 setup:
  disjoint stable document histories, native zero/positive/shared/edit/delete
  controls first, per-service/reference shared scans, exact consolidation and
  independent source-bound comparisons. The old partial table is never read or
  altered. p2 uses `counting_numbers_p2_parts`/`counting_numbers_p2`; a complete
  native T1 receipt is required before any downstream consumer may use them.

The fresh host is 619510510, admitted through 15 November 15:38:32 UTC at
$0.25/hour. Provider cleanup is independently scheduled on the Mac; a host
power-off timer fires two minutes earlier and a container-stop timer three
minutes earlier. Mac/network/provider failure can delay deletion (power-off
does not stop DO billing); these are monitored guards, not a provider-enforced
spending guarantee. Original source Volume is detached after verified copying.
Keep the schema-warning boot receipt, the initial missing-validation-path
attempts and interrupted copy separately; resumed files are reused only after
their full size/SHA matches. None is an experiment sample or a gate pass.
