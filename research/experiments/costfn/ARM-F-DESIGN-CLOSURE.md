# Config F — approved research closure and execution receipt

**15 November 2026 · OPERATOR APPROVED, with the corrections below.**
The operator approved §§1–6's bounded research design, deferred §7 to integration,
and granted §8's fresh isolated four-hour/$2 admission including concurrent R+W.
The exact DDL and source-bound hook manifest are retained here as the final
design artifacts. This closes design intent, not implementation, native parity,
security review or performance. Host creation, deadline and execution receipts
are still absent; no clock has started and no paid host has been created here.
T7 needs separate admission. Production and views treatment remain unauthorized.

This file contains **closure + operator approval**; the
[task block](task-block-fanout-arm.md) contains the programme + R+W addendum, and
[D113](../../../knowledge-base/web10-v3/db/group-delivery.md) is the spec.
Fold future execution results into this file and source-bound machine receipts,
not a fifth planning document. The existing historical P records remain intact.

An organization with a small class and a large audience should publish once,
while both audiences receive the correct current document. The practical test is
a reader following both, then following another group, losing one route, and
reading beyond the retained 200 pointers without missing eligible content.

## 1. Recipient/member predicate — approved; no membership counter

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

**Operator correction:** "no membership counter. The lane decision and the
recipient set are both read from canonical group_members at publish time."
Run one canonical query, consume the complete deduplicated result once, and use
its length for classification and those same keys for delivery. No second count
query, precomputed recipients, membership recipe, cached-count reconciliation or
freshness apparatus. `counting_numbers` retains its T1-passed engagement scope
only. Serialize membership changes through §4's coordinator so its own mutations
cannot intervene between selection and reconciliation; this is not a new
transactional claim for arbitrary external writers.

Exact selection SQL (bound `group_id`, not string interpolation):

```sql
SELECT member_key
FROM (
    SELECT member_key, deleted,
           row_number() OVER (
               PARTITION BY group_id, member_key
               ORDER BY updated_at DESC, deleted DESC
           ) AS rn
    FROM group_members
    WHERE group_id = {group_id:String}
)
WHERE rn = 1 AND deleted = 0
  AND member_key NOT IN ('anyone', 'authenticated', 'anon')
ORDER BY member_key
```

For this arm, classify `len(result) < 2000` as fanout. Even an over-cutoff
publication performs the full canonical pass, then writes zero recipient
pointers. The statement and transfer cost stay inside publish latency. Failure
to complete it is an operation failure, never a guessed lane or empty recipient
set. Local-human coverage remains explicit; unsupported principal fixtures stop
rather than silently broadening or narrowing the approved recipient predicate.

Controls: zero members, owner-only, public-only class rows, orphan role, pending
invite, removed/rejoined member, deletion-winning ties, canonical-query failure,
1,999 versus 2,000, count/recipient equality from the same returned rows.

## 2. Physical schema and route identity — approved; exact DDL

Store full `(author_key, doc_id)` and each contributing `group_id`, in addition
to the operator's reader/time/id sketch. Approved logical columns:

| Column | Meaning |
|---|---|
| `reader_key String` | Exact addressable recipient |
| `created_at DateTime64(3)` | Canonical publication ordering time, not retry time |
| `author_key String`, `doc_id String` | Full document identity |
| `group_id String` | Route provenance; removing A does not remove B |
| `version UInt64`, `deleted UInt8` | Monotonic maintenance revision and route tombstone |

```sql
CREATE TABLE fanout (
    reader_key String,
    created_at DateTime64(3, 'UTC'),
    author_key String,
    doc_id String,
    group_id String,
    version UInt64,
    deleted UInt8 DEFAULT 0,
    merge_version UInt64 MATERIALIZED version * 2 + toUInt64(deleted),
    CONSTRAINT valid_version CHECK version > 0 AND version <= 9223372036854775807,
    CONSTRAINT valid_deleted CHECK deleted IN (0, 1)
) ENGINE = ReplacingMergeTree(merge_version)
ORDER BY (reader_key, created_at, doc_id, author_key, group_id)
SETTINGS index_granularity = 64;
```

One partition (no `PARTITION BY`) keeps every route's versions together. Logical
`version` comes from the durable sequence in §4. The materialized comparison
value ensures a tombstone wins an equal logical-version tie **even after a
background merge**, not just before it. Read latest per complete sorting key
using `(version DESC, deleted DESC)` before filtering `deleted`; never rely on
merges for correctness. This exact DDL still requires actual pinned-engine
validation before it becomes a build receipt. No engine execution is claimed.

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

## 3. Cap, history and refill — approved; append-only publication

Use cap **200**, shared across services, as a cache window, never a history or
authorization limit. Maintain canonical-backed seek coverage for **all** groups,
including small groups. Before a reader/route window is certified complete,
seek that source. If pointers exhaust, filters reject them, or a page reaches
beyond the retained window, continue through seek with full ordering cursors.
Deduplicate full identities already emitted, preserving route provenance.

The approved first implementation avoids trusting a persistent coverage watermark:
include small-group seek fallback whenever completeness is unproven. Retain a
build/maintenance boundary in receipts; a later watermark optimization needs
its own closure and measured cost. A work limit returns an explicit incomplete
or error result, never false end-of-history. Enforce logical winners at read;
physical version cleanup can lag and must be measured. No global synchronous
ClickHouse DELETE is promised.

**Operator build property:** "fanout inserts are append-only — an insert never
re-ranks a reader's list; the window cap is enforced logically at read and by
amortized background trim." This supersedes the earlier trim-on-insert sketch.
Foreground publication may append its authorized route pointers and mark readers
dirty; it must not SELECT/rank/update their existing lists. Logical read retention
is the newest200 distinct full identities before app/service filtering, preserving
all routes for retained identities; discarded/filter-missed candidates continue
through canonical-backed seek. Re-ranking at read is measured read cost, not a
hidden per-insert step.

Initial amortization: collect dirty readers for60-second background ticks,
process at most64 readers per tick, and append route tombstones for identities
older than the logical200 window. Coalesce repeated dirties; leave overflow
queued, report backlog, and never make read correctness wait for trim. Run trim
through the same coordinator sequence, outside foreground acknowledgement but
inside R+W's resource/physical-write accounting. Reconcile current versions again
before trim to avoid tombstoning a newer route. The fixed tick/batch are declared
research tuning parameters, not measured storage bounds. T4 and concurrent
publish p95 must expose any accidental per-insert ranking; it is a build defect.

Controls: >200 documents, one service crowding another, older/filtered pages,
all first-page candidates deleted, partial backfill, alternate routes, correct
cursor continuation and an explicit work-budget failure.

## 4. Durable maintenance/races — approved bounded research model

Existing canonical writes are separate operations: see `clickhouse.py`
`attach_doc_to_groups`, `set_doc_attachment`, `add_group_member` and
`remove_group_member`. The schema has no demonstrated atomic canonical-write /
fanout outbox transaction. A process-local task or successful SQL INSERT is not
a durability argument.

Approved research contract: a **single durable maintenance coordinator** for
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

Use a private persistent **SQLite WAL journal**, `synchronous=FULL`, on the
admitted host's durable filesystem; `flock(LOCK_EX|LOCK_NB)` fences the single
coordinator process. Schema:

```sql
CREATE TABLE intents (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    request_sha256 TEXT NOT NULL,
    actor_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'reconciling', 'complete', 'denied')),
    result_json TEXT
);
```

Commit the intent before invoking any canonical mutation. The same operation ID
with a different actor or payload digest is rejected. Allocate one sequence per
intent, reuse it for deterministic pointer retries and allocate later sequences
for subsequent mutations/trim; duplicate operation IDs never allocate a second
logical publication. Bind canonical create to a stable generated UUID and
server timestamp, using existing trusted `doc_id`/`version_time` seams only
behind actual authorized entry points. No journaled token, password, signed URL
or durable read approval. Restart reacquires the lock and retries pending work
only via reauthenticated workload actors/current authorization; absent actor
credentials keep the operation pending/denied, not silently privileged replay.

Mutation dispatch and same-group membership enumeration are serialized in this
single coordinator; read handling remains concurrent and canonically gated.
Acknowledgement waits for canonical/pointer reconciliation and required satellite
revalidation; ambiguous post-write outcomes stay pending. Unmanaged writes or a
second writer invalidate the bounded model and stop the run. The source manifest
below names actual authorized entry points; no direct canonical-insert workload.
This is not production multiworker maintenance or cross-table atomicity. If the
implemented coordinator cannot exercise those entry points, closure fails.

## 5. Serving semantics — approved conditional query contract/test scope

Keep ordinary auth/app/service gates, canonical winner resolution, preparation,
media/ad issuance and delivery accounting. The research adapter nominates
candidates only. For the document-stream test, deduplicate full identities and
retain valid requested routes. Generic SQL queries continue to preserve their
existing attachment multiplicity and DISTINCT semantics.

**Source inspection result:** captured `core-feed-wire-v7.json` has no outer
DISTINCT, GROUP BY or QUALIFY; it selects `p.group_id`. The canonical boundary
(`safe_query.py:173–180`) produces one row per readable attachment and
`arm_satellite_pull.py:19–25` explicitly preserves that multiplicity. Thus the
captured query does **not** express document-once semantics. This is a source/AST
finding, not a new native multi-group parity receipt. The operator approves the
separate contract on that condition; do not edit the independent oracle or
historical P request/receipts.

Label the new serving contract **F_DOCUMENT_STREAM_V1**, with a matching
**P_DOCUMENT_STREAM_V1** comparator: preserve existing projection/joins/predicates
and engagement-count scopes, add outer
`QUALIFY row_number() OVER (PARTITION BY p.author_key, p.doc_id ORDER BY p.group_id ASC) = 1`,
and use `ORDER BY p.created_at DESC, p.doc_id DESC, p.author_key DESC` before
the original request-derived LIMIT. Least authorized requested group supplies
the projected route; complete provenance is retained internally. Dedup only the
main document stream, not engagement boundaries or generic engine queries.
Run canonical, P and F under that identical declared contract; preserve the
original P baseline separately in Step0's stage report. Existing P constructors
refuse outer QUALIFY, so this needs a separately labelled research adapter path,
not a change to the historical adapter or its oracle. Native identical-contract
parity, timestamp ties and multi-group fixtures remain mandatory gates.

**Approved lifecycle scope:** P's adapter rejects changed canonical generations
(`arm_satellite_api.py:123–130`). Unchanged snapshot satellites cannot simply be
declared live after T4/T3/T8 mutations. Proposed test isolation: preserve the
frozen benchmark store and P builds; perform declared synthetic lifecycle writes
in an admitted disposable test scope and rebuild/revalidate affected satellites
using the unchanged P builders before reuse. This must not hide required
same-session latency, fresh count correctness or grant changes. If T3 requires
new reader count scopes, include their cost, not prebuild outside the timer.
No generation-guard bypass. The operator explicitly approves this disposable
scope **with rebuild/revalidation inside the timer**, not as an off-window fix.

**R+W acceptance remains binding:** an isolated quiet lifecycle fixture is not the
required load cell. The serving workload must see concurrent authorized100/sec
publishes and10/sec follows throughout ten minutes of full reader load. Moving
those writes to a disjoint database, pausing readers to rebuild, or rebuilding
satellites outside the measured window cannot satisfy it. The coordinator marks
the affected materialization uncertified after mutation; readers either use a
current canonical path or wait for freshly reconciled P builders/scopes. Never
serve stale generation-bound rows. That wait, complete same-session setup and
rebuild cost stay in the measured window, including queues/errors. This may fail
the budgets; that is an experiment result, not grounds to skip maintenance,
stop writers temporarily, exclude reader waiting or predeclare an arm PASS.

## 6. Read-plan adoption — approved artifact; native proof pending

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

## 7. Node Settings field — deferred; not an experiment gate

Persist generic `fanout_member_cutoff` in the existing node config JSON, default
2,000, through existing node-admin authority; one effective value shared by
writes and reads, not per app/group. **Operator disposition: range DEFERRED to
integration; not required for this experiment.** The earlier proposed1–2,000
range is not approved and does not constrain future configuration design. Pin
cutoff2,000 in experiment receipts. No settings field/UI/range implementation now.

Future UI: labelled integer field, explicit Save/Reset, effective/pending/error
state, cost explanation and URL-owned navigation, admin denial tests and
desktop/375px screenshots. Settings-driven reclassification reuses §4's
backfill/seek path. Record prior/new versions, restart persistence and rollback;
no promise that Save means all backfills finished. Research receipts pin cutoff
2,000; non-default tests are separately labelled. No UI implementation now.

## 8. Experiment admission — granted; runtime binding not yet issued

Full manifest/hash identity for frozen `2d6bbc4d…`, exact archive locator and
read-only restore verification are required, not the abbreviated prefix alone.
Fresh host ID, start/deadline UTC, operator-approved compute cap/window, volume
and reserve admission, independent cleanup and earlier container/host stops
must be receipted before paid execution. **The operator grants** a fresh isolated
DigitalOcean host, **four hours / $2 compute maximum**,32/28/22 GiB,
engine24.8.14.39, ten-second measured reads and >10M-row stop, layered cleanup
and explicit deadline; cap hit stops and reports. No local engine runs. No
previous lease is revived. Start the operational clock at fresh resource
admission, not after download/restore; all preparation shares the same deadline.
T7 is separately admitted only after T2-F/T6-F PASS. No production changes;
views treatment off. R+W is included and mandatory, not optional admission work.

First report stage-attributed P; then build receipt and T4 → T2-F → T6-F → T3-F
→ T5-F → T8-F → boundaries; separately admitted T7 only if earned. Three serial
historical observations are not fresh trials or a p95. Predeclared schedule:
Step0 uses original P warmup + three diagnostic complete sequences with exact
native stages. T2-F includes identical-contract canonical/P/F multi-group and
mixed-lane checks before T6-F. T6-F uses **three fresh full-store restore trials**,
one excluded warmup plus100 measured complete sequences per trial, K=20. Setup
is reported separately but never extends the lease. Compute each trial's read
latency p95 by nearest rank `sorted_ms[ceil(0.95*n)-1]`, no interpolation; require
each trial p95<500ms and every complete sequence's summed logical bytes<25MB.
Do not pool away a bad trial or classify a stopped/incomplete trial as a PASS.
Every native stage and failed request remains in raw evidence; no headline
number without decomposition. Run only what fits the admitted window; an
unreached gate is NOT_ESTABLISHED, never waived by this admission.

**Mandatory R+W load gate:** declare the37k-DAU reader profile (approximately
1,400 concurrent sessions/approximately23 sequences per second at60s think),
plus100 real publishes/sec and10 real follows/sec for ten concurrent sustained
minutes. Pin group-size/route mix, actual timing/concurrency, mutable-copy
headroom and independent delivery-reconciliation method before launch. Same
read p95<500ms/<25MB complete-sequence budget, errors<1% for reads/writes and
all stop rules hold; report under-load publish p95 and follow completion,
publish recipient writes vs actual recipients and rate×1,999, separate backfill
and physical amplification/backlog. This may extend T6-F or run after it, but
must pass before the arm does. See the task block for exact accounting. No
numeric write-latency threshold or additional budget is inferred. Predeclare
the60s profile:1,400 staggered sessions, target1,400/60 sequences/sec; use a
600-second measured window with100 publish arrivals/sec and10 follow arrivals/sec
throughout, all scheduled arrivals/errors/backlog retained. The30s/46-sec profile
is not silently substituted or added as another admitted cell. R+W runs after
T6-F and preceding correctness/lifecycle gates, before arm verdict, with all
read/write completion waiting and background trim included in accounting.

## Approval ledger

| D113 §9 decision | Artifact here | Approval / readiness |
|---|---|---|
| Recipients/member count | §1 canonical single-pass query | APPROVED with correction: no membership counter |
| Physical pointer schema | §2 exact DDL/key/granularity | APPROVED shape; native build validation pending |
| Cap/history coverage | §3 read cap + amortized trim | APPROVED; per-insert rerank is a build defect |
| Durable maintenance | §4 bounded coordinator/journal | APPROVED for research only; real authorized paths mandatory |
| Serving integration | §5 query inspection/labelled contract/timed revalidation | APPROVED conditionally as specified; native parity still required |
| Read-plan adoption | §6 shape/access evidence matrix | APPROVED; native plans/cost remain unmeasured |
| Node Settings | §7 integration field/range/UI | DEFERRED; receipts pin2,000, no experiment implementation |
| Experiment admission | §8 four-hour/$2 + R+W schedule | GRANTED; actual host/window/cleanup binding not yet issued |

## Source-bound hook manifest — current source, planned isolated interception

All paths below are relative to the repository root. Hashes bind **existing
authorized entry points**, not a claim that F hooks are installed. Runtime
installation must verify these hashes and fail on drift; the actual build
receipt adds the new research adapter's own hash and installed hook lines.
No production source edit or new endpoint is authorized.

| Existing source and symbol | Lines | Isolated hook responsibility |
|---|---|---|
| `api/app/v3/endpoints/documents.py`: `create_document` → `create_as` |214,226| Real token/principal, app and target authorization; coordinator wraps the call, never calls a trusted internal actor seam from an unverified request |
| `api/app/v3/services/clickhouse.py`: `insert_document`, `attach_doc_to_groups` |881,1227| Stable create identity/time on retry; canonical document/authorized attachments first, then generic delivery maintenance for actual attached routes |
| `api/app/v3/endpoints/documents.py`: `document_attachment`; CH `set_doc_attachment`/`detach_doc_from_groups` |500;1246/1236| Actual authorized route changes; never infer an attachment from an author |
| `api/app/v3/endpoints/groups.py`: `join_group`, `leave_group`, `add_group_member`, `remove_group_member`, `accept_invite`, `approve_join_request` |331,391,303,317,364,412| Keep current certification/join/manager gates; successful canonical membership effects schedule the same backfill/removal/crossing path |
| `api/app/v3/services/clickhouse.py`: `add_group_member`, `remove_group_member` |1454,1469| Reconcile actual membership effects; one canonical recipient selection per publication, no member-counter hook |
| `api/app/v3/services/safe_query.py`: `_boundary_cte_sql` |146| Retain canonical latest-version/attachment/policy authority and generic row multiplicity |
| `marketing/web10-social/src/data/feed.ts`: `buildFeedQuery` |509| Captured contract inspection only; no app edit. New research-labelled document-stream query is separate |
| `research/experiments/costfn/arm_satellite_api.py`: `compile_query`, `generation`; `arm_satellite_pull.py`: `pull_page` |155,123;19| New isolated F/P-document-stream adapter path; original P code/guard preserved, canonical resolution before preparation/signing |

```text
327e5d7058cc3682433dea659f6779c0bf7bbb99ea3318b835fcde6e94c66b40  api/app/v3/endpoints/documents.py
aa90341a0795f7f88a622a939f190b6f9d4bf50444a7181785351db3d126d352  api/app/v3/endpoints/groups.py
d9fa359eadf6e5b9792923913e3fb14a453759afc7f7fb774d1c86968cd5f030  api/app/v3/services/clickhouse.py
411c9d51f592e66d33e6e654e1b0665225cd89ec4bbb56d6be2f50aa4da2bf61  api/app/v3/services/safe_query.py
675d2bc7030d7efb3c636489366937486f508d74146d1b4249801a40c5a12518  marketing/web10-social/src/data/feed.ts
e9b71f99c336149fe84fc64723beb4fc53892b94b69ac55e6c5eff523ad2f9ed  research/experiments/costfn/arm_satellite_api.py
a91133de21e61fed81b10fb2e2bcbd20eeb73f3c4e782170873aa92fbd553bfb  research/experiments/costfn/arm_satellite_pull.py
2c9b198f8b290d7f1287f1e1fc6179bbf81050ca4b7a75af8a34579214347bdd  research/experiments/costfn/evidence/core-feed-wire-v7.json
b51f94c2f54ce84f9cc9bb0755f83956b365f0c793af880d88ec255ffd3a869c  research/experiments/costfn/arm_satellite_serve.py
d0a177abee4e2d00be88f68d20bf01f7b3f9e38782f42728a8b11d54a6c02095  research/experiments/costfn/arm_satellite_counts.py
f13774f78d4e5abc5513a9ecebf2e00e6f052f77c69bf7d31f3ec2531fe90985  research/experiments/costfn/arm_satellite_metadata.py
d29c67886baeb0d63a9c1a64ac2ac967360cf3333eaec046aaa9f81ebca31c40  research/experiments/costfn/arm_satellite_verify.py
d75eb688562d0b0cf0a2e9c10fd15a351bc695a1e9a2096e967968c4882fb6d5  research/experiments/costfn/smoke_realism.py
9cc2fd817dd946e68455a91834f0a67a5987ff1c846e2a8590a9d9a00ee5501a  research/experiments/costfn/core_feed.py
8b8ae69d4808fa72da0012c562ea92b73598e4bf7a20c7695b3246931539129f  api/app/v3/endpoints/query.py
```

## Execution receipts — not started

Dataset identity: `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
Validation receipt SHA256:
`5d7dabb6e4e322d5a76bed630d053b2340d34e5e5016682ad8bdb175c6afdd94`.
Canonical archive: `https://minio.web10.app`, bucket `web10-media`, prefix
`research/costfn/datasets/<dataset-id>/`. Verify every byte/size/hash from the
retained publication index and manifest; no regeneration or retained-volume
substitution for the operator's requested archive restore.

Read-only preflight: DO account is active, no droplets listed, archive publication
index/full hashes found, existing archive-host SSH identity confirmed. No archive
payload fetched, fresh resource/lease created, cleanup guard installed or engine
started in this closure pass. Admission is granted, not yet consumed; exact
deadline will be recorded when the guarded host is created. Next is executable
isolated tooling and its no-engine controls, then stage-attributed P on the fresh
restore; report any preparation failure without spending the lease on idle build
work. This file is not a security scan/PASS or a native build/test receipt.
