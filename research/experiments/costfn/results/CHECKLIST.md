# K=20-first experiment — CHECKLIST

Order: Phase 0 → B → C → A → P → X → gate15 (Phase 1.5) → Phase 2.
Local-only per the frozen protocol (**no DigitalOcean / no cloud**). All receipts in
`.context/p1/`; gate records in `results/`. **5 of 9 complete** as of this checkpoint
(run stopped at P).

## Progress

```
Phase0 ▓▓▓▓▓ done    B ▓▓▓▓▓ done    C ▓▓▓▓▓ done    A ▓▓▓▓▓ done    1.6 ▓▓▓▓▓ done
P    ░░░░░ left     X ░░░░░ left     gate15 ░░░░░ left     Phase2 ░░░░░ left
```

## The chart

| # | Study / phase | Status | Headline result | Time |
|---|---------------|--------|-----------------|------|
| 1 | **Phase 0** (protocol, floors, Arm A baseline, Arm D win, Step-1 gate) | ✅ done | Arm A full-scan intractable @1M; Arm D main 74k/2.6 MB/36 ms (~50×), parity + I3 | — |
| 2 | **Study B** (K=20 scale ladder, D+treatment) | ✅ done | 9/9 clean; 1M main 68k/5.3 MB; follow-ups at declared residual | — |
| 3 | **Study C** (per-request K×hotness, 1M) | ✅ done | 18/18; main K-scaled dispersed (81.9k→122.9k), flat 40,960 hot; K=1000 = stress; `ch_exc=0` | — |
| 4 | **Study A** (Arm A baseline, resolver varied, 1M) | ✅ done | 18/18; Arm A main intractable (~10M/0.85 GB full-scan, K-independent); per-group HTTP-timeout vs batched CH-OOM @K=1000 | — |
| 5 | **Phase 1.6** (views follow-up) | ✅ done | Corrected the "views=3.7M" misattribution; treatment = Step-1 readability move; gate 4,100,060 → 1,240 rows, parity PASS | — |
| 6 | **Study P** (attribution: D rekeyed, treatment DISARMED, paired) | ⬜ left (stopped at 0/3) | does the rekey alone (no treatment) change the Arm-A-shape main feed? | **~30 min** (3 paired) |
| 7 | **Study X** (attribution: treatment on the OLD key) | ⬜ left | isolate the rekey vs the treatment (x-k20-oldkey) | **~30 min** (3) |
| 8 | **gate15** (Phase 1.5 `counting_numbers` satellite) | ⬜ left | build satellite + gate on D+satellite+views-treat; drop reactions/comments ~3.7M → point-seek | **~1 h** |
| 9 | **Phase 2** (37k-DAU load demo) | ⬜ left (only on D+satellite+views-treat) | 1,400 readers, 23.3 feeds/s, 10-min window, <1% errors, zero correctness failures | **~45 min local** |

**Remaining: ~2.5–3 h local.** (gate15 + Phase 2 are the two substantive pieces; P/X are
short attribution controls.)

## Gate dependencies
- **P, X** are independent controls — just run them.
- **gate15** must PASS before Phase 2 (Phase 2 runs on D + counting_numbers +
  views-treat; if gate15 fails, Phase 2 does **not** silently fall back — report + stop
  for operator decision).
- **Phase 2** is the last gate; it is only meaningful after gate15.

## Phase 2 environment — local vs DigitalOcean
- **Protocol: local only** (PLAN: "Everything runs locally on Jacob's Mac. No
  DigitalOcean, no cloud at all"; the Nov 6–9 cloud path was superseded/cancelled — it
  "added nothing but tier blocks").
- **Ambitious option (operator call):** if the Mac's 7.65 GiB shared Docker VM can't
  sustain the 37k-DAU load demo (1,400 readers, 23.3 feeds/s), Phase 2 may run on a
  **bigger DigitalOcean instance** — "a bigger instance, not a different architecture"
  (PROTOCOL §1). That is a deliberate departure from local-only, declared in the run
  receipt; it is not the default. The 5 GB ClickHouse cap + pinned engine are recorded
  either way.

## Resume
```
cd research/experiments/costfn
python3 phase1.py run P      # p-k20 (3 paired); t1 has no receipt -> runs clean
python3 phase1.py run X      # x-k20-oldkey (3)
python3 gate15.py ...        # Phase 1.5 satellite build + gate (on D + satellite + views-treat)
python3 phase2.py ...        # 37k-DAU load demo (only after gate15 passes)
```
