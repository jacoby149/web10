# Fifth-draft figures

The paper now has 12 full-width figures: the combined comparison is
replaced by separate Mastodon and Bluesky / AT Protocol figures.
The HTML mechanism diagrams and
matplotlib curve have editable sources here; the group image is an app
capture. Interop captures remain shared at
`../../interoperability-demo/figures/`.

Baseline assets were copied from draft four. This is an independent
working set; earlier drafts remain untouched. Canvas dimensions, dark
design language and bottom padding stay the same. Captions are short;
explanation belongs in the body.

## Corrections

- **composition:** direct-fetch pod comparison, not impossible discovery
  or claimed million-user capacity. Indexing alternatives acknowledged.
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
- **monetization:** proposed settings, not measured exposure; separate
  creator payouts, operator revenue and fees; no competitor exclusion,
  measured revenue split, or demonstrated game ad rendering.
- **node-market:** hypothetical illustration. Self-hosting has costs;
  access checks do not guarantee delivery, attention or a market outcome.
- **k1000-curve:** point label is 7.54 seconds readable, not the
  7.64-second handler time. Plotted data are unchanged.

## Rendering

Install Playwright 1.62.0 in a scratch directory outside the repo. Set
`NODE_PATH` to that directory's `node_modules`, then run:

```sh
node research/fifth-draft/figs/capture.mjs fig-mastodon
node research/fifth-draft/figs/capture.mjs fig-atproto
node research/fifth-draft/figs/check-comparisons.mjs
```

The runner uses cached Chromium and captures the natural body size at
2x. An optional output argument saves inspection copies under
`.context/fifth-draft/`. For the plot, use a scratch Python environment
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

Introductory comments copied from earlier, unchanged sources are historical
provenance, not this draft's specification. The manuscript, current
rendered labels and correction list above govern this set.
