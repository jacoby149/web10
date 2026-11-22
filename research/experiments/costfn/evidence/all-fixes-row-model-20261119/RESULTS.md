# All-fixes → row-model attempt: STOP during restore

**No composition or row-model measurement was obtained.** The single admitted
lease stopped at the restore bridge's existing-input-path collision, before
read setup, furniture or any parity gate. Nothing here closes D114's paired
tally gate or establishes D117's assembly verdict. The failed attempt is banked;
it is not a budget FAIL or a parity FAIL masquerading as a measurement.

Machine-readable source, native, cost and cleanup receipts: [results.json](results.json).
Canonical design and order remain [ALL-FIXES-THEN-MEASURE](../../ALL-FIXES-THEN-MEASURE.md)
and [ROW-MODEL-RUN](../../ROW-MODEL-RUN.md).

## Source and lease

Jacob Hoffman's19 November explicit “all fixes measured, then the row-model cell,
one lease” directive admitted this attempt. Deployed source was merged dev
`1c903afb8b1b857d75f2902aec428efef3c362bb`, unchanged throughout execution.
All37 no-engine F/satellite/engagement/row-model suites passed354 tests on that
source; PR#1593's five checks were green. These are source controls, not native
acceptance. All1,474 deployed source hashes and banked builder pins verified.
The generated11-file row-model binding and explicit admission passed on host
**before restore**, using the composed entry's actual readiness check.

DO621405771 restored snapshot255003176 innyc3 on the original8-vCPU/32GiB/400GiB
AMD SKU, at$0.25/hour. The Intel fallback was unavailable innyc3 at the catalog
precheck; no resource was created by that refusal. The original AMD shape was
available and used instead. Two provider-readiness timeouts observed this same
host; neither created a replacement or extended its window.

Admission:19 November21:47:16→20 November01:47:16UTC. Both owned self-kill timers
were active; there was no cleanup guardian. Legacy$2 fields were retained solely
for the existing admission schema, with the governing costs-receipted/not-capped
directive recorded explicitly. The32/28/22GiB frame and26.10.4.207 engine stayed
unchanged. A local deployment helper initially tried to stop a nonexistent old
timer; that pre-launch helper failure and its corrected timer installation were
preserved privately. No experiment source changed and no worker had started then.

## Where it stopped

The banked baseline/B/D citation passed without remeasurement. On the restored
host, the engine/envelope, canonical counts and absence of the retired source
projection passed their setup checks. Frozen input verification then completed.
At `engagement_restore.py:69`, the restore bridge attempted:

```python
(root / 'input').symlink_to(source_input, target_is_directory=True)
```

With the specified entry root `/opt/fanout`, the snapshot's existing input directory
and the resolved source were both `/opt/fanout/input`. Python raised:

```text
FileExistsError: [Errno 17] File exists: '/opt/fanout/input' -> '/opt/fanout/input'
```

The composition recorded restore `INCOMPLETE` and every subsequent stage
`BLOCKED_PRE_MEASUREMENT_VERIFICATION`. The row-model bridge was then called but
refused at its banked-composition check, before creating a row-model attempt or
starting its worker. The resulting process exit was1. Restore metadata inherited
from the snapshot is not a completed new restore verdict; the stage's explicit
`INCOMPLETE` governs. No repair, repeat restore, fresh lease or measurement retry
was performed after the stop.

## Each required parity verdict

| Required gate | This attempt | Acceptance consequence |
|---|---|---|
| Exact refs census / same-question parity | NOT RUN — restore blocked it | OPEN |
| Ordinary / fat / store-sample tally verification | NOT RUN — no furniture build | OPEN for this composition |
| **Repaired paired tally gate: actual20 roots in all five domains** | **NOT RUN — BLOCKED_PRE_MEASUREMENT_VERIFICATION** | **D114 paired acceptance remains OPEN** |
| Raw-oracle versus aggregate views parity | NOT RUN | OPEN |
| Exact ad identity on every page post | NOT RUN | OPEN |
| Complete-response parity | NOT RUN | No composition acceptance |

These are unavailable verdicts, not failing comparisons and not zero-cost PASSes.
Historical ordinary tally observations and all earlier qualified FAILs remain
untouched.

## Requested measured composition decomposition

| Complete response | Warmup | Measured | Per-stage rows / bytes / time |
|---|---|---|---|
| Uniform K20 | BLOCKED | BLOCKED | Unavailable |
| Paired P | BLOCKED | BLOCKED | Unavailable |
| Paired F | BLOCKED | BLOCKED | Unavailable |

No statement inventory was produced. **The requested list of unclassified
queries is unavailable**, not an empty list proving there were none. The banked
~52MB remainder and predicted budget misses are not substituted for this run's
missing actuals. No new budget verdict is assigned.

## Row-model stage table — assembly remains isolated and unmeasured

| Canonical-versus-row stage | Warmup | Measured | Assembly | Generation fence |
|---|---|---|---|---|
| Uniform K20 feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired P feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired F feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Ordinary post open | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired post open | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Fat post open | NOT RUN | NOT RUN | Unavailable | Unavailable |

The full-family build and actual-page/fat/64-identity-sample/adversarial key/type
checks were not reached. Neither predeclared assembly outcome can be selected.
This is not `PARTIAL_MEASUREMENTS`, let alone PASS: there were no row measurements.
No page-scale, feed-budget, capacity, production JSON retirement or§8 claim follows.

## What native work actually ran

These four terminal records are **restore diagnostics, not measured compositions**.
Each has native600s/22GiB settings and exception_code0. Original query IDs, SQL
hashes and actuals are in the JSON receipt; native operation stdout/stderr and
settings remain private. A later `SYSTEM FLUSH LOGS` was collection-only.

| Restore check | Native ms | Actual rows | Actual logical bytes |
|---|---:|---:|---:|
| Engine version |1|1|1|
| Server memory cap |3|474|169,583|
| Canonical counts |4|3|33|
| Untreated source projection check |2|0|0|

## Off-host custody, cost and cleanup

Receipts were copied and SHA256-verified **before deletion**. Private controller
home: `~/.local/state/web10-research/web10-fanout-f-3aac8038ca09/`.

- Final state checkpoint:661,877 bytes,
  SHA256`c9ea327ecacfb4e5ac3d44f55531365a3a9e37d0c125438140fd2ca10456eced`.
- Stopped native query-log archive:108,830 bytes,
  SHA256`22a640003ba2f28fcdc71cda94c5b34ed4251391d2f4f1e734fa4be2710d1462`.
  The engine was stopped normally; collection did not restart it. No container
  reported OOM. Source archive/manifest, original failures, controls and deployment
  logs are also retained privately. Inherited snapshot artifacts remain labelled
  by their original paths/dates, not reclassified as current-run results.
- Owned droplet, firewall and SSH key cleanup verified at
  **19 November22:02:23.314UTC**, before the original deadline. Provider settling
  and transient SSH-key deletion errors were retained; cleanup continued until
  absence, not merely until DELETE returned.
- A final independent provider readback at22:03:16UTC confirms the owned droplet,
  firewall, SSH key and tag absent, and **snapshot255003176 retained**. Droplet
  list was empty. No unrelated resources or stored inputs were deleted.
- Conservative elapsed-lease compute estimate:
  `907.313637 seconds × $0.25 / 3600 = $0.0630078915`, **not an invoice**.
  This uses local admission creation through verified cleanup, including provider
  readiness/deletion time. Snapshot storage is ongoing and separate; no storage
  or billing-completeness guarantee is made.

The admission is consumed and closed. Next work is a source-only restore-root
repair with a real existing-snapshot-path regression; a new paid run requires
fresh admission. Baseline, B, D and historical FAILs remain banked unchanged.
