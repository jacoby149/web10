# The proof — the paper's skeleton

"Reads like a proof" means: definitions before use, claims as
statements, lemmas that step to a theorem, evidence as the proof. The
set-theory of permissions — already in the second draft (§2 "Principal
classes and effective permissions") — is the crown jewel and the
central theorem.

## The chain

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
- **The theorem (I3).** Every query compiled through the boundary
  returns only documents in the reader's readable set; an empty readable
  set compiles to an empty service.
- **The proof of the theorem.** The conformance suite: the permission
  matrix, the attacks replayed and denied (exploit red → denied green),
  and the boundary's five-step compile (parse, check kind, walk,
  inject, round-trip).
- **Corollaries.** Revocation is a tombstone on metadata rows, bounded
  by database visibility + in-flight requests + remaining capability
  lifetime — each term measured or bounded where the paper measures it.
  Cross-node reads: the serving node re-runs the same theorem against
  its own store after one cached `/certify`.

## Presented as the combination (logical awe)

The setup is the split (§1 of the paper); the forcing move is the
expression — the grant is a row, so the readable set is computable
before any query runs; the calculation is the materialization + the
five-step compile + the round-trip; the finish is the corollaries. The
conformance suite is the engine verifying the line. The output-filter
design is the *blunder* the combination refutes — show it playing the
blunder first (with the `count(*)` attack), so the wall lands as the
refutation, not as a specification detail.

The NP/P feel: the system looks intractable; the proof is five checkable
moves. A reader who can follow the union can follow the system.

No paragraph asserts what the reader cannot derive from the previous
paragraphs. Where a leap appears, that is where the missing definition
or lemma goes.
