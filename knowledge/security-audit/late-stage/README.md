# Late-Stage Security Auditing

The phase after the manual line-by-line audit (`../`): using frontier "hacker"
models to harden the node, structured so the spend converts into permanent CI
signal instead of a one-off report.

- `hacker-model-gauntlet.md` — the plan: the trap, the three surfaces (query-
  engine gauntlet, I3 permission-matrix fuzzing, blind re-audit + I1 threat
  model), the non-negotiable repro gate, the budget (~$1–3k), and the harness
  to build first.

**Sequencing:** the manual audit (`../`) is the foundation — it gives the model
the target (invariants), the altitude (conformance suite), and the gradient
(`file:line` findings). The late-stage model spend runs *on top of* it. Don't
invert the order: a model with no manual-audit foundation is the expensive
hallucination trap.
