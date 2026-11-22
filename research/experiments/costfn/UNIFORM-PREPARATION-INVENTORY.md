# Uniform preparation: pin consumers and the bounded-input fork

**Workstream B successor:** [PIN-SELECT-MATERIALIZE.md](PIN-SELECT-MATERIALIZE.md)
now implements skinny complete-candidate winner resolution followed by exact
survivor body materialization. The inventory below remains the original banked
lookup/investigation; its NOT IMPLEMENTED/row-first statements are historical,
not current source or the operator's subsequent B→merge→run directive. No
native performance verdict is inferred from the source change.

**D124 amendment note:** this inventory records the banked pre-amendment lookup.
The separate Workstream A intentionally changes only duplicate handling:
agreeing full creative identities coalesce, distinct targets refuse, and author
wins among agreeing placements. References below to any-second-live-pin refusal
describe the banked implementation, not the amended target. Malformed/placement-
unauthorized pins and existing SQL eligibility exclusions retain their behavior.
The page-limit counterexample now uses distinct conflicting ads; count>1 alone
is no longer a duplicate refusal. Workstream B must return complete pin IDs from
skinny selection, then derive full ad identities/apply D124 after body validation;
the separate creative fetch remains unchanged. No body-free ad-identity claim,
uniform reorder, cache or native result is introduced by the amendment.

Source-only inventory,22 November2026. The operator's select-then-materialize
block starts with this inventory before changing any statement. No reorder,
cache, native measurement or new layout is implemented here. Uniform measurement
remains behind the row-model run and needs its own fresh admission.

## What the expensive statement actually does

SHA256`cf9889ddb8aa6dd88be5a74d2a3f8e8e51b1f1b1dd4ec6895d3c97179a2fb59e`
is **canonical billboard-pin discovery for an already-selected page**, not the
feed-page selector. Source: `engagement_billboard_reads.pin_sql()`, called by
`attach()`. Both attempt6/7 preserved SQL archives regenerate the exact4,761-byte
captured text from `pin_sql(measured['rows'])` after ClickHouse SQL rendering.
The same exact text is in `fixtures/delivery-dedup-audit.json` under that digest.

Both measured pages contain21 distinct full post identities. These are exactly
the `(author_key,ref_value)` keys in the statement. In each captured measured
sequence, this is statement45 of70, after candidate selection, main canonical
resolution, delivery deduplication and other preparation. Membership support
and the canonical creative fetch follow it. There is no final ORDER BY/LIMIT
that selects or ranks a feed page.

```sql
SELECT author_key,doc_id,ref_value,body
FROM (
  SELECT *,row_number() OVER (
    PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC
  ) AS rn
  FROM engagement_documents
  WHERE (author_key,doc_id) IN (
    SELECT author_key,doc_id FROM pairs_refs
    WHERE ref_id IN (<already-selected page doc_ids>) AND role='root'
  )
)
WHERE rn=1 AND deleted=0 AND collection_name='placements'
  AND (author_key,ref_value) IN (<already-selected full post identities>)
  AND JSONExtractString(body,'post_author')=author_key
```

The window resolves a current canonical pin version, with deletion winning
timestamp ties. Its ordering does not order the feed. The outer service/root/
body filters follow winner resolution; pushing them before the window could
resurrect an older pin that moved, changed service or was deleted.

## Captured cost and provenance

| Measured captured scope | Attempt6 | Attempt7 |
|---|---:|---:|
| Whole uniform bytes |10,666,667,270|10,303,735,551|
| Preparation-stage bytes |10,567,452,419|10,204,509,664|
| Pin statement bytes |10,543,615,726|10,180,673,037|
| Pin statement native rows |82,988,650|83,034,450|
| Pin statement native ms |3,872|5,439|
| Whole bytes minus this statement |123,051,544|123,062,514|

The subtraction is a diagnostic remainder, not a replacement-cost forecast or
additive per-table attribution. It still exceeds25MB. Keep auxiliary work
separate and retain the replacement statements' full actuals in any future run.

Unchanged sources:
- Attempt6: `evidence/all-fixes-batched-20261120/native-query-costs.csv`, measured
  query`bf50e29b-fef9-4d33-86d7-ddd8f14de5ad`.
- Attempt7: `evidence/all-fixes-reconciled-20261122/native-query-costs.csv`, measured
  query`3c3a0016-ad78-4d43-9630-5d26cb6ed1f1`.
- Private archives: the final attempt6 checkpoint ending`20261120T235929Z`
  and attempt7 checkpoint ending`20261122T052113Z`, named in their original
  evidence reports. Only local archive/CSV reads and SQL construction/parsing
  were used for this inventory.

## All consumers of the pin output

At the research ad adapter -> ordinary query-handler boundary,
`engagement_composition_api.py` supplies `engagement_billboard_reads.attach` for
`ch.attach_pinned_ads`; node attachments are not picked again on read. The
ordinary handler's `_prepare_rows` first receives and canonically rebinds page
rows, then calls ad attachment. Production API code remains read-only.

| Value | Consumer and role |
|---|---|
| Incoming page `author_key,doc_id` | `pin_sql()` deduplicates/sorts full post keys, proposes roots by doc_id and checks exact full `(author_key,ref_value)` membership. |
| Other page columns and row order | `attach()` deep-copies every incoming row in its original order, replacing old `ad`/`node_ad` projections. It does not filter/rank page posts. |
| Pin `author_key` | First component of the post key; checked against `body.post_author` and author-placement target ownership. |
| Pin `ref_value` | Second component of the full post key; used to find the attachment for each incoming post. |
| Pin `doc_id` | Projected but not consumed by `attach()`; it participates in full canonical history identity/window resolution. |
| Pin `body` | Parsed to validate post author, placement kind and full creative target, then populate a full-post-key placement map. |
| Derived `wanted` target identities | Current readable `posts` groups plus the original compiler/current canonical head lookup fetch exact creative author/doc_id pairs; unexpected/duplicate identities refuse. |
| Derived placement map | Visible creative becomes `ad` for author placement or `node_ad` for node placement. Missing/unreadable creative leaves the post without that attachment. |
| Attached page | Existing media/face preparation and HTTP response; existing complete-response and immutable billboard-identity oracles remain the parity gate. |

The following captured statements have digests
`e73630c647498afe9849a46d90ca9ea92fb1b318ff14d935d842eba007a27e11`
(membership/readable-group support) and
`5dfb76d3cd0c278f1d86faab60895877fe8f07f2fead64e80c4f7d7c41164a29`
(canonical creative fetch). The latter's literal targets depend on pin bodies.
They must remain unchanged when preserving the exact selected pin interpretation.

Pin output does not feed delivery deduplication, page candidate selection,
main post ranking, tallies, aggregate metrics or membership authority. Those
have separate sources/accounting; several execute before the pin read.

## Every body-derived input and refusal

1. **`post_author`:** SQL requires JSONExtractString(body,'post_author') equal
   to the pin author; Python checks the same assertion. Removing the SQL
   condition can turn omission into a request failure, not an equivalent answer.
2. **`placement`:** Python requires exactly`author` or`node`; this chooses
   `ad` versus`node_ad`. Other values refuse.
3. **`target_author`:** must be a nonempty string; it is part of the exact
   creative identity. Author placement additionally requires target author equal
   to the pin/post author.
4. **`target_id`:** must be a nonempty string and identifies the creative doc.
   A generic pairs target edge does not preserve the original field name or
   associate its value with the target author.

In the banked pre-D124 implementation, two live pins for one full post key refuse
even for the same creative. Under D124 only distinct full creative targets
conflict; a LIMIT can still hide that conflict and change semantics. These are pin
selection/validation inputs, not body fields that rank/filter the feed page.
Creative-body content is a separate current fetch; no new active-status filter
is invented. Current version/tombstone, service and root checks must also remain.

## Why the existing satellites cannot supply the requested winner selector

`pairs_refs` has`doc_id,ref_id,author_key,role`, sorted by`ref_id,doc_id`, and
retains historical edges from all services. It has no current service/version/
deletion, post-author assertion, placement kind or full creative-target identity.
Its target role combines parent_id/target_id/ad_id/refs, losing field provenance.
Tallies and event aggregates provide counts, not the missing pin attributes.
The existing strings/timestamps metadata is built from the original documents
snapshot; newly constructed pins live in the disposable engagement_documents
copy. It is not an already-built, verified pin index.

An indistinguishability counterexample is sufficient: keep every pair edge,
identity, tally and aggregate unchanged, but change only a pin's post_author.
Canonical SQL now omits it. Changing only placement/target_author instead can
change attachment kind, creative identity or refusal. A selector over unchanged
satellite inputs cannot preserve both outputs.

For page identities P, let C(P) contain every full document identity with any
historical root edge to a selected post ID. Current materialization's logical
input is`sum(history_depth(k) for k in C(P))`, not page size times pin depth.
C(P) includes arbitrary reactions/comments/reposts/other-service or stale-root
references. Adding the known author constraint can reduce candidates but does
not prove a page-sized bound. Querying every candidate in chunks bounds one
statement, not total work or a two-statement page-sized contract.

The banked setup contains32 pins for42 posts; the uniform page intersects15
pins (six author/nine node), naming11 creatives. Those are fixture observations,
not a general bound. Deriving fixture UUIDs or consulting setup JSON to skip
canonical discovery would hide the issue rather than implement the query.

## Explicit fork and status

**Inventory complete; uniform reorder NOT IMPLEMENTED.** Do not rewrite the
feed ranker or add LIMIT page_size to this pin query. The required fork is:

- A separately named/gated typed pin-selection model carrying the missing
  canonical/body inputs and complete candidate coverage; or
- A proved reduced-input canonical materialization path with explicit bounds,
  continuation/exhaustion semantics, all body/refusal checks and every batch
  cost retained. No bound is asserted before that proof.

Either branch must retain full authors, latest versions/tombstones/root/service
semantics, exact creative authorization, duplicate/malformed-pin refusal,
original response order and complete parity. Only then can two named replacement
statements and old-digest-absence controls be added truthfully. No caching layer,
paired-cell change, audit/oracle/budget change, production change or native run.
Future uniform measurements remain after the row-model run, reported against
attempt7's10,303,735,551 bytes whether or not the budget expectation holds.
