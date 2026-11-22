# Resolve pin winners before reading their bodies

Workstream B implements the reduced-body-input path against merged Workstream
A/PR#1608 and D124. It does not change the independent oracle or creative fetch.
At the research reader -> ClickHouse boundary, two statements replace the old
body-bearing canonical pin discovery statement.

## Select, then materialize

1. `pin_selection`: pairs_refs proposes every full historical root-reference
   candidate for the already-selected page IDs. Resolve canonical winners using
   only author_key/doc_id/ref_value/collection_name/deleted/updated_at, with
   deletion winning timestamp ties. Only then filter live placements and exact
   full post roots. Return ordered full pin IDs, roots and the canonical candidate
   count. No body, JSON extraction, star, LIMIT or fixture/setup shortcut.
2. `pin_materialization`: read complete history only for those exact survivor
   full IDs. Resolve winners again, then recheck live placement/current page root
   and the selected root mapping. Keep the original SQL post_author equality:
   mismatch is omission, not a new malformed-pin refusal. Validate every returned
   body before D124 coalescing/conflict refusal. The third, authorized creative
   statement is unchanged, including reader denial and full-author identity.

The handoff refuses duplicate/unordered identities, unexpected payload columns,
foreign roots, inconsistent candidate counts and unexpected/duplicate/unordered
materialized identities. Empty survivor selection skips body/creative reads.
Current eligibility changes between statements may omit a selected pin; frozen
research parts remain the experiment's consistency fence, not a new transaction
guarantee.

This bounds **body materialization to the complete current pin survivor set**,
not to page_size. Skinny selection still reads all historical candidate lanes;
candidate counts and both statements' native costs remain visible. If no pin
survives there is no result row carrying the candidate count; the original native
selection receipt still retains all scan actuals. No general page-sized total
I/O or performance success is claimed before native measurement.

## Controls and scope

All thirteen A controls run through both actual replacement SQL statements in a
SQLite history model via SQLGlot. They retain agreeing/conflicting full targets,
all-pin validation, author precedence independent of insertion order, no pins,
shared creatives, stale roots/service changes/deletion ties and reader denial.
Eight additional controls pin named skinny columns/filter ordering, 92 canonical
candidates yielding two materialized pins, full-author collisions, eligibility
changes between statements, exact identity/order handoff, old captured digest
absence and separate named accounting. A golden SHA256 generated from the
unmodified A reader pins the creative statement byte-for-byte. This is source
evidence, not ClickHouse execution or optimizer proof.

No ordinary API, paired feed SQL, audit admission/budget, oracle, satellite layout,
cache or fixture UUID behavior changes. Observer classification adds only the
two named pin stages, retaining all actuals and original accounting scopes.

## Operator execution order —22 November2026

The operator explicitly requests: fix B autonomously, green every check, merge,
run the experiment and monitor every five minutes. This admits B in the next
fresh combined composition→row-model run, overriding the earlier instruction
to measure uniform B only after a separate row run. Keep 24h self-kill,
32/28/22GiB, 600s measured statements, unchanged oracle/four gates, separate
auxiliary costs, off-host custody and owned cleanup. Preserve every failed
attempt and source-bound repair; routine repairs are authorized, not relaxed
gates or unbounded leases. Compare complete uniform native bytes against
attempt7's10,303,735,551, whether or not performance improves.

An earlier mis-sequenced fresh droplet622229645 was cancelled before worker
launch; it is not an experiment or a measurement. Its private lease/cleanup
receipt is kept separately. No historical stopped attempt is reopened.
