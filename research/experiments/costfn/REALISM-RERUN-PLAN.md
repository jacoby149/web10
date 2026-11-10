The Realism Layer + Full Rerun Plan — SIGMOD cost-function experiments
Date: Nov 10, 2026 · Status: operator direction (Jacob) — supersedes the
input and run-scope sections of final-experiment-plan.md; all protocol discipline
in that plan (pre-declared targets, per-shape receipts, infra-invalid vs system
results, failures kept) remains fully in force.
Companion evidence: "Social Media Distribution Evidence" (goal document) —
the researched literature base for every parameter below, with sources and
evidence grades. Full research report retained in the research notes.

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
Plan: build a declared realism layer on top of the frozen base fixture —
Pareto/heavy-tailed authorship, engagement, and impression distributions whose
parameters come from published platform measurements (cited, §2) — then
re-run the entire study programme from the top on base+layer (pilot first,
§6), so that every number in the paper comes from a store that is *data-identical
to what a real 1M-user node holds*. The base-only receipts stay in the repo as
history; they stop being what the paper cites.
Why this is worth a day of machine time: the paper's claim becomes
unattackable on the usual axis. "Fast on toy data" stops being available as an
objection when the dataset table (generated from the store, §5) shows 1M
accounts, heavy-tailed everything, an events table outweighing the documents
table, and a post carrying ~1M impressions — with a reference behind every
distribution.
2. Evidence base and the three rules
Parameters are adopted from the researched literature. Strongest anchors:
Participation: van Mierlo (JMIR 2014) — <25% of users ever post; top 1%
  produce 74.7% of content. Nielsen's 90-9-1 is a rule of thumb, cited as such,
  never as a measurement.
Posting concentration: Pew (2019) — top 10% of users write 80% of tweets,
  median user 2 posts/month vs top-decile median 138; Pew (2021) — top 25%
  produce 97% counting replies/retweets. Contribution exponents α ≈ 1.8–2.5
  (Wilkinson 2008; Bild et al. 2015 for shape: discrete Weibull / power-law
  with cutoff).
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
Rule 1 — Conservative adoption. Where the literature gives a range, adopt
the end adverse to our system (the value that makes our measured costs
worse), and print the rule in the paper. Never step outside a sourced range.
Rule 2 — Conservation closes. Likes received = likes given; impressions
are bounded by audience × attention. The layer's totals must satisfy these
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
3. Adopted layer parameters (frozen once the pilot validates)
Quantity
Adopted target
Source anchor
Accounts that never post
~85% (range 75–90%)
van Mierlo 2014; Pew
Post share of top 1% / 10% of users
~70% / ~80%
van Mierlo; Pew 2019
Posts per posting user
median 1–2, α ≈ 2.0 (1.8–2.5), top author ~5,000 posts in-store
Wilkinson; Bild et al.
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
set by attention budget under Rule 2 (~30 days of a 37k-DAU node ≈ 150M events)
conservation
Node ads
~300 ads across groups
declared (fills the zero)
Follows per study reader (K)
20 standard; 100 / 1,000 as the existing study cells declare
study design (unchanged)
Totals (documents / events row counts) are outputs of these parameters at
1M-account scale, computed and reported by the stats receipt (§5) — expected
order: documents in the tens of millions, events ~150M, i.e. the events table
several times the documents table, as on a real node. If the pilot shows
generation cost per trial threatening the schedule, totals scale down
proportionally with distributions (shape, shares, medians) held fixed —
the statistics are the claim, not the raw count.
4. Layer build spec (for the workspace)
Additive, in-stack, post-restore. The frozen base inputs never change.
  The layer is generated by deterministic seeded SQL after each restore and
  before rekey/treatment steps, and is part of the trial's input identity
  ("base + realism-v1") recorded in every receipt.
Components: (a) authorship top-up — extra posts (documents + doc_groups
  rows) concentrating production per §3; (b) engagement documents — reactions
  and comments at the adopted per-post distributions, assigned to real users
  (conservation: giving side drawn from the same account population);
  (c) impression events in content_events (event_type='delivery', distinct
  reader_keys consistent with reach), including the declared viral head —
  at least one followed-set post at ~1M impressions, so the views gate faces
  it inside a real feed; (d) ~300 node ads.
Dedup/version semantics preserved: engagement counts obey the same
  latest-version / tombstone rules as base documents; the satellite build's
  dedup-before-count invariant is exercised by construction (the oracle
  verifies counts from canonical documents, as always).
Validation before any trial: the stats receipt (§5) recomputed from the
  finished stack must match §3 targets within declared tolerances (shares
  ±5 pts, medians exact-order, max-impressions post present, conservation
  identities closing to the row). A layer that misses its own targets is a
  setup failure, never data.
5. The stats receipt → the paper's dataset table
The layer builder emits a machine-generated stats table from the finished
store: for each quantity — total, mean, median, p99, max, top-1% share —
plus store totals (documents rows, content_events rows, doc_groups rows).
**The paper's dataset table is transcribed from this receipt, and the receipt
is retained in the repo.** If generated data drifts from targets, the receipt
is what prints. Next to it, the paper carries the §2 sources and the Rule 1–3
statements — that page is the dataset's defence.
6. Run plan
Pilot: one Study B 1M cell (3 trials) on base+layer. Purposes: prove
   generation time per trial, validate the stats receipt, shake the harness
   on the big store. Pilot trials count toward the rerun if clean.
Full rerun from the top, all on base+realism-v1: Phase 0 floors and
   gates → Study B (9 trials) → Study C (18) → Study A (18) → Study P (3) →
   Study X (3). Expected order of magnitude: ~25–30 min/trial, ≈ one day of
   continuous machine time. The runner's receipt-resume discipline applies
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
Layer parameters (§3) freeze when the pilot starts. A parameter change
  after that restarts the rerun clock; treat any urge accordingly.
No treatment changes mid-study; the realism layer is an input, applied
  identically to every cell, Arm A and treated alike — it must never become
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
Generation cost: governed by the §3 totals valve — statistics fixed,
  totals scalable.
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
  support networks, not general-purpose platforms. Pew's US-adult Twitter
  panels corroborate the concentration independently. v7 move: cite
  van Mierlo as the measurement and Nielsen as the origin of the rule,
  with the population caveat carried in the same sentence.
Cross-platform, cross-era assembly. Follower evidence is 2007–2011;
  Pew is US adults; McGrady is one video platform; Bluesky (2025)
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
10.2 Findings from the runs that v7 must narrate
The views episode (dataset section + journey). The base fixture
  ships no content_events; Step-0 classification (Phase 1.6) found the
  study's views were ~40–60 self-generated rows against 1M posts, and
  corrected a misattribution (gate-B's "views = 3.7M followup-armA"
  label was actually the reactions/comments partitions; erratum in
  gate-B stands). The views treatment fixed the real cost — the
  doc_groups readability subquery (4,100,060 → 1,240 rows at 1M,
  byte-identical output, #1474). v7 move: the realism layer is
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
  are a few heavy authors plus mostly quiet ones — the realism layer's
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
The base-fixture generator (already in the repo as the V2 dataset code)
  and the realism-layer generator — deterministic, seeded SQL/scripts.
The frozen parameter table (§3) with its literature citations, and the
  stats-receipt validator: anyone can regenerate the store and check the
  published statistics against their copy.
A README stating the model (documents / doc_groups / content_events),
  the three rules (§2), and the thin-support register (§10.1) — the
  caveats travel with the data.
Size, honestly: the release download is small — base fixture files are
~230 MB uncompressed (far less compressed) and the layer is code, so a
GitHub repo + release carries it without LFS heroics. The *generated
store* is the big object (documents in the tens of millions of rows;
~150M event rows, single-digit GB in ClickHouse native form) — generated
on the consumer's machine in minutes, exactly as our own trials do. An
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
(operator addendum, 10.11.2026 — reverses the local-only constraint for the
realism rerun; the base-only receipts stay local and labelled & superseded)

Everything in the rerun (§6: Phase 0 gates, B, C, A, P, X, gate15, Phase 2)
runs on DigitalOcean droplets, in parallel. This resolves the two risks the
plan carried: the realism store (tens of millions of docs + ~150M events)
does not fit the Mac's 7.65 GiB VM / 5 GB CH cap (disk-bound, slower, more
241/137 on the A + K=1000 cells), and per-trial layer generation is the new
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
- Build the realism store **once** (on the Mac or one droplet): the frozen base
  fixture + the deterministic seeded layer (§4) -> the full store as importable
  files (`documents.jsonl.gz`, `doc_groups.jsonl.gz`, `content_events.jsonl.gz`,
  ...) + the manifest + the §5 stats receipt. This is the frozen input identity
  "base + realism-v1 + <seed>".
- Upload the store to object storage (the existing MinIO, or a DO Space / S3
  bucket). It is shared, versioned by seed, pull-able by any droplet.
- Each droplet trial **PULLS** the store from S3 and loads it into its fresh CH
  volume (the restore step loads pre-generated data instead of running the
  generation SQL) -> no per-trial regeneration, no per-machine drift.
- The §3 "scale totals down" valve still applies to the generated store (build
  the scaled version once, pull it). Determinism: the seed is in the input
  identity; the §5 stats receipt is the regenerate-and-check proof.

### 12.3 Parallel split (one droplet per study; trials sequential on a droplet)
- The store fits cache-resident, so one trial at a time per droplet (the CH cap
  is per trial). Studies split across droplets run in parallel:
  - D1: Phase 0 floors + gates + Study B (9 trials)
  - D2: Study C (18 trials)
  - D3: Study A (18 trials)
  - D4: Study P (3) + Study X (3)
  - D5 (after B-X land): gate15 (satellite) + Phase 2 (37k-DAU load demo)
- Wall-clock ~= the longest droplet (C or A, ~18 x trial time) + gate15/Phase 2,
  instead of the ~2-day sequential sum.

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
  store import (generate-once -> S3 -> pull) change.

### 12.6 Pilot on substrate (amended 10.11.2026)
- The §6 pilot cell runs **end-to-end on a production-identical droplet**
  (provision -> S3 pull -> restore -> trials), not locally: a local pilot would
  not test the S3 pull, the §12.1 envelope, or generation/import on real
  hardware. SKU and envelope **freeze at the pilot**; a change after the pilot
  restarts the rerun, per §7.

### 12.7 Watch items (from the review pass — what the pilot must settle)
- **Cache-residency of the 22 GiB envelope:** the store is single-digit GB
  native (§3), so 22 GiB holds it with headroom — but the pilot must confirm CH
  memory is steady (not thrashing) on the loaded store. If the store came in
  bigger than §3's single-digit-GB, the valve is to **scale the store down**
  (§3) — **never raise the envelope** (it is frozen at the pilot).
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