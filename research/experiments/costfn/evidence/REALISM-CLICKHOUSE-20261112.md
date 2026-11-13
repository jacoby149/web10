# ClickHouse validation — 12 November 2026

## Scope and source

The operator explicitly selects ClickHouse for finished-dataset validation,
then keeps the existing 400-GiB volume pending measurements. Generation, final
Parquet files, experimental node configuration and measured trials are unchanged.
The implementation is `realism_clickhouse.py`, called by the existing validator
entry point/worker. Native and explicit networkless-Docker modes require actual
engine **24.8.14.39**. There is no DuckDB fallback or approximate distinct count.
See `../REALISM-CLICKHOUSE.md` for mechanics, limits and commands.

Final validated source pins:

- `realism_validate.py`: `981daa2789e7dbe675a0b0958cf1a48db842596004a1dc4893148211e1e4071e`.
- `realism_clickhouse.py`: `1efd6f264c1e7c49f17b0fcf650a5eddfbf517fd2dcd3e610cf19c33f5d8e6cc`.
- `realism_contract.py`: `2b36579868d52e06ca5021893cc07aa960ba7de498c3ce07490830c7241275d4`.
- Docker image index: `sha256:1ffa82edee000a42c09313bd9f1293d94c570aee74babc1b3ca9983a35fa597b`.

## Real-engine controls, not SQL-string mocks

Eleven controls pass with the real pinned ClickHouse image on local ARM64
Docker, including source/engine/dependency/failure handling, no DuckDB connection
in default validation, all 50 named verdicts versus the reference, exact even
median/discrete p99 ranks, missing actors/targets, pre-exposure interactions,
duplicate deliveries, timestamp-tie tombstones and 24-hour/microsecond window
boundaries. A duplicate-cohort/inactive-author fixture proves the folded
per-author candidate-count reduction preserves the expanded join's results.
The suite takes 138.17 seconds while the scale probe runs concurrently; this
is not a performance benchmark. Offline CI skips only real-engine cases and
has its own receipt/resource controls; a separate workflow job runs the actual
ClickHouse tests rather than claiming those skips prove engine compatibility.

The first real-engine tests expose qualified output-column names in ordered
CREATE-AS queries and unsupported DateTime64 subtraction. Explicit projection
aliases and direct interval comparison repair those errors; failed logs remain
under `.context/clickhouse-engine-tests*.log`. No limit or acceptance tolerance
is relaxed to make the SQL execute.

## Passing 10k / 16M-delivery input

Use the existing input, not regeneration or a repeated cloud prerequisite:
`6c7c91e75ec4f50391898b73c3558da010f98882ebbfdd1e76a488512802c73b`.
It has 10,000 accounts and all **16,000,000 physical delivery rows**. ClickHouse
passes **50/50** independent checks. Every named verdict, authorship summary,
per-account/per-post summary, concentration and all eight cohort reports match
the DuckDB reference exactly; correlation reductions may differ at floating
precision but retain the unchanged positive-correlation checks.

The final source-stable observed run takes **129.70 seconds** during concurrent
real-engine tests. Sampled peak **dataset plus validation scratch** is
**1,086,673,265 logical bytes / 1,105,883,136 allocated bytes**, at 0.5-second
intervals with an 8-GiB local reserve. No stop/observer error occurs; source pins
are unchanged. These are sampled file-data peaks, not certified maxima or native
RSS bounds. Measurement output:
`.context/clickhouse-10k-audit-final/{independent-validation.json,scratch-receipt.json,validate-samples.jsonl,validate.log}`.

An earlier complete 50-check prototype run is deliberately denied after the
ClickHouse source changes during execution: the receipt records
`unchanged_validator_during_run=false`, not a relabelled pass. Its negative
receipt remains `.context/clickhouse-10k-validation.json`. A subsequent stable
80.35-second run passes before the final exact cohort-join reduction is added;
the final pins and 129.70-second receipt above supersede that prototype.

## What this does not establish

The 10k fixture has 16 readers, not the full input's 20,000; cohort work and
history size do not scale by a simple account multiplier. Its small footprint
does not prove 400 GiB sufficient for the 1M import/merges/joins or establish
full-input throughput. Keep the volume size unchanged, 20-GiB mounted-volume
reserve, approved 02:50:22 UTC Nov 13 compute deadline and retained disk. A resize
or new host/lease is a separate approval, not an automatic retry.

Full 1M validation, exact two-store private copies, operator statistics review,
connected node/parity acceptance and experiments remain OPEN. Local tests do
not establish any of those gates. The generator and separate bounded DuckDB
feed-oracle/reference tools are not silently rewritten.

## Existing-host native verification and restart, 13 November UTC

Stage source separately at
`/mnt/costfn-work/costfn-prep/clickhouse-validation-20261112/code/`; preserve old
live/setup sources and all previous database/partition/log evidence. Transfer
the official `clickhouse-common-static-24.8.14.39-amd64.tgz` (138,061,664 bytes),
verify publisher SHA-512
`f7ff660df46e40e4aa94dc360a00386f3f21030a76366e080ed1c3ae2c91b1754debe745459bf8ee1881bb509066dd062b8b76ec983bfba463cefff18b1854e4`,
and extract only the named binary into this private work directory. Binary
SHA-256: `577a22ac88fba8b8e1d8cdde15a2d8ec928d19c5804074fb2204c96bca0f1ca1`;
actual native version is 24.8.14.39. No global package installation, daemon,
network listener, production change or new billed resource is involved.

Setup failures are not hidden: a too-large SSH argument is refused before any
remote command runs; stdin transfer resolves that tooling bound. Direct host
download receives HTTP 403 before package creation, so the exact publisher-
checksummed package is fetched over workstation HTTPS and streamed over pinned
SSH, with matching full SHA-512 on both sides. No TLS/SSH verification bypass.

The native smoke at **22:06:12 UTC Nov 12** imports a bounded **1,000,000-row
prefix** of the existing event file, checks delivery windows and exact exposure
conservation, and completes in **11.37 seconds**. This is native execution
compatibility, not complete-key or full-input validation. Setup, source hashes,
smoke, local passing receipt/test logs and later restart receipt are on the
Volume, with local copies under `.context/`.

After the operator again says “okay proceed”, restart the existing
`web10-realism-prep` service at **00:19:48 UTC Nov 13**, PID **28877**. The worker
uses `--resume --skip-floor-gates` with the exact mounted-volume UUID, rechecks
the unchanged generator/contract/input identity and every table size/SHA before
reuse. It does not regenerate data. At 00:19:59 UTC it is active in completed-
generation reverification, with **347,292,602,368 bytes free**. Do not relabel
that phase as completed validation.

Keep the same compute lease and **02:50:22 UTC** cleanup; worker runtime stops
ten minutes earlier. The service has **12 GiB aggregate MemoryMax**, **100% of
one CPU quota**, and control-group termination, in addition to the 2-GB/one-
thread ClickHouse query limits and existing mounted-disk reserve guard. Python
worker `process_maxrss_bytes` is not native-engine RSS: observe the systemd
cgroup's MemoryCurrent/MemoryPeak for the whole service. The independent local
watchdog remains armed; the local status collector is restarted without a
duplicate observer. Existing workstation/network/provider limitations remain.
No automatic resize, new resource, lease extension, upload or experiment.

**00:22 UTC follow-through:** completed-generation source/identity/all-file
reverification finishes and the worker enters actual ClickHouse validation for
`2d6bbc4d89df…`. It imports app contracts and cohorts, then is actively importing
the 1.6B-row event file. Service/watchdog are healthy, no reported error, volume
free **346,827,300,864 bytes**. This is import progress, not passed full validation
or an overall completion estimate. Legacy DuckDB partition directories are
retained evidence and are not ClickHouse progress counters.
