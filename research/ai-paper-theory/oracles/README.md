# The two oracles

The paper has to pass both, every time. A paper that satisfies the
reviewer's five questions but feels flat doesn't hit the mark (the
second draft's failure mode — see `../diagnosis.md`); a paper that awes
but fails a question gets rejected. So the reader's experience is a
first-class success criterion, scored.

| Oracle | What it is | File |
|---|---|---|
| **External** | the reviewer's five questions: Q1 is it real · Q2 what is the technical contribution · Q3 is the evaluation honest · Q4 how is it different · Q5 does it earn 12 pages | `external.md` |
| **Internal** | the three awe scores, in the operator's priority order: **logical awe (the utmost)** → original work → importance (calibrated) | `internal.md` |

## The scoring rule

In the compare phase, the draft (or any shot) is scored **0–10 on each
of the three, in priority order**, against the named beats in
`internal.md`. Targets (agent defaults, open to review):

- logical awe **≥ 8 — hard gate** (the utmost)
- original work **≥ 8 — hard gate**
- importance **≥ 6 — calibrated** (no overspend; the conference frames
  the importance)

The repair phase lifts every score; the operator's read of the outline
and the PDF is the final scoring. A score the agent can't lift with a
trace to the evidence gets escalated to the operator, not papered over.

## History note

The oracle originally had four scores. The **genius score was retired**
(operator, 04.11.2026: "we can get rid of that, that is almost too
vague"). Its payload survives as *technique*, not as a scored outcome:
the why-not-X chain and the "ohhh moment" framing are devices that feed
logical awe (each is a visible step in the verification) and original
work (each is a corner the conjunction holds that prior work drops). See
`internal.md`.
