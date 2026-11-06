# Fourth-draft outline (clean resynthesis) — the beats → the figures → the paper

The manuscript is the expansion of shot 0 told through the figure set —
the "pictographic story" — written fresh into `research/fourth-draft/`
on 06.11.2026 because the third draft "inherited the junk from the
other papers." What this draft carries from the records: the beats, the
figures (the 4.10.40 padded rasters, all full-width), the evidence as
fact, the pinned artifact links + the bibliography. What it does not
carry: anything untraceable to a beat or a figure. Page budget: off —
15 pages at this build.

## The entry (the fix this round exists for)

The paper opens on the stakes, not on email: "What makes your data worth
owning is the graph around it." Then the reader's own decentralization
world, in the reader's associations — Solid decentralized the store,
Mastodon/Bluesky decentralized the transport and provider choice, none
of them the access layer. The email frame was never shot 0's entry (beat
11 is only the SPF/DKIM `/certify` parallel); it now enters in §6 as the
mechanism parallel and closes in §10. The abstract is the stakes-first
benefits version.

## The story, section by section

| Section | The job ("this section kills the doubt that …") | Beats | Figures |
|---|---|---|---|
| **Abstract** | the whole paper in ~150 words, benefit-first, opened on the stakes | the benefits: the rules are your data · per-service grants finer than OAuth 2.0 · new query not new backend · the audience travels with the domain · no cut, terms not leverage · the scale anchor (7.64 s → 363 ms) | — |
| **§1 The split every platform inherits** | the stakes are real, the reader's decentralization world left the access layer behind, and a system that closes the split exists and runs | 1 (bespoke APIs) + the stakes line, 2 (the generic node), 3 (the permission model belongs to the user), 5 (no new part — the combination), 8 (three apps interoperate) | **Figure 1 — `fig-app-arch`** (the system: the data layer in the browser, the thin generic node, the two stores, the messages on the wire) |
| **§2 The node stays generic; the rules are your data** | the node really has no app concept, and the readable set is computable before any query runs (the forcing move) | 2, 3 (+ the four built-and-deleted surfaces by reference to §8) | — |
| **§3 One store at the bottom** | one shared table is the right limit of the multi-tenant spectrum, and it is not a privacy failure | 9 (the ClickHouse bedrock), 10 (the Solid fork: data policy, not privacy; the node pools millions; discover is an ordinary query) | **Figure 2 — `fig-composition`** (web10 vs Solid) |
| **§4 The boundary: your query, compiled before it runs** | the boundary is a wall, not a membrane — the readable set is compiled in, not filtered out | 4 (the developer writes and tunes; the platform guarantees the boundary, not the performance), 6 (RLS was the OLTP-era answer; on a columnar store the boundary moves to the query) | **Figure 3 — `fig-query-engine`** (one feed query, browser → node → store) |
| **§5 Extending the platform costs a role and a policy** | a real app runs on the generic node, and other apps step into its data without a node change | 7 (a role and a policy — OAuth 2.0's job, finer), 8 (the three apps), + the killer-app hypothesis + the 46,285-line pinned fact | **Figure 4 — `fig-groups`** (the social surface) · **Figure 5 — `fig-platforms`** (web10 vs Mastodon / Bluesky) · **Figure 6 — the interop captures** (one profile, two apps) |
| **§6 The network: verified, not registered** | the policy reaches across the network without registration, and an address outlives an account | 11 (`/certify` = email's sender check: a handshake, not a registry — the email frame ENTERS here), 12 (the domain the user owns; the TXT record untouchable to the node owner) | **Figure 7 — `fig-feed`** (the two-node /certify read) · **Figure 8 — `fig-audience-portability`** (the DNS flip) |
| **§7 The money: the free web should have ads** | the free web has ads on web10, the creator keeps their cut, and the nodes compete on terms | the monetization beat (drafted 4.10.34, carried under the blanket figures call — formal pass open) | **Figure 9 — `fig-monetization`** (the ad rail) · **Figure 10 — `fig-node-market`** (the competitive node economy: terms, not leverage) |
| **§8 Lessons from running it** | the generic core was earned, not designed (the industry track's job) | — (the four built-and-deleted surfaces · the schema race · the shared-table operating envelope) | — |
| **§9 The evidence (Q&A)** | the claims are connected, bounded, and named — the scope stated as fact | the scale claim (the cost lives in the access layer, not the database; the knee at K = 1) · the interop/federation/domain claims · the operating point | **Figure 11 — `fig-k1000-curve`** (the fan-out trial, as a curve — every number the curve carries is stated in the finding prose) |
| **§10 No new part, one combination** | each prior system drops a corner of the conjunction — and the market the data plane makes | 5 (the combination), 10 (the Solid fork), 7 (the interop fork) | the Figure 2 + Figure 5 pointers |
| **§11 Conclusion** | the stakes close: the graph was the part no platform let you keep; the email frame closes | — | — |

## What the resynthesis cut (the third-draft junk)

- **The email door** — out of the entry; the email frame now enters in
  §6 (`/certify` = email's sender check) and closes in §11 ("Email let
  the data leave the building. web10 lets the permissions leave it
  too."). Voice rule 10 re-read: enter after the stakes, close in the
  conclusion.
- **The formal apparatus** — the two trust-wall table, the
  principal-classes table, the effective-permission display
  expression, the content-gate caveats: the same facts, as prose.
- **The implementation-status hedges** — the "trusted implementation",
  "isolation rule and regression coverage", "implementation boundary",
  "implementation status and deployment scope" subsections: out; the
  evidence section states scope as fact where it matters.
- **The two definitional tables** — media spectrum, interop apps: out;
  the surfaces are one sentence in §5, the interop story is Figure 6 +
  the body.
- **The frontend logistics** — the SPA/Dockerfile/link-preview-renderer
  paragraphs: out; the 46,285-lines/141-files pinned fact stays (it is
  on the Figure 1 strip; asserted in §5).
- **The heavy related work** — the WAC/ACP internals, the AWS IAM
  paragraph, the full multi-tenant literature: out; §10 is the compact
  "no new part, one combination" (each paragraph ends on the gap).

Kept on purpose: the evidence (every number, host, seed, sample count,
artifact pin — `craft/evidence.md`), the lessons (§8), the pinned
artifact links + the 18-citation bibliography, and all 11 figures at
full width on the 4.10.40 padded rasters.

## Open items

1. **The operator's read** of the 15 pages — the entry first.
2. **Beat 1's stakes line** re-locks shot 0 if it lands (the locked
   shot 0 in the frozen second-draft record is not amended in this
   round; the compression test should return the stakes line as beat 1).
3. **Beat 13 (monetization)** is now carried in the body (§7) under the
   blanket "all the figures" call — the formal pass is open.
4. **The three first-shot figures** (monetization, audience-
   portability, k1000-curve) + the rent number ride the blanket call —
   open to review; a re-shot is a re-render + caption check, the prose
   stands.

## Self-score against the oracles (before firing, per the shot rules)

- **Compression test:** re-compress §1–§11 → the 12 beats + the stakes
  line + the monetization beat come back (each is named in its section's
  row above). ✓ as written — final call is the operator's re-read.
- **Logical awe:** the forcing move is §2's last move (the readable set
  computable before any query runs); the blunder-and-refutation is §4's
  first (the count(*) aggregate); the why-not-X chain is visible
  (publicness-as-flag §2, DB-per-user §3, the remote()/cluster()
  rejection §6, RLS §4).
- **Original work:** the conjunction argument is §1's "no part of it is
  new … what no prior system we compare carries is the conjunction" +
  §10's corners; scoped to the compared systems (the gap check stays
  OPEN until the sources are pinned).
- **Importance:** the stakes up front (§1 P1, the abstract's first
  sentence), the running system calibrated (§5's 46,285-line pinned
  fact + §9.5's operating point); no line count of the project in the
  body (4.10.40 + voice rule 2 — the stat stays pinned in
  `ops/numbers.md`).
