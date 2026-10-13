# The Scanner — Engine 1, the L1 component pass

[← back to AI Security Theory](../README.md)

The Scanner is the Norton pass: mechanical, signature-based, file-by-file. It
catches the "basic basics" — the stuff that is actually most of the hole in a
never-hardened codebase — and it is the engine that makes security parallelizable
and ledgered.

## What it does

It walks the security-critical surface and checks each unit against a fixed
checklist — the invariants plus the signature patterns. See
[the-checklist.md](./the-checklist.md) for the actual list. It does **not** make
architectural judgments (that is [the Architect](../the-architect/README.md)); it
matches known-bad patterns against known-good invariants.

## The three properties that make it work

**1. Read-only.** The scan touches **no code.** Its only output is a PR against
the ledger (the scan file) plus appended backlog tasks. A scanner cannot break
anything, so it is safe to run many at once. This is the single reason the whole
model is parallel-safe — see [running-it/](../running-it/README.md).

**2. Ledgered.** Every unit it looks at gets a row in the ledger: what was
scanned, at what level, by which model, on what date, against which commit, in
which subsystem, and the status. **No scan that isn't in the ledger happened.**
The ledger is the altitude — see [the-ledger/](../the-ledger/README.md).

**3. Parallel + incremental.** You do **not** scan "all the files in one go" —
that is how a genius model looks at 4,000 lines and says "totally secure" (the
sycophancy trap). Instead you slice the surface into scopes — a directory, a
few files — and run a workspace per scope. Eight workspaces across one directory
is less risky than one workspace over the whole tree, because each one is narrow
enough to actually read line by line. The scan is also **incremental**: a scope
already in the ledger only gets re-scanned when it is relatively stale (see
[staleness-and-cadence.md](../the-ledger/staleness-and-cadence.md)).

## Granularity is freestyle

The scanner records at **whatever level gives the right context** — a line, a
function, a file. Its call. If a bad line only makes sense with the whole function
around it, it records the function. If a whole file is the unit, it records the
file. The rule is not "always a function" — it is *record at the level that lets
a future reader (human or AI) reproduce the judgment without re-deriving it.*

The scanner may also **look outside the unit and get curious** — a finding in one
function often lives in the helper it calls. But L1 stays *focused*: it is the
signature pass. The cross-file, "this design is the problem" findings are L2 and
go to [the Architect](../the-architect/README.md), not the scan.

## The scan PR

A scan produces exactly one kind of PR:

- **Touches:** the ledger file (new/updated rows) + the big-picture backlog file
  (new L2 items, if any). **Nothing else.**
- **Never touches:** application code.
- **Merge risk:** zero — it is docs/ledger only, so it can land in parallel with
  anything.

Each **finding** the scan produces becomes a separate entry that a later, tiny
**fix PR** resolves (≤500 lines, target ~100, one finding, a pinning test). The
scan logs the debt; the fix pays it down. See [running-it/](../running-it/README.md)
for the full scan→fix flow.

## L1 before L2, always

The Scanner (L1) runs across **every** file in the scope before any Architect
(L2) work starts. L1 is the bounded, parallel, ledgered floor. L2 is the open,
judgment-heavy ceiling you only reach once the floor is poured. Skipping ahead to
L2 is how you get back to the giant-PR trap — see [the-failure/](../the-failure/README.md).
