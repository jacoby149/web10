# AI Use Theory — Overview

How to use AI to build software without burning money on debugging loops.

## The Docs

| Doc | What it is |
|---|---|
| [AI Use Theory](./ai-use-theory.md) | The main theory — three LLM traits, the four-step pyramid, the four-phase debugging flow, convergence, and the one assumption |
| [Refutations](./refutations.md) | Stress test — R1 through R12, each objection answered and resolved. When a refutation wins, the theory changes |
| [Human-Assisted KB Repair](./human-assisted-kb-repair.md) | The concrete flow for keeping the KB correct — AI audits, human judges, iterate to convergence |
| [Integration](./integration.md) | How the theory is wired into the agent flow — Option 1 (pointer + on-demand) is the selected integration |
| [AI Readiness](./ai-readiness.md) | Where this codebase stands against the pyramid — ~60%, with logs as the biggest gap |
| [Supporting Links](./supporting-links/) | Evidence — arXiv papers and blog posts backing each claim |

## How to Read This

- **New to the theory?** Start with [AI Use Theory](./ai-use-theory.md). It stands alone — the pyramid, the flow, the why.
- **Stress-testing it?** Read [Refutations](./refutations.md) — the strongest objections and how the theory holds (or changes).
- **Want to run the KB repair loop?** [Human-Assisted KB Repair](./human-assisted-kb-repair.md) has the starter prompt.
- **Building a new codebase?** The pyramid in the main doc is your setup order: KB → Logs → Tests → Features.
- **Debugging?** The four-phase flow (orient → generate → compare → repair) is enforced via `AGENTS.md`.