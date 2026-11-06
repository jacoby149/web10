# Third-draft outline (resynthesized) — the beats → the figures → the paper

The manuscript is the expansion of shot 0 told through the figure set —
the "pictographic story" (operator, 05.11.2026). No second-draft
structure was inherited: its weak artifacts (the capability table, the
TikZ overview, the domain captures, the fan-out table) are out, each
replaced by the figure that makes its point. Page budget: off
("i dont care about paper length") — 20 pages at this build (4.10.40:
the feed + groups figures went full-width), complete over concise. The
beats are the content checklist (voice rule 16: the body says them
naturally); this map is the proof the checklist was carried.

## The story, section by section

| Section | The job ("this section kills the doubt that …") | Beats | Figures |
|---|---|---|---|
| **Abstract** | the whole paper in ~150 words, benefit-first (4.10.40 — the operator's rewrite call; the shot-4 reconstruction is out) | the benefits: the rules are your data · per-service grants finer than OAuth 2.0 · new query not new backend · the audience travels with the domain · no cut, terms not leverage · the scale anchor (7.64 s → 363 ms) | — |
| **§1 Introduction** | the split is real, and a system that closes it exists and runs | 1 (bespoke APIs), 2 (the generic node), 3 (the permission model belongs to the user), 8 (three apps interoperate) | **Figure 1 — `fig-app-arch`** (the system: the data layer in the browser, the thin generic node, the two stores, the messages on the wire) |
| **§2 The Access Model** | the access rules really are the user's data, and the readable set is computable before any query runs (the forcing move) | 3 | — (the set expression, the two trust layers, publicness as a grant) |
| **§3 The Data Plane** | one shared table is the right limit of the multi-tenant spectrum, and it is not a privacy failure | 9 (the ClickHouse bedrock), 10 (the Solid fork: data policy, not privacy; the node pools millions of users; discover is an ordinary query) | **Figure 2 — `fig-composition`** (web10 vs Solid) |
| **§4 A User-Addressed Network** | the policy reaches across the network without registration, and an address outlives an account | 11 (/certify = email's sender check: a handshake, not a registry), 12 (the domain the user owns; the TXT record untouchable to the node owner) | **Figure 3 — `fig-feed`** (the two-node /certify read path; full-width since 4.10.40) · **Figure 4 — `fig-audience-portability`** (the DNS flip) |
| **§5 Enforcement at the Query Layer** | the boundary is a wall, not a membrane — and the readable set is compiled in, not filtered out | 4 (the developer writes and tunes; the platform guarantees the boundary, not the performance), 6 (RLS was the OLTP-era answer; on a columnar store the boundary moves to the query) | **Figure 5 — `fig-query-engine`** (one feed query, browser → node → store) |
| **§6 Running the Platform** | a real app runs on the generic node, other apps step into its data, and the money flows the creator's way | 7 (extending is a role and a policy — OAuth 2.0's job, finer), 8 (the three apps), + the monetization beat (the free web should have ads; the creator keeps 100%, no payment processed; the node as media company) | **Figure 6 — `fig-groups`** (full-width since 4.10.40) · **Figure 7 — `fig-platforms`** (web10 vs Mastodon / Bluesky) · **Figure 8 — the interop captures** (one profile, two apps) · **Figure 9 — `fig-monetization`** (the ad rail) |
| **§7 Lessons from Running It** | the generic core was earned, not designed (the labor resolution: the four built-and-deleted surfaces — the line count is out of the body since 4.10.40, pinned in `ops/numbers.md`) | — | — |
| **§8 The Evidence (Q&A)** | the claims are connected, bounded, and named | the scale claim (the cost lives in the access layer, not the database; the knee at K = 1) | **Figure 10 — `fig-k1000-curve`** (the fan-out trial, as a curve — the table is out; every number the table carried is stated in the finding prose) |
| **§9 Related Work** | each prior system drops a corner of the conjunction — and the market the data plane makes | 5 (the combination, no new parts) | **Figure 11 — `fig-node-market`** (the competitive node economy: the competition is on terms, not on leverage) |
| **§10 Conclusion** | the email frame closes: the permissions leave the building with the data | — | — |

## What the resynthesis cut (the second-draft artifacts)

- **Table 1 (capability comparison)** — out; the two VS figures + §9's
  positioning + §1's five-properties list carry the comparison.
- **Figure 1 (TikZ system overview)** — out; `fig-app-arch` is the §1
  system figure and the paper-map paragraph carries the section labels.
- **The domain before/after captures** — out of the paper;
  `fig-audience-portability` carries the mechanism, and the exact
  captures / authenticated hookup / 375px evidence are named as remaining
  in the prototype artifact.
- **Table 4 (fan-out)** — out; the curve + the finding prose carry every
  printed number (the C-variant separation, the p95s, the direct-scan
  range, the setup, the single-trial scope).

Kept on purpose: the two definitional/evidence tables the story needs
(media spectrum, interop apps), the interop captures (connected-evidence
receipts), and the verified trial prose (facts from the records, not
draft gravity — `craft/evidence.md`).

## Open items

1. ~~**The abstract** was the shot-4 spec reconstruction — the operator's
   re-pass.~~ **RESOLVED 4.10.40**: the operator's re-pass came ("i find
   the abstract just hard to read … shorter and get to the essence,
   summarize the benefits of web10, doesnt have to totally follow shot
   0") and the abstract was rewritten benefit-first (~150 words). The
   shot-4 reconstruction is retired; the new abstract is its own thing.
2. **The three first-shot figures** (monetization, audience-portability,
   k1000-curve) + the monetization beat ride the "all the figures done"
   call — open to review; a re-shot is a re-render + caption check, the
   prose stands.
3. **The rent number** (1M subs / 300k delivered) is now in §9's body —
   flag if not paper-ready.

## Self-score against the oracles (before firing, per the shot rules)

- **Compression test:** re-compress §1–§10 → the 12 beats come back
  (each is named in its section's job row above; the monetization beat in
  §6/§9). ✓ as written — final call is the operator's re-read.
- **Logical awe:** the forcing move is §2's last move (the readable set
  computable before any query runs); the blunder-and-refutation is §5's
  first (the count(*) aggregate); the why-not-X chain is visible
  (publicness-as-flag §2, DB-per-user §3, remote()/cluster() §4, RLS §5).
- **Original work:** the conjunction argument is §1's "no prior system we
  compare carries the conjunction" + §9's corners; scoped to the compared
  systems (the gap check stays OPEN until the sources are pinned).
- **Importance:** the stakes + the running system up front (§1 P2–P3),
  calibrated; no labor fanfare — and no line count in the body (4.10.40:
  the operator's "dropping the lines of code written i dont like" +
  voice rule 2; the stat stays pinned in `ops/numbers.md`).
