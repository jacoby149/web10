# The knowledge base around the paper

The accompanying documents for `research/second-draft/` — the paper's
thinking, kept out of the manuscript so the manuscript stays 12 pages of
proof. The map, the gates, and the method: `../../ai-paper-theory.md`
(§9 "The machine").

| Document | Job |
|---|---|
| `experiments.md` | The experiments: what each one is, **why it was important** (which claim of the paper it proves), what it established, where the evidence lives, what's open |
| `diagrams.md` | The figures: what to visualize, why that figure, **why it is visually nice** — the design language + per-figure rationale |

Siblings in the paper folder (outside the KB):
- `OUTLINE.md` — the review surface: what we are going to write and why.
  The operator reads this, not the PDF.
- `DECISIONS.md` — the decision log (operator + agent calls, newest
  first).
- `../ai-paper-theory.md` — the method (the theory this KB serves).

The gates (from the theory):
- An experiment enters the paper **only through `experiments.md`** — the
  "why it was important" line is written before its evidence is placed in
  prose. An experiment that proves none of the paper's claims stays in the
  repo as engineering; it is not in the paper.
- A figure enters the paper **only through `diagrams.md`** — what it
  visualizes, why that shape, why it is visually nice, and the accuracy
  invariant (a figure asserts only what the body asserts).

Nothing here may assert more than the evidence it cites. The KB is where
the thinking lives; the manuscript is the approximation.
