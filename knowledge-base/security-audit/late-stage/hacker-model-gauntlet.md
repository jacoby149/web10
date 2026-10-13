# Late-Stage Security Auditing — the Hacker-Model Gauntlet

**The plan:** spend ~$1–3k on frontier "hacker" models to harden web10 —
*if* it's spent right. This doc is the structure that makes the spend land
instead of evaporate.

## The trap (why naive "dump $3k at a hacker model" fails)

A frontier model with **no signal** is an expensive hallucination factory.
Point it at a codebase with no spec and no test harness, and it produces ~40
"critical vulnerabilities" — maybe 3 real, 37 plausible-sounding
confabulations. You then burn *more* money than the run cost verifying which
is which. That's the AI-use-theory doom loop, with a bigger model and a bigger
credit card.

**Why web10 is set up to make this work:** the pyramid is already built.
- **Target** — invariants I1–I6 (`knowledge-base/web10-v3/security/overview.md`).
- **Altitude** — the conformance/permission suite (`api/tests/test_v3_*.py`)
  mechanically enforces them.
- **Gradient** — every finding in `../` (this audit) is `file:line` +
  reproducible.

A hacker model running *on top of that* has a gradient to descend. Same $2k,
completely different output. **The KB is the multiplier on the token spend.**

## The three surfaces (in order)

### 1. Query-engine gauntlet — `safe_query.py` (the meat, $500–1,500)

The one surface that's novel, hard to verify by reading, and *falsifiable*.
The code's own honest caveat (`safe_query.py:42-47`): the whole I3 wall rests
on sqlglot parsing ClickHouse SQL faithfully. A query sqlglot *mis-parses* in
a way that hides a table reference is the failure mode.

**The task a hacker model is genuinely good at:** generate 500–1,000
adversarial queries aimed at breaking the boundary —
- raw-table escapes (`documents`, `group_members`, `app_contracts`, …)
- table-function escapes (`file()`, `s3()`, `numbers()`, `url()`)
- CTE tricks (a caller CTE that shadows a boundary CTE name)
- set-operation / subquery hiding (a raw table *inside* a `UNION` operand)
- comment / identifier / Unicode / backtick mis-parse tricks
- a `group_meta` opt-in abuse
- round-trip re-parse evasion (`build_safe_query`'s backstop, `:528-533`)

**The gate:** each candidate is run through `build_safe_query` + a **live
ClickHouse** and we report which tables it actually touched. A "finding" is
only real if it (a) references a raw table, (b) is not rejected, and (c)
returns data. No repro = discarded, not reported.

**The asset that lasts:** the 500–1,000-query adversarial suite becomes a
**permanent gauntlet in `api/tests/`**. The tokens are gone; the suite runs in
CI forever. The node gets more on-lock every month for free.

### 2. I3 permission-matrix fuzzing ($300–800)

Generate adversarial **token × group × membership × block/sharing/tombstone**
combinations and assert I3 on each. The conformance suite pins the happy
paths; a model hunts the *edges*:
- `anyone` / `authenticated` / literal-member class confusion (D58)
- a blocked user's doc leaking through a *second* group the reader is in
- tombstone races (the dedup-then-filter invariant, `clickhouse.md`)
- the `authenticated` flag being upgradable on an anon read
- a `ref_value` that points at a private doc (a collection is pointers, not a
  grant — `decisions.md:29`)

Same gate: reproducible in a test, mapped to I3, or discarded.

### 3. Blind re-audit + I1 threat model ($200–500)

- **Blind re-audit:** a strong model with **zero context of our audit**
  independently reads the backend. We diff the two finding lists. The diff =
  our blind spots. (This catches what *we* missed, not just what the model
  finds.)
- **I1 threat model (reasoning task, big models do well):** the HS256 single-
  key gap (B-1) — operator malice, key leak, cross-node forgery. A structured
  threat model of "what can an attacker do with the key, and what's the blast
  radius per scenario." Feeds the D7 fix prioritization.

## What we would NOT pay for

- **A model "pen-testing the live node."** The interesting attacks (I1 key
  forgery) are already known and documented. Re-discovering them is not a use
  of $3k.
- **A model eyeballing the frontend for XSS.** Better: generate malicious
  *markdown* payloads against the locked `rehype-sanitize` schema (D85,
  `decisions.md:96`) and assert they stay inert. Cheaper, deterministic, and it
  tests the actual choke point. (This is the frontend pass — see `../`.)

## The non-negotiable gate

Every finding must be:
1. **Mapped to an invariant** (I1–I6) — "this breaks X."
2. **Reproducible in a test** — a failing test, not a description.
3. **Severity-rated** — against the scale in `../README.md`.

No repro = discarded, not reported. This is the difference between an audit
and a scare list. A model that can't produce a repro for its "critical"
finding is confabulating.

## The deliverable

Not a PDF. Three things land in the repo:
1. `../` (this audit) updated with any confirmed findings.
2. **A permanent gauntlet in `api/tests/`** — the adversarial query suite +
   the I3 fuzz cases, running in CI.
3. A short "what the model found that we didn't" diff note (the blind-spot
   value of surface 3).

## Budget

| Surface | Budget |
|---|---|
| 1. Query-engine gauntlet | $500–1,500 |
| 2. I3 permission-matrix fuzzing | $300–800 |
| 3. Blind re-audit + I1 threat model | $200–500 |
| **Total** | **~$1,000–2,800** |

## The one thing to build first (before any model spend)

The **gauntlet harness**: a script that takes a SQL string, runs it through
`build_safe_query` + a live ClickHouse, and reports which tables it touched.
~An hour of our time. It's what turns model output into *signal* — without it,
the model's "this query escapes" claims are unverifiable and the whole spend
is back in the hallucination trap. Build the harness, *then* point the model at
it.
