# Gaps — the holistic holes (operator takes, 05.10.2026)

**Status: CAPTURED.** The operator asked: "any need-type stuff I didn't mention,
that there are some serious holes, that we are just leaving open? Looking
wholistically at the business plan, the manifesto, the use cases, our
direction." This doc captures the nine biggest gaps identified in that pass,
**plus the operator's take on each** — which reframes or defers them. The
operator's framing: *"were getting there, just getting things great first
though"* — the ads experience (the `ads-october/` folder) is the current focus;
these gaps are the *next* concerns, captured for the record and to inform the
build order, not to build now.

> The nine gaps: (1) fan migration, (2) the "ads platform" revenue certainty,
> (3) the operator's ad-sales capability, (4) export/portability, (5)
> federation, (6) the ownership story ("better-than-life story?"), (7) "no
> algorithm" vs. content quality, (8) "why pay for hosted when self-hosting is
> free?", (9) the marketing pages out of sync with the strategy. The operator's
> takes reframe, close, or defer most of them — especially #3 (the operator is
> a **record label**, not a passive host), #4 (the export is a **301 redirect +
> migrations table**, not a vague "take it with you" promise), #7 (the
> algorithm is **user-tuned**, "you make your own algo"), #8 (the hosted tier
> is the **media company** tier), and #9 (the marketing tells the *join* story
> but not the *stay* story — and the Join page step 3 is a **live dead link**).

---

## Gap 1 — Fan migration (the cold-start mechanism)

**The gap:** The business plan's KPI #4 is "% of creator's audience that joins
the node," but there's no description of *how* a fan on YouTube actually ends
up on the web10 node. The manifesto is the join screen, but how does the fan
get *to* the join screen? The migration path (the link, the onboarding, the
"why would I create an account here") is the actual hard problem, and it's not
in the plan. Everything downstream (attention, ad revenue, subscriptions)
depends on it.

**The operator's take:**

> "this is almost separate, this is sales side, the web10 importer different
> concern from the ads part. were getting there, just getting things great
> first though."

**The reframe:** the migration/importer is a **sales-side** concern, separate
from the ads experience. It's the "how does the creator's audience actually
arrive" problem — the importer, the onboarding, the "why join" pitch. It's on
the roadmap ("we're getting there") but deliberately **deferred** in favor of
polishing the ads experience first ("just getting things great first"). The
logic: the ads experience is the *stay* (the creator makes money, so they don't
leave); the migration is the *join* (the audience arrives). You can't sell the
join if the stay isn't great. Build the stay, then build the join.

**The implication:** the migration/importer is a **separate work order** (not
part of the `ads-october/` folder). It's the "sales side" — the creator's
audience arrives via the importer (the "I'm moving from YouTube" flow), the
onboarding (the "create your account, follow the creator" flow), and the pitch
(the "why join" — the manifesto is the join screen, but the *path* to the join
screen is the missing piece). Capture it when the ads experience is solid.

---

## Gap 2 — The "ads platform" revenue certainty

**The gap:** The business plan says "v3 is the ads platform — it competes with
YouTube's ad system." But §6e admits "node ad revenue is untested: the CPM
assumption ($20) and the unmonetized percentage (70%) are invented." And risk
#6 says "the node ad revenue is upside, not the foundation." If node ads don't
work, v3 is a **$199/mo hosting business**, not an "ads platform." The plan's
revenue model in v3 is: hosting fee (certain) + node ad platform fee (uncertain)
+ subscription cut (uncertain) + marketplace ($0 in-window). The "ads platform"
framing is doing a lot of work that the uncertain revenue line can't support.

**The operator's take:**

> "well, all these other megaplatforms make TONS off the ads, so lets just get
> in on that shit, not worry so much just move forward mastodon style shit
> with ads hasnt been done before + this is better than mastodon, this is the
> new internet protocol, totally generic backend."

**The reframe:** don't overthink the revenue certainty. The megaplatforms make
*tons* of money from ads — that's the market. web10 is "getting in on that
shit." The novel thing isn't "ads" (everyone has ads) — it's **"mastodon-style
shit with ads"** — an open, federated, generic-backend social platform *with*
an ad economy. That hasn't been done before. Mastodon has no ad model; the
megaplatforms have ads but no openness. web10 is the intersection: **the new
internet protocol** (totally generic backend, the D60 node) **with an ad
economy** (the node ads, the creator affiliate ads, the no-ads subscription).
The revenue certainty is a *falsification* question (the plan's §6e already
flags it), not a *blocking* question. Move forward; the market is proven
(megaplatforms make tons of money from ads); the novel thing is the *open*
version of it.

**The implication:** the "ads platform" framing is **positioning**, not a
revenue guarantee. The positioning is "the open social platform with an ad
economy" (mastodon-style + ads = novel). The revenue certainty is the plan's
§6e falsification (the CPM, the unmonetized percentage, the close rate) — test
it, don't block on it. The "new internet protocol, totally generic backend"
line is the *differentiator* that makes the ads novel: the ad economy runs on
a *generic* backend (D60), not a bespoke social app. That's the thing no one
has done.

---

## Gap 3 — The operator's ad-sales capability

**The gap:** The business plan says "the node operator is a media company —
they own the audience, they sell the attention." But a mid-tier creator
(100k-500k followers) is **not** a media company. They don't have an ad sales
team. They don't know how to sell inventory to advertisers. The plan assumes
they "sell the inventory to advertisers directly (off-platform)" — that's a
capability gap, not a revenue line. The sponsor marketplace (M3) is the answer,
but it's M3, not M2. In M2, the operator has to be their own ad sales team.

**The operator's take:**

> "yupp, the node operator is a heavy advertiser type! unless we create
> selling of ads. definitely not automatic, the node operator is almost like a
> record label, they are curating the celebrities for their node thematically,
> so the ads they push out are all that thematic vein, they are a mastermind a
> big picture killer"

**The reframe (the big one):** the operator is **not** a passive host who can't
sell ads. They're a **record label**. They **curate** creators thematically
(pick the artists that fit the label's sound), and the ads they push are **in
that thematic vein** (the label's sponsors match the label's artists). They're
a **mastermind, a big picture killer** — a *strategist*, not a passive host.
The ad sales capability isn't a gap — it's the operator's *role*. A record
label *sells* (to sponsors, to the audience, to the artists). The operator is
the same: they curate the creators, they sell the thematic inventory, they're
the big-picture strategist.

**The "unless we create selling of ads" clause:** the sponsor marketplace (M3)
is the *automation* of the operator's ad sales — web10 becomes the broker
between brands and operators/creators. But in M2, the operator does it
themselves (the record label sells its own sponsors). The marketplace is the
*scaling* of the operator's capability, not the *creation* of it.

**The implication (the reframe that changes the customer model):** the "node
operator" customer is **not** a mid-tier creator who can't sell ads. They're a
**record label** — a curator + strategist who picks creators thematically and
sells the thematic inventory. The customer profile is: someone who *already*
thinks like a media company (a label, a publisher, a network), not someone who
needs to *become* one. The pitch to them is different: "run a media property.
You curate the creators. You sell the thematic inventory. You keep 85-90%."
That's a *strategist's* pitch, not a *host's* pitch. The operator is the
**mastermind** — the big-picture killer who sees the thematic vein and sells
into it.

**The "definitely not automatic" clause:** the ad sales are *not* automated in
M2. The operator sells their sponsors directly (off-platform, like a record
label sells its sponsors). The marketplace (M3) is the *later* automation.
Don't build the marketplace to solve a problem the operator doesn't have yet
(the operator *can* sell; they just don't have the marketplace to scale it).

---

## Gap 4 — Export/portability (the ownership story made real)

**The gap:** The thesis is "you own it — you can walk away." The manifesto says
"delete means delete, take it with you." But the export is **not shipped**. The
manifesto's placement notes say "add when shipped, not before: the 'take it
with you' portability line (D41) once export + federation actually ship." The
trust story is a *promise*, not a *product*, until export ships. A creator who
joins and can't actually export their audience finds out the "ownership" story
is a lie.

**The operator's take (the concrete mechanism):**

> "export your audience will have to be something that looks like a 301
> permanent redirect, where when the users get that redirect, they overwrite
> the old web10 username with the new web10 username, but the web10 servers
> have to facilitate the redirect while it is happening. hmm, maybe the
> username change i.e. the export the move, could happen in one big sweep per
> node! each node should have a migrations table and a processed no yes kind
> of a thing row for when people change their username and everyone has to
> migrate their web10 groups policies everything, the nodes could just do it
> automatically"

**The mechanism (the operator's concrete idea):**

1. **The 301 redirect.** When a creator moves their audience from node A to
   node B, the web10 servers facilitate a **301 permanent redirect**. The fan
   on node A gets redirected to the creator's new home on node B. The fan's
   old web10 username (on node A) is **overwritten** with the new web10
   username (on node B). The redirect is the *migration* — the fan follows the
   creator to the new node automatically.

2. **The migrations table.** Each node has a **migrations table** — a record of
   the users who are migrating, with a **`processed: yes/no`** flag. When the
   migration happens, the row flips to `processed: yes`. The table is the
   *state* of the migration — who's moved, who hasn't, who's in-flight.

3. **The one-big-sweep-per-node.** The username change (the export, the move)
   happens in **one big sweep per node** — not incrementally, not per-user,
   but as a *batch operation* on the node. The node processes the migrations
   table: for each user who's migrating, update their username, migrate their
   groups, policies, follows, everything. The nodes do it **automatically** —
   the operator triggers the sweep, the node executes it.

4. **The web10 servers facilitate the redirect.** The redirect isn't just a
   DNS thing — the web10 servers *facilitate* it. The old node (node A) knows
   the creator is moving to node B, and it redirects the fans accordingly.
   The redirect is *server-facilitated*, not just a URL change.

**The implication (the ownership story made real):** the export is not a vague
"take it with you" promise — it's a **concrete mechanism**: the 301 redirect +
the migrations table + the one-big-sweep-per-node. The creator triggers the
migration, the node processes the migrations table (username change, groups,
policies, follows), and the web10 servers facilitate the 301 redirect so the
fans follow the creator to the new node automatically. The audience is
*portable* in the literal sense: the fans are *redirected* to the new node,
their relationships (follows, groups, policies) are *migrated*, and the old
username is *overwritten* with the new one. That's the "own your audience"
story made real — the audience *moves with the creator*, automatically, via a
server-facilitated 301 redirect.

**The open questions (for when the export is built):**
1. **The 301 redirect scope:** does the redirect cover *all* the creator's
   content (posts, media, comments) or just the *relationships* (follows,
   groups, policies)? The operator's framing is "everyone has to migrate their
   web10 groups policies everything" — so it's the *relationships*, not the
   content (the content stays on the old node, the relationships follow the
   creator to the new node).
2. **The migrations table schema:** what's a row? (user_id, old_username,
   new_username, old_node, new_node, processed, timestamp?) The operator's
   framing is "a processed no yes kind of a thing row" — a simple flag, not a
   complex state machine.
3. **The one-big-sweep timing:** when does the sweep happen? (The operator
   triggers it? The node triggers it when the creator's new node is ready?
   There's a window where the old node is still serving and the new node is
   coming up — the sweep has to be atomic or the fans get a broken redirect.)
4. **The "overwrite" semantics:** the operator says "they overwrite the old
   web10 username with the new web10 username." Does that mean the fan's
   username *changes* (their old username is gone, replaced by the new one), or
   that the fan's *follow* of the old username is *re-pointed* to the new
   username? The operator's framing is "overwrite" — the old username is gone,
   the new one replaces it. That's a *hard* migration (the old username is
    dead), not a *soft* one (the old username redirects to the new one).

---

## Gap 5 — Federation (the network effect)

**The gap:** Rung 4 is "the network effect" — "the cross-node discover (a user
on node A can follow a creator on node B) drives users between nodes." One
sentence. Federation is the thing that makes web10 a *network* instead of a
bunch of isolated blogs. Without it, each node is an isolated community and
the "network effect" doesn't compound. The plan treats it as a given but
doesn't describe the mechanism, the identity portability, the content
federation, or the trust model between nodes.

**The operator's take:**

> "with the federation, i think we are close, we could in the ui have i round
> robin the discovers of multiple nodes, feed is straight up vert doable"

**The reframe (the gap is smaller than it looks):** federation is **close**,
not a blank. The mechanism is concrete and *doable*:
- **The cross-node discover** = **round-robin the discovers of multiple nodes**
  in the UI. The discover board (the "Trending" surface) pulls from multiple
  nodes and round-robins them (the same round-robin idiom as the ad
  collections — `ad-catalog-scale.md`). The user's discover board is a
  *blend* of the nodes they're connected to, not just their home node.
- **The cross-node feed** = **"straight up vert doable"** (vertically doable).
  The feed is already a vertical stream of posts; following a creator on
  another node just means their posts flow into the same vertical feed. The
  feed doesn't need a new shape — it needs to *pull from multiple nodes*,
  which is a read concern, not a render concern.

**The implication:** federation is **not** a blank — it's "round-robin the
discovers + pull the feed from multiple nodes." The hard parts (identity
portability, the trust model between nodes, the content federation) are the
*protocol* layer (the D60 generic backend, the `web10:` scheme, the cross-node
follow), and those are *close* (the operator's read). The *UI* layer (the
round-robined discover, the multi-node feed) is *doable* on top of it. The
"network effect" (rung 4) is closer than the plan's one-sentence treatment
implies.

---

## Gap 6 — The ownership story ("are we telling a better-than-life story?")

**The gap:** The thesis is "you own it — you can walk away." The manifesto says
"delete means delete, take it with you." But the export is **not shipped** (see
gap 4). The trust story is a *promise*, not a *product*, until export ships.

**The operator's take (the big sell + the honest question):**

> "maybe this own your own node is a big big sell. this version makes the
> internet down a level from this zuckerberg mafia, there are good questions,
> are we telling a better than life story here."

**The reframe (two things):**

1. **"Own your own node" is the BIG SELL.** The ownership story isn't a
   feature — it's the *headline*. "This version makes the internet down a level
   from this zuckerberg mafia" — the ownership story is the *anti-Zuckerberg*
   pitch. The creator owns the building, the audience, the data, the terms.
   That's the thing no megaplatform can offer (they *are* the landlord). The
   ownership story is the **differentiator** that makes web10 "down a level"
   from the mafia — a different *kind* of internet, not a better version of the
   same one. (This is the "new internet protocol" line from gap 2, applied to
   the ownership story.)

2. **"Are we telling a better-than-life story?" — the honest question.** The
   operator is *flagging* a risk: if the ownership story (the "you own it, you
   can walk away" promise) is *ahead* of the product (the export isn't shipped,
   the federation is close-but-not-there), then the pitch is a **better-than-
   life story** — a promise the product can't yet keep. A creator who joins on
   the "you own it" promise and finds out they can't actually export their
   audience (gap 4) or that the federation isn't there yet (gap 5) finds out
   the story was *ahead* of the reality. The question is: **is the ownership
   story the *lead* (the thing you pitch first, before the product can keep
   it) or the *payoff* (the thing that becomes real as the product ships)?**

**The implication (the sequencing question):** the ownership story is the
*big sell* (the headline, the anti-Zuckerberg pitch), but it's also the thing
most likely to be a "better-than-life story" if it's pitched *before* the
export (gap 4) + federation (gap 5) ship. The sequencing question: do you lead
with the ownership story (the big sell, the risk of overpromising) or lead
with the *stay* (the ads experience, the thing that's actually built) and let
the ownership story *catch up* as the export + federation ship? The operator's
"getting things great first" (gap 1) suggests the latter: build the stay (the
ads), let the ownership story (the join, the export, the federation) catch up.
The "better-than-life story" risk is the *cost* of leading with the ownership
story before the product can keep it.

---

## Gap 7 — "No algorithm" vs. content quality

**The gap:** The thesis says "100% delivery, no shadow ban, no algorithm —
that's the product." But it also means no way to handle spam/AI content without
an algorithm. The business plan cites "AI-content floods" as a *reason* the
product exists, but doesn't address how web10 handles AI content on the node.
The moderation surface (NodeSettings) is manual (the operator bans users). At
scale, manual moderation doesn't work. The "no algorithm" promise cuts both
ways: no one gets buried, but no one gets prioritized either — including the
human creators the product is for.

**The operator's take:**

> "you make your own algo! the feed lets you tune your knobs how you want, it
> is cool i actually use it."

**The reframe (the gap dissolves):** the "no algorithm" gap is a *false* gap.
The feed **already has** the algorithm — it's the **knobs** (the feed tuning:
Newest / Most loved / the power-mean sort, the `?knobs=` state, the
server-side ranking the feed rides). The user **tunes the knobs** to *their*
taste — "you make your own algo." The "no algorithm" promise is not "there's
no ranking" — it's **"the ranking is *yours*, not the platform's."** The
platform doesn't bury you or promote you (no shadow ban, no platform
algorithm); *you* decide what you see (the knobs). That's the difference:
- **Megaplatform:** the platform's algorithm decides what you see (the shadow
  ban, the reach throttling, the "our systems detected unusual activity").
- **web10:** *you* decide what you see (the knobs). The platform is a *neutral
  surface*; the algorithm is *yours*.

The operator *uses* the knobs ("it is cool i actually use it") — the feature
works, it's not a gap. The "no algorithm" promise is *kept* precisely because
the algorithm is *user-tuned*, not platform-tuned. The AI-content-flood concern
is real, but it's a *moderation* concern (the operator's manual curation, the
record-label reframe from gap 3 — the operator curates the node thematically),
not an *algorithm* concern. The knobs solve the "what do *I* see" problem; the
operator's curation solves the "what's on the node" problem.

**The implication:** the "no algorithm" gap is **closed** by the reframe: the
algorithm is *user-tuned* (the knobs), not *platform-tuned* (the shadow ban).
The pitch is "you make your own algo" — the feed is a *neutral surface* you
tune to your taste, not a *rigged feed* the platform controls. That's the
"100% delivery, no shadow ban" promise *kept*, not violated. The AI-content
concern is the operator's curation (gap 3), not the algorithm.

---

## Gap 8 — "Why pay for hosted when self-hosting is free?"

**The gap:** The plan says "self-hosting stays free forever (the credibility of
the whole ownership story depends on this — never gate the software)." But if
self-hosting is free, why would a technical creator (the target market) pay
$199/mo for the hosted version? The implicit answer is "the hosted version
includes the ad inventory + the subscription + the marketplace" (the things
that require a central operator), but the plan doesn't make this explicit. The
value prop for the *hosted* tier (vs. self-hosted) is unstated.

**The operator's take:**

> "paying for hosted, you can make money on the node ads on EVERYONES content,
> set a node ad percentage of 10%, you make money on 10% of all content on the
> whole node!"

**The reframe (the value prop, made explicit):** the reason to pay for hosted
is **node ad revenue on *everyone's* content.** A self-hosted creator can only
monetize *their own* content (their own affiliate ads, their own posts). A
*hosted* node operator can set a **node ad percentage of 10%** and make money
on **10% of *all* content on the *whole* node** — not just their own, but
*everyone's* who's on the node. That's the difference:
- **Self-hosted (free):** you monetize *your* content (your affiliate ads).
- **Hosted ($199/mo):** you monetize *the whole node's* content (the node ads
  at 10% of all content). You're a **media company** (gap 3, the record label)
  — you sell the *node's* attention, not just your own.

The $199/mo is the cost of being a **media company** (monetizing the whole
node) vs. a **solo creator** (monetizing your own content). The hosted tier is
the *media company* tier; the self-hosted tier is the *solo creator* tier.
The value prop is explicit: **pay $199/mo to monetize 10% of everyone's
content on the node, not just your own.**

**The implication:** the "why pay for hosted" gap is **closed** by the reframe:
the hosted tier is the **media company** tier (node ads on everyone's content,
the record-label reframe from gap 3), the self-hosted tier is the **solo
creator** tier (your own affiliate ads). The $199/mo buys the *media company*
capability (the node ad inventory across the whole node), not just *hosting*
(the infrastructure). The value prop is: "self-hosting is free if you just want
to post; hosting is $199/mo if you want to *run a media property* and
monetize the whole node's attention at 10%."

---

## Gap 9 — The marketing pages are out of sync with the strategy

**The gap:** the marketing pages (`marketing-ui`) tell the *ownership* story
(the thesis: data policy, 100% delivery, sovereignty), but the product has
pivoted to the *ad platform* (the business plan: node ads, the record label,
the monetization ladder). The whole `ads-october/` conversation is about the
*stay* (monetization, the ad experience, the catalog, the record label). The
marketing is all about the *join* (own your audience, 100% delivery,
sovereignty). The *stay* isn't in the marketing at all. The D20 strategic
orientation ("social platform first, protocol second") and the ads-october
conversation shifted the center of gravity to the *stay*, but the marketing is
still all *join*.

**The concrete breakage (verified in `marketing-ui/src/pages/`):**

1. **Join page step 3 is a dead link.** `Join.tsx` step 3 points to
   `auth.web10.app?mode=studio` — "Set up your monetization / Open the
   Studio." But **the Studio was removed in 3.99.0** (D75 — monetization moved
   to the social app's `/monetize`). There are *zero* references to "studio"
   left in the authenticator `ui/`. So step 3 of the onboarding flow sends a
   new creator to a mode that no longer exists. The correct target is the
   social app's `/monetize` (the `MonetizationScreen`, the one-tab surface from
   3.217.0). **This is a live bug in the onboarding flow** — a new creator
   following the "Join" steps hits a dead end at step 3.

2. **Home page has no monetization story.** `Home.tsx` is all "Your audience.
   100% delivery. Not a promise the algorithm can revoke." True, but it's the
   *join* story. The *stay* story — "you make money here, the ads are
   different, you keep 100% of your ad revenue, you run a media company" —
   isn't there. The business plan's "comparison that closes deals" (the
   $199/mo vs. YouTube's shadow ban, §4) isn't on the landing page. The
   landing page is the *conversion moment* (the manifesto's placement notes
   say "this page must be the slickest screen in the app — it IS the
   conversion moment"), but it converts on *ownership*, not on *monetization*.

3. **Everything page mentions a marketplace that doesn't exist in v3.**
   `Everything.tsx` has "Marketplace for goods, services, digital products.
   Your audience, your margins." That's M3 (the sponsor marketplace), which
   the business plan explicitly says "contributes ~$0 within this window"
   (§6). It's a promise ahead of the product — exactly the "better-than-life
   story" risk flagged in gap 6. The marketplace is *positioning* (the
   "new internet protocol" line from gap 2), not a *shipped feature*.

4. **Freedom page is actually aligned.** `Freedom.tsx` — "The internet has a
   power problem… You own your node… Graduation is built in." This one's good
   — it's the *ownership* story, told well. It's the *join* side, and it's
   coherent. The problem isn't the Freedom page; it's that the *other* pages
   (Home, Join, Everything) haven't been updated for the *stay*.

**The pattern:** the marketing was written for the *thesis* (data policy,
ownership, sovereignty) and hasn't been updated for the *business plan* (ads
platform, node ads, the record label, the monetization ladder). The
"better-than-life story" question (gap 6) is *literally happening* on the
marketing pages: the Everything page promises a marketplace (M3, not shipped),
the Join page points to a Studio (removed), and the Home page doesn't tell the
monetization story (the thing that's actually built and is the current focus).

**The implication (the fix, when the marketing is updated):**
- **Join page step 3:** fix the dead link. Point to the social app's
  `/monetize` (the one-tab surface), not the removed Studio. This is a *live
  bug* — fix it first, it's breaking the onboarding flow.
- **Home page:** add the *stay* story. The monetization pitch (the
  "comparison that closes deals" from the business plan §4): "same revenue as
  YouTube, no shadow ban, you own the building. The $199 keeps the node
  running." The landing page should convert on *both* the join (ownership)
  and the stay (monetization), not just the join.
- **Everything page:** the marketplace line is *positioning*, not a *shipped
  feature*. Either (a) keep it as the "new internet protocol" vision (the gap 2
  framing) but make clear it's the *direction*, not the *current product*, or
  (b) replace it with the *shipped* monetization story (the node ads, the
  affiliate ads, the no-ads subscription — the v3 revenue lines). The
  "better-than-life story" risk (gap 6) is the cost of leading with the
  vision before the product can keep it.
- **The cross-cutting fix:** the marketing needs a *stay* section (the
  monetization story) alongside the *join* section (the ownership story). The
  *join* is the Freedom page (good, aligned). The *stay* is missing (the Home
  page, the Join page, the Everything page are all *join*-only). The
  `ads-october/` folder is the *stay* content — the ad experience, the
  record label, the "different than YouTube" frame, the "ads people like to
  look at" emotional core. That content needs to *land on the marketing
  pages*, not just live in the strategy docs.

---

## The cross-cutting observation

The nine gaps are the **join** side of the business (how the audience arrives,
how the operator sells, how the creator leaves, how the network compounds) and
the **marketing** side (how the story is told, gap 9).
The `ads-october/` folder is the **stay** side (how the creator makes money,
how the ads work, how the catalog scales). The operator's framing is explicit:
*"were getting there, just getting things great first though"* — build the
stay (the ads experience) first, then build the join (the migration, the sales,
the export, the federation). The gaps are captured for the record and to inform
the build order, but they're not the current focus.

**The operator's takes closed or reframed most of the gaps:**
- **Gap 3 (record label)** changes the customer model: the operator is a
  *strategist*, not a *host*.
- **Gap 4 (301-redirect export)** makes the ownership story *real* (a concrete
  mechanism, not a vague promise).
- **Gap 5 (federation)** is *close* (round-robin the discovers, vertical feed)
  — not a blank.
- **Gap 7 (no algorithm)** *dissolves*: the algorithm is *user-tuned* (the
  knobs), not *platform-tuned* (the shadow ban). "You make your own algo."
- **Gap 8 (why pay for hosted)** is *closed*: the hosted tier is the *media
  company* tier (node ads on everyone's content at 10%), the self-hosted tier
  is the *solo creator* tier.

**The gaps that remain genuinely open:**
- **Gap 1 (fan migration)** — the sales-side concern, deferred ("getting things
  great first"). The importer + onboarding + "why join" path.
- **Gap 2 (ads platform revenue certainty)** — the positioning ("mastodon-style
  + ads = novel"), the falsification is the plan's §6e.
- **Gap 6 (the "better-than-life story" question)** — the *sequencing* question:
  do you lead with the ownership story (the big sell, the risk of
  overpromising) or lead with the stay (the ads, the thing that's built) and
  let the ownership story catch up as the export + federation ship?
- **Gap 9 (marketing out of sync)** — the marketing pages tell the *join*
  story (ownership) but not the *stay* story (monetization). The Join page
  step 3 is a **live dead link** (points to the removed Studio). The Home page
  has no monetization story. The Everything page promises a marketplace (M3,
  not shipped). The fix: update the marketing to tell *both* the join and the
  stay; fix the dead link first (it's breaking the onboarding flow).

The **record-label reframe** (gap 3) is the one that changes the customer
model: the operator is a *strategist* (a record label), not a *host*. That
changes the pitch, the onboarding, and the marketplace design. Capture it in
the business plan when the operator's take is settled.

The **301-redirect export** (gap 4) is the one that makes the ownership story
real. It's a concrete mechanism (the migrations table, the one-big-sweep, the
server-facilitated redirect), not a vague promise. Capture it in the thesis /
the export KB when the mechanism is settled.

The **"you make your own algo"** reframe (gap 7) is the one that *closes* the
"no algorithm" gap: the algorithm is *user-tuned* (the knobs), not
*platform-tuned*. The pitch is "you make your own algo" — the feed is a
*neutral surface* you tune to your taste. Capture it in the thesis / the feed
KB when the operator's take is settled.

The **hosted = media company** reframe (gap 8) is the one that *closes* the
"why pay for hosted" gap: the hosted tier is the *media company* tier (node
ads on everyone's content at 10%), the self-hosted tier is the *solo creator*
tier. Capture it in the business plan (the pricing section) when the operator's
take is settled.

The **marketing out of sync** gap (gap 9) is the one that's *live* — the Join
page step 3 is a dead link (points to the removed Studio), the Home page has
no monetization story, and the Everything page promises a marketplace (M3, not
shipped). The fix is to update the marketing to tell *both* the join (ownership)
and the stay (monetization). The dead link is the urgent part — it's breaking
the onboarding flow right now. Capture it in the marketing-ui work order when
the marketing refresh is scoped.
