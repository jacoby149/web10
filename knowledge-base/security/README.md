# Written Security (WS) — web10's security section

This folder is web10's **written security**: everything written on security. It is
three things at once — not just a strategy:

- **The strategy** — the invariants (I1–I6), the threat model, the method (how we
  harden). *What we are trying to guarantee and how.*
- **The record** — what was scanned, by which agent/model, when, against what
  commit; what was fixed; what was tried and failed. *What we actually did.*
- **The knowledge** — the gaps, the considered-and-declined list, the learnings that
  accumulate over time. *What we know.*

> **Having written security in the knowledge base is what makes a project more
> secure.** A project with a security *strategy* says "here is what we intend." A
> project with **written security** says "here is the security we actually did,
> checked, and know — here is the record, here is what we tried, here is what we've
> learned." The difference is the difference between intent and evidence.

The *method* for how all of this works lives in the portable cartridge
[`ai-pack/ai-security-theory/`](../../ai-pack/ai-security-theory/README.md) — this
folder is where that method's output lands for this repo.

> **The two roots of trust:** the **security record** records *coverage* (what was
> scanned, when, by what model) — a surface is only as secure as its last scan. The
> **learnings** record *knowledge* (the invariants as they've evolved, every
> finding→fix, the gaps, the "considered and declined" list) — it is what the
> [orient phase](../../ai-pack/ai-security-theory/the-orient/README.md) reads before
> every scan, and what every fix writes back to.

## Campaign Order

**API + SDK (including RTC) through L1 -> L2 -> L3 -> L4 first; then everything
else through L1 -> L2 -> L3 -> L4.** Follow [strategy.md](strategy.md) for exact
scope, advancement gates and the distinction between source coverage, repaired
findings, protocol-scoped assurance and whole-project completion. The next work
is protocol L1 disposition/repairs, not the authenticator UI's broad L1 scan.

## The layout

| Path | What it is |
|---|---|
| [`../ai_wins/security-wins.md`](../ai_wins/security-wins.md) | **The repaired behaviors.** Actual security improvements from the October L1-L4 campaign, with findings, PRs, regression evidence and remaining gates; separate from general AI Use Theory wins. |
| [`strategy.md`](./strategy.md) | **The execution order.** Protocol/API+SDK first through all four levels, then the remaining surfaces through all four; gates and honest scope limits. |
| [`learnings.md`](./learnings.md) | **The knowledge.** The security memory the orient reads first: the invariants as they've evolved, every finding→fix as a dated learning, the known gaps, and the considered-and-declined list. Every fix writes back here. |
| [`security-record.md`](./security-record.md) | **The coverage.** One row per (unit, level): what was scanned, by which model, when, against which commit, and the status (PASS / OPEN / STALE). |
| [`big-picture-backlog.md`](./big-picture-backlog.md) | **The L3/L4 debt.** The cross-file / architectural (service + project-wide) findings (`BP-n`), done one at a time after L1 + L2 are 100%. |
| [`scans/`](./scans/) | **The scan records.** Each scan is a folder (e.g. [`scans/2026-10/`](./scans/2026-10/README.md), the October invariant-driven audit). A scan record is the evidence behind a security record row — the `file:line` findings, the model, the date. |

## How to read it

0. **`learnings.md`** — *first.* This is the orient: what's been considered, what
   receded, what the obvious gap is. Read it before you look at the security record.
1. **`security-record.md`** — the current coverage. Any unit with no row, or a STALE
   row, is scan debt.
2. **`big-picture-backlog.md`** — the architectural debt that is *counted*, not
   hidden. Ordered by dependency then severity.
3. **`scans/`** — the evidence. When a security record row says PASS, the matching scan
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
security record below reflects the *audited* state, and the affected rows are OPEN, not
PASS. Do not run a production node holding real users' sensitive data until the
backlog's critical items are closed and an external review has been done.
