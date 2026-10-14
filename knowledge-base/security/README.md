# web10 Security — the state

This is web10's **security state**: what has been scanned, what was found, what
is owed. The *method* for how all of this works lives in the portable cartridge
[`ai-pack/ai-security-theory/`](../../ai-pack/ai-security-theory/README.md) — this
folder is where that method's output lands for this repo.

> **The two roots of trust:** the **ledger** records *coverage* (what was scanned,
> when, by what model) — a surface is only as secure as its last scan. The
> **learnings** record *knowledge* (the invariants as they've evolved, every
> finding→fix, the gaps, the "considered and declined" list) — it is what the
> [orient phase](../../ai-pack/ai-security-theory/the-orient/README.md) reads before
> every scan, and what every fix writes back to.

## The layout

| Path | What it is |
|---|---|
| [`learnings.md`](./learnings.md) | **The knowledge.** The security memory the orient reads first: the invariants as they've evolved, every finding→fix as a dated learning, the known gaps, and the considered-and-declined list. Every fix writes back here. |
| [`scan-ledger.md`](./scan-ledger.md) | **The coverage.** One row per (unit, level): what was scanned, by which model, when, against which commit, and the status (PASS / OPEN / STALE). |
| [`big-picture-backlog.md`](./big-picture-backlog.md) | **The L3/L4 debt.** The cross-file / architectural (service + project-wide) findings (`BP-n`), done one at a time after L1 + L2 are 100%. |
| [`scans/`](./scans/) | **The scan records.** Each scan is a folder (e.g. [`scans/2026-10/`](./scans/2026-10/README.md), the October invariant-driven audit). A scan record is the evidence behind a ledger row — the `file:line` findings, the model, the date. |

## How to read it

0. **`learnings.md`** — *first.* This is the orient: what's been considered, what
   receded, what the obvious gap is. Read it before you look at the ledger.
1. **`scan-ledger.md`** — the current coverage. Any unit with no row, or a STALE
   row, is scan debt.
2. **`big-picture-backlog.md`** — the architectural debt that is *counted*, not
   hidden. Ordered by dependency then severity.
3. **`scans/`** — the evidence. When a ledger row says PASS, the matching scan
   record shows what was actually checked.

## The invariants (the target)

The security model is defined as invariants **I1–I6** in
[`web10-v3/security/overview.md`](../web10-v3/security/overview.md). The scan
checklist (in the cartridge) is those invariants plus the "basic basics"
signatures. A finding is "the code does not do what the invariant says."

## Status (honest)

web10 is **pre-production and not yet independently audited.** The October 2026
audit (`scans/2026-10/`) is the first L1-style pass and it found real gaps (I1
federation signing, a `postMessage` origin hole, secrets-in-source). The hardening
for those (PRs 1157 + 1159) is **in flight, not merged** — so until they land, the
ledger below reflects the *audited* state, and the affected rows are OPEN, not
PASS. Do not run a production node holding real users' sensitive data until the
backlog's critical items are closed and an external review has been done.
