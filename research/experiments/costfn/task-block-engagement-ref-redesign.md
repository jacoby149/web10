# Engagement reads: one segment per root document

Jacob Hoffman's17 November2026 three-part directive governs this isolated
experiment. It supersedes the earlier P1/views exclusions for this task only.
The previous F cost FAIL and all stopped attempts remain unchanged.

## Goal and scope

Fetch a post's document-stored engagement by root reference, and count its
events without walking its raw event history on every request. Ordinary API,
SDK, social, deployment and frozen input files remain read-only. This is not a
production migration or full-arm acceptance.

1. **Projection only, old semantics first.** Add exactly one `ref_sorted`
   projection on the disposable documents table, ordered by `(ref_value,
   collection_name,created_at,doc_id,updated_at)`. Include skinny identity,
   history and reaction-type fields, not the JSON body. Report views UNAFFECTED.
   No `comment_post_id` projection or second projection.
2. **Uniform root references.** Build a separate disposable transformed copy:
   comment refs name the root; `parent_id` in the body preserves reply edges;
   comment reactions have root refs and body `target_id`; reposts use ref for
   the original. Reject missing/ambiguous roots and conflicting metadata, retain
   all versions/tombstones/full author keys. Thread assembly is in memory from
   the fetched segment. `post_id`/`repost_of` are migration inputs, not new read
   keys. Validate old/new logical semantics independently, including nonempty
   reply/comment-reaction/repost fixtures absent from the frozen corpus.
3. **Views diagnostic, then treatment.** Preserve exact SQL/native rows/bytes
   beside the page's true event count. An IN membership filter cannot multiply
   event rows; distinguish raw counting, index-granule overread and an actual
   multiplying join. If raw counting is confirmed, seed once while writes are
   stopped and maintain `content_events_aggregated` through an insert materialized
   view over `content_events` only. Keep service/event/day keys, exact distinct
   reader states (merge, never sum reach), and current attachment authorization
   at read time. Daily buckets support the feed's lifetime read, not arbitrary
   subday windows. TTL/deletion reconciliation is a separate production gate:
   insert aggregation does not subtract expired raw events.

Every measured step needs independent parity and native plan/query receipts;
projection DDL alone is not evidence the optimizer used it. Mixed resolution/
counts stay mixed until decomposed. Preparation, the unclassified stage block,
population, populated reads, R+W, §8 and production are excluded.

## Execution discipline

Same frozen `2d6bbc4d…`, ClickHouse24.8.14.39,32/28/22GiB envelope, ten-second
measured reads and >10M-row stop; parity or invalid. Four hours/$2 per fresh DO
lease inside the existing$20 programme ceiling. Bind actual host/deadline before
engine work. Agent checks roughly every300 seconds and existing host self-kill
timers only; no guardian. Preserve errors, source/SQL hashes and private raw
receipts before owned cleanup. Routine source-bound repairs are authorized;
never erase or relabel an earlier failure. No production or local Docker/CH.

## Status

IN PROGRESS on fresh DO620273404,17 November12:38:50→16:38:50UTC. The same11
frozen archive objects verify by exact size/hash. Seventeen new no-engine controls
pass alongside the214 retained F/satellite controls; focused Ruff passes.

Tiny native rehearsal attempt5 PASSES on24.8.14.39: actual `ref_sorted` routing
reads1/65 granules; independent recursive semantics match the SQL migration;
root-segment replies/comment reactions/reposts and tombstone denial pass; exact
inverse multiset validation rejects an injected duplicate; cross-day/insert-block
reach, new insert capture and current attachment scope match raw events. Tiny
timings/bytes are NOT full-data or feed-performance results.

The earlier four rehearsals remain failures:344 requires projection rebuild mode
on ReplacingMergeTree; STOP MERGES also blocks materialization mutations; a
single-granule fixture cannot prove projection routing (117);24.8 JSONMergePatch
retains null-valued members instead of removing retired keys. Repair the SQL,
not the independent expected semantics. The successful source explicitly filters
retired top-level keys while retaining other raw JSON values. Source-bound
directories/tracebacks/SQL/stderr stay private and checkpointed off-host.

Full frozen-data stage execution is next; no full-data parity/performance
improvement or complete-response PASS is claimed. The24.8.14.39 pin keeps engine
effects out of the existing comparison; it is not a recommendation to keep an
old engine for deployment. A newer-engine comparison should rerun baseline and
treatment on the same newer build, separately labelled. In particular, official
ClickHouse docs describe25.5+ `_part_offset` projections, relevant to skinny
reference indexes: <https://clickhouse.com/docs/data-modeling/projections>.
