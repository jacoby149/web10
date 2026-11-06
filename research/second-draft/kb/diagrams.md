# The figures — what to visualize, why, why it is visually nice

The visual half of the paper (theory §7). Rules first, then the
design language, then each figure's rationale. A figure enters the
paper only through this document — what it visualizes, why that shape,
why it is visually nice, and what it may not assert.

## The rules

- **Accuracy invariant:** a figure asserts only what the paper body or
  the knowledge base already asserts. A figure that adds a claim is a
  new claim that needs evidence.
- **Placement is assertion:** which box a mechanism sits in is a claim
  about where it runs. A mechanism drawn on the wrong side of the trust
  boundary is a factual error, not a style issue (Figure B's first
  shot drew the AST walk in the app tier; it runs API-side, in
  `safe_query` — the SDK only posts `{ sql, token }`).
- **No internal IDs** in figure text or captions (conference-facing,
  per the 4.5.4 cleanup).
- **Referenced or it doesn't exist:** every figure has at least one
  `\ref` in the body.
- **Caption describes the figure it sits under** — not a previous
  version of the figure, not the section's topic in general. (The
  fig:feed caption described ranking tabs that were never in the
  figure; that class of bug is now a review failure.)
- **Diagrams are HTML source → 2x PNG** (`figs/README.md`); UI
  screenshots stay PNG-only app captures.
- **The same mechanism is drawn identically in every figure.** The
  reader learns the visual vocabulary once.
- **Comparison figures carry the verdict.** The two VS figures (Figures
  8 and 9) are scored comparisons, not neutral forks: the title names the
  matchup ("web10 vs Solid" · "web10 vs Mastodon / Bluesky"), a VS badge
  sits between the panels' verdict strips, and the bottom strip names what
  web10 beat on and why — Figure 8: *composition* (a cross-user query that
  terminates: one shared store per node, millions of users); Figure 9:
  *interoperability* (an app-to-app per-service grant on one shared
  columnar store). The verdict line is not a new claim — both are already
  asserted by the panels (shot-0 beat 10; the 4.10.27 app-to-app vs.
  app-to-user-data re-anchor); the strip scores, it doesn't argue. This
  supersedes the earlier "no verdict line: the comparison lives in the
  caption" note (operator's call, 05.11.2026: "make clear in these
  diagrams these are VS. versus diagrams, and what we got them beat on").
  The mechanism figures (A/B) get no verdict strip — a how-it-works
  figure that carries a verdict turns pitchy.

## The design language (why it looks the way it does)

One dark web10 theme across every figure:

- **The canvas:** dark near-black (`#0a0a12`), wide/short aspect
  (1440 canvas, @2x raster). Why dark: the app's screens are dark, so
  the diagrams and the UI screenshots share one visual world — and
  that world *is the product*, which is itself a Q1 signal (it's
  real). Wide/short: full-width floats stay compact, and the 12-page
  budget is a hard constraint.
- **Color is semantic, not decorative:**
  - green `#34d399` — the trust source: the issuer, `/certify`,
    "serves /certify", the node-as-home.
  - blue `#60a5fa` — the foreign side: the serving node, the reader's
    foreign path.
  - violet `#8b5cf6` — the enforcement mechanism: the access-check box,
    the boundary CTE. **The same violet wherever the enforcement gate
    appears** — the reader sees one mechanism across the paper.
  - amber `#fbbf24` — the negative space: what was refused, removed, or
    rejected ("what the node refuses to learn"; the broken path's
    verdict).
  - red `#f87171` — the broken/unsound path (only in the
    wall-not-membrane figure, where the contrast is the argument).
  - gray `#9c9fb3` — neutral text; dashed gray = secondary.
- **Line semantics:** solid = primary flow; dashed = cross-boundary,
  secondary, or refused.
- **Shape semantics:** chip = a data object (`users`, `data
  (columnar store)`, a service name); card = a node/system; filled box
  = an active mechanism; dashed-border box = a service or a note; pill
  on a bridge = the invariant being claimed ("same access check").
- **Consistency across figures:** fig:feed's violet access-check box and
  fig:boundary's violet boundary-CTE step are the same enforcement
  family; the green `/certify` line is the same green everywhere.

## The figures

### Figure 1 — system overview (TikZ, §1) — label pass pending

One client, two sovereign nodes, the `/certify` path. The paper's map.
**Planned change:** gain section labels (§2, §4, §5, …) mapped onto the
diagram — the visual table of contents (the F3 move: the reader can look
at Figure 1 and know the paper's structure).

### Figure 2 — the federated node (HTML → `figs/fig-feed.png`, §4) — done

**What it visualizes:** pulling the feed across nodes — the reader's
client pulls documents from node B with the home-node token; B
authenticates via the issuer's `/certify` (one cached answer per token,
never a grant) and runs the same access check on every read.
**Why that shape:** node B is mirrored so the two identical violet
access-check boxes sit adjacent in the middle, bridged by the "same
access check" pill — *the visual thesis is "same check, every node"*.
The only differences are where they matter: the verify step (own
signature vs `/certify(A)` cached until expiry), the "enforces" lines
(differing only in the first term), and A's "serves /certify" box, which
B's green line targets — the mechanism is visible, not just labeled.
**History:** redrawn 04.11.2026 on operator review ("node b does the same
access checks as node a, but with the certify — dont like that they are
shown as different internally"). Before: the two read paths were drawn as
different-colored, differently-labeled mechanisms — the diagram argued
against the paper.

### Figure 3 — the web10-social application and its node (done,
`figs/fig-app-arch.png`, §6)

**What it visualizes:** the real system at the level of named parts —
"the data layer lives in the app." The browser box holds the app's
surfaces + the six data-layer modules a bespoke API would normally
carry + wapi; the node box is thin and generic (auth · read gate · query
engine · media); ClickHouse and MinIO are drawn with their real
table/blob names; a messages panel shows the actual payloads that move
on the wires (`{sql, token}` → `{rows: [doc_id, author_key, body, …]}`
→ the presigned URL → the bytes). Pinned annotation: 46,285 source lines
across 141 files.
**Why that shape:** the operator asked for "the guts of the typescript …
a whole data layer that is normally handled by an API" — the honest flip
side of the thin generic node. The first cut was rejected as a spec
sheet ("these are pitch figures, not how-it-works figures"); the
rebuild draws the machine's named parts and lets the argument (the dense
app box pinching two hairlines) read off the picture. No verdict line;
the claim is the caption's. Speaks the shot-0 language (the node header
carries beat 2; auth carries beat 7's "a role and a policy — OAuth
2.0-style, finer-grained"; the read gate carries beat 3). The
query-engine part is violet and points at Figure 4.

### Figure 4 — reading a social feed on web10 (done,
`figs/fig-query-engine.png`, §5)

**What it visualizes:** one feed query, from the browser to ClickHouse
— and which side each step runs on. The browser frame: the app's code
(`buildFeedQuery` in feed.ts) → the query it builds (service names
only) → wapi, which posts the SQL, unchanged, to `/v3/query` with the
reader's scoped, expiring token — "it adds no authority: the node
decides what this reader may read." The node frame ("the node (the
API) — FastAPI: the query engine"): PROTECTED WITH AN AST (the walk and
its real rejections — raw node table names; `file()`/`numbers()`/
`s3()` as nameless tables; ungranted services; round-trip to exactly
one statement) → the lowering: each service name becomes a CTE the
engine builds over its own tables — `documents` deduped to the latest
not-deleted row, joined to `doc_groups`, the reader's readable group
IDs inlined from the read gate (`group_members` × `group_contracts` +
class grants), the five exclusion tables in amber → a ClickHouse strip
naming every real table the caller may not reach ("the API rejects such
queries before they run; that's what protects the data").
**Why that shape:** the plan was the two-pipeline contrast (broken
output filter vs. boundary CTE); the operator's critique ("pitch
figures, not how-it-works figures") moved it to the real mechanism —
the caller's world (service names) vs. the node's world (real tables),
the wall visible as the gap between them. The shot-4 re-shot (05.11.2026)
fixed the placement: the first shot drew the AST walk in the app tier —
but the walk, the lowering, and the round-trip all run API-side, and
the "THE BOUNDARY" slogan band told where the mechanism shows: it is
out, replaced by the walk/lowering labels + the amber fact "the
caller's string is never executed". The empty-vs-refuse semantics (the
`1=0` CTE; the endpoint-level 403) belong to the caption, not the
picture. The violet enforcement family is the same box as Figure 2's
access check and Figure 3's query-engine part.

### Figure 5 — interop screenshots (§6) — existing, PNG-only

One social-written profile, two application views (Snake + Marketplace).
Evidence, not decoration: it proves the business claim with pixels.
PNG-only app captures (no HTML source).

### Figure 6 — domain portability, before/after (§8) — existing,
PNG-only

Same website, another public account: the exact panel crops from the
browser matrix. The address outlives the account, in two pictures.
PNG-only.

### Figure 7 — groups UI screenshot (§6) — existing; cut candidate

The groups screen (a shared space on your node). Nice product evidence,
but the weakest claim-per-pixel in the set: if the 12-page budget bites,
this is the first figure cut (the interop screenshots already show the
app running).

### Figure 8 — the composition fork: web10 vs Solid (done,
`figs/fig-composition.png`, §3/§9)

**The figure title:** "web10 vs Solid" (4.10.33 — the VS framing); the
subtitle names the fork: "the composition fork — the same feed, composed
in two different places."

**What it visualizes:** the capability asymmetry, not just the
performance one (shot-0 beat 10 made concrete). Left (Solid, blue): one
user per pod; the app pulls every pod the feed touches and joins in the
application; discover-type queries (who's trending?) must pull the whole
network — no shared index, so they don't terminate at scale (amber
negative space). Right (web10, green): three nodes, each with its own
violet boundary over its shared store — "ClickHouse — millions of users,
one store" — each pulled from separately by the app (query + token down,
rows up), each re-checking the reader's rules on every read; discover,
trending, and ranking are ordinary queries at the query layer.
**Why that shape:** the operator's point — "these nodes in the
composition could each have millions of users, that is the difference;
solid simply cant do discover type stuff because nodes can get big" —
drawn as the two worlds side by side, so the difference is the picture.
The verdict strip (4.10.33, the VS framing) scores it — "WEB10 — THE
COMPOSITION WINNER" against Solid's one-user-per-pod offer — replacing
the old "not a verdict line (the comparison lives in the caption)" note.
The violet boundary box is the same mechanism as Figure 4 — the
enforcement family again.

### Figure 9 — the interoperability fork: web10 vs Mastodon / Bluesky (done,
`figs/fig-platforms.png`, §6/§9)

**The figure title:** "web10 vs Mastodon / Bluesky" (4.10.33, the VS
framing; 4.10.32 had first re-titled it "How a second app reads the
user's data"); the subtitle names the fork: "the interoperability fork —
where a second app's read of the user's data lands and runs."

**What it visualizes:** the extensibility fork, re-anchored on the query
engine (4.10.29) — how a second app reads and composes with existing user
data, and where its queries run. Left (Mastodon · Bluesky, blue): the
fixed social object model (post · profile · follow · like · boost);
**no query engine in the platform** — the app reads via the platform's
fixed endpoints (getFeed / getProfile / /timelines, untunable) or
replicates records into its own database (Bluesky's own statusphere
tutorial: a Tap sync worker + Postgres, just to have a feed); "a new
read pattern is a new backend"; no record shape for a hi-score or a
listing. Right (web10, green): **the node — set up already**: the social app's
real dozen services in the store (`posts · comments · reactions ·
profile · media · music · groups · …` — names pulled from
marketing/web10-social/src/data, 4.10.32) plus the new apps' own
(`snake_scores` · `marketplace_listings` — the pinned interop names), the
interop one, `profile`, highlighted violet; the API shown in action — the
violet query-engine box (POST /v3/query: "compiles the app's SQL against
the reader's grants, then runs it") sitting above the green ClickHouse
columnar store, provisioned on the node, no DB to stand up; the app
writes its own queries on day one (joins · ranking · cursors); a second
app gets in through a per-service grant the user gives (snake game → the
social app's profile; no grant → 403). New read pattern = a new query,
not a new backend.
**Why that shape:** the operator's "does bluesky give that clickhouse BI
power? i bet not … you couldnt tune the feed, this lets you write
whatever clickhouse you want" made mechanism-first — the contrast is the
columnar engine already on the node, no DB setup, vs. fixed endpoints or
your own replicated backend. The boundary box was dropped from this
figure (operator: "we cant have this pitchy, the boundary") — it is
fig-query-engine's hero; this figure's hero is the columnar experience.
The 4.10.27 re-anchor (app-to-app vs. app-to-user-data; "no fine-grained
IAM" was wrong for Bluesky and was pulled) is retained in the note.
The 4.10.33 verdict strip (the VS framing) scores that re-anchor: left
cell = what Mastodon/Bluesky offer (a second app gets in through the
user's grants on its own data; the object model stays fixed; no shared
store to query across); right cell = "WEB10 — THE INTEROPERABILITY
WINNER" (an app-to-app per-service grant on one shared columnar store).
**Evidence (keep it "as clear as day"):** atproto guides/statusphere-
tutorial + specs/permission + the AppView read model · Mastodon REST /
OAuth docs · feed.ts's buildFeedQuery · `research/interoperability-demo`
(all checked 05.11.2026). Pin the spec's version/section before §9
prints, per `research/related-work.md` (the comparative gap stays OPEN).

### Figure 10 — how money flows on web10: the ad rail (first shot,
`figs/fig-monetization.png`, §6/§9 — pending the operator's pass)

**What it visualizes:** the monetization fork — the ad architecture
falling out of the same primitives, as the ad pureplay (v3 is ads only:
no Stripe, no payment processing; the v4 payment rail is a separate
layer). Top: the surfaces — every app that writes into the store
inherits the ad rail (the social app is the first, and for now the only,
catalog builder; the snake game and the marketplace inherit: any of
their docs can be a pinned ad target or a node ad — the mechanism is
the node's, the catalog is the app's). Middle: the node's rail — the
read attaches ads at the boundary, I3-checked, with the density split
explicit (the operator's call): the creator's layer is dense — the
post's `ad_preference` (pinned) → `doc.ad`; the influencer shows their
own offers on most of their content, ~80–90% of the time (the
operator's competitive operating point; the KB grounds the mechanism,
the number is theirs to defend in §9) — and the node's layer is
sparse: the operator's density → `doc.node_ad`, the overlay lands on
~5–10% of posts (node-controlled, default 10, deterministic per
reader, round-robin); both can be present on the same post: the
creator's monetization is never suppressed by the node's (non-steal).
The inventory: tagged docs in the followers group + the discover group,
the offer object — kind / the link that pays / cta / disclosure —
never rewritten, never cloaked. Bottom: the money, off-platform (the
creator keeps 100% of affiliate/sponsor revenue — no cut of ad revenue,
no payment processed; the node operator is a media company who sells
the attention directly and keeps 85–90% — and nodes compete for the
influencers by lowering their rates: the density is node-controlled, a
competitive market economy of nodes, §9/§10 material, not a shot-0
beat; web10 Inc.'s v3 cuts are the hosting/platform fee + the no-ads
tier share, never the creator's links; the v4 horizon — the exchange,
the payment rail, the creator's own layout — drawn as a separate layer,
not the v3 claim). The amber contrast strip:
Solid / Mastodon / Bluesky ship no ad mechanism (a documented design
property — the related-work gap stays OPEN, pin the sources before §9
prints); web10's stance: the free web should have ads — the right kind
(100% delivery by architecture, no shadow ban, no ad network, no
third-party targeting).
**Why that shape:** the operator's "all of these surfaces should
interoperate on ads -> so people make money on the new internet" + "the
ad architecture matters" + "web10 believes there should be ads on this
free web" — drawn as the three zones (surfaces → rail → money), so the
inheritance (the rail is service-agnostic) is the picture, and the
contrast with the alternatives lives in the amber strip, not a verdict
scoreboard (this is a mechanism figure — the ratchet rule keeps verdict
strips on the two VS comparison figures only). Evidence:
`knowledge-base/web10-v3/social/{ads.md, node-ads.md, monetization.md,
ads-dissemination.md}` + `knowledge-base/strategy/business-plan.md` §4.
Proposed landing: §6 + §9.

### Candidates (not started)

- **Two trust layers (§2):** the app wall (outer: can this app perform O
  on S?) and the person wall (inner: does membership or a class/role
  grant allow O on S in G?), with a grant as a row. Useful if the
  definitions-first rewrite of §2 needs a picture; the prose + the table
  may suffice — decide at the outline stage.
- **The data model (§3):** one `documents` table, `{service, body}`,
  updates-as-inserts, deletes-as-tombstones, `doc_groups`. The schema
  listing may carry it; a figure only if §3 loses the why-not-DB-per-user
  argument visually.

## Figure plan (status)

| # | Figure | Section | State |
|---|---|---|---|
| 1 | System overview + section labels | §1 | existing TikZ; label pass pending |
| 2 | Federated node | §4 | **done** (4.9.1) |
| 3 | The web10-social application and its node | §6 | **done** (4.10.23, `fig-app-arch`) |
| 4 | Reading a social feed on web10 | §5 | **done** (4.10.23, `fig-query-engine`; retitled 4.10.28) |
| 5 | Interop screenshots | §6 | existing |
| 6 | Domain portability | §8 | existing |
| 7 | Groups UI | §6 | existing; cut candidate |
| 8 | The composition fork: web10 vs Solid | §3/§9 | **done** (4.10.23, `fig-composition`; VS framing 4.10.33) |
| 9 | The interoperability fork: web10 vs Mastodon / Bluesky | §6/§9 | **done** (4.10.29, `fig-platforms`; 4.10.32 title/API/services; VS framing 4.10.33) |
| 10 | How money flows on web10 (the ad rail) | §6/§9 | **first shot** (`fig-monetization` — pending the operator's pass; the shot-0 monetization beat drafted alongside) |
| — | Two trust layers / data model | §2/§3 | candidates |
