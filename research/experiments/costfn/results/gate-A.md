# Study A gate — Arm A untreated baseline (layout A, no rekey, resolver varied)

Date: 10.11.2026 (local, $0, pinned ClickHouse 24.8.14.39, 5 GB CH cap + 4 GB
server throttle). Config: layout A (original `(author_key, doc_id)` key),
treatment=False, resolver mode varied (per-group vs batched), kind=sample; 3
trials/cell. 18 trials, all receipts under `.context/p1/A/`.

## Per-trial result (main-feed status mix; followup-armA = the Arm A full-scan read)
| cell (resolver) | t1 | t2 | t3 | followup-armA full-scan |
|---|---|---|---|---|
| a-k10-pg  | 1/30 (200:18,400:12) | OOM (200:2,400:15,500:13) | 0/30 (200:6,400:24) | ~9.8M / ~820 MB |
| a-k10-bt  | 0/30 (200:8,400:22) | 1/30 (200:12,400:18) | 0/30 (200:7,400:23) | ~9.8M / ~820 MB |
| a-k100-pg | OOM (200:1,400:4,500:25) | 1/30 (200:6,400:24) | 1/30 (200:5,400:25) | ~10.1M / ~860 MB |
| a-k100-bt | 2/30 (200:13,400:17) | 0/30 (200:9,400:21) | 4/30 (200:12,400:18) | ~10.0M / ~858 MB |
| a-k1000-pg | 0/30 (None:30) | 1/30 (200:1,None:29) | 0/30 (200:1,None:29) | ~10.0M / ~880 MB |
| a-k1000-bt | 0/30 (200:2,400:3,500:25) | 5/30 (200:18,400:12) | 0/30 (200:18,400:11,500:1) | ~9.9M / ~870 MB |

## Findings
1. **The Arm A main feed is intractable at 1M** (the baseline Arm D exists to fix):
   `main200` is 1–18 of 30 across all cells (mostly 400s; K=1000 adds 500s/None).
   The sequence completes 0–5/30 per trial. This is the comparison arm — the full
   personal-feed query reads the whole `documents` + `doc_groups` (boundary CTEs
   resolve the K readable groups by full-scan; `doc_groups` is `(doc_id,group_id)`
   so group→docs is not a prefix seek).
2. **The full-scan cost is K-INDEPENDENT: ~10M rows / ~820–880 MB** per main feed
   (the `followup-armA` bucket here = the main feed's engagement CTEs in Arm A shape;
   note this is ~2.7× the ~3.7M service-partition read of the D-layout studies,
   because in Arm A the main feed's own CTEs also full-scan). It is the native read
   behind every `main200`/`main400` — captured even on the OOM trials.
3. **Resolver-mode contrast (the A study's purpose):**
   - K=10/100: per-group and batched both fail, similar main200 (per-group slightly
     better at K=10: 18/6 vs 8/12/7).
   - **K=1000: the failure mode diverges.** per-group → all mains `None` (HTTP timeout:
     the 1000 individual readable-group queries are too slow). batched → mains reach
     the full-scan and CH OOMs (500s) or 400s. So at K=1000 the per-group resolver
     times out before it can even full-scan; batched gets further but OOMs.
4. **3 trials OOM'd CH** (a-k10-pg t2, a-k100-pg t1, a-k1000-bt t1): the Arm A
   full-scan's page cache crosses the 5 GB cgroup even with the 4 GB tracked-memory
   throttle. These are valid baseline results (the `request_counts` are captured
   before the OOM); they are the baseline failing, not infra to re-run.

## Gate verdict
PASS as the baseline — it establishes the Arm A full-scan is intractable at 1M
(~10M rows / ~0.85 GB per main feed, main feed 0–5/30 sequence, K-independent),
the comparison arm against which Arm D (Study B/C: main feed 81k–123k rows / 7 MB,
30/30) is measured. The resolver-mode divergence at K=1000 (per-group timeout vs
batched OOM) is recorded. No CMT/production action; baseline retained per PLAN
("keep every failed baseline measurement").
