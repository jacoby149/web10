# Pinned numbers (reproducible — print only these)

- **The labor:** `git log --numstat --format="" | awk 'NF>=3 {i+=$1;
  d+=$2} END {print i, d}'` → **958,824 added / 568,594 deleted** (all
  text files, all commits since 2021-11-14, merge commits excluded — the
  standard `git log` behavior). Counted 04.11.2026; re-run and re-pin at
  submission. The operator's ~1.1M/~700K is not reproducible at that
  range (since-2025-01-01: 676,325/494,782 · code-extensions only:
  457,655/257,104 · merge diffs included: 1,611,136/837,686). The range
  decision is open (`rebuild.md`).
- **The frontend:** 46,285 physical source lines across 141 files,
  pinned to artifact revision `317fa349`.
- **K1000 fan-out:** median **handler** 7,644.655 ms unbatched →
  363.305 ms batched (7.64 s → 363 ms). Median **readable resolution**
  7,535.705 ms → 213.980 ms (7.54 s → 214 ms), at 1,000 candidate
  groups. Do not mix phases. Source: `research/experiments/costfn/K1000-RESULTS.md`.
  The one-group counterweight is 9.525 ms per-group vs 25.370 ms batched
  readable time. Retained per-cell receipts are summaries, not a complete
  raw-sample archive.
- **Evidence inventory.** Verified: conformance/permission matrix
  (attacks replayed and denied), connected interop (browser consent),
  two-node IAM (clean merged-dev, H-REPLAY receipt), domain prototype
  (public continuity after provider dark), K100/K1000 fan-out,
  operating point, production snapshot 28.10.2026 (597 accounts, 593
  documents, 49 groups, 1,298 memberships). OPEN: E1–E5 production
  counters / latency / cost model / case study / conformance numbers at
  scale, the related-work gap check, the matched RLS baseline.
