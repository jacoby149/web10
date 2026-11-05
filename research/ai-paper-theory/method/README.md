# The method: the shot loop (outline synthesis, human in the loop)

The operator's synthesis process (04.11.2026): the agent has the whole
knowledge base and the research that was done; synthesis happens in
**shots** — bounded, complete, critique-ready artifacts — gated by the
operator's pass, in this order (the operator's gate order, refined
same day: "paragraph, get a pass, outline, get a pass … before
sections, go straight to the html diagram stuff, get approvals on
those. then section by section, we can attack!"):

**The grounding (always first):** orient — read this theory (start at
`../README.md`), the KB documents, the evidence records
(`research/experiments/`, `federation-demo/`, `interoperability-demo/`,
`domain-portability-demo/`, `live-observation-*.md`), the claim limits
(`research/brief.md`), the venue constraints. Pull every number from
the artifact, never from a previous draft.

**The gates, in order:**

1. **Shot 0 — the pitch (before the outline).** One paragraph, the
   whole paper: setup → system → theorem → proof → labor → payoff.
   Fired to win the "YES YES YES, that is it, this is what we are going
   with this." If the pitch doesn't hit, the spine is wrong — fix the
   spine; don't build the outline on an unapproved one. The pitch seeds
   the abstract and locks the arc.
2. **The outline shots.** The outline is shot in slices (arc +
   differentiators first, then the section groups), with
   human-in-the-loop critique between shots; each slice carries its
   "why" and its awe-beat placements. Pass → the beats lock into
   `second-draft/OUTLINE.md`. The operator reviews the outline, not the
   PDF.
3. **The diagram shots (after the outline, before the sections).** Each
   HTML diagram is shot and gated on the operator's pass — the paper's
   visual spine gets approved before any prose writes around it: the
   section shots then reference stable, approved figures, and the
   page-budget math (full-width floats, aspect ratios) is settled
   before the prose. The diagrams also carry a big share of the three
   awe scores (the look; the NP→P argument drawn, not just described) —
   approving them early is approving the awe.
4. **The section shots — the attack.** Section prose is shot per
   section (or subsection): complete, critique-ready, evidence placed
   per `second-draft/kb/experiments.md`, figures per
   `second-draft/kb/diagrams.md` (already approved), the awe beats per
   `../oracles/internal.md`, each section carrying one job ("this
   section kills the doubt that …"). Pass → the section locks.
5. **The final gate — the PDF.** The operator reads the full PDF (the
   final scoring of the three awe scores), the acceptance checklist
   (`../ops/checklist.md`) ticks, submit.

**The shot rules:**

1. A shot is **complete enough to critique** (never a fragment the
   operator has to finish) and **bounded enough to restart cheaply**
   (one paragraph / one outline slice / one section).
2. A shot **carries its own "why"** — the critique targets the argument,
   not the wording.
3. A shot is **self-scored against the two oracles before firing** (the
   five questions + the three awe scores, at the shot's granularity):
   the agent does not fire a shot it knows fails its own oracles.
4. The operator's critique is **recorded in
   `second-draft/DECISIONS.md`**, verbatim where it's sharp.
5. A shot that misses twice gets a **third shot with a changed
   structure**, not a reword — or a restart.
6. **Restart is free at any granularity.** A missed shot costs one
   shot; even the whole process restarts from Shot 0 if the spine turns
   out wrong. Papers are cheap.

The compare/repair oracles (spine, evidence, awe, reader, venue) run
*inside* the loop: compare is the operator's critique plus the
self-scoring; repair is the next shot.
