# Group delivery: canonical documents, two delivery lanes

**Status: pre-build architecture specification, 15.11.2026 (D113).** The operator
has chosen the shape; it is not an implemented schema, production migration or
capacity result. Settled intent is below; §9 lists the decisions still needed
before implementation. No paid experiment or deployment is authorized here.

**Experiment first; broader integration only after the gates pass.** The operator
clarified: "i want to do in the experiment this before we do it to the actual
system to confirm it gets us where we need to be!" and "pass all the performance
benches then do the fanout to the broader system". D113 chooses the candidate
architecture, not permission to wire it into the platform before measuring it.
Close §9, then implement the hybrid write maintenance **and** layout-aware reads
in the isolated Config F research arm. Keep ordinary platform runtime/schema and
deployment unchanged during this proof. Passing a fanout microbenchmark or making
the main SELECT fast is not enough: the complete response must pass §8's parity,
latency/read-byte, write-amplification, follow, lifecycle, rebuild and admitted
stress gates. Missing or failed evidence blocks broader integration. A passing
experiment permits a separately reviewed integration proposal, not automatic
deployment or a claim of unmeasured capacity. Fresh paid-host admission is still
required before engine work; this clarification does not renew an expired lease.

## 1. The point: one distribution system for every app

An organization should not rebuild its application when its audience grows.
A lecture, a note, a message and a shop listing are all documents published
into groups. The node handles distribution through the same generic mechanism,
without learning those app concepts (D60).

The operator's direction, 15 November:

> it is just built in, always ready for scale no matter the everything app!

And on deletion:

> and tombstoning everyhting still wroks great! since it all needs to be docs
> table only! fanout would just point to a dead doc you throw that row out,

The architectural promise is **scale-aware from the first user**, not unlimited
capacity. Both lanes exist from the start in the intended architecture. No app
must bolt on a second distribution system when it becomes popular.

Consider an organization publishing into a 500-member group and a 50,000-member
group. Store its document once. Deliver pointers for the small group; use indexed
group/time reads for the large one. A reader following both gets one merged stream.
Deleting the document invalidates candidates in both lanes at canonical resolution.
There is no second content copy to keep alive by accident.

## 2. The shape

```text
Authorized document create / group attachment
                 |
                 v
Canonical documents + canonical group attachments
                 |
         Group-contract delivery hook
                 |
       current group member count
           /                  \
       < 2,000              >= 2,000
           |                    |
    recipient pointers    group/time seek index
           \                    /
            merged candidate stream
                      |
       canonical document + attachment + access checks
                      |
         live authorized winners; refill exclusions
                      |
          bodies, profiles, counts, preparation
```

The **whole design is hybrid**. Each group publication chooses fanout or seek;
a reader can use both. The hook is platform code applying group-contract rules,
not arbitrary app code running inside the node and not a new social feed endpoint.
Existing query/result semantics must survive the optimization.

### Always maintained on write; explicitly exploited on read

**Operator clarification:** "the write always does the fanout!!!! the read
queries aka query engione still need to be written well to take advantage!"

These are two separate responsibilities:

- **Write-path obligation:** every group publication runs the platform's delivery
  maintenance automatically, regardless of which app wrote it, whether anyone has
  queried it, or whether any current query uses the derived layout. There is no
  per-query opt-in that enables fanout, and no first-read trigger that builds it.
  The default cutoff controls physical recipient expansion: under 2,000
  writes recipient pointers; at/over 2,000 writes zero recipient pointers and has
  seek-backed coverage. The group/time index needs maintenance for all groups,
  including under-cutoff history/fallback. Durable maintenance semantics are §6.
- **Read-path responsibility:** the query engine and its read queries must be
  deliberately implemented to exploit those maintained layouts: bounded pointer
  reads, group/time seeks, merge/refill and exact-key canonical resolution. Merely
  creating a fanout table does not accelerate an existing broad documents scan.
  Optimizer selection, SQL/query shape and measured native access remain explicit
  engineering work. Queries that do not use the layouts gain no automatic benefit.

Built-in means **every app's writes maintain the infrastructure**, not **every
possible app query is automatically optimized**. An app need not invent fanout,
but its queries and the generic engine still need suitable read plans. Unsupported
query shapes must preserve correct canonical semantics rather than being forced
through a non-equivalent delivery-stream rewrite.

### Authority and derived state

| State | Responsibility | Can authorize a read? |
|---|---|---|
| `documents` | Canonical content, author, versions and document tombstones | Necessary, not sufficient |
| `doc_groups` and canonical group/access/policy state | Current attachments, memberships, contracts, moderation and other access rules | Through the existing read gate |
| Recipient-pointer table (physical name not settled) | Bounded recent delivery candidates per reader | No |
| Group/time index (`doc_groups_t` in the experiment) | Seekable group candidates, including large-group coverage | No |
| Metadata/count satellites | Indexed identities and exact scope-qualified aggregates | No |

**“Documents only” means one canonical content source, not that all authority
lives in `documents`.** Attachments, grants/policies and relevant events remain
in their existing canonical tables. Derived tables are rebuildable from those
canonical sources, never dependent on another satellite as their root of truth.
Rebuilding the group/time index does not require reading the fanout table, or vice versa.

### Logical pointer shape, not executable DDL

The operator's minimal delivery tuple is `(reader_key, created_at, doc_id)`.
Production document identity is `(author_key, doc_id)`: `doc_id` alone must never
select a different author's document. The physical design must either carry the
full identity or prove an exact, unambiguous canonical identity lookup.

Delivery also needs **group-route provenance**: removing group A must not remove
delivery through group B for the same document. Whether provenance is represented
on pointer rows or in another generic relation remains open. Do not silently turn
the three-field sketch into final DDL before resolving these requirements.

No bodies, signed media URLs, credentials or persisted read approvals belong in
the pointer. Service/type, if indexed, is a generic selector, not an app-specific
column or authority. Order keys, versions, provenance and dedup keys need an
explicit build receipt (§9).

## 3. Write and membership lifecycle

**Every document published into any group uses this mechanism, with no
document-type exceptions.** Unattached documents remain canonical documents;
there is no group recipient set to distribute them to. Processing a document
does not mean every app must display it: apps retain service filters and ranking.

| Event | Required behavior |
|---|---|
| Publish/attach into a group below 2,000 members | Resolve the contract's entitled, explicitly addressable delivery recipients; write one logical pointer per recipient for that route |
| Publish/attach into a group at or above 2,000 | Write zero recipient pointers for that route; the group/time seek lane supplies candidates |
| Follow/subscribe to an under-cutoff group | Backfill its recent eligible documents up to the reader window in the same session |
| Follow/subscribe to an at/over-cutoff group | No pointer backfill; time the first seek-backed read too |
| Unfollow/unsubscribe | Remove this group's delivery contribution within the reader window; retain other valid routes |
| Cross upward through 2,000 | Stop new fanout; old pointers age out under the cap; reads classify using the current counter and include seek coverage |
| Cross downward below 2,000 | Reuse bounded follow-backfill for the remaining followers; do not lose coverage while it completes |
| Edit content | Resolve the latest canonical body; do not create an independent body copy or treat every edit as a new publication |
| Delete, detach, moderate or revoke access | Canonical resolution excludes the now-ineligible candidate; pointer cleanup is not the gate |

The lane cutoff is **one node-wide setting, default 2,000 members**. The publish
decision reads the group's member counter from `counting_numbers`; reads use
the current classification. Exact counter freshness and transition coordination
must be specified before code, not inferred from a snapshot counter test.

The operator selected this default as the "normie celebrity cutoff", superseding
the original 1,000-member proposal. Name the design parameter
`fanout_member_cutoff` to distinguish it from benchmark **K**, the number of groups
a reader follows. Changing the cutoff does not change K=20/K=1000 benchmark cells
or admit a new cell. The 2,000-member default is a hypothesis to validate in the
experiment, not a measured optimum or a capacity guarantee.

### Planned Node Settings control

Expose `fanout_member_cutoff` as **Fanout member cutoff** in the node's admin
settings when broader integration is admitted, not as a per-app, per-group or
per-reader preference. Persist one server-owned value, default **2,000**; both
write routing and read planning consume the same effective configuration.
Use the existing node-admin configuration authority, never a client-only setting.
The exact settings-screen placement and storage/API field mapping must be closed
before implementation; the social moderation tabs are not a new authority source.

- Explain the rule beside the field: below the cutoff, fanout; at/above, seek.
  Higher values can increase pointer storage, publish cost and backfill work.
  Show the effective value, an explicit Save and Reset to default; validate a
  positive integer server-side, with tested minimum/maximum bounds settled during
  design closure. No unbounded write-amplification control or undocumented zero mode.
- A saved change must use the same durable lane-transition/backfill machinery as
  member-count crossings. Raising the cutoff creates newly fanout-eligible groups;
  lowering it stops new fanout for affected groups. Keep seek coverage throughout,
  tolerate old pointers and retain canonical authorization. Changing a number must
  not create feed gaps, trigger an unbounded synchronous rebuild or imply that
  backfill has completed. Define effective/pending version and cross-worker
  propagation, restart persistence and rollback semantics before enabling edits.
- Pin the effective cutoff in every experiment/build receipt; vary it only in
  separately declared runs. The publication recipient bound is **cutoff minus
  one**, conditional on exact recipient semantics; **1,999** applies at the default,
  not to every configured value. Prove non-default boundaries, change-during-read/
  write/backfill, restart and rollback behavior as well as default performance.
- Future UI acceptance includes admin/non-admin behavior, saved/error/pending
  states, URL-owned settings navigation and desktop/375px verification under
  `strategy/design.md`. This is planned scope only: no settings control or runtime
  configuration exists for delivery yet, and experiment-first gates still apply.

The recent window is **approximately 200 logical pointers per reader**, trimmed
on insertion, with one declared cap parameter. Changing the cap changes storage
and hit rate, not which documents are eligible. This is a logical retained-window
bound, not a promise of immediate physical deletion/compaction in ClickHouse.

At the default cutoff, the 1,999-pointer ceiling is **per under-cutoff group publication**, conditional
on an exact recipient/member definition. A document attached to several small
groups can generate more total writes. Down-crossing backfill is bounded per
reader but can still touch up to 1,999 readers. Retries, trimming, bookkeeping and
counter maintenance are additional work: report physical writes separately.

Public `anyone`/`authenticated` grants do not enumerate the internet as recipients.
Readability and subscription are distinct. The exact subscription/member mapping,
reserved-key exclusions and concrete recipient-set predicate are pre-build gates.
Use current access compatibility from [groups/access.md](../groups/access.md),
including its legacy member-read behavior; this spec does not tighten that policy.

## 4. Reads: candidates first, truth second

The following is the required layout-aware read shape to implement, not a claim
that all existing `w.query` requests already execute this plan. Write maintenance
is unconditional; query-engine adoption and read-query optimization are separate.

1. Authenticate and apply the existing app/service read gate. Determine the
   request's selected groups, services, filters and current subscriptions.
2. Read the reader's recent pointer stream and ordered seek slices for followed
   at/over-cutoff groups. Continue each source with stable cursors and tie breaks.
3. Merge candidates. For the intended document stream, deduplicate documents
   delivered through multiple groups, while retaining their route provenance.
   This does **not** silently change the generic query engine's attachment-row
   multiplicity or `DISTINCT` semantics; the serving integration must pin both.
4. Resolve full canonical document identities and latest versions, then apply
   current attachment/access/policy checks. A pointer proves no entitlement.
   A valid alternative route keeps the document eligible within request scope.
5. Discard stale, deleted or denied candidates and advance/refill. Missing/failed
   authority is never permission to serve a cached body or mint media URLs.
6. Resolve winning bodies/profiles by exact-key lookup and counts through exact
   scope-qualified `counting_numbers` semantics. Keep existing media/ad provenance,
   preparation and delivery accounting; they remain part of whole-response cost.

**A 200-pointer cache cannot be the entire history.** Old pages, selective service
filters, many deletions and incomplete backfills need canonical-backed continuation
for under-cutoff groups too. The exact coverage watermark/fallback design is open;
without it, trimming could silently hide eligible documents. A work-budget stop
must not be misreported as end-of-history. The seek lane is the natural candidate
source, not a license to claim that fallback cost has already passed the budget.

An ordered group index avoids a whole-store scan for each slice; it does not make
the whole request O(page) independent of followed-group count. Multiple seeks,
denials/refills, canonical resolution and preparation still cost work. Likewise,
chronological candidate delivery does not prove arbitrary app ranking is correct.

## 5. Tombstones: reject first, clean up later

The critical rule is **latest version first, deletion filter second**. Rank all
versions per full document key by `updated_at DESC, deleted DESC`, take the latest,
then reject `deleted = 1`. A tombstone wins an unmerged timestamp tie. Filtering
out tombstones before ranking resurrects an older live row; waiting for a background
merge is not a read gate. See [clickhouse.md](clickhouse.md#documents).

| Canonical change | Serving result, even with stale pointers |
|---|---|
| Document tombstoned | Never serve its older body through either lane; refill |
| Document edited | Serve the latest authorized body, not the delivery-time body |
| Attachment to group A removed | A cannot contribute eligibility; group B can still do so if requested and valid |
| Membership, contract or policy changes | Re-evaluate current access, including any still-valid public/other-group route |
| Missing/ambiguous identity or failed canonical resolution | No body/media authority; return the appropriate error or explicit incomplete result, not stale content |

Rejecting a candidate is synchronous to the read; removing its stale delivery
row can be deferred. No deletion requires a successful synchronous sweep of all
recipients. Route-specific invalidation must not globally erase another route.
Reader-specific denial must not delete shared candidate state for other readers.

**This preserves the existing read boundary, not a new transactional guarantee.**
Specify visibility during concurrent delete/read and membership changes before
building. Do not claim atomic cross-table revocation, cancellation of an already
returned response, physical erasure of history or revocation of already-issued
media capabilities. Attachment timestamp/merge limits remain as documented in
[attachments.md](attachments.md).

## 6. Recovery: derived must really mean rebuildable

Rebuild from canonical documents, attachments, contracts/memberships, policies and
the canonical subscription/event records actually used by the recipient rule.
Publish an explicit dependency manifest. `documents` alone cannot reconstruct
who followed which group. If subscription state is missing from canonical data,
that is a design gap, not permission to recover it from another satellite.

A crash after canonical commit but before pointer insertion cannot silently lose
delivery. Before implementation choose durable retry/reconciliation, idempotency
keys, acknowledgement semantics and the read fallback during lag. This spec does
not invent an outbox schema, cross-table transaction or exactly-once guarantee.
Delayed retries must not resurrect a detached route or rewind a trim watermark.

Rebuilding need not reproduce historical physical insertion order; it must
reproduce the correct logical window and served results at a declared canonical
boundary. Coordinate live writes/backfills with that boundary. Drop only the
fanout table in the rebuild test, then re-run independent response and write checks.

## 7. What stays unchanged

- Generic node API, existing auth and canonical ownership/access rules (D60).
- App-owned concepts, presentation, filters and ranking. No `feed`, `followers`
  or lecture-specific platform endpoint/table field.
- Canonical data ownership and tombstone/version history; no content relocation.
- Existing exact metadata/count satellites in Config P. Fanout does not magically
  retire profiles, counts, policy checks, media preparation or delivery accounting.
- Federation is separate: local recipient indexing does not implement cross-node
  push, foreign credential storage or the client-side server mixer's read fan-out.

## 8. Evidence required, not performance by proclamation

The attached Config F task motivates this shape: Config P's bounded semantic
response checks passed, but observed complete sequences took 3.287–3.606 seconds
and about 484 MB logical reads. These are diagnostic observations, not a formal
fresh-restore p95/T6 result. The per-stage cost split was not retained before
host shutdown. Reproduce it before or alongside any separately admitted F build.
Historical receipts and the prior no-fanout execution gates stay intact in
[ARM-SATELLITE.md](../../../research/experiments/costfn/ARM-SATELLITE.md).

Config F acceptance must retain the supplied task's discipline:

- **Build receipt before tests:** actual DDL/granularity, constants and locations,
  hook file/line references, recipient predicate and canonical dependency manifest.
- **T4:** measured fanout at roughly 10, 500, 999 and 1,999 members; entitled-recipient
  parity, at most 1,999 pointers per small-group publication, zero at 2,000 and above,
  physical write amplification and added publish-path p95 latency.
- **T2-F:** independent complete-response parity, mixed lanes and multi-group
  deduplication; exact core/order/counts/profiles/creator ads, semantic eligible
  node-ad comparison, preserving the original tied-creative failure receipt.
- **T6-F:** three trials, K=20, full frozen store; complete-response p95 <500 ms
  **and** <25 MB total logical reads, with P-versus-F stage attribution. Preserve
  the >10M-row single-read stop rule and existing resource/query limits.
- **T3-F:** fresh reader follows 39 mixed-lane groups; same-session population
  including first seek-backed read, measured latency; >60 seconds fails.
- **T5-F:** drop only fanout, rebuild from canonical alone, repeat T2-F and T4
  spot checks; reproduce the pre-drop logical feed for the test readers.
- **T8-F:** stale-pointer deletion/revocation/entitlement replay, latest-version
  ordering and page refill. Serving a deleted document fails immediately.
- **T7:** K=1000 only after T2-F and T6-F pass and execution is separately admitted.
  Any parity/rebuild failure or stop-rule hit stops the arm; views treatment stays off.

Add boundary controls for 1,999↔2,000 transitions, multi-group route removal,
same-ID/different-author identity, same-timestamp tombstones, cap overflow,
filtered/older pages, crash/retry recovery and concurrent publish/follow/rebuild.
Future authority-affecting code needs independent review and exploit-replay gates;
this document is neither a security scan nor a security PASS.

## 9. Before building: close these decisions

| Open decision | Required artifact |
|---|---|
| Recipient and member-count semantics | Exact canonical predicate: owners, reserved classes, subscriptions vs memberships, per-service compatibility, counter freshness and the 1,999 bound |
| Physical pointer/provenance schema | D60-compliant names, full document identity, group-route retention, stable order/ties, dedup/version/trim keys and index granularity |
| Cap and history coverage | Logical vs physical cap, cross-service fairness, watermarks and complete older/filtered/refill fallback |
| Durable maintenance | Publish/attach/update/delete and membership hooks; idempotency, acknowledgement, lag, crashes, transition/backfill races and rebuild boundary |
| Serving integration | Generic query seam, app ordering, attachment multiplicity vs document dedup, pagination/error/concurrent-read semantics; no new access policy |
| Read-plan adoption | Which query shapes explicitly use maintained pointers/seeks, their compiler/SQL plans and native bounded-read receipts; correct behavior for unsupported shapes |
| Node Settings configuration | Admin UI placement and generic persisted field, tested integer bounds, shared effective/pending version, propagation/restart/rollback and bounded reclassification/backfill on change; default 2,000 |
| Experiment admission | Stage-attributed P baseline, retained source-bound F task/receipts, fresh explicit host/window/budget and independent cleanup; no production action |

Next step is a **design-closure pass**, not implementation. Settle these artifacts
with the operator, then build the smallest independently testable research unit.
