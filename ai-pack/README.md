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
- **[`ai-security-theory/`](./ai-security-theory/)** — the security method, the
  use-theory applied to *hardening a surface*. Security as *coverage, not
  convergence*: the scope ladder (L1 file-scan → L2 immediate-neighborhood-scan →
  L3 project-wide-scan), the scan/fix split, the security record (the root of trust
  for security claims), the AI pentest gate, and the 3–6 month re-scan ratchet.
  *(The two are siblings: `ai-use-theory/testing.md`'s system-pyramid / anti-test
  section points here for the full hardening process.)*
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
