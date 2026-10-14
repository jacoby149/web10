# Staleness & Cadence — keeping the ledger honest over time

[← back to The Ledger](./README.md)

A ledger that is written once and never questioned rots into "we scanned this in
October, trust me." This doc is the mechanism that keeps coverage a *live*
guarantee instead of a historical stamp. Two parts: the **relative-staleness rule**
and the **re-scan cadence**, plus the **ratchet** that makes coverage only go up.

## Relative staleness (not commit-strict)

The instinct is to make a row stale on *every* commit to the unit. That is the
wrong clock. It is pedantic and it drowns the signal: one commit since a scan is
not meaningfully less secure, but chasing it means re-scanning constantly for
nothing.

Staleness is **relative**, judged on the question: *is this check still
representative of the code it claims to cover?*

- **One commit since the scan → not stale.** The check is still honest.
- **~3 months since the last scan → stale.** Re-scan. Time is a proxy for drift:
  new code, refactors, and the things the last model missed all accumulate.
- **A security-relevant change to the unit → stale now, regardless of time.** If a
  commit touches the auth path, the query boundary, or a trust boundary, the row
  re-queues immediately. Time does not matter; the change does.

So a row's `last-pass=` (commit for L1/L2, decision/milestone for L3) is the
anchor, and staleness is a *judgment against that anchor*, not a boolean on commit
count. The ledger shows the date and the anchor; the reader (or a CI check) decides
"relatively stale?" from those two.

### The levels age differently

- **L1 file-scan + L2 immediate-neighborhood-scan** age on **time +
  security-relevant commits** to the unit. Cheap to re-run, so the bar is tight.
- **L3 project-wide-scan** ages on **architectural change** — a decision lands, a
  boundary moves, the threat model shifts — *not* on a single file's commit.
  Re-running frontier judgment on every commit is waste. Tie L3 freshness to the
  decision/milestone in `last-pass=`, and re-check when that thing changes.

## The re-scan cadence (the clock)

Independent of commits, **the whole surface is re-scanned on a 3–6 month
schedule.** This is the part that makes "we get more and more secure over time"
true rather than aspirational:

- It catches **drift** — code that changed in a way no single commit flagged as
  security-relevant.
- It catches **model improvement** — a re-scan with a stronger model (or an
  updated checklist) finds what the last one missed.
- It is the **graph** — each cycle, the ledger shows the surface more covered than
  the last. The cadence is what turns the ledger from a snapshot into a trend line.

The cadence is a scheduled task (a CI job, a calendar lane, a `web10web10!`
ritual item). It produces scan PRs like any other scan — read-only, ledger-only,
parallel.

## The ratchet: coverage only goes up

Two mechanisms make coverage monotonic:

**1. Pinning tests.** Every fix PR lands a test that **fails if the vulnerability
regresses** — the security analog of the anti-test in
[`ai-use-theory/testing.md`](../../ai-use-theory/testing.md). The test is the
*floor*: it does not measure coverage, it guarantees a fixed finding stays fixed.
So the suite only grows stricter; it never moves backward.

**2. The cadence re-scan.** The schedule re-covers the surface, so new code and
drift get picked up. Combined with the pinning tests, the net effect is:

```
 scan debt  ┤██████████┐
            │          └──┐   L1/L2 findings fixed, one tiny PR each
            │             └──┐
            │                └──────┐   L3 items, one at a time
            │                      └──────────►  ~0 debt
            │   (re-scan every 3–6 mo keeps it there)
            └──────────────────────────────────────────── time
```

Coverage ratchets: each fix is pinned (can't regress), each re-scan adds coverage
(can't silently lose it). **You get more and more secure over time, and the ledger
is the graph of it.**

## The anti-sycophancy check

A row that says PASS but the scan did not actually read the lines is a corrupted
measure. Two guards:

- **Parallel, narrow scopes** — a fresh workspace scanning a few files is less
  likely to rubber-stamp than one workspace "scanning everything." See
  [running-it/](../running-it/README.md).
- **The ledger is the check, not the claim.** A PASS must be *backed* — the scan
  record (in `scans/`) shows the unit, the model, the date, and the findings it
  considered. A PASS with no scan record behind it is not a PASS; it is a row
  someone typed. When in doubt, re-scan the unit and diff the result.
