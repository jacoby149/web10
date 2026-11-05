# The figures — what to visualize, why, why it is visually nice

The visual half of the paper (theory §7). Rules first, then the
design language, then each figure's rationale. A figure enters the
paper only through this document — what it visualizes, why that shape,
why it is visually nice, and what it may not assert.

## The rules

- **Accuracy invariant:** a figure asserts only what the paper body or
  the knowledge base already asserts. A figure that adds a claim is a
  new claim that needs evidence.
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

### Figure 3 — the social app as a lens (planned, `figs/fig-app.png`, §6)

**What it visualizes:** differentiator #4 made visible — "the functions
are defined on generic web10 API stuff" (operator).
**Why three bands:** top = what the user experiences (the app surfaces:
communities, posts & media, following, discover, DMs, shorts, watch,
music); middle = how the app defines each surface, client-side
(documents in app-named services / the social graph as group rows /
feeds & search as app-written queries / media as the generic pipeline);
bottom = the node: one generic implementation with its primitives, plus
the amber callout "what the node refuses to learn" (no posts table, no
feed endpoint, no followers concept — the negative space that *is* the
architecture) and the interop line (the same node runs a game and a
marketplace).
**Why it will be visually nice:** the downward flow reads as "the app
defines everything; the node provides nothing app-specific" — the
inversion is the picture. The violet enforcement family appears in the
"app-written queries over the node's read boundaries" box, tying it to
Figures 1–2.

### Figure 4 — the boundary: a wall, not a membrane (planned,
`figs/fig-boundary.png`, §5)

**What it visualizes:** the theorem's materialization — why output-side
filtering is unsound, and what web10 does instead.
**Why two pipelines:** the broken one on top (red: caller SQL → raw
table → aggregation runs → output filter, with the ✗ callout "too late —
the aggregate collapsed every author's rows before any filter ran"), the
right one below (caller SQL → parse to AST → walk every table reference
→ inject the reader-filtered boundary CTE → execute the compiled query).
The contrast *is* the argument; a single pipeline couldn't show why the
wall has to sit before the relational operations.
**Why the key step is violet:** the "inject boundary CTEs" box uses the
enforcement family's violet — the same color as Figure 2's access-check
box. One mechanism, two figures, one vocabulary.

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
| 3 | Social app as a lens | §6 | planned |
| 4 | The boundary (wall not membrane) | §5 | planned |
| 5 | Interop screenshots | §6 | existing |
| 6 | Domain portability | §8 | existing |
| 7 | Groups UI | §6 | existing; cut candidate |
| — | Two trust layers / data model | §2/§3 | candidates |
