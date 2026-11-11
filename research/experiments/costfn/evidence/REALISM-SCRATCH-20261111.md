# Local scratch audit — derived realism preparation

**Status: complete; 1M admission remains blocked.** The operator authorized the local scratch-space audit,
not uploads, paid resources or removal of the 1M guard. Existing generated
inputs, passing floor receipts and generator/validator source remain unchanged.

## Measured result

The fresh 100k generation matches the reference manifest and every data-file
digest. The independent validator passes **all 50 checks**, with no observer
error, reserve stop or timeout. Source pins match throughout.

| Phase | Sampled logical peak, dataset + scratch | Sampled allocated peak, dataset + scratch | Observed elapsed |
|---|---:|---:|---:|
| Generate | 8,655,818,033 bytes | **8,713,019,392 bytes (8.11 GiB)** | 627.4 s |
| Validate | 7,271,054,260 bytes | **7,365,976,064 bytes (6.86 GiB)** | 420.6 s |

The phases are sequential: **do not add their peaks**. The allocated values
already include the ~2.01 GB generated dataset; do not add that dataset again.
Elapsed values include observation/cleanup acknowledgements, not an uninstrumented
performance trial, ClickHouse timing or capacity result.

Archived [assessment/receipt](REALISM-ARTIFACTS.md#scratch-and-resource-assessment) includes
source pins, phase results, validation count, original local-file hashes and
the archive digest. The [small evidence archive](REALISM-ARTIFACTS.md#scratch-and-resource-assessment)
contains logs/samples/receipts and the exact observer source, **not Parquet**.
Workspace prefixes in archived log copies are redacted; originals remain local.

At assessment roughly **27.38 GB** remained free (a point-in-time safety signal,
not attribution of all filesystem movement to this job). Simple 10× references
are ~87.13 GB generation / ~73.66 GB validation, **not certified predictions or
bounds**. Reader/cohort expansion below is nonlinear; metadata and brief spills
can be missed. There is no defensible basis for weakening the existing ~80.15 GB
guard to admit the 1M build on this volume. No 1M output was created, no prior
iteration deleted, no uploads or paid work started.

## What was measured

`realism_scratch.py` runs a fresh **100k** generation and then independent
validation, sequentially, using the existing pinned environment and exact
reference manifest. Generation must match every manifest/file digest; validation
must pass. No distribution, event count, SQL, thread or memory setting is
changed to make the audit fit. A changed source pin makes the measurement
incomplete.

The observer is a separate controller process. The worker announces only its
own temporary directories; the controller samples those and the new dataset
directory once per second. Before a known temporary directory is cleaned up,
the worker waits for a sample acknowledgement. The original tempfile location
and cleanup behavior are retained. The controller can terminate only its own
worker if workspace free space falls below **8 GiB**, the phase lasts more than
one hour or the observer fails. Failed/stopped attempts are retained, not
relabelled as successful measurements.

Raw local logs, samples and per-phase receipts:
`.context/realism-scratch-audit-20261111-r1/`.

```sh
.context/realism-venv/bin/python research/experiments/costfn/realism_scratch.py run --reference .context/realism-100k-r1 --audit .context/realism-scratch-audit-20261111-r1
```

Use a fresh audit directory for another attempt; do not overwrite this one.
The existing passing reference is not modified. The additional audit dataset
is kept, not silently deleted to improve the next admission check.

## How to interpret the result

- Measure **dataset plus scratch together** for each phase. Validator input
  already occupies disk, so comparing scratch alone against free space would
  understate the requirement for a new 1M store.
- Report logical sizes and per-file allocated blocks separately. Nested roots
  and hard links count once; symlinks are not traversed. Sampled file-data peaks
  exclude directory metadata and can miss short-lived spills between samples.
  Directory walks are also non-atomic: files can change during a scan. Treat
  these as sampled estimates, **not certified upper or lower bounds**. The raw
  observer's original `limits` field used “lower bounds”; the assessment here
  explicitly narrows that wording rather than altering the historical receipt.
- Filesystem free-space movement may include unrelated workspace/system work;
  it is a safety signal, not attribution to this job. The observer does not
  scan unrelated directories or delete other work.
- A floor projection is not ClickHouse native size, cache residency, throughput
  or a capacity result. The measured study envelope remains 28/22 GiB; local
  generation/validation still uses the declared 2 GB DuckDB working budget.

## The scaling trap to keep explicit

Accounts, posts and events grow 10× from 100k to 1M, but the declared reader
pool grows **16 → 20,000**. All eight cohort definitions therefore grow from
**36,160 → 45,200,000 rows (1,250×)**. They are metadata, not additional
registered users, but their output, intermediate edge generation and candidate
validation still consume resources. The selected graph also changes with the
reader overrides. A blanket “100k peak ×10” is not an admission proof.

Future resource admission must separate ordinary tables, retained dataset
output, native/sort/hash scratch and cohort growth, retain a free-space reserve
and state uncertainty. Current headroom is not established: the 1M build stays
blocked. Next is an operator-approved larger scratch location or a separately
approved revision of the preparation-host plan, not more blind retries here.
No automatic guard relaxation, deleted iterations, smaller distribution, larger
study envelope or paid-cloud fallback. The connected restore/live-delta and
full projected-row/attachment-parity gates also remain separate.

## Tests before starting

Six offline observer controls pass: nested-root/hard-link accounting, vanished
paths, context ownership/symlink escape, cleanup sampling acknowledgement,
failed acknowledgement handling and terminating only the owned worker on a
low-disk reserve. Lint and all eleven Python harness suites pass. Both measured
phases are now complete; exact receipts and retained original logs govern that
status, not the existence of an output directory.
