# Config F — design-closure worksheet

**15 November 2026 · DRAFT FOR OPERATOR APPROVAL · NOT CLOSED.**
This is Step 1 of the [Fanout Arm programme](task-block-fanout-arm.md), not
permission to implement, rent a host, change production or rewrite the paper.
The two-lane architecture, physical name `fanout` and default cutoff 2,000 are
settled. The proposals below fill D113 §9's eight implementation gaps; they do
not reopen those choices. No runtime code or engine has been executed.

An organization with a small class and a large audience should publish once,
while both audiences receive the correct current document. The practical test is
a reader following both, then following another group, losing one route, and
reading beyond the retained 200 pointers without missing eligible content.

## 1. Recipient/member predicate — proposed, approval required

Use current canonical `group_members` as the subscription relation for this arm:
rank by `(group_id, member_key)` using `updated_at DESC, deleted DESC` before
filtering deletion. Count explicitly addressable principal rows, including an
explicit owner row; exclude reserved principal-class keys `anyone`,
`authenticated` and legacy `anon`. Never enumerate public-grant strangers.
Pending requests/invitations are not members. Preserve key spelling: do not
merge local bare keys with foreign-qualified names or infer recipients from IDs.
Foreign/group principals require a declared addressability rule before inclusion;
the first arm must state its local-human recipient coverage rather than claiming
federation or group-reader coverage it has not exercised.

Member count and recipients must derive from the **same declared canonical
membership generation**. An active explicit member currently passes the existing
member-read compatibility path even with an undefined role; do not silently
replace that with stricter role-map service rules. Live document policies still
apply at read time. The group-contract hook yields candidates, not permissions.

**R+W addendum requirement:** every measured publish runs the full canonical
`group_members` count/recipient-set query through the real contract/coordinator
path. Snapshot/cached counters alone are insufficient. Close how that canonical
result reconciles the `counting_numbers` routing value at the same boundary;
retain its actual query and cost inside publish latency, not setup.

**Gap:** Config P's `counting_numbers` is a scoped engagement snapshot, not a
live member counter. `arm_satellite_sql.py:15–18,58–81` pins its existing shape;
`clickhouse.py:1866–1884` computes directory member counts from canonical rows
and includes class rows. Reusing either unchanged as an exact recipient counter
would invent semantics. Proposed resolution: a separately identified generic
membership recipe/scope in the existing counter layout, without modifying P's
engagement rows, with canonical pre/post-generation reconciliation. The exact
key encoding and durable update/retry protocol are **OPEN**, not a claimed
write-maintained counter. Stale/missing count means no unsafe fanout expansion;
seek fallback remains available and the requested cell cannot claim acceptance.

Controls: zero members, owner-only, public-only class rows, orphan role, pending
invite, removed/rejoined member, deletion-winning ties, stale/missing counter,
1,999 versus 2,000, same-snapshot count/recipient equality.

## 2. Physical schema and route identity — proposed, approval required

Store full `(author_key, doc_id)` and each contributing `group_id`, in addition
to the operator's reader/time/id sketch. Proposed logical columns:

| Column | Meaning |
|---|---|
| `reader_key String` | Exact addressable recipient |
| `created_at DateTime64(3)` | Canonical publication ordering time, not retry time |
| `author_key String`, `doc_id String` | Full document identity |
| `group_id String` | Route provenance; removing A does not remove B |
| `version UInt64`, `deleted UInt8` | Monotonic maintenance revision and route tombstone |

Candidate physical design: `ReplacingMergeTree(version)` named **`fanout`**,
ordered by `(reader_key, created_at, doc_id, author_key, group_id)`, granularity
**64** as a separately measured tuning parameter. Do not partition one route's
versions into different partitions. Read latest revision before deletion
filtering, with deletion winning a version tie; do not depend on background
merges. A monotonically assigned revision requires the durable mechanism in §4;
it is not supplied by calling `now()` in two workers. This is a schema proposal,
not build-ready DDL or a measured efficient layout.

The 200 cap counts logical distinct full document identities per reader, not
route rows. Report physical route rows/versions separately. A generic order is
`created_at DESC, doc_id DESC, author_key DESC`; retain route cursors separately.
Canonical ordering-time changes require old-key invalidation, not duplicate
publication. Canonical `doc_groups` itself is keyed only by `(doc_id, group_id)`
in the existing template: adding author to `fanout` does not repair that canonical
ambiguity. A same-ID/different-author fixture must follow existing canonical
semantics or explicitly stop; never infer a new author-scoped attachment policy.

Controls: same-ID authors remain distinct, shared-route dedup, route removal,
duplicate retry, unmerged tombstones, tied timestamps and ordering-time edits.

## 3. Cap, history and refill — proposed, approval required

Use cap **200**, shared across services, as a cache window, never a history or
authorization limit. Maintain canonical-backed seek coverage for **all** groups,
including small groups. Before a reader/route window is certified complete,
seek that source. If pointers exhaust, filters reject them, or a page reaches
beyond the retained window, continue through seek with full ordering cursors.
Deduplicate full identities already emitted, preserving route provenance.

Proposed first implementation avoids trusting a persistent coverage watermark:
include small-group seek fallback whenever completeness is unproven. Retain a
build/maintenance boundary in receipts; a later watermark optimization needs
its own closure and measured cost. A work limit returns an explicit incomplete
or error result, never false end-of-history. Trim logical winners on insertion;
physical version cleanup can lag and must be measured. No global synchronous
ClickHouse DELETE is promised. Exact trim serialization belongs to §4.

Controls: >200 documents, one service crowding another, older/filtered pages,
all first-page candidates deleted, partial backfill, alternate routes, correct
cursor continuation and an explicit work-budget failure.

## 4. Durable maintenance/races — decision needed before build

Existing canonical writes are separate operations: see `clickhouse.py`
`attach_doc_to_groups`, `set_doc_attachment`, `add_group_member` and
`remove_group_member`. The schema has no demonstrated atomic canonical-write /
fanout outbox transaction. A process-local task or successful SQL INSERT is not
a durability argument.

Proposed research contract: a **single durable maintenance coordinator** for
synthetic mutations, serialized by affected group and reader, using a durable
intent journal before the first canonical mutation. Journal keys bind operation,
canonical identity/route and revision; retries re-read current canonical facts
and idempotently reconcile rather than replay saved permissions. Acknowledge
completion only after the required canonical and derived effects reconcile;
ambiguous outcomes remain retryable/pending, never reported absent. The journal
is recovery bookkeeping, not the rebuild root. On restart, reconcile incomplete
intents and canonical changes before certification; reads retain seek fallback.

Up-crossing stops new pointers, down-crossing schedules the **same** bounded
follow-backfill path, as directed. No second crossing algorithm. Rebuild fences
a canonical boundary, then replays/reconciles later changes before declaring
completion. Delayed retries cannot resurrect detached routes or an evicted
window. Test crashes before/after each commit and lost acknowledgements.

**Still OPEN:** journal storage/conditional-write primitive, revision allocator,
fencing and canonical-write integration; races against ordinary API writes not
owned by that coordinator. The research-only coordinator must not be passed off
as production multiworker maintenance. If it cannot exercise real authorized
publish/follow paths, the proposed approach fails design closure. Operator
approval of this bounded research model (or an alternative) is required.

## 5. Serving semantics — proposed, approval required

Keep ordinary auth/app/service gates, canonical winner resolution, preparation,
media/ad issuance and delivery accounting. The research adapter nominates
candidates only. For the document-stream test, deduplicate full identities and
retain valid requested routes. Generic SQL queries continue to preserve their
existing attachment multiplicity and DISTINCT semantics.

**Conflict to resolve:** `arm_satellite_pull.py:19–25` deliberately preserves
attachment multiplicity, while the supplied F block requires one document across
groups. Do not change the independent oracle to match F. First inspect the
captured query and its independent canonical multi-group result. If its explicit
semantics do not deduplicate, operator approval of a separately labelled query
contract is needed, plus canonical P/F comparisons under that identical query;
historical P receipts remain unchanged. Same-timestamp ordering must likewise
follow the actual query, not silently gain a new comparator tie-break.

**Second gap:** P's adapter rejects changed canonical generations
(`arm_satellite_api.py:123–130`). Unchanged snapshot satellites cannot simply be
declared live after T4/T3/T8 mutations. Proposed test isolation: preserve the
frozen benchmark store and P builds; perform declared synthetic lifecycle writes
in an admitted disposable test scope and rebuild/revalidate affected satellites
using the unchanged P builders before reuse. This must not hide required
same-session latency, fresh count correctness or grant changes. If T3 requires
new reader count scopes, include their cost, not prebuild outside the timer.
Live update behavior not supported by unchanged P remains a visible blocker;
no generation-guard bypass. The operator must settle test scope before build.

**R+W strengthens this blocker:** an isolated quiet lifecycle fixture is not the
required load cell. The serving workload must see concurrent authorized100/sec
publishes and10/sec follows throughout ten minutes of full reader load. Moving
those writes to a disjoint database, pausing readers to rebuild, or rebuilding
satellites outside the measured window cannot satisfy it. Before closure,
specify generation-safe live visibility/current counts and fresh-reader scopes
without changing P semantics or bypassing its guard; any required maintenance
must be measured and separately reviewed. This remains OPEN, not solved by the
earlier disposable-scope proposal.

## 6. Read-plan adoption — proposed artifact

| Shape | Intended route / proof required |
|---|---|
| Supported chronological group document stream | Reader pointers + selected-group seeks + full-key canonical resolution/refill; all native reads counted |
| Small-group old/filtered/lagged history | Canonical-backed group/time seek; no 200-row correctness shortcut |
| Bodies, profiles, counts, ad preparation | Unchanged P paths and scope checks; point-read cost remains measured |
| Reactions/comments/views and delivery accounting | Existing complete-sequence semantics, views treatment OFF; include all cost |
| Arbitrary ranking, joins or unsupported predicates | Original canonical query or explicit unsupported/error result under existing contract; never a non-equivalent rewrite |

Before build, bind supported captured AST shapes and expected ordering to source
hashes. Before performance claims, retain actual native SQL, EXPLAIN/access
evidence, query IDs, per-stage rows/bytes/timings and request totals. No per-group
O(page) statement implies constant total cost independent of followed-group
count, refill or preparation. No observer SQL under the measured user/windows.

## 7. Node Settings field — proposed, integration only

Persist generic `fanout_member_cutoff` in the existing node config JSON, default
2,000, through existing node-admin authority; one effective value shared by
writes and reads, not per app/group. Proposed initial validated range **1–2,000**:
1 selects seek for any nonempty member group, zero has no special disable meaning;
raising the maximum requires separate write-cost admission. Exact field/schema
mapping, UI placement and cross-worker effective-version/fencing remain OPEN.
The range is a proposal, not an operator decision or tested safe bound.

Future UI: labelled integer field, explicit Save/Reset, effective/pending/error
state, cost explanation and URL-owned navigation, admin denial tests and
desktop/375px screenshots. Settings-driven reclassification reuses §4's
backfill/seek path. Record prior/new versions, restart persistence and rollback;
no promise that Save means all backfills finished. Research receipts pin cutoff
2,000; non-default tests are separately labelled. No UI implementation now.

## 8. Experiment admission and evidence — OPEN

Full manifest/hash identity for frozen `2d6bbc4d…`, exact archive locator and
read-only restore verification are required, not the abbreviated prefix alone.
Fresh host ID, start/deadline UTC, operator-approved compute cap/window, volume
and reserve admission, independent cleanup and earlier container/host stops
must be receipted before paid execution. Keep 32/28/22 GiB, engine24.8.14.39,
ten-second measured reads and >10M-row stop unchanged. No local engine runs.

First report stage-attributed P; then build receipt and T4 → T2-F → T6-F → T3-F
→ T5-F → T8-F → boundaries → separately admitted T7. Three serial historical
observations are not fresh trials or a p95. Specify the fresh trial/sample
schedule and p95 estimator before launch; do not retrofit them to observations.
Every native stage and failed request remains in raw evidence; no headline
number without decomposition. No paid admission is granted by these artifacts.

**Mandatory R+W load gate:** declare the37k-DAU reader profile (approximately
1,400 concurrent sessions/23 sequences per second at60s think, or46/sec at30s),
plus100 real publishes/sec and10 real follows/sec for ten concurrent sustained
minutes. Pin group-size/route mix, actual timing/concurrency, mutable-copy
headroom and independent delivery-reconciliation method before launch. Same
read p95<500ms/<25MB complete-sequence budget, errors<1% for reads/writes and
all stop rules hold; report under-load publish p95 and follow completion,
publish recipient writes vs actual recipients and rate×1,999, separate backfill
and physical amplification/backlog. This may extend T6-F or run after it, but
must pass before the arm does. See the task block for exact accounting. No
cell launch, numeric write-latency threshold or additional budget is inferred.

## Approval ledger and next action

| D113 §9 decision | Artifact here | Approval / readiness |
|---|---|---|
| Recipients/member count | §1 predicate, source gap and controls | OPEN: principal coverage and counter maintenance |
| Physical pointer schema | §2 candidate columns/key/granularity | OPEN: full DDL depends on §4 revisions |
| Cap/history coverage | §3 fallback proposal and controls | Proposed; not approved/measured |
| Durable maintenance | §4 coordinator contract and crash cases | OPEN: journal/fencing/API integration |
| Serving integration | §5 multiplicity and mutable-snapshot conflicts | OPEN: query contract, lifecycle scope and concurrent R+W visibility |
| Read-plan adoption | §6 shape/access evidence matrix | Proposed; captured AST binding pending |
| Node Settings | §7 field/range/UI proposal | Proposed; mapping/propagation pending |
| Experiment admission | §8 receipt requirements incl. mandatory concurrent R+W | OPEN: separate operator approval and predeclared load/reconciliation schedule |

No row is marked CLOSED. First obtain operator disposition on: (1) recipients
and counter semantics, (2) journal/coordinator model, (3) multi-group query
multiplicity and mutation/satellite test scope, and (4) settings range. Then
complete exact DDL, source-bound hook manifest and remaining closure artifacts
for approval. Keep implementation, paid execution, broader integration and v7
blocked at their respective gates. This worksheet is not a security scan/PASS.
