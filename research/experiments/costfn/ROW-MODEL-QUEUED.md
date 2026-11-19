# The row model — a document is a set of rows

Jacob Hoffman, 19 November 2026. The MEASURED CELL queues behind all-fixes
banking. Its SOURCE WORK DOES NOT WAIT. Jacob subsequently clarified: “the row
model work is necessary” and “no point in running lease without row model
work.” Prepare both source implementations before any spending. Preserve the
measurement order rather than running an incomplete intermediate design.
No row-model native execution or fresh lease has started.

## Current implementation boundary — do not confuse legacy with the target

The destination is the maximal replacement: typed rows and pointers, NOT a
permanent JSON-plus-index hybrid. Old production code and canonical research
JSON remaining in this branch do not reverse that decision. D115–D120 and
`knowledge-base/web10-v3/db/design-revolution.md` record the direction. Nothing
here claims that unmeasured source prototypes have completed a production cutover.

Source modules now implement:

- `row_model.py`: full-key identities, versioned pointer snapshots, immutable
  shareable text/integer/float/timestamp/Boolean/null/container values, and
  references addressing document identity rows. Nested objects/arrays are rows,
  not serialized payloads. Every served value is reconstructed from those rows.
- `row_model_ingest.py`: canonical JSON parsing ONLY at ingest, deletion-winning
  source ties and refusal of conflicting live ties. Metadata timestamps are
  typed at ingest, not cast from strings during a read.
- `row_model_sql.py` / `row_model_store.py`: typed tables, row-ID/key seeks,
  batched immutable-value reuse, complete-version publication after readback,
  full and displayed-key assembly. No JSON storage/extraction in the treatment.
- `row_model_build.py`: full-identity source pagination, complete histories and
  strict canonical verification of indexed legacy reference-owner hints. Missing
  or ambiguous legacy targets refuse; edges never silently become text.
- `row_model_fence.py` / `row_model_cell.py`: exact-domain/source/part fences,
  independent canonical key/type checks, all-fixes-banking barrier and separately
  accounted canonical-versus-row assembly stages. These are source primitives;
  the actual native action-provider/connected-cell integration is still OPEN.

**Snapshot consistency choice:** each committed experimental version contains a
complete pointer set, with explicit tombstones for removed keys. A skinny header
binds its count/digest. Never merge keys from different versions or publish a
partial build. This is NOT a live-write concurrency/transaction claim. Selected
key reads require whole-model parity and unchanged frozen native table parts;
full reads also verify the complete pointer manifest and immutable value IDs.

The cell's typed layouts answer row-ID assembly seeks; do not infer numeric-
range/text-prefix query-planner performance from that test. No new `documents`
projection is introduced. Full-scale native type/driver/layout/assembly proof,
connected harness integration and eventual JSON read-path retirement remain OPEN.

## The goal

“Docs are nodes, refs are edges.” “Just store each of these as a row in
ClickHouse, no JSON.” “A doc is multiple rows of pointers.”

The uniform rule is the attraction. The experiment must establish its assembly
economics, not declare victory because a row happens to be skinny.

## Storage rules

- Storage contains only skinny typed rows. **No JSON is stored.** JSON is the
  API wire format: parse once at ingest; reassemble at the output boundary.
  Reads never parse JSON, extract paths or cast strings to use values.
- A document is a set of pointers `(doc_id, key, type, value_row_id)`. `key`
  is its path, for example `post.text_in_post`; `type` names the value table.
  Key/type are dictionary-coded DATA. Any number of pointers is permitted,
  including zero beyond identity. Likes, follows and pins are pointer bags
  whose meaning is their edges.
- Values are rows in per-type satellites: text, integers, floats, timestamps,
  and the other major types. Tables are named after types; semantics remain
  data (D60). Type layouts answer their own questions: numeric ranges, text
  prefixes, edge traversal.
- Values have independent row IDs, are immutable, and may be shared across
  pointers and documents. Store a shared value once. An edit writes a new
  value, never mutates the existing row.
- **Versioning lives on pointers.** Each carries its document version. For
  each key, select the winning pointer at the document's current version;
  deletion is a pointer tombstone. This is the consistency core: the intended
  model has no fat canonical fallback. Pointer winner discipline must be exact.
- Edges are pointers with documents as their value table. The all-fixes refs
  satellite is the document-reference special case. Existing counters
  (`counting_numbers`) and events (`content_events`) remain rows, unchanged.
- Assemble winners only. Candidate reads seek only displayed keys as needed;
  assemble in full only for the page's ~21 winners or when opened/served.

## What is being tested

The measured wins so far came from QUERYABLE values being rows: things sought,
filtered, sorted, counted or traversed must not be trapped inside blobs. Pure
payload text does not gain a claimed speedup from decomposition. It gains
uniformity. Build the TRUE maximal version, including payload text in the text
table, and test whether those seeks make row assembly the same cost class as
whole-document reads. Do not quietly test the cheaper refinement instead.

## The separately admitted cell

Build the post-family pointers and required typed tables on the realism store,
text at minimum and numbers wherever post keys carry them. Canonical JSON
documents REMAIN throughout as build source, independent parity oracle and
fallback. This experiment tests replacement; it deletes nothing.

Verify KEY-FOR-KEY before measuring: every ordinary K20/paired page post, the
fat post, and a deterministic store-wide post sample. Include edits/winner
pointers, deletions/tombstones, shared values and zero-payload documents. Any
mismatch stops the cell.

Measure two assembly stages, preserving the programme's accounting scope:

1. Feed assembly: pointer + value reads for uniform K20/paired displayed keys,
   ON TOP OF the banked all-fixes composition, compared with the corresponding
   document reads that assembly would replace.
2. Post-open assembly: complete row reconstruction for page posts and the fat
   post, compared with canonical reads.

Report per-stage decomposition. Assembly is its OWN stage, never costs smeared
into another stage. Exact parity plus same-cost-class assembly proves the
generalization only at PAGE SCALE. Parity with order-of-magnitude more costly
assembly kills the maximal version and banks the refinement: queryable values
as rows, payload as document content. Either is a result; receipts decide.

Not admitted: other document families, orphan-value garbage collection beyond
naming the refcount question, production, §8, or changing the preceding run.
All banked results and failures remain untouched.

Engine 26.10.4.207; envelope 32/28/22GiB; approved Intel substitution if AMD is
unavailable in nyc3. DigitalOcean only, never local engine execution. No row
stops; 600s per statement; native-completion polling. Agent ~300s supervision
and self-kill timers, NO guardian. Proportionality applies. Preserve every
iteration and receipt every claim. Host/window are UNBOUND. Both implementations
must be source-prepared before spending; preceding all-fixes native completion
remains the row cell's measured prerequisite. No automatic lease launch follows
from source tests passing.
