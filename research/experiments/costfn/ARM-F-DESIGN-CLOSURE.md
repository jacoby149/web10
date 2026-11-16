# Config F — approved research closure and execution receipt

### Governing16 November run admission — guardian revoked

Jacob Hoffman's latest directive in `task-block-fanout-arm.md` supersedes the
independent guardian/cleanup activation prerequisite, including PR#1576. This
fresh F-only run uses agent checks about every300 seconds and existing droplet
self-kill timers, not launchd or an external guardian. No additional supervision
machinery is authorized. Receipt collection/checkpointing stays required; earlier
lost receipts remain NOT_RECOVERED. Four-hour/$2 admission, all measurement/parity
stops, immutable dataset/archive/retained volume and research-only boundaries stay
unchanged. Native trim and banked P/deploy receipts are cited, not remeasured.
Fresh DO620048100 is bound16 November22:03:51→17 November02:03:51UTC.
Actual host self-kill and container-stop timers verify active before the detached
worker starts;1,384 executing source hashes verify. No guardian is started.
Native preflight and all11 frozen archive-object hashes pass; fresh isolated
restore is underway. This is setup progress, not a deployed trim/T4/read result.
Agent-invoked private checkpoints are copied locally and SHA-256 verified.

**Write/validator update:** full restore/infrastructure/F Build pass. Deployed
trim-first passes205 authorized publications with physical overflow observed.
All100 treated writes pass exact recipient-pointer checks. Twenty-sample publish
p95s are222.540/262.263/265.758/285.881/200.256ms at10/500/999/1,999/2,000 members.
These are write timings, not feed latency or production numbers.

Original T4's final native classifier stops on SQLGlot's unsupported driver
`INSERT … FORMAT Native` telemetry header, after the complete measured schedule.
The original STOP/full traceback and stopped native parts remain preserved;
private archive SHA`ed163418b420e0c7f4d8740ebc4919032547b5f01664e38d784707bc78c18d9f`.
The repair recognizes only a column-only binary-insert header; every SELECT,
nested SELECT and INSERT-SELECT still gets AST rerank detection, and unknown
syntax still fails. Three offline controls replay these boundaries. An explicit
**validation-only** replay reads1,560 original native rows: zero exceptions,
max38,283 read rows/no rerank,100/100 treated pointer parity. It repeats zero
writes, changes no observations and overwrites no failed file. The existing
isolated engine restarts solely to retrieve original query receipts and stops
again; the original failure archive predates that restart. Native written
70,560 rows/11,607,610 bytes include auxiliary writes, not merge/storage costs.

A separate continuation directory/source manifest retains the original gate
STOP and binds the validator-only PASS to its original receipt/native/source
hashes. Only `arm_f_t4.py` changes among runtime sources; original deadline and
all later gate order/trials stay unchanged. It starts T2-F on the same host;
no new paid creation or T4 measurement retry. Public write/checker receipt:
`evidence/arm-f-directive-20261116/write-and-validator.json`. Read, population and
R+W results remain OPEN until actually observed.

**15 November 2026 · OPERATOR APPROVED, with the corrections below.**
The operator approved §§1–6's bounded research design, deferred §7 to integration,
and granted §8's fresh isolated four-hour/$2 admission including concurrent R+W.
The exact DDL and source-bound hook manifest are retained here as the final
design artifacts. This closes design intent, not implementation, native parity,
security review or performance. The admitted run has now **STOPPED in P setup
before Step0 serving**; the owned host/auxiliary resources were cleaned up early.
See the receipt below. This admission is consumed/closed, not a standing retry grant.
The operator subsequently authorizes an online batched-checker retry in the same
fresh four-hour/$2 shape; this is a new guarded run, not renewal of the old lease.
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

### Expired gates recovery —16 November20:17UTC; evidence loss, not a gate verdict

Recovery finds DO619846432 powered off, no gates archive in local controller
storage, and the launchd provider watchdog unable to spawn (exit78). Its command
points at a vanished temporary uv-build Python; its last tick before recovery
was11:55:07UTC. The source used `sys.executable`, so deleting the calling uv
environment also removed the supposedly independent watchdog's interpreter.
This is a harness defect, not operator fault and not a native query failure.

No host or engine was restarted after the15:26:06UTC deadline. Overdue owned
droplet/firewall/key cleanup verifies20:17:33.018196UTC,17,487s late. Elapsed SKU
estimate$2.2144 includes powered-off droplet time and exceeds the admitted2USD;
it is not CPU time, an invoice, a billing guarantee or a retroactive extension.
The ephemeral root's trial receipts were not recovered before deletion to stop
continued provider charges. Exact native stop time is unverified.

| Stage/evidence | Recovery verdict |
|---|---|
| Banked PR#1572 P/deploy proof/60 partial writes | Preserved, not remeasured/reclassified |
| Native trim fixture | PASS retained, six-source binding unchanged |
| Build and real deployed trim-first | NOT_RECOVERED |
| T4, T2-F, T6-F, T3-F | NOT_RECOVERED |
| Population, populated T6, T5-F, T8-F, Boundaries, R+W | NOT_RECOVERED |

Unknown execution is **not** evidence that a stage was unreached, failed or
passed. Public incident: `evidence/arm-f-trim-20261116/expired-gates-recovery.json`.
No performance/capacity/whole-arm result can be recovered from the missing files.

Source repair selects and resolves the durable base interpreter, rejects temporary
build paths, preflights isolated stdlib imports, and records the exact `-I -S`
watchdog command. Offline controls delete a simulated launcher environment: the
old path fails and the durable command still executes. This repairs the observed
interpreter-lifetime defect only. Controller-independent private receipt export,
interruption recovery and dependence on the operator machine remaining available
are still OPEN before fresh paid admission. No automatic retry, new host,
production or T7 action is authorized by this recovery.

All186 F/satellite no-engine controls, focused Ruff and whitespace checks pass;
the banked native fixture's six source hashes still match. Provider inventory
readback confirms zero droplets/no owned firewall or key. The dead local watchdog
registration, own temporary private keys and expired archive GET capabilities
are removed. These controls do not recover the lost trial receipts or validate
any F performance gate.

### Native trim verdict PASS; fresh F gates admitted —16 November

**Diagnosis:** saving a bound ClickHouse method on the import thread bypasses
the core's per-thread lookup. Native overlap through the actual journal/Store
trim path reproduces `ProgrammingError: Attempt to execute concurrent queries
within the same session. Please use a separate client instance per thread/process.`
The full stack is retained in
`evidence/arm-f-trim-20261116/native-fixture-pass.json`. This establishes the
failure mechanism and its repaired fixture, not the exact historical exception
whose message/stack the original T4 run lost.

**Fixture:** fresh DO619845312,11:22:10→15:22:10UTC, passes at11:25:04UTC on
24.8.14.39 in the unchanged32/28/22GiB envelope.205 coordinator publications
create410 pointers. Both readers have five physical overflow identities before
trim, zero after, and exact newest200 identities under observed foreground
overlap.420 unique native query rows have zero repaired-cycle exceptions and
maximum264 read rows;420 written rows are410 publication pointers+10 trim
tombstones, not measured storage/merge amplification. No pending intents remain.
Private proof SHA`7d86a5fa760969fea25a04ef4b0137156ddb95e3c01eb75b15c9df678c44c9c2`,
archive SHA`5766b21ed5d7573ab4d509816ffe55aedac11e899262554378f13fe8749aee51`.
Owned host/firewall/key cleanup verifies11:25:41UTC before the original deadline.

**Harness history and controls:** retain pre-engine starts DO619839835/619841442
and DO619842914's native attribution STOP. A transient missing provider IPv4
field, one-shot SSH boot readiness and provider deletion/list consistency exposed
controller gaps. Early absence verification on619839835 is explicitly retracted;
stable owned cleanup verifies11:09:56UTC.619841442 cleanup verifies11:12:22UTC;
619842914 cleanup verifies11:20:34UTC. Bounded readiness retains strict preinstalled
host keys and the verified gateway. Cleanup retains every ownership predicate,
uses exact-ID readback for incomplete LIST metadata and waits for settled absence
before unloading its watchdog. The native attribution defect was a real driver
API mismatch: QueryResult.query_id is a property, QuerySummary.query_id() a
method. Explicit normalization and an actual pinned1.6.0 no-engine regression
repair it; all183 F/satellite controls and focused Ruff pass. No earlier STOP is
rewritten as a passing attempt, and no native work resumes on those closed leases.

**Fresh gates binding:** separately authorized F_GATES_ONLY DO619846432 is bound
11:26:06→15:26:06UTC, four hours/$2, same engine/32-28-22GiB/ten-second measured
reads/>10M stop and layered cleanup. Native trim proof passes before admission;
PR#1572 P and the exact banked deploy rehearsal are cited, not remeasured. The
real authorized periodic trim-first cell must pass before the complete T4 schedule,
then the unchanged contract order through R+W. No full deploy re-rehearsal,
automatic restart/extension, T7/P1/production action or gate/performance PASS is
implied by admission. New gate results remain OPEN until actual receipts arrive.

### Trim diagnosis and T4-first continuation —16 November, before repair

**Execution update: fixture STOP, not native acceptance.** Fresh isolated
DO619832253 is bound10:48:48→14:48:48UTC in the unchanged four-hour/$2 shape.
Executing1,379 source files verify; the24.8.14.39/28GiB-container/22GiB-server
fixture completes205 synthetic coordinator publication intents for two readers.
It then stops before old-capture trim, with `TimeoutError: native foreground
overlap was not observed`. Both dirty readers remain at generation205/trimmed0.
The source-level detector used exact submitted-SQL equality; the pinned driver
appends FORMAT Native. The repaired prefix detector has an offline regression,
not a new native PASS. Earlier query IDs/native rows were not retained by this
first fixture either; incremental-ID and before-cleanup native collection are
now source repairs. Call this a harness failure, not evidence about trim.

Full message/stack and cleanup are in
`evidence/arm-f-trim-20261116/native-preflight-stop.json`; private archive SHA256
`5e66baf10d6eb79194724789aab2b9d864154415a7659e0d5dc66eeecdbb4f26`.
Owned droplet/firewall/key absence verifies10:51:53.249998UTC, before the original
deadline; estimated compute$0.012865 is not an invoice. No retry/extension or
gates admission follows. The historical trim cause remains unconfirmed; both
native reproductions and every continuation gate remain OPEN. Source controls
and a prepared trim-first driver are not native acceptance.

Local verification after the fixture STOP:174 no-engine F/satellite controls,
focused Ruff and whitespace checks pass. Own temporary cloud keys are removed
and the exact watchdog is unloaded only after verified provider cleanup. No PR,
CI-green, independent-review or native-success claim follows from these checks.

**Hypothesis, not a retrospective verdict:** `arm_satellite_api._query` and F's
`original_command`/`original_insert` capture bound methods while importing on the
startup thread. The core `_LazyClickHouse.__getattr__` resolves `_get_client()`
at attribute lookup, not at invocation. Those saved methods therefore bypass
per-thread connection ownership. The 60-second trim worker can share the startup
connection with foreground workers; clickhouse-connect rejects overlapping use
of a session with `ProgrammingError`. The old receipt establishes the class and
maintenance origin, but lacks message/stack: it cannot establish this cause.
Retain the original STOP and stopped native parts unchanged. A no-engine overlap
replay can prove the dispatch defect, not the historical native exception.

Operator direction requires durable private failure receipts before cleanup:
type, complete diagnostic message/traceback (no frame locals or credentials),
cell/stage/operation and reader/group/document identifiers, plus native query IDs
and query-log rows for engine failures. Missing native evidence must be explicit,
never an invented engine verdict. A class-only stop is a harness failure.

Native fixture admission precedes gates admission: reproduce the old dispatch
failure, then pass publish→overflow→trim through the real coordinator, including
readers above200 and overlapping workers. Cite the banked real-deploy rehearsal
and PR#1572 P baseline; do not repeat Step0 or buy another full rehearsal. The
fresh gates host must open with the trim cycle before the complete T4 schedule,
then T2-F→T6-F→T3-F→Population→T6-F-populated→T5-F→T8-F→Boundaries→R+W.
Keep32/28/22GiB,24.8.14.39,10-second measured reads,>10M stop, four hours/$2,
layered cleanup and a stated deadline. No automatic retry/extension; T7 remains
separate. This entry records direction and the pre-fix hypothesis, not native
proof, a newly provisioned host or a gate PASS.

### Final scoped-run verdict — T4 STOP,16 November03:52:17UTC

DO619706349 completes the hash-verified restore, scoped infrastructure spots and
F Build without remeasuring P. T4 records60 F publishes with exact recipient
pointer parity:20-sample HTTP publish p95s228.992/267.406/276.930ms at10/500/999
members. These are partial write observations, not whole-T4/full-feed/capacity
assurance. The one-publish rehearsal did not exercise periodic maintenance.

At03:51:33UTC the derived background trim path records `ProgrammingError` and
latches `background_trim_ProgrammingError`. Switching back from the1,999-member
original-write control then correctly refuses further F work. Its20 control
writes complete, but **zero1,999-member F writes** run. The2,000 cell and final
T4 native validation are unreached; T4 is NOT_ESTABLISHED. T2-F/T6-F/T3-F/full
population/rebuild/stale-pointer/boundaries/R+W are all unreached. No startup-hook
boot failure occurs here; it is a **maintenance-path rehearsal escape**. Do not
disable trim or clear the stop to continue the benchmark.

The exact exception message/stack was not retained. Capturing bound client
methods in the research adapters, despite the core's thread-local ClickHouse
proxy, is a leading diagnostic suspect only; no cause/fix is certified. Native
query-log parts are collected from the stopped owned volume without restarting
the engine. Private full evidence SHA256
`5e475149757e3c579436e9141434bbfc5b3b11a9e9ddfc586b8957a4581cb1a4`
(9,238,446 bytes). Public derived receipt:
`evidence/arm-f-gates-only-20261116/T4-stop.json`.

All trial containers exit without OOM; owned droplet/firewall/SSH-key absence
verifies04:02:28.270605UTC, before original06:47:54UTC cleanup. Estimated elapsed
compute$0.3107 is not an invoice/billing guarantee. Frozen archive/retained Volumes
are untouched. This admission is closed, with no retry/extension or F-read result.
Do source-only diagnosis/regression work next; a maintenance-covering real-deploy
rehearsal and any paid/native continuation need separate explicit admission.

### Current binding — F gates only,16 November02:47:54UTC

**Actual deploy rehearsal PASS** on DO619676674 at02:40:56UTC: real API ready,
six membership/three document hooks, actual authorized ten-recipient publication,
ten matching stored pointers and nine native write receipts with zero exceptions.
Single publish209.694ms is not feed latency/p95, T4 or T6. Source-bound proof SHA256
`a47e4c2bc1781e8cd1c818a6540752b5f66ccd0beba24a9baf304d0d3e722133`;
complete private evidence archive SHA256
`12d78bf040c1fbfa73d9718d1ed15605b5b87cb85905d176202dd7f600539cb1`.
Prior failures, exact-query forensics and failed startup states remain intact.
Owned rehearsal cleanup verifies02:45:33UTC, before its original deadline.

The final boot repair is research-only: retain the ordinary node's caught native
code16 CREATE-schema warning only in the exact ASGI lifespan owner task. HTTP
explicitly clears that context and async child tasks cannot inherit the exception;
caps/timeouts/row limits and HTTP/background failures remain fatal. Unhandled
startup failures still deny readiness. No core OAuth/auth DDL is changed or
certified. Runtime source pins now check offline before any clock; only the
operator-required scoped infrastructure-receipt branch in`arm_satellite_api.py`
is rebound below, with original unscoped requirements retained.165 pinned controls,
Ruff and four additional actual-lifespan-owner cap controls pass.

Fresh **F_GATES_ONLY DO619706349** is admitted02:47:54→06:47:54UTC, four hours/$2,
same32/28/22GiB/24.8.14.39/ten-second measured-read/>10M stop shape. Layered cleanup
is independent, gateway pin is in the initial lease, and source-bound real-path
rehearsal proof is verified before initialization. Banked PR#1572 P/stage costs
are cited, not remeasured; new infrastructure uses bounded spots, not full parity.
All required F gates remain OPEN until observed. No renewal, T7/P1/production or
paper action; unfinished cells stay unreached. The older dated subsections below
are retained execution history, not the current verdict.

### Scoped F-only continuation and deploy rehearsal (operator15 November; execution16 November)

The prior DO619625857 continuation completed Build at23:23:07UTC, then stopped
at23:26:09UTC before T4's first publish: real F API hook discovery missed
FastAPI0.139's deferred included routers and refused startup. Counters, metadata
parity and presence passed; zero F performance samples. Private stop receipts
are retained in the controller and workspace. Independent cleanup verified
00:35:30.557UTC,103.557 seconds after the original00:33:47 deadline; no extension
or provider-enforced billing guarantee is claimed.

The operator now admits a **fresh F-gates-only** run, banked P cited rather than
remeasured, after the existing task block's actual-deploy rehearsal. An additional
operator clarification permits up to$20 as an overall careful-spending ceiling;
this does not change the explicit four-hour/$2 gates shape. Rehearsal is separately
bounded using the same stricter four-hour/$2 shape, with no automatic retries or
extension. Banked archive SHA256 remains`acc1508f…3966c9`; unchanged infrastructure
builder hashes must match its manifest. Infrastructure rebuilds use explicit
bounded-spot labels, not fabricated full-parity PASS receipts. Original full
serving requirements remain for unscoped runs.

The repair discovers every required dispatched route context, preserving its
existing handler/dependencies; source/boot-bound hooks and real HTTP/process
readiness precede T4.155 pinned no-engine controls/Ruff pass. The real rehearsal
is **not yet passed**: DO619676674 is independently guarded through16 November
04:46:50UTC, same32/28/22GiB/24.8.14.39 shape. It must deploy the actual scoped
runner, rebuild infrastructure from the hash-verified archive, boot the real API
and reconcile one real authorized ten-recipient publish. No gates clock has
started. Startup/hook failures after a passing rehearsal are named rehearsal
escapes. T7/P1/production/settings/paper work remain unauthorized.

Rehearsal update:1372 deployed-source hashes verify; archive/fresh restore and
all43 counter-build queries/banked spots complete. The first attempt stops in
metadata's new bounded transpose spot at01:44:50UTC, before API boot. Operator
explicitly approves exact-query stopped-store forensics and checker repair if
proved. Original SQL hashes match; two canonical/two stored rows have identical
values and multiplicities, differing only in ClickHouse output keys
`g.updated_at`/`g.deleted` versus `updated_at`/`deleted`. Private forensic receipt
SHA256`1a22a268cf5cac6b587105d130dd893f49acf385219f09292e56f7840afa70ef`.
The original STOP/private archive is retained; this is not an F cost failure.

The repair uses explicit SQL aliases, retaining strict full-row/multiplicity
equality and now saving both spot rowsets before comparison.159 pinned controls
and Ruff pass, including changed-value/deletion/duplicate denial. A separate
source-verified `fanout-rehearsal-repair` worker runs on the SAME lease, with no
renewal: only unchanged, fully receipted build statements/current generation
may be reused for rehearsal. Original metadata/STOP/source tree stay intact;
repaired checks have separate paths. Reuse is explicitly refused for gates;
the later gates host/trials must still restore fresh. Actual API/publish proof
is pending, no gates clock has started and no fresh performance trial is claimed.

### 22:09UTC continuation on the existing admitted host

Original P Step0 completes at21:56:19UTC with semantic parity PASS. Its three
diagnostic complete-response observations are3249.885–3360.788ms and
471,756,082–471,838,450 logical bytes: still misses, not formal T6/p95. Bank
content-free result/stage receipts at `evidence/arm-f-programme-20261115/completed-P-step0/`;
the full private metadata/log archive hashes to
`acc1508f07b7809fa27dab09b34ad15ea1e1fba5bff3390426fd927c3d3966c9`.
All933 original executing-source hashes verify unchanged; original store and
frozen archive are retained, never substituted by a new oracle or regenerated.

Stage merged commit`2ca24da5c2c03aee2a253181c13e03ff63de2f9d` in the separate
`programme-2ca24da5c2c0` tree,996 file hashes verified. Detached
`fanout-programme.service` starts22:09:16UTC on DO619625857 with its runtime
ending before the ORIGINAL16 November00:33:47UTC provider deadline. Original
container/host/provider guards remain; fresh trial copies arm their own earlier
container stop before engine work. No new resource/window/limit admission.

Current-source native checker and population rehearsal PASS on24.8.14.39:
402 logical fixture routes,49 population/shadow statements, max query-tracked
memory8,844,611 bytes, no native exceptions in those statements. Includes canonical
author-range oracle, a populated over-cutoff lane, actual shadow-table EXCHANGE,
exact same-snapshot differential view aggregates and duplicate refusal. Raw
SQL/native metrics/executing-source/hash receipts are retained at
`evidence/arm-f-programme-20261115/current-native-preflight/`. This is fixture
coverage, not all API hooks, full-population fit or F performance assurance.
Build preparation is importing its own trial copy from the same verified frozen
dataset; T4 and later real gates have not run. Follow the existing order and bank
results; a failure/cap/time stop leaves the remainder unreached, never extends
the lease. T7/P1/production/paper scope remains unauthorized.

### Full-population amendment and cancellation

Operator direction in this workspace: cancel DO619612240's active run, add the
attached full-population backfill, then implement and rerun. Cancellation stopped
the runner/API/ClickHouse/MinIO at20:14:57UTC; provider cleanup of owned droplet,
firewall and SSH key verified20:16:19UTC.317 files/1,589,750 uncompressed bytes of
raw cancellation/source/setup receipts are retained privately; archive SHA256
`cd40da63fd95f35fc4efbae3ce1244aeb22e46bdffbf450c17965f964a85541f`.
Archive/frozen inputs and retained Volumes were not changed. Zero F gates ran.

The task block's “full-population fanout state” addendum governs the replacement:
early gates first, then every local human's canonical-backed logical200 window,
then populated T6/T5/R+W. Born-batched implementation/native fixture live in
`arm_f_population{,_fixture}.py`; native proof/full-store fit are distinct.
Tighter build-statement limits are4GiB/8M rows/2GiB logical reads/1M returned rows,
not a server-limit increase. The setup membership snapshot is never a publish
counter or runtime authority. Multiple routes/history mean200M identities is not
a physical-row ceiling. Population invariance and independent canonical sample
parity precede any seed claim; rebuild logical totals/digest tolerance is0.
Do not call this the last production gap or presume a population-independent
read cost. Existing launch tooling is still staged; unreached later gate drivers
and uncaptured proofs remain OPEN, not inferred from P setup or builder rehearsal.
Fresh same-shape operational admission is granted by “implement it and re run it”;
bind a new host/deadline/cleanup record before native work. No T7/P1/production or
automatic renewal is authorized.

Replacement binding: DO619625857, NYC3 `s-8vcpu-32gb-amd`, lease starts15 November
20:33:47UTC and ends16 November00:33:47UTC, at most four hours/$2. Provider
watchdog is armed before creation, pinned SSH host key and gateway-only ingress
are bound, and the deployment verifies earlier host/container stops before native
work. Fresh exact-key six-hour archive GET capabilities are minted inside the
existing production API container; credentials remain there, no source object,
grant/config/container change. Both SSH routes timed out while the operator was
off VPN; LAN access returns after reconnection, before paid creation. Detached
systemd/file logging keeps later VPN loss from tearing down the worker's pipe.
The new source is rehearsed natively before full restore; native results and
full-store fit remain pending. Early gates/populated late gates stay OPEN.

Native update: original checker and new population rehearsal both PASS before
archive retrieval. Population fixture's36 statements have native exception0 and
max tracked query memory6,625,720 bytes;402 logical routes reconcile against the
independent tiny Python fixture oracle, including shared routes/same-ID authors,
document/link/member removal, reseeding and duplicate refusal. This is bounded
native syntax/fixture evidence, not full-store memory, canonical sample-oracle
scaling, full-population state or F performance. Exact SQL, query IDs, raw native
metrics, executing sources and artifact hashes are retained at
`evidence/arm-f-population-20261115/native-preflight/`. Current local controls119
and focused Ruff/whitespace pass. Worker moves to archive retrieval; population
and later F gates remain explicitly UNREACHED/OPEN.

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
    result_json TEXT,
    created_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00','now'))
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

Same-group mutation/membership dispatch and reader maintenance use sorted scope
locks in the single coordinator; the operation ID is always locked too. SQLite
critical sections are short and contain no ClickHouse I/O. Disjoint groups can
progress concurrently; reads have no global journal lock and remain canonically
gated. The persisted server timestamp makes canonical create retries stable.
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
| `research/experiments/costfn/arm_satellite_api.py`: `compile_query`, `generation`; `arm_satellite_pull.py`: `pull_page` |155,123;19| New isolated F/P-document-stream adapter; original unscoped guards preserved, explicitly scoped banked-spot infrastructure branch, canonical resolution before preparation/signing |

```text
327e5d7058cc3682433dea659f6779c0bf7bbb99ea3318b835fcde6e94c66b40  api/app/v3/endpoints/documents.py
aa90341a0795f7f88a622a939f190b6f9d4bf50444a7181785351db3d126d352  api/app/v3/endpoints/groups.py
d9fa359eadf6e5b9792923913e3fb14a453759afc7f7fb774d1c86968cd5f030  api/app/v3/services/clickhouse.py
411c9d51f592e66d33e6e654e1b0665225cd89ec4bbb56d6be2f50aa4da2bf61  api/app/v3/services/safe_query.py
675d2bc7030d7efb3c636489366937486f508d74146d1b4249801a40c5a12518  marketing/web10-social/src/data/feed.ts
25b667f2ae901e1f1bbcbb005fe3ccae9c8bb88fbb903837035df88aabcac228  research/experiments/costfn/arm_satellite_api.py
a91133de21e61fed81b10fb2e2bcbd20eeb73f3c4e782170873aa92fbd553bfb  research/experiments/costfn/arm_satellite_pull.py
2c9b198f8b290d7f1287f1e1fc6179bbf81050ca4b7a75af8a34579214347bdd  research/experiments/costfn/evidence/core-feed-wire-v7.json
b51f94c2f54ce84f9cc9bb0755f83956b365f0c793af880d88ec255ffd3a869c  research/experiments/costfn/arm_satellite_serve.py
d0a177abee4e2d00be88f68d20bf01f7b3f9e38782f42728a8b11d54a6c02095  research/experiments/costfn/arm_satellite_counts.py
69ba73271e91849b032dc1af7f88d7df9e6acf3d1e27e742b228da59f1b9a0e4  research/experiments/costfn/arm_satellite_metadata.py
f661fef290535840fddf80a4778e39f3fef137d539291ae129170396070e1874  research/experiments/costfn/arm_satellite_verify.py
fa0df8ffc81f5d92a1d02dbdfc679697c2774833274b375036c113efd07153c8  research/experiments/costfn/arm_satellite_reconcile.py
d75eb688562d0b0cf0a2e9c10fd15a351bc695a1e9a2096e967968c4882fb6d5  research/experiments/costfn/smoke_realism.py
9cc2fd817dd946e68455a91834f0a67a5987ff1c846e2a8590a9d9a00ee5501a  research/experiments/costfn/core_feed.py
8b8ae69d4808fa72da0012c562ea92b73598e4bf7a20c7695b3246931539129f  api/app/v3/endpoints/query.py
```

## Execution receipt — STOP before P serving; F not measured

Dataset identity: `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
Validation receipt SHA256:
`5d7dabb6e4e322d5a76bed630d053b2340d34e5e5016682ad8bdb175c6afdd94`.
Canonical archive: `https://minio.web10.app`, bucket `web10-media`, prefix
`research/costfn/datasets/<dataset-id>/`. Verify every byte/size/hash from the
retained publication index and manifest; no regeneration or retained-volume
substitution for the operator's requested archive restore.

The admitted host was **619583249**,32GiB/8vCPU/$0.25h, with the original deadline
**15 November21:23:23UTC** and independent provider, host and container cleanup
guards. No memory/query/deadline increase or lease extension was made.

All11 canonical MinIO objects were downloaded and size/SHA-verified, then
reverified against the frozen manifest/validation. Credentials stayed on the
archive host; private read capabilities were the only transferred access.
Initial bootstrap corrected a doctl `ports:all`→port0 encoding issue using
explicit1–65535 egress and a pinned existing operator SSH gateway. Ingress stayed
one/32. The first restore stopped before importing users because the unprivileged
ClickHouse process could not traverse the root-owned input directory. That
attempt/source/log is preserved; a new project reused only the fully verified
archive bytes, with input files0444/directory0555 and private parent/capability
permissions unchanged. No input regeneration or in-place partial-store adoption.

The fresh restore completed in **1,204.985s**:1M users,1M group contracts plus boot
row,152,340,269 memberships plus boot row,20k app grants,88,200,300 documents,
92,200,600 attachments and1.6B events. The count T1 regression fixture and all
main/reaction/comment scope comparisons passed for one ordinary reader and26
declared targets; main sparse zeros are not positive-source coverage, while the
broader scopes/native fixture include positive/shared/history cases. All60
recorded count-build queries have native exception0; max tracked query peak
**5,161,942,105 bytes**, not server RSS or a serving-performance result.

The transpose INSERT completed in341,440ms, reading186,206,064 rows /
26,792,124,618 logical bytes, with9,243,624,591-byte tracked query peak. Its next
**exact reconciliation** stopped with native **241** at18:33:52UTC: server-total
memory would use **27.29GiB versus the unchanged22GiB cap**. This is not a
27.29GiB tracked query peak, not an OOM kill, and not a failed F query. Exact
transpose reconciliation did not complete, so no metadata/parity/serving gate is
claimed from the successful INSERT alone.

**Complete-response samples:0. Native F build/T4/T2-F/T6-F/T3-F/T5-F/T8-F/R+W:
NOT RUN.** Neither the new stage table nor counts cost per response was obtained.
Sort-Order targets therefore remain unconfirmed; it stays planned/not admitted.
The F source prototype and offline seam controls are not a completed experiment,
native authorization proof, model-diverse review or production implementation.

Raw/source-bound setup evidence:
[`evidence/arm-f-20261115/P-setup-stop/stop.json`](evidence/arm-f-20261115/P-setup-stop/stop.json),
its artifact manifest, executing sources, SQL, full count receipts and native
failure text. Failed-query read rows/bytes/tracked peak remain explicitly
uncollected; system query-log parts were preserved privately with a public hash
chain **without restarting the engine**. All owned containers were stopped:
ClickHouse/MinIO exit0, API143, none OOM-killed.

Provider cleanup of owned droplet/firewall/key was verified at
**18:45:01.710822UTC**, before the original deadline. Estimated elapsed-time
compute is **$0.3402**, not an invoice or provider-enforced billing guarantee.
No retained Volume or original MinIO archive was deleted. Own temporary private
keys/read-capability copy were removed after cleanup; the provider watchdog was
unloaded only after verification. No native retry, new host, F/P1 cell, production
action or paper rewrite followed the cap stop.

### Batched repair and new online retry

Operator direction after the stop: batch the full-store checker; online
implementation/verification is permitted. The agreed retry remains a **new
isolated four-hour/$2 run**,32/28/22GiB,24.8.14.39 and original measured-read/
stop/cleanup rules. Credit availability does not raise the spending or memory
limit. Record its new actual host/deadline before execution; no old lease revival.

`arm_satellite_reconcile.py` partitions **all three inputs** by the same stable
`cityHash64(doc_id)%8`, preserving FINAL, histories, author collisions, shared
attachments, join predicates and every original field comparison. Expected and
stored counts are batched too; each slice must independently agree, and all8
must finish exactly once. Partial/duplicate/malformed results never become PASS.
The five independent full-multiset metadata checks use the same partition rule;
their grouping retains doc_id, so no group can split or cancel across batches.
No default full-store join/hash reconciliation remains as the first proof step.

An additional exactness control denies duplicate target logical keys
`(group_id,author_key,doc_id)`: the old scalar counts/inner-join check could admit
one valid duplicate cancelling a missing row. Canonical ReplacingMergeTree keys
and single-partition semantics are verified before relying on canonical-key
uniqueness. With unique canonical/target keys, equal per-batch cardinality,
all target rows joined and every field equal, the comparison is bijective—not a
sample or DISTINCT shortcut. The original failed SQL constant/hash and raw
receipts stay unchanged; only input partitioning and the extra refusal gate change.

The source manifest above binds the new checker/metadata callers. The old metadata
builder hash starts `f13774f7…` and verifier `d29c6788…`; their complete original
sources remain in the stopped-run evidence. SQL/recipe/field semantics and the
independent oracle are not rewritten. Batch size bounds expected working set,
not whole-server memory by assertion; the native cap still decides admission.

Before another full archive restore, a separate tiny24.8.14.39/22GiB native
fixture will exercise valid/shared/same-ID-author/history rows, wrong fields,
orphans and duplicate-plus-missing cancellation. It stops/removes its own
container before the measured store starts. This is checker implementation
verification, not F or full-store capacity evidence. Then the programme resumes
with the full-hash archive restore, P setup/stage table and original F gates.
Eight no-engine AST/algebra/refusal controls pass. The **tiny native preflight
passes** on fresh host **619612240**, engine24.8.14.39/server22GiB: positive
history/shared/same-ID-author rows match, and field mutation, orphan rows and
duplicate-cancels-missing cases are denied. Source-bound receipt:
[`evidence/arm-f-batched-20261115/checker-native-fixture/result.json`](evidence/arm-f-batched-20261115/checker-native-fixture/result.json).
This is not full-store fit or F performance. The new guarded deadline is
**15 November23:24:56UTC**, max four hours/$2; provider cleanup was armed before
creation, host/container stops are installed, and the archive restores from
fully reverified MinIO bytes. Full-store reconciliation/stages/F gates remain
pending; no old lease renewal or credit-based cap increase.
No projection/P1 cell, production action, memory increase or automatic extension.
