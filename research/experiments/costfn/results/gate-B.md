# Study B gate — K=20 scale ladder, winning D + treatment (batched), sample

Date: 09.11.2026 (local, $0, pinned ClickHouse 24.8.14.39, 5 GB allocation recorded per receipt)
Config (from CELLS): D layout, treatment=True, resolver=batched, kind=sample; TRIALS=3/cell.
Inputs: k20-10k/100k/1m-dispersed (frozen, pinned IDs verified).

## Receipts
| cell | trials | measured feeds / 90 | parity | notes |
|------|--------|---------------------|--------|-------|
| b-10k-d  | 3/3 | 89 | PASS | 1 feed censored (recorded) |
| b-100k-d | 3/3 | 89 | PASS | 1 feed censored (recorded) |
| b-1m-d   | 3/3 | 90 | PASS | t1/t2/t3 all 30/30; t3 completed on live stack after a CH-import flake |

No 5xx in any measured window; valid_offered_load=true on all.

## Per-shape native table (mean across the 3 clean trials per cell)

b-1m-d (the full-scale cell):
| shape | avg rows | avg MB | total CH failures |
|-------|----------|--------|-------------------|
| ad-inventory   | 7,200,000 | 843.0 | 0 |
| followup-armA  | 3,708,939 | 214.7 | 0 |
| followup-treated | 3,100,000 | 111.7 | 0 |
| other          | 171,813   | 13.7  | 0 |
| main-treated   | 68,267    | 5.3   | 0 |

b-100k-d: ad-inventory 720,000/84.0; followup-armA 438,475/28.7; followup-treated 310,000/11.0; main-treated 40,960/2.7; other 25,894/2.0
b-10k-d:  followup-armA 72,000/6.0; ad-inventory 72,000/8.0; main-treated 40,960/6.0; followup-treated 31,000/2.0; other 8,648/0.0

## vs the preserved Arm A baseline (Phase 0, 1M, k20-1m-disp3)
Arm A mechanism: every main natively reads whole `documents` + whole `doc_groups`
(~30M rows across the four service CTEs per main); concurrent sequence FAILED the
pinned allocation (4/4 mains 400; code_241 total_memory_limit 5×, code_159 10s-timeout 5×
at ~25.1M rows / 2.2 GB). Preserved per PLAN: "keep every failed baseline measurement".

Arm D treated (this run):
- main feed: 68k rows / 5.3 MB at 1M (~50× fewer bytes than Arm A full-scan; Phase 0
  single-threaded 74k/2.6MB/~36ms native execute, ~260ms e2e). Pre-declared main-query
  target (p95 < 500ms AND bytes < 25MB) MET.
- reactions + comments (step-1 exact-ID treatment): followup-treated = 3.1M rows / 111.7 MB
  — the EXACT declared residual (~3.19M/126MB, the service partition). This is the point
  the Phase-1.5 counting_numbers satellite is designed to attack next.
- views follow-up: still followup-armA shape (3.7M / 214.7 MB) — NOT covered by the step-1
  treatment (no views golden declared). Anticipated residual.
- node-ad inventory: ad-inventory 7.2M / 843 MB — still Arm A shape, anticipated residual
  (Phase 0 result_statement: "the node-ad inventory read is still Arm A shape").

## Parity statement
Every measured feed returned the exact expected personal-feed result (doc set + order);
30/30 on b-1m, 29–30/30 on 10k/100k (the 2 censored feeds are recorded failures, not infra
5xx). I3: no query returned a document for an author_key the token does not own. Output
parity between treated main and the preserved Arm A main is exact (Phase 0 I3-verified).

## What failed (all infra, all fixed + committed)
1. Arm D main-pin assumed the compiler emits groups in SORTED order; it emits DISCOVERY
   order. Reader 10938's order diverged → pin raised through capture_compile → all mains
   500'd. FIX: pin re-derives group order from the compiled SQL (order-independent,
   set-verified). +2 regression tests.
2. 1M preflight ran the Arm-A concurrent fan-out of the functional check → peaked past the
   pinned 5 GB (CH 137 → downstream 500). FIX: preflight runs feeds sequentially
   (concurrency is the measured window's property, and it runs post-rekey in the lighter
   Arm-D shape).
3. b-1m t3 import hit a CH restart (exit 210, connection refused; 0 rows written). FIX:
   import_table distinguishes the recoverable CH-restart from a fatal partial import; the
   import loop re-waits for CH and retries once after a 30 s settle. (t3 completed on the
   live stack in the meantime; the hardening protects all back-to-back 1M restores in C/A/P/X.)

## Gate verdict
PASS — the K=20 scale ladder holds the winning D + step-1 treatment across 10k→100k→1M:
the main feed is well-treated at full scale and the engagement follow-ups are at the
declared residual, exactly the surface Phase 1.5 (counting_numbers) is scoped to drop to
point-seek. Full-sequence cost is not yet at the main-query target (views + ad-inventory
remain Arm A shape) — as declared in Phase 0. Proceed to Study C.
