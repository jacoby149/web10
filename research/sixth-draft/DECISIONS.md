# Sixth-draft decisions — 6 November 2026

## Source, scope, and current status

7 November operator update: setup and scientific design validation only, not
execution. The new study/review under `research/experiments/costfn/` source-check
the real core-feed request graph and find corpus/Discover/app-Origin, matched
comparator, queue/correlation and telemetry/dedupe gaps. Current design remains
not run-ready; no new study or measured manuscript values are produced. Keep
the draft's narrower engine-placement wording: ClickHouse row policies exist,
including in 24.3.18.7; the contribution is the platform/policy/query integration.
The latest instruction supersedes the earlier execution approval.

Source: fifth draft at `8d7460d81f8bba8c51d189a35ea7216118762f7e`
(PR #1409), copied on 6 November 2026. This is a refinement, not a fresh
resynthesis. Planned changes: price AT's custom-view extensibility in
backend work; restore the million-author shared-store sizing fork; explain
the decision to build the primary app rather than assume unpaid developer
adoption; audit genericity against code; restore the historical B table;
cut non-evidence floats; consolidate limitations; filter the local
bibliography; align abstract/intro/conclusion. New measurements belong to
Task 4 and are not available. **Not frozen; not upload-ready.**

### Task 0 — completed provenance

- The untouched copy built to **14 pages**, matching committed v5's
  extracted text on **all 14 pages**. Parent receipt:
  `.context/sixth-draft/baseline.json`; copied baseline PDF:
  `.context/sixth-draft/main.pdf`.
- Independently verified the baseline page count with scratch PyMuPDF.
  `research/fifth-draft/` and all earlier drafts are unchanged.

### Editorial decisions (Tasks 1–3, 5–9)

- **AT (§5):** no cost-free parity sentence. Custom Lexicons and granular
  permissions remain possible, priced as sync/webhook mutation handling,
  a queryable app database, and serving/query code. Statusphere is explicitly
  social; pinned revision `dbb97738caa965c4b04efd281bfa1d2fbe4fffb3`
  uses Tap, SQLite `app.db`, Next.js and Kysely, with account/status tables.
  Generic JSON versus typed storage, reusable AppViews/shared indexes/direct
  reads remain alternatives. Our wire-vs-stack preference is a design
  argument, not a claim that AT mandates a particular engine or cannot
  support non-social apps. The required supplied-infrastructure closing
  sentence is retained. AT/Mastodon figures and their checker are unchanged.
- **Solid (§3):** millions of pooled authors restored as a sizing target,
  not demonstrated capacity. Pod fetching or an external crawl/index/query
  service is the cross-user alternative. Physical colocation is not required
  by Solid; pod interfaces are the relevant composition boundary. Existing
  columnar/version/point-lookup/tenant costs remain.
- **Real app (§§3, 9.1, 10):** building web10-social is our answer to relying
  on unpaid third-party app work. The 2016 Solid papers support demonstrations,
  not a 2026 census or a claim of zero/widely used apps. No unsupported census
  is printed. Interop reuses the real social app's profile convention and
  writes, with synthetic accounts; independent adoption is not established.
  The entire 28 October operating snapshot and 5,396 ms readiness remain
  unchanged, with no fresh date/numbers mixed in.
- **Page budget (§§1, 5, 7, 9, 11, 12):** removed group UI and hypothetical
  node-market floats, then the advertising float when the added evidence
  table/funnel/limitations still exceeded the budget. Monetization remains
  in prose. Removed density targets from the retained standalone ad figure;
  no hypothetical 6×6 market or subscriber/delivery-rent claim is included.
  Compressed repeated introduction and evaluation/conclusion restatements;
  preserved Lessons, mechanism results, and full-width AT/Mastodon figures.
  No float barriers, margin/font-size hacks, or fabricated results.
- **Historical evidence (§9.4):** Table 1 restores all six B rows, with
  handler and readable p50/p95 copied at three decimals from
  `research/experiments/costfn/K1000-RESULTS.md`. The curve remains the old
  single sequential trial and is explicitly labeled historical. K=1 is
  still a different discover-board workload (open markers/dashed leg),
  9.53 versus 25.37 ms; batched handler growth remains 4.47×. A/B/C scope,
  non-causal B−A, summary-only retention, no concurrency/randomization/warm-up
  exclusion, simplified query, and missing Origin gate remain explicit.
- **Proposed load (§9.4):** Table 2 is an assumptions/funnel table, not
  results. Registered/MAU populations, DAU, peak-hour shares, 5/15-minute
  full sessions (including idle), Little's Law, request/think-time rates,
  and in-flight requests are distinguished. The one-session-per-DAU
  assumption is explicit. All stepped load results remain OPEN.
- **Limitations (§11):** consolidates every evaluation's caveat, including
  deployment/default status, same-origin interop, parser/media correctness,
  lab DNS/TLS/fixture authority, incomplete federation and public/private
  portability boundaries. Conclusion (§12) matches those open gates.
- **Citations:** `web10-references.bib` is a filtered draft-local copy,
  retaining 17 cited entries unchanged. All five `comparisons.bib` entries
  remain cited and unchanged: 22 references total. No shared bibliography
  file is edited. No claims are added just to retain an unused citation.
- **Figure audit:** included figures inspected at full source resolution,
  including both interop crops. `fig-app-arch` was byte-identical to v4 in
  the copied v5: the earlier simplification landed on the AT figure's web10
  side, not Figure 1. This draft narrows Figure 1's “completely generic”
  label to shared data primitives, explicitly leaves ads/Discover auditing
  open, replaces its “finer than OAuth” wording with separate app/group
  checks, and replaces “Figure B” with Figure 3. These are label corrections,
  not a new structural simplification. Composition/curve
  labels match prose and current numbering. The standalone ad asset is
  audited but no longer included. Layout checker coverage is structural,
  never runtime-platform correctness.

### Read-only genericity audit (Task 5)

- `marketing/web10-social/src/data/feed.ts:458–545`: app-owned
  `powerMeanScoreSql` and `buildFeedQuery` generate scoring, joins, ORDER BY,
  and cursors. `readFeedPage:693–709` submits SQL to generic `w.query`.
  Node/ClickHouse execution is **not** evidence that ranking policy is
  node-authored. The introductory “server-side sort” comment is stale.
- `feed.ts:526,571–574,700–708` carries `ad_mode`, `ad_target`, `ad` and
  `node_ad`, and opts into preparation. `api/app/v3/endpoints/query.py`
  `_prepare_rows:239–268` invokes node-side pinned/node-ad loaders.
- `api/app/main.py:74`, `api/app/v3/endpoints/groups.py:449–465`, the group
  models and safe-query metadata expose Discover enrollment/directory and
  `discoverable`; `api/tools/migrate_accounts.py:8` acknowledges enrollment.
  These are unresolved genericity surfaces, not proof of whole-node D60
  compliance. §5 demonstrates reuse only; E4b remains OPEN for the parent.
- `feed.ts:606–642,700–729`: the nonempty page uses one main query, two
  engagement queries, and content views, plus possible author resolution.
  “One query” is the core composition, not a complete-feed network count.
- `api/app/settings.py:135–139`: production/default mode remains per-group.
  No runtime changes are made or implied by this paper pass.

### Task 4 and freeze — cancelled repeat, frozen inputs / OPEN

The parent's new larger-host provisioning attempt failed HTTP 422: the
`s-8vcpu-16gb` size is restricted at the current account tier in `sfo2`.
Authentication succeeded; **that failed attempt created no droplet**.
The operator then asked to try the largest instance in the current tier.
The largest listed non-GPU CPU count is four, with 12 GB at that count;
`s5-4vcpu-12gb-80gb` in atl1 was provisioned at `2026-11-06T20:25:53Z`
(droplet 616682066, advertised $0.12274/hour). This is an explicitly
approved tier-limited follow-up, not a silent fallback or a purchased
8-vCPU host. Its startup failed before seeding on a temporary ClickHouse
server handoff; receipts were collected and droplet deletion verified.
The bounded schema-template retry has offline refusal/exhaustion controls.
A fresh same-size/region retry (616683895, `2026-11-06T20:32:58Z`) reached
nine of twenty complete cells before the operator cancelled it. The 180 measured
samples were retained separately, the droplet deleted and local driver stopped;
**no completed new repeat is incorporated here**. Replacement work now freezes
and all-row validates 1M authors plus 20k readers offline, then restores and
measures through separate commands. Its small real-stack floor is functional
evidence, not a new paper latency/capacity result. Review, large restore,
full-feed load, MinIO publication and upgraded hardware remain separate gates.
Exact hardware/run/cleanup receipts belong to
`research/experiments/costfn/SIXTH-DRAFT-RESULTS.md`.
Harness preparation does not constitute a repeat. The deployed-batched
repeat, paired **same-ClickHouse** pre-authorized comparator, 1M-author
stepped concurrency funnel, full-feed measurement, and final freeze remain
OPEN. A PostgreSQL-versus-ClickHouse speed race is not the intended baseline.
No submission, commit, PR, production deployment, or runtime-default change in this pass.

### Final editorial build verification (not a freeze)

- **13 PDF pages total: body ends on page 12; references start on page 13.**
  PyMuPDF confirms page 13 has only the running header before REFERENCES,
  not spilled conclusion text. Abstract is approximately 143 words.
- **Nine figure floats / ten included rasters**, all present and referenced:
  1 app architecture (p2), 2 composition (p4), 3 query engine (p5),
  4 Mastodon (p6), 5 AT (p7), 6 interop (p8), 7 cross-node (p8),
  8 domain prototype (p9), 9 historical fan-out curve (p12).
- Table 1 (historical B handler/readable p50/p95) is on p11; Table 2
  (proposed load funnel, explicitly assumptions) is on p12. §9.4 begins
  on p10; the floated table/curve follow without barriers. §11 Limitations
  begins p11; §12 Conclusion is wholly on p12.
- **22 cited entries, no unused/missing local bib entries, no unresolved
  citations/references, no overfull horizontal or vertical boxes.** Local
  main-bib entries compare byte-for-byte with the shared source entries.
  `comparisons.bib` and `figs/check-comparisons.mjs` compare byte-for-byte
  with v5 and both comparison layout checks pass.
- The successful Tectonic build still reports font diagnostics (including
  unavailable italic Inconsolata shape/substitution), **49 underfull-box
  notices**, and **10 BibTeX metadata warnings** (missing addresses,
  Jacobs publisher, Zanzibar pages). These are recorded, not suppressed,
  repaired with invented metadata, or called a warning-free build.
- All source-resolution included figures and the revised unused ad figure
  inspected; all 13 PDF pages rendered and contact sheet inspected. Detailed
  first/evidence-table/curve-funnel/limitations-conclusion/reference pages
  inspected. Earlier drafts remain unchanged; v5 source/figure hashes still
  match every baseline receipt entry.
- Receipts: `.context/sixth-draft/verification.json`, `baseline.json`,
  `editorial-final-build.log`, `final/main.log`, `final/main.blg`,
  `comparison-checks.log`, `final-extracted.txt`, `final-page-*.png`, and
  `final-contact-sheet.png`. The generated PDF is
  `research/sixth-draft/main.pdf`. Rendering/checking is editorial evidence,
  not runtime, comparative-platform, capacity, or security validation.
- Editorial Tasks 1–3 and 5–9 are locally implemented subject to operator
  review. Task 3 follows the explicit no-unsupported-census instruction;
  Task 5 leaves D60/E4b open rather than claiming compliance. Task 4/new
  measurements and Task 10/final freeze/upload remain OPEN.

## Inherited fifth-draft decision history (historical, not current status)

The following record was copied verbatim from v5. Its fifth-draft counts,
section/figure numbers, PR intentions, and then-current status describe
that earlier draft only; the sixth-draft record above supersedes them.

## Simplify the supplied node; acknowledge design inside the apps

Operator's screenshots identify the separate web10 app-design box,
app-written SQL in the API box and separate document-shape box. Direction:
"we can take that part out! because it is in the apps themselves right"
and "this api box, gets the request, makes sure it passes security,
returns it!" The document shape "could even go in the clickhouse joins
the hosted documents box." Follow-up: "we can be honest though and show
the web10 apps have more schema stuff in the app development, just add a
little little to the app boxes"

The right side is now the actual supplied path: app sends query + token;
API verifies access and compiles authorized relations; ClickHouse executes;
API returns rows. App-written SQL and the separate app-design box are
removed from the node. `documents` and its field shape move inside the
ClickHouse box. Small warm notes in the social/game/marketplace app boxes
state "JSON shape + feed SQL" / "JSON shape + join SQL", retaining the
developer's responsibility without repeating it as node infrastructure.
The AT reuse/custom-design fork and its warm custom-backend responsibilities
are unchanged. Existing-service reuse is still a real bypass route.

Checks now require app-design notes inside all three web10 app boxes,
document shape inside ClickHouse, query/token on the wire, and no app-code
snippet or app-design box inside the API path. Layout/ownership/fork/storage
checks pass; the revised standalone figure was inspected. Only the AT
figure, PDF and editorial records change; no runtime or new experiment.

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
