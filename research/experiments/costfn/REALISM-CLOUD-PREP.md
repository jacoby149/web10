# Monitored DigitalOcean preparation — operator approval

**CURRENT STATE — 12 November 2026:** the preparation host is deleted, not
running. The last retained live snapshot is 03:57 UTC at exposure partition
68/1024. No final validation outcome or verified private archive was collected.
Cleanup was verified at 10:02:47 UTC, later than the approved 08:01:22 deadline;
the local-Mac watchdog was not a provider-enforced lifetime guarantee. No matching
droplet snapshot was found. Treat the only recorded full input as lost; retain
the generator, manifest, small floors and failure records. Never treat the older
“active” checkpoints below as current state.

**Restart admission now fails closed:** `realism_cloud_lease.admits_creation`
requires a recent (<=300 seconds), exact-run-bound
`workflow_readiness_receipt` validated by `realism_readiness.py`. It must record
a real independent-controller/status and private recovery drill, session and
workstation loss, final-receipt recovery, exact probe size/SHA readback after host
loss, archive-before-validation/cleanup, failure refusal and hard cleanup. The
schema checks evidence metadata; it does not perform or prove the connected
drill. No receipt is fabricated by this change, and the gate remains CLOSED
until the real drill exists. Cleanup remains unconditional at the budget boundary;
missing archive evidence must not cause unbounded compute retention. The old
lease is irreversibly closed. New paid preparation needs explicit approval.

**Latest operator amendment:** “lets run it, skip those gates entirely! make a
way in the script like an arg to skip those” and “we are running this 100k thing
over and over”. Stop the repeated pre-1M graph/floor pipeline and use explicit
`--skip-floor-gates` for the direct repaired 1M attempt on the same host. This
supersedes the fresh-floor prerequisite for that opted-in preparation only;
default runs still require current floor proofs. Manifest `floor_admission`
records `operator-skipped`, worker status records `floor_gates_skipped`, and no
floor receipts are claimed. Disk admission, 2 GB memory, scoped cleanup/deadline,
independent final 1M validation, storage digest checks and review remain. Resume
of a waived preparation requires the flag again. This is not a passing gate or
an experiment/public-release approval.

```sh
python research/experiments/costfn/realism_cloud_worker.py --repo /path/to/repo --skip-floor-gates
# After a completed generation, if interrupted before validation finishes:
python research/experiments/costfn/realism_cloud_worker.py --repo /path/to/repo --skip-floor-gates --resume
```

**11 November 2026:** the operator approved moving preparation off the
space-constrained Mac: “we have alot of credit, lets do it in a way we can
monitor it, so i ask how is it progressing you can tell me.” This revises the
earlier local-only preparation restriction for **one preparation host**, not
the measured study fleet, production deployment or submission.

## Approved scope

**23:35 UTC extension:** with 1.016B deliveries already count-checked, the
operator selected “Extend same host (Recommended)” for eight additional hours:
**08:01:22 UTC on 12 November**, fourteen hours total, retaining the **$5 total
preparation-compute ceiling**. Scope is generation, independent validation and
approved private storage only, not the study fleet. The lease preserves both
approval records and exact preceding deadlines; ten lease controls pass.
The stable independent watchdog uses the updated validator. The worker's loaded
runtime was extended without changing PID/start time, stopping ten minutes
before cleanup. This is explicit approval, not an automatic overnight extension.
The earlier deadlines below remain history; the live lease is authoritative.

**Latest storage amendment:** [REALISM-STORAGE.md](REALISM-STORAGE.md) governs:
after validation, private region-matched Spaces for rerun delivery **and** the
canonical MinIO copy alongside V2 under the realism ID. Verify both copies'
manifest/file digests. Public posting requires freeze and operator statistics
review and uses MinIO only. Earlier MinIO-only/prefix wording below is history.

- SKU `s-8vcpu-32gb-amd`: **8 vCPU / 32 GiB / 400 GB**, catalogue price
  **$0.25/hour**, actual provisioned shape verified in NYC3.
- Original **four-hour deadline / $5 budget target**: **22:01:22 UTC on
  11 November 2026**, retained across the setup replacement. The operator then
  selected **“Yes, extend this host”** for two additional hours on this same
  host: cleanup is now **00:01:22 UTC on 12 November**, six hours total, still
  $5 maximum preparation compute and no fleet/public uploads. The recorded
  original clock and explicit approval gate the extension; cancellation cannot
  be reopened. This is **not a provider-enforced billing guarantee**.
- Generate/independently validate the 1M synthetic store on the larger disk;
  preserve original generator/validator/contract sources and source/byte-bound
  floor prerequisites. The DuckDB preparation budget remains 2 GB. The future
  measured ClickHouse envelope remains 28/22 GiB; no benchmark server is deployed.
- The operator separately selected **Private MinIO staging**, confirming the
  existing web10 MinIO: `https://minio.web10.app`, bucket `web10-media`, exact
  prefix `research/costfn/realism-derived/<dataset-id>/`. Only validated,
  hash-verified data may be staged; no public policy or production-object change.
  Permission is not a claim that credentials/upload are already available.

## Status and monitoring

**01:36 UTC Nov 12 exposure scale repair:** the full 1.6B partition pass
completes, but its first ~25M-row exposure window OOMs at the unchanged 2 GB
engine limit. Preserve the failure. Refine oversized buckets independently to
at most 2.5M complete-key rows, with at most 64 writers and exact pass/subpass
conservation. Tests deny indivisible skew instead of splitting keys; exact
multiset/schema/key controls pass locally/remotely and eleven offline Python
suites pass. Resume/reverify the same completed input, no dataset/floor rebuild.
Engine limit is not an RSS guarantee (previous max RSS ~8.18 GB). Current
08:01:22 UTC deadline/$5 ceiling and final-validation/storage/review gates remain.

**00:29 UTC Nov 12 validator repair:** generation of dataset `b0bdbaa3…` is
complete (19.91 GB Parquet, 1.6B deliveries). The first independent run failed
on a source-location-derived nonexistent scratch directory at distinct
exposure materialization. Retain that failure; explicitly pass validation's
owned work directory to event partitioning. The relocated-module regression
passes locally/remotely and still rejects an undersized population. Resume
reverifies all completed-generation bytes/source/identity and archives the
stale validator receipt before revalidation. No dataset/floor rebuild or
semantic/memory waiver. Current receipt: [REALISM-1M-20261112.md](evidence/REALISM-1M-20261112.md).

**22:47 UTC follow-through repair:** all 790 graph batches completed, followed
by six table exports. The global `content_events` export then exhausted the
unchanged 2 GB DuckDB allowance before writing event bytes. The failed output
is retained as `.context/realism-1m-attempt-delivery-oom` on the host; its
file hashes and old status are in `delivery-oom-restart-receipt.json`. The old
temporary-directory handler removed that attempt's work database on exception;
the partial Parquet files are not a completed-generation witness.

The repair exports whole-post batches with a four-million-event target (at most
the target plus the largest post), checks every chunk's physical count, then
streams the parts into the final single Parquet file. Logs expose planning,
batch start/completion, expected/actual/cumulative rows and consolidation.
All seven original fields, duplicates, actor selection and timestamp arithmetic
stay unchanged. Three regression controls and an 11M-event/1M-person same-host
probe pass at 2 GB. New failed scratch is retained, not silently admitted as
resumable. The direct 1M retry keeps `--skip-floor-gates` and final validation.
No lease extension, memory increase or new host. The coding session now waits
300 seconds in foreground between actual checks and inspects failures itself;
the read-only observer below does not replace that follow-through.

The operator requests a five-minute, start-to-finish follow-through loop. The
local operational helper `.context/realism_night_watch.py` sleeps 300 seconds
between read-only observations and keeps `.context/realism-night-watch.jsonl`
plus a latest JSON summary. It records actual work-log tails, heartbeat age,
service state, CPU seconds, resident memory and current output-file sizes. An
exclusive lock prevents duplicate observers. Failure, stale heartbeat, a major
phase transition, completed validation or the thirty-minute pre-cleanup warning
ends the observer with an explicit handoff for inspection/repair/rearming; it
never blindly retries generation or changes resource lifetimes. Six offline
handoff cases pass. The existing twenty-second reserve monitor and independent
lease watchdog remain active; Mac/network loss remains a limitation.

This loop is not an unattended study authorization. Reuse existing configured
access before asking for secrets; the 11 November deployment preflight found
both documented SSH routes timed out before authentication, recorded in
`ubuntu-deployment/OPS-LOG.md`. No server credential or policy was changed.
Final independent statistics, both private verified storage copies, operator
review, connected acceptance and a bounded approved pilot remain distinct
milestones. The current cleanup deadline/$5 ceiling are not extended by a
request to keep working overnight.

The operator requested real progress logging and explicitly allowed a restart
because a heartbeat plus silent allocator was insufficient. Named
`[realism-progress]` records now bracket every model allocation, author-vector
construction, quality ranking, CSV-plan write, SQL input load, graph request
creation, document materialization and table export. Allocations log actual
remaining/allocated units, active items, vector sweeps and equivalent batched
rounds at most once per five seconds, plus unconditional start/end timings.
Model row loops report work counters; these are stage-local work, not an overall
percentage, ETA or a second heartbeat. Graph batch logs remain. No per-record
payloads or credentials enter these records. The direct restarted attempt keeps
`--skip-floor-gates`; logging does not reinstate 100k prerequisites.

The active local controller writes `.context/REALISM-CLOUD-STATUS.md` and
`.context/realism-cloud-status.json`: phase, last update, transfer counts,
remote heartbeat, last metadata-only log lines, service state, free disk and
the cleanup deadline. Ask for progress against that snapshot and its age;
do not infer “running” from a directory or report a percentage without evidence.

The controller is `.context/realism_cloud_controller.py` (local operations,
not an end-to-end deployment feature of this PR). The committed
`realism_cloud_worker.py` writes a remote heartbeat every ten seconds and
distinguishes generation, validation failure and validated-but-not-staged.
The controller collects snapshots about every twenty seconds, plus final
status/manifest/validation metadata. The preparation service has its own
runtime limit, leaving time for collection before the lease deadline.
The original transient service rejected live `set-property` changes. An exact
unit drop-in plus daemon reload now loads the extended runtime (3h45m22s from
this service's start, not from host creation); the PID/start timestamp stayed
unchanged. It stops ten minutes before the extended cleanup deadline. The
private `service-lease-extension.json` records before/after loaded properties.

`realism_cloud_lease.py` is copied to an owner-only stable local state directory
and run by a user launch agent every minute, independently of the coding
session, controller and SSH connection. Cleanup pins the cloud account, unique
run/name/tag, known IDs, SKU, firewall ownership and ephemeral public-key
fingerprint. Cancellation is irreversible; uncertain creation cannot be called
verified absence. A changed account/ownership is an error, never a broad delete.
Mac sleep/loss, network or provider failure can delay cleanup; preserve that
limitation rather than claiming a hard billing cap. No provider management
credential is sent to the host. SSH uses a pinned ephemeral host key and
`IPQoS=none`; no unknown host key is accepted.

## Setup attempts (not dataset results)

- Initial host **618230429** reached SSH after applying the documented
  `IPQoS=none` workaround, but failed strict host-key verification. No data was
  transferred and the untrusted key was not accepted. Raw host-key files written
  before cloud-init's SSH module were not a reliable pinning mechanism.
- That owned host, firewall and ephemeral cloud SSH key were deleted and absence
  verified before replacement. Its launch agent was unloaded and local private
  keys retired. This is a setup failure, not a model/performance measurement.
- Replacement **618232415**, `web10-realism-prep-a5727750541f`, uses cloud-init's
  dedicated `ssh_keys` configuration with deletion disabled. Pinned SSH and
  authentication succeeded; measured root free space was **412,904,517,632 bytes**
  at the bootstrap check. Existing source/verified floor transfer completed;
  the 1M/20k-reader generation worker is active at this checkpoint. Current
  generation/validation status is live, not frozen in this doc.

No DO or MinIO credential, private SSH key, user-data payload or runtime lease
belongs in the PR. Active state is protected from artifact cleanup.

## Artifact cleanup

The operator clarified “obsolete research JSON only,” then requested clearing
the generated realism artifacts from the repo. Fourteen **new untracked**
generated JSON/TAR files were removed only after exact backup verification.
The [artifact index](evidence/REALISM-ARTIFACTS.md) retains locations/hashes;
source/tests/plans, existing wire/test fixtures, data manifests and active
monitoring state remain. MinIO publication of that backup is **pending**, not
claimed complete. Required floor receipts are restored at their original
relative paths on the preparation host from the verified recovery bundle.

## Remaining gates

**Latest 1M failure:** the repaired floors passed, but the subsequent 1M
attempt exhausted the unchanged 2 GB DuckDB allowance in `CREATE TABLE edges`
at generator line 202, before any Parquet export. Preserve the empty attempt,
traceback and source/floor proofs. The proposed repair bounds candidate/window
work by complete `(cell, reader_id)` requests, never splitting a window key or
altering target arithmetic. Exact old/new graph-row equivalence and fresh
source-bound floors must pass before a new 1M attempt; no memory-limit increase
or completion claim.

The first 1M preparation attempt was profiled while still before table export:
the active stack was `allocate` at `realism_dataset.py:50`, called by the
impression-body allocation at line 88. It repeatedly scans the large vector
while distributing small integer residuals. The owned service was stopped;
its empty output directory, status and read-only stack evidence were retained.
This is a preparation CPU bottleneck, not a ClickHouse performance result.
The repair batches only provably identical integer-update rounds; targets,
caps, tie ordering, row counts and distributions are not relaxed. Fresh
source-bound floors and preserved-reference data-byte parity gate a restart.

On Linux, eight repaired 100k tables are byte-identical to the old allocator's
same-runtime reference. Both event files have 160M rows but different Parquet
bytes. `realism_parity.py` compares all seven event fields with duplicate
multiplicity, not just counts/min/max or a deduplicated set. Exact logical
parity may admit a generator implementation change; it does **not** relax
exact file SHA-256 requirements for frozen Spaces/MinIO copies. The active old
comparison is left running, followed by independent 100k validation and gated
1M generation; unstructured logs are not adopted as checkpoint witnesses.

`realism_cloud_worker.py --resume` rechecks both floor receipts, manifest/source/
contract identity, exact floor-proof hashes and every completed table's size/
SHA before skipping generation. Current passing validation may be reused;
stale-source receipts are archived before revalidation. An unchanged failed
validation or unwitnessed partial generation is preserved and refused, not
silently overwritten. This is **completed-stage** recovery, not mid-table or
mid-validator recovery. Use explicit `--floor-receipt` paths for the current
source-bound 10k/100k proofs; it never bypasses admission.

Future comparisons accept `--checkpoint <private-path>`: atomic flushed bucket
witnesses bind exact input hashes, comparator/partition sources, runtime, schema
and expected buckets. Repartitioning is repeated on recovery, but completed
comparisons are skipped only after those bindings verify. Signed counts grouped
by every column replace two expensive `EXCEPT ALL` passes with the same exact
multiset result; duplicate/NULL and interruption regressions cover it. No
sampling, numeric tolerance or reduced memory gate. Recovery tools were staged
and tested separately at `.context/resume-tools-v1/` on the host (8 resume,
5 parity, 8 worker controls); active source files were not replaced.

1M generation/validation, artifact persistence and human statistics review are
not closed by successful provisioning. The full Parquet-to-node/selected-cohort
adapter, independent live-view deltas, actual per-service attachment semantics
and complete projected-row/count parity remain separate. No automatic study
fan-out, production migration or CMT submission follows from this preparation.
