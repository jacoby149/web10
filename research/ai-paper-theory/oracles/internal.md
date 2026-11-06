# The internal oracle — the three awe scores

In the operator's priority order (04.11.2026). The beats for each live
in `../../second-draft/OUTLINE.md` ("The awe beats and where they
land"); this file defines the scores and their checks.

## 1. Logical awe — the utmost important (≥ 8, hard gate)

The reader sees logic that is *really good but tactically complex* —
and, **given the steps, verifiable**. The NP-with-P-verifiability feel:
the system looks intractable (a decentralized, user-managed, cross-node,
app-defined access system over a shared columnar store — where would the
boundary even be?), and then the paper hands over the steps: the grant
is a row; `effective(P, G)` is a union of three terms; the service name
materializes as the reader-filtered CTE; the query compiles in five
checkable moves; the attacks replay and are denied. Verification is P
once the steps are given.

**Awe is the gap between the NP-looking system and the P-looking proof,
closed by the steps.**

The devices that produce it:

- **The combination** — setup (the split) → forcing move (the theorem:
  the grant is a row, so the readable set is computable *before* any
  query runs) → calculation (the set expression → the boundary CTE →
  the five-step compile + round-trip) → finish (the corollaries: the
  revocation bound, the cross-node re-run, 7.64 s → 363 ms).
- **Blunder-and-refutation** — the paper shows the obvious design
  playing the blunder (output filter + the `count(*)` attack), then the
  refutation (the wall) — so the boundary lands as a tactic, not a
  specification detail.
- **The why-not-X chain** — each obvious alternative fails in one
  checkable line (publicness as a flag → two sources of truth; a DB per
  user → no cross-author composition; JWKS/directory sync → the live
  cached `/certify`; a server relay → the confused-deputy cache). Each
  why-not-X is a *visible step in the verification*, not a flourish.

*Check: can a reviewer replay the theorem from definition to corollary
without a single "but how?" — and does the replay feel like watching a
complex calculation verify in seconds?*

## 2. Original work ("never been done before") — second (≥ 8, hard gate)

That the work is *original*. Structural, not survey: the five
differentiators are a **conjunction**, and each prior system is forced
to drop at least one corner — email drops the access vocabulary, the
federated socials drop user-managed access, Solid drops the uniform
service-scoped grant (resource-centric, cross-Pod cost depends on
deployment), the lakehouse drops ownership. Table 1 + the related-work
positioning show the edges; the deletions (four app-specific surfaces
built and removed under pressure) show the conjunction held where it
was tempting to break it.

*Check: does the reviewer conclude the work is original — "I see why
nobody else has this combination"?* Until the gap check is YES, the
claim is scoped to the compared systems and stated as fact — no
"first-ever" language printed on an open gap.

## 3. Importance — third, calibrated (≥ 6, no overspend)

"Why is this important, big picture?" Real stakes (the social graph is
what makes a life's data valuable, and it's the part no platform lets
you own) and a deployed, running system. The labor count is *not* a
beat — no one cares how many lines we wrote; what matters is what the
system does and that it runs. The operator's calibration: research is
often not that important in the grand sense, and the conference frames
the importance — so a modest, honest beat is enough. **Don't overspend
the page budget here.**

*Check: the stakes and the running system are up front and credible —
that's all this score requires.*

## The retired score

The **genius score was retired** ("we can get rid of that, that is
almost too vague"). Its payload survives as technique: the why-not-X
chain and the "ohhh moment" framing feed logical awe (visible
verification steps) and original work (corners the conjunction holds).
