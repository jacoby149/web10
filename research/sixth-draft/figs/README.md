# Sixth-draft figures — 6 November 2026

The paper includes nine full-width figure floats, keeping separate Mastodon
and Bluesky / AT Protocol comparisons. The HTML mechanism diagrams and
historical matplotlib curve have editable sources here. The group capture,
hypothetical node market, and ad-rail figure are retained as unused assets,
not included in the PDF. Interop captures remain shared at
`../../interoperability-demo/figures/`.

Baseline assets were copied from draft five. This is an independent
working set; earlier drafts remain untouched. Canvas dimensions, dark
design language and bottom padding stay the same. Captions are short;
explanation belongs in the body.

## Corrections

- **composition (Fig. 2):** pod fetching or an added crawl/index/query
  service versus local composition over pooled authors. Millions is a
  sizing target, not a capacity result. App-authored ranking executes at
  the node; Discover retains separate node infrastructure.
- **app-arch (Fig. 1):** the copied v5 source was byte-identical to v4.
  The earlier structural simplification occurred on the AT figure's web10
  side, not here. “Completely generic” is narrowed to shared data primitives;
  the ads/Discover audit stays open, and “finer than OAuth” becomes separate
  app/group checks. The stale “Figure B” becomes Figure 3. No structural
  simplification is claimed for this figure.
- **mastodon:** same three clients on both sides; stock social REST API
  plus app-owned score/listing data versus one generic node backend.
  Reusable profiles are explicit. This is not an ActivityPub limitation.
- **atproto:** same three apps on both sides, including custom record
  types. The AppView-style backend is opened into concrete responsibilities:
  record sync/webhook code, a copied-table database, and request-serving
  query code. Pinned Statusphere source supplies the Tap/SQLite/Next.js
  example; game/listing data remain the illustrative workload. Existing
  indexes and direct reads remain alternatives. The advantage is supplied
  query/storage infrastructure, not exclusive cross-app reuse.
  The visible fork distinguishes reusing a fitting AppView from designing
  a custom backend. The latter owns the ingestion, storage schema,
  indexes, queries and read interface. web10's content services share
  `documents`; JSON conventions and queries remain app choices.
  Warm ownership colors mark apps/custom-backend work with distinct
  amber/orange emphasis; small JSON-shape/SQL notes sit inside web10's app
  boxes. Green is the supplied node and violet is access enforcement.
  The API box contains only supplied checks/query preparation/return;
  document shape sits inside ClickHouse. Reusing an AppView stays neutral.
- **query-engine:** member admission and non-member class grants, not a
  role-only model. AST construction alone is not a safety proof.
- **feed:** cross-node read design, not a deployed merged feed.
- **audience-portability:** public research prototype with domain-control
  and availability assumptions; no private-grant or content migration.
- **monetization (not included):** density targets removed; separate
  creator payouts, operator revenue and fees; no competitor exclusion,
  measured revenue split, or demonstrated game ad rendering.
- **node-market (not included):** hypothetical illustration. Self-hosting has costs;
  access checks do not guarantee delivery, attention or a market outcome.
- **k1000-curve (Fig. 9, §9.4):** point label is 7.54 seconds readable,
  not 7.64-second handler time. Plotted data remain historical and unchanged;
  subtitle says so. Table 1 restores all B p50/p95 cells. K=1 remains a
  different discover-board workload (open markers/dashed leg). Task 4 repeat,
  paired same-engine baseline, million-author concurrency and freeze are OPEN.

## Rendering

Install Playwright 1.62.0 in a scratch directory outside the repo. Set
`NODE_PATH` to that directory's `node_modules`, then run:

```sh
node research/sixth-draft/figs/capture.mjs fig-composition
node research/sixth-draft/figs/capture.mjs fig-app-arch
node research/sixth-draft/figs/check-comparisons.mjs
```

The runner uses cached Chromium and captures the natural body size at
2x. An optional output argument saves inspection copies under
`.context/sixth-draft/`. For the plot, use a scratch Python environment
with matplotlib and run `fig-k1000-curve.py`.

The comparison pair shares `comparison.css` with canonical design
tokens. Mastodon retains 1440×900; the AT detail canvas is 1440×1200
to expose the additional layers without shrinking text. AT-only selectors
leave the approved Mastodon layout unchanged. Matched app rows and result
rows keep the use case constant while the infrastructure changes.
The offline check verifies those matches, canvas bounds and card-text
overflow, plus explicit AT ingestion/database/serving responsibility
cards, the reuse/build fork, and the explicit shared-documents storage
model. It does not test Mastodon, AT or web10 runtime behavior.
Ownership-color assertions also keep app-owned work warm, the supplied
node green and the API violet. Structural checks prevent moving app
design/code back into the API and require document shape inside ClickHouse.
The checker and `comparisons.bib` are unchanged from v5.

All included source-resolution rasters (including both interop crops) and
changed standalone figures were opened during this pass. PDF placement,
page count, resolved citations/references and box-warning checks are
recorded in the current DECISIONS.md verification record. Scratch logs and
page renders live under `.context/sixth-draft/`. No runtime tests or new
platform measurements are implied by these editorial checks.

Introductory comments copied from earlier, unchanged sources are historical
provenance, not this draft's specification. The manuscript, current
rendered labels and correction list above govern this set.
