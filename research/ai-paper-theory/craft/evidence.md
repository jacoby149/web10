# The evidence: experiments as proof

The evaluation is not a metric list; it is the proof of the claims,
organized as Q&A (each subsection answers a named question — the F3
pattern). Three claim classes, each with its experiments (the full
evidence map — what each experiment is, why it was important, what it
established, where the evidence lives, what's open — is
`../../second-draft/kb/experiments.md`):

- **Architectural claims** — does the boundary hold? The conformance /
  permission matrix; the I3 negative tests (attacks replayed, denied);
  the two-node IAM experiment (the theorem re-run on a foreign store).
- **Business claims** — does a real app run on the generic node? The
  connected interop (game + marketplace, browser consent, no node
  change, no API agreement); the domain portability prototype (the
  address outlives the account; the private grants correctly stay
  behind).
- **Scale claims** — where does the cost live? The K100/K1000 fan-out
  (7.64 s → 363 ms median batched at 1,000 candidate groups; the
  one-group counterweight); the operating point (the production
  snapshot, stated as fact).

## The gates

- An experiment enters the paper **only through
  `../../second-draft/kb/experiments.md`** — the "why it was important"
  line (which claim it proves) is written before the evidence is placed
  in prose. An experiment that proves none of the paper's claims stays
  in the repo as engineering; it is not in the paper.
- **The number that hurts is reported in the results, not the
  discussion** — with its tradeoff argument (the F3 honest-caveat
  pattern). The one-group counterweight belongs in §8 next to 363 ms.
- Baselines are named with versions and configs. The matched RLS
  baseline (E3) is open; it is stated as the committed follow-up *with
  its design*, scope as fact — not apologized for.
- Every printed number traces to a pinned artifact or a verified
  experiment record (`../ops/numbers.md`). No number from a previous
  draft, ever.
