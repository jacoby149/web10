# Design outcomes — what the design now is, as changed by the measurements

**Status:** record, dated 25 November 2026. This document is a **record, not
an authorization**: it grants no admission, no run, and no production change.
It banks in one place the design outcomes the experiment programme
established — the changes that currently live scattered across results
documents, findings documents, decision records and contracts. Each entry
states the change in the form: what the design was, what replaced it, the
evidence (pull request and receipt), and the entry's status — one of
**measured** (a banked receipt establishes it), **settled design** (decided,
with the deciding evidence named, implementation in the implementation
phase), or **rejected** (measured and refused, with the refusal rule named).

Nothing in this document restates a figure in a results document or alters
one: the record cites receipts. Where an entry's status is settled design
rather than measured, the entry says so in its first sentence — nothing in
this document may read as a production implementation claim.

## 1. The canonical store

**Status: measured.** One pooled `documents` table holds every document
whole, body included, and is the sole source of truth. Its engine is
`ReplacingMergeTree` ordered so that merges collapse superseded versions by
`updated_at`; a read resolves the current version, applies tombstones and
policy, and fetches the body belonging to that version.
**Was:** one collection per user (v2), and any design in which a satellite
could decide visibility.
**Evidence:** the store of every banked run; the post-merge steady state is
the measured regime (the steady-state precondition of PR #1638).

## 2. Skinny satellite tables are the platform's secondary indexes

**Status: measured.** ClickHouse gives a table one physical sort order, so
each declared access receives its own sorted structure beside the canonical
store: a generic typed table named after its type, never after an
application concept (D60). The satellites: fanout (recipient pointers),
counting_numbers (maintained tallies), billboard_pin_refs (pin placements by
post key), the refs pairs satellite `(doc_id, ref_id)` of D116, and the
attachment-history satellite of the hybrid arm.
**Was:** broad accesses paid shared-layout scan costs on the canonical
ordering — the 52 GB uniform read and the 82.9-million-row pin lookup are
that regime's receipts.
**Evidence:** each satellite carries its own receipt — fanout, the banked P
stage table (PR #1572); counting_numbers (PR #1591); billboard_pin_refs
(PR #1612 / PR #1618); the attachment-history satellite (PR #1635); the D116
refs pairs satellite per its design record (`web10-v3/db/design-revolution.md`,
D116 DECIDED).

## 3. Aggregates are computed at write time, never at read time (D114)

**Status: measured**, with the recorded caveat that the tally run changed
computation time and storage location together. An aggregation is a source,
a grouping, and a formula over one source row's keys, with a reducer from a
bounded menu, maintained when the source changes. Likes and counts live as
finished values in counting_numbers; view counts live in insert-maintained
aggregate tables over content_events at day grain and all-time grain.
**Was:** read-time counting — one page's comment count read 247,081,302 rows.
**Evidence:** PR #1591, PR #1602–#1604.

## 4. Fanout is written on every publish (D113)

**Status: settled design**, with stage-size receipts; implementation is in
the implementation phase. The group contract appends recipient pointers to
fanout for every group publish; below the node-constant cutoff of 2,000
members the read path consumes the pointers, and at or above the cutoff the
read path seeks in group and time order. Writing is unconditional; reading
the fanout is optional for an application.
**Was:** group delivery was planned, not implemented; group reads resolved
membership live.
**Evidence:** the candidate stage measured at about 2% of a complete
response — the banked P stage table, candidates 11,635,214 bytes against the
P complete ~484 MB (PR #1572, `ARM-F-DESIGN-CLOSURE.md`).

## 5. The hybrid read path

**Status: measured** for the attachment-history arm (PR #1635 step 3:
captured logical bytes −70.6% at exact parity, wall time worse, stated in
the same record); **settled design** as the general read path, with
implementation in the implementation phase. A read verifies and ranks over
skinny rows — existence, deletion, governing ref, group membership, current
version, tallies, the candidate window — and fetches whole documents last,
by exact identifier at the confirmed version, applying no filter at the
fetch. Payload remains document content; a value a query filters, sorts, or
joins on lives in a row. A value above a size threshold is stored as a
pointer to the object tier, whose endpoint is per-node configuration.
**Was:** broad accesses scanned the canonical layout for verification and
ranking, paying the attachment-history granule selection (323+54 granules
against 21+1 on the skinny table).
**Evidence:** `HYBRID-K20-FINDINGS.md` and its two banked runs.

## 6. The write discipline for copied values (commit point)

**Status: settled design** (operator ruling, 23 November 2026);
implementation is in the implementation phase. A pointer can only be present
or absent; a copied value can be wrong, so publishing a document whose
queryable values live in rows follows the commit-point discipline: the value
rows and the payload document are written first, a confirmed receipt is
collected for every statement, and the version row is inserted last, only on
total success — the version insert is the single commit point. The guarantee
is atomic visibility, not atomic writes. Conditions: synchronous
acknowledged inserts, one writer per document, single-node deployment. A
version-agreement census — each current version's row set checked against the
version's declared count and digest — detects and repairs any write that
slipped. The fault cases that exercise it passed on isolated fixtures; live
concurrent publication is unproven and the census is not yet built.
**Was:** publication had no commit point; value rows and payload could be
partially visible.
**Evidence:** PR #1635 fault lab.

## 7. The rebuild discipline

**Status: settled design**; implementation is in the implementation phase.
The canonical store is the only table whose rows are originals. Every
satellite is derived: a program takes documents as its sole input and
produces the satellite's rows; deleting a satellite loses no information;
repair is a rerun of the derivation, never an edit toward a guessed state.
Satellites propose; canonical decides.
**Was:** satellite provenance was unguarded; a lost satellite was an
incident, not a rerun.
**Evidence:** the rebuild case passed in the fault lab (PR #1635).

## 8. Rejected: decomposing whole documents into typed rows (D117)

**Status: rejected, measured.** The maximal row model — every key-value pair
a row over per-type value tables, no document body in storage — returned
exact parity on all six assembly comparisons and was rejected under the rule
committed before measuring: a factor of ten or more on any cost axis refuses
the layout. Assembly read 30 to 220 times the rows and bytes. The retained
refinement is entry 5: store queryable values as rows, keep payload as
document content.
**Evidence:** PR #1621 (`evidence/row-model-4096-20261123/RESULTS.md`).

## 9. Rejected: pruning the body column as the fix for a broad access

**Status: rejected, measured.** Deferring post and profile bodies until keys
and versions were selected left the complete-read cost unchanged
(620,851,039 to 622,458,125 logical bytes), because the cost sat in the
attachment-history access, not the body. A broad access is fixed by giving
the access its own sorted satellite (entry 5), not by narrowing the columns
a scan reads.
**Evidence:** PR #1635 step 2 (`evidence/k20-projected-20261125/RESULTS.md`).

## 10. The event layout

**Status: measured.** Views are platform-recorded events in content_events,
never documents. The table is partitioned and ordered by event day; the
day-sliced seed reconciled exactly 1,600,000,000 events at 1.0× native row
amplification, where the previous document-led layout never completed.
**Was:** events lived in a document-led layout whose all-time derivation
stopped at the memory cap.
**Evidence:** PR #1602, PR #1603.

## 11. The advertising model (D115)

**Status: measured**, with the recorded caveat that 32 rows is the
fixture's entire pin population. Advertisements are static documents;
placements are pin documents; the author's own advertisement always wins;
node advertisements fill unpinned posts by a ratio roll at post time and are
pinned permanently at that moment. Reads never consult the catalog. The pin
lookup is served by billboard_pin_refs under its own sort key: 82,897,093
rows and 3,385 ms became 32 rows and 6 ms.
**Was:** reads consulted the ad inventory at read time, paying the full
attachment-history scan for the lookup.
**Evidence:** PR #1612, PR #1618.

## 12. Admission by declaration

**Status: settled design** — the governing rule the satellite entries
implement. A query is admissible only if every access it makes is declared
and backed by a physical layout; an undeclared access is refused with the
missing declaration named. A declaration describes the access; it does not
grant permission, and a layout never replaces the canonical authority check.
The constraint governs the shared engine, never ownership: documents export
whole, in their exported form (entry 14), and on the owner's own machine any
ClickHouse is still any ClickHouse.
**Was:** the engine ran any authorized SQL an app sent; cost was a property
of the question, not of the node — the 52 GB uniform read, the 247-million-
row count and the 82.9-million-row pin lookup were each an "any ClickHouse"
query, none malicious or unusual.

## 13. The two feed surfaces

**Status: settled design** (19–21 November 2026), consistent with the fanout
stage receipts. Discover is one shared bounded candidate window per node,
computed once and re-sorted at read by the reader's dial settings; the dials
sort only that window, and there is no all-time ranking lane. Following is
per-reader and computed live.
**Was:** discovery and following were shaped per app; the node had no shared
bounded candidate window.
**Evidence:** the directory-mixer contract
(`web10-v3/social/directory-mixer.md`) and the fanout stage receipts.

## 14. Storage is not export (D118)

**Status: settled design** (D118). The stored form and the exported form are
different things; export is a transformation performed at the API -> app
boundary, assembling documents from the store and serializing them. The wire
format does not change.
**Was:** the stored form doubled as the wire form; the store's shape
constrained the export's shape.

## 15. The cleanup regime

**Status: settled design** (operator direction, 25 November 2026);
implementation is in the implementation phase. History — superseded
versions, tombstones, raw multiplicity — is residue of the write discipline,
never product surface: reads fetch by identifier and current version. The
platform collapses history to the current state on a monthly cadence, as a
generation rebuild verified at exact parity of current-state reads before the
swap. History is therefore a sawtooth bounded by the cadence, not an
accumulating slope, and the frozen store of the experiments — 319 days,
never cleaned — is the worst case every history-sensitive figure was
measured against. Its first at-scale receipt is the steady-state
precondition of PR #1638 (OPTIMIZE plus a parts census banked before the
load windows); the slice run's banked OPTIMIZE receipt (61.7 s native,
~1.4 GB peak) is the version-depth collapse cost reference.
**Was:** history accumulated without bound on the frozen experiment store;
cleanup was a research-only discipline, a run precondition, not a platform
cadence.

## 16. The capacity statement's form

**Status: settled design**; validation pending the PR #1638 run. The budget
is a derivation of what the contract load requires — threads, memory, and
disk demand derived from measured per-read costs — not a description of one
server model. A production node is any machine meeting the derived
requirements; the sustained-load validation runs on a host sized to those
requirements and gates on the slope of the debt quantities, not on latency.
**Was:** capacity statements described a specific server model ("this box
supports N users"), and the test host had to be that box for the result to
count.

## Fences

- This document is a record, not an authorization: it grants no admission,
  no run, and no production change.
- Implementation status is stated per entry and never upgraded in summary.
  The production migration that implements the settled-design entries in the
  live node is a separate operator decision.
- Cross-linked from `HYBRID-K20-FINDINGS.md`, `DAU-SUSTAINED-LOAD.md` and
  `FULL-STORE-HYBRID.md`, without altering their contents.
- No figure in any results document is altered by this record; it cites
  receipts, it does not restate them.
