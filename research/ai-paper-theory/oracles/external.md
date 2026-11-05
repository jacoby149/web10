# The external oracle — the reviewer's five questions

The theory is organized around the reviewer, not around us. An
industry-track SIGMOD reviewer asks five questions; the mechanics of the
paper answer them:

| # | The reviewer's question | The countermeasure | Where it lives |
|---|---|---|---|
| Q1 | **Is it real, and does it run?** | The labor up front (pinned line counts, a deployed node, a production snapshot); the UI screenshots as evidence; the artifact pins | `../spine/` (the journey), `../craft/evidence.md` (#6), `../ops/numbers.md` |
| Q2 | **What is the technical contribution — beyond "we built it"?** | The proof skeleton: the permissions set-theory as the central theorem, the boundary CTE as its materialization, the conformance suite as its proof | `../spine/proof.md` |
| Q3 | **Is the evaluation honest and rigorous?** | Experiments as proof: every claim tied to a named experiment with verified status; the numbers that hurt reported with their tradeoff argument; scope as fact | `../craft/evidence.md` |
| Q4 | **How is it different from prior work?** | The five differentiators stated boldly; Table 1 (prior work on the edges); related work as positioning; the gap check must be YES before freeze | `../spine/differentiators.md` |
| Q5 | **Does it earn 12 pages — and read well?** | The outline with a page allocation that sums to 12.0; the editorial rules (no hedging, punchline first); the figure design language | `../method/`, `../craft/voice.md`, `../craft/figures.md` |

Bulletproof = every controllable failure mode has a named
countermeasure (`../ops/attack-surface.md`), and the residual risk is
named too (`../ops/checklist.md`).
