# Fifth-draft decisions — 6 November 2026

## Developer-ownership colors — final pre-PR figure pass

Operator: "maybe coloring in orange everything the dev has to build is
good! like the apps could be orange on sweb10 and at proto, but then the
middle box is orange on at proto too, while web10 its done for you"
Then: "they dont have to be the same orange, but everything you develop
could be warning colors"

Warm colors now encode application-owned design/code: softer amber for
all three apps on both sides, orange for custom AT backend responsibilities,
and a lighter warm tone for web10's remaining JSON/query design and
app-written SQL. The supplied node stays green, and violet still names
access enforcement. The reusable existing AppView path stays neutral.
A legend makes this an ownership distinction, not a claim that all app
work is dangerous. Shades are derived from canonical warning/foreground
tokens; approved Mastodon styling is untouched by AT-scoped selectors.
Offline checks additionally enforce the ownership legend and warm-family
apps/backend/query colors against the supplied green node frame.
Those checks pass, the colored standalone/PDF rendering was inspected,
and the final build remains 14 pages with 12 figures and 21 resolved
citations, without overfull boxes or unresolved references.

## Explicit reuse/design fork and content-storage choice — PR revision

Operator: "But to be clear, you need to design the app view, the diagram
doesnt make that clear! build your own or reuse should be clear!"
Then: "are the disparate data in one table? in multiple tables? ... app
view got to figure out schema!" The Mongo-like comment describes the
app-data philosophy, not a request for a MongoDB comparison. Operator:
"sorry continue, lets get this really accurate! perfect! dont have to
bring up mongodb necessarily i was just syaing that. but want this web10
vs AT proto to really show where web10 kills AT proto"

The AT picture now has a real visible fork. Reuse a service whose data
and API fit, with its route bypassing construction; otherwise design and
build a custom backend. The custom branch names design responsibilities,
not an already-designed recipe: record ingestion, database engine/schema,
keys/indexes/copy updates, joins/ranking/response shape, and request serving.
One generic JSON table or separate typed tables are choices for that
custom read model, not constraints imposed on AT repositories. Statusphere
is a concrete example with separate SQLite account/status tables.

The web10 side now names the physical content layout explicitly:
`documents(author_key, doc_id, collection_name, body)`; services are
logical names and bodies are app-defined JSON. Group/grant metadata use
separate node-managed tables. The application still designs JSON
conventions and queries, but does not provision a new content table,
synchronization copy or app-specific read server for the illustrated join.
No MongoDB mention or unmeasured database-performance comparison is added.

AT grows to 1440×1200, preserving legible matched applications and outputs;
Mastodon's layout remains unchanged. The diagram checks pass for the
reuse/build fork, shared-documents model, explicit responsibility cards,
matched app/result rows and card overflow. Final repeated Tectonic build
passes: 14 pages, 12 figures, 21 citations, no overfull boxes or unresolved
references. Standalone and PDF figure placement inspected; logs, page
renders and preview are under `.context/appview-choice/`. Earlier manuscript
sources and rasters remain untouched. The operator has requested a PR
against dev; its GitHub checks are a separate readiness gate.

## Peel the AT read backend — current round

Operator: "this is a whole lot better, i think the AT protocol one is
still confusing? because not clear what an app view is, i think AT
protocol is too abstracted still, if we peel the layers i think the
benefits of web10 over it will become apparent"

The unexplained AppView/query-service box becomes an explicit app-owned
frame containing three responsibilities: receive/apply record changes,
maintain a queryable database copy, and query that copy to serve a browser
request. "AppView" is introduced as the name for that kind of read backend,
not a presumed familiar primitive. PDS is expanded to Personal Data
Server and described as a user's storage host. The web10 side shows what
the app sends (query + token) and the already-supplied query API, grants,
and authoritative ClickHouse data. Identical apps and outcomes remain.

The named example is grounded in Statusphere revision
`dbb97738caa965c4b04efd281bfa1d2fbe4fffb3`:

- `lib/db/index.ts`: `better-sqlite3`, `SqliteDialect`, default `app.db`.
  This example uses **SQLite**, not Postgres. AT does not mandate either.
- `app/api/webhook/route.ts`: receives Tap events and calls record/account
  insertion, update and deletion code.
- `lib/db/queries.ts`: maintains copied tables and implements joins,
  aggregates and ordering through Kysely query functions.
- `app/page.tsx`: Next.js server code calls the queries and renders results.

The diagram applies this architecture to an illustrative score/profile
and listing/profile view; the actual source application is Statusphere,
not a game or shop. The responsibilities can share processes/hosts.
Existing read services, shared indexes and direct reads remain alternatives.
No measured speed/cost claim or absolute backend requirement is added.

The AT canvas grows to 1440×1080 so the layers stay legible. Shared CSS
adds AT-scoped selectors only; the approved Mastodon figure stays
1440×900. Offline checks retain matched apps/results and clipping guards
and now require all three responsibility cards. The manuscript explanation,
draft-local pinned-source citation, outline and shared figure KB follow
the diagram. This is a refinement of the fifth draft, not a new manuscript
or runtime experiment.

### Verification of the peeled figure

Both offline layout checks pass, including the AT responsibility-card
assertions. AT renders at 2880×2160; the Mastodon control rerender is
byte-identical to its approved raster. The updated full-width AT placement
was inspected in the PDF. Final build: **14 pages, 12 figures, 21 resolved
cited entries**, no undefined references, unresolved citations or overfull
boxes. The preceding split's small bibliography vertical warning no longer
occurs after the new text/citation flow; ordinary font, underfull and
bibliography metadata diagnostics remain. Logs, source/figure verification
JSON, before/after image and page renders are in `.context/atproto-peel/`.
No new platform experiment, commit, PR or production action. The operator's
review of whether the unpacked explanation lands remains open.

## Comparison split — preceding figure round

Operator: "yeah, i think you should revamp it and take mastodon completely
out of the conversation? or maybe leave this as mastodon versus web10!
and then have a bluesky versus web10!"

The two comparisons ask different questions; keep both, separately.
The combined fifth-draft figure had corrected labels but an asymmetric
picture (one social app versus three apps). That visual still implied
the discredited lack-of-extensibility claim. Both replacements are drawn
from blank sources and show the same social/game/marketplace use case on
both sides, with matched outcomes:

- `fig-mastodon`: stock social REST interfaces plus app-owned score/listing
  data versus the generic node backend. Public profiles are reusable;
  the exact accounts/get route is shown. Application composition may run
  client- or server-side. This does not limit ActivityPub extensions or
  require a physical database per app.
- `fig-atproto`: extensible records in user repositories → record sync
  (Tap example) → an application-owned index/query service → results,
  versus the node's existing authoritative store/query API. Existing
  AppViews, shared indexes and direct reads remain alternatives; no
  universal "a new query requires a new backend" claim. Granular
  delegation and record reuse are acknowledged rather than denied.

The shared `comparison.css` keeps the two frames and app/result rows
consistent, uses canonical color tokens, and makes the diagrams readable
at 1440×900 / 2x. Both retain a matchup title and a capability-specific
verdict, not an unsupported universal winner. The combined source is
retired from the fifth draft; previous manuscript figures stay historical.
The living shared figure KB records the corrected claim boundaries.

Primary documentation rechecked: Mastodon REST introduction and
accounts/get; AT Statusphere parts 1/2/4/5 (custom Lexicon, app database,
synchronization and query) alongside the already cited Permissions spec.
Mastodon documentation is added to the draft-local bibliography. Body
explanation, short captions, references and outline follow the split.
This adds a figure, not a new experiment or a sixth draft.

### Verification of the split

- Both natural 1440×900 canvases rendered at 2x. Standalone rasters and
  their full-width PDF placements were inspected separately.
- `figs/check-comparisons.mjs` passes for both figures: three matched
  apps per side, identical result text, canvas bounds and no card-text
  overflow. These checks concern diagrams, not platform runtime behavior.
- Rebuilt manuscript: **14 pages, 12 figure floats, 20 cited entries**.
  Both new captions/references resolve; the combined figure has no active
  manuscript reference. Short captions retained. No horizontal overflow
  or undefined-reference warning remains. A 1.166pt final bibliography
  vertical-box warning remains, with its rendered page inspected; font,
  underfull-box and bibliography metadata diagnostics also remain.
- Logs, page renders, standalone previews and extracted text live under
  `.context/comparison-revamp/`. The superseded fifth-draft raster is
  retained there rather than as an unused paper asset. Previous manuscript
  sources/rasters remain untouched; only their shared living figure KB
  receives the current comparison rule.
- No runtime changes, connected tests, comparative performance measurement,
  commit, PR or production action. Operator review of the two new figures
  remains the next gate.

## Request and scope

Operator: "okay, can you do a fifth draft please?"

The preceding assessment recommended keeping draft four's stakes-first
spine and figures while repairing overbroad comparisons, overstated
deployment status, monetization logic, and narrator/meta-writing.
This is a new manuscript in `research/fifth-draft/`; drafts one through
four are left untouched. No runtime work or new experiments are authorized.

During the work the operator asked:

> is there still an argument that web10 > AT protocol? or no? because
> you are saying AT protocol has alot of the benefits we said it didnt
> have, trying to understand if that undermines what we are saying, or
> if web10 is still substancially better in ways than AT protocol

The answer carried into the draft: yes, there is a substantial workload-
specific argument. AT supports custom records and granular delegation;
web10's distinction is authorized cross-user SQL on the node's existing
shared store, plus group-controlled private document access. This can
remove an application-owned synchronization/indexing backend for supported
compositions. It is not universal superiority or a measured comparison.

## Editorial choices

- How-layer explanation with use-case-driven structure: creator stakes,
  concrete leaderboard, request flow, evidence, next measurements.
- Voice is restrained and direct; the paper-specific natural explanatory
  rules govern over ornamental persona or pitch slogans.
- Same title, author, affiliation, all 11 full-width figures, short
  captions. No email opening; sender verification is a local analogy only.
- Existing profiles are reusable conventions, not data the social app
  authorizes on its own: the user grants the applicable app/content access.
- Solid already has user-managed resource authorization and does not
  require E2E encryption. Compare resource-facing composition with the
  node's shared relations, not impossible discovery or encrypted pods.
- AT primary docs checked 6 November: Permissions (Resource Types and
  Permission Sets), Statusphere tutorial (custom Lexicon, app database,
  Tap synchronization, application-owned joins). Fifth-only bibliography
  supplements the existing reference pack. No completed literature-gap claim.
- No "finer than OAuth" claim: OAuth does not mandate coarse scopes.
- Deployed social, isolated cross-node proof, domain research client,
  proposed client merge, and hypothetical node market stay distinguishable.
- No implication that absent protocol-native ads forces a platform cut.
  Creator affiliate payouts, operator revenue and hosting fees stay separate.
- Ad percentages are proposed operating settings, not measured exposure.
  Self-hosted software is not costless hosting. Availability is not guaranteed
  by access-control compilation.
- Evidence is re-grounded in the primary RESULTS files. Correct the benchmark
  phase labels and raw-sample retention claim; identify the schema ordering
  workaround as runner-specific rather than a project-wide fix.

## Original fifth-draft checks — before the comparison split

- Tectonic repeated build succeeds: **13 pages**, all 11 full-width
  figures and 18 cited bibliography entries. Final build has no overfull
  boxes, undefined references or unresolved citations. Existing font
  diagnostics, underfull-box notices and bibliography metadata warnings
  remain; these are not suppressed.
- Static checks resolve every internal reference and image path and find
  captions 1–11 in extracted PDF text, with no `??` markers. The two
  side-by-side interop captures make 12 images in 11 floats.
- All pages rendered to `.context/fifth-draft/`; contact sheet inspected,
  with detailed first-page, comparison, query, portability/advertising,
  market and curve inspections. Leaderboard SQL stays in one column
  rather than splitting across pages.
- Section-wide float barriers were tried and rejected: they created
  sparse pages and expanded the paper to 17 pages. Final layout uses
  normal ACM float placement; some full-width figures follow their
  introducing text on later pages.
- Primary-record phase arithmetic rechecked: 21.04× handler improvement
  and 35.22× readable-resolution improvement. No experiments rerun.
- `git diff --check` passes; drafts one through four have no diff.
- Local build logs, extracted text, page renders and JSON verification
  receipt are in `.context/fifth-draft/`. The PDF is a manuscript
  deliverable in this folder, not a production artifact. No commit or PR
  was created as part of this request.

The operator's PDF read remains the next editorial gate. Logical
verification is clearer through the leaderboard and input-filter example;
originality is stated as the integration rather than an unverified
exclusivity claim; importance is calibrated to the dated operating point.
Those are editorial assessments, not acceptance guarantees or measured
awe scores. No new capacity, security, economic, comparative-performance,
or production-network result.
