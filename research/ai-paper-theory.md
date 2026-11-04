# AI Paper Theory — writing the web10 SIGMOD paper

The operating method for `research/second-draft/` (and any future
manuscript in this repo). Read it before touching the paper.

Companion records: `research/second-draft/DECISIONS.md` (the decision log
for this manuscript, newest first), `research/first-draft/` (frozen record
— never edited), `research/brief.md` (claim limits),
`research/f3-best-paper-notes.md` (the structural benchmark: SIGMOD 2025
Best Paper, dissected). The KB and the experiment records are the source of
truth; the draft is the latest approximation of them. When the draft and
the evidence disagree, the draft loses — always.

The generalizable parts (the four phases, the editorial rules, the pinned-numbers
discipline) are candidates for promotion to `ai-pack/` as a portable
paper cartridge if the operator wants one.

## One line

The paper is the project's story, told with verified evidence. The story
is: **the generic core was earned, not designed.**

## The story (pinned spine)

Three acts. Section jobs below. If a section doesn't advance one of these,
it is a cut candidate.

**Act 1 — the split.** Email decentralized the data plane for one format
and never decentralized access. "The payload crossed the boundary; the
permissions did not." Every social platform inherits the split at larger
scale: content is portable in principle, while who-follows-whom and
who-may-read stay locked in the platform's backend. web10 extends the email
model in both directions: *all* formats as documents, and a uniform
user-managed permission vocabulary whose grants name globally addressable
principals — so the permissions leave the building too.

**Act 2 — the churn.** The node was always claimed to be generic; the
killer app kept asking for bespoke surfaces, and we kept building them — a
feed endpoint, a group-identity table, a followers check in the session
oracle, a hard-coded ad path, and everything underneath. Over the project's
life the repo carries **958,824 lines added and 568,594 deleted** (pinned
count, below). The deletions are the evidence: each one is a boundary found
by crossing it. The test that caught every one: *would a notes app, a music
app, or a shop use this?* This act is §7 today — but it belongs in the
intro as the industry-track lede, and in the conclusion as the resolution.

**Act 3 — the proof.** What survived is generic, and it composes. A social
app (feeds, groups, DMs, discovery, short- and long-form video, music), a
game, and a marketplace run on the same node with no node change and no API
agreement between the applications. Connected evidence: browser-consent
interop, a two-node authorization experiment (granted, read, revoked,
restored under one cached `/certify`), a domain-subscription prototype that
outlives its provider, and the K1000 fan-out measurement showing the cost
lives in the access layer, not the database (7.64 s → 363 ms batched,
honest counterweight at one candidate group). Scope is stated, not
apologized for.

### Section map (as it stands → as the spine wants it)

- **Abstract** — carry the three acts in ~150 words: the tension (the
  split), the earned-generic-core story (the churn as lede), the proof
  (connected slices + the measured cost). Not a mechanism list.
- **§1 Intro** — keep the email P1–P2 (they are good). Lift the churn:
  after "The platform is deployed and serving real users" comes the number
  and "the deletions are the evidence." Contributions: what (the model) /
  how (the boundary + the churn that earned it) / proof (connected slices +
  cost structure) — each with a so-what. Table 1 stays, but lands *after*
  the story starts, not between "the permissions did not" and "deployed."
- **§2–§5** (access model, data plane, network, enforcement) — the
  mechanism core; mostly keep. A "why not X" pass where it's missing
  (f3-best-paper-notes §3.8).
- **§6 Platform** — the app as a lens (`fig:app`); multi-app interop as the
  payoff of Act 2's test.
- **§7 Lessons** — today's strongest section; it becomes Act 2's
  resolution: open with the churn numbers, close with the four-surface
  reversals (already there).
- **§8 Evaluation** — the Q&A pass: each subsection opens with the question
  it answers; baselines named with versions; caveats with numbers in the
  results, not the discussion.
- **§9 Related** — positioning, three paragraphs, each ending with the gap.
- **§10 Conclusion** — already closes the email frame; add the churn
  resolution: the generic core was earned, in ~570K lines of deletion.

## The method: four phases (paper edition)

Adapted from the AI Use Theory flow (orient → generate → compare →
repair). The KB is the root of trust; the draft is signal, not oracle.

1. **Orient.** Read before writing: this spine, the evidence records
   (`research/experiments/`, `federation-demo/`, `interoperability-demo/`,
   `domain-portability-demo/`, `live-observation-*.md`), the claim limits
   (`brief.md`), the venue constraints (`research/README.md`,
   `evaluation-plan.md`), and the diagnosis below. Pull every number from
   the artifact, never from the previous draft.
2. **Draft.** Story first: (a) confirm or amend the spine; (b) write each
   section's job in one sentence — "this section kills the doubt that
   …"; (c) then the prose. A wrong spine is not repairable by better
   sentences — the manuscript is 12 pages; re-draft the whole rather than
   patch it (operator, 04.11.2026: "we can deviate a lot … do another
   draft etc.").
3. **Compare.** Four oracles, in this order:
   - **the spine** — does each paragraph advance the plot? If it only
     restates the previous paragraph, cut it.
   - **the evidence** — is every number/claim traceable to a pinned
     artifact or verified experiment? No trace → cut it or mark it OPEN.
   - **the reader** — a fresh SIGMOD reviewer: do they know the nouns?
     Where do they stop believing us? What is the first attack they will
     make?
   - **the venue** — 12 body pages; industry-track values (operational
     candor, cost, what running it taught us); f3-best-paper-notes as the
     structural benchmark.
4. **Repair.** Apply the editorial rules below, in that order: punchline
   first, numbers second, caveats third, sentences fourth.

## The editorial rules (the "hitting the mark" checklist)

1. Open with the tension, not the definition.
2. Production numbers up front. "Deployed and serving real users" without a
   number is a claim; with one, it's evidence.
3. The churn is the lede. ~1M added / ~570K deleted (pinned count) in the
   intro, not only §7. The deletions are the evidence of the discipline.
4. Contributions = what / how / proof, each with a so-what.
5. Caveats quantified at the point of use, not structural at section ends.
   ("The comparison is not an exhaustive claim…" → state the claim, then
   the number that bounds it.)
6. One idea per paragraph; lead with the punchline.
7. Every figure: referenced from the body; the caption describes the figure
   it sits under; a figure asserts only what the body asserts.
8. No internal IDs in conference-facing prose (decision numbers, PR
   numbers) — per the 4.5.4 cleanup.
9. The email frame: open in the intro, pay off in the conclusion.
10. Related work = positioning (three paragraphs, each ending with the
    gap), not a survey.
11. Evaluation = Q&A: named question per subsection; baselines named with
    versions and configs; the caveat with its number lives in the results.
12. Scope stated, not apologized for. ("Local tests are not live-CDN proof"
    beats "unfortunately we could not…".)

## Pinned numbers (reproducible — print only these)

- **The churn:** `git log --numstat --format="" | awk 'NF>=3 {i+=$1;
  d+=$2} END {print i, d}'` → **958,824 added / 568,594 deleted** (all
  text files, all commits since 2021-11-14, merge commits excluded — the
  standard `git log` behavior). Counted 04.11.2026; re-run and re-pin at
  submission. The operator's rough figure (~1.1M / ~700K) is not
  reproducible at that range: since-2025-01-01 is 676,325/494,782, code
  extensions only is 457,655/257,104, with merge diffs included
  1,611,136/837,686. **Decide the range before anything is printed.**
- **The frontend:** 46,285 physical source lines across 141 files, pinned
  to artifact revision `317fa349` (already in §6 — keep the pin).
- **K1000 fan-out:** median readable 7.64 s unbatched → 363 ms batched, at
  1,000 candidate groups; the one-group counterweight in the same table
  (already in §8).
- **Evidence inventory** — verified: connected interop (browser consent),
  two-node IAM (clean merged-dev, H-REPLAY receipt), domain prototype
  (public continuity after provider dark), K100/K1000 fan-out, operating
  point. OPEN: E1–E5 production counters/latency/cost-model/case-study/
  conformance numbers, the related-work gap check, the matched RLS
  baseline. (From `evaluation-plan.md` + the lane.)

## Diagnosis of the second draft (04.11.2026, operator: "not hitting the
mark")

**Working:** §7 Lessons (concrete, operational, story-shaped); the
wall-not-membrane argument; the email frame (abstract → intro →
conclusion); the honest scope statements; Table 1 (the "prior work lives
on the edges" move).

**Not landing:**

1. The abstract is a mechanism list — four "we report connected evidence"
   clauses in one paragraph. An index, not a story. No tension, no number.
2. The churn is absent. The 958K/568K story — the best industry-track
   material in the repo — is nowhere in the paper. §7's "we built four such
   node surfaces, and we removed all four" is its seed, unquantified and in
   the wrong position for a lede.
3. The intro's contribution list is what-without-so-what.
4. Hedge density: forward steps end in structural hedges ("The comparison
   concerns these design choices, not an exhaustive claim of functional
   exclusivity or a measured advantage…").
5. No production number in the intro ("deployed and serving real users" —
   how many, since when?).
6. Table 1 interrupts the narrative between "the permissions did not" and
   "the platform is deployed."

**Recommended pass (surgical, not a third draft):** rewrite the abstract
(three acts in ~150 words); rework the intro (churn lifted, contributions
with so-whats, table after the story); open §7 with the churn numbers;
close the conclusion with the churn resolution; then the voice pass
(rules 5, 6, 12) across all sections. Whole re-draft only if the operator
confirms a changed spine and wants to deviate further.

## Open questions for the operator

1. Confirm the spine: is the churn the lede (Act 2 lifted), or does the
   model (Act 1) stay the lede with the churn as evidence?
2. Which churn range to print: all-time pinned (958,824 / 568,594) or
   another — reconcile against the ~1.1M/~700K figure.
3. Evaluation scope by the Nov 20 freeze: if the E data doesn't land, Act 3
   rests on the connected slices + K1000 — acceptable, or hold the freeze?
4. Authorship: single author is the thin credibility spot per
   f3-best-paper-notes §3.6 — is it final?
5. Surgical pass vs. full third draft.

## The figure system

Details: `research/second-draft/DECISIONS.md` (04.11.2026 entry) +
`figs/README.md`. Rules: diagrams are HTML source → 2x PNG
(`capture.mjs`, headless Chromium); UI screenshots stay PNG-only app
captures; the accuracy invariant (a figure asserts only what the body
asserts); no internal IDs in figure text; planned set follows the spine
(`fig:app` = Act 3's composition, `fig:boundary` = the wall; candidates:
data model, two trust layers). New figures wait for spine confirmation —
figure content is downstream of the story.
