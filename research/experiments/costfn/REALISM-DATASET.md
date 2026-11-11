# Building and checking the derived realism dataset

The goal is a coherent synthetic node, not a set of independently fitted
histograms. [Operator decisions](REALISM-DATASET-DECISIONS.md) govern intent;
`realism_contract.py` records the executable parameters and necessary arithmetic.
Original V2 generators, input files and receipts are not rewritten.

## What is implemented

- `realism_contract.py`: one governing source per quantity, van Mierlo-only
  authorship, explicit totals/horizon adjustment, coupling rules, cohort
  definitions and no-spend gates. Necessary arithmetic is not joint validation.
- `realism_dataset.py`: deterministic seeded latent activity/popularity,
  generated original posts, a closed biased follower graph, eight K/locality
  cohorts, exposed liking/commenting actors, physical delivery events and ads.
  The Parquet files contain actual rows, not multiplicities counted as events.
- `realism_validate.py`: independent finished-record SQL validation, canonical
  document version selection, distribution summaries, causal/reference checks,
  conservation, joint correlations, and per-reader candidate distributions.
  It does **not** import or replay the generator. Failed validation receipts
  are retained; validators/source changes cannot silently reuse floor passes.
  Validation uses a 2 GB local working budget, one thread and spillable
  unordered intermediates, distinct from the ClickHouse study allocation.
  Named stages identify preparation failures; loaded source must still match
  the file being stamped into a receipt.
  Canonical histories are hash-partitioned on their complete version key;
  delivery windows/distinct audiences are partitioned on post/reader. Row-count
  reconciliation precedes per-bucket validation: no samples or discarded rows.
  This bounds validator working state without altering the study envelope.
- `Oracle` in that validator: expected feed IDs/order/profiles and counts from
  finished records. `core_feed.py` routes the new format to this oracle and
  refuses it before network work when none is provided. The V2 one-post checker
  remains only for historical V2 data. Exact live views require a separately
  verified live-delivery delta; arbitrary overcounts are not accepted.
- `realism_runner.py` and `realism.compose.yml`: explicit normal 28 GiB
  container / 22 GiB ClickHouse selection; the historical 5/4 GiB overlay
  remains available only as the named sensitivity case. Admission always
  reports `pilot_ready: false` until the remaining connected/review/budget gates.

**Still open:** a source-matched Parquet-to-node restore/selected-cohort adapter,
connected exact live-delivery delta receipts, complete runner integration and
the other RD2–RD4 gates. A passing local file validator is not actual node
execution, deployed parity, cache residency or permission/lifecycle assurance.
The existing Phase-1 runner is not an executable derived-rerun shortcut.
In particular, the new reactions/comments have real cross-author actors and
Discover attachments: revalidate every service's requested-group semantics
and full projected-row/count parity before reusing an old author-set shortcut.
The V2 self-like fixture and ID/order agreement alone do not prove this new
case. Keep that connected comparison as a gate, not an assumed optimization.

## The declared model

At `N` registered accounts (readers are a subset, not additional users):

- 15% own original posts. Top 1% / next 9% / bottom 90% post shares are
  74.7% / 24.0% / 1.3%; top-10% 98.7% is derived. Profiles are separate.
- `4N` original posts make the bottom posting band's nonzero count feasible.
  Rank-weighted original-post counts and shared activity/popularity traits
  drive authorship, audience attraction and within-author post quality.
- The model targets 16 likes/post, comments/likes 0.3, median likes zero,
  a 50% like share in the top 0.16%, median impressions 50 and 93% of
  impressions in the top 3.7%. A post has 1M impressions, including on floors.
- These marginals require more than the old 150M-event budget. The declared
  default is **400 impressions/post: 1.6B at 1M accounts**, corresponding to
  **320 days** at the original attention rate (150/account/30 days). The
  receipt carries this reason and adjustment. This is model design, not a
  measured traffic or native-size claim.
- Following has a heavy upper tail, median near 75 and population mean 150
  before study-reader overrides. Closed edges are distinct and non-self;
  target choice favours active accounts and popularity-biased neighbourhoods.
  The selected cohort replaces the participating existing readers' outgoing
  edges, preserving exact K. Other cohorts are separately reported alternate
  definitions, not simultaneous follows on the node.
- Reader zero is an explicitly conditioned **viral probe**, with the viral
  author included without increasing K. Ordinary-reader statistics are
  reported separately. To observe the historical viral post, use its cursor
  rather than pretending millions of repeat impressions arrived instantly.
- Actual node delivery dedupe is 24 hours per post/reader/surface
  (`log_content_deliveries`). Exposure histories respect this. Likes follow
  the actor's first delivery; comments follow their likes. Eligible distinct
  reach is bounded by actual accounts and event count.
- Original posts span the declared horizon with distinct millisecond order.
  Public text/posts/engagement only; 300 synthetic node-ad documents. The
  presence of ads is not yet proof of connected inventory rendering.

Coupling exponents, author cap and graph biases are declared synthetic
parameters in the contract, not measured web10 fits. Positive-correlation
checks do not establish that all joint distributions match a particular real
platform. Followers/following/engagement summaries must be read alongside that
modelling limitation. Private/revoked/lifecycle cases remain separate gates.

The validator reports totals/mean/median/p99/max/top-1% share and validates the
specified concentration bands, but does not infer a strict power-law fit. The
graph median acceptance bands are following 70–80 and followers 10–100, with
following mean within 15% of 150; observed values remain visible. Distribution
shares use the operator plan's ±5 percentage points; zero-post participation
uses ±0.1 point and impression median is exact. Do not silently tune these
after seeing a failure. Dataset-specific changes require a new identity and
receipted reason before any affected study.

## Local workflow — no provisioning or uploads

Install the isolated pinned environment (nothing enters the API dependency set):

```sh
uv venv .context/realism-venv --python python3.12
uv pip install --python .context/realism-venv/bin/python -r research/experiments/costfn/realism-requirements.txt
.context/realism-venv/bin/python research/experiments/costfn/realism.test.py
```

Use fresh output/receipt names for every attempt. The build refuses existing
directories and never replaces a previous manifest or validation receipt:

```sh
.context/realism-venv/bin/python research/experiments/costfn/realism_contract.py --accounts 10000 --out .context/realism-contract-10k.json
.context/realism-venv/bin/python research/experiments/costfn/realism_dataset.py .context/realism-10k --accounts 10000
.context/realism-venv/bin/python research/experiments/costfn/realism_validate.py .context/realism-10k --out .context/realism-10k-validation.json
```

After 10k validation, repeat at 100k. Floors use 16 existing study readers
across all eight cells; the 1M default uses 20,000, sufficient for the later
1,400-session demonstration. Floor cohorts are diagnostic, not evidence that
the larger session pool or offered-load generator has passed. Every receipt
declares the recipe/counts; do not silently pool across populations/cohorts.

Only current, passing, source/byte-bound **10k AND 100k** receipts admit the
1M build (`--floor-receipt` twice). The builder also checks conservative local
free-disk admission before creating output. Inadequate local resources are a
retained preparation blocker, never permission to rent a droplet or shrink the
distributions. Reestimate storage from generated floor receipts before the 1M
attempt; do not equate compressed Parquet with ClickHouse native/cache size.

Generated input contains `users`, `documents`, `doc_groups`, `group_contracts`,
`group_members`, `app_contracts`, `content_events`, plus `population` latent
metadata and alternate `cohorts`, as separately hashed Parquet files. A new
manifest identifies format, source/runtime pins, seed, selected cohort and
adjusted budget. The independent validator checks fixed filenames and all
hashes before interpreting records. The 1M input is not yet generated/released.

Validate the **rendered** Compose configuration without booting anything:

```sh
docker compose -f research/experiments/costfn/compose.yml -f research/experiments/costfn/research.compose.yml -f research/experiments/costfn/realism.compose.yml -p web10-costfn-frozen-rd-config config
```

Do not boot the 28 GiB configuration on the shared ~8 GiB Docker VM. It is the
declared measured-rerun configuration, not a local floor resource claim.
Object-store publication, droplets and spend stay blocked until the operator
has seen passing generated statistics and the remaining approval gates close.

## Local scratch measurement

`realism_scratch.py` observes a fresh source/byte-matched 100k generation then
independent validation, with an owned-child watchdog and before-cleanup disk
samples. It does not change the generator, validator or 1M guard. Method,
limitations, current attempt and the nonlinear 16→20k reader/cohort expansion:
[`evidence/REALISM-SCRATCH-20261111.md`](evidence/REALISM-SCRATCH-20261111.md).
Measured sampled peaks are not by themselves permission to start 1M or paid work.
