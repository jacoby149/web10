# AI Paper Theory — the bulletproof method for the web10 SIGMOD paper

The operating method for `research/second-draft/`. The purpose of this
document is single-minded: **the paper gets accepted — and the reader
feels it.** The paper is cheap; acceptance is not, and neither is the
awe. Every mechanism below exists to trade unlimited cheap iterations for
one accepted paper that lands.

Companion records: `second-draft/OUTLINE.md` (the review surface — what
we are going to write and why), `second-draft/DECISIONS.md` (the decision
log), `second-draft/kb/` (the knowledge base around the paper: the
experiments, the figures), `research/first-draft/` (frozen record —
never edited), `research/brief.md` (claim limits),
`research/f3-best-paper-notes.md` (the structural benchmark: SIGMOD 2025
Best Paper, dissected), `research/related-work.md` (the gap check).

## 1. What "accepted" requires — the two oracles

The theory is organized around the reader, not around us. Two oracles,
and the paper has to pass both — every time:

### The external oracle: the reviewer's five questions

An industry-track SIGMOD reviewer asks five questions; the mechanics of
the paper answer them:

| # | The reviewer's question | The countermeasure | Where it lives |
|---|---|---|---|
| Q1 | **Is it real, and does it run?** | The labor up front (pinned line counts, a deployed node, a production snapshot); the UI screenshots as evidence; the artifact pins | §3, §6, §12 |
| Q2 | **What is the technical contribution — beyond "we built it"?** | The proof skeleton: the permissions set-theory as the central theorem, the boundary CTE as its materialization, the conformance suite as its proof | §5 |
| Q3 | **Is the evaluation honest and rigorous?** | Experiments as proof: every claim tied to a named experiment with verified status; the numbers that hurt reported with their tradeoff argument; scope as fact | §6, §11 |
| Q4 | **How is it different from prior work?** | The five differentiators stated boldly; Table 1 (prior work on the edges); related work as positioning; the gap check must be YES before freeze | §4, §11 |
| Q5 | **Does it earn 12 pages — and read well?** | The outline with a page allocation that sums to 12.0; the editorial rules (no hedging, punchline first); the figure design language | §7, §8, §9, §14 |

### The internal oracle: the three awe scores

The second draft passed the external oracle and failed the internal one —
"not hitting the mark" is the name of that failure (§13 quantifies it).
Three scores, in the operator's priority order (04.11.2026):

**1. Logical awe — the utmost important.** The reader sees logic that is
*really good but tactically complex* — and, **given the steps,
verifiable**. The NP-with-P-verifiability feel: the system looks
intractable (a decentralized, user-managed, cross-node, app-defined
access system over a shared columnar store — where would the boundary
even be?), and then the paper hands over the steps: the grant is a row;
`effective(P, G)` is a union of three terms; the service name
materializes as the reader-filtered CTE; the query compiles in five
checkable moves; the attacks replay and are denied. Verification is P
once the steps are given. **Awe is the gap between the NP-looking system
and the P-looking proof, closed by the steps.** The combination
structure (setup → forcing move → calculation → finish; the output filter
is the blunder, the wall the refutation, the conformance suite the engine
verifying the line) and the why-not-X chain (each obvious alternative
shown failing in one checkable line) are the devices that produce it.
*Check: can a reviewer replay the theorem from definition to corollary
without a single "but how?" — and does the replay feel like watching a
complex calculation verify in seconds?*

**2. Original work ("never been done before") — second.** That the work
is *original*. Structural, not survey: the five differentiators are a
conjunction, and each prior system is forced to drop at least one corner
(email drops the access vocabulary, the federated socials drop
user-managed access, Solid drops the uniform service-scoped grant, the
lakehouse drops ownership); Table 1 + the related-work positioning show
the edges; the deletions (four app-specific surfaces built and removed
under pressure) show the conjunction held where it was tempting to break
it. *Check: does the reviewer conclude the work is original — "I see why
nobody else has this combination"?* Until the gap check is YES, the claim
is scoped to the compared systems and stated as fact — no "first-ever"
language printed on an open gap.

**3. Importance — third, calibrated.** "Why is this important, big
picture?" Real stakes (the social graph is what makes a life's data
valuable, and it's the part no platform lets you own) and the labor up
front (958,824 added / 568,594 deleted). But the operator's
calibration: research is often not that important in the grand sense, and
the conference frames the importance — so a modest, honest beat is
enough. *Don't overspend the page budget here.* *Check: the stakes and
the labor are up front and credible — that's all this score requires.*

**The scoring rule.** In the compare phase, the draft is scored 0–10 on
each of the three, in priority order; the repair phase lifts every
score. Targets (agent defaults, open to review): **logical awe ≥ 8
(hard gate — the utmost), original work ≥ 8 (hard gate), importance ≥ 6
(calibrated)**. The operator's read of the outline and the PDF is the
final scoring. A score the agent can't lift with a trace to the evidence
gets escalated to the operator, not papered over.

**The genius score was retired** (operator, 04.11.2026: "we can get rid of
that, that is almost too vague"). Its payload survives as *technique*,
not as a scored outcome: the why-not-X chain and the "ohhh moment"
framing are devices that feed logical awe (each is a visible step in the
verification) and original work (each is a corner the conjunction holds
that prior work drops).

## 2. The fundamental: papers are cheap, acceptance is not

The operator's first principle (04.11.2026):

- The labor was the system: a whole highly technical platform — the node,
  the SDK, the social killer app, a game, a marketplace, federation —
  **958,824 lines added, 568,594 deleted** (pinned count, §12). The labor
  is done; it does not change with how we describe it.
- The manuscript is 12 pages. A bad draft costs 12 pages of deletion, not
  12 months of rework. So:
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
Iteration is free; the gates (§9, §10, §16) are what convert the free
iterations into the accepted, landing paper.

## 3. The journey (what we actually did — the paper's meta-story)

1. **We built a whole highly technical system.** The node (one columnar
   store, a user-addressed permission vocabulary, a query boundary, a
   media pipeline, federation), the SDK, the social app. A million lines
   of labor. *(Q1.)*
2. **We wrote a draft paper on what we thought made it different.** The
   bones, the references — and some actual research, to find the similar
   prior work.
3. **We quabbled.** No, this isn't what's different. That isn't either.
   It is *these things particularly* that make this different. The
   differentiators got settled (§4). *(Q4.)*
4. **We proved it performed and did what it promised.** Tests that prove
   the architectural claims (the boundary holds: attacks replayed and
   denied), the business claims (the killer app runs; a game and a
   marketplace reuse its data with no node change), and the scale claims
   (K1000 fan-out: the cost lives in the access layer, not the database).
   *(Q3.)*
5. **Now we are here.** We step back and construct the real paper —
   willing to do as much work as doing it all over again. The labor was
   the code; the writing is the cheap part.

The paper does not footnote this journey. It *is* this journey, told in
proof order: the claim, the difference, the theorem, the evidence, the
cost.

## 4. The claim: five differentiators ("these things particularly")

What the quabbling settled — each stated boldly in the intro, each tied
to the evidence that proves it, each carrying its verifiable step (the
why-not-X beat, §1 internal oracle). Prior work lives on the edges: email has the
network but no fine-grained access; Mastodon/Bluesky federate content but
access stays platform-defined; Solid owns the data but is resource-centric
with cross-Pod cost that depends on deployment; a platform lakehouse has
scale but no user-owned access.

1. **User-owned, portable data — all formats.** A post, a profile, a game
   score, and a marketplace listing are documents in the same store,
   differing only in the service string and the JSON shape the
   application agreed to use. *(proven by: interop + operating point)*
2. **Fine-grained, user-managed access.** A grant is a row: principal ×
   group × service × operation; roles are per-service permission maps;
   publicness is a grant, not a flag. The end user runs the IAM
   operations a cloud operator would express as policies — over their own
   data. *(proven by: the theorem + conformance)*
3. **Cross-node-addressable access.** `provider/username` principals; the
   policy reaches across the network; foreign tokens are verified, not
   registered — one cached `/certify` answer per token, and the same
   access check on every read. *(proven by: the two-node IAM experiment)*
4. **Composable, app-defined queries.** The node has never learned a
   social concept — no posts table, no feed endpoint, no followers
   construct — and the query boundary keeps the shared store sound.
   *(proven by: the app-as-a-lens figure + interop + the boundary
   experiment)*
5. **A user-addressed network without federation.** Sovereign nodes,
   client-mediated reads, no central authority, no shared database —
   email's architecture, generalized from one format to all, and from
   content routing to access control. *(proven by: the domain portability
   experiment)*

Rule: a differentiator that no experiment proves is not in the paper. Cut
it, don't hedge it.

## 5. The proof: the paper's skeleton

"Reads like a proof" means: definitions before use, claims as
statements, lemmas that step to a theorem, evidence as the proof. The
set-theory of permissions — already in the draft (§2 "Principal classes
and effective permissions") — is the crown jewel and the central
theorem:

- **Definitions.** Principal; principal classes, nested (`anyone` ⊇
  `authenticated` ⊇ `member`); group; service; role; grant row;
  operation; readable set.
- **The expression.**
  `effective(P, G) = grant(G, anyone) ∪ (P ∈ authenticated ? grant(G,
  authenticated) : ∅) ∪ (P ∈ member(G) ? grant(G, role(P)) : ∅)` —
  monotone across classes; publicness is a grant; blocks, sharing state,
  hidden documents, and node moderation restrict the result.
- **The materialization.** Each service name in a query resolves to a
  boundary CTE that is the SQL materialization of the reader's readable
  set — *before* joins and aggregation run (the wall, not the membrane).
  This is where the set theory becomes SQL; make the §2→§5 connection
  explicit in the text, not implied.
- **The theorem (I3).** Every query compiled through the boundary returns
  only documents in the reader's readable set; an empty readable set
  compiles to an empty service.
- **The proof of the theorem.** The conformance suite: the permission
  matrix, the attacks replayed and denied (exploit red → denied green),
  and the boundary's five-step compile (parse, check kind, walk, inject,
  round-trip).
- **Corollaries.** Revocation is a tombstone on metadata rows, bounded by
  database visibility + in-flight requests + remaining capability
  lifetime — each term measured or bounded where the paper measures it.
  Cross-node reads: the serving node re-runs the same theorem against its
  own store after one cached `/certify`.

**Presented as the combination** (the logical-awe score, §1): the setup
is the split (§1 of the paper); the forcing move is the expression — the
grant is a row, so the readable set is computable before any query runs;
the calculation is the materialization + the five-step compile + the
round-trip; the finish is the corollaries. The conformance suite is the
engine verifying the line. The output-filter design is the *blunder* the
combination refutes — show it playing the blunder first (with the
`count(*)` attack), so the wall lands as the refutation, not as a
specification detail.

No paragraph asserts what the reader cannot derive from the previous
paragraphs. Where a leap appears, that is where the missing definition or
lemma goes.

## 6. The evidence: experiments as proof

The evaluation is not a metric list; it is the proof of the claims,
organized as Q&A (each subsection answers a named question — the F3
pattern). Three claim classes, each with its experiments:

- **Architectural claims** — does the boundary hold? The conformance /
  permission matrix; the I3 negative tests (attacks replayed, denied);
  the two-node IAM experiment (the theorem re-run on a foreign store).
- **Business claims** — does a real app run on the generic node? The
  connected interop (game + marketplace, browser consent, no node change,
  no API agreement); the domain portability prototype (the address
  outlives the account; the private grants correctly stay behind).
- **Scale claims** — where does the cost live? The K100/K1000 fan-out
  (7.64 s → 363 ms median batched at 1,000 candidate groups; the
  one-group counterweight); the operating point (the production snapshot,
  stated as fact).

The gates:
- An experiment enters the paper **only through `second-draft/kb/
  experiments.md`** — the "why it was important" line (which claim it
  proves) is written before the evidence is placed in prose. An experiment
  that proves none of the paper's claims stays in the repo as engineering;
  it is not in the paper.
- **The number that hurts is reported in the results, not the
  discussion** — with its tradeoff argument (the F3 honest-caveat
  pattern). The one-group counterweight belongs in §8 next to 363 ms.
- Baselines are named with versions and configs. The matched RLS baseline
  (E3) is open; it is stated as the committed follow-up *with its design*,
  scope as fact — not apologized for.
- Every printed number traces to a pinned artifact or a verified
  experiment record (§12). No number from a previous draft, ever.

## 7. The look: figures that look like a research paper

Research papers have a look. Ours:

- **Diagrams:** the HTML→PNG@2x system (`second-draft/figs/README.md`) —
  committed sources, one consistent dark web10 theme, the same mechanism
  drawn identically everywhere, every figure referenced from the body and
  caption-accurate. A figure enters the paper **only through
  `second-draft/kb/diagrams.md`** — what it visualizes, why that shape,
  why it is visually nice.
- **Plots:** the familiar shapes — bar, line, CDF, grouped. One question
  per plot; the question is the first sentence of the caption.
- **The figure that maps the paper:** the overview figure carries section
  labels (§2, §4, §5, …) — a visual table of contents (the F3 move).
- **Consistency:** one palette, one font, one figure grammar. A
  reviewer's eye should see a system, not a pile. The dark theme doubles
  as a Q1 signal: the figures and the UI screenshots share one visual
  world, and that world is the product.

## 8. The voice: the editorial rules

1. Open with the tension, not the definition.
2. The labor is a lede: a whole highly technical system, built and
   proven — with the pinned numbers, early.
3. The differentiators are stated boldly — five of them — each tied to
   the evidence that proves it and carrying its why-not-X step.
4. Claims stand at full strength inside their domain; the domain is
   stated as fact, not apologized for.
5. **No hedging, ever.** If a claim can't survive the evidence oracle,
   cut the claim — don't weaken it. A bold claim that gets defended beats
   a safe claim that gets hedged into the ground.
6. One idea per paragraph; lead with the punchline.
7. Definitions before use; no noun the reader doesn't own.
8. Every figure: referenced from the body, caption describes the figure it
   sits under, asserts only what the body asserts.
9. No internal IDs in conference-facing prose (decision numbers, PR
   numbers) — per the 4.5.4 cleanup.
10. The email frame: open in the intro, close in the conclusion.
11. Related work = positioning (three paragraphs, each ending with the
    gap); the verified bibliography carries it; the gap check must be
    YES before it freezes.
12. Evaluation = Q&A: one named question per subsection; baselines named
    with versions; the number that hurt reported with its tradeoff
    argument.
13. **The awe beats are structure, not adjectives:** logical awe (the
    combination: setup → forcing move → calculation → finish; the
    why-not-X chain as visible verification steps; the NP-looking system
    contrasted with the P-looking proof), original work (the structural
    conjunction argument), importance (the stakes + the labor up front —
    calibrated, no overspend).

## 9. The machine: the knowledge base around the paper

The paper is not one document; it is a small KB, each piece with one job.
The method flows through them in order, and nothing enters the manuscript
unmediated by its KB document:

| Document | Job |
|---|---|
| `ai-paper-theory.md` (this file) | The method — the two oracles, the fundamental, the journey, the claim, the proof skeleton, the evidence gates, the look, the voice, the attack surface, the pinned numbers |
| `second-draft/OUTLINE.md` | The almost-logical flow — what we are going to write and why; beats per section with KEEP/REWRITE/NEW/CUT; the page allocation |
| `second-draft/DECISIONS.md` | The decision log — operator + agent calls, newest first; "why do we do it this way" |
| `second-draft/kb/experiments.md` | The experiments — what each is, why it was important (which claim it proves), what it established, where the evidence lives, what's open |
| `second-draft/kb/diagrams.md` | The figures — what to visualize, why that figure, why it is visually nice; the design language + per-figure rationale |

The gates:
- **The outline is the approval gate for prose**: no section is written
  until its "why" survives the operator's read. A PDF review costs the
  operator an hour; an outline review costs five minutes. Papers are
  cheap; operator time is not.
- **Experiments enter only through kb/experiments.md** (§6).
- **Figures enter only through kb/diagrams.md** (§7).
- **DECISIONS.md is append-only in spirit**: newest first, operator
  decisions marked, agent defaults marked open to review.

This is the paper's version of the project's root-of-trust pattern: KB →
outline → manuscript. The draft is the approximation; the KB is where the
thinking lives.

## 10. The method: orient → outline → prose → compare → repair

The paper edition of the four-phase flow, with the KB as the gates:

1. **Orient.** Read this theory, the journey, the KB documents, the
   evidence records (`experiments/`, `federation-demo/`,
   `interoperability-demo/`, `domain-portability-demo/`,
   `live-observation-*.md`), the claim limits (`brief.md`), the venue
   constraints. Pull every number from the artifact, never from a
   previous draft.
2. **Outline.** `OUTLINE.md` — the arc, the differentiators as claims,
   the theorem, the section beats with their "why", the evidence map, the
   page allocation. **The operator reviews the outline, not the PDF.**
3. **Prose.** Section by section, each section carrying one job: "this
   section kills the doubt that …". Evidence placed only per
   kb/experiments.md; figures drawn only per kb/diagrams.md; the awe
   beats placed per §1 internal oracle.
4. **Compare.** Five oracles, in order: the spine (does this paragraph
   advance the proof?); the evidence (does this claim trace to a pinned
   artifact or verified experiment?); **the awe (score the draft 0–10 on
   each of the three, in priority order, against the named beats)**; the reader (does a fresh
   reviewer own every noun? where would they attack?); the venue (12 body
   pages, industry-track values, the F3 notes as structural benchmark).
5. **Repair.** Punchline first, numbers second, scope-as-fact third,
   sentences fourth. Then the no-hedging pass: find every weakened claim,
   restore it to full strength inside its domain, cut it if it can't
   survive the evidence oracle. Then the **awe pass**, in priority order:
   logical awe to ≥ 8 (the combination presentation, the why-not-X chain
   as visible verification steps, the NP→P contrast), then original work
   to ≥ 8 (the structural conjunction argument), then importance to ≥ 6
   (the calibrated stakes + labor beats). Then the acceptance checklist
   (§16).

## 11. The attack surface: failure modes and countermeasures

The named defenses. If a failure mode is not in this table, it is not
being managed — add it here when you see it.

| Attack / failure | Countermeasure | Where |
|---|---|---|
| "An engineering blog, not a contribution" | The theorem + lemmas + conformance-as-proof; the wall-not-membrane and verified-not-registered generalizations | §5; outline §2/§5 |
| "Not novel — Solid/ActivityPub/IAM did this" | Five differentiators + Table 1 (edges) + related-work positioning + gap check YES before freeze; the structural conjunction argument (each prior system drops a corner) | §4; outline §1/§9 |
| "Where's the scale?" (597 accounts is small) | K1000 attributable measurement + honest operating point + the fan-out→batching lesson; **the scale framing is decided up front** (open question), not improvised at review time | §6; kb/experiments.md #5/#6 |
| "Your federation isn't production" | Scope as fact: the connected slice is verified under named conditions; production keys/phases named in forward scope | outline §4/§8 |
| "One app is not generality" | Three apps (social + game + marketplace), no node change, no API agreement — stated as the business claim | §6; kb/experiments.md #2 |
| "Your numbers don't reproduce" | Pinned numbers with exact commands + artifact revisions + the check-paper harness | §12 |
| "Hedged into the ground" | No-hedging rule; scope-as-fact; cut-don't-weaken | §8 rules 4–5 |
| **"Rigorous but flat — passes the five questions, fails the awe"** | **The two-oracle rule: the three awe scores at target (logical awe ≥ 8 — the utmost, original ≥ 8, importance ≥ 6 calibrated), the theorem replayable as a combination; the operator's read is the final scoring** | **§1, §10, §16** |
| "Page overrun at the freeze" | Outline allocation sums to 12.0; Tectonic measured after every section; the cut list pre-decided | §14; outline |
| "Single-author credibility" | Open question: second author vs. lean on deployment evidence | §15 |
| "Figures drift from the body" | The accuracy invariant + the KB gate (figures only via kb/diagrams.md) | §7; §9 |
| "The evaluation is a metric list" | Q&A structure; named baselines; numbers that hurt in the results | §6; outline §8 |
| "The motivation is a value argument" (F3 §3.2) | The labor numbers + the capability table + the K1000 counterintuitive result *are* the empirical motivation; the production snapshot is stated as fact | §3, §6 |

## 12. Pinned numbers (reproducible — print only these)

- **The labor:** `git log --numstat --format="" | awk 'NF>=3 {i+=$1;
  d+=$2} END {print i, d}'` → **958,824 added / 568,594 deleted** (all
  text files, all commits since 2021-11-14, merge commits excluded — the
  standard `git log` behavior). Counted 04.11.2026; re-run and re-pin at
  submission. The operator's ~1.1M/~700K is not reproducible at that
  range (since-2025-01-01: 676,325/494,782 · code-extensions only:
  457,655/257,104 · merge diffs included: 1,611,136/837,686). The range
  decision is open (§15).
- **The frontend:** 46,285 physical source lines across 141 files, pinned
  to artifact revision `317fa349`.
- **K1000 fan-out:** median readable 7.64 s unbatched → 363 ms batched,
  at 1,000 candidate groups; the one-group counterweight in the same
  table.
- **Evidence inventory.** Verified: conformance/permission matrix (attacks
  replayed and denied), connected interop (browser consent), two-node IAM
  (clean merged-dev, H-REPLAY receipt), domain prototype (public continuity
  after provider dark), K100/K1000 fan-out, operating point, production
  snapshot 28.10.2026 (597 accounts, 593 documents, 49 groups, 1,298
  memberships). OPEN: E1–E5 production counters / latency / cost model /
  case study / conformance numbers at scale, the related-work gap check,
  the matched RLS baseline.

## 13. Diagnosis of the second draft (what to carry, what to kill)

**Carry (the seeds):** the email frame (abstract → intro → conclusion);
§2's set-theory of permissions (promote to the theorem); the
wall-not-membrane argument; §7 Lessons ("the node keeps resisting the
killer app", the four built-and-deleted surfaces, the self-healing schema
race, the shared table's day-to-day cost, the fan-out pointing at the
access layer); Table 1 (the "prior work lives on the edges" move); the
scope statements (re-voiced as fact).

**Kill:** the mechanism-list abstract; the hedge density ("The comparison
concerns these design choices, not an exhaustive claim…"); the
catalog-shaped §2–§6 (describe → describe → describe, no proof); the
missing labor (a million lines appear nowhere in the current paper); the
uncited figures (fig:feed fixed in 4.9.1; audit the rest).

**Current awe scores (the operator's priorities, 04.11.2026):** logical
awe **~4** — the email frame is a good setup, but the set-theory is
buried in prose, never presented as the calculation; the theorem has no
name; the NP-looking complexity is never contrasted with the P-looking
verification; original work **~3** — Table 1 shows the edges but never
argues why the prior work *structurally couldn't*; originality is
asserted, not established; importance **~2** — no stakes quantified, no
labor number anywhere (below even the calibrated bar; the easiest score
to fix). The genius score is retired; its payload (the why-not-X beats)
now feeds logical awe as visible verification steps.

**Verdict:** the draft has the bones, the references, and the research —
but it is written as a catalog of mechanisms plus a defense brief, not as
a proof, and it scores in the low range on every awe axis. The new paper
keeps the bones and the evidence and rewrites the narrative as a
combination: the differentiators claimed boldly, the permissions
formalized as the central theorem, the tests as the proof, the labor
stated up front, and the three scores lifted to target (logical awe and
original work ≥ 8, importance ≥ 6).

## 14. The rebuild, in order

0. **The open questions answered** (§15) — the operator decides the churn
   range, the scale framing, authorship, and in-place vs. new folder.
1. **The KB documents** — `kb/experiments.md` + `kb/diagrams.md` drafted
   (done 04.11.2026); they gate the evidence and the figures.
2. **The outline approved** — `OUTLINE.md` read by the operator; the arc,
   the beats, the page allocation, and the awe-beat placements confirmed.
3. **Prose** — abstract + intro first (the stakes + the labor + the five
   claims with their beats); then the theorem core (§2 definitions +
   expression, §5 materialization + compile, presented as the
   combination); then the evidence as Q&A (§8); then the rest per the
   outline. Tectonic measured after every section; the cut list
   pre-decided in the outline (groups UI figure, domain prose compression)
   if the 12-page budget bites.
4. **Figures per kb/diagrams.md** — Figure 1 gains its section labels
   (visual TOC); `fig:app` (§6); `fig:boundary` (§5); candidates: two
   trust layers (§2), the data model (§3).
5. **The voice + awe pass** — kill every hedge, restore claims to full
   strength, follow through on the bold; then the awe pass, in priority
   order: logical awe to ≥ 8 (the combination presentation, the
   why-not-X chain as visible verification steps, the NP→P contrast),
   original work to ≥ 8 (the structural conjunction argument),
   importance to ≥ 6 (the calibrated stakes + labor beats).
6. **The acceptance checklist** (§16) — every box ticked; the operator
   reads the full PDF (the final scoring); submit.

Where: **in place, in `second-draft/`** (the working manuscript; the
evidence tables, the bibliography, and the artifact pins stay; the
narrative sections get rewritten). `first-draft/` stays frozen. A
`third-draft/` folder only if the operator wants the second draft
preserved as a record first.

## 15. Open questions for the operator (decide before prose)

1. **The outline** — is the arc right (journey → five differentiators →
   theorem → evidence → cost)? What gets cut or moved?
2. **The labor range** — all-time pinned (958,824/568,594) or another
   range; reconcile against the ~1.1M/~700K figure before anything is
   printed.
3. **The scale framing** — the production snapshot is 597 accounts / 593
   documents (28.10.2026). Print the small number as honesty + lean on
   K1000 for scale, or wait for the E1 full counters? This is the
   highest-risk reviewer question (attack #3 in §11) — decide it now, not
   at review time.
4. **Authorship** — a single author is the thin credibility spot (F3
   notes §3.6). Is it final, or second author?
5. **In place vs. a third-draft folder** — default is in place.

## 16. The acceptance checklist (the guarantee made operational)

Nothing is submitted until every box is ticked:

- [ ] Every claim in the abstract traces to a numbered section.
- [ ] The five differentiators are each stated in the intro and each
      proven in the evaluation.
- [ ] The theorem (I3) has: definitions, expression, materialization,
      proof (conformance), corollaries — and the §2→§5 connection is
      explicit.
- [ ] No claim without a pinned number or a verified experiment
      (the evidence map in kb/experiments.md is complete).
- [ ] Every printed number reproducible by its pinned command or artifact
      revision.
- [ ] No hedge sentence remains (the voice pass is clean: grep for
      "arguable", "exhaustive claim", "must not be mistaken",
      "unfortunately").
- [ ] **Logical awe ≥ 8 (the utmost):** the theorem replays from
      definition to corollary without a single "but how?"; the
      blunder-and-refutation structure is intact (output filter first,
      wall as the refutation); the why-not-X chain is visible (each
      obvious alternative fails in one checkable line); the NP-looking
      system is contrasted with the P-looking proof — the reader
      experiences the complexity, then verifies it in seconds.
- [ ] **Original work ≥ 8:** the structural conjunction argument (each
      prior system drops a corner of the five); scoped to the compared
      systems until the gap check is YES, stated as fact.
- [ ] **Importance ≥ 6 (calibrated):** the stakes + the labor are up
      front and credible; no page budget overspent on grandiosity.
- [ ] Every figure: referenced from the body, caption accurate, asserts
      only what the body asserts; the design language consistent.
- [ ] Table 1 + related work: the gap check is YES.
- [ ] 12 body pages, no overfull hboxes; references separate.
- [ ] Scope as fact: every OPEN item named in the forward scope, not
      scattered.
- [ ] The operator has read: the outline (approved), this theory, and the
      full PDF.
- [ ] The open questions (§15) are all answered and recorded in
      DECISIONS.md.

## 17. What this theory cannot guarantee

The reviewer's free will, the venue's quotas, and three residual risks
named in §11: the scale framing (until E1 lands or the operator decides
the print-small-number path), the gap check (until related-work.md is
YES — which bounds the never-before-done language), and authorship. The
theory closes every controllable failure mode — mechanics *and* awe;
these three are decided by the operator, not by the writer.
Acknowledging them is the same discipline as no-hedging: state the domain
as fact.
