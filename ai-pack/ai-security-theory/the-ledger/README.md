# The Ledger — the altitude

[← back to AI Security Theory](../README.md)

The ledger is the coverage record — the thing you point at to prove forward
progress. It is the security analog of the test suite's role in the use-theory,
but for *coverage* instead of *regression*: the suite is the floor (what must
never break), the ledger is the altitude (what has been checked, and when).

> A green suite with an empty ledger is a **corrupted measure wearing a security
> mask** — it looks done, but nothing was actually scanned.

## The format

One row per **(unit, level)**. Flat, so each row is a unit of work and the whole
thing is queryable.

```
clickhouse.py :: read_documents_in_groups()
  L1 file-scan      PASS   model=qwen3.6-27b   13.10.2026  last-pass=8ce363e   sys=query-engine
  L2 call-graph     PASS   model=qwen3.6-27b   13.10.2026  last-pass=8ce363e   sys=query-engine
  L3 service        PASS   model=qwen3.6-27b   12.10.2026  last-pass=8ce363e   sys=query-engine
  L4 project-wide   PASS   model=sol6.1        11.10.2026  last-pass=D7-fed    sys=query-engine
```

| Field | Meaning |
|---|---|
| `file :: unit` | What was scanned. The unit is freestyle — a function, a line-range, or the whole file (see below). |
| `L1 file-scan` / `L2 call-graph-scan` / `L3 service-scan` / `L4 project-wide-scan` | Which zoom of the [scope ladder](../the-scope-ladder/README.md). L1 = the file; L2 = the file + its direct call graph (one hop); L3 = the whole service; L4 = the whole project. |
| `PASS` / `OPEN` / `STALE` | Status (below). |
| `model=` | Which model did the check. Transparency for going back — *which* model looked at this. Not a hard gate; the audit trail. |
| date | When the check ran. |
| `last-pass=` | The commit (L1/L2/L3) or decision/milestone (L4) the check was valid against. The staleness anchor. |
| `sys=` | The subsystem the unit belongs to (`query-engine`, `auth`, `media`, …). Groups siblings for repair-scope. |

## Granularity is freestyle

The scanner records at **whatever level gives the right context** — a line, a
function, a file. Its call. The rule is not a fixed unit; it is *record at the
level that lets a future reader reproduce the judgment without re-deriving it.* A
bad line that needs its whole function to explain gets a function row. A file that
is its own unit gets a file row. Do not force a function where a file is the honest
unit, or a line where the function is what matters.

## Status: PASS, OPEN, STALE

- **PASS** — *no open security backlog for this unit at this level.* Everything the
  scan found is either **fixed** (a fix PR landed + a pinning test) or **explicitly
  deferred** to the big-picture backlog by reference.
- **OPEN** — the unit was scanned and has at least one finding not yet fixed or
  deferred. This is live scan debt.
- **STALE** — the unit's last check is relatively old (see
  [staleness-and-cadence.md](./staleness-and-cadence.md)). A STALE row is scan debt
  again, even if it was once PASS.

### The deferral reference

PASS is not "the scanner found nothing." It is "everything found is accounted for."
So a row can read:

```
hls.py :: resolve_segment()
  L1 file-scan  PASS (1 finding → BP-9)   model=qwen3.6-27b  13.10.2026  last-pass=8ce363e  sys=media
```

The finding is real but deferred to `BP-9` in the big-picture backlog (an L3 /
architectural item). The row is PASS *at L1* (the scan is complete and the debt is
tracked) while the backlog item carries the actual work. This keeps the L1 ledger
binary and clean — **L1 PASS means the scan is done and nothing is hiding** —
without pretending an architectural risk does not exist.

### The repro gate (how a finding actually closes)

A finding goes OPEN → PASS(fixed) only when the **repro gate** is met. This is the
piece that stops a "fixed" from being a false green — the security version of the
use-theory's *corrupted measure*.

> **The security unit test is an exploit. The workflow is exploit-first.**

Not "find vuln → fix → add a test." It is **build the exploit → it works (red = the
vuln is real) → fix → the same exploit is denied (green = the hole is closed).** The
exploit is not a verification afterthought — it is the **primary artifact**, and it
has a dual life: it is the **proof** the finding is real (before the fix, it kills
the false positive) and the **pinning test** that guards against regression (after
the fix). One artifact, three jobs: **proof, repro-gate, ratchet.**

This is the same idea as the use-theory's **anti-test** ("the KB with teeth — it
*fails* when the invariant breaks," `ai-use-theory/testing.md`) and the
**hacker-model gauntlet** in `scans/late-stage/` (fuzzing = generating exploits, the
"non-negotiable repro gate"). The repro gate is that idea made a close-condition.

- **A finding is not real until you can demonstrate it.** A scanner that says "this
  looks vulnerable" without a working exploit is *guessing* — and that is the
  sycophancy the whole theory exists to kill. The exploit is the re-checkable claim,
  made executable (the October audit's "verified against the actual code, not
  inferred," as a test).
- **The pinning test is the exploit, not the assertion.** Not "the endpoint now
  returns 403" (that asserts the *symptom* changed). It is "send the request the
  attacker sent, assert the exploit's *effect* no longer happens." For the
  token→log case: send a request carrying a token, assert the token string does
  **not** appear in the log store. For the origin-check case: `postMessage` from a
  wrong origin, assert it is **rejected**. For the I3 case: query as user A for
  user B's doc, assert **404/403**, and assert the doc body is not in the response.
- **It holds across the whole ladder, even the "basic basics."** The exploit for
  "secret in source" is *read the file, here's the key*; for "missing origin check"
  it's *postMessage from a wrong origin, here's the token I stole*; for the
  availability gap it's *the unbounded query that scans the table*. Every finding
  has an exploit form, even when the exploit is simple.
- **Red first, green second.** The exploit is run *against the vulnerable code*
  first (it works = the vuln is real), then the fix lands and the same exploit is
  denied (the hole is closed). A pinning test that was green from the moment it was
  written proved nothing.
- **Where the exploit lives.** The **scan** (read-only) *identifies* the vuln and
  records a **PoC** (the demonstration) with the finding. The **fix PR** commits the
  exploit as the permanent pinning test and shows red→green. The scan stays
  code-free; the exploit test ships with the fix.
- **Trust-boundary units get a second pair of eyes.** A PASS on a unit that sits on
  a trust boundary (auth, the I3 read gate, tokens, federation) should be confirmed
  by a **re-scan or a second model**, not just the model that wrote the fix. The
  repro gate is the floor; the second-eyes confirm is the ceiling for the crown
  jewels.

A finding closed without the repro gate is a corrupted measure wearing a PASS mask —
it looks done, but nobody proved the hole is actually closed.

## What the ledger is NOT

- **Not a hand-maintained doc.** The scanner *writes* it. Each scan run updates
  only the rows it touched. Nobody edits it by hand except to correct a wrong
  status. It is a build artifact of the scan process.
- **Not a gate on model tier.** A one-dev project is not going to refuse a PASS
  because a workhorse did it instead of a frontier model. The `model=` field is the
  audit trail, not a quality gate. (The late-stage strategy *does* spend frontier
  models on L3 — that is a budget decision, recorded here, not a pass/fail rule.)
- **Not commit-strict.** It is relative — see the next doc.

When every in-scope unit has a row at every level, all findings are fixed or
deferred, and every fix is pinned, the surface has **passed the AI pentest** — see
[the-pentest-gate/](../the-pentest-gate/README.md).

## Where it lives

The method (this folder) is portable. The **actual ledger** is per-repo state, in
the knowledge base — e.g. `knowledge-base/security/scan-ledger.md`, with the scan
records alongside (e.g. `knowledge-base/security/scans/2026-10/`). The method tells
you the format; the KB holds the rows.
