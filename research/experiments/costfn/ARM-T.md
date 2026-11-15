# Arm T — ask the link table in the other direction

**Additive arm: post-freeze-protocol amendment, Jacob's directive, 14 November
2026.** This arm does not replace, reprioritize or amend any frozen cell,
input or receipt. `PROTOCOL.md` and the amended `REALISM-RERUN-PLAN.md` still
govern those cells. No `final-experiment-plan.md` exists in this checkout.

The reader asks for the newest posts in their groups. The existing link key
starts with the document, not the group. Arm D avoids that mismatch through
an author-set shortcut; Arm T tests the group-first layout itself, including
groups containing documents from several authors. No follower fanout, workers
or per-follower writes are part of this experiment.

## Admission, before any engine work

1. Require the source/query-bound diagnosis of the preserved baseline's
   **360,801,800 rows / 24,319,446,938 logical bytes per failed main**. It must
   attribute the broad reads to the document/link boundary scans. If it
   attributes the mass elsewhere, stop and report; arithmetic alone is not
   a diagnosis receipt.
2. Require a launch receipt for the **Study B 1M pilot**. The serial smoke is
   not that pilot. Arm T must not delay or displace a frozen cell.
3. Use Arm T's **own DigitalOcean droplet and store copy**, separate from the
   baseline/pilot stores. Verify explicit budget, lifetime, cleanup watchdog,
   disk headroom and dataset review/storage admission before provisioning.
   No engine execution on the local Mac, including tiny SQL fixtures.

At implementation start both sequencing receipts are absent from this
checkout; `RD4-SMOKE-NEXT` remains open. Offline tooling/tests may be prepared
under the operator's subsequent implementation instruction. They do not
authorize a build, paid launch or inferred receipt.

## One layout, one frozen input

Input ID: `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
Do not regenerate or alter it. Build standalone `doc_groups_t`,
`ORDER BY (group_id, created_at, doc_id)`, alongside the originals. Denormalize
document creation time and author at setup, not in measured feed time.

The snapshot also carries service/tags and the three existing reference
expressions used by the main query (`ref_value`, comment `post_id`,
`repost_of`). These payload fields allow eligibility before LIMIT and exact
related-document selection without assuming engagement authors equal post
authors. They are build-time metadata, not new indexes or materialized counts.
Retain original link timestamps/deletion fields. Refuse non-unique document
IDs, document/link history or tombstones rather than silently flattening them;
this first implementation is an immutable-fixture snapshot, not a production
maintenance or lifecycle design.

Receipt the source/variant counts (expected source: **92,200,600 links**),
missing joins, metadata parity, DDL/build SQL hashes, source pins, engine,
hardware/envelope, elapsed setup and failures. Never rename, exchange, alter
or drop an original table. Existing variant/receipt paths must refuse reuse.

## The measured main path

* For each actually readable group, select eligible posts newest-first with
  a page-bounded LIMIT **22** (21 plus one ambiguity guard), after the existing
  author/group policy predicates. No personal-feed date cutoff. Shared groups
  are not converted to owner identities.
* Merge those slices, resolve candidate identities through canonical document
  and original link point checks, then take the global page. Keep the captured
  Newest ordering; do not silently introduce a different ranking or tie rule.
* Resolve winning posts by full `(author_key, doc_id)` and use group-first
  metadata to locate the exact related reaction/comment/repost/profile
  identities. Their canonical reads and original link checks retain **all**
  compiled policy gates and aggregate semantics. The metadata scans for related
  rows are a declared residual, not falsely labelled page-bounded seeks.
* Count candidate selection and every verification/metadata read as **main
  request cost**, not setup. Normal auth, Origin, app grants, readability
  resolution, preparation and delivery logging remain in the request path.
  Other frozen treatment flags stay off in this isolated main-only arm.

Exact output IDs/order and full projected values must pass the existing
independent canonical oracle before performance claims. Duplicate group
attachments, shared authorship, filtered newer posts, timestamp ties,
cross-author engagement and compiler drift need controls. A mismatch is
**INVALID**: retain the receipt, stop, report; never adjust the oracle.
Canonical checks prevent stale metadata granting access, but stale snapshot
underfill is still invalid, not a claimed lifecycle solution.

**Tie refusal, not a new ordering:** the captured Newest query has no tie-breaker.
The canonical merge reads 22 guard rows and refuses any equal creation timestamps
in that relevant set, including equal-time duplicate attachments. It does not
silently choose doc-ID ordering. This is an explicit unsupported exact-parity
condition: record INVALID and stop for Jacob, not a successful overlap/tie test.
Whether the admitted 1M reader encounters this condition is not yet measured.

## Cells and reporting

First cell only: **K=20, full 1M store, three independent trials**, unchanged
production **10-second deadline**, ClickHouse **24.8.14.39**, **32 GiB droplet /
28 GiB container / 22 GiB ClickHouse / 4 GiB OS+API**. Use frozen warm-up,
sample-count, fresh-restore and receipt discipline, not three smoke requests
masquerading as p95. Native rows/bytes are primary; latency is secondary and
setup-labelled. Keep query IDs/fingerprints and errors, separate main-statement
cost from total main-request and complete-sequence cost.

Report build reconciliation, parity verdict and K20 numbers beside the
preserved negative baseline and **Arm D realism** receipts when available.
Old V2 Arm D numbers are not a realism comparator. Phase-0 bar remains
**p95 <500 ms AND <25 MB per request**; a main-only win does not establish
the complete sequence meets it. Untreated follow-ups may remain expensive.

Only after K20 passes with parity: **one K=1000 stress cell**, including canyon
groups/shared-group generality. No other cells without Jacob's go. No
production changes, §8 migration, fanout, public release or CMT submission.
Paper submission remains a separate explicit decision after the full gates.

## Tooling and the next executable step

`arm_t.py` builds/reconciles the separate snapshot. `arm_t_rewrite.py` pins the
actual compiler output and constructs the two-stage canonical main.
`arm_t_api.py` is a **separate** ASGI entry point selected only by
`arm_t.compose.yml`; neither the frozen research observer/overlays nor the
production API is changed. Startup checks the build seal/source hashes and
all three table UUIDs, so a receipt from another store cannot activate it.
Setup checks the actual 32-GiB host, 28-GiB container and 22-GiB server cap;
it conservatively requires 140 GiB free on the Docker store before a build
with a 100-GiB per-query spill cap. This is not a whole-process disk guarantee;
the independently approved operational monitor/watchdog remains necessary.
The API checks the actual DO host before startup SQL and revalidates the
build-bound admission/deadline before every request and compilation. It does
not reuse the old baseline host or an expired setup approval as runtime authority.

The admission JSON is an operator-owned launch record, not a credential or
an independent proof by itself. It must contain `kind: ARM_T_ADMISSION`,
`approved_by: Jacob`, the exact `dataset_id`, Arm T `droplet_id`, positive
`budget_usd`, offset-bearing future `deadline_utc`, `input_reviewed: true`
and `storage_admitted: true`. It references **existing** diagnosis/pilot/cleanup
receipts as `{path, sha256}` objects; relative paths resolve beside admission.
Do not manufacture these records to satisfy a boolean gate:

* Diagnosis: `outcome: BASELINE_BOUNDARY_SCANS_CONFIRMED`, exact dataset and
  `baseline_query_sha256` from the preserved receipt, `read_rows: 360801800`,
  `unexpected_attribution: false`; also exact `baseline_receipt_sha256`, full
  baseline `sources`, all measured `native_query_ids`, and
  `scan_rows_by_table: {documents: 176400600, doc_groups: 184401200}`. Its
  `retained_query` and `scan_evidence` are nonempty digest-bound `{path, sha256}`
  artifacts beside admission; the retained SQL hash must equal the actual failed
  query hash. The latter artifact preserves the actual native plan/scan evidence,
  not a new assertion that the arithmetic happens to add up. Source/plan review
  remains necessary; structural admission is not independent forensic proof.
* Pilot: `study: B`, exact dataset, `accounts: 1000000`, `trials: 3`, actual
  `launched_utc` and the pilot's different `droplet_id`.
* Independent cleanup: Arm T `droplet_id`, the same `deadline_utc`,
  `verified: true`, backed by the operational watchdog receipt.

After those gates, on the own DO host with a fresh completed
`web10-costfn-frozen-armt-*` restore, the setup command is:

```sh
python arm_t.py "$INPUT" --validation "$VALIDATION" --restore "$RESTORE" \
  --admission "$ADMISSION" --out "$NEW_BUILD_RECEIPT"
```

Only that store's API may then be started with the ordinary realism/restore
Compose files **plus** `arm_t.compose.yml` last, setting
`COSTFN_ARM_T_BUILD_RECEIPT` to the host's verified build JSON and
`COSTFN_ARM_T_ADMISSION_DIR` to the directory containing `admission.json` and
its relative evidence artifacts. Both are mounted read-only. Keep the
ordinary source mounts and independent stop timer. The additive overlay
forces Arm D, satellite and views switches off; it never enters a frozen run.

Then exercise the unchanged independent canonical smoke oracle through the
actual API, with one excluded warm-up and three serial observations:

```sh
python arm_t_probe.py "$INPUT" --restore "$RESTORE" --build "$NEW_BUILD_RECEIPT" \
  --admission "$ADMISSION" --out "$NEW_PROBE_DIRECTORY"
```

`arm-t-parity.json` distinguishes PASS / INVALID / NOT_ESTABLISHED and
requires matching per-request Arm T observer evidence. HTTP errors do not
become parity passes. The probe binds its direct oracle queries to the same
admission as the build. A fixed content-free `x-arm-t-invalid: 1` response
marker stops the single-process probe immediately through an additive request
hook; it does not alter the independent row/count oracle or convert ordinary
timeouts into semantic errors. Native sequence totals include candidate selection.
The retained smoke-shaped summary explicitly remains a serial diagnostic;
this command is **not** the formal K20 cell. Fresh-restore three-trial sampling
integration and independent native-engine verification remain OPEN, to be
admitted after the pilot rather than routed through the V2 runner/oracle.

Offline checks (no engine or network execution):

```sh
python arm_t.test.py
python arm_t_probe.test.py
```

These check admission refusals, AST key pushdown/gate preservation, current
compiler pin, shared-group identifiers, overlap/order preservation and mocked
adapter/receipt behavior. They do **not** execute the SQL or establish shared-
group/tie/count parity in ClickHouse. The separate additive-arm-t CI job runs
only these controls; native-engine tests stay on the admitted DO host.
