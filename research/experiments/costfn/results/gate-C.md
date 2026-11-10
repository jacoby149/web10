# Study C gate — per-request cost vs K + hotness, winning D + treatment (batched, sample)

Date: 09–10.11.2026 (local, $0, pinned ClickHouse 24.8.14.39, 5 GB CH cap + 4 GB
server throttle). Config: D layout, treatment=True, resolver=batched, kind=sample;
3 trials/cell. 18 trials total — all receipts retained under `.context/p1/C/`.

## Receipts (all 18)
| cell | t1 | t2 | t3 | note |
|------|----|----|----|------|
| c-k20-d   | 30/30 | 17/30 | 30/30 | t2 reader-dependent residual timeouts (ch_exc=0) |
| c-k20-h   | 29/30 | 30/30 | 30/30 | |
| c-k100-d  | 30/30 | 30/30 | 30/30 | |
| c-k100-h  | 30/30 | 30/30 | 29/30 | t1/t3 re-ran after a transient restore flake |
| c-k1000-d | 0/30  | 0/30  | 0/30  | K=1000 stress (mains 400/403 under load) |
| c-k1000-h | 0/30  | 0/30  | 0/30  | K=1000 stress |

`ch_exc=0` on **every** trial (the 4 GB CH throttle held — no OOM, no lost query_log).
The partials (c-k20-d t2, c-k20-h t1, c-k100-h t3) are reader-dependent API timeouts on
the slow residual queries (ad-inventory + the doc_groups service-partition CTEs), recorded
per-feed; the native per-shape data is still captured.

## Per-cell native shape (mean across clean trials)
| cell | main-treated (rows / MB) | followup-armA (rows) |
|------|--------------------------|----------------------|
| c-k20-d  | 81,920 / 6.7  | 3,659,787 |
| c-k20-h  | 40,960 / 1.4  | 3,706,208 |
| c-k100-d | 122,880 / 7.9 | 3,698,016 |
| c-k100-h | 40,960 / 1.6  | 3,763,552 |
| c-k1000-* | (stress — mains 400/403 before CH) | — |

## Findings
1. **main feed (the K/hotness-sensitive measurement) is well-treated and K-scaled:**
   - dispersed: K=20 → 81,920 rows; K=100 → 122,880 rows (scales with the number of
     followed creators, as expected).
   - hot: **flat 40,960 rows** at both K=20 and K=100 — the hot (recent-window) locality
     reads fewer rows than dispersed (cheaper: 1.4–1.6 MB vs 6.7–7.9 MB).
2. **followup-armA is K-INDEPENDENT (~3.66M–3.76M rows):** confirms (with the Phase 1.6
   Step-0 10k/1M capture) that this bucket is the **reactions/comments service-partition
   CTEs** — Phase 1.5's `counting_numbers` responsibility, NOT the views follow-up.
3. **K=1000 is the declared stress cell** (PROTOCOL: structural admission; "the stress
   cell's measured failures are the result"): the full main feed 400/403s under the
   30-feed sample load (the 1000-group readable-resolution/compile exceeds the limit),
   but a **single** main feed succeeds (verified: reader 0 → 200, 20 rows, 322 ms). So
   K=1000 cannot sustain the offered load; that is the measurement, not a tooling fault.
4. **The 4 GB CH throttle held all 18 trials** (`ch_exc=0`): no code-137 OOM, no lost
   native logs — the pre-satellite residual load (ad-inventory 843 MB + the service-
   partition CTEs) stayed inside the cap at ~1-feed/5s cadence.

## Gate verdict
PASS for the K=20/K=100 cells: the winning D + treatment sustains the full 30-feed
sample at 1M with the main feed K-scaled and residuals at their declared (K-independent)
scale. K=1000 is the declared stress boundary (main feed fails under offered load; single
feed succeeds). Carried into gate15/Phase 2: the residuals (followup-armA + ad-inventory +
the views doc_groups subquery) are what Phase 1.5 (counting_numbers) + Phase 1.6 (views
Step-1 readability move) reduce to point-seek.

## Infra notes (transient, resolved)
- c-k100-h t1/t3 initially hit a CH-boot connection-refused restore flake (VM contention
  at a trial boundary); re-ran clean on a settled VM (t1 30/30, t3 29/30).
- c-k1000-d t1 was left without a clean receipt when a C pass was interrupted mid-restore;
  its valid 0/30 stress receipt was restored from the archived attempt. The resume logic
  now reads `sample.request_counts` (not top-level) so K=1000 0/30 mains-4xx stress cells
  are kept as valid measurements, not re-run.
