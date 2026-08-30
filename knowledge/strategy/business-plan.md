# business-plan.md — web10 Inc, the business (v1, 18.07.2026)

the lean business plan: model, pricing, unit economics, projections,
costs, funding posture, risks. companion to plan.txt (product) and
THE STORY (pitch). every number here is an ESTIMATE made explicit so
it can be falsified — update this file when reality reports in.
verify market figures before showing this to investors.

---

## 1. the business in one paragraph

web10 Inc is the Automattic of creator-owned social: open,
self-hostable software (free forever) + a hosted-node offering
(usage-based, the MongoDB model) + node-level ad inventory (the
operator sells their audience's attention, keeps 85-90%) +
eventually a sponsor marketplace (the nano-promo tier nothing
serves today). v3 is the **ads platform** — it competes with
YouTube's ad system (100% delivery, no shadow ban, you keep 100%
of your ad revenue). the payment model (memberships/tips via
Stripe Connect, the 3+10+10+77 split) is v4 — it requires
portable payment relationships, which is a separate engineering
problem. the customer is the creator; users are free and arrive
with the creator. the node operator is a media company — they own
the audience, they sell the attention. the software is the funnel,
hosting is the margin, node ads are the compounding asset.

## 2. problem + solution (one line each; THE STORY is the long form)

- problem: creators rent their audience. 1M subs, 300k delivered.
  the rent (reach throttling, demonetization, deplatforming) rises
  every year, and AI-content floods make platform loyalty to human
  creators strictly worse from here.
- solution: a creator-owned node — their domain, their brand, 100%
  delivery by architecture, their sponsors and memberships at ~97%
  payout, portable forever. add-not-move: platform #6, the only
  one they own.

## 3. market

- creator economy: ~$250B (2023, goldman sachs), projected ~$480B
  by 2027. [VERIFY before external use]
- serviceable segment: mid-tier creators (100k–500k followers) in
  tier-one markets, monetizing or trying to — order 10^5 people —
  plus paid-community operators (skool/whop/discord+stripe), the
  highest-intent segment.
- the wedge cohort (obtainable now): recently platform-burned
  creators in that band. they self-identify publicly (reach-collapse
  complaints, demonetization videos, announced substack/rumble
  moves). outreach.md is the pipeline playbook.
- comparable outcomes anchoring the ceiling: automattic ~$7.5B,
  shopify, substack ~$650M–1.1B raise-era, onlyfans ~$6B+/yr GMV
  with ~40 employees (the per-employee ceiling of the category).

## 4. business model + pricing (D57, 30.08.2026)

three revenue lines in v3 (ads only — no Stripe, no memberships, no tips;
the payment model is v4):

1. HOSTED NODES (turns on at M2). usage-based pricing (the MongoDB
   model — D57), not a flat fee. the price scales with the value the
   customer is extracting:
      - free: 10GB storage, 100GB egress/mo. the funnel. no credit card.
      - starter: $49/mo (100GB storage, 1TB egress/mo)
      - creator: $199/mo (1TB storage, 10TB egress/mo, custom domain)
      - scale: $999+/mo (dedicated node, 10TB+ storage, 100TB+ egress/mo,
        SLA, DR)
      - usage-based overages on storage + egress beyond the tier cap
        (the video solution: the creator who streams 4K pays for what
        they use; R2-class offload keeps web10's cost low)
    self-hosting stays free forever (the credibility of the whole
    ownership story depends on this — never gate the software).
2. NODE-LEVEL ADS (turns on at M2, the operator's revenue): the node
   operator sells ad inventory across the whole node (D57). a node ad
   is a `posts` doc on the discover group, tagged `ad` + `node_ad`;
   the read attaches active node ads to posts at the operator's
   configured percentage (the third join: `doc.ad` + `doc.node_ad`,
   both can be present). the operator sells the inventory to
   advertisers directly (off-platform); they keep 85-90%. web10 takes
   a 10-15% platform fee on the hosting invoice. the operator is a
   media company, not just a hosting customer.
3. NO-ADS SUBSCRIPTION (turns on at M2, the fan's revenue): the fan
   pays a monthly fee to remove ads (the YouTube Premium model). three
   tiers: free (all ads), tier 1 (no node ads, still see influencer
   ads), tier 2 (no node ads + no influencer ads, completely
   ad-free). the subscription revenue splits between the node operator
   (70%) and web10 (30%). the operator is the merchant of record — the
   fan pays the operator, the operator pays web10 their share. no
   Stripe Connect needed. the enforcement: web10's software renders
   the ad-free experience; if the operator doesn't pay, web10 cuts
   off the software. open question: tier 2 removes influencer ads,
   which means the creator loses ad revenue from tier 2 users — the
   compensation model is a v4 detail.
4. SPONSOR MARKETPLACE (M3): the nano-tier ($20 promos at 5k
   followers) up to real campaigns. take: 3% per D5 — evaluate
   raising marketplace-side take to ~10% later; still 2-3x cheaper
   than paved (30%) / kit (23.5-30%) / OF (20%). [DECISION OPEN]

v4 (not in this window): the payment model (memberships/tips via
Stripe Connect, the 3+10+10+77 split, the patron export, portable
payment relationships). the v4 KB lives in
`knowledge/knowledge-base/web10-v4/`. the v3/v4 split: v3 is the ads
platform (compete with YouTube's ad system), v4 is the payment platform
(compete with Patreon). the split exists because Stripe Connect creates
migration lock-in (the payment relationship is tied to the node's
Stripe account) and onboarding friction (KYC, bank account, tax forms)
that repels creators who already have a payment setup. people trust
Patreon — the creator links their Patreon from their web10 posts, the
fan pays on Patreon, the trust is in Patreon.

the comparison that closes deals (v3, ads only): a creator doing
$3k/mo in ad revenue (affiliate, sponsor) on YouTube pays 0% to
YouTube (they keep 100% of their affiliate revenue) but YouTube
throttles their reach (the shadow ban). on web10: $199/mo hosting +
0% ad revenue take = $199/mo total cost. the creator keeps 100% of
their ad revenue AND 100% delivery (no shadow ban) AND ownership of
the audience. the pitch: "same revenue as YouTube, no shadow ban, you
own the building. the $199 keeps the node running."

the node operator's pitch is different: "run a media property. you
own the audience, you sell the attention, you keep 85-90% of the ad
revenue. web10 handles the infrastructure." a node with 500k users,
10k posts/day, 70% unmonetized, at 10% node ad density, $10 CPM
(conservative) = ~$7k/mo in node ad revenue. the operator keeps
~$6k/mo, pays web10 $999 (scale tier). they're up $5k/mo. that's a
business.

### 4b. the monetization ladder

web10 makes money in stages. each stage is gated by the previous one
working. the ladder:

**Rung 1: you are the media company (now → M2).**
you are the node operator. you get users on web10.app. you run node
ads (sell the inventory to advertisers). you keep 85-90% of the ad
revenue. you pay web10 (yourself) the hosting fee + platform fee.
net: you earn ad revenue minus infra cost. web10 Inc's revenue is the
hosting fee + platform fee (an internal transfer, but it validates the
model). the goal: prove that a node with real users can sell ad
inventory at a real CPM. this is the kill test for the entire ad
model.

**Rung 2: the no-ads subscription (M2).**
the fan pays a monthly fee to remove ads. the YouTube Premium model.
three tiers:
  - free: see all ads (node + influencer)
  - tier 1 (paid): no node ads (still see influencer ads — the
    creator's revenue is protected)
  - tier 2 (paid, higher): no node ads + no influencer ads
    (completely ad-free)
the subscription revenue splits between the node operator and web10
(the operator is the merchant of record — the fan pays the operator,
the operator pays web10 their share). no Stripe Connect needed — the
operator handles the payment, web10 gets a cut. the enforcement is
simple: web10's software renders the ad-free experience; if the
operator doesn't pay web10, web10 cuts off the software.
open question: tier 2 removes influencer ads, which means the creator
loses ad revenue from tier 2 users. the compensation model (does part
of the tier 2 fee go to the creators whose ads are removed?) is a v4
detail. for now: the subscription exists, the revenue splits between
operator and web10, the creator compensation is open.
the goal: 5% of users on tier 1, 1% on tier 2. at 100k users, that's
5k tier 1 + 1k tier 2. at $5/mo tier 1 + $10/mo tier 2 = $35k/mo in
subscription revenue. the operator keeps 70%, web10 keeps 30% =
$10.5k/mo web10 revenue.

**Rung 3: other node operators come online (M2 → M3).**
other creators/influencers run their own web10 nodes (hosted by
web10 or self-hosted). they get their own audience. they run their own
node ads. they offer their own no-ads subscription. web10 earns:
hosting fees (real, from other operators) + platform fee on their
node ad revenue (10-15%) + 30% of their subscription revenue. the
revenue is no longer internal — it's from other operators. the goal:
3-5 hosted node operators, each with 10k-100k users, each selling
their own ad inventory + subscription.

**Rung 4: the network effect (M3+).**
more nodes → more users → more ad inventory + more subscriptions →
more revenue. the node operators (not just you) are earning money from
ads + subscriptions. web10 earns the platform fee + subscription cut
from all of them. the cross-node discover (a user on node A can follow
a creator on node B) drives users between nodes. the goal: 10-20
active node operators, each earning from ads + subscriptions, web10
earning the platform fee + subscription cut from each.

**Rung 5: the payment model lands (v4).**
memberships/tips flow through web10's Stripe Connect. the
3+10+10+77 split. the patron export makes the audience portable.
web10 earns the 10% platform fee on membership revenue. the operator
earns the 10% hosting cut. the creator keeps 77% + 100% of their ad
revenue. the goal: the first creator earning $1k+/mo in memberships
on the node, the payment relationship proven portable.

**Rung 6: the sponsor marketplace (M3+).**
web10 is the broker between brands and creators/node operators.
brands buy ad inventory across multiple nodes through web10. web10
takes a marketplace fee (3-10%). the goal: the first brand campaign
running across 3+ nodes, web10 earning the brokerage fee.

the ladder is the business plan's growth model: each rung is a new
revenue line, gated by the previous rung proving the model. rung 1 is
"you prove the ad model works." rung 2 is "fans pay to remove ads."
rung 3 is "others do it too." rung 4 is "the network compounds."
rung 5 is "the payment layer adds a new revenue stream." rung 6 is
"web10 is the ad exchange."

## 5. unit economics (per hosted creator node)

- revenue/creator/mo (base case, v3 ads only): $199 hosting (creator
  tier) + 0% ad revenue take (the creator keeps 100% of their
  affiliate/sponsor revenue — web10 doesn't process it). the creator
  links their Patreon, their affiliate network, their own store — the
  payment happens off-platform. web10's revenue is the hosting fee.
- revenue/node-operator/mo (the media company): node ad revenue (they
  keep 85-90%, web10 takes 10-15% platform fee) + the hosting fee. a
  node with 500k users, 10k posts/day, 10% node ad density, $10 CPM
  (conservative) = ~$7k/mo node ad revenue. the operator keeps ~$6k/mo
  from ads + $199/creator hosting. that's a real business.
- v4 (not in this window): the membership/tip revenue line (3% Stripe
  + 10% operator + 10% web10 + 77% creator). the portable payment
  relationship is the engineering problem that gates it.
- COGS/creator/mo (REAL infra: $100/mo colocation, 64GB xeon —
  one box hosts ~10-30 small creator nodes): ~$5-15/creator at
  early scale + media storage/egress ~$20-100 for video-heavy
  nodes (R2-class offload, passthrough tier) + csam/email ~$10.
  early gross margin: 90%+ on text/photo communities.
- the honest infra caveats: ONE 2016 box = single point of
  failure — every hosted creator goes dark together on a psu
  death. free founding period: acceptable with transparency +
  off-box backups + a REHEARSED restore (cross-cutting item);
  the DR target is a hetzner/ovh-class dedicated box (~$40-60/mo,
  20TB+ included traffic) spun up only on failure. by paying
  tiers: a second box (another ~$500 ebay xeon or that hetzner
  dedicated), priced in. colo bandwidth is the video ceiling —
  R2 offload before any video-heavy creator onboards.
- EXPLICITLY NOT EC2/cloud compute: 4x the compute cost and
  egress pricing (~$0.09/GB) is poison for a social/media
  platform — an egress business on aws turns $10 COGS/creator
  into hundreds. also off-message: the ownership company runs
  on hardware it owns. the phase 3 one-container node keeps
  every infra decision reversible (docker run anywhere).
- scale path: HORIZONTAL XEONS at the colo. creator nodes are
  independent (no shared state across communities), so scaling
  is embarrassingly parallel: +1 ebay xeon (~$500 one-time) →
  place new nodes on it; failure domain shrinks to 1/N of
  creators per box. ferretdb/postgres streaming replication per
  node when a paying creator justifies it. caveat: N boxes in
  ONE facility still share power/network — the hetzner-class
  off-site restore stays the DR floor until a second site.
- white-glove labor for founding creators is founder time,
  unpriced at this stage.
- CAC, staged by tier (the angles, examined):
    - M0-M2, the 100k-1M tier (3-20 prospects): founder-sends-
      every-message, PERMANENTLY for this tier — by 2026 creator
      inboxes are wall-to-wall ai-personalized pitch spam and
      managers delete it on pattern-match; the pitch's edge is
      reading human. CAC ≈ $0 cash + founder hours (~20 pitches
      per close assumed until measured).
    - the ai-sdr trap, rejected: artisan/11x-class tools
      ($1-3k/mo) are volume machines for interchangeable b2b
      prospects — wrong motion for 20 named humans. INSTEAD: the
      in-house agent fleet ($130/wk, already paid for) runs the
      sdr back office as agent tasks — sweep public reach-gap
      complaints, find biz emails/managers, compute each
      prospect's subs-vs-views gap, detect burn events, draft
      the personalized first line FOR FOUNDER REVIEW. research
      automated, sending human.
    - post-M2, the starter tier (5k-50k creators, self-serve):
      volume outreach becomes legitimate here — instantly/clay-
      class infra (~$100-300/mo), CAC target < 1 month gross
      margin (~$200).
    - at scale: the flywheel is the CAC machine (founding
      creators' "why i left" content, graduation loop, inbound).
      outbound only backfills; paid acquisition only if measured
      LTV supports it.
- LTV: unknown (churn unmeasured). the retention lever is owned
  revenue in month one (memberships live before creator #1 —
  KNOWN GAPS). model honestly only after 6 months of M2 data.

## 6. financial projections (24-month model, three scenarios)

model assumptions (base case — every one is falsifiable, §6d ranks
which matter):
- timeline: M0 slice + video by month 2; pitching starts month 2;
  founding creators (free 12mo) onboard months 3-5; paid tiers
  open month 6 (M2); marketplace (M3) contributes ~$0 within this
  window (modeled as option value, not revenue).
- close rate: 1 per 20 pitches (founder-sent). pitch cadence:
  ~10-15/week after the video exists (agent-drafted, founder-
  sent) — the rule of 100: the kill test is 100 sends in batches
  of 20 over ~8-10 weeks, because 20 sends carry a ~36% false-
  kill risk at a true 1/20 close rate.
- blended revenue per paying creator: $289/mo early (creator tier
  + rails on ~$3k/mo creator revenue), decaying to ~$200/mo
  blended by month 24 as $49 starters mix in.
- churn: 3%/mo assumed (INVENTED — see §6e). growth: flywheel
  kicks ~month 12 (founding creators' "why i left" content +
  graduation referrals), roughly doubling the close rate's yield.
- costs: tokens ~$600/mo; blended COGS ~$100/creator/mo; tools
  ~$200/mo; t&s/support contractor (+$1.5k/mo) from ~20 paying
  creators; first real hire only past ~$25k MRR. founder salary
  $0 throughout (the model's biggest unpriced cost — §6e).

### 6a. scenario table (paying creators / MRR / monthly net)

  month     bear            base              bull
  ------    -------------   ---------------   -----------------
  6         0 / $0 / -$1k   2 / $600 / -$1k   8 / $2.3k / +$1k
  9         GATE FAILS      5 / $1.4k / ~$0   20 / $5.5k / +$3k
  12        (stopped)       10 / $2.9k / +$1.5k   35 / $9k / +$5k
  18        —               30 / $7k / +$4k   150 / $33k / +$22k
  24        —               70 / $14k / +$9k  400 / $80k / +$55k

  annualized at month 24:   ~$170k ARR         ~$1M ARR
  headcount at month 24:    founder + 1 ctr    3-4 + agents

- BEAR (gates fail): the full 100 pitches sent, meaningful video-
  watch count, zero signs or zero posting — stop at month 9.
  total cash sunk: ~$10-12k over 9 months. residual assets: the open-source node, the paper
  (later.md conference angle), the 208+ community, the skillset.
  the worst case is a funded education, not a crater.
- BASE: breakeven ~month 9-10 (~5 paying creators). month 24:
  ~$170k ARR, ~$9k/mo net to a solo founder — already a real
  business, still 100% owned, growing on flywheel not spend.
- BULL (a public graduation moment / AI-fear goes mainstream /
  one founding creator is a hit): month 24 ~$1M ARR, raise becomes
  optional leverage rather than oxygen. not planned against; the
  plan only has to survive base.

### 6b. cumulative cash view (base)

months 1-9: -$12k cumulative (the full at-risk capital: token
spend + infra + tools, no salary). months 10-24: self-funding;
cumulative turns positive ~month 14-16. TOTAL OUTSIDE CAPITAL
REQUIRED: $0. maximum drawdown ≈ one used car. the asymmetry (cap
~$12k downside vs $170k-$1M ARR paths) is the entire investment
case, and it's why bootstrapping is correct: selling equity to cap
a $12k risk would be the worst trade in the plan.

### 6c. the KPI dashboard (what gets measured, in funnel order)

  1. pitches sent /wk (founder discipline — the leading indicator
     of everything; target 5/wk once video exists)
  2. reply rate → video-watched rate → call rate → close rate
  3. time-to-first-post per signed creator (target <4 weeks;
     this is the real "yes")
  4. % of creator's audience that joins the node (the conversion
     multiplier; the manifesto's grade)
  5. creator's own monthly revenue on-node (drives rails revenue,
     retention, and the case study for the next pitch)
  6. MRR / churn / net revenue per creator (the boring truth)
  7. cost per node (COGS creep watch, video especially)

### 6d. sensitivity (which assumptions move the model most)

  1. CLOSE RATE (1/20 vs 1/40 halves everything; 1/10 doubles it)
  2. posting-within-4-weeks rate (a signed-but-dark creator is
     $199 of revenue and a dead case study — the flywheel runs on
     visible successes, not signatures)
  3. creator's own revenue (the $3k/mo assumption): $2k/mo
     memberships/tips (web10-processed, drives rails revenue) +
     $1k/mo affiliate/sponsor (not web10-processed, drives retention
     and the case study). if real creators do $500/mo memberships,
     blended revenue/creator drops ~30% and the story weakens more
     than the money does. the node ad revenue line is separate — it
     scales with the node's audience, not the individual creator.
  4. churn (3%/mo assumed blind; 6% pushes breakeven to ~month 14)
  5. video COGS (the passthrough tier must actually get charged)

### 6e. where this model lies (read before believing it)

- churn and LTV are invented. no data exists until month ~12.
- the $3k/mo creator-revenue assumption is doing enormous work
  (rails revenue + retention story both hang on it).
- the growth curve assumes the flywheel works (that founding
  creators succeed VISIBLY and talk about it). if they succeed
  quietly, growth is linear-by-pitching, roughly half the base.
- founder hours are priced at $0. at ~20 paying creators the
  white-glove + support load is a real job; the contractor line
  appears then, but the model still underprices founder time
  everywhere.
- marketplace revenue is $0 in-window: honest, but it means the
  10x-cheaper-marketplace wedge contributes nothing to these
  numbers — pure upside if M3 lands.
- node ad revenue is untested: the CPM assumption ($20) and the
  unmonetized percentage (70%) are invented. no node has sold ad
  inventory yet. the model assumes the operator can sell the
  inventory at a reasonable CPM — this is the biggest untested
  assumption in the plan after close rate.

## 7. cost structure (REAL numbers, 18.07.2026)

- build: ~$200/wk agent tokens (real) → ~$870/mo
- infra: $100/mo colocation (64GB xeon; hosts staging + the first
  ~10-30 creator nodes). media offload (R2-class) added when the
  first video-heavy creator onboards.
- legal: ~$0 — c-corp + trademark ALREADY DONE (the shield and
  the brand exist). the one immediate spend: $6 dmca designated-
  agent registration (cheapest safe harbor in existence) before
  any hosted node serves media. tos/privacy = adapted boilerplate
  until revenue pays a lawyer to dial it in.
- demo video: founder-made, $0.
- headcount: 0 beyond founder. hiring is triggered by M2 revenue
  (first: t&s/support contractor, then a taste-owning designer),
  never ahead of it.
- total burn: ~$1k/mo. runway is effectively infinite for a
  working founder.

## 8. funding: the two paths, and when to raise

### 8a. path one — no investment (the default; the whole base
case in §6 IS this path)

capital required before it pays for itself, itemized (REAL):
  - agent tokens: ~$200/wk x 9 months ............ ~$7.8k
  - colocation: $100/mo x 9 ...................... ~$0.9k
  - domains/tools/misc ........................... ~$0.5k
  - dmca designated agent ........................ $6
  - legal (c-corp + trademark already done) ...... $0
  - demo video (founder-made) .................... $0
  - contingency .................................. ~$1k
  TOTAL AT-RISK CAPITAL TO BREAKEVEN: ~$10k, spread over ~9
  months, plus founder nights-and-weekends. burn ~$1k/mo means
  breakeven at ~4-6 paying creators (~month 9-10); after that
  the company pays for itself forever.
this is affordable on a salary. no path dependency is created:
bootstrapping to breakeven keeps 100% ownership and makes every
later choice (raise, don't raise, lifestyle, swing) optional.

### 8b. path two — with investment (what money actually buys here)

be honest about what capital CANNOT buy in this plan: the founder-
sent pitches (automating them kills them), taste (the kick/twitch
bar is judgment), and the thesis validation itself ($12k covers
that). so a raise before M0's gate buys almost nothing except
dilution at the worst possible terms. what capital CAN buy, ranked
by leverage:
  1. CREATOR GUARANTEES (the substack pro play — the proven
     capital use in exactly this market: substack paid writer
     advances to buy its case studies). e.g. 10 creators
     guaranteed $2k/mo for 6 months = $120k: converts the
     scariest founding-creator objection ("will this pay?") into
     a yes, and BUYS the visible successes the flywheel needs
     instead of waiting ~12 months for organic proof.
  2. a taste-owning designer/brand contract (~$60-90k/yr) — the
     one hire that attacks the plan's weakest execution point
     (beat 5, the polish bar).
  3. t&s + support earlier (~$30-50k/yr contractor) — removes
     the operational fear from white-glove hosting.
  4. starter-tier growth infra + marketplace build-out (post-M2).
a pre-seed of ~$350-500k covering 1-4 compresses the base-case
timeline by roughly 12 months (month-24 base ≈ month-12 funded)
and raises the odds the flywheel ignites at all (bought case
studies > hoped-for case studies). that is the honest trade:
money here buys TIME and PROOF-VELOCITY, not survival.

### 8c. when to raise (the trigger, not the temptation)

- NEVER before the M0 gate: pre-validation money = maximum
  dilution for zero information. the $12k self-funded path buys
  the same validation.
- the window OPENS at early M2 traction, when the deck writes
  itself: 3-5 paying creators + at least one VISIBLE success
  (posting, earning, audience converted) + a measured funnel
  (close rate, %-audience-joined, retention weeks). at that point
  the story is "breakeven, 100% founder-owned, category comps are
  automattic/OF, capital buys guarantees + speed" — the strongest
  possible terms this company will ever see relative to risk.
- RAISE IF, at that window: (a) demand outruns one founder's
  white-glove capacity, or (b) the guarantee-fund math (8b.1)
  clearly compresses the flywheel, or (c) a credible fast-follower
  is moving. otherwise keep compounding at 100% ownership —
  breakeven means raising stays a perpetual option, and optionality
  unexercised costs nothing.
- rule, stated once: raise to ACCELERATE a machine that is
  measurably working; never raise to discover whether it works.
  the milestones discover that for ~$500 each.

## 9. competition (and the crisp answers)

- rumble/locals/substack/patreon: platforms you still don't own —
  they can throttle or drop you too. we sell the building, not a
  nicer landlord. flat pricing beats their % take as creators grow.
- skool/whop: 20-30% takes on communities; our tiers are terms
  ACLs at 3% + hosting. same mechanics, 10x cheaper, owned.
- mastodon/fediverse: jank, no creator economics, instance-flavored
  identity. we are creator-first with kick/twitch-grade product
  (beat 5) — different species, shared ancestor.
- meta/tiktok/youtube: not competitors for the wedge — they're the
  distribution we tell creators to keep using (add-not-move). they
  cannot copy "no algorithm" without burning their revenue model.
- a fast-follow startup cloning this: the real threat in an llm
  world. moats: first-mover with the founding creators (brand
  authorship), the rails network, open-source community gravity,
  and speed. none are deep yet — being first to 10 creators is
  the moat-building act itself.

## 10. risks (top 5, honest)

1. founder sales execution (the 208 pattern): the plan's #1 risk
   is that pitches don't get sent. mitigation: outreach.md makes
   sending mechanical; the M0 gate has a date.
2. founding creators sign but don't post (weak-commitment yes):
   mitigation: memberships live at onboarding, white-glove
   includes a content-import + first-week plan, success metric is
   posting-within-4-weeks not signing.
3. video/streaming costs + polish vs the kick/twitch bar:
   mitigation: creator #1-3 chosen from formats M0 serves (KNOWN
   GAPS); R2-class storage; streaming deferred.
4. t&s/legal incident on a hosted node before process exists:
   mitigation: phase 12 gate is pre-creator-#1 (KNOWN GAPS);
   clean-only rails (stripe ToS) already decided.
5. stripe dependency: rails revenue and clean-content policy both
   hang on stripe connect. mitigation: it's the industry default
   and D5 predates this doc; adapterize payments later the way ads
   are adapterized now. [watch, don't build yet]
6. node ad revenue doesn't materialize: the operator can't sell the
   inventory at a reasonable CPM, or the unmonetized percentage is
   lower than assumed (creators monetize most of their posts).
   mitigation: the node ad layer is optional (percentage = 0 = off);
   the hosting fee + rails revenue stand on their own. the node ad
   revenue is upside, not the foundation.

## 11. strategic alignments + exit posture (dessert, not dinner)

- breakeven-at-5-customers means web10 NEVER needs to sell —
  every strategic conversation happens from "we're fine" posture.
- the stack alignment is REAL and useful NOW, before any exit
  talk: web10's phase 1 (shipped) runs on the open documentdb/
  ferretdb stack — the MIT-licensed, linux-foundation answer to
  mongo's SSPL, open-sourced by a major cloud vendor. that makes
  web10 one of the more visible consumer products on that stack,
  and vendor oss/devrel machines amplify ecosystem wins: blogs,
  conference slots, credibility — DISTRIBUTION, claimable at M0.
  warm senior relationships exist in that world; the M0 video
  travels there as a progress note between people who've talked
  before, never as a pitch.
- plausible strategic homes exist in a 5-year frame (the
  github-playbook acquirer that buys where a community lives and
  keeps it neutral; the shape-twin in open publishing; edge/
  self-host infra players; payments + creator-commerce
  platforms). listed for awareness only.
- THE RULE: companies are bought, not sold. the roadmap never
  bends toward an acquirer — acquirers only pay real money for
  the thing that was built for customers (the creator network
  is the unbuyable part). revisit this section only when someone
  else brings it up.

## 12. the operating cadence (how this plan gets executed)

- the board stays CHANGELOG.md + plan.txt + lane ticks (no external
  pm). this file gets a dated revision whenever a number turns real.
- weekly founder discipline through M2: ship the slice (agents),
  10-15 outreach sends/week once the video exists (rule of 100:
  the verdict needs the full hundred), one P&L review of any
  live node.
- every milestone is a kill test first, a celebration second
  (gates in §6). the plan's superpower is cheap falsification —
  use it: no gate, no next phase.
