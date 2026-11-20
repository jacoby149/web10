# Run the post-family row-model proving cell

This is a runnable isolated research harness, not a production cutover. Finish
source checks before spending. No command here creates a DigitalOcean resource.
Do not run ClickHouse or Docker locally for this programme.

**D117 is DIRECTION (cell pending), not native acceptance.** The
[decision ledger](../../../knowledge-base/strategy/decisions.md#d117--documents-become-versioned-pointers-to-immutable-typed-rows-direction-cell-pending)
owns the target; the [directive index](README.md#directive-precedence-index)
owns execution precedence. The present JSON implementation remains source/oracle
and experimental fallback, not a permanent hybrid or the replacement target.

## Latest attempt —layout/full day PASS, all-time memory failure

Merged PR#1602 source passes layout identity and the complete319-day/1.6B seed.
The subsequent all-time derivation stops natively241 at22GiB. Formal composition
banking is blocked, and the row bridge correctly refuses; no row-model worker,
build or assembly comparison runs. Receipts are preserved off-host, owned cleanup
is verified and the original snapshot retained. Admission closed, D117 pending.
[Native result and bounded-backfill source repair](evidence/all-fixes-layout-20261120/RESULTS.md).

## Earlier attempt —day slices/two grains

Fresh bindings/readiness on8402cd5fe pass before DO621488571 restores. Day seeding
is partial at the existing service bound; all-time derivation and composition
banking never occur, so the row worker/build/key-type checks/six assembly stages
remain NOT RUN. D117 pending; no partial PASS. Receipts/CSV are preserved and
owned cleanup verified, snapshot retained, admission closed. [Accounting and bindings](evidence/all-fixes-two-grain-20261120/RESULTS.md).

## Earlier attempt —stdin fixed

Fresh bindings/readiness on merged55b68ef7f pass before DO621423661 restores.
Native billboard transport and tally verification complete; aggregate seeding
stops241 at22GiB, so composition banking/row worker/build/assembly remain blocked.
D117 remains pending. Owned cleanup verified, snapshot retained, admission closed;
no automatic retry. [Bindings and qualified receipts](evidence/all-fixes-stdin-20261119/RESULTS.md).

## Earlier rerun —19 November2026

The binding is regenerated on merged restore-fix source2749c1037 and verified
before fresh DO621414125 restores. Restore/read setup/migration pass; billboard
fixture transport stops before parity gates or composition banking. The row
bridge refuses unbanked accounting, so no row worker/build/assembly runs. D117
remains pending. Owned cleanup is verified and admission closed, snapshot
retained; no automatic retry. [Exact binding/fix/new-attempt receipts](evidence/all-fixes-row-model-rerun-20261119/RESULTS.md).

## First attempt —19 November2026

The exact source binding passed on DO621405771 before the composed entry restored
the store. Restore then stopped at an existing-input-path collision; all-fixes
never banked. The row-model bridge refused before worker launch, so no family
build, key/type verification or assembly measurement ran. Source readiness is
not native acceptance. Lease cleanup is verified and admission closed; no retry
is implied. [Failure/cost/cleanup report](evidence/all-fixes-row-model-20261119/RESULTS.md).

## What is wired

`row_model_run.py` is the host entry. It verifies the bound DO admission and live
28GiB-container/22GiB-engine envelope, checks the current all-fixes certificates,
stops the API writer, and launches `row_model_worker.py` as a one-off process in
the existing research API service. The worker uses the pinned typed ClickHouse
driver, never CLI JSON result decoding for typed values. It requires the explicit
disposable environment, current source hashes and a banked all-fixes composition.

The worker builds the COMPLETE post family, not a tiny page-only value store.
Complete-identity seek pages use DISTINCT/order/top-K in each canonical PK lane;
history fetches have no raw row LIMIT. A setup-only identity catalogue includes
deleted history and verifies legacy reference-owner hints against canonical full
keys. It is a migration aid, not a second treated refs layout or a read fallback.

Owned canonical fixtures cover edits, tombstones, shared content, all value
types, nested objects/arrays, an empty-body post and an actual zero-pointer
identity-only document. The last has a separate canonical JSON export oracle;
it is not a serialized value hidden in the typed store. Value sharing is checked
physically. Container IDs commit to child keys/types/value IDs, not just arity.

Before measuring, compare full documents key/type-for-key on the ACTUAL banked
ordinary/paired pages, the fat post, a deterministic 64-identity store sample and
every adversarial domain. Then freeze/verify typed parts and measure six
canonical-versus-row stages, each warmup + measured. The feed returns the whole
captured `body` subtree and its declared displayed metadata, not a hand-picked
text-only shortcut. The canonical control chooses current winners IN SQL;
decoding full history belongs only to the independent oracle, outside timing.

## Admission and invocation

The existing all-fixes admission must additionally carry:

```text
row_model_admitted: true
row_model_directive: Jacob Hoffman 2026-11-19 post-family maximal row-model assembly after all-fixes
row_model_source_binding: <the exact row_model_cell.binding() dictionary for deployed source>
```

Generate the binding without an engine or cloud action:

```sh
PYTHONPATH=research/experiments/costfn python3 -c 'import json,row_model_cell; print(json.dumps(row_model_cell.binding(),indent=2))'
```

Only on the independently bound owned DO host, with both sources deployed and
source controls green, the composed entry can enforce row-source readiness
BEFORE restore and then run the measured cells in order:

```sh
/opt/fanout/venv/bin/python /opt/fanout/repo/research/experiments/costfn/engagement_composition_run.py /opt/fanout --with-row-model
```

Alternatively, on an already banked CURRENT owned all-fixes store within its
explicitly admitted window, run the independent host bridge:

```sh
/opt/fanout/venv/bin/python /opt/fanout/repo/research/experiments/costfn/row_model_run.py /opt/fanout
```

That alternative neither restores/rebinds another host nor repeats the
composition. A fresh-host continuation needs its own approved store/binding;
do not borrow another lease's certificates or reopen a cancelled host. An
existing `row-model/` attempt/log refuses overwrite. No automatic retry,
extension, new host or cleanup guardian is added.

## Receipts and cost scopes

- `row-model/result.json`: source/host/window, full-family build, required
  verification and each measured comparison. `PARTIAL_MEASUREMENTS` is not PASS.
- `row-model/native/`: original exact query IDs, SQL hashes, terminal native
  settings/actuals and failed/partial samples. Typed data statements use600s,
  zero row/byte stops and22GiB. Successful receipt collection is batched and
  occurs after timing; a failed transport waits for its original native verdict
  without resubmission. No fixed process/client cap abandons live work.
- Per-sample `assembly` and `generation_fence` stages are separate. Both native
  inclusive totals and inclusive wall time remain reported. Assembly time
  excludes only the directly timed fence calls; no historical bytes/costs are
  subtracted or substituted. `ROW_MODEL_AUX:` query-log observation work remains
  separately identifiable, as with existing programme observers.
- `row-model/private-comparisons/`: private synthetic-dataset expected/actual
  payload evidence, including timestamps and selected paths, saved0600 under a
  private directory. The API -> app/UI boundary permits export serialization; it is
  never input to typed reads. Preserve off-host, do NOT copy into Git or logs.
  Public reports carry packet hashes/sizes and cost metadata, not bodies.

Keep the original32/28/22GiB/26.10.4.207 frame, agent~300s supervision and owned
self-kill timers. Baseline/B/D and historical FAILs stay banked. Model/fence
infrastructure costs, the single-sample latency limitation and orphan-value GC
remain explicit. A good assembly result supports PAGE SCALE only; no complete
feed budget, capacity, protocol migration, production JSON retirement or§8
acceptance follows automatically.
