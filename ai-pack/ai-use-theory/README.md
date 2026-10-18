# Knowledge Base — AI Use Theory

The knowledge base is the root of trust. Everything else in the pyramid — logs, tests, changelog — checks against it. If it's wrong, the AI converges to the wrong place faster. This folder is the methodology for keeping it correct, using it well, and building codebases where AI tasks (features, fixes, refactors) converge on the first pass instead of burning tokens in speculative loops.

## The Docs

| Doc | What it is |
|---|---|
| [Importance of the Knowledge Base](./importance-of-knowledge-base.md) | Why the knowledge base is the lynchpin — entry point of every task flow, the funnel where all signal flows through |
| [Human-Assisted Knowledge Base Repair](./human-assisted-kb-repair.md) | The concrete flow for keeping the knowledge base correct — AI audits, human judges, iterate to convergence |
| [AI Use Theory](./ai-use-theory.md) | The full theory — three LLM traits, the four-step pyramid, the four-phase task flow, convergence, and the one assumption |
| [Refutations](./refutations.md) | Stress test — R1 through R12, each objection answered and resolved. When a refutation wins, the theory changes |
| [Integration](./integration.md) | How the theory is wired into the agent flow — Option 1 (pointer + on-demand) is the selected integration |
| [AI Readiness](./ai-readiness.md) | Where this codebase stands against the pyramid — ~60%, with logs as the biggest gap |
| [Logging — The Signal Router](./logging.md) | How all signal flows into one queryable store — the compare phase reduced to a single SQL query, plus the cross-realm gotchas (why you can't serialize a cross-origin Window) |
| [Testing — Anti-Tests and the Seam Rule](./testing.md) | Anti-tests as the KB with teeth, the two pyramids, the seam rule + the fork rule (one goal, many paths) + the state rule (first run and return run are different code paths) + corrupted measure, the test ladder, test rot (testing ghosts), the diagnostic dump, and local-is-the-gradient (debug locally, CI confirms) |
| [Regressions — When the Target Moves](./regressions.md) | Why a red suite after an intentional change is *expected*, not a surprise — the two kinds of red (target moved → update the test; you broke it → fix the code), the triage question, and the corrupted measure in regression fixing |
| [A Real-World Example — The Consent Popup Redesign](./real-world-example.md) | The theory in action, one real session end to end — a consent popup that was glitchy for two weeks (re-prompting, a stuck "all set" screen, a window that wouldn't close), the root cause (one popup doing two jobs), the fix, the tests going red, triaging the reds, a real bug found in the local logs, the *environment* regressing and getting fixed locally, and the suite going green then CI-confirmed |
| [Supporting Links](./supporting-links/) | Evidence — arXiv papers and blog posts backing each claim |

## How to Read This

- **New here?** Start with [Importance of the Knowledge Base](./importance-of-knowledge-base.md) — why the knowledge base is the lynchpin.
- **Want to run the repair loop?** [Human-Assisted Knowledge Base Repair](./human-assisted-kb-repair.md) has the starter prompt.
- **Want the full theory?** [AI Use Theory](./ai-use-theory.md) — the pyramid, the flow, the why.
- **Stress-testing it?** Read [Refutations](./refutations.md) — the strongest objections and how the theory holds (or changes).
- **Building a new codebase?** The pyramid in the main doc is your setup order: knowledge base → logs → tests → features. [Logging](./logging.md) has the signal router pattern. [Testing](./testing.md) has the anti-test approach.
- **Debugging?** The four-phase flow (orient → generate → compare → repair) is enforced via `AGENTS.md`. [Logging](./logging.md) covers the compare phase — the diagnostic query that replaces docker exec archaeology.
- **Shipped an intentional change and the suite went red?** [Regressions](./regressions.md) — the reds are expected; triage each one (target moved → update the test, you broke it → fix the code) before touching anything.
- **Want to see it all in one real session?** [A Real-World Example](./real-world-example.md) — a consent popup that was glitchy for two weeks, the root cause (one popup doing two jobs), the fix, the reds triaged, a real bug found in the local logs, the environment regressing and getting fixed locally, suite green then CI-confirmed.
- **Building a feature?** Same flow — the knowledge base alignment (Phase 1) is what saves you from reimplementation due to misalignment.