# Study C — per-request cost vs K + hotness, winning D + treatment (batched, sample)

Running study log. Config (from CELLS): D layout, treatment=True, resolver=batched,
kind=sample; TRIALS=3/cell. Cells: c-k20-d, c-k20-h, c-k100-d, c-k100-h, c-k1000-d,
c-k1000-h (k1000 uses `--admit-structural` + `--no-live-parity`).
Local, $0, pinned ClickHouse 24.8.14.39, 5 GB CH cgroup cap + 4 GB server throttle
(`results/` + `clickhouse-config/memory.xml`). Raw receipts under `.context/p1/C/`.

## c-k20-d / trial 1 (k20-1m-dispersed) — 2026-11-10

**Verdict: CLEAN — 30/30 measured feeds, ch_exceptions=0 on every shape, teardown verified.**

### Trial metadata
- seed `1794286915:C:c-k20-d:1`, reader_index **6832** (random fixture-reader per trial)
- project `web10-costfn-frozen-p1-c-ck20d-t1`, port 6095
- window: 3 excluded warm-up feeds + 30 measured at 5 s cadence; 15 s warmup,
  150 s measured, 60 s drain.

### Restore (preparation)
- preparation_seconds **440.474** (~7.3 min), clickhouse 24.8.14.39
- counts: documents 0 → **3,100,000**; doc_groups 0 → **4,100,000**
- preflight warm-ups (excluded, concurrent shape): 20 feeds / 80 records,
  **14 warmup requests failed** on the cold post-import stack — tolerated + recorded
  (warm-ups are never study samples); strict sequential check: **core_results 2/2,
  preflight_strict_retries 0** (the functional exact-result check passed first try).

### Rekey
- kind **ARM_D_SORT_KEY_REKEY** (documents re-ordered to
  `(author_key, created_at, doc_id, updated_at)`; rollback `documents_old_arma`).

### Sample (measured window)
- measured **30/30 completed, 0 failed**, valid_offered_load **true**, sample_rc 0
- request_counts: main/reactions/comments/views each **30×200 measured + 3×200 warmup**
- in-window counters: peak_feed_in_flight **3**, peak_http_requests **6**,
  http_requests_after_drain **0**; generator window 0.596 s CPU, driver maxRSS ~41.6 MB

### Native per-shape (from system.query_log, post-rekey measured window)
| shape | n | avg rows | avg MB | avg ms | CH exceptions |
|-------|---|----------|--------|--------|---------------|
| ad-inventory   | 3   | 7,200,000 | 843.2 | **3443** | 0 |
| followup-armA  | 124 | 3,657,056 | 212.2 | 74 | 0 |
| followup-treated | 62 | 3,100,000 | 112.7 | 80 | 0 |
| main-treated   | 31  | 81,920    | 7.5   | 70 | 0 |
| other          | 1026| 167,135   | 13.8  | 47 | 0 |

- **TOTAL CH exceptions = 0** — no code-241 (memory cap), no code-159 (timeout), no
  code-137 (OOM). The sample genuinely completed; the 4 GB server cap never fired.
- **main-treated = the win**: 81,920 rows / 7.5 MB / 70 ms. The row count is
  structural (reader-independent): C-t1 reader 6832 and B-b1m-t1 reader 4632 both
  measured 81,920 main rows (~4000 recent posts × 20 followed creators); only the
  bytes vary with content (7.5 MB here vs 3.2 MB in B-t1).
- **ad-inventory = the dominant cost**: 7.2M rows / 843 MB / 3.4 s per query, runs
  ~3×/window (60 s verified-TTL). ~10 s of the 150 s window is the ad-inventory.
  This is the Phase-0-flagged residual the Phase-1.5 counting_numbers satellite does
  NOT cover.
- follow-up shapes are service-partition reads (rows stable across readers):
  treated (reactions+comments) 3.1M/112.7 MB, views (armA, untreated) 3.66M/212.2 MB.

### Notes / what to watch in t2/t3
- Expect main-treated ~82k rows stable, MB varying; follow-up + ad-inventory rows
  stable (service partitions). A material change in main rows, or any non-zero
  CH exceptions, is the signal to investigate.
- The 14 excluded warmup failures on the cold stack are normal (concurrent warm-up
  shape under post-import memory); the strict check is what gates correctness and it
  passed cleanly.

## (c-k20-d t2, t3 — pending)
