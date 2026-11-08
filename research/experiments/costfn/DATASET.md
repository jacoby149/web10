# Frozen synthetic inputs, separate from measurement

> **7 November: execution paused for design review.** These preparation/measure
> commands are reference only. V1 stays frozen as a control; do not regenerate
> it, provision hosts or run traffic before [STUDY.md](STUDY.md) is approved.
> [DESIGN-REVIEW.md](DESIGN-REVIEW.md) records the candidate/physical-working-set,
> empty-join, default-Discover attachment and app-Origin gaps. No large data is
> generated and no services are contacted by the offline study audit.

Operator, 6 November 2026: prepare the user data first, validate it, then run
experiments against the same downloadable dataset. MinIO is the proposed
distribution store, not a source of production user data.

## Contract

The builder/validator is offline, followed by separate disposable restore and
measure commands. This is not a database dump, capacity result, or publication.
The builder never reads a node, credentials,
environment variables, media, signing keys, or production content. Inputs are
explicit generation parameters. All accounts and the shared password/hash are
public synthetic fixtures. Never import them into a production node.

`dataset.py build` writes five canonical, gzip-compressed JSONEachRow files:
`users`, `documents`, `doc_groups`, `group_contracts`, and `group_members`.
There is one post and one public followers group per creator, a configurable
pool of independent readers, and a separate board with at most ten additional posts.
Each reader follows the first K creators. Include owner/class grants, reader
memberships, and default-Discover enrollment; the existing node supplies the
default Discover contract during isolated import. No app-grant/browser/denied
workload is claimed by this public-readable microbenchmark fixture.

Identifiers, ordering, timestamps, public credentials, JSON serialization and
gzip headers are fixed. Same parameters, generator version and pinned Python/zlib
produce identical bytes, not merely the same username prefix. `manifest.json` records the recipe,
generator SHA-256, exact row/file-byte counts and per-file SHA-256. Its dataset
ID commits to the complete manifest. Validation checks hashes **and replays every
expected row**, including attachments/memberships. Hashes provide integrity and
identity, not publisher authenticity: pin the dataset ID/digests in the repo.
The manifest's `zlib` field is the compile-time version (1.2.11); the observed
runtime was 1.2.12, separately recorded in the trusted receipt. Exact compressed
rebuilds need both, whereas validation of downloaded frozen files is portable.

The manifest retains the fields `bench.py` expects, but a compatible manifest
does **not** imply that a database has been restored. The new fixed timestamp,
IDs and common password hash differ from the historical API seed; this is a
new dataset version, not a byte-identical replay of that experiment. Repeated
hashes/roles and sparse text compress well; this is not production storage,
engagement, media or private-policy realism.
All readers follow the same first K creators: this is a deliberately hot,
shared-audience fixture, not a sampled social graph. Profiles, reactions,
comments, media and mixed private/denied policies are absent. Any richer mix is
a new reviewed dataset version, never an in-place edit of these frozen files.
Timestamps stay at the declared January 2026 epoch, not restore-time “now”;
the baseline is chronological. Future recency/ranking workloads must explicitly
specify their clock anchor rather than silently refreshing this data.

## Prepare and inspect (no cloud)

```sh
python3 research/experiments/costfn/dataset.py build \
  --creators 1000000 --follow 1000 --readers 20000 --seed 42 \
  --out .context/datasets/one-million
python3 research/experiments/costfn/dataset.py validate .context/datasets/one-million
python3 research/experiments/costfn/dataset.test.py
```

The builder/validator uses Python's standard library. The hash-compatibility
unit test also needs bcrypt from the API dependencies; if absent on the host,
use `uv run --project api python research/experiments/costfn/dataset.test.py`.

That recipe means **1M post authors plus 20k reader accounts** (1.02M registered
fixtures, not 1.02M active users), 1,000,010 posts/attachments, 1,000,001 custom
groups and 23,020,012 membership/grant rows. It backs distinct-account trials
through the 20k-VU level without pretending that one reused token is 20k users.
The fixture contains no login tokens; session preparation is a separate gate.

The generated million-creator artifact has dataset ID
`3a5d169bf074d21eae825f6adf9902c01b000b2aed65595bd211b01ce96e6233`.
It passed all-row replay validation: 149,686,257 compressed bytes; 118.155 s
offline build and 103.570 s validation on the preparation machine. These are
file-preparation timings, not node/query/capacity measurements. Files and local
receipt live under `.context/datasets/one-million/` and
`.context/datasets/one-million-receipt.json`; the small tracked receipt pins
identities/checksums without checking the dataset into git.

## Restore first; measure second

`restore_dataset.py` uses only this directory's fixed compose file, a dedicated
`web10-costfn-frozen-*` project and an unprivileged loopback API port. It validates
all files and the independently pinned `--expected-id` before Docker writes,
refuses any existing project containers/volumes/networks before starting,
rebuilding or stopping services, and refuses existing accounts/documents or non-boot
groups, applies schema/migrations, pauses the API, bulk-imports the five fixed
tables and verifies counts. It then starts the API, performs a real login and
checks exact public query rows/fields/order before writing a complete receipt.
It never truncates, drops, overwrites or exports a database. Failed imports are
partial disposable targets, not resumable/transactional restores; inspect and
explicitly remove only that test project before retrying. No signing keys,
tokens, node configuration or production account hashes come from the dataset.

```sh
# Small real-stack floor before using the large fixture (Docker + image access):
python3 research/experiments/costfn/dataset.py build \
  --creators 10 --follow 10 --readers 2 --out .context/datasets/floor
python3 research/experiments/costfn/restore_dataset.py .context/datasets/floor \
  --project web10-costfn-frozen-review --port 6090 \
  --expected-id "$REVIEWED_DATASET_ID" \
  --receipt .context/datasets/restored.json
# Only AFTER preparation and correctness succeed; no generation/import in this command:
python3 research/experiments/costfn/measure_dataset.py .context/datasets/floor \
  --receipt .context/datasets/restored.json --k 10 \
  --out .context/datasets/trial-001
```

`measure_dataset.py` requires the exact dataset ID and a complete matching
restore receipt, keeps the API port consistent across cell restarts, and records
manifest/restore hashes in `frozen-input.json`. The benchmark report also names
the dataset/generator IDs. It never calls signup, creates posts, imports data or
provisions hardware. This wrapper runs the **simplified query** microbenchmark,
not the unimplemented full-feed concurrent load generator. Unknown-Origin,
private-policy, browser, media and revocation controls remain separate gates.
Set `REVIEWED_DATASET_ID` from the approved builder output or trusted repo receipt;
do not trust a different manifest merely because it arrived beside its checksum.

Build refuses existing output directories. Inspection previews, counts and IDs
can be reviewed before any host is purchased. Generated data stays outside git.
Building, downloading, importing, login/setup and warm-up must all finish before
measured requests. Record their wall time separately, and declare merge/cache
settling conditions; faster restoration does not mean faster query execution.

## Remaining gates, in order

Local acceptance: a 10-creator/two-reader fixture restored into real
ClickHouse 24.3.18.7, with exact input-plus-boot row counts, real login and ten
exact ordered public query rows. The separate measurement wrapper then completed
all ten K10 matrix cells with one measured sample and one excluded warm-up each;
dataset IDs/provenance matched. This is a functional smoke, not a latency result.
The initial floor correctly rejected a checker mismatch: the API returns parsed
JSON bodies, not storage strings. The checker was repaired to the documented
endpoint serialization; the API was not changed. Failure logs are retained.
Local test containers/volumes were removed and empty project storage verified.
The approved-ID CLI also passed a fresh restore and ten-cell functional
smoke, with successful cleanup. [Tracked floor receipt](evidence/frozen-floor-v1.json)
records the exact API tree, harness hashes, counts and exclusions. Twenty-one new
offline dataset/workflow tests pass alongside existing harness/funnel controls.

1. Review the frozen million-creator dataset and its explicit sparse/public shape.
2. Verify the supplied isolated, empty-target-only bulk importer's counts,
   schema/provider compatibility, exact ordered queries and access controls on a
   small real API/ClickHouse stack before importing the large dataset.
3. Package/publish under an immutable versioned MinIO prefix, with manifest,
   checksums and a trusted repo-pinned receipt. Publication needs explicit bucket,
   object prefix and approval; no production export or upload is performed here.
4. Review connected preparation/measurement isolation. The old `run.sh` is a
   legacy combined runner, not the new frozen-dataset workflow. The new wrapper
   records provenance and refuses a missing/mismatched complete restore receipt;
   preparation is a different command, not a stage repeated by the experiment.
5. Confirm the upgraded DigitalOcean tier and size API/ClickHouse/load-generator
   hosts for the offered-rate funnel. Run repeated stepped full-feed load and
   report achieved rates/saturation, not a capacity claim from file generation.

The operator cancelled the previous tier-max run: 9/20 completed cells, 180
measured samples preserved in `.context/sixth-draft/tiermax-cancelled/`; no final
report. Its droplet and local driver are stopped; deletion was verified. These
partial cells are not a completed repeat or a baseline for this new fixture.
