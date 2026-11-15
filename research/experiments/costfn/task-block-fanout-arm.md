# Task block — the Fanout Arm (Config F)

Operator direction, 15 November 2026. Retained, structured transcription of the
corrected task block supplied in this session; not a measurement receipt.
Architecture: [D113](../../../knowledge-base/web10-v3/db/group-delivery.md).
Approval worksheet: [ARM-F-DESIGN-CLOSURE.md](ARM-F-DESIGN-CLOSURE.md).

## Why

Config P's bounded native count/metadata checks and semantic complete-response
parity passed. Preserve the earlier exact-creative failure: 300 node-ad inventory
records share one timestamp. Its three serial complete-sequence observations
were 3,323 / 3,606 / 3,287 ms and approximately 484 MB logical reads, missing the
500 ms / 25 MB targets. These are diagnostic observations, not formal T6/p95 or
capacity evidence. They motivate this proposed write-side arm; they do not waive
design closure or provide fresh operational admission.

The supplied block's 37k DAU / approximately 23 loads per second and approximately
11 GB/s arithmetic are sizing hypotheses, not measured sustained throughput. Its
structural conclusion and the proposed v7 headline remain hypotheses to test.

## Settled design

- Canonical documents remain the sole content source. Canonical attachments,
  grants/policies and events/follows retain their separate authority.
- The physical table is **`fanout`**: generic delivery infrastructure shared by
  every app, no app-specific columns. It holds recipient/document pointers,
  not bodies or cached permissions. The minimal sketch is
  `(reader_key, created_at, doc_id)`; D113 requires full-key identity and route
  provenance to be resolved before executable DDL.
- Every document published into a group invokes group-contract delivery
  maintenance; there are no document-type exceptions or first-read triggers.
- One declared `fanout_member_cutoff`, default **2,000 members**, controls routing.
  Below the cutoff: one pointer per entitled recipient. At/above it: zero
  recipient pointers; seek through `doc_groups_t`. The 1,999 default bound is
  **per small-group publication**, not across all groups attached to a document.
- Approximately **200 logical pointers per reader**, trimmed on insert. Cap
  changes storage, not eligibility; older/filtered/refill fallback is required.
- Follow of a small group backfills its recent documents up to the cap in the
  same session. Follow of a large group writes no pointers; time the first seek.
  Unfollow removes that group's contribution without deleting another valid route.
- Merge recipient pointers and seek slices; multi-group documents appear once
  in the intended document stream. Full-key identity, generic query multiplicity
  and exact oracle ordering must be reconciled explicitly in design closure.
- Keep Config P satellites unchanged. Counts retain exact scopes; resolve
  bodies/profiles canonically. Views **treatment** stays OFF; do not omit the
  original view path from complete-response cost or delivery checks.
- Pointers never authorize. Resolve current canonical versions, attachments and
  permissions; reject deleted/revoked/denied candidates and refill.
- Rebuild from canonical documents, attachments, grants/policies and actual
  subscription/event sources, never from another satellite as the root of truth.
- Publish classification reads the current member counter in `counting_numbers`.
  Up-crossing 2,000 stops new fanout; existing pointers age out and seek covers
  reads. Down-crossing reuses bounded follow-backfill. Do not invent a separate
  crossing system; specify durable scheduling and race handling for these paths.

## Programme and admission

1. Close D113 §9's eight decisions with artifacts **approved by the operator**.
   No implementation before closure. The settings field is planned, not enabled.
2. Obtain fresh explicit DigitalOcean host/window/compute-cap admission, in the
   prior 4-hour / $2 shape, with independent layered cleanup and a stated deadline.
   This document does not supply that admission. Restore frozen dataset
   `2d6bbc4d…` from its MinIO archive using the full manifest identity; never
   regenerate. Keep 32 GiB host / 28 GiB container / 22 GiB ClickHouse and the
   ten-second measured-read deadline unchanged. Cap hit means stop and report.
3. **Step 0:** reproduce Config P's serving sequence on the fresh restore and
   retain exact native per-stage SQL/query-ID attribution. Report the stage table
   before building F under the programme's stricter sequence.
4. Build the table, publish hook, follow/unfollow, cap trim and merged read in
   the isolated research arm. Before any test, retain DDL/granularity, constants
   and effective cutoff, code locations, hook file/line references, implemented
   recipient predicate and canonical dependency manifest.
5. Run the gates below in order. Any parity/rebuild failure or stop-rule hit
   stops the arm and reports. No silent comparator changes or improvisation.
6. Only if every required gate passes, write a separate staged, flag-gated
   broader-integration proposal. A PASS permits a proposal, not deployment.
7. Only on a separate explicit operator go, implement broader protocol integration:
   unconditional write maintenance, layout-aware reads, persisted node-admin
   cutoff default 2,000, parity against the old path before changing defaults.
8. Only afterward, produce additive **draft v7**, preserving all prior drafts,
   using receipt-supported claims and personal **Independent** affiliation, never
   Web10 Inc or the employer. Target **CIDR next cycle**, not SIGMOD 2027; no
   submission is authorized. Failure leaves later steps waiting for the operator.

## Gates and report order

| Order | Gate | Required result |
|---|---|---|
| 1 | Step 0 | Config P native stage decomposition, retained SQL/query IDs |
| 2 | Build receipt | Actual DDL, constants, hook locations, recipients and sources |
| 3 | T4 | At approximately 10 / 500 / 999 / 1,999 members, pointers equal entitled recipients; at/above 2,000, zero. Report physical amplification and added publish-path p95 |
| 4 | T2-F | Independent complete-response parity, mixed lanes and multi-group dedup; exact core/order/counts/profiles/creator ads, existing semantic eligible-node-ad comparator |
| 5 | T6-F | Three trials, K=20, full store; complete-response p95 <500 ms **and** <25 MB total logical reads, with P-versus-F stage table; >10M rows in a single read stops |
| 6 | T3-F | Fresh reader follows 39 mixed-lane groups; same-session feed including first seek; >60 seconds fails |
| 7 | T5-F | Drop **only** `fanout`, rebuild from canonical alone, repeat T2-F/T4 spot checks; reproduce pre-drop logical feed |
| 8 | T8-F | Stale-pointer deletion/revocation/entitlement replay, latest-version-first tombstones and refill; serving a deleted document fails immediately |
| 9 | Boundaries | 1,999↔2,000 both ways, multi-route removal, same-ID/different-author, cap overflow, crash/retry and concurrent publish/follow/rebuild |
| 10 | T7 | K=1000 only after T2-F and T6-F pass; separately admitted under the programme |

Pin unchanged baseline/Arm T/P receipts and distinguish main-only scopes from
complete-sequence scopes. Historical comparators are approximately 361M rows /
24.32 GB for the failed baseline, 1.72M rows / 156.5 MB for Arm T core stages,
and approximately 3.3 seconds / 484 MB for Config P complete sequences. They
are not interchangeable measurement scopes. Frozen cells/inputs/receipts stay
untouched; no production change is authorized by programme Steps 1–6.
