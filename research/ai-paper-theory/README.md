# AI Paper Theory — the bulletproof method for the web10 SIGMOD paper

The operating method for `research/second-draft/` (and any future
manuscript in this repo). Read this first; it maps the rest.

## The one line

The labor was the system; the paper is the payoff — and the paper is
cheap. Write it like a proof, make it look like a research paper, claim
the differentiators boldly, and follow through. No hedging. Two
oracles: the reviewer's five questions (external) and the three awe
scores (internal). Synthesis is a shot loop with the human in the loop —
restart is free at any granularity.

## The map

| Read | For |
|---|---|
| `oracles/` | what "accepted" requires — the external oracle (the reviewer's five questions) + the internal oracle (the three awe scores: **logical awe — the utmost** · original work · importance — calibrated) |
| `spine/` | what the paper argues — the journey (the meta-story), the five differentiators, the proof skeleton (the theorem + the combination) |
| `method/` | how it gets written — the shot loop: pitch → outline → diagrams → sections → PDF, human in the loop, restart free |
| `craft/` | how it looks and sounds — the editorial voice (13 rules), the figure look, the evidence-as-proof gates |
| `ops/` | running it — the attack surface (failure modes → countermeasures), the pinned numbers, the rebuild order + open questions, the acceptance checklist |
| `diagnosis.md` | where the current second draft stands — what to carry, what to kill, the current awe scores |

## The fundamental: papers are cheap, acceptance is not

The operator's first principle (04.11.2026):

- The labor was the system: a whole highly technical platform — the
  node, the SDK, the social killer app, a game, a marketplace,
  federation. The labor is done; that is why the paper is cheap.
  (The line count is a pinned reproducible fact in `ops/numbers.md` —
  it is **not** a story beat. Operator, 04.11.2026: "no one cares how
  many lines of code we wrote.")
- The manuscript is 12 pages. A bad draft costs 12 pages of deletion,
  not 12 months of rework. So:
  1. **Don't patch a wrong spine — rebuild it.** The drafts are records,
     not inheritance. Deviate from any earlier draft as much as accuracy
     demands.
  2. **Risk is affordable.** Risk sounding too high-ego; risk a
     stylistic gamble — **if we follow through**. The cost of failure is
     another draft; the cost of hedging is a paper that doesn't hit the
     mark. And the awe is cheap to earn: it is structure (the named
     beats), not luck.
  3. **No hedging.** No "though it is arguable", no "not an exhaustive
     claim", no "must not be mistaken for". Evidence scope is stated
     **as fact** — "we measured X under condition Y; Z is out of scope
     (§9)" — which bounds the domain without weakening the claim. Inside
     its domain, the claim stands at full strength.
  4. **The draft is never the source of truth.** The system and its
     evidence records are. The draft is the current approximation, cheap
     to replace.

The corollary that makes the theory bulletproof: *because the paper is
cheap, we can afford the discipline that guarantees quality and awe.*
Iteration is free; the gates are what convert the free iterations into
the accepted, landing paper.

## The gates, in one line each (the shot loop — full version: `method/`)

0. The open questions answered (`ops/rebuild.md`).
1. **Shot 0 — the pitch**: one paragraph, the whole paper; gated on the
   operator's "YES YES YES". A miss = the spine is wrong, not the
   wording.
2. **The outline shots**: slices with the "why"; gated → the beats lock
   into `second-draft/OUTLINE.md` (the operator's review surface).
3. **The diagram shots**: the HTML figures, approved *before* the prose
   writes around them — the visual spine first, the page-budget math
   settled.
4. **The section shots**: complete, critique-ready, self-scored against
   both oracles before firing. "Section by section, we can attack."
5. **The PDF gate**: the operator's full read (the final awe scoring) +
   the acceptance checklist (`ops/checklist.md`). Submit.

## Companions (the paper's KB — `research/second-draft/`)

- `OUTLINE.md` — the review surface: what we are going to write and why.
  The operator reads this, not the PDF.
- `DECISIONS.md` — the decision log: operator + agent calls, newest
  first; the operator's critique lands here verbatim where it's sharp.
- `kb/experiments.md` — the evidence map: six experiments × what / why it
  was important / established / evidence / open / where in the paper.
- `kb/diagrams.md` — the figure notes: the design language +
  per-figure rationale.
- Upstream: `research/brief.md` (claim limits),
  `research/f3-best-paper-notes.md` (the structural benchmark),
  `research/related-work.md` (the gap check), `research/first-draft/`
  (frozen record — never edited).
