1.0.51 || 19.07.2026
D2.5: web10-social UI makeover — rectangles-npm and @chatscope retired,
replaced with tailwindcss v4 + Radix UI primitives + Lucide icons. New
M0 screens on the D4 data layer: Feed (chronological + sort dropdown:
newest/oldest/most_reacted via readFeed), Profile (display name, avatar,
bio, post/media grid via readProfile + readMyPosts + resolveMediaRefs),
DMs (conversation list + message thread via listConversations/readDms/
sendDm), Post Composer (text + photo upload via createPost/uploadMedia).
Empty states point at exporters ("Import your Instagram"). Dark-first
design tokens, responsive layout with sidebar + mobile bottom nav.
12 new component tests (226 total green, 4 legacy skipped).
Stack pick recorded in decisions.md (D2.5-stack).

1.0.50 || 18.07.2026
D4: web10-social data layer — full conventions-schema stack for the M0
killer app slice. new src/data/ with typed modules: posts (CRUD + media
upload via API presigned URLs), feed (chronological inbox + sort dropdown:
newest/oldest/most_reacted via aggregate), profile (read/upsert), contacts
(conventions schema CRUD + search), dms (records-based, deterministic
conversation service names), comments (threaded), reactions (toggle,
aggregate counts). wapi.ts: thin typed fetch wrapper over legacy wapi.js.
Web10SocialAdapter wired with all 30+ new data-layer methods alongside
legacy adapter (backward compat). SMR terms extended for profile, contacts,
inbox, comments, reactions, media services. 55 new vitest tests (227 total,
all green). screens deferred to D2.5 post-B2.5 tokens.

1.0.49 || 18.07.2026
wave-0 security fixes: CORS tightened — allow_origins=["*"] replaced
with origins derived from CORS_SERVICE_MANAGERS + PROVIDER settings;
bare except clauses removed (twilio.py catches TwilioRestException,
stripe.py catches StripeError, auth.py certify() catches only
PyJWTError/ValueError/TypeError); provider URL validation added to
certify_with_remote_provider (scheme allowlist, private-IP/localhost
SSRF guard, length cap, 10s fetch timeout). 280 api tests green.

1.0.48 || 18.07.2026
plan: ui stability specced end to end. the thin playwright line in
CROSS-CUTTING quality/testing expanded into a real item: playwright-
in-docker against the compose stack, ~6-10 smoke journeys across all
three uis (ui signup/login/consent, social post->feed + grant/revoke
terms, marketing-ui route smoke), selenium rejected (flake + grid
drift), visual regression explicitly deferred until B2.5/D2.5
makeovers settle. two ci gaps recorded as items: marketing-ui has
ZERO component tests (--passWithNoTests masks it — backfill item)
and the shared js workflow runs typecheck + build with continue-on-
error (a non-compiling ui shows a green check — fix item under
ci/cd, also noted in wave-0 status). new report-a-bug loop item as
the explicit counterweight to a thin e2e layer: feedback endpoint in
marketing-api + <=2-click report affordance + error boundaries in
all three uis so white-screens convert to reports, not bounces.
ux telemetry item added with the privacy split: marketing-ui gets
full funnel analytics + self-hosted replay (posthog/openreplay --
never third-party saas); platform uis (ui, social) get content-free
aggregate events + a js error beacon ONLY -- session-recording js
there is ruled out by the manifesto ("nobody is mining you") and
phase-11 e2e encryption; replay-grade insight on the platform is
opt-in dogfood/design-partner sessions, consent as the feature.
board: lane C gains C5 (e2e/ harness), lane D gains D10 (report-a-
bug loop) and D11 (ux telemetry).

1.0.47 || 18.07.2026
board refresh: CURRENT CONDUCTOR BOARD in parallel execution.txt
re-cut for the D20/D21 pivot + timeline.md week 0 — ws1 B2.5 stack
pick/tokens, ws2 REPOINTED from C2 sdk (off the M0 critical path)
to D4 data layer, ws3 wave-0 security fixes then A6, ws4 outreach
batch 1 or E1. merge-order notes added (lane A single-branch,
D2.5 waits on B2.5 tokens, B4.5 M0 slice follows B2.5). stale
17.07 board was pointing agents at pre-pivot work.

1.0.46 || 18.07.2026
D21: user billing stripped — users are never charged; credits/space
metering repurposed as OPERATOR-SET quotas (rate/abuse throttle +
storage caps, also closing the import-storage gap); stripe stays for
the creator economy only. the studio monetization-menu screen
(rung-0 cards) promoted INTO the M0 slice — the video shows the
money screen (new lane items A6 + B4.5 M0-slice note; M0 milestone
and timeline week 2 updated). outreach story-ammo gains the x
examples (rev-share pauses, link throttling, reach-suppression as
stated policy) — x-native creators are a fresh burn segment.
KNOWN GAPS gains exporter battle-testing: D5 mappers are fixture-
tested not mess-tested (week 3 real-takeout seeding = first battle
test; promote llm-assisted mapping on first real break; white-glove
absorbs the mess through M2); pitch-honesty facts recorded — youtube
takeout exports content but in 50GB chunks from days-long jobs, the
audience never ports from any platform (content ports, audiences
are pointed), imported video plays direct-mp4 until transcode.
imported-identity relinking recorded as a two-tier accepted
tradeoff: ghost comments with origin provenance now; lazy
claim-by-matching later (joiner's own takeout contains their
comments — match origin+timestamp+text against ghosts and link
automatically, no oauth/verification infra needed).
timeline.md: dated M0→M2 execution schedule. weeks 0-4: B2.5 stack
pick + D4 slice + integration + themed/seeded demo node on the colo
box → M0 gate week (video shot by ~aug 17). weeks 5-10: the rule of
100 (10-15 founder-sent/wk) in parallel with the creator-#1 minimum
build (memberships + amazon tag card, hosted DR floor). verdict
~oct 1; M2 oct-nov if green; breakeven ~mar-apr 2027. two tracks
(machine vs founder) with founder attention named as the gating
resource; ws2 repointed from C2 sdk (not M0-critical) to D4.

1.0.45 || 18.07.2026
the user's side of THE STORY (plan.txt): fans are a CONVERSION
MULTIPLIER on the creator sale, not a second wedge — first sentence
"never miss a post from [creator] + inner-circle status", quiet
second sentence safety (delete deletes, expiry later via D16, not
mined/sold); M0 is creator-community-shaped, not friend-graph-shaped.
wannabe-creator segment added: we never out-dopamine tiktok (no
lottery, no algorithm); the pitch is the LADDER — play the platform
lottery, bank every win here where the house can't take it back —
and since every account is creator-shaped, the user base IS the
creator pipeline (the wordpress flywheel). aspirant psychology
recorded: users want to BE seen, not just see — "your number is
real here" (100% delivery flatters small accounts most; 5k = 5k),
local fame via human curation (creator spotlights, never an
algorithm), own-space-at-signup onboarding; manifesto.md gains the
"you're not just in the crowd" block. THE RISE added: the aspirant's
five-step rise-to-fame arc (free on a creator's node -> real numbers
-> local fame -> pop off -> graduate to your own node, audience
intact) with the economic rule "nobody pays before fame pays them
first" (people can't afford infra until fame pops). GRADUATION added
as a phase 10 item (mastodon Move-style follower auto-migration,
fully live at M3; M3 deliverable gains the graduation demo). ranked
communities added to phase 4 monetization: terms ACLs natively
express membership tiers/ranks (the skool/whop paid-community model
on existing machinery, ~97% payout); paid-community sellers added to
outreach.md as a founding-creator segment (already charge members,
most ban-prone segment); rule recorded: serve the mechanics, never
the aesthetic — gamification layers are post-M2. THE RISE gains its
failure branch: not popping off? switch nodes — identity/content/
followers move sideways (same phase 10 mechanism), scene-market fit
becomes searchable, nodes compete for rising talent, and operators
stay honest because mistreated members walk with their followers.
CLAUDE.md gains the D20 strategic orientation: social platform first,
protocol second — protocol decisions judged by whether they make the
creator platform better; generality for its own sake goes to later.md.
KNOWN GAPS block added to the milestones: the video gap (founding
creators #1-3 must be ones M0's format serves), memberships live
before creator #1 (hard M2 prerequisite), a production hosted-ops
floor before the first white-glove yes, and the dmca/csam t&s gate
as pre-creator-#1 under white-glove hosting. adult-content fork
decided in phase 12 (the wordpress answer, forced by stripe's terms):
inc-hosted nodes + inc rails are clean-only; self-hosted nodes with
their own processor are the operator's business under D10. onlyfans
recorded as market proof (fans pay creators directly at ~$6B/yr, 20%
take vs our ~3%, aug 2021 tried-to-evict-its-own-creators story) —
mechanics yes, positioning never; outreach.md gains the story-ammo
objection entry. phase 4 monetization menu researched + specced
(07.2026 landscape): unlock ladder rung 0-4 — memberships/affiliate
(levanta-class) day one, privacy-safe contextual fill (ethicalads-
class; mediavine journey from ~1k sessions), sponsor-marketplace
adapters (paved 30% / kit 23.5-30% takes = our 3% undercuts 10x),
tracking programmatic opt-in-if-ever (manifesto constraint), and the
M3 marketplace's nano tier ($20 promos at 5k followers — THE RISE
stage 3 gets a paycheck; fame starts paying at 5k here, not 100k).
phase 4 reframed as the STUDIO (youtube-studio mental model): one
pane for post + analytics + revenue + the monetization menu rendered
as a YPP-style unlock ladder (creators already read "X more to
unlock Y"); creator-studio and operator-console personas designed
as separable tabs from day one. zero-friction rule added: every menu
option is a one-button card, adapters do the paperwork (qualify-
gating, media-kit prefill from owned analytics, status tracking);
rung 0 gains auto-affiliate-everything (skimlinks/sovrn pattern —
links rewrite to earn at render); metric = time-to-first-dollar.
composer-level monetization added (phase 8 posting flow): one-tap
attach-product / mark-sponsored / member-gate (terms ACL on the
record) / tips — the youtube-product-tags pattern, earning as part
of the posting habit. amazon adapter v1 specced (07.2026 rules
verified): paste-tag card, render-time /dp/ASIN + ?tag= rewriting
(never cloaked), poster's-tag-wins-else-house-tag revenue routing,
compliance baked in (disclosure chip, no email tags, no stale
prices, 3-qualifying-sales-in-180-days countdown surfaced), pa-api
picker deferred (gated on sales history), levanta/influencer-
storefront as upgrade rungs. lane board gains B4.5: the STUDIO
respec on the post-makeover stack — highest-stakes ui in the repo.
AI product suggester specced (phase 4): scoped read-only llm on
posts profiles the niche → studio suggestions feed + composer-time
attach chips, always human-approved, v1 needs no pa-api; works from
follower #1 (the wannabe gets an ai revenue manager); same profiling
engine becomes the M3 marketplace's sponsor-matching brain; funded
hosted-tier / byok (D19 pattern). first ai feature in the product is
the money assistant — passes the D20 oracle where the chatbox didn't.
new business-plan.md (v1): the lean company plan — automattic model
(free software / hosted subscription / 3% rails / marketplace),
proposed pricing tiers ($49/$199/$499 + 3%; founding creators free
12mo; self-host free forever), unit economics (~$289 rev vs $70-200
COGS per hosted creator), breakeven at ~5-10 paying creators, burn
<$1.5k/mo, bootstrap-through-M2 funding posture, competition answers,
top-5 risks, and milestone gates as kill tests. all numbers marked
as estimates to falsify; pricing marked PROPOSED pending M2. CAC
staged by tier: founder-sends-every-message for 100k-1M creators
permanently (ai-sdr tools rejected for this tier — pattern-matched
as spam; the in-house agent fleet runs the sdr back office instead:
sourcing, enrichment, gap computation, draft-for-review), instantly/
clay-class volume infra only for the post-M2 starter tier, flywheel
as the scale CAC machine; outreach.md gains the agent-assisted-
founder-sent division of labor. financial projections built out
(§6a-e): 24-month bear/base/bull table (bear caps at ~$12k sunk;
base breakeven ~month 9-10, ~$170k ARR month 24; bull ~$1M ARR),
cumulative cash view ($0 outside capital required), KPI funnel
dashboard, sensitivity ranking (close rate #1), and a "where this
model lies" section (churn/LTV invented, $3k creator-revenue
assumption, flywheel-shaped growth, founder time at $0). funding
section expanded (§8a-c): no-investment path itemized (~$10-13k
to breakeven), with-investment path ranked by leverage (creator
guarantees — the substack-pro play — then designer, t&s, growth
infra; pre-seed ~$350-500k compresses timeline ~12mo), and the
raise trigger: never before the M0 gate, window opens at early M2
traction, raise to accelerate a working machine, never to discover
if it works. cost model corrected to real numbers: $200/wk tokens,
$100/mo colo (64gb xeon hosts ~10-30 early nodes → ~$5-15 COGS/
creator, 90%+ early margins), c-corp + trademark already done,
founder-made demo video; ~$10k total to breakeven at ~$1k/mo burn.
honest infra caveats recorded: single-box SPOF (off-box backups +
restore drill for founding period, redundancy by paying tiers; colo
bandwidth = video ceiling, R2 offload first) and the $6 dmca
designated-agent registration as the one immediate legal spend.
ec2/cloud compute explicitly rejected in the plan (4x compute cost,
egress pricing is poison for a social/media platform, off-message
for the ownership company); DR pattern = restore to hetzner-class
dedicated on failure, second box at paying tiers, one-container
node keeps infra reversible. horizontal-xeon scale path recorded
(creator nodes are independent → embarrassingly parallel, failure
domain 1/N per box, same-facility caveat → off-site DR floor).
kill test upgraded to the RULE OF 100 (plan.txt M0, outreach.md,
business-plan): 20 sends carry ~36% false-kill risk at a true 1/20
close rate (0.95^20) — the verdict needs 100 sends, run in batches
of 20 (batch one iterates the pitch), ~10-15 founder-sent per week
(agent-drafted) over 8-10 weeks, segment split ~35/35/30, gate
counts only with a meaningful video-watch share.
business-plan §11 added: strategic alignments + exit posture —
the open documentdb/ferretdb stack alignment as a NOW distribution
asset (vendor devrel amplification; the M0 video travels to warm
senior relationships as a progress note); plausible 5-year
strategic homes described in loose terms only (public repo — no
named companies or contacts in exit speculation); rule:
bought-not-sold, roadmap never bends toward an acquirer.
new manifesto.md: the fan-facing join-page manifesto every node ships
(templated per creator, "you're not the product here — you're the
point", no unshipped promises). site architecture settled in the docs
cross-cutting section: ONE creator-first marketing site (web10.app,
hero = THE STORY, cta = founding creator); fans convert on the
creator's node via the manifesto page (wordpress/shopify pattern);
no users tab, just a thin "powered by web10" footer explainer.

1.0.44 || 18.07.2026
outreach.md: the sales kit for M0's kill test (D20) — list-building
queries (creators self-identify: shadowban/demonetization complaints,
announced substack/rumble moves), cold email + DM + manager + call
copy, cadence, and objection cheat sheet. core frames: lead with
THEIR subs-vs-views gap; the ask is ADD not MOVE ("you already post
to 5 platforms — this is #6, except you own it"), ~24h back-catalog
onboarding via the exporters, 3 white-glove founding-creator slots,
one per niche. plan.txt STORY beat 4 sharpened to the add-not-move
frame. list-building has no prerequisites; sending waits on the M0
slice + demo video.

1.0.43 || 18.07.2026
plan refactor (D20): the proposition is creator ownership — "own your
audience, no shadow ban, this is a product for influencers." plan.txt
gains THE STORY (the influencer pitch: subs-vs-views reach gap, AI-
influencer urgency, 100%-delivery-by-architecture, hedge-not-exodus,
kick/twitch-grade slick — never fediverse jank); thesis rewritten to
lead with it. M0 redefined: "stands on its own" — post, feed
(chronological + sort dropdown ONLY), profile, dms; deliverable = the
pitch (story deck + demo video for creators), kill test = twenty
creator pitches, not a viral video. feed customizability, preset
lenses, the lens record, and the llm chatbox CUT from the roadmap to
later.md (promotion bar recorded there; D19's byok architecture
stands if it returns). lane board D4/D2.5 updated so no agent builds
the chatbox; GLOSSARY lens entry updated. new decision D20 in
decisions.md.

1.0.42 || 18.07.2026
later.md: new parking lot for far-out ideas that are deliberately NOT
roadmap — vibe-coded apps/themes (the "real gutenberg"; no template
dsl ever, tiers are theme-record now / generated apps far-later),
the amorphous generative-ui app (shell + surfaces, generate-once-
then-harden), and the conference-paper angle (lens as user-owned
algorithm, scoped llm tokens; www/cscw/soups-class venues). each
entry records why it's good AND why it's parked, with a promotion
bar: m0 video shipped + a creator asked for it. distilled from a
strategy review of plan.txt (killer-app-vs-protocol dependency,
creator p&l, m0-first focus).

1.0.41 || 17.07.2026
lens chatbox llm backing re-planned (plan.txt phase 8): BYOK-only —
v1 key stays client-side, chatbox calls go browser -> provider direct
so the node never sees the key or the chat; presets work with zero llm;
phase 11 upgrade puts the key in the phone wallet as an e2e-encrypted
record the phone beams to the apps the user picks; node-provided
inference demoted to a capped operator opt-in, never the default.
new decision D19 in decisions.md.

1.0.40 || 17.07.2026
wave 0 seatbelt — endpoint-level permission-matrix suite (45 new tests,
280 total api tests green). runs through the FastAPI app (TestClient)
so route-level bugs the unit layer misses are caught:
  - auth flows: signup (success, reserved, bad username, duplicate),
    web10token login (password, wrong password, no creds)
  - CRUD routes end-to-end: create/read/update/delete with permission
    checks (authorized, denied, no token, cross-origin, blacklisted)
  - aggregate endpoint: valid pipeline, forbidden stage ($out),
    no permission
  - star protection (I3): cannot update/delete/create star record,
    cross-collection access impossible
  - forged token rejection (I1): tokens signed with wrong key rejected
    on all CRUD + aggregate routes (JWT error handler added to main.py)
  - scoped token enforcement (I5): read-only tokens cannot create,
    no-target tokens: owner allowed, non-owner denied
  - metering/billing: charge called on create/read, services read
    unmetered, out-of-credits denied, out-of-space denied
  - certify endpoint: valid, forged, expired, anon token
  - system endpoints: stats, get_plan
  - also: bare exception handler in main.py maps legacy Exception("TOKEN")
    etc. to proper HTTP 401s; JWT PyJWTError handler catches forged/
    expired tokens before they hit the bare handler; fixed models.dotdict
    -> dotdict bug in documentdb.py

1.0.40 || 17.07.2026
Setup wizard + admin config screen (Phase 3/4 partial, lanes A3/B3/B4):
  - API: /ready (health check, reports configured status), /setup (GET status,
    POST first-run wizard), /config (GET current config, PATCH partial update).
    All endpoints hidden from OpenAPI schema (include_in_schema=False).
    New services/config.py: node_is_configured(), admin_exists(), save_config(),
    generate_jwt_keypair(), create_admin(). New models/config.py: SetupRequest,
    SetupStatus, ConfigUpdate, NodeConfig pydantic schemas.
  - UI: SetupWizard component — 6-step onboarding flow (Welcome -> Node Identity
    -> Admin Account -> Access Policy -> Storage -> Complete). Detects unconfigured
    nodes via /ready and redirects to setup automatically.
  - UI: ConfigPage component — admin node configuration panel. Editable fields for
    all node settings: identity, access policy (beta/verify/pay toggles), free tier
    defaults, S3/media storage, Twilio SMS, Stripe payments. "Node Config" link
    added to SideBar for authenticated users.
  - App.tsx: setup detection on mount, "setup" and "config" modes added to router.

1.0.39 || 17.07.2026
adapter rename: api/app/services/mongo.py -> documentdb.py. the module is
backend-agnostic (pymongo speaks to either real Mongo or FerretDB/DocumentDB),
so the name should reflect the storage layer, not the old vendor. all imports,
test files, and patch paths updated. test files renamed: test_mongo.py ->
test_documentdb.py, test_mongo_crud.py -> test_documentdb_crud.py,
test_mongo_aggregate.py -> test_documentdb_aggregate.py. 235 tests green.

1.0.38 || 17.07.2026
E2: marketing deploy — marketing-api/Dockerfile (multi-stage python 3.12 + uv +
uvicorn), docker-compose.marketing.yml (standalone compose for marketing-ui +
marketing-api), ubuntu-deploy.sh full rewrite (marketing compose copy with path
fixup, Caddy proxy with separate RTC subdomain, auto build+start for node and
marketing, proper DNS/TLS instructions). both images tested green locally.
the 5th verb — aggregate (plan phase 6, lane A4). appmakers get (nearly)
the full mongo query language without losing usage metering:
  - api: POST /{user}/{service}/aggregate. read-only by construction —
    the server prepends $match {service, body.service != "*"} ->
    $addFields body._id (stringified) -> $replaceRoot to body, so the
    dev's pipeline runs on clean user-space docs and cannot name the
    service/star fields (I3). terms treat it as "read".
  - sandbox validator: stage allowlist ($match/$project/$group/$sort/
    $skip/$limit/$unwind/$addFields/$set/$count/$facet/$bucket/
    $bucketAuto/$sample/$sortByCount); $where/$function/$accumulator/
    $lookup/$graphLookup/$unionWith/$out/$merge rejected at ANY nesting
    depth (deep scan catches $facet sub-pipelines, $group accumulators,
    expression trees). invalid pipelines 400 before touching the db.
  - resource caps: maxTimeMS 2000ms, 20-stage cap, $limit/result
    ceiling 1000 docs, allowDiskUse off.
  - usage tracking preserved: charge() gains a units param; aggregate
    is charged per pipeline stage (COST_AGGREGATE 0.000005 x stages)
    into the same credits_spent ledger, gated by the same credit/space
    check as the 4 crud verbs.
  - sdk: wapi.aggregate(service, pipeline) in wapi.js (typed variant
    comes with the C2 rewrite); cdn + node dist bundles rebuilt.
  - tests: 28 new api tests (validator, scoping, metering) — 233 green;
    4 new sdk tests — 52 green. verified live against a real mongo 7:
    scoping, star invisibility, forbidden-op rejection, per-stage
    charging, and the http endpoint (200/400/401) all exercised.
  - protocol-spec.md section 9 updated from "planned" to shipped, with
    metering table + error rows.

1.0.37 || 17.07.2026
infra: ubuntu-deployment script + Caddy reverse proxy for Proxmox staging node; LANE E added to parallel execution board.

1.0.36 || 17.07.2026
ci/cd repair — tests across the WHOLE repo now actually run:
  - js-ci: dropped the dead exporters job (dir deleted in the 1.0.31
    migration), added marketing-ui and mobile/encryptor (55 bun tests,
    previously NO ci at all). the sdk job was dying at bun install
    (no bun.lock, only package-lock.json) so its 48 tests never ran —
    bun.lock now committed for sdk + marketing-ui. test failures now
    report red: continue-on-error removed from the test step (rtc
    opts out via tests:false — it has no suite yet). test:run script
    standardized in sdk + encryptor (encryptor's script claimed jest;
    the suite runs on bun test).
  - marketing-api: had NO ci, no lockfile, no tests. new workflow
    (uv sync + ruff + pytest), uv.lock committed, ruff/pytest dev
    deps, 4 smoke tests (health, pageview, schemas, validate_record).
    ruff immediately caught two real bugs, now fixed: upload_zip used
    background_tasks without declaring the BackgroundTasks param (the
    ZIP upload endpoint crashed on every call) and instagram.py
    called find_json_entries without importing it (instagram parsing
    crashed). 7 unused imports cleaned, ruff format applied. the
    57-test exporter mapper suite is STILL OWED as pytest ports —
    the smoke tests keep the wiring honest until it lands.
  - media.yml deleted (media/ merged into api in 1.0.30; the workflow
    watched a dead path and could never trigger).
  - docker.yml + cd.yml matrices rebuilt around the Dockerfiles that
    exist (api, ui, sdk, rtc, marketing-ui); exporters/media/home/
    crm/mail entries removed — those builds failed on every run since
    the phase-7 tidy.
  - marketing-ui: fixed real type errors the old continue-on-error
    was hiding — missing vite-env.d.ts (css imports + import.meta.env
    didn't typecheck) and a spread over possibly-null ImportProgress
    state. typecheck + build green; test:run passes with no tests
    (--passWithNoTests) until a real suite lands.
  - .gitignore rewritten (was full of deleted dirs: auth2, exporters,
    rtc, web10-deploy, skaffold): global node_modules/, __pycache__/,
    .venv/, *.egg-info/, .expo/, dist for the ui builds, .env.
    untracked from the index: ui/dist (22 files), mobile/.expo,
    web10-cli's node_modules remnant. sdk/dist stays committed on
    purpose — the sdk Dockerfile serves it as the wapi.js cdn.
  - verified locally end-to-end: api 205 pytest, ui 43, sdk 48,
    web10-social 172, encryptor 55, marketing-api 4 — all green.

1.0.35 || 17.07.2026
board sync: fixed plan.txt / parallel execution.txt drift against the
changelog — C1 (media, landed 1.0.25, merged into api/ 1.0.30-31) and
D3 (mobile encryptor, landed 1.0.27) were still marked [~] in flight;
wave-0 status still said github actions ci was open (skeleton landed
1.0.32); the three cd items in plan.txt were unticked though cd.yml
shipped in 1.0.32; phase 7's crm/mail item described an examples/ move
that never happened (they became web10-social sub-apps, 1.0.30); the
conductor board was a day stale; lane C ownership still claimed the
deleted media/ dir. CLAUDE.md refreshed: api described by its 1.0.31
layered layout (models/services/endpoints), auth2 -> ui rename and
crm/mail integration reflected. drift guard added to ci: changelog.yml
gains a board-sync step — errors when the newest CHANGELOG version
isn't strictly greater than every existing entry (duplicate 1.0.30s
prompted this), warns when CHANGELOG.md changes without a plan.txt /
parallel execution.txt tick in the same pr.

1.0.34 || 17.07.2026
Created marketing/ umbrella folder and moved marketing-api/, marketing-ui/,
web10-cli/, and web10-social/ into it. These four projects share a purpose:
making web10 accessible (marketing site, import pipeline, CLI tool, social
lens app). Updated all path references: js-ci.yml workflow paths + package,
marketing-api validation.py schema path, CLAUDE.md directory listing,
decisions.md D12, plan.txt phase 2.5/7/8 references, parallel execution.txt
lane D ownership. Top-level tree now: api, ui, marketing, sdk, mobile.

1.0.33 || 17.07.2026
Consolidated rtc/ into api/rtc/ (WebRTC signaling is a backend service,
not a top-level dir) and docs/ into marketing-ui/public/docs/ (dev docs
belong on the marketing site, not as a standalone dir). Updated all
references: docker-compose.yml, web10.app.yml, web10.dev.yml, CI workflows
(docker.yml, js-ci.yml, cd.yml), marketing-api validation.py schema path,
CLAUDE.md directory listing. Top-level tree is now clean: api, ui,
marketing-ui, marketing-api, sdk, mobile, web10-social, web10-cli.

1.0.32 || 17.07.2026
ci/cd: implemented the github actions pipeline (wave 0 skeleton). seven
workflow files: api.yml (uv sync, ruff check+format, pytest, path-filtered
on api/**), media.yml (same for media/**), js.yml (reusable: bun install,
tsc, vitest, build — continue-on-error for visibility-first), js-ci.yml
(calls js.yml per package for ui/sdk/web10-social/exporters/rtc),
docker.yml (buildx matrix for all 9 Dockerfiles, gha layer cache,
linux/amd64), changelog.yml (flags PRs that touch code without updating
CHANGELOG.md, skippable with label), cd.yml (ghcr.io multi-arch push
on merge to main, npm publish with provenance on tags, release notes
from CHANGELOG). replaced stale github-packages.yml and npm.yml.
all checks report pass/fail — no branch protection yet (visibility
first, gatekeeping is a deliberate later flip).

1.0.31 || 17.07.2026
Restructured api/ into a clean layered layout: models/ (Pydantic schemas),
services/ (business logic — auth, mongo, media, stripe, twilio, records),
endpoints/ (routers — auth, crud, media, payments, system). main.py is now
just app init + middleware + router includes. Test suite expanded from 118
to 205 tests: added media models, media services, mongo CRUD + media helpers,
stripe pure logic, twilio pure logic, auth service gaps (authenticate_user,
certify_with_remote_provider, check_admin, password hash/verify).

1.0.30 || 17.07.2026
Merged media service into api/ as a single FastAPI router. The standalone
media/ service (port 6001, media.localhost) is gone — media routes now
live at api/ (port 6000) under the same app, auth, and CORS config.
api/app/media.py carries the router; models, mongo helpers, S3 settings,
and boto3 are consolidated into api/. docker-compose.yml no longer
spins up the media container; minio stays on the all-spark-proxy network
for the api to reach directly.

Removed chrome-extension/: browser extension was too high a friction
bar for mainstream adoption. it was fully isolated — zero external
references, no CI/CD, no backend integration, no docs mentions.

marketing-api: new FastAPI service — ZIP import pipeline (server-side
streaming parse, validate, dedup, batch write to user's node), analytics
endpoints (pageview tracking, funnel events). Exporter UI moved from
exporters/ into marketing-ui/ (now talks to marketing-api via job polling
instead of browser-side ZIP parsing). Instagram/Facebook/YouTube mappers
ported to Python. Legacy home/ and exporters/ dirs deleted, home service
removed from docker-compose.yml.

1.0.30 || 17.07.2026
web10-social: CRM and Mail integrated as sub-apps in the social super
app. CRM (Rolodex) has contact CRUD, color-coded priority, per-contact
notes, search, and color filtering. Mail has compose, inbox, send/receive
via the mail web10 service. Both use the existing wapi adapter with new
crm-contacts, crm-notes, and mail service registrations. 35 new vitest
tests (20 CRM, 15 Mail). Old standalone crm/ and mail/ folders removed.
Shared mock factory (mockAppInterface.ts) created for all test files.

1.0.30 || 17.07.2026
marketing-ui: new project — consolidated home/ + docs/ + App Store into
one marketing site (Vite + React 19 + TS + Bun + react-router). Home page
rebuilt from home/index.html (hero, features, stats, team, footer). Docs
page renders docs/ markdown via remark. App Store moved from ui/ to
marketing-ui/ (public-facing app discovery belongs on the marketing site,
not inside the node's auth UI). ui/ default mode changed from "appstore"
to "contracts"; AppStore component, appListingInterface, mockAppData, and
related state removed from ui/.

1.0.28 || 17.07.2026
plan: specced the github actions ci/cd pipeline in full (new
"CROSS-CUTTING — ci/cd" section in plan.txt). ci: path-filtered
monorepo jobs (api: uv+ruff+pytest; js: reusable bun+tsc+vitest+
build workflow per package; docker buildx with layer cache),
visibility-first: checks report pass/fail but do NOT block merging
— branch protection is a deliberate later flip once suites earn
trust (I1-I5 checks graduate to required first). changelog-check
job (prs touching code should touch CHANGELOG.md), fork-safe (no
secrets, mocked stripe/twilio), permission/conformance suites join
the pipeline when they land. cd: ghcr.io multi-arch images on merge + the
web10/node image on tags, npm publish (sdk, create-web10) with
provenance on tags, release notes generated from CHANGELOG entries.
skeleton is landable today against the 1.0.21 unit tests — it does
not wait for the endpoint suite. wave 0 in parallel execution.txt
now points at the spec; workflow ownership follows lane ownership.

1.0.27 || 17.07.2026
plan: added phase 6.5 — the dev on-ramp (create-web10). a scaffolder
published under the npm create-* convention (npm/pnpm/yarn/bun create
web10, npx create-web10 — one package covers every runner), with a
5-minute time-to-first-record acceptance bar, vanilla-ts + react
templates on the phase 6 sdk, a node story (sandbox node default,
local docker, or any --node url), ci that scaffolds+builds templates
so they can't rot, and an explicit no-persistent-cli-yet scope guard.
queued as C3.5 in parallel execution.txt, sequenced after C2 (sdk).

1.0.29 || 16.07.2026
plan: added phase 2.5 — the ui makeover. retire the homemade
rectangles-npm framework from every ui (ui/, web10-social/), replace
with a mainstream stack (tailwind + shadcn/ui as default candidate),
plus a story-first product design pass (shared design tokens,
narrative screens, the M0 demo as the acceptance bar). queued as
B2.5 (ui/) and D2.5 (web10-social) in parallel execution.txt; B2.5
sequenced before B3/B4 so wizard + admin panel are built on the new
stack.

1.0.27 || 16.07.2026
Lane D5 — multi-platform social import engine (Instagram, Facebook, YouTube):
  - exporters/src/: full implementation — zip parsing (@zip.js/zip.js),
    platform detection, schema mapping, AJV validation, wapi batch writer,
    import engine orchestration (parse -> map -> validate -> write)
  - Instagram mapping: posts (text, media, comments, tags, mentions,
    location), profile, follows/contacts from Meta takeout JSON
  - Facebook mapping: posts (text, privacy, location, attachments),
    photos (dimensions, description, privacy), friends list, comments
  - YouTube mapping: videos (title, description, duration, stats,
    thumbnails, privacy), comments (threaded replies), channel profile
  - React UI: platform selector cards, per-platform guided takeout
    checklists (6 steps each), drag-and-drop ZIP upload, live progress
    bar, per-service write summary table, error details
  - 57 tests (15 Instagram, 18 Facebook, 14 YouTube, 10 validation)
  - Vite + Bun + React 19 + TypeScript, multi-stage Dockerfile

1.0.28 || 16.07.2026
web10-social: full TypeScript + Vite + Bun modernization (Lane D):
  - migrated from CRA 5 (react-scripts) to Vite 6 + bun + TypeScript
  - React 18 -> 19, removed dead deps (install, npm, react-router-dom,
    react-usestateref, web-vitals, react-scripts, axios)
  - all 21 components, 5 interfaces, 8 mocks converted to .ts/.tsx with
    full type definitions (AppInterface, Post, Message, Contact, etc.)
  - eliminated giant mutable I={} anti-pattern — proper React hooks with
    typed return objects
  - fixed: Math.random(1e15) no-op, var declarations, loose equality,
    index-based keys, stale closures, defaultValue on controlled inputs,
    broken typing-indicator ternary, dead mock-data in real interface
  - removed vendored Bulma (~100 files), uses ChatScope styles
  - vitest suite: 137 tests across 12 files

1.0.27 || 16.07.2026
mobile/encryptor: complete rebuild — foundation, wallet/keyring, UI, and tests.
Expo 44->52, React 17->18, React Native 0.64->0.76, bun package manager.
crypto.js: pure ESM crypto core (no Expo deps) — HKDF-SHA256 derivation,
ed25519/x25519 keypairs, xchacha20-poly1305 encrypt/decrypt, grant wrap/unwrap,
device cert create/verify. wallet.js: SecureStore-backed persistence layer
wrapping crypto.js. React Navigation v6 tab-based UI: SetupScreen, WalletScreen,
KeysScreen, GrantsScreen, SettingsScreen. 55 bun tests across 8 files covering
helpers, key derivation, keyring verbs, signing, encryption, grants, device
certs, lifecycle — all green. Deleted obsolete encryptor.js and CodeInput.js.

1.0.26 || 16.07.2026
Phase 2 completion — auth2 parity, rename to ui, delete legacy auth/:
  - auth2 -> ui/: full rename, docker-compose updated (auth2 context -> ui,
    legacy auth/ service + volumes removed)
  - Interface.tsx: complete API integration — wapi/wapiAuth wired from
    authAdapter, setStatus for status messages, SMR listening via
    initAuthenticator, servicesLoad to load services from API, changeTerms
    to persist service updates via wapi.update, submitSIR for new service
    creation, purgeSMR for request denial, sendToken for OAuth flow,
    deleteService/wipeServiceData for destructive operations, sendCode/
    verifyCode for phone verification, changePassword, changePhoneNumber,
    getPlan for live subscription display, Stripe redirect methods
    (manageSpace, manageCredits, manageSubscriptions), DevPay methods
    (manageBusiness, businessLogin)
  - OAuth flow: OAuthBanner component in App.tsx detects referrer, shows
    pending SMRs, auto-sends token on login when no requests pending
  - RequestPage: full rewrite — renders pending SIRs/SCRs from I.SMR,
    Approve/Deny buttons wired to I.submitSIR/I.purgeSMR
  - ContractViewer: delete terms and wipe data with confirmation dialogs
    (previously [TBD] placeholders calling non-existent methods)
  - Subscription: live plan data from I.getPlan() replacing hardcoded values
  - VerifyPhone: sendCode/verifyCode wired to wapiAuth, code state tracking
  - ChangePhone: wired to I.changePhoneNumber(password, phone)
  - ChangePassword: wired to I.changePassword(current, new, retype)
  - DevPay: wired to I.manageBusiness() and I.businessLogin()
  - Form inputs (Phone, ConfirmationPass, NewPassword, ReTypeNewPass):
    accept value/onChange props for controlled usage in Settings
  - MockInterface: full parity with Interface shape (all new methods stubbed)
  - Tests: 44/44 passing (updated login/signup mode assertions: appstore ->
    contracts, the authenticator's post-login default)
  - auth/: deleted (legacy CRA React 16 app, superseded by ui/)
1.0.25 || 16.07.2026
Phase 5 media service (greenfield, Lane C):
  - media/: new FastAPI service with presigned S3 upload URLs, short-lived
    presigned read URLs (60s expiry, per-read issuance, logged per D14),
    metadata record creation in user's collection (ordinary {service:"media",
    body} per D13), and media record listing/deletion
  - Auth mirrors api's is_permitted/certify logic against the "media" service;
    terms/ACLs are the single source of permission truth with zero new concepts
  - S3 config supports any S3-compatible backend (MinIO self-hosted, R2, B2,
    Wasabi) via env vars; MinIO added to docker-compose on a dedicated
    media-network
  - pyproject.toml (uv, python 3.12, boto3), Dockerfile, models.py (upload,
    read, metadata schemas), settings.py, mongo.py (terms lookup, CRUD),
    auth.py (token verify, is_permitted), main.py (5 endpoints)
  - docker-compose: media service (port 6001, media.localhost) + minio
    (port 9000, console 9001) with minio-data volume

1.0.24 || 16.07.2026
agent task-status hygiene (agents were re-attempting merged work):
  - parallel execution.txt: lane queues now carry live status markers —
    [✓ x.y.z] merged (A1, B1, D1 ticked with their changelog versions),
    [~] in flight (C1, D3), [ ] open; wave 0 marked PARTIAL (unit layer
    landed in 1.0.21, endpoint permission-matrix suite + CI still owed);
    rule 3 extended: tick your lane item in this file on merge; stale
    "suggested first board" replaced with a dated current board
  - added AGENTS.md: orientation entry point for non-Claude agents
    (codex/qwen read AGENTS.md, not CLAUDE.md) — points to CLAUDE.md and
    states the check-before-you-start + tick-on-finish rules; QWEN.md
    pointer added too (Qwen Code's default context file)
  - added .conductor/settings.toml with a repo-wide general prompt
    reminding conductor agents to check done-status before starting
  - CLAUDE.md: new "check it isn't already done" convention; changelog
    convention now includes ticking the parallel execution.txt lane

1.0.23 || 16.07.2026
plan: phase 11 gains "the keyring api" — the record-model discipline applied
to keys: user-named keys (audience = any string, like a service name), cheap
one-call minting (hkdf from the master seed), principals are pubkeys not
usernames, wrap targets are pubkeys OR other named keys (membership, nested
circles, and backup become the same verb), a small closed verb set with
revoke as a composition, {v, suite} version ids on every wire format, a
no-policy-in-keys scope guard, and a futureproof checklist that gates the
design review (person / circle / circle-of-circles / single record / whole
service / llm agent on timed grant / device / hls stream / multi-admin
group / node migration).
decisions: D18 — keyring is generic like the record model; named keys +
closed verb set; node grows zero key-specific endpoints.
glossary: keyring.

1.0.22 || 16.07.2026
plan: phase 11 (e2e encryption) fleshed out from sketch to full design —
phone-as-wallet key hierarchy (one master seed, HKDF-derived identity +
per-service keys, key manifest record), WhatsApp-Desktop device linking over
P2P WebRTC (companions encrypt/decrypt alone, traffic never proxies through
the phone), envelope encryption with audience keys + epochs, layered
revocation (node gating instant / epoch rotation forward / optional
re-encrypt), node-enforced timed grants, media double door (presigned URL +
key), backup/recovery via trust splitting, honest operator-metadata section.
also flags rtc's unsigned-decode + trust-a-200 check as the I1 bug in
miniature (gets the JWKS fix before carrying keys).
decisions: D15 (multi-device: phone is root, linked companions, no
phone-proxying), D16 (revocation layered: node gating + epoch rotation;
timed access is the node's clock, not magic keys), D17 (crypto suite pinned
to standards — X25519/Ed25519, HPKE, XChaCha20-Poly1305, Argon2id, MLS as
graduation path; no web3, no invented crypto).
glossary: wallet, device linking / device cert, audience key / epoch, grant,
key manifest, live handout.

1.0.21 || 16.07.2026
unit test infrastructure:
  - api: added pytest suite (118 tests) covering mongo.py transformations
    (q_t, u_t, to_gui, to_db, star_found, get_approved, is_in_cross_origins),
    main.py auth logic (kosher, can_mint, certify, decode_token, is_permitted),
    models.py pydantic schemas, and web10records.py factories
  - auth2: added vitest + @testing-library suite (config, contractInterface,
    mockInterface, mocks) with jsdom environment and setup file
  - sdk: added vitest suite (48 tests) covering wapiInit (token management,
    CRUD guards & HTTP calls, peerID, authListen, SMR, P2P init, dev pay)
    and wapiAuthInit (login, signup, changePass/Phone, send/verify code,
    Stripe mgmt endpoints, SMRListen, sendToken, mintOAuthToken)
  - review fixes: gitignored api/*.egg-info build artifacts, removed a
    broken/unused conftest fixture and an ineffective import.meta stub,
    tightened a tautological is_permitted assertion, moved
    @testing-library/dom to auth2 devDependencies
  - scope note: this is the UNIT layer only (mocked DB, no HTTP).
    outstanding endpoint-level tests (FastAPI routes, star protection,
    metering, twilio/stripe) are itemized in plan.txt "testing:"

1.0.20 || 16.07.2026
D1 docs: apply review fixes to protocol-spec.md — cross-origin bypass is on
username=="anon" (not site); _id is intentionally queryable (only service is
protected); token-to-token minting checks the submission token's site; array
pull requires a top-level PULL:true flag; reads/deletes on `services` are
unmetered; verify-phone error string matches the code exactly (trailing
period); planned aggregate endpoint is POST, not GET (GET can't carry a body).
D1 docs: protocol-vs-profile layering — conventions.md now opens with a scope
note (application profile, NOT protocol; nodes never enforce these schemas;
only `services` and `*` are reserved); `service` removed from all schemas in
docs/schemas/ and inline (the service name is the URL path, not a record
field, so real wire records now validate); new additive-only Versioning rule;
schemas validate exporter (P9) / killer-app (P8) output while the conformance
suite tests protocol-spec.md only; follows convention now names the terms
whitelist (not cross_origins) for cross-node inbox delivery; plan.txt D1 and
phase-8 wording aligned ("real interop work").

1.0.19 || 16.07.2026
plan: new LATER item — schema contracts: opt-in, per-service schema enforcement
via a "schema" field on the service's terms record. Node stays generic (runs
whatever schema it's handed, like whatever ACL it's handed); no contract means
no validation. Notes the open design questions (partial updates, grandfathered
records, additive-only evolution) and flags it as a candidate to promote into
phase 6 alongside the update-widening work.

1.0.18 || 16.07.2026
D1 docs: protocol spec (docs/protocol-spec.md) — full specification of the web10
protocol derived from the codebase: data model (user collections, {service, body}
envelope, field prefixing), authentication (token format, minting, certification,
is_permitted authorization, federation migration plan), CRUD API (create/read/
update/delete with pagination, star protection), metering, error responses,
security invariants (I1-I5), and the planned aggregate endpoint (sandbox,
allowlist, denylist, resource caps).
D1 docs: social conventions doc (docs/conventions.md) + JSON schemas
(docs/schemas/*.json) — standard service schemas for all social apps and
exporters: posts, media, contacts, follows, comments, reactions, profile, inbox,
and lens. Each schema is versioned, loosely-typed (additionalProperties: true),
and includes origin/origin_id fields for imported content coexistence. The
conformance suite and exporters will validate against these files.

1.0.17 || 16.07.2026
decisions: D13 — media fits the record abstraction: "service" stays the data
namespace, no /{user}/{service}/{collection} restructure; media metadata is an
ordinary {service:"media", body} record so terms/ACLs apply unchanged.
decisions: D14 — media reads via per-request presigned URLs (30-60s expiry,
issuance logged); check-at-issue-time gap consciously accepted, API-proxy and
per-request auth-proxy alternatives rejected (proxy remains a later
tightening option, not a redesign).
plan: phase 5 read-url and metadata items tightened to carry the D13/D14
specifics (per-read issuance, expiry window, logging, record shape).

1.0.16 || 16.07.2026
plan: CROSS-CUTTING docs gains the missing explanation quadrant — "for
everyone" block ahead of the guides: "what is web10" concept pages (mental
model: node, record, tokens+terms, lens, federation), per-audience why pages
(user / creator-influencer / dev / operator, productizing pitch.txt's
vs-crypto and vs-cloud arguments), and how-it-works diagrams as code
(mermaid over plantuml — starlight/docusaurus render it natively). unlike
guides these aren't milestone-gated: the architecture exists, so they're
writable now and double as the marketing site's core copy.

1.0.15 || 16.07.2026
docs: fix D1 consumer list in parallel execution.txt — (C4, D3, D4) → (C4, D4, D5),
matching the sequencing rule "D1 before C4/D4-schemas/D5" (D3 mobile encryptor
has no D1 dependency)
plan: new CROSS-CUTTING docs section — three doc surfaces, three homes:
generated OpenAPI reference ships with the api (invest in annotations, optional
Scalar UI), protocol spec + conventions live in-repo as versioned markdown +
JSON Schema (conformance suite tests against them), docs/ becomes an MkDocs
Material site (embeds OpenAPI, mkdocstrings, sdk typedoc; no hosted SaaS docs)
plan: phase 7 — home/ + docs/ -> marketing-ui/: inc's website + dev docs as ONE
site (docs are part of a saas marketing site), rebuilt on the ui toolchain
(vite + react + bun), own vhost, never in the node compose; stays in the
monorepo by choice (one dev, lean). repo reads api / ui / marketing-ui.
docs site framework lean updated accordingly: js-native (starlight or
docusaurus) instead of mkdocs, since it lives inside marketing-ui.
decisions.md: new D12 recording the api / ui / marketing-ui repo trio.
plan: docs section simplified — split by audience not tool; adds the missing
user/creator guides (they ARE the saas marketing content, written per
milestone as features ship); dev docs = D1 spec + generated references

1.0.14 || 16.07.2026
phase 0 completion — RTC modernization + docker image rebuild + cleanup:
  - rtc service: node:15 → bun, index.js → index.ts with types, npm → bun,
    added tsconfig.json, updated package.json (web10-rtc, ESM, typescript)
  - auth2/Dockerfile: new multi-stage Dockerfile (bun dev target + static deploy)
  - auth/Dockerfile: node:14 → bun (legacy UI, deprecated in phase 2)
  - api/Dockerfile: already modern (uv, python3.12) — no change needed
  - docker-compose.yml: pipenv → uv, npm → bun, nodemon → bun run dev,
    added "ui" service (auth2), legacy auth shifted to port 3001,
    removed version: "3" (deprecated), renamed rtc volume

  - removed docker-compose-lite.yml, docker-compose-nginx.yml, custom.conf
    (one compose file is enough, people can figure out deployment)
  - removed web10-deploy/ (stale GCP configs, skaffold k8s manifests)

1.0.13 || 14.07.2026
phase 0 typescript migration:
  - renamed all 34 .jsx files to .tsx (React) or .ts (non-React)
  - added global.d.ts for Window.I augmentation
  - fixed dynamic object pattern with Record<string, any> type assertions
  - fixed document.getElementById casts to HTMLInputElement
  - fixed .toFixed().toLocaleString() type error
  - updated index.html entry point to main.tsx

1.0.12 || 14.07.2026
phase 0 auth2 toolchain modernization:
  - migrated auth2 from create-react-app to vite 6 + bun (index.html entry,
    src/main.jsx, vite.config.js, bun.lock; removed react-scripts + package-lock.json)
  - react 18 -> 19; renamed all components .js -> .jsx; vitest replaces jest
  - removed react-inject-env + web-vitals; package renamed auth2 -> web10-ui
  - gitignored auth2/dist/ build output

1.0.11 || 14.07.2026
phase 0 python toolchain modernization:
  - switch to uv for package management (pyproject.toml, uv.lock, removed Pipfile + requirements.txt)
  - python 3.12, fastapi 0.139, pydantic v2, PyJWT 2.13, stripe 15, twilio 9, gunicorn 26, uvicorn 0.51
  - pydantic v2 migration: .dict() -> .model_dump(), Optional[X] -> X | None, ConfigDict(extra="allow") on Token model
  - removed infisical dependency (pyinfisical.py, settings.py integration) — env vars only for secrets
  - pruned dead deps: python-ldap, python-gnupg, systematic, future, secrets (pypi)
  - Dockerfile: slim python3.12 image with uv (no pipenv, no nodejs base, no apt libsasl/libldap)
  - added ruff for lint+format (pyproject.toml config, legacy style issues excluded for now)

1.0.10 || 14.07.2026
added plan.txt : phased roadmap (0-12) — toolchain modernization, documentdb/
  ferretdb switch, unified ui + setup wizard, creator admin panel + analytics,
  media/s3 layer, wapi.js + aggregate verb + mcp, killer social app (first-party,
  in-repo) + the lens chatbox, social exporters, user backups, e2e encryption,
  trust & safety. plus cross-cutting quality/testing/security and milestones M0-M3.
added parallel execution.txt : 4-lane plan for running Conductor workspaces in
  parallel without merge conflicts (lane ownership + wave-0 test seatbelt).
added CLAUDE.md, GLOSSARY.md, decisions.md : agent onboarding + shared context.
documented a CONFIRMED federation security bug : providers don't cryptographically
  validate each other (HS256 symmetric signing) — fix is HS256 -> RS256/EdDSA + JWKS.
established five end-to-end security invariants (I1-I5) enforced by the test suite.

1.0.9
added infisical secrets management.
added pipenv for api python package management.
made the settings.py file have defaults.
made configs managed by .env file.
made CORS_SERVICE_MANAGERS from list to comma sep. strings.
made COST dict env var type multiple env vars.
some use case presentations in the sdk folder.

1.0.8 || 11.10.2023
Made the CHANGELOG
Any time there is an improvement / change to the project, that improvement /
change will go here
1.0.8 is the most recent release!
I don't even remember what I improved from 1.0.7.
That is the exact reason why it is beneficial to have a changelog.
