# Second-draft paper — decisions

The decision log for `research/second-draft/` (the SIGMOD 2027
industry-track manuscript). Newest entry first. Operator decisions are marked
**(operator)**; agent defaults the operator has not yet reviewed are marked
**(agent — open to review)**. `research/first-draft/` is a frozen record —
nothing in this file applies to it. The writing approach lives in the
`research/ai-paper-theory/` folder (start at its README: the two
oracles, the spine, the shot loop, the craft, the ops).

## 04.11.2026

### Shot 0, take 1: missed — the pitch spec is now in the theory

- **(operator)** The critique of take 1, verbatim: "**'closes the split,'
  dont like that, also this paragraph is so dense, this is almost too
  dense, dont need to literally be shown the section of the abstract
  like this. lets incorporate this into the theory, show me another
  take.**"
- **(agent)** The lesson is in the theory: `method/README.md` Shot 0 now
  carries **the pitch spec** (the pitch is the argument, not the
  abstract — no evidence enumeration; one claim per sentence, no
  clause-stacking; ~150–230 words; no internal shorthand as a verb; the
  payoff line breathes at the end), and `craft/voice.md` rule 6 now says
  one claim per sentence / no clause-stacking. Take 2 fired in the PR
  thread.

### The theory is a folder — hierarchical, multiple readmes

- **(operator)** "the ai paper theory document needs to be a folder,
  hierarchical broken down multiple readmes."
- **(agent)** `research/ai-paper-theory.md` (the ~550-line monolith) →
  `research/ai-paper-theory/`: README (the map + the fundamental + the
  gates in one line each) · oracles/ (README + external.md the reviewer's
  five questions + internal.md the three awe scores) · spine/ (README the
  journey + the section map + differentiators.md + proof.md the
  combination) · method/README.md (the shot loop, with the same day's
  diagram-gate refinement: pitch → outline → diagram shots → section
  shots → PDF) · craft/ (README + voice.md + figures.md + evidence.md) ·
  ops/ (README + attack-surface.md + numbers.md + rebuild.md +
  checklist.md) · diagnosis.md. Living references updated (the lane
  Owns, kb/README, OUTLINE, this header); historical changelog/plan
  entries keep the old path name. Content carried over unchanged apart
  from the diagram gate; the monolith is retired.

### The outline-synthesis process: shots, human in the loop, restart free

- **(operator)** "We need an outline synthesis process. You have the whole
  knowledge base, the research that was done. **You need to propose
  before an outline — I think like a paragraph, i.e. a shot! Like a
  YES YES YES, that is it, this is what we are going with this.** Then
  you take shots at the outline with human in the loop critique, then
  take shots at sections with human in the loop critique, kind of comes
  together like that. And then can start all over again even if it
  doesn't hit the mark — papers are cheap." Gate order, refined the same
  day: "so **paragraph, get a pass, outline, get a pass. I think actually
  before sections, maybe we should just go straight to the html diagram
  stuff, get approvals on those. then section by section, we can
  attack!**"
- **(agent)** The theory §10 is now **the shot loop**: Shot 0 = the pitch
  (one paragraph, the whole paper: setup → system → theorem → proof →
  labor → payoff; gated on the operator's yes — a miss means the spine
  is wrong, not the wording); Shots 1..n = the outline, shot in slices
  with critique between; Shots m..k = the sections, complete and
  critique-ready, evidence per kb/experiments.md, figures per
  kb/diagrams.md; final gate = the full PDF read (the awe scoring) + the
  acceptance checklist. Shot rules: complete enough to critique, bounded
  enough to restart; carries its own "why"; self-scored against both
  oracles before firing; the operator's critique recorded in this log
  verbatim where sharp; two misses = third shot with a changed structure
  or a restart; restart free at any granularity. The gate order per the
  operator's same-day refinement: **pitch → pass → outline → pass → the
  HTML diagram shots → pass → the section shots ("we can attack!")** —
  the visual spine is approved before the prose writes around it, so the
  section shots reference stable, approved figures and the page-budget
  math is settled early.
- **(agent)** **Shot 0 fired 04.11.2026** (the pitch paragraph, in the
  PR #1396 thread) — awaiting the operator's yes. On a hit: the pitch
  locks into the outline's arc and seeds the abstract; the outline
  (already drafted) is re-shot as slices against it.

### The three awe scores: logical awe the utmost (NP system, P proof), original work second, importance calibrated — the genius score retired

- **(operator)** Ranks the awe scores: **logical awe is the utmost
  important** — "that they see this logic that is really good but
  tactical kind of complex, but if given the steps verifiable! showing
  them something NP with P verifiability is a good analogy." **Never
  been done before is second** — "that it is original work." **Importance
  is third and calibrated** — "this is important, but research
  unfortunately alot of times is not that important and is in
  conferences."
- **(operator)** **The genius score is deleted** — "we can get rid of
  that, that is almost too vague."
- **(agent)** `ai-paper-theory.md` internal oracle rewritten: three
  scores in priority order with targets — **logical awe ≥ 8 (hard gate,
  the utmost), original work ≥ 8 (hard gate), importance ≥ 6
  (calibrated)**; the NP/P analogy pinned as the *definition* of logical
  awe ("awe is the gap between the NP-looking system and the P-looking
  proof, closed by the steps"); the why-not-X chain survives as a device
  feeding logical awe (visible verification steps), not as a scored
  outcome; the six "ohhh moments" demoted from a pinned list to
  technique. `OUTLINE.md`'s awe-beat map re-ranked to the three scores
  (the why-not-X beats moved into the logical-awe row); the acceptance
  checklist now carries three score boxes; the second draft re-diagnosed:
  logical awe ~4, original work ~3, importance ~2.
- **(agent) The outline's genius row is retired in the living docs but
  kept in this log as history** (the log is append-only in spirit; the
  theory and outline are the living spec).

### The two oracles: the five questions + the four awe scores

- **(operator)** The paper has to make the reader *feel* it: "why is this
  important, big picture????" · "why has this never been done
  before????" · "why is this genius????" · "wow, this is procedural,
  logical, wow, this is like a 3-move chess tactic right here, the
  calculation right here, kind of creative, wow! give them this kind of
  awe!" — four scores: the **importance score**, the **never-been-done
  before score**, the **genius score**, the **logical-awe score**.
- **(agent)** `ai-paper-theory.md` now carries **two oracles**: the
  external (the reviewer's five questions — acceptance mechanics) and the
  internal (the four awe scores — the reader's experience), with the
  scoring rule (compare phase scores 0–10 against the named beats; target
  ≥ 8 on all four; the operator's read is the final scoring). The six
  "ohhh moments" are pinned (the grant as a row · publicness as a grant ·
  the wall not the membrane · verified not registered · the social graph
  as data · client-mediated federation) and tagged to the five
  differentiators. The proof skeleton is now presented as a chess
  combination (setup → forcing move → calculation → finish; the
  output-filter is the blunder the wall refutes; the conformance suite is
  the engine verifying the line). The second draft's current awe scores
  are diagnosed: importance ~2, never-before-done ~3, genius ~3,
  logical-awe ~4 — "not hitting the mark" quantified. The acceptance
  checklist gains the awe boxes; the attack surface gains
  "rigorous but flat"; the rebuild order gains the awe pass.
- **(agent) The never-before-done claim stays structural, not
  superlative:** each prior system is forced to drop a corner of the
  five-differentiator conjunction; "first-ever" language is printed only
  when the gap check (`research/related-work.md`) is YES, otherwise the
  claim is scoped to the compared systems, stated as fact.

### The bulletproof turn: papers are cheap, the outline is the review surface, the KB is around the paper

- **(operator) The fundamental redefinition.** The journey: (a) we built a
  whole highly technical system; (b) we wrote a draft on what we *thought*
  made it different (the bones, the references, some actual research);
  (c) we quabbled — no, this isn't what's different, that isn't — it is
  *these things particularly*; (d) we proved it performed and did what it
  promised — tests that prove the architectural claims, the business
  claims, and the scale claims; (e) now we are here, taking a step back
  and constructing a new paper, willing to do as much work as doing it all
  over again; (f) **the million lines of code was the labor — the paper is
  cheap**, and writing it with AI is the easy part.
- **(operator) We can deviate pretty significantly from the first draft**
  for the sake of a more accurate, better paper.
- **(operator) Risk is affordable:** risk sounding too high-ego, risk a
  stylistic gamble — **follow through with it**. "None of that hedging
  bullshit we did before! If papers are cheap, we can afford it!"
- **(operator) The set-inclusion formalization of the permission theory
  (§2's `effective(P, G)` union expression) "is really great"** — it is
  the paper's crown jewel and gets theorem treatment. The paper should
  "make sense, be logical, be like reading a proof or something."
- **(operator) It should look like a research paper:** the diagrams very
  nice, the plots done in familiar ways, "a certain way they just look."
- **(operator) Even cheaper is an outline:** the human operator struggles
  to read the full 12 pages — the review surface is the almost-logical
  flow, "what we are going to write and why."
- **(operator) A knowledge base around the paper:** not just the outline —
  all the accompanying documents: ideas around the experiments, why the
  experiments were important, notes on what to show in the diagrams, why
  that is visually nice.
- **(operator) "We want to guarantee a good paper, getting accepted, have a
  bulletproof theory."**
- **(agent) `research/ai-paper-theory.md` rewritten bulletproof:**
  organized around the reviewer's five questions (the external oracle),
  with the attack-surface table (each failure mode → named
  countermeasure), the acceptance checklist (the guarantee made
  operational), and the residual risks stated as fact. Supersedes the
  4.9.1 three-act "churn as lede" spine: the churn is now "the labor",
  the proof structure is the spine, and the surgical-pass
  recommendation is superseded by the outline → prose rebuild.
- **(agent) `second-draft/OUTLINE.md` drafted:** the arc in one paragraph,
  the five differentiators, section beats with KEEP/REWRITE/NEW/CUT +
  their "why", the Q&A evaluation (Q1 architectural / Q2 business / Q3
  scale / Q4 cost-of-alternative), the figure plan, and a page allocation
  that sums to 12.0 body pages. It is the operator's review surface.
- **(agent) `second-draft/kb/` created:** `README.md` (the map + gates),
  `experiments.md` (six experiments × what / why it was important /
  established / evidence / open / where in the paper), `diagrams.md`
  (the design language — color is semantic, the same mechanism drawn
  identically — plus per-figure rationale and the figure plan).
- **Not done:** the manuscript prose. Gated on the outline approval and
  the open questions (churn range, scale framing, authorship, in place vs.
  new folder).

### Narrative pivot: the churn is the lede; the approach is pinned in `ai-paper-theory.md`

- **(operator) The second-draft prose is "not hitting the mark" — "there is
  potential."** The brief: tell the best story of the ~1.1M code additions /
  ~700K deletions that went into the project. We don't have to line up with
  the first draft; deviate a lot. It's 12 pages — re-drafting is cheap.
- **(operator) Make the paper-writing approach a document: `research/ai-paper-theory.md`**
  — done. It pins: the three-act spine (the split / the churn / the proof;
  "the generic core was earned, not designed"), the four-phase method
  (orient → draft → compare → repair, paper edition), the 12 editorial
  rules, the pinned reproducible numbers, the diagnosis of the current
  draft (what works: §7, wall-not-membrane, the email frame; what isn't
  landing: the mechanism-list abstract, the absent churn, hedge density),
  and the open questions for the operator (spine confirmation, churn range,
  evaluation scope, authorship, surgical pass vs. third draft).
- **(agent) Pinned churn count:** `git log --numstat` over all text files,
  all commits since 2021-11-14, merge commits excluded = **958,824 added /
  568,594 deleted** (04.11.2026). The operator's ~1.1M/~700K is not
  reproducible at that range (since-2025: 676,325/494,782; code-extensions
  only: 457,655/257,104; merge diffs included: 1,611,136/837,686). The range
  is an open question before any number is printed.
- **(agent) The new-figure work (fig:app, fig:boundary) is paused** pending
  spine confirmation — figure content is downstream of the story. The
  figure system itself (below) stands.
- **(agent) Recommended prose pass is surgical, not a third draft:** rewrite
  the abstract (three acts, ~150 words), rework the intro (churn lifted,
  contributions with so-whats, Table 1 after the story), open §7 with the
  churn numbers, close the conclusion with the churn resolution, voice pass
  across. A whole re-draft only on operator direction.

### The figure system: HTML source, PNG raster, 2x

- **(operator) Diagrams are authored in HTML.** Every architecture diagram in
  the second draft is a committed `figs/<name>.html` (fixed-size body, dark
  web10 theme) rendered to `figs/<name>.png` with `figs/capture.mjs`
  (headless Chromium, `deviceScaleFactor: 2`). LaTeX includes the PNG; the
  HTML is the editable source. Rationale: the previous PNGs were uneditable
  rasters with no source in the repo, and HTML iteration with the operator is
  fast. How-to: `figs/README.md`.
- **(agent — open to review) UI screenshots stay PNG-only.** `fig-groups.png`
  and the interop/domain screenshots are captures of the running app, not
  diagrams — no HTML source; they follow the app's screenshot harness.
- **(operator) The figure set grows: 3–4 more architecture figures are
  warranted** — the system has unusual mechanisms that deserve their own
  figures (planned set below). Constraint: the 12-body-page budget (internal
  freeze Nov 20). New figures must earn their height; wide/short canvases and
  full-width floats preferred. If the body exceeds 12 pages, the operator
  picks which figures stay.
- **(agent) Figure-accuracy invariant:** a figure may only assert what the
  paper body or the knowledge base already asserts (e.g. `/certify` = "one
  cached answer per token, never a grant"; boundary CTEs sit before
  aggregation). A figure that adds a new claim is a new claim that needs
  evidence. No internal decision/PR IDs in figure text or captions
  (conference-facing, per the 4.5.4 cleanup).

### Planned figure set

| Figure | Section | Content | Status |
|---|---|---|---|
| `fig:overview` (TikZ) | §1 | one client, two sovereign nodes, `/certify` | existing |
| `fig:feed` (HTML) | §6 float | federated node architecture — identical A/B internals, `/certify` the only difference | **redrawn today** (below) |
| `fig:groups` (screenshot) | §6 | groups UI | existing |
| **`fig:app` (HTML)** | §6 "A frontend over the shared node" | web10-social as a stateless lens: app surfaces → app-defined expressions (documents in app services / social graph as group rows / feeds & search as app queries / media as the generic pipeline) → one generic node with the "refuses to learn" callout | in flight |
| **`fig:boundary` (HTML)** | §5 enforcement | wall not membrane: the broken output-filter pipeline vs the boundary-CTE pipeline | in flight |
| `fig:interop` (screenshots) | §6 | snake / marketplace identity screens | existing |
| `fig:domain-follow` (screenshots) | §8 | domain portability before/after | existing |
| (candidate) data-model (HTML) | §3 | one table: `{service, body}`, updates-as-inserts, tombstones, `doc_groups` | candidate, not started |
| (candidate) two-trust-layers (HTML) | §2 | app trust (outer) / person trust (inner), a grant is a row | candidate, not started |

### `fig:feed` (Figure 2) redraw

- **(operator) node B does the same access checks as node A, with `/certify`;
  the old diagram showed the internals as different.** Fix: both nodes draw
  the identical card structure (users / data / contracts / memberships), the
  same violet "access check — contracts + membership · every read" box on
  each, bridged by a "same access check" pill. The only differences: the
  token-verification step (own signature at A vs `/certify(A)` cached until
  expiry at B), the matching "enforces" lines, and A's "serves /certify" box,
  which B's green `/certify` line targets. Node B is mirrored so the two
  identical access-check boxes sit adjacent in the middle.
- **(agent) Stale caption replaced.** The `fig:feed` caption described the
  feed UI (ranking tabs, tag filters) that was never in the figure —
  inherited from the first draft (both drafts shipped the architecture PNG
  with the UI caption). New caption: pulling the feed across nodes,
  `/certify`, the same access check.
- **(agent) First body citation added** in §4 "The read model:
  client-side fan-out" — the figure was previously uncited (no `\ref`
  anywhere in the manuscript).
- Tectonic after the change: 14-page PDF = 12 body + references
  (unchanged), no overfull hboxes, same 1.166pt final-page overfull vbox as
  4.8.2.
