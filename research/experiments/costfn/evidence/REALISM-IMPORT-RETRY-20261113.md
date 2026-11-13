# Repair the import execution budget, not the dataset

At 00:51 UTC on 13 November, ClickHouse exits with code 159:
`TIMEOUT_EXCEEDED`, elapsed 1800.89 seconds against a maximum of 1800. The
failed stage is `import_content_events`, before statistical validation. The
retained table has 450,020,966 of 1,600,000,000 rows; this is not a passing
import or a dataset-content rejection. The original Parquet input is unchanged.

The 400-GiB work volume still has 338,018,308,096 bytes free. Before exit,
service memory events show zero OOM/OOM-kill events; much of the aggregate
memory is filesystem cache. The confirmed stop is the configured time limit.
One CPU quota also constrains import and background work, but there is no
measured claim that four CPUs will yield a fourfold speedup.

The operator asks to fix and retry. Keep the same 8-core/32-GiB host, volume,
02:50:22 UTC compute deadline, worker stop ten minutes earlier, reserve guard
and retention. No new resources, paid resize, lease extension or regeneration.

## Small explicit repair

- Four query/insert threads and up to four CPUs, rather than one. Keep the
  same 2-GB aggregate query memory, 12-GiB native-service cap and spill bounds.
- A 90-minute per-query ceiling replaces the unproven 30-minute import
  cutoff. `REALISM_PREP_DEADLINE` shortens it to before the approved worker
  stop; the service/host/cleanup watchdog remain authoritative spending bounds.
- Drain ClickHouse's native read progress during execution. Read rows/rates
  are reported as read progress, not committed-import or overall completion.
- Stable, input/validator-source-bound retained work with one file lock.
  Context and per-table completion markers are ordinary synced atomic JSON.
  Mark only after successful import and exact count; reuse rechecks context,
  table UUID and count. Derived checks are recomputed, not trusted from logs.
- An unmarked table is preserved under an interrupted name before whole-table
  retry. Never adopt the old 450M partial table, guess a prefix offset or
  infer completion from file existence. Changing input/source/engine refuses
  stale work. No distributed scheduler or generalized checkpoint framework.

The old negative receipt and all partial work remain retained. The import
budget is an operational limit, not a statistical tolerance: all 50 checks,
exact distinct counts, quantile ranks, conservation and denial controls remain
unchanged. Local and native retry receipts are recorded separately; neither
code changes nor a heartbeat establish full 1M validation or experiment readiness.

## Controls and actual retry

Thirteen real-engine controls pass, including interrupted-before-marker table
preservation, exact completed-import reuse across ClickHouse process/container
replacement, stale-context denial, changed-count denial and lease-deadline
refusal before process start. Fourteen offline suites, five Bun tests and Ruff
pass. Progress-pipe handles close after draining; a test cleanup-order failure
and its owned container are repaired without removing unrelated containers.

The existing 10k/16M-delivery input independently passes all 50 checks with
unchanged source pins in **76.30 seconds**, during concurrent tests. Every
named verdict, authorship/concentration and per-account/per-post/cohort report
matches the bounded reference. This is not a full-input speed forecast.

Verified source pins:

- `realism_validate.py`: `67d4491624fbb7be5d1e7a465747f72fea584420b297fcf673c6ef15c58cc84f`.
- `realism_clickhouse.py`: `b37cc2c2a5c18f486bf050e142c3d13087819766b6b7546118fea881fc42e7a6`.

At **01:31:34 UTC Nov 13**, restart the same preparation service, PID **41255**,
using separately retained immutable sources at
`/mnt/costfn-work/costfn-prep/clickhouse-retry-20261113-r1/code/` and the already
checksum-verified native binary. Local passing receipts/tests and the previous
negative receipt are copied to this stage. The old partial database is not
adopted or deleted. `--resume --skip-floor-gates` rechecks and reuses the same
completed generation; no generator or 100k prerequisite runs.

The actual unit reports four CPU-seconds of quota per second, **12 GiB
MemoryMax**, control-group termination and **4131 seconds RuntimeMaxSec**.
`REALISM_PREP_DEADLINE` is 02:40:22 UTC, so the per-query ceiling is shortened
again before that stop, not interpreted as 90 extra billed minutes. Compute
cleanup remains **02:50:22 UTC**, retaining the 400-GiB volume. At 01:31:48 UTC,
the service is active in generation reverification, with **338,018,029,568
bytes free**. This is a restart checkpoint, not completed validation. The
scoped watchdog remains armed and the status collector is restarted without
another duplicate observer.

**01:33:15 UTC:** source/input reverification is complete and the worker is
actively importing events. App contracts (20,000) and cohorts (45,200,000) have
exact completed-import markers. Native progress reports **45.97M event rows
read**, not a completed import or an overall validation percentage. Four-CPU
quota is confirmed; service memory is about 5.79 GB against the same 12-GiB
cap, and volume free space is **336,674,332,672 bytes**. No reported error.
