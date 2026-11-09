# Shared typed indexes — future architecture and follow-up research

## Operator direction, 9 November 2026

> “put into the plan this stuff we just talked about? i think that is the
> future, tables for each data type kind of thing, where devs dont create
> indexes they use the indexes already there”

This is the **planned future architecture direction to design and validate**,
not a shipped capability, approved database migration or measured scaling claim.
The social app drives the read-performance requirements (D20); the node supplies
generic capabilities usable by notes, music, shops and other apps (D60).
Fast reads take priority over minimizing write work or storage duplication.

## Architecture target

Keep `documents` as the canonical JSON/metadata source. Maintain a fixed family
of shared, derived, typed access-path tables, conceptually:

| Shared family | Capability |
|---|---|
| Exact numeric values | Integer/decimal equality and ranges without lossy coercion |
| Dates/times | Explicitly typed temporal equality and ranges |
| Strings | Exact/lexical/prefix access as supported and measured |
| Presence/booleans | Existence and supported boolean predicates |
| Text/token access | Supported full-text matching |

These are logical families to evaluate, not a locked physical schema. Some may
share a table; others may need separate layouts. It is **not** one table per
app/field or necessarily one table per ClickHouse index algorithm. Min/max,
Bloom, sorting keys and text indexes are physical tools within the chosen
structures, with exact availability checked against the engine version.

An illustrative range entry is:

```text
service | path | type | typed_value | author_key | doc_id | version | element_identity
```

A layout beginning `(service, path, typed_value, author_key, doc_id)` can seek
selective value ranges. New app fields become rows in existing structures,
not repeated per-field DDL. This is not a promise that broad ranges, huge
intersections or authorization-sparse candidates remain cheap.

## Developer-facing contract

Developers describe data/query intent and query fields; **they do not create
physical indexes**, select ClickHouse granularity or provision per-app tables.
For example, a schema could request a decimal range field, an exact category
field and a text title field. This syntax is illustrative, not a new API.

Schema-guided extraction means only declared searchable paths need indexing;
automatically extracting every supported scalar is a separate policy option,
not a requirement to index all arbitrary JSON. The node routes supported values
to its existing shared capabilities. Neither a schema declaration nor an index
entry grants read authority or changes document ownership.

Reads use indexes to find/intersect candidates, retrieve current canonical
documents, apply current app/service/group/visibility gates and confirm final
predicates/order. Index rows point to documents, not the reverse; bodies are
normally fetched rather than reconstructed from index entries. Covering reads
need a separate correctness proof. Preserve the existing JSON round trip and
query/API compatibility unless an explicit protocol change is approved.

## Required correctness and recovery contract

- Exact large integers/decimals, mixed types, missing versus null, literal dotted
  keys/nested paths and same-array-element predicates need explicit semantics.
- Entries carry enough identity/version information to reject retired values,
  deletion/tombstone history and ambiguous candidates without returning private
  identifiers/counts. The planner must not resurrect older versions by pushing
  a mutable-value filter below canonical current-state resolution.
- **Missing entries cannot be repaired by rechecking hits.** Define coverage,
  readiness/watermarks, write acknowledgement, partial-write recovery, retries,
  new-path backfill, index rebuild and concurrent-update behavior. Do not assume
  atomic source/index transactions in ClickHouse. Exact reads need authoritative
  fallback until coverage is established, or a separately approved explicit
  search-lag contract—not silently incomplete “no results”.
- New raw index relations remain protected node infrastructure. Safe-query AST
  validation, internal aliases, cancellation, owned scratch state and resource
  budgets require separately reviewed integration; no caller raw-table access.
- A narrow index result must lead to a selective canonical lookup. Otherwise the
  current broad document windows simply move to a later stage. Verify actual
  primary-index/granule use and do not treat a final LIMIT as a scan bound.

## Phases and ownership

1. **IX1-A: architecture/semantics contract.** KB/research design only, with
   storage/security/compiler owners: typed families, path/schema intent, read
   completeness, write/recovery protocol, compatibility and rollback. No DDL.
2. **IX1-B: one-family isolated prototype.** A separately claimed native-test
   bite proves one selective range/equality path using synthetic data, including
   update/delete/backfill/partial-failure and denied-reader controls. No production
   table or index-all default; code/test trust-boundary bites stay ≤500 lines.
3. **IX1-C: planner/canonical integration.** Separately reviewed supported
   predicate extraction, bounded intersections, current authorized canonical
   retrieval and complete fallback. Raw index relations remain unreachable to
   user SQL. Unsupported queries keep an explicit correct existing path.
4. **IX1-D: multi-app and scale validation.** Social plus unrelated app schemas;
   fixed-selectivity dataset growth and separate broad/intersection/denied/
   high-overlap cases. Measure native parts/granules/rows/bytes, p50/p95/p99 and
   throughput at justified sample sizes, memory/concurrency and live foreground
   cost during writes/backfills/merges. Storage/write overhead is accepted when
   it buys reads, but still recorded and bounded operationally.
5. **PAPER-INDEX: follow-up paper evidence/design.** After a working contract and
   credible prototype, do a fresh related-work/novelty review and preregister
   matched baselines, semantics and failure/negative results. Typed value/EAV/
   inverted indexing is established work; any contribution must be demonstrated
   in the permission-aware developer-transparent integration and its evaluation,
   not asserted from the diagram. A new manuscript/venue/submission is not started
   by this planning item.

## Relationship to the immediate work and current paper

**Creation-date access for one-month normal Discover remains first.** Its
predicate/index/projection and recent/old mixture can be investigated without
rebuilding the entire platform. Keep tunable recent ranking and explicit
potentially slower Advanced access to older content; see
`knowledge-base/strategy/advanced-search-feed-budgets.md`.

The existing January K=1,000 experiment remains a failed heavy-follow preflight,
not a typical-user average and not a filtered-study success. Date-bounded or
K=20 data require new labelled input/workload identities and correctness gates;
do not overwrite frozen receipts or make them empty to claim success. The
creation-date hypothesis is not yet a measured fix. Current manuscript numbers
and contributions remain unchanged; the shared-index architecture/evaluation is
a **follow-up research/paper track**, not a retroactive description of the node.

No architecture deployment, schema/indexer/planner rewrite, engine switch,
read/write split, large generation/publication, cloud purchase or new paper
submission is authorized by this plan. Each implementation/execution phase
needs its own scoped approval, review, receipts and normal green checks.
