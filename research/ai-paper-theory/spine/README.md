# The spine — what the paper argues

The paper is the project's story, told with verified evidence. The story
is: **the generic core was earned, not designed.** The spine is three
acts; the section map is what makes it proof-shaped.

## The journey (the meta-story)

1. **We built a whole highly technical system.** The node (one columnar
   store, a user-addressed permission vocabulary, a query boundary, a
   media pipeline, federation), the SDK, the social app. A million lines
   of labor. *(Q1.)*
2. **We wrote a draft paper on what we thought made it different.** The
   bones, the references — and some actual research, to find the
   similar prior work.
3. **We quabbled.** No, this isn't what's different. That isn't either.
   It is *these things particularly* that make this different. The
   differentiators got settled (`differentiators.md`). *(Q4.)*
4. **We proved it performed and did what it promised.** Tests that
   prove the architectural claims (the boundary holds: attacks replayed
   and denied), the business claims (the killer app runs; a game and a
   marketplace reuse its data with no node change), and the scale
   claims (K1000 fan-out: the cost lives in the access layer, not the
   database). *(Q3 — `../craft/evidence.md`.)*
5. **Now we are here.** We step back and construct the real paper —
   willing to do as much work as doing it all over again. The labor was
   the code; the writing is the cheap part.

The paper does not footnote this journey. It *is* this journey, told in
proof order: the claim, the difference, the theorem, the evidence, the
cost.

## How the spine maps to the sections

| Spine element | Section |
|---|---|
| the tension (the split) | the abstract + §1 P1–P2 (the email frame, opened) |
| the labor (the pinned numbers) | §1 P2 — up front, not in §7 |
| the five differentiators, stated boldly | §1 P3 + Table 1 |
| what the paper proves (architectural / business / scale) | §1 P4 → §8 Q1–Q4 |
| the theorem (I3): definitions + expression | §2 (definitions first; the set expression named) |
| the materialization: boundary CTE = the readable set in SQL | §5 (the explicit §2→§5 connection) |
| the proof of the theorem: conformance, attacks replayed and denied | §8 Q1 |
| the corollaries: revocation bound, cross-node re-run | §4 + §8 Q2 |
| the business proof: three apps, no node change, no API agreement | §6 + §8 Q2 |
| the scale proof: 7.64 s → 363 ms, the one-group counterweight | §8 Q3 + §7 |
| the cost of the alternative (matched RLS baseline) | §8 Q4 (open, with its design stated) |
| the labor resolution: the generic core was earned in 568,594 lines of deletion | §7 (the four built-and-deleted surfaces) + §10 |
| the payoff line: the permissions leave the building with the data | §10 (the email frame, closed) |

## The files

- `differentiators.md` — the five, each tied to the experiment that
  proves it.
- `proof.md` — the proof skeleton: definitions → expression →
  materialization → theorem → proof → corollaries; presented as the
  combination.
