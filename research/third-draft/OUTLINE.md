# Third-draft outline — the 12 beats → the sections

The outline shot, done: where each locked shot-0 beat lives in the
manuscript, and where each figure sits. The beats are the content
checklist (voice rule 16 — the body says them naturally, not as a
pitch); this map is the proof the checklist was carried. The page
budget is off (operator, 05.11.2026) — complete over concise; 20 pages
at the first build.

## The beats, and where they land

| Beat | The beat (shot 0, naturalized) | Where it lands |
|---|---|---|
| 1 | Bespoke-APIs convention: every social platform builds feed/follow/like as platform-owned endpoints | §1 P2 (the split) |
| 2 | The completely generic node: data RW + identity/access configuration, executed every time the data is used | §1 P3, §3 opener, Figure 4's node frame |
| 3 | The access rules are the user's own data, in the very store they protect — the permission model belongs to the user | §2 lead-in, §2 (publicness is a grant), the abstract |
| 4 | AST-protected queries the developer writes and tunes — the platform guarantees the boundary, not the performance | §5 opener + Figure 3, the five-step compile |
| 5 | No new parts — the contribution is the combination on one shared columnar store | §1 ("no prior system we compare carries the conjunction"), §9 opener |
| 6 | RLS was the OLTP-era answer; on a columnar store the boundary moves to the query, the readable set compiled in before any data moves | §5 "why policy lives above the engine", §1 property 4 |
| 7 | Extending is a role and a policy — OAuth 2.0's job, finer (the grant names the service, group, operation) | §6 "multiple applications", Figure 7 |
| 8 | Three apps already interoperate: the social app, the snake game, the marketplace | §1 P3 + P5, §6 + §8 Q1 (the connected evidence), Table 3 |
| 9 | ClickHouse at the bottom: real-time analytics over billions of rows, in a way that scales | §3 opener (the engine named with its class), the abstract |
| 10 | Solid = data-sovereignty, web10 = reach + two-sided ownership; readable-on-the-node buys the scale + auditability; what the user owns is the policy, not the secrecy; a node pools millions of users so discover is an ordinary query — Solid's pods cannot compose across | §3 "why not a database per user" + Figure 2, §3 "data policy, not privacy", §9 Solid paragraph |
| 11 | /certify = email's sender check (SPF/DKIM): one cached handshake, verifies and grants nothing — a handshake, not a registry; every node re-checks its own rules on every read | §4.2 the linchpin |
| 12 | The address is a domain the user owns (jacobhoffman.xyz); the TXT record is untouchable to the node owner; the follows are the followers' own data, bound to the domain — no platform holds a ban switch | §4.4 domain aliases, §8 Q3 (Figure 11), §9 market paragraph |
| +monetization (the 4.10.34 beat, riding this round's blanket pass) | The free web should have ads; the alternatives ship no mechanism; the creator's layer dense, the node's sparse, non-steal; the creator keeps 100%, no payment processed; a new ad surface is a new query | §6.5 the ad rail (Figure 9), §9 market paragraph |

## The figures, and where they sit

| # (manuscript) | Figure | Section |
|---|---|---|
| 1 | System overview (TikZ — the labeled visual ToC, 4.10.37) | §1 |
| 2 | The composition fork: web10 vs Solid (`fig-composition`) | §3 |
| 3 | Reading a social feed on web10 (`fig-query-engine`) | §5 |
| 4 | The web10-social application and its node (`fig-app-arch`) | §6 |
| 5 | Pulling the web10 feed across nodes (`fig-feed`) | §6 |
| 6 | A group — the groups UI capture (`fig-groups`) | §6 |
| 7 | The interoperability fork: web10 vs Mastodon / Bluesky (`fig-platforms`) | §6 |
| 8 | One social-written profile, two application views (interop captures) | §6 |
| 9 | How money flows on web10: the ad rail (`fig-monetization`) | §6 |
| 10 | Domain portability, before/after (captures) | §8 |
| 11 | The audience travels with the domain (`fig-audience-portability`) | §8 |
| 12 | Where the access layer's cost lives (`fig-k1000-curve`, matplotlib) | §8 |
| 13 | The competitive node economy (`fig-node-market`) | §9 |

## The sections (20 pages at the first build)

1. **Introduction** — the split · the labor (958,824 / 568,594) · the
   five properties · the evidence · the contributions · Table 1 · the
   paper map + Figure 1.
2. **The Access Model** — vocabulary · two trust layers · roles as
   per-service maps · principal classes + the set expression ·
   publicness is a grant.
3. **The Data Plane** — the schema · updates-as-inserts /
   deletes-as-tombstones · why not a database per user (+ Figure 2, the
   Solid fork) · data policy, not privacy.
4. **A User-Addressed Network** — email generalized · verified not
   registered (+ the SPF/DKIM parallel) · the boundary rule · the
   read model (client-side fan-out) · domain aliases (+ the concrete
   re-point) · implementation status.
5. **Enforcement at the Query Layer** — the wall not the membrane ·
   why output-side filtering is unsound · the input redirect (+
   Figure 3) · the five-step compile · why policy lives above the
   engine · the metadata fan-out cost structure · isolation rule ·
   media capabilities · the implementation boundary.
6. **Running the Platform** — the killer app (+ Figure 4) · the media
   spectrum · the frontend over the shared node (the 46,285-line pin) ·
   the feed as a query · multiple applications, one data plane (+
   Figure 7, Table 3, the interop query + Figure 8) · **the ad rail
   (+ Figure 9, new)** · durability and extensibility.
7. **Lessons from Running It** — the four built-and-deleted surfaces ·
   the schema race · the shared table's day-to-day cost · the first
   measurement pointed at the access layer.
8. **Evaluation (Q&A)** — connected interoperability · cross-node
   identity + local revocation · public domain subscriptions across
   provider loss (+ Figure 10, + Figure 11) · the metadata fan-out
   cost (Table 4 + Figure 12) · the deployed operating point · scope
   and open work.
9. **Related Work** — positioning: decentralized social (+ Figure 7's
   ref) · Solid (+ Figure 2's ref) · cloud IAM / Zanzibar / TAO ·
   multi-tenant / RLS · **monetization + the node market (+ Figure 13,
   new)**.
10. **Conclusion** — the email frame closed · the evidence · the labor
    resolution · the market close · the forward scope.

## What the second draft got that the third keeps

The verified evidence (the trial data, the artifact pins, the
18-citation bibliography, the interop/federation/domain results), the
§2 definitions + set expression, the §5 wall argument, §7 in full, the
Q&A §8, the §9 positioning paragraphs. What it did not have — and
what made it "not actual" — was written from shot 0: the abstract and
the intro's labor + five-properties + evidence lede, the beat
weave-through (the SPF/DKIM /certify line, the concrete domain, the
data-policy-not-privacy stance, the monetization + market material),
and all nine of the figure phase's figures wired in with their
captions.
