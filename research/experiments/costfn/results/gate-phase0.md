# Phase 0 gate — baselines + Step-1 sequence (K=20 / 1M), winning D + treatment

Date: 09–10.11.2026 (local, $0, pinned ClickHouse 24.8.14.39, 5 GB CH mem_limit
recorded per receipt — research.compose.yml, commit 9fd52dadd).
This is the "Arm A gate": the preserved failed baseline vs the treated main win,
plus the Step-1 sequence gate. Raw receipts retained under `.context/`.

## 0. Inputs + floors (K=20 small, strict acceptance)
- Frozen inputs generated + all-row validated locally: k20-1m-dispersed `424cdf26…`,
  k20-1m-hot `ed2e8a02…`, k100-1m-{disp,hot}, k10-1m-dispersed `880adce4…`,
  k20-100k `43d14a2b…`, k20-10k `6118af72…` (+ k1000-1m-{disp,hot} `dbed22…`/`53b16c…`).
- Wire re-pinned `core-feed-wire-v5` + `core-feed-next-page-v4` (all four payloads
  byte-identical to v4/v3).
- Both K=20 small floors (40 creators / 2 readers) PASS strict acceptance on
  24.8.14.39: exact 20/20, joins, Discover links, Origin denial, 7/7 lifecycle,
  3 paired pairs, 0 after drain. Receipts `.context/floor-k20-{disp,hot}-acceptance/`
  (4/4 measured, 0 fail each).

## 1. Arm A baseline (PRESERVED FAILED) — the comparison arm
Receipt `.context/k20-1m-disp3-armA/summary.json` (Phase 0 `arm_a_baseline_trial`);
earlier pre-cap partial `.context/k20-1m-disp-armA-baseline/`.
- Result: **FAILED — 4/4 measured mains 400** under the pinned 5 GB allocation;
  measurement_valid true; raw records retained ("keep every failed baseline").
- Native breakdown (from evidence/phase0-armd-20261110.json):
  - code_241 total_memory_limit ×5: avg 4.11M rows, 406 MB read, 1248 MB peak mem
  - code_159 timeout_10s ×5: avg 25.1M rows, 2248 MB read
- Warm single-threaded K=20 main: execute 1.4–3.9 s, total-with-prepare 3.2–6.7 s,
  follow-ups ~1.4–2.8 s. Cold concurrent mains hit the 10 s native limit.
- Mechanism: every main natively reads the WHOLE `documents` + WHOLE `doc_groups`
  (boundary CTEs resolve the 20 readable groups by full-scan; doc_groups is keyed
  (doc_id, group_id) so group->docs is not a prefix seek); ~30M rows across the
  four service CTEs per main.

## 2. Arm D treated — the win
Receipt `.context/k20-1m-disp3-armD-trial/`; evidence/phase0-armd-20261110.json.
- Main feed: **74k rows / 2.6 MB / ~36 ms native execute, ~260 ms end-to-end**
  (incl. point verification) — ~50× fewer bytes per main query than Arm A.
- Exact output parity vs Arm A, I3-verified (no document returned for an
  author_key the token does not own).
- Pre-declared main-query target (p95 < 500 ms AND bytes < 25 MB) **MET**.
- Full feed SEQUENCE not yet met: the two engagement follow-ups (~3.7M rows /
  ~215 MB each) and the node-ad inventory read (7.2M rows / 843 MB) were still
  Arm A shape at this point.

## 3. Step-1 sequence gate (PASSED)
Receipt `.context/k20-1m-disp3-seq-gate/summary.json` (PR #1471).
- 4/4 measured feeds 200 (main/reactions/comments/views all 200), lifecycle 7/7,
  CH alive at the 5 GB cap (no 137).
- Step-1 follow-up treatment (PROTOCOL §4): the compiled follow-up's boundary CTE
  is rewritten — documents window gains `ref_value IN (returned post ids)`
  [declared residual: the whole service partition, ~3.1M native rows on the D key,
  filtered to ~310k reactions / ~31k comments, result 20]; the doc_groups join and
  group-keyed gates are dropped; readability verified per request by point-scale
  checks (doc_id seek on doc_groups' key prefix + reader Discover membership +
  empty gate tables); author-keyed gates retained.
  native_read: ~3.19M rows / 126 MB per treated follow-up (vs ~3.7M / 215 MB Arm A).
- Byte-exact golden pins per service:
  evidence/arm-d-compiled-followup-{reactions,comments}-golden-20261110.sql.
- Node-ad inventory: 60 s verified-TTL short-circuit (chosen over exclusion;
  declared in PROTOCOL before the run).

## Gate verdict
- Floors: PASS (both K=20 small).
- Arm A baseline: PRESERVED FAILED (the comparison arm; the whole reason Arm D exists).
- Arm D treated main: PASS — main-query target met, exact parity, I3.
- Step-1 sequence gate: PASS — follow-ups at the declared residual, CH alive at cap.
- Carry-over to B/C: the full sequence still carries the views follow-up +
  ad-inventory in Arm A shape; the 1M sample under the 5 GB cap OOMs on those
  residuals near the end of the window (observed in Study C) — precisely the
  surface the Phase-1.5 counting_numbers satellite (gate15) is scoped to drop to
  point-seek. See results/gate-C.md.
