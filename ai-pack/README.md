# AI Pack — the method cartridge

The portable operating method for working with AI on any repo. This is the
*cartridge* — drop it into a codebase and the AI knows **how to work**: the
four-phase task flow, the pyramid, and how to write docs that don't sound like
AI. It is method, not content: the per-repo brain (what the code is, where
it's going) lives in [`knowledge-base/`](../knowledge-base/).

> **The one rule:** the knowledge base is the root of trust. Everything else
> (logs, tests, changelog) checks against it. Keep it aligned with the code
> before you trust any of it.

## The Folders

- **[`ai-use-theory/`](./ai-use-theory/)** — the core method. Three LLM
  traits, the four-phase task flow (orient → generate → compare → repair), the
  pyramid (KB → logs → tests → features), convergence, and the one assumption.
- **[`knowledge-theories/`](./knowledge-theories/)** — how to *organize* a
  doc: the Why / How / What layers.
- **[`writing-styles/`](./writing-styles/)** — how to *structure* a doc.
- **[`voices/`](./voices/)** — how a doc should *sound* (so it isn't AI).
- **[`visual-styles/`](./visual-styles/)** — styles for Mermaid charts.
- **[`editing-styles/`](./editing-styles/)** — how to *edit* (touch-up vs
  rewrite).

## The Workflow

[AGENTS.md](./AGENTS.md) is the doc-writing workflow: pick a knowledge theory,
a writing style, a voice, write, then pick an editing style if a pass is
needed.
