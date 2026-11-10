# K=20-first experiment — progress checkpoint (10.11.2026)

Local-only, $0, pinned ClickHouse 24.8.14.39, 5 GB CH cap (+4 GB server throttle).
All raw receipts under `.context/p1/<study>/`; gate records under `results/`.
This checkpoint was written when the run was deliberately stopped at **Study P** for a
merge. Resume instructions at the bottom.

## Order: Phase 0 → B → C → A → P → X → gate15 (Phase 1.5) → Phase 2

## DONE

### Phase 0 — `results/gate-phase0.md`
- K=20 small floors PASS (exact 20/20, joins, Discover, Origin denial, 7/7 lifecycle).
- **Arm A baseline (preserved FAILED):** 4/4 mains 400 under the pinned cap; every main
  natively reads whole `documents`+`doc_groups` (~30M rows across the CTEs per main).
- **Arm D treated main:** 74k rows / 2.6 MB / ~36 ms native execute, ~260 ms e2e —
  ~50× fewer bytes, exact parity, I3-verified; pre-declared main-query target MET.
- **Step-1 sequence gate PASS:** reactions/comments moved to the exact-ID residual
  (~3.1M/126 MB); CH alive at cap.

### Study B — `results/gate-B.md` (K=20 scale ladder, D + treatment, batched)
- 9/9 trials clean (b-10k / b-100k / b-1m). 1M main-treated = 68,267 rows / 5.3 MB.
- Follow-ups at the declared step-1 residual; views + ad-inventory still Arm A shape.
- 3 infra fixes found + committed (main-pin group-order independence, sequential 1M
  preflight, import CH-restart retry).

### Study C — `results/gate-C.md` + `results/study-C.md` (per-request K×hotness, 1M)
- 18/18 trials. main-treated K-scaled for dispersed (81,920 @K20 → 122,880 @K100) but
  **flat 40,960 for hot** (recent-window locality reads fewer rows). followup-armA
  K-independent ~3.7M (= reactions/comments service-partition, NOT views). K=1000 =
  declared stress (0/30 mains 400/403 under load; a single feed succeeds). `ch_exc=0`
  on every trial (the 4 GB throttle held).

### Study A — `results/gate-A.md` (Arm A untreated baseline, resolver varied, 1M)
- 18/18 trials. **Arm A main feed intractable at 1M** (main200 = 1–18/30; sequence 0–5/30);
  the full-scan reads **~10M rows / ~0.85 GB, K-independent**. Resolver contrast at
  K=1000: per-group → all mains HTTP-timeout (`None`); batched → reaches the full-scan,
  CH OOMs (500). 3 trials OOM'd CH (valid baseline; `request_counts` retained).

### Phase 1.6 — `results/phase1.6-step0-views-classification.md` + `results/phase1.6-decision-memo.md` (PR #1474)
- **Corrected a misattribution:** the "views = 3.7M `followup-armA`" label (gate-B +
  the task block) was wrong — that bucket is the reactions/comments service-partition
  CTEs (Phase 1.5). The `contentViews` follow-up is a top-level `SELECT` from
  `content_events` (~41k @10k; 4,100,060 @1M via the `doc_groups` I3-readability
  subquery — `content_events` itself is ~60 rows).
- **Branch A (satellite) rejected** for views (freshness: `content_events` is written by
  the study's window-deduped delivery logging; `reach` is `countDistinct`, not a sum; the
  satellite wouldn't touch the cost driver).
- **Treatment = the Step-1 readability move:** add `doc_id IN (<returned ids>)` to the
  inner `doc_groups` subquery (prefix seek; `doc_groups` is `ORDER BY (doc_id, group_id)`).
  Gate: parity PASS (20 docs byte-identical), native **4,100,060 → 1,240 rows**
  (372.8 → 1.2 MB, 670 → 5 ms). Gated `COSTFN_VIEWS_TREAT=1`, research-only.
  No `counting_numbers` / freshness / reach handling.

## STOPPED HERE — Study P (0/3)
- p-k20 (layout D rekeyed, **treatment disarmed** `COSTFN_ARM_D=0`, batched, **paired**):
  the attribution control (does the rekey alone, without the treatment, change the
  Arm-A-shape main feed?). p-k20 t1 was in its sample when the run stopped — no receipt;
  it re-runs on resume. No P receipts yet.

## REMAINING (after P)
- **Study P:** 3 paired trials (p-k20).
- **Study X:** 3 trials (x-k20-oldkey — treatment on the OLD key; attribution control).
- **gate15 (Phase 1.5):** the `counting_numbers` satellite build + gate, on
  D + satellite + views-treat. Drops the reactions/comments service-partition reads
  (~3.7M @1M) to point-seek. Prereq for Phase 2.
- **Phase 2:** the 37k-DAU load demo (1,400 distinct readers, 23.3 feeds/s, 10-min
  window) — runs ONLY on D + counting_numbers + views-treat; if gate15 fails, Phase 2
  does not silently fall back (report + stop for operator decision).

## How to resume
```
cd research/experiments/costfn
python3 phase1.py run P      # resumes p-k20 (skips any clean trials)
python3 phase1.py run X      # then X
# gate15 (Phase 1.5 satellite) + Phase 2 per their drivers (gate15.py, phase2.py)
```
The runner resumes by receipt: clean trials skip, errored/infra-invalid re-run, K=1000
0/30 mains-4xx stress cells are kept (resume reads `sample.request_counts`).

## Infra state (all committed; in PRs #1473 + #1474)
- CH listen on 0.0.0.0 (the config.d dir-mount was shadowing the image's
  `docker_related_config.xml` — now a single-file mount).
- 4 GB CH server throttle under the 5 GB cgroup cap (clean 241 backpressure, not 137).
- 8123 HTTP probe + API restart-once (the app's startup CH probe races the late-binding
  HTTP port) + import CH-restart retry + sequential 1M preflight + Arm D main-pin
  group-order independence.
