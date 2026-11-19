# Restore repaired; fresh rerun STOP in billboard fixture transport

**The restore fix passes on the real snapshot. The new attempt then stops before
furniture, parity gates or measurements:** the billboard fixture INSERT is too
large for the command-line argument carrying it. This is a separate failed
attempt, not a parity/budget result, and does not change the first attempt's
[banked record](../all-fixes-row-model-20261119/RESULTS.md).

Machine-readable receipts: [results.json](results.json).
Regenerated binding and deployed restore-module hash: [source-binding.json](source-binding.json).

## Fix landed separately before spending

[PR#1595](https://github.com/jacoby149/web10/pull/1595) changes only the input-link
step in `engagement_restore.snapshot()`, after the unchanged frozen-input
verification:

```diff
-(root / 'input').symlink_to(source_input, target_is_directory=True)
+run_input = root / 'input'
+if run_input.exists() or run_input.is_symlink():
+    if run_input.resolve() != source_input:
+        raise FileExistsError('existing run input differs from verified snapshot input')
+else:
+    run_input.symlink_to(source_input, target_is_directory=True)
```

The three new tests in `engagement_modern.test.py` call actual `snapshot()` with
real temporary filesystem paths: self-resident input, an existing same-source
link, missing/new-root input, a foreign directory and a dangling foreign link.
Engine and large-dataset-validation seams are mocked; path resolution, linking,
refusal and preservation are real. The self-resident test replays the exact
pre-fix function and reproduces its `FileExistsError`. Fixed source passes all37
no-engine suites/357 tests and focused Ruff. All three PR checks passed before
merge. No other restore behavior changed.

After merge, the full no-engine suite passed again on exact merged dev
`2749c10378214ab649e3bf528d5a4b6a54e23763`. All1,476 deployed file hashes and banked
builder pins verified before restore. The row-model binding was generated anew
on that source and carried by a fresh admission; on-host readiness passed before
restore. Its11 row-model file hashes happen to equal the earlier dictionary:
`engagement_restore.py` is not part of `row_model_cell.binding()`. The new source
commit and separately recorded restore-module hash bind the actual fix; no hash
was invented or changed merely to make the dictionary look different.

## Fresh lease and observed setup

DO621414125, original8-vCPU/32GiB/400GiB AMD SKU innyc3, snapshot255003176,
ClickHouse26.10.4.207 and the32/28/22GiB frame. Admission window:
19 November22:22:40→20 November02:22:40UTC. Two readiness timeouts observed this
same provisioning host. There was no replacement, lease extension or guardian;
both owned self-kill timers were active. Costs are receipted, not capped; legacy
budget fields remain compatibility metadata, not a renewed monetary ceiling.

| Programme stage | This attempt |
|---|---|
| Banked baseline/B/D citation | PASS — cited, not repeated |
| Restore | **PASS**,96.683s bridge wall time, not a provider-provisioning benchmark |
| Read setup | PASS;21-row fixture coverage, two collision authors/shared route/mixed lane |
| Migration setup | PASS; nine prerequisite checks zero, source/copy each88,200,363 rows |
| Billboard fixtures | **INCOMPLETE — OS argument-size refusal** |
| Furniture and everything dependent on it | BLOCKED_PRE_MEASUREMENT_VERIFICATION |

Migration cites the banked inverse/lossless proof rather than rerunning its32
batches. These setup passes are not new complete-feed or paired-tally acceptance.
Baseline/B/D timings and historical FAILs stay banked unchanged.

## The new stop

At `engagement_composition_setup.py:86`, fixture construction calls
`session.query('billboard_fixture_documents', INSERT_SQL)`. The modern CLI bridge
passes that SQL as one `--query` argument to `docker compose exec`. The OS refuses
`subprocess.Popen` in `engagement_native.await_query`:

```text
OSError: [Errno 7] Argument list too long: 'docker'
```

An offline reconstruction from this attempt's private ordinary/paired oracle
inputs and admission produces the exact same attempted SQL SHA256:
`b7c5f1b512759a40a4a341d2dd84791db395607959616a6699ae3218a0eeb207`.
It is **185,447 UTF-8 bytes** in one argument. The reconstruction executed no
engine or cloud operation and stopped at the fake query seam before submission.

Attempted query ID:`fanout-f-611fb66448ce42299b5fff5f8f0675e1` has no terminal
native record because the process could not start. Its SQL has **no measured
native rows/bytes/time**, not zero-cost acceptance. The immutable setup plan had
been saved; its document INSERT, attachment INSERT and later furniture did not
execute. The composition preserved the failure and blocked every later stage.
The row bridge refused unbanked composition accounting before worker launch.
Worker exit1 is preserved. There was no source repair or retry after this stop.

## Every required parity verdict

| Gate | Verdict |
|---|---|
| Refs full census and same-question parity | NOT RUN — setup blocked |
| Ordinary/fat/store-sample tally verification | NOT RUN — furniture not built |
| **Repaired paired tally: actual20 roots in all five domains** | **NOT RUN — D114 paired acceptance remains OPEN** |
| Views raw-oracle versus aggregate parity | NOT RUN |
| Exact ad identity on every page post | NOT RUN |
| Complete-response parity | NOT RUN |

No gate compared values and failed; none compared values and passed. The new
STOP does not promote either attempt into a missing parity verdict.

## Requested composition decomposition and unclassified queries

| Complete response | Warmup | Measured | Per-stage decomposition |
|---|---|---|---|
| Uniform K20 | BLOCKED | BLOCKED | Unavailable |
| Paired P | BLOCKED | BLOCKED | Unavailable |
| Paired F | BLOCKED | BLOCKED | Unavailable |

**The unclassified-query inventory is unavailable**, not an empty list. No new
budget verdict exists, and neither historical ~52MB remainders nor predicted
aggregate costs substitute for missing actuals. Twenty terminal records collected
from this attempt's F setup ledger have exception_code0 and22GiB native settings:
19 carry600s bounds; the existing `setup_memberships` call carries its explicit120s
setup bound and completes in2.099s. These are setup receipts, not composition measurements or an exhaustive
claim about all lower-level setup/observer work; raw stopped query-log parts are
retained privately as well. Collection-only flush work is separate.

## Row-model comparisons — assembly isolated, all unavailable

| Canonical-versus-row stage | Warmup | Measured | Assembly | Generation fence |
|---|---|---|---|---|
| Uniform K20 feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired P feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired F feed | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Ordinary post open | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Paired post open | NOT RUN | NOT RUN | Unavailable | Unavailable |
| Fat post open | NOT RUN | NOT RUN | Unavailable | Unavailable |

No full-family build, actual-page/fat/64-identity-sample/adversarial key/type
verification or row worker ran. No assembly verdict can be selected; this is
not PASS or `PARTIAL_MEASUREMENTS`. D117 remains pending. No page-scale/feed-
budget/capacity/production/§8 acceptance follows.

## Private custody, cost and verified cleanup

Controller:`~/.local/state/web10-research/web10-fanout-f-e71a2095e09e/`.
All state/native archives below were copied and SHA256-verified off-host before
owned deletion:

- Final checkpoint714,384 bytes,
  SHA256`d374bb47f18f24e0b342edf96cf9af41b0106d71e802397f882817cfdd011de8`.
- Stopped-native query-log archive5,243,378 bytes,
  SHA256`396e4f7cb92e0a973f81434b7d963814e00303674977b5ecfd1aba1b92bfd06b`.
- Exact source bundle/manifest, generated admission/binding, new failure,
  controls/deployment logs and offline argument reconstruction are private.
  No engine restart for collection; all container OOM flags false. Inherited
  snapshot evidence is not reclassified as new-run measurements.
- Owned droplet/firewall/key cleanup verified **19 November22:42:05.669UTC**,
  before the original deadline. Provider settling and a transient SSH-key delete
  error were retained, then cleanup continued to verified absence. Owned tag
  also deleted. Final provider readback at22:42:26.939UTC confirms all four absent
  and **snapshot255003176 retained**; droplet list empty.
- New-attempt-only conservative elapsed-SKU compute estimate:
  `1,165.669429 seconds × $0.25 / 3600 = $0.0809492659`, **not an invoice**.
  This is admission creation through verified cleanup; ongoing snapshot storage
  is separate. The first attempt's six-cent estimate is not added to these numbers.

Admission consumed/closed. The next defect is the fixture SQL's argv transport,
not the repaired input path. Source-only transport repair and realistic-size
no-engine controls are next work; no further paid/native retry is authorized
by this consumed one-lease directive.
