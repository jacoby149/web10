# The attack surface: failure modes and countermeasures

The named defenses. If a failure mode is not in this table, it is not
being managed — add it here when you see it.

| Attack / failure | Countermeasure | Where |
|---|---|---|
| "An engineering blog, not a contribution" | The theorem + lemmas + conformance-as-proof; the wall-not-membrane and verified-not-registered generalizations | `../spine/proof.md`; outline §2/§5 |
| "Not novel — Solid/ActivityPub/IAM did this" | Five differentiators + Table 1 (edges) + related-work positioning + gap check YES before freeze; the structural conjunction argument (each prior system drops a corner) | `../spine/differentiators.md`; outline §1/§9 |
| "Where's the scale?" (597 accounts is small) | K1000 attributable measurement + honest operating point + the fan-out→batching lesson; **the scale framing is decided up front** (open question), not improvised at review time | `../craft/evidence.md`; `../../second-draft/kb/experiments.md` #5/#6 |
| "Your federation isn't production" | Scope as fact: the connected slice is verified under named conditions; production keys/phases named in forward scope | outline §4/§8 |
| "One app is not generality" | Three apps (social + game + marketplace), no node change, no API agreement — stated as the business claim | `../craft/evidence.md`; `../../second-draft/kb/experiments.md` #2 |
| "Your numbers don't reproduce" | Pinned numbers with exact commands + artifact revisions + the check-paper harness | `numbers.md` |
| "Hedged into the ground" | No-hedging rule; scope-as-fact; cut-don't-weaken | `../craft/voice.md` rules 4–5 |
| **"Rigorous but flat — passes the five questions, fails the awe"** | **The two-oracle rule: the three awe scores at target (logical awe ≥ 8 — the utmost, original ≥ 8, importance ≥ 6 calibrated), the theorem replayable as a combination; the operator's read is the final scoring** | `../oracles/`, `../method/`, `checklist.md` |
| "Page overrun at the freeze" | Outline allocation sums to 12.0; Tectonic measured after every section; the cut list pre-decided | `rebuild.md`; the outline |
| "Single-author credibility" | Open question: second author vs. lean on deployment evidence | `rebuild.md` (the open questions) |
| "Figures drift from the body" | The accuracy invariant + the KB gate (figures only via kb/diagrams.md) + the diagram shots gate | `../craft/figures.md`; `../method/` |
| "The evaluation is a metric list" | Q&A structure; named baselines; numbers that hurt in the results | `../craft/evidence.md`; outline §8 |
| "The motivation is a value argument" (F3 §3.2) | The labor numbers + the capability table + the K1000 counterintuitive result *are* the empirical motivation; the production snapshot is stated as fact | `../spine/README.md` (the journey), `../craft/evidence.md` |
| "Too rich — developers can barely figure out how to use a query engine / optimize queries" | (1) Correctness is defused by construction: the boundary guarantees the reader's readable set on *any* query the app writes — a bad query is slow, never unsafe, so handing over the query engine risks performance, not data. (2) Performance is app-owned (the beat-4 division of labor) — and writing/optimizing columnar SQL is exactly the skill coding models have commoditized: the timing argument ("why now"), framed as a claim about the era, **not** a measured AI outcome. (3) Proof a real app carries it: the social app is a 46,285-line query app — the feed ranked in SQL (scoring, joins, keyset cursors) | outline §6 (killer app) + §10 (why now); shot 0 beat 4 already says the division of labor |
