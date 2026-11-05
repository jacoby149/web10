# Outline — "Your Data, Your Rules: Extending the Decentralized Web"

The almost-logical flow of what we are going to write and why. This is the
review surface — the operator reads this, not the PDF
(`../ai-paper-theory.md` is the method). Status per section:
**KEEP** (carried from the second draft), **REWRITE** (new narrative, same
evidence), **NEW**, **CUT**.

## The arc, in one paragraph

Email decentralized where your data *goes*, and fifty years of practice
proved the model — but it never decentralized who may *access* it: the
payload crossed the boundary, the permissions did not. We built web10, a
whole highly technical system that does both, for all formats: a
user-addressed network of sovereign nodes, one columnar store per node,
user-managed grants, a query boundary that filters the input, and a social
killer app defined entirely on the generic primitives. The labor:
**958,824 lines added, 568,594 deleted** (pinned count). This paper proves
what the system claims: the architectural claim (the boundary holds —
attacks replayed and denied), the business claim (the killer app, a game,
and a marketplace run on it), and the scale claim (where the cost lives:
the access layer, not the database — 7.64 s → 363 ms).

## The five differentiators ("these things particularly", stated boldly in §1)

Prior work lives on the edges — email has the network but no fine-grained
access; Mastodon/Bluesky federate content but access stays
platform-defined; Solid owns the data but is resource-centric; a platform
lakehouse has scale but no user-owned access. web10 claims all five:

1. **User-owned, portable data — all formats.** A post, a profile, a game
   score, and a marketplace listing are documents in the same store,
   differing only in the service string and the JSON shape the
   application agreed to use.
2. **Fine-grained, user-managed access.** A grant is a row: principal ×
   group × service × operation; roles are per-service permission maps;
   publicness is a grant, not a flag. The end user runs the IAM
   operations a cloud operator would express as policies — over their own
   data.
3. **Cross-node-addressable access.** `provider/username` principals; the
   policy reaches across the network; foreign tokens are verified, not
   registered (one cached `/certify` answer, the same access check on
   every read).
4. **Composable, app-defined queries.** The node has never learned a
   social concept — no posts table, no feed endpoint, no followers
   construct — and the query boundary keeps the shared store sound.
5. **A user-addressed network without federation.** Sovereign nodes,
   client-mediated reads, no central authority, no shared database.

## The awe beats and where they land (the internal oracle)

The three awe scores (theory §1 internal oracle) in the operator's
priority order — each needs named beats in named sections. Targets:
logical awe ≥ 8 (the utmost), original work ≥ 8, importance ≥ 6
(calibrated). The outline's "why" per section is the external oracle;
this is the internal one.

| Score (priority) | The beats | Where they land |
|---|---|---|
| **Logical awe — the utmost.** The NP-looking system, the P-looking proof: tactically complex, and given the steps, verifiable in seconds | setup: the split · forcing move: the grant is a row, so the readable set is computable *before* any query runs · calculation: the set expression → the boundary CTE materialization → the five-step compile + round-trip · finish: the corollaries (revocation bound, cross-node re-run, 7.64 s → 363 ms) · blunder-and-refutation: the output filter plays the blunder (the `count(*)` attack), the wall is the refutation · the why-not-X chain: each obvious alternative fails in one checkable line (publicness as a flag → two sources of truth; a DB per user → no cross-author composition; JWKS/directory sync → the live cached `/certify`; a server relay → the confused-deputy cache) | §1 (setup), §2 (the expression, named), §4 (verified-not-registered as a visible step), §5 (materialization + compile + the blunder shown first), §8 Q1 (the conformance verifies the line), §8 Q3 (the finish) |
| **Original work — second.** That the work is original: the structural conjunction argument | five differentiators as a conjunction, each prior system forced to drop a corner (the table + the "why they can't" one-liners) · the deletions as evidence the conjunction held under pressure | §1 P3–P4 + Table 1, §7 (the four built-and-deleted surfaces), §9 (positioning — each paragraph ends with the gap) |
| **Importance — third, calibrated.** Real stakes, honest labor, no overspend | the stakes: the social graph is what makes a life's data valuable, and it's the part no platform lets you own · the labor: 958,824 added / 568,594 deleted · the payoff line: the permissions leave the building with the data | abstract (stakes + labor), §1 P2 (the labor), §10 (the payoff close) |

## Section by section

### Abstract — 0.15 pp — REWRITE
**What:** the tension (email's split) → the labor (the pinned numbers) →
the five claims, boldly → the proof (the tests that prove architectural /
business / scale claims) → the close ("your permissions leave the building
with your data").
**Why:** the industry-track reader gets the whole story in 150 words; the
numbers in the abstract are the "this is real" signal. The current
abstract is a mechanism list with zero numbers — an index, not a story.

### §1 Introduction — 1.0 pp — REWRITE
**Beats:**
1. Email's split — **KEEP** P1–P2 (the frame; "the payload crossed the
   boundary; the permissions did not" is the paper's best line, it stays).
2. **NEW — the labor:** a whole highly technical system, built and running:
   the pinned add/delete numbers; a deployed node; a social app, a game, a
   marketplace. The million lines appear here for the first time.
3. **NEW — the five differentiators**, one bold line each (the settled
   result of the quabbling).
4. **NEW — what this paper proves:** architectural / business / scale
   claims, one line each, each pointing at its evidence section.
5. **REWRITE — contributions:** what (the model) / how (the boundary +
   the generic node the app is defined on) / proof (connected evidence +
   measured cost), each with a so-what.
6. **KEEP, moved — Table 1** (capability comparison): it currently sits
   *between* "the permissions did not" and "the platform is deployed",
   interrupting the story; it lands after the claims, as the proof that
   prior work lives on the edges.
7. **NEW — the paper map:** one sentence per section + Figure 1 (which
   gains its section labels — the visual TOC).
**Why:** the intro sets the proof order and spends the labor number where
it buys the most credibility.

### §2 The Access Model — definitions and the theory — 1.5 pp — REWRITE
**Beats:**
- **NEW — definitions first:** principal; principal classes, nested
  (`anyone` ⊇ `authenticated` ⊇ `member`); group; service; role; grant
  row; operation; readable set. The reader owns the vocabulary before any
  claim uses it.
- **KEEP — two trust layers** (the app wall, the person wall).
- **KEEP — roles as per-service permission maps.**
- **KEEP, promoted — the set expression:**
  `effective(P, G) = grant(G, anyone) ∪ (P ∈ authenticated ? grant(G,
  authenticated) : ∅) ∪ (P ∈ member(G) ? grant(G, role(P)) : ∅)` —
  monotone across classes. This is the crown jewel; it gets labeled as the
  paper's central expression and everything after it builds on it.
- **KEEP — publicness is a grant, not a flag** (the "why not a visibility
  column" argument).
- **NEW — the invariant named:** I3 as a theorem statement (proved in §5
  and §8): every compiled query returns only documents in the reader's
  readable set; an empty readable set compiles to an empty service.
**Why:** the permission theory is what differentiator #2 actually is —
formalized. The draft buries it in prose; the new paper makes it the spine
the whole proof hangs on.

### §3 The Data Plane: one table per node — 1.0 pp — MOSTLY KEEP
**Beats:** the `documents` schema + `{service, body}` + "the
`collection_name` column *is* the service" (**KEEP**); updates are
inserts, deletes are tombstones (**KEEP**); why not a database per user
(**KEEP** — the why-not-the-alternative argument); data policy, not
privacy (**KEEP, re-voiced**: "the node is readable by design; access is
terms-controlled" stated as a stance, not hedged — this is the D41
positioning, bold).
**Why:** the data plane is what "all formats" means; it's short, clean,
and the why-not-DB-per-user argument is a reviewer-defense in advance.

### §4 A User-Addressed Network — 1.25 pp — MOSTLY KEEP
**Beats:** email's architecture generalized (**KEEP**); the linchpin —
verified, not registered (`/certify`: one cached answer per token, never a
grant) (**KEEP**); the boundary rule — the HTTP API and a verified token,
never the database; remote data is content, never control (**KEEP**); the
read model — client-side fan-out (**KEEP**, with Figure 2, the redrawn
federated-node figure: identical node internals, `/certify` the only
difference); domain aliases + public subscription continuity (**KEEP,
compressed**); implementation status (**REWRITE voice: scope as fact**).
**Why:** differentiator #5 and the cross-node half of #3 live here; it is
already close to proof-shaped and mostly needs the voice pass.

### §5 Enforcement at the Query Layer — 1.5 pp — KEEP + CONNECT
**Beats:** the wall, not the membrane (**KEEP**); why output-side
filtering is unsound (**KEEP** the SQL example — it's the attack the whole
section exists to prevent); redirecting the input: **CONNECT explicitly to
§2 — the boundary CTE is the SQL materialization of the readable set from
the set expression** (the place where the theory becomes SQL; make the
link visible, not implied); the five-step compile + round-trip (**KEEP**);
why policy lives above the engine (**KEEP** — the PostgreSQL RLS
comparison, with the matched-workload promise pointing to §8). **NEW —
Figure: the boundary** (two pipelines: the broken output filter vs the
boundary CTE).
**Why:** differentiator #4's enforcement half; this section is already the
most proof-like in the draft — it just needs the §2 connection made
explicit so the theorem and its materialization read as one argument.

### §6 Running the Platform — 1.25 pp — KEEP + 1 NEW
**Beats:** the killer-app hypothesis (**KEEP**); a frontend over the
shared node (**KEEP** the 46,285-line pin); **NEW — the social app defined
on generic primitives**: posts, comments, reactions, and profile as
documents in app-named services; the social graph as group rows; feeds and
search as app-written queries; media as the generic pipeline — plus
**Figure: the app as a lens** (the centerpiece figure the operator asked
for: "the functions are defined on generic web10 API stuff"); the feed as
a query (**KEEP**); multiple applications, one data plane (**KEEP** — the
game and the marketplace reading the social app's profiles with no node
change and no API agreement; the interop screenshots stay).
**Why:** differentiator #4 made visible, and the business claim
("a real app runs on the generic node") shown as architecture, not
asserted as adjectives.

### §7 Lessons from Running It — 1.0 pp — KEEP (the strongest section)
**Beats:** the node keeps resisting the killer app — four built-and-
deleted surfaces, each caught by the one-sentence test ("would a notes
app, a music app, or a shop use this?") (**KEEP** — the labor of
*deletion* made visible); the self-healing schema raced its own readers
(**KEEP**); what the shared columnar table costs, day to day (**KEEP**);
the first measurement pointed at the access layer, not the database
(**KEEP**).
**Why:** the industry track asks what running it taught that designing it
didn't — this section answers that better than anything else in the
draft. It also resolves the labor story: the 568,594 deleted lines are not
waste, they are the discipline, and this section is where the reader sees
it.

### §8 Evaluation — 2.0 pp — REWRITE as Q&A
Each subsection: question → setup → numbers → the number that hurts, with
its tradeoff argument.
- **Q1 — Architectural: does the boundary hold?** The conformance /
  permission matrix: the attacks replayed and denied (exploit red →
  denied green), across the read/query surface; the I3 negative tests.
  *(NEW framing; the evidence lives in the security record — trace each
  case to it before it's printed.)*
- **Q2 — Business: does a real app run on the generic node?** The
  connected interop (game + marketplace, browser consent, cross-author
  controls, no node change) and the domain-portability prototype (public
  continuity after the provider goes dark; private grants correctly stay
  behind). *(KEEP the evidence; REWRITE as the question.)*
- **Q3 — Scale: where does the cost live?** The K1000 fan-out table
  (7.64 s → 363 ms median, the one-group counterweight), the metadata
  fan-out, the operating point. *(KEEP the numbers.)*
- **Q4 — Cost of the alternative: what does the shared table cost vs.
  per-user isolation?** The matched RLS baseline — **OPEN (E3)**; state
  it as the committed follow-up with its design, scope as fact.
**Why:** F3's evaluation is Q&A with named baselines and honest caveats —
that's the benchmark. The current draft's metric list gets reorganized
into the four claims the paper actually made.

### §9 Related Work — 0.75 pp — REWRITE as positioning
Three paragraphs, each ending with the gap: (1) federated social —
Mastodon/Bluesky/ActivityPub: content federation, platform-defined
access; (2) user-owned data — Solid WAC/ACP and personal data stores:
ownership, resource-centric access, cross-Pod cost depends on deployment;
(3) enforcement on a shared store — RLS and multi-tenant databases:
engine-side policy; we put the boundary above the engine and measure why
(pointing at §8 Q4). The verified 18-citation bibliography carries it;
the gap check (`../related-work.md`) must be **YES** before this freezes.
**Why:** related work is positioning, not surveying — every paragraph ends
with "here's what web10 has that they don't".

### §10 Conclusion — 0.5 pp — REWRITE
**Beats:** close the email frame (**KEEP** — "a user's permissions, not
just their data, leave the building with them" is the payoff of P1, it
stays); **NEW — the labor resolution:** the generic core was earned, in
568,594 lines of deletion — the deletions are the evidence of the
discipline; forward scope as fact (federation beyond the connected slice,
the matched baseline, revocation-latency bounds — **KEEP, re-voiced**).
**Why:** the proof closes the way it opened: the split, the labor, the
earned generic core.

## The figures (they follow this outline)

| # | Where | What | Status |
|---|---|---|---|
| 1 | §1 | System overview, **gains section labels (§2, §4, §5, …)** — the visual TOC (the F3 move) | existing TikZ, label pass |
| 2 | §4 | Federated node: identical A/B internals, `/certify` the only difference | **done** (4.9.1, HTML source committed) |
| 3 | §6 | The social app as a lens over the generic primitives — surfaces → app-defined expressions → one generic node + "what the node refuses to learn" callout | planned (fig:app) |
| 4 | §5 | The boundary: broken output-filter pipeline vs boundary-CTE pipeline — "a wall, not a membrane" | planned (fig:boundary) |
| 5 | §6 | Interop: one social-written profile, two application views (snake/marketplace) | existing screenshots |
| 6 | §8 | Domain portability: same website, another public account (before/after) | existing screenshots |
| 7 | §6 | Groups UI screenshot | existing; **cut candidate** if the 12-page budget bites |
| — | §2/§3 | Candidates: the two trust layers; the data model (`{service, body}`, versions, tombstones) | not started |

## Page allocation (12 body pages)

Abstract 0.15 · §1 1.0 · §2 1.5 · §3 1.0 · §4 1.25 · §5 1.5 · §6 1.25 ·
§7 1.0 · §8 2.0 · §9 0.75 · §10 0.5 = **12.0** (figures are wide/short
full-width floats; the §8 Q&A absorbs the current metric-list slack).

## The diff against the second draft (what the operator is approving)

- **NEW:** the labor numbers in the intro; the five differentiators
  stated boldly; definitions-first §2; I3 named as a theorem; §2→§5
  connection (set expression → boundary CTE); the app-as-a-lens figure +
  beat; the Q&A evaluation; the visual-TOC labels on Figure 1; the labor
  resolution in the conclusion.
- **KEPT:** the email frame; the set expression (promoted); the wall
  argument; §7 in full; Table 1 (moved); all evidence tables, numbers,
  bibliography, artifact pins.
- **CUT/COMPRESSED:** the hedge sentences (the voice pass); domain-alias
  prose (compressed); the groups UI figure (if the budget bites).
- **MOVED:** Table 1 later in §1; the five differentiators from the
  scattered prose into one bold list.

**Open questions** (the theory doc carries them): the labor range to
print · deployment numbers (597/593 snapshot vs. waiting on E1) ·
authorship · in-place vs. a third-draft folder (default: in place).
