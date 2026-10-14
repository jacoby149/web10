# The Security Gauntlet — the enforcement layer

[← back to AI Security Theory](../README.md)

The theory is a *method* until something *enforces* it. This is the piece that
turns "the doc says do this" into "the wrong way doesn't merge." It is the same
pattern as the e2e gauntlets — a suite CI runs on every PR — applied to security.
And it is *cheap*, because the tests already exist as a side effect of the
exploit-first workflow: **the pinning tests *are* the gauntlet.**

## The two layers

### 1. The gauntlet (regression — the whole suite, every PR)

Every exploit-first fix commits a red→green test (the repro gate). Those tests
accumulate into a **security gauntlet** — the suite of working exploits, now
permanently green. CI runs the *whole* gauntlet on **every** PR, not just security
PRs:

- A PR that **re-opens a vuln** (breaks an exploit that was green) **fails CI.**
  This is the pinning-test-as-gauntlet: the floor only rises, and a PR can't push
  it back down.
- It runs on *every* PR because a non-security PR can break a security invariant
  (a refactor that removes the origin check, a dependency bump that re-exposes a
  deserialization path). The gauntlet is the backstop that catches security
  regressions *anywhere*, not just in PRs labeled "security."

This is the **regression** layer: it guarantees the floor doesn't drop. It is the
security analog of the e2e gauntlet, and it reuses the same CI machinery.

### 2. The per-PR gate (the delta — new trust-boundary changes)

The gauntlet catches *regressions*. The **gate** catches *new* non-conformity. On
any PR that touches a **trust boundary** (auth, tokens, the I3 read gate,
federation, the SDK's credential surface, the query engine), a CI check (a script —
`scripts/security-gate`) fails the PR unless:

- **It is ≤500 lines** (target ~100). A 90-file security PR is an automatic
  rejection — the 1157/1159 failure mode, made un-mergeable.
- **It has a red→green repro test** — a test that was red against the vulnerable
  code and green after the fix (the repro gate, *evidenced in the PR*, not just
  claimed). For L3/L4 findings where a deterministic exploit isn't feasible, the
  gate accepts a **scrutinized explanation** instead (see
  [the-ledger/](../the-ledger/README.md)) — but it requires the explanation to be
  present and to have passed the convergence review.
- **It updated the ledger** — a new/changed row for the unit it touched. A
  trust-boundary PR that doesn't touch the ledger is a claim with no record —
  reject it.
- **(Trust boundaries) it shows the convergence review ran** — the three-dry
  evidence is in the PR (or linked), not just asserted.

The gate is the **delta** layer: it guarantees a *new* security change conforms to
the method before it lands. Together, the gauntlet (floor doesn't drop) + the gate
(new changes conform) = **the wrong way doesn't merge.**

## Why this closes the 1157/1159 gap

1157/1159 happened because the discipline was *described*, not *enforced* — a
90-file security PR with no repro gate and no ledger would still merge if the
agent (or a human in a hurry) didn't read the doc. The gauntlet + gate make the
discipline *automatic*:

| The method says | The enforcement that makes it true |
|---|---|
| No 90-file security PRs | The gate **fails** a trust-boundary PR over 500 lines |
| Every fix passes the repro gate | The gate **requires** a red→green test (or a scrutinized L3/L4 explanation) in the PR |
| Every scan is ledgered | The gate **requires** a ledger row for the touched unit |
| Trust-boundary units need the convergence review | The gate **requires** the three-dry evidence |
| The floor only rises | The gauntlet **fails** any PR that breaks an exploit |

The method tells you *how*; the gauntlet + gate make the *wrong way un-mergeable*.
That is the difference between a strong specification and a strong system.

## What the gate is NOT

- **Not a substitute for the method.** The gate checks *conformity* (line count,
  test present, ledger updated), not *correctness* (is the fix actually right?).
  Correctness is the repro gate + the convergence review's job. The gate is the
  bouncer; the method is the security.
- **Not a true oracle.** The gate enforces the *process*; it doesn't prove the
  code is secure. That's still the (bounded, evidenced) claim the method makes.
  The gate just makes sure the claim was *made properly*.
