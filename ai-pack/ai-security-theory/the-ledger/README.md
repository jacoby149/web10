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
  L1 component    PASS   model=qwen3.6-27b   13.10.2026  last-pass=8ce363e   sys=query-engine
  L2 big-picture  PASS   model=sol6.1        11.10.2026  last-pass=D7-fed    sys=query-engine
```

| Field | Meaning |
|---|---|
| `file :: unit` | What was scanned. The unit is freestyle — a function, a line-range, or the whole file (see below). |
| `L1 component` / `L2 big-picture` | Which engine / level. L1 = the signature scan; L2 = the architectural check. |
| `PASS` / `OPEN` / `STALE` | Status (below). |
| `model=` | Which model did the check. Transparency for going back — *which* model looked at this. Not a hard gate; the audit trail. |
| date | When the check ran. |
| `last-pass=` | The commit (L1) or decision/milestone (L2) the check was valid against. The staleness anchor. |
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
  L1 component  PASS (1 finding → BP-9)   model=qwen3.6-27b  13.10.2026  last-pass=8ce363e  sys=media
```

The finding is real but deferred to `BP-9` in the big-picture backlog. The row is
PASS *at L1* (the scan is complete and the debt is tracked) while the L2 item
carries the actual work. This keeps the L1 ledger binary and clean — **L1 PASS
means the scan is done and nothing is hiding** — without pretending an architectural
risk does not exist.

## What the ledger is NOT

- **Not a hand-maintained doc.** The scanner *writes* it. Each scan run updates
  only the rows it touched. Nobody edits it by hand except to correct a wrong
  status. It is a build artifact of the scan process.
- **Not a gate on model tier.** A one-dev project is not going to refuse a PASS
  because a workhorse did it instead of a frontier model. The `model=` field is the
  audit trail, not a quality gate. (The late-stage strategy *does* spend frontier
  models on L2 — that is a budget decision, recorded here, not a pass/fail rule.)
- **Not commit-strict.** It is relative — see the next doc.

## Where it lives

The method (this folder) is portable. The **actual ledger** is per-repo state, in
the knowledge base — e.g. `knowledge-base/security/scan-ledger.md`, with the scan
records alongside (e.g. `knowledge-base/security/scans/2026-10/`). The method tells
you the format; the KB holds the rows.
