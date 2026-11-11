The Derived Realism Dataset + Full Rerun Plan — SIGMOD cost-function experiments
Date: Nov 10, 2026; amended Nov 11 · Status: operator direction (Jacob) — supersedes the
input and run-scope sections of final-experiment-plan.md; all protocol discipline
in that plan (pre-declared targets, per-shape receipts, infra-invalid vs system
results, failures kept) remains fully in force.
Companion evidence: "Social Media Distribution Evidence" (goal document) —
the researched literature base for every parameter below, with sources and
evidence grades. Full research report retained in the research notes.

**Governing amendment (11 November):** read
[REALISM-DATASET-DECISIONS.md](REALISM-DATASET-DECISIONS.md) first. It preserves
the operator's full directive and implementation approval. The new input is a
**derived realism dataset**, not an additive modification of V2. V2 files and
base-series receipts stay untouched. One source governs each quantity;
van Mierlo alone governs authorship. Build a coherent joint model and an
independent oracle; pass 10k/100k floors before the 1M build. No droplets,
uploads or spend until the validation gates pass and the operator has seen the
generated statistics receipt. Existing tooling is not yet compliant: its 5/4
GiB allocation and one-post-per-creator oracle are historical, not the rerun.
The new local tools and their remaining integration gates are mapped in
[REALISM-DATASET.md](REALISM-DATASET.md); do not run the old Phase-1 entry point
as if it already imports this new format.

**Later operator approval, same day:** after the passing floors and measured
local scratch were reviewed, one monitored 400-GB DO preparation host is
approved instead of a blind local 1M retry. Private staging to existing web10
MinIO is separately approved after validation/hash checks. Exact scope,
original deadline, setup attempts, monitoring and cleanup limits are in
[REALISM-CLOUD-PREP.md](REALISM-CLOUD-PREP.md). Earlier local-only preparation
wording is superseded for this host; distributions, guard, validation and
separate full-study/production/submission gates are not waived.

1. The decision
The base fixture is structurally sound but demographically empty in the places
a real 1M-user node is heaviest:
content_events (impressions) is not in the fixture at all — a running
  study stack held ~40–60 rows (the study readers' own window-deduped
  deliveries) against 1,000,000 posts. Every post in the evaluation had been
  seen exactly once, by the person measuring it.
Node ads: zero, while the sequence reads an ad inventory on a TTL cache.
Engagement (reactions/comments per post) and authorship (posts per user) are
  thin and near-uniform where every measured platform is heavy-tailed.
Plan: generate a separately identified derived realism dataset — accounts with
latent activity/popularity jointly generating original posts, follows,
engagement, impressions and plausible timestamps — then rerun the entire
programme on it (10k/100k floors, 1M build, operator receipt review, paid pilot,
§6). Do not merely relabel old post authors. Published source distributions
govern the declared model (§2); this is synthetic evaluation of a modelled
1M-account node, not data-identical production traffic. V2 files and base-only
receipts stay untouched as history; they stop being what the paper cites.
Why rerun: the dataset table (§5) should demonstrate a validated synthetic
population of 1M accounts, jointly heavy-tailed activity and a viral post, not
an empty events table. Literature parameters and validation make the modelling
choices inspectable; they do not prove identity to real production traffic.
2. Evidence base and the three rules
Parameters are adopted from the researched literature. Strongest anchors:
Authorship, sole governing source: van Mierlo (JMIR 2014) — <25% of accounts
  ever posted; jointly measured post shares 74.7% / 24.0% / 1.3% for top 1% /
  next 9% / bottom 90%. Adopt 85% nonposting original-post accounts. Profiles
  do not count; report like/comment-only participation separately. Top-10%
  share is derived as 98.7%, not fitted independently. Pew's authorship target
  is withdrawn, including as a paper cross-check; other sources must not be
  blended into this contract. The governing decision preserves the required
  census-versus-Pew justification and moderated-health-community caveat.
Degree: Kwak et al. (WWW 2010) — followers power-law α = 2.276 (41.7M
  users). Ugander et al. (2011) — Facebook degree is heavy-tailed but not a
  strict power law (mean 190, median 99 friends).
Per-item engagement: McGrady et al. (JQD:DM 2023), a true random sample of
  10,016 YouTube videos — views mean 5,868 / median 35 / top 3.67% of items
  = 93.61% of views / top 0.16% = 50.52%; likes mean 16.48 / median 0
  (88.71% of items have zero); comments mean 5.32 / median 0; derived
  views:likes ≈ 356:1, comments:likes ≈ 0.32. Corroborated by Cha et al.
  (2007/2009) and Chatzopoulou et al. (2010).
Virality: Goel et al. (2016, ~1B events) — >99% of cascades end within
  one generation; ~1/1,000 reach ≥100 adoptions.
Modern shape check: Quelle & Bovet (PLoS ONE 2025, Bluesky, 5M users) —
  likes/post, reposts/post, comments/thread, posts/user all heavy-tailed.
Source rule — One governing source per quantity, recorded in the manifest and
paper. Use van Mierlo for authorship, Kwak for followers, Ugander for following,
and McGrady for per-post likes/comments/impressions. Other cited observations
below provide context only, never competing calibration targets. Reach and ads
are declared parameters; the total delivery budget is derived from attention.
If quantities conflict, preserve their governing distributions and explicitly
adjust totals/time horizons under REALISM-DATASET-DECISIONS.md §7; report the
arithmetic before generation, never silently relax a distribution.
Rule 1 — Conservative adoption. Where the literature gives a range, adopt
the end adverse to our system (the value that makes our measured costs
worse), and print the rule in the paper. Never step outside a sourced range.
Rule 2 — Conservation closes. Likes received = likes given; impressions
are bounded by audience × attention. The derived dataset's totals must satisfy these
identities (this is what rules out brand-page averages as population
parameters: Socialinsider-style brand means — e.g. 335 likes/post on
Instagram — run ~15–200× above random-sample population means and, applied to
every post, would require ~1,300 likes given per user and ~460B impressions
on a 1M-user node: arithmetically impossible, and the generator would drown
producing them).
Rule 3 — Declared, not discovered. Every distribution is a declared design
target, printed with its source. The paper states plainly that parameters
model a mature 1M-account node assembled from cross-platform published
evidence; they are not measurements of web10's current production traffic
(the ~600-account production snapshot is reported separately, as before).
Known-thin spots (declared in the paper, one clause each): comments:likes
is a wide measured range (0.01–0.35) — we adopt ~0.3, the adverse end;
impressions-per-post rests on video-catalog evidence applied by analogy
(median + concentration transfer; the mean is set by the node's attention
budget under Rule 2, not imported from YouTube); reach (distinct viewers) is
barely measured anywhere — adopted at the adverse end (~0.8 distinct per
impression at ordinary scale). Broido & Clauset (2019) caution applies
throughout: claim "heavy-tailed," not "power-law," where the fit is ambiguous.
3. Adopted derived-dataset parameters (frozen when the pilot starts)
Quantity
Adopted target
Source anchor
Accounts that never post original posts
85%; profiles excluded, like/comment-only participation reported separately
van Mierlo 2014 (sole authorship source)
Post shares of top 1% / next 9% / bottom 90% of all accounts
74.7% / 24.0% / 1.3%; top-10% share = 98.7%, derived, never an independent fit
van Mierlo 2014; replaces the withdrawn blended 70%/80% target
Posts per posting user and in-store maximum
Outputs of the joint model and chosen horizon, reported from finished records;
the old median 1–2 / exponent / ~5,000 maximum are not competing authorship targets
van Mierlo contract plus declared joint-model/time-horizon choices
Following per user
median ~75, mean ~150
Ugander; Kwak
Followers per user
median ~30, α ≈ 2.2, in-store max ~300k
Kwak; Mislove
Reactions (likes) per post
median 0, mean ~16, top 0.16% of posts ≈ 50% of all likes
McGrady 2023
Comments per post
= likes × ~0.3 (adverse end)
McGrady; Chatzopoulou
Impressions per post
median ~50 (35–100), top ~3.7% of posts ≈ 93% of impressions, in-store max ~1M
McGrady; Cha
Reach
~0.8 × impressions at ordinary scale, saturating on viral items
declared (thin evidence, adverse end)
Total impressions (events)
Attention budget under Rule 2; the original 150M / 30-day estimate is subject
to pre-generation feasibility. Preserve governing distributions, declare any
adjusted total and horizon in the stats receipt and paper, never silently clamp
conservation; REALISM-DATASET-DECISIONS.md §7
Node ads
~300 ads across groups
declared (fills the zero)
Follows per study reader (K)
20 standard; 100 / 1,000 as the existing study cells declare
study design (unchanged)
Totals (documents / events / graph links) are outputs of the coherent joint
model and explicit horizon at 1M total accounts, computed from the finished
store (§5), not copied from a recipe. The nominal authorship split requires
P >= 0.05N/0.013 original posts; median 50 impressions plus 93% in the top
3.7% requires I >= (0.5-0.037)P*50/0.07. Together these imply roughly 1.27B
impressions at 1M accounts, so 150M is not an unconditional target. These are
necessary bounds, not an approved final total or generated evidence. Reconcile
all totals/horizons and estimate generation/storage cost before any generation;
see the governing decision's feasibility section. Do not independently scale
counts to fit hardware while retaining incompatible medians/concentration or
change the pinned envelope. Report any remaining conflict before proceeding.
The executable contract now declares `P=4N` and `I=400P`: **1.6B impressions
and a 320-day horizon at 1M accounts**, under the operator's §7 adjustment rule.
This preserves the sourced shares/medians rather than relaxing them; actual
floor/generated statistics must validate the joint construction. The chosen
total/horizon and coupling parameters are in `realism_contract.py`, not a claim
about production traffic. Local resource admission may still block the 1M build.
4. Derived realism dataset build spec (for the workspace)
New deterministic generator, format/name, seed, manifest, file/source hashes
  and dataset identity. Keep every V2 file and base-series receipt untouched;
  never reuse their IDs. Generate once, validate, then import the frozen new
  files per trial (§12); no post-restore additive layer or mere author relabel.
Joint model: account-level latent activity/popularity jointly drives original
  posts, following/follower choices, post popularity, engagement and deliveries.
  Rebuild hot/dispersed cohorts from that graph; K is the declared follow count,
  not the number of active authors or eligible posts. Active/popular authors
  should produce/receive more, follows bias toward active accounts, and dormant
  accounts cannot own viral original posts except an explicitly modelled case.
  Spread prolific authors' timestamps over the declared history; count profiles
  separately from original posts and likes/comments-only participation.
Components: (a) original posts/profiles and current groups/links; (b) reaction
  and comment documents assigned to actual eligible accounts, with exact
  giving/receiving conservation; (c) delivery content_events with valid readers,
  impression/reach/audience bounds and a ~1M-impression post inside a real
  followed-set feed; (d) ~300 node ads. Every reference resolves and each
  interaction/delivery timestamp follows its referenced post under the declared
  horizon and visibility. Generate these together, not as independent marginals.
Dedup/version semantics preserved: engagement counts obey the same
  latest-version / tombstone rules as base documents; the satellite build's
  dedup-before-count invariant is exercised by construction (the oracle
  verifies counts from canonical documents, as always).
Independent oracle: retire the V2 one-post-per-creator assumptions for this
  dataset, without changing historical V2 inputs/receipts. Derive expected feed
  candidates/order, joined profiles, engagement and delivery/reach counts from
  finished records independently of the generator's sampling logic. Preserve
  current-version/tombstone/authorization/visibility checks; no weakened oracle.
Validation before the 1M build: local 10k AND 100k account floors must pass
  marginal checks, conservation, referential/timestamp integrity, directed
  joint correlations and each K/hot/dispersed cell's per-reader distribution
  of active followed authors, candidate posts and nonempty feeds. Report zero
  participation and missing/error states, not only successful feeds. Recipe
  parameters or marginal-only fits are not validation. The finished-store
  receipt (§5) must meet declared tolerances (shares ±5 points, medians
  exact-order, scaled-floor/viral-head rules declared before execution,
  conservation to the row). A contract miss is setup failure, never data.
Research runner: rerun cells use the independent oracle and the 28 GiB
  container / 22 GiB ClickHouse envelope (§12), identically for baseline and
  treatments. Keep the 5 GiB sensitivity cell explicit. No paid provisioning,
  uploads or spend until generator/oracle/validation pass and the operator has
  seen the generated statistics receipt; then verify pilot budget, lifetime
  cleanup and exact SKU eligibility before provisioning.
5. The stats receipt → the paper's dataset table
The validator emits a machine-generated stats table from the finished
store: for each quantity — total, mean, median, p99, max, top-1% share —
plus store totals (accounts, original posts, profiles, documents, content_events,
doc_groups and graph edges), directed joint-correlation checks, per-cell
candidate distributions and exact conservation/referential/timestamp results.
Record source-per-quantity, adjusted totals/horizons and reasons, finite-size
tolerances, input/source hashes and independent-oracle results. A declared
parameter is not a measured statistic. Keep failures and preparation logs.
**The paper's dataset table is transcribed from this receipt, and the receipt
is retained in the repo.** If generated data drifts from targets, the receipt
is what prints. Next to it, the paper carries the §2 sources and the Rule 1–3
statements — that page is the dataset's defence.
6. Run plan
First: feasibility arithmetic → new generator/independent oracle/validator and
  declared runner envelope → passing local 10k/100k floors → 1M build and
  finished-store statistics → operator receipt review. No paid resources,
  uploads or spend before this gate. Catalogue availability alone is not a pass.
Pilot: one Study B 1M cell (3 trials) on the derived realism dataset. Purposes: prove
   generation time per trial, validate the stats receipt, shake the harness
   on the big store. Pilot trials count toward the rerun if clean.
Full rerun from the top, all on the derived realism dataset: Phase 0 floors and
   gates → Study B (9 trials) → Study C (18) → Study A (18) → Study P (3) →
   Study X (3). The earlier ~25–30 min/trial / one-day estimate is unverified
   for the revised total/horizon; recompute it from the floors and pilot, not
   as a spending promise. The runner's receipt-resume discipline applies
   unchanged; per-shape native breakdowns now retain per-query fingerprints
   (the harvest fix) on every trial.
gate15 (counting_numbers satellite) on the final treated sequence —
   its build now counts a realistic engagement store, which is the version
   of the satellite result the paper wants.
Views gate re-check on the realism store: ordinary feed and
   viral-post feed reported separately (treated contentViews vs. ~1M
   stored impressions on a returned post).
Phase 2 — the 37k-DAU demonstration on the realism store, at the
   conservative workload reading (state think time; 46 feeds/s at 30s or
   23/s at 60s, mix as declared), success criteria unchanged from the
   ratified plan.
Sensitivity cell (§12.1 — an envelope-comparison on the SAME realism store, NOT
   a base-store number): one extra b-1m at the ORIGINAL local envelope
   (container cap 5 GiB, CH server limit 4 GiB), 3 trials, reported as an
   envelope-sensitivity point. The printed bridge between the base series and
   the rerun series; tests whether the treated sequence's efficiency survives
   the tight allocation on the big store. Expected to be the flakiest cell
   (5 GiB cap + the realism store = disk-bound + 241/137) — that roughness is
   the finding, not a harness bug. Everything else in the rerun uses the
   §12.1 envelope only.
§8 production migration decision unchanged — still a separate,
   explicit operator call after the evidence is in.
7. Freeze discipline
Derived-dataset parameters (§3) freeze when the pilot starts. A parameter change
  after that restarts the rerun clock; treat any urge accordingly.
No treatment changes mid-study; the derived realism dataset is the input,
identical for matching cells, Arm A and treated alike — it must never become
  a confound between arms.
Base-only results are kept, labelled, and superseded for citation —
  keep every iteration, as always.
8. What the paper gains
§9.1 dataset section: the generated table + cited distributions + the
  three rules. Reviewers argue with the literature or not at all.
Every downstream number (cost tables, scaling, K envelope, satellite
  ablation, DAU demonstration) inherits the dataset's credibility.
The journey narrative gains its final honest beat: the first series ran
  on a store whose emptiest table was the one production fills fastest —
  found by our own Step-0 classification, corrected at the input, and the
  whole programme re-run rather than footnoted.
9. Risks and valves
Schedule: the rerun is the schedule's main consumer; v7 drafting
  proceeds in parallel and does not wait for it. Freeze is Nov 20; the
  plan holds ~8 days of buffer after the rerun.
Generation cost: reconcile §3 distributions, totals and horizons first; estimate
   the much larger store before floors. No silent proportional downscaling of
   incompatible quantities, changed envelope or paid spillover. Report any
   remaining resource/consistency conflict before generation/provisioning.
A realism bug found mid-rerun: receipts make it visible per-trial;
  the pilot exists to find it in hour one. If it is found late, the
  affected cells re-run; the freeze rule (Rule: no silent input changes)
  means the input identity in every receipt tells us exactly which cells
  are affected.
10. Briefing for the seventh draft — what must be explained, and how
The workspace drafting v7 works from this section for every place the
evidence needs an explanation, a hedge, or a narrative beat. Each item:
the fact, its support status, and the move v7 makes with it.
10.1 The thin-support register (explain, don't hide)
Comments:likes ratio. Support: measured range is wide — ~0.32 in the
  McGrady catalog sample, ~0.05–0.15 in feed/brand populations
  (Chatzopoulou's per-400-views accounting sits higher still). Adopted:
  ~0.3, the adverse end (Rule 1). v7 move: dataset section reports the
  range and the adoption rule in one sentence; no point-value claim about
  "the" ratio anywhere.
Impressions per post. Support: no peer-reviewed distribution exists
  for text-post impressions (industry medians only); the strong evidence
  is for video catalogs (McGrady; Cha). Adopted: median and concentration
  shares transfer from the video evidence; the total is set by the
  node's attention budget (Rule 2), never imported. v7 move: one clause
  in the dataset section marking the analogy explicitly ("video-catalog
  evidence applied to posts; totals fixed by conservation").
Reach (distinct viewers per post). Support: thinnest parameter in
  the table — platform-analytics metric, barely measured in public
  literature. Adopted: ~0.8 distinct per impression at ordinary scale
  (adverse end), saturating on viral items. v7 move: the dataset table
  footnotes it as a declared parameter; no prose claim rests on it.
"Pareto" language. Support: heavy tails are certain; strict power
  laws are not — Ugander's Facebook degree distribution curves, and
  Broido & Clauset (2019) find only ~4% of 928 networks strongly
  scale-free, with log-normal/Weibull often fitting as well (Bild et al.'s
  posting shape is a discrete Weibull). v7 move: the paper says
  "heavy-tailed" as the default adjective; "power-law" appears only
  where a cited fit supports it (e.g. Kwak's follower exponent), and
  the dataset table's shape column names the family per row.
90-9-1. Support: Nielsen 2006 is a practitioner rule of thumb; his
  own examples range from 95-5-0.1 (blogs) to 99.8-0.2-0.003 (Wikipedia).
  The measurement is van Mierlo 2014 — with its own caveat: four health
   support networks, not general-purpose platforms. v7 move: van Mierlo alone
   governs original-post participation and the 74.7/24.0/1.3 concentration
   split; 85% nonposting is the declared choice within its measured bound.
   Never blend Nielsen/Pew into calibration or use Pew as a cross-check.
Why van Mierlo, not Pew (required v7 explanation): preserve the full argument
   in REALISM-DATASET-DECISIONS.md §5. Van Mierlo's complete server-side census
   (four networks, 63,990 accounts, 578,349 posts) jointly measures nonposting
   accounts and concentration; Pew's 2,791 consenting U.S. adult handle sample
   does not measure the registered-account zero class and counts retweets/quote
   tweets. The chosen census matches this account-store modelling question.
   State that these were moderated health communities. Top-10% share 98.7% is
   the consequence of the split, never an independently tuned target.
Cross-platform, cross-era assembly. Follower evidence is 2007–2011;
   van Mierlo is moderated health communities; McGrady is one video platform; Bluesky (2025)
  confirms the shapes on a modern platform but with exponents we could
  not extract. v7 move: Rule 3's declaration sentence (parameters model
  a mature node from published evidence; not web10 production
  measurements) plus, in Limitations, the era/platform-mixing caveat.
  One sentence each — declared, not apologised for.
Brand-page benchmarks. Excluded as parameters (15–200× above
  random-sample population means; conservation-impossible at population
  scale — see Rule 2). v7 move: at most one sentence citing them as a
  declared upper reference the design deliberately does not follow,
  with the random-sample alternative named as the basis.
Do-not-cite register: the 2026 AI-authored, unreviewed "X attention
  inequality" manuscript (impression Gini 0.965) — flagged in the
  research as non-evidence; never cite. Reddit distributions — no
  peer-reviewed source exists; the paper makes no claim needing one.
  Ordinary-user Facebook/Instagram per-post engagement — industry data
  only; unused.
10.2 Development findings to recheck on the derived dataset for v7
The numbers below are preserved base-series diagnosis, not rerun results.
Carry their methodological lessons, but use only reviewed rerun measurements
for the paper's result tables (§12.1); never pool absolute values. Describe the
new input as the derived realism dataset, not the old fixture plus an additive
layer. Earlier approved manuscripts remain historical; these are v7 tasks.
The views episode (dataset section + journey). The base fixture
  ships no content_events; Step-0 classification (Phase 1.6) found the
  study's views were ~40–60 self-generated rows against 1M posts, and
  corrected a misattribution (gate-B's "views = 3.7M followup-armA"
  label was actually the reactions/comments partitions; erratum in
  gate-B stands). The views treatment fixed the real cost — the
  doc_groups readability subquery (4,100,060 → 1,240 rows at 1M,
   byte-identical output, #1474). v7 move: the derived realism dataset is
  presented as the input-level correction of a self-found flaw; the
  misattribution is disclosed in one honest sentence in Methods
  (shape labels are classifier hypotheses; fingerprints are evidence).
Views, the production axis (Limitations / future work). Even after
  the readability fix, views counting cost in production scales with
  per-post popularity, not store size — a viral post's impressions are
  counted over its own event slice. The study measures this on the
  realism store (seeded history; viral-post gate), but the durable
  production answer is write-maintained counters: the delivery-logging
  path maintains counting_numbers as it logs (same generic table,
  D60), making reads point lookups at any virality. The research
  satellite is snapshot-built; incremental maintenance under
  versioned documents is D109/IX work and is not claimed.
The partial trial (Study C, c-k20-d t2). 17/30 feeds with **zero
  ClickHouse exceptions** — every query completed; the failures were
  API-layer timeouts on the residual engagement follow-ups for a heavier
  reader. v7 move: report it as a system result (it stays in the
  cell), and use it as the satellite's motivation: at K=20 on the full
  store, untreated follow-ups are the difference between completing and
  timing out for heavier readers.
K=1,000 is a measured bound, not an embarrassment. Under the
  study's concurrent sample: 0/30 mains (400/403); a single feed still
  succeeds. v7 move: the operating envelope is stated as measured —
  claims live at K=20–100, K=1,000 is the documented edge. Relatedly,
  reader cost scales with the followed corpus (a few prolific
  followed authors dominate), the framing Jacob set: real follow sets
   are a few heavy authors plus mostly quiet ones — the derived dataset's
  authorship shape is what makes the C cells speak to this; a
  per-author newest-page cap is named as future work, not implemented
  or claimed.
Hot vs dispersed (Study C). Main-treated rows scale with K for
  dispersed readers (82k → 123k) but stay flat (~41k) for hot readers —
  recent-window locality. v7 move: one explanatory sentence; it is
  evidence the sort key's time component does real work.
The readable-resolution fossil (diagnosis). Arm A's fingerprint
  included a ~460k-row readable-group resolution scan at 10k — the old
  resolver's invisible cost, bypassed by the treatment's point
  verification (in treated runs the whole "other" category at 1M is
  ~172k rows). v7 move: belongs in the Phase-0 diagnosis narrative,
  labelled as Arm-A-shape evidence.
241 vs 137 (Methods, one short paragraph). The pinned setup runs
  ClickHouse's server memory limit (4 GB) strictly inside the container
  cap (5 GB), so overload surfaces as code 241 (a query refused, server
  alive — a system result) instead of a kernel OOM-kill, exit 137
  (process dead, logs lost — an infra failure). This distinction is
  the basis of the runner's keep-vs-rerun rule and is worth explaining
  because several headline numbers (Arm A's preserved failure, Study
  A's OOM'd trials) only make sense with it stated.
Cached Discover vs live Following (workload explanation). Phase
  2's mix rests on the design rule: Discover in balanced mode is a
  shared/public surface, served from a cached computation; the personal
  Following feed is per-user and computed live ("eat it"). v7 move:
  state the rule where the workload mix is declared, as a design
  property, not a benchmark trick.
Research treatments vs shipped code (claim hygiene). The Arm D
  rewrite, follow-up treatments, views fix, and satellite are
  research-stack treatments (flag-gated; production entry points never
  see the flags). v7 move: every result table's setup line keeps this
  explicit; the §8 migration (bundled re-key + integer-version rebuild,
  create → copy → parity → flip) is described as the adoption path,
  claimed only as far as it has actually happened at submission time.
  Production-port caveat for the text: group-as-author posts
  (author_key = group_id, real poster in posted_by) mean a
  production author-set may need both keys per group — the fixture's
  parity does not prove the mixed case; the production compiler falls
  back to the group-based CTE where the shortcut does not apply.
The production snapshot vs the modelled node. The paper reports
  both: web10's real production snapshot (hundreds of accounts) as the
  deployment evidence, and the 1M-account realism store as the
  evaluation input. v7 move: never blur them; the DAU claim attaches
  to the modelled store and the Phase-2 demonstration on it, and the
  sizing extrapolation uses the core-seconds formula, labelled derived.
10.3 Do-not-claim register (v7)
No strict-power-law claims beyond cited fits (§10.1).
No brand-benchmark numbers as population parameters.
No fixed-dollar capacity claim for a million users (Jacob, Nov 9:
  with a million people actually coming you need more hardware —
  pooled sizing via the formula only).
No claim that the satellite solves incremental indexing, that views
  costs are popularity-independent, or that posting/fan-out write costs
  are evaluated (read path only; follower-group size effects on writes
  are named as scope, §10.2).
No research-treatment number presented as a production-endpoint
  number.

10.4 The media scope boundary — pending v7 addition (Jacob, Nov 10)
Not yet in the draft; add to v7 in two places, plain language only (a scope
statement, not a pitch; no "byte delivery" / "payloads" / "delegated" wording).
- Methods / evaluation scope (one short paragraph): "Media files live in MinIO
  and are not part of the measurements. In practice, most requests for those
  files never reach MinIO at all — a CDN in front of it serves them. Posts
  referencing media are in the measurements, as documents." BEFORE stating the
  CDN sentence as fact, check it against the production / deployment record; if
  the CDN is the deployment pattern rather than a verified current fact, phrase
  it conditionally ("in a production deployment, …"). If space is tight
  (12-page body), shorten to: "Media files live in MinIO and are not part of
  the measurements. Posts referencing them are, as documents."
- Limitations / Future Work (one sentence): "Serving media at scale — object
  storage plus a CDN, and what that costs a node operator — is a separate
  question from the document queries studied here, and a subject for follow-up
  work." (A follow-up direction only; not work already done or measured.)
- Why: media is a different axis from the document layer this paper measures
  (finding / ordering / authorizing posts in the canonical documents store).
  Files live in MinIO (an ordinary S3 store); benchmarking them would measure
  MinIO, not web10. A CDN in front serves most real-world file requests. Posts
  that reference media ARE in the measurements (as documents pointing to
  files); their file size does not change the document query.
- Do NOT: add photo/video files to the dataset or benchmarks; benchmark MinIO
  or any CDN; claim any media-serving performance/cost/capacity number; change
  any existing measurement, table, or result; reintroduce pitch-style language.
- Done when: both placements are in v7 in plain language; the CDN sentence
  matches what the production/deployment record supports (conditional if
  unverified); the paper still fits 12 pages. No measurement/dataset/result was
  changed by this.

11. Dataset release — "web10-social-1m" (operator direction, Nov 10)
The paper frames the evaluation store as a released dataset, not a
private fixture — the closest available substitute for the canonical
benchmark this workload lacks (LDBC SNB, the standard synthetic social
benchmark, models graph interactions and has no impression/delivery-event
model; the related-work paragraph in §10 terms states the delta).
What ships (the release is the generator, not the rows):
The new derived-dataset generator — deterministic, seeded SQL/scripts with
   a new format/identity/manifest and an independent oracle. Original V2 files
   and receipts remain historical records, not the new dataset's identity.
The frozen parameter table (§3) with its literature citations, and the
  stats-receipt validator: anyone can regenerate the store and check the
  published statistics against their copy.
A README stating the model (documents / doc_groups / content_events),
  the three rules (§2), and the thin-support register (§10.1) — the
  caveats travel with the data.
Size, honestly: release generator/validator code, the parameter contract and
validation receipts; report generated file/native sizes and generation time
from the derived dataset's actual receipts, not the old V2 archive. The old
~150M-event / single-digit-GB / minutes-to-generate estimates are unverified
after the authorship/attention feasibility correction and must not be printed
as facts. The generated store is the large object, not the release code. An
optional pre-generated snapshot may additionally be deposited with a DOI
(Zenodo or Hugging Face Datasets) for readers who want the bytes
directly; the paper's availability statement cites the repo, and the DOI
if minted by submission time.
Paper framing (v7): an availability statement — "We release
web10-social-1m, a literature-parameterised synthetic node dataset
(1M accounts; heavy-tailed authorship, engagement, and impression
distributions per Table N, parameters cited therein), with its generator
and validation statistics" — placed with the dataset section, plus the
SNB positioning from §10. Claim hygiene: the release is announced as
available; no adoption or standard-status language (that is for later
papers to confer).

## 12. Execution substrate — DigitalOcean, parallel + shared-store import
(operator addendum, 10.11.2026; input/gate amendment 11.11.2026 — reverses the local-only constraint for the
realism rerun; the base-only receipts stay local and labelled & superseded)

After local generator/validation floors, the 1M build and operator receipt
review, everything in the measured rerun (§6: Phase 0 gates, B, C, A, P, X, gate15, Phase 2)
runs on DigitalOcean droplets, in parallel. This resolves the two risks the
plan carried: the realism store (totals recomputed under the governing directive)
does not fit the Mac's 7.65 GiB VM / 5 GB CH cap (disk-bound, slower, more
241/137 on the A + K=1000 cells), and per-trial dataset generation is the new
time sink.

### 12.1 Uniform substrate + the declared envelope (amended 10.11.2026)
- **Uniform substrate:** every rerun droplet (D1-D5, Phase 2 included) is the
  SAME SKU and configuration — vCPU count AND RAM, not just RAM. No study runs
  on a bigger or smaller machine than another; cross-study comparability depends
  on it (and the Phase 2 load cell needs the vCPU headroom on record). Receipts
  record the substrate block per trial: provider, SKU (vCPU + RAM), ClickHouse
  server limit, container cap, store seed.
- **The envelope is a declared constant, not "RAM minus headroom"** (replaces
  the earlier sizing rule): droplet class **32 GiB**; pinned, identical
  everywhere: **container cap 28 GiB, CH `max_server_memory_usage` 22 GiB**
  (the local series' ~0.8 server/cap ratio, scaled), **4 GiB outside the
  container** for OS + API. Commodity sizing for a 1M-account node, chosen once
  before the pilot and frozen. The droplet's RAM buys page-cache residency +
  speed OUTSIDE the tracked allocation; it does not vary the experimental
  envelope.
- **Baseline parity:** Arm A and every untreated cell run under the SAME
  declared envelope as the treated cells. The baseline gets full resources on
  purpose (Rule 1 applied to hardware: the adverse-end choice). Whatever Arm A
  does at this envelope IS the baseline result — completion or failure, reported
  as measured.
- **Citation rule:** the paper cites the rerun series for all results.
  Base-series absolute numbers are never pooled with, or printed alongside,
  rerun absolutes — different declared envelope. The base series is referenced
  as protocol development, receipts retained in the repo. Methods (verbatim, for
  §10 / the paper): "The protocol and treatments were developed and debugged on
  a local workstation under a constrained 5 GB store allocation; all results
  reported here were measured on the declared node sizing (a single 32 GiB
  server; ClickHouse allocated 22 GiB within a 28 GiB container cap) on the
  released dataset, with one sensitivity cell at the development allocation.
  Development-phase receipts are retained in the project repository."

### 12.2 Shared-store import — generate once, pull per droplet (fixes the gen cost)
- Build the derived realism store **once locally after passing 10k/100k floors**:
  the new coherent seeded generator (§4) -> the full store as importable
  files (`documents.jsonl.gz`, `doc_groups.jsonl.gz`, `content_events.jsonl.gz`,
  ...) + the new manifest/identity + the §5 stats receipt. Suggested name:
  `web10-social-1m realism-derived v1`; seed and source/file hashes are pinned.
  No V2 ID reuse, relabelled original rows or per-trial regeneration.
- Only after validation passes and operator receipt review, upload the
  approved store to object storage (the existing MinIO, or a DO Space / S3
  bucket). It is shared, versioned by seed, pull-able by any droplet.
- Each droplet trial **PULLS** the store from S3 and loads it into its fresh CH
  volume (the restore step loads pre-generated data instead of running the
  generation SQL) -> no per-trial regeneration, no per-machine drift.
- Resolve distributions/totals/horizons together under §3 before generation;
  no independent scale-down that breaks them. Any approved revised store has
  a new identity and is built/validated once, then pulled. The §5 receipt is
  the finished-store check, not a declaration that the recipe is correct.

### 12.3 Parallel split (one droplet per study; trials sequential on a droplet)
- Cache residency remains a pilot check, not an assumption. Run one trial at
  a time per droplet under the fixed CH cap. After the pilot is reported and
  admitted, studies split across independent droplets in parallel:
  - D1: Phase 0 floors + gates + Study B (9 trials)
  - D2: Study C (18 trials)
  - D3: Study A (18 trials)
  - D4: Study P (3) + Study X (3)
  - D5 (after B-X land): gate15 (satellite) + Phase 2 (37k-DAU load demo)
- Wall-clock is dominated by the longest worker (C or A, ~18 trials) plus
  gate15/Phase 2. Use measured floor/pilot trial times for any estimate; the old
  ~2-day sequential sum is not a revised-dataset result or spending approval.

### 12.4 Learn from the Nov 6-9 cloud failures (PLAN.md history)
- No 3-host cluster, no ceremony: **independent droplets + S3 pull + the
  standard `research.compose.yml`** (the same stack that runs locally). A
  droplet is a node, not a cluster.
- The old attempts died on SSH-blocks (22/443) + tier 422s + cluster setup.
  Mitigations: open droplet SSH (or DO's standard agent), provision via the DO
  API (no manual SSH ceremony), and the S3 pull replaces any SSH data transfer.
  A provisioning/setup failure is still recorded as a setup failure, never as
  data (the §1.2 rule stands).

### 12.5 What does NOT change
- The protocol discipline (pre-declared targets, per-shape receipts + the
  fingerprint-retaining harvest, infra-invalid vs system results, failures
  kept), the treatments (Arm D, Step-1, views, satellite), the K cells, the gate
  dependencies (gate15 before Phase 2), and the §10/§11 drafting + dataset-release
  framing all stand. Only the execution substrate (where the trials run) and the
  store import (generate-once -> S3 -> pull) change in this substrate addendum.
  The later November 11 directive separately replaces the input model and adds
  local floors/independent validation/operator review before paid execution.

### 12.6 Pilot on substrate (amended 10.11.2026)
- The §6 pilot cell runs **end-to-end on a production-identical droplet**
  (provision -> S3 pull -> restore -> trials), not locally: a local pilot would
  not test the S3 pull, the §12.1 envelope, or generation/import on real
  hardware. SKU and envelope **freeze at the pilot**; a change after the pilot
  restarts the rerun, per §7.

### 12.7 Watch items (from the review pass — what the pilot must settle)
- **Cache-residency of the 22 GiB envelope:** the old single-digit-GB estimate
  is not established for the revised post/event totals. Estimate before
  generation; record finished-store sizes from the floors, and confirm the
  loaded pilot's memory/cache behavior. Do not claim cache residency or
  silently scale counts/change distributions to obtain it. Report a resource
  conflict before an unaffordable build or provisioning; never silently raise
  the envelope (it freezes at the pilot).
- **vCPU headroom on the uniform SKU:** Phase 2 (the load cell) is CPU-sensitive
  (1400 sessions / ~23 feeds/s at 60 s think time). Declare the droplet's vCPU
  count in the substrate block; the "generator CPU < 50% while the server is
  the bottleneck" success criterion needs that number on record.
- **The sensitivity cell is expected to be the flakiest trial** (5 GiB cap +
  the big store = disk-bound + 241/137). That roughness is the measured finding
  (does the treated sequence survive the tight allocation?), not a harness bug —
  label it so a future reader doesn't chase it.
- **Frame the sensitivity cell as an envelope-comparison on the SAME store**
  (a rerun-series point, two envelopes), NOT a base-store number — so it stays
  consistent with the §12.1 citation rule (which forbids pooling base-*store*
  absolutes with rerun absolutes).
