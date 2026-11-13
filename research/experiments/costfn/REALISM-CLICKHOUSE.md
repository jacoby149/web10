# Check the finished dataset with ClickHouse

The operator selected ClickHouse for dataset validation on 12 November. The
generated Parquet bytes do not change. The default `realism_validate.validate`
and preparation worker now use **ClickHouse 24.8.14.39**, not DuckDB, and never
fall back to another engine when ClickHouse is missing or a query fails.

## Import once, then check the actual records

The Python entry point first verifies the manifest/contract, exact table set,
file sizes and all nine SHA-256 hashes. An isolated scratch database imports
the Parquet files through ClickHouse's `file(..., Parquet)` function and checks
each imported row count. Tables use ordinary `MergeTree`, **not**
`ReplacingMergeTree`: raw duplicates must survive so the validator can reject
them, rather than quietly remove the evidence.

**13 November import repair:** retained work now uses a deterministic input/
validator-source-bound directory and a single nonblocking file lock. A context
file binds engine, source and exact input inventory; atomic per-table markers
are written only after import succeeds and its exact count verifies. Reuse
also checks the table UUID and count. Unmarked tables are preserved under an
interrupted name, never adopted or resumed with a guessed row offset. Stale
contexts/markers deny. Derived checks are recomputed; a marker is not a passing
statistical receipt. This is ordinary files/locks for completed imports, not a
distributed validator or automatic partial-query recovery framework.

Events are ordered by `(doc_id, reader_key, surface, seen_at)`. Documents are
ordered by version key/time/deletion. This is ClickHouse's sorted storage and
sparse index, not a secondary index on every field. It can support ordered
reads; it does not eliminate the cost of importing, merging, joins or large
aggregations. The validator no longer writes DuckDB hash-partition Parquet
files as a prerequisite to its delivery-window checks.

All 50 named checks remain: identity/references/times, canonical documents,
delivery spacing and exposure causality, duplicate likes, conservation,
authorship/follow/engagement/impression distributions, positive correlations,
ads/profiles and all eight reader cohorts. Canonical selection ranks before
filtering and deletion wins timestamp ties. Window checks retain microsecond
precision and allow exactly 24 hours, not one microsecond less.

SQL differences are deliberate, not approximate substitutions:

- `uniqExact` supplies exact distinct counts; joins use `ALL` strictness.
- `join_use_nulls=1` preserves missing-reference detection and zero-activity
  left-join behavior, rather than interpreting an absent match as a real zero.
- Median averages the middle pair. Discrete p99 selects rank `ceil(.99*n)`.
  ClickHouse's default quantile rank does not match DuckDB's `quantile_disc`,
  so explicit exact ranks preserve the previous report semantics.
- `lagInFrame` compares adjacent deliveries for the same post/reader/surface.
  First rows have a nullable predecessor; they are not compared with epoch zero.

No generator functions or generator-provided reach summaries enter the checks.
For cohort candidate counts, compute exact posts per author first, then join
that single row to each cohort membership and sum. This preserves duplicate
membership multiplicities and inactive-author zeros without materializing the
potentially enormous reader-by-every-post join. A duplicate-target/inactive-
author fixture compares the result with the original expanded reference.

## Run an isolated validator

On Linux with the pinned native `clickhouse` binary installed:

```sh
python research/experiments/costfn/realism_validate.py \
  /mnt/costfn-work/costfn-prep/realism-1m-prep \
  --out /mnt/costfn-work/costfn-prep/cloud-validation.json --keep-work
```

For local development/CI, the explicit Docker adapter uses the pinned
multi-architecture image digest in `realism_clickhouse.py`:

```sh
REALISM_CLICKHOUSE_DOCKER=1 python research/experiments/costfn/realism_validate.py \
  .context/my-existing-dataset --out .context/my-validation.json --keep-work
# If Docker uses a non-default context, also set REALISM_DOCKER_CONTEXT.
```

It creates one owned container with **no network or published ports**, a
read-only input mount, a private writable work mount, four CPUs and a 3-GiB
container limit. It runs as the caller's UID/GID. No shared node, API,
credentials or production tables are used. The native path has no container
RSS cap; both paths enforce the same query settings. Cleanup removes only the
container this invocation created; retained work is not removed by that step.

Each `clickhouse-local` invocation uses the same explicit `validation` database
inside the owned work path. The implicit `_local` database is ephemeral and is
not used for persistence. Queries are serialized; a failed operation is not
automatically resumed just because imported tables exist. Only bound,
count/UUID-verified completion markers permit whole-import reuse.

Limits are **2,000,000,000 bytes query memory**, four query/insert threads,
external sort/group thresholds of 256 MiB, 100,000,000,000 bytes query temporary
data and **90 minutes per query**, with a bounded client timeout. A worker-supplied
`REALISM_PREP_DEADLINE` shortens the query budget to stop before its approved
runtime; it never extends the lease. These are not a bound on all imported
tables/merges or native-process RSS. The existing exact-volume/free-space guard,
worker runtime and approved compute deadline remain necessary. Query timing,
read statistics and errors go to `clickhouse.log`; native read progress is
drained and flushed during the query, not withheld until it exits. Read rows
are not committed/import-completion percentages. Docker also records cgroup
peak memory. Worker stdout/stderr and state stay on the persistent volume.

## What a passing receipt means

Receipts bind the input identity, entry-point source, ClickHouse module and
contract hashes, plus actual required engine version. Reuse/floor/runner gates
reject old DuckDB receipts, missing dependency pins, changed code and wrong
engine versions. Source drift during validation makes the result incomplete.
Failures produce a negative receipt; there is no automatic engine fallback.

The DuckDB generator is unchanged. Its former finished-record validator is
retained only as explicit `validate_duckdb_reference` for bounded equivalence
tests. Existing separate connected-feed oracle/parity helpers also remain
DuckDB-based; they are not the default statistical validation path and their
reference receipts cannot admit the ClickHouse worker.

Run `REALISM_CLICKHOUSE_TESTS=1 python realism_clickhouse.test.py` with the
native engine, or also set `REALISM_CLICKHOUSE_DOCKER=1`. Normal offline tests
exercise receipt/failure/resource controls without requiring an engine. The
research CI has a separate real-ClickHouse parity job.

Keep **400 GiB** for the existing approved work volume until measured import,
merge and validation footprint demonstrates otherwise. A small passing input
does not establish 1M scratch capacity or throughput. A paid resize/new host,
lease extension, final private Spaces/MinIO copies, statistics review and
experiments remain separate decisions/gates. Do not regenerate the input to
change its validator.
