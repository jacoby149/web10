# Knowledge Base — AI Use Theory

The knowledge base is the root of trust. Everything else in the pyramid — logs, tests, changelog — checks against it. If it's wrong, the AI converges to the wrong place faster. This folder is the methodology for keeping it correct, using it well, and building codebases that an AI can debug without burning money.

## The Docs

| Doc | What it is |
|---|---|
| [Importance of the Knowledge Base](./importance-of-knowledge-base.md) | Why the knowledge base is the lynchpin — entry point of every debugging flow, the funnel where all signal flows through |
| [Human-Assisted Knowledge Base Repair](./human-assisted-kb-repair.md) | The concrete flow for keeping the knowledge base correct — AI audits, human judges, iterate to convergence |
| [AI Use Theory](./ai-use-theory.md) | The full theory — three LLM traits, the four-step pyramid, the four-phase debugging flow, convergence, and the one assumption |
| [Refutations](./refutations.md) | Stress test — R1 through R12, each objection answered and resolved. When a refutation wins, the theory changes |
| [Integration](./integration.md) | How the theory is wired into the agent flow — Option 1 (pointer + on-demand) is the selected integration |
| [AI Readiness](./ai-readiness.md) | Where this codebase stands against the pyramid — ~60%, with logs as the biggest gap |
| [Supporting Links](./supporting-links/) | Evidence — arXiv papers and blog posts backing each claim |

## How to Read This

- **New here?** Start with [Importance of the Knowledge Base](./importance-of-knowledge-base.md) — why the knowledge base is the lynchpin.
- **Want to run the repair loop?** [Human-Assisted Knowledge Base Repair](./human-assisted-kb-repair.md) has the starter prompt.
- **Want the full theory?** [AI Use Theory](./ai-use-theory.md) — the pyramid, the flow, the why.
- **Stress-testing it?** Read [Refutations](./refutations.md) — the strongest objections and how the theory holds (or changes).
- **Building a new codebase?** The pyramid in the main doc is your setup order: knowledge base → logs → tests → features.
- **Debugging?** The four-phase flow (orient → generate → compare → repair) is enforced via `AGENTS.md`.