# NEED — know what each ad is actually earning (commission + cost + projection)

**Status: OPEN.** Filed from the operator's ad-experience pass (05.10.2026).
The operator, running 30 ads, wants to know the *money* per ad — not just that
an ad is out there, but what it's worth.

## The complaint (verbatim)

> "need to know how much commission each ad makes. need to know the cost of
> the item, me personally i want to know these things, know how much i stand
> to make with x amount of views with the ad attached, not sure if we need a
> calculator for that or what?"

## The three asks, decomposed

1. **Commission per ad** — "how much commission each ad makes." The revenue an
   ad has actually generated.
2. **Cost of the item** — the product's price (the affiliate's base, the
   commission is a % of this).
3. **Projection** — "how much i stand to make with x amount of views with the
   ad attached." A what-if: given the commission rate + the item cost + a view
   count, what's the expected earnings? The operator isn't sure if this needs a
   calculator or just a number.

## The wall (the load-bearing observation) — read this first

**The platform does not measure ad views/impressions today.** Verified: there
is no impression counter, no view tracking, no `ad_view` event anywhere in the
ad surface or the post data. What the platform *does* know per post is the
engagement tally (likes + comments + reposts, the `engagementScore`) — that's
interaction, not *reach*. A post can be seen 10,000 times and carry 3 likes.

So ask #3 ("x amount of views") has **no "x" to plug in yet.** The projection
is only as good as the view count, and the view count isn't measured. This is
the real gate: **before any calculator, the platform needs to count how many
times an ad was shown.** That's a measurement build (an ad-impression counter),
not a display build.

**And the commission itself is not on web10's rails.** The affiliate payout
lives with the *affiliate program* (Amazon, PartnerStack, etc.) — web10 never
sees the click→purchase→payout. web10 can know the *rate* (the creator enters
it) and the *item cost* (the creator enters it, or it's pulled from the link —
see `external-link-embeds.md`), and it can count *impressions* (its own data).
But "how much commission each ad **makes**" (ask #1, the actual money) is only
knowable if the creator reports it or the program feeds it — web10 can model
the *expected* commission (rate × estimated conversions) but cannot report the
*real* payout without a data source it doesn't have.

## The two monetization models (the economic rationale)

The operator's "holy shit" moments (the YouTube RPM comparison, the 70% SaaS
commissions) are not trivia — they are the *why* behind the measurement gate
and the form changes. Capture them before anyone scopes the build.

### The math that motivated this (the operator's "holy shit")

The operator ran the affiliate math for 100k views on a $20 item:

> $20 × 5% = $1/sale · 100k × 1% CTR = 1,000 clicks · 1,000 × 1% buy = 10
> sales · 10 × $1 = **$10 total = $0.01 per 1k views.**

Then:

> "youtube says $2 to $10 per 1k views that is CRAZY, how the fuck do they do
> it for the user, is that a lie!!!!!!!"

**It's not a lie.** YouTube pays **$200–$1,000** for the same 100k views =
**$0.20–$1.00 per 1k views** — **200–1,000x** the affiliate number. The gap is
the model, not the arithmetic.

**Why — and the operator's "hook for a minute" instinct is exactly it.**
YouTube doesn't need the viewer to *buy* anything. It sells the **view itself**
to an advertiser — the advertiser pays for *attention*, and attention is
plentiful. A purchase is a lottery (1% of 1% = 0.01% of the audience converts).
An impression is guaranteed — the ad shows, the advertiser pays, done. That's
why the bar is watch-time, not conversion: YouTube only monetizes a view after
~30s+ of watch (mid-rolls need ~8min), so the "hook" is literally the billing
trigger. They charge for the minute held, not the thing bought.

**The commission-rate point is real too.** Amazon is brutal and
category-dependent: most stuff is 1–4%, a few categories (luxury beauty, some
tools) hit 8–10%, but the 10% stuff is rare and the 1% stuff is everywhere
(grocery, electronics, gas). So the $1/sale assumption is *optimistic* for a lot
of the catalog — a lot of it is $0.20/sale.

### The two models in the product

web10 has **two** monetization models in the product, and they're worth wildly
different things per view:

| Model | Where | Pays on | Per-view value | Analogy |
|-------|-------|---------|----------------|---------|
| **Conversion** | affiliate ads (the Amazon/SaaS link in a creator's ad) | the *sale* | low ($0.01/1k) | the creator's money, what they already do |
| **Impression** | node ads (the operator's "Sponsored" inventory) | the *view* / attention | high ($0.20–1.00/1k) | **structurally YouTube** |

**This is the load-bearing reframe.** Node ads are *not* "a second ad slot" —
they are the **YouTube-RPM inventory**, priced per view/attention, not per
purchase. And that is *exactly* why the impression-measurement gate (above) is
non-negotiable:

- The **affiliate** side works *without* impression counting — the program pays
  the creator regardless of what web10 measures.
- The **node-ad** side needs *some* counting — its value proposition is "I'll
  pay you X per 1k shown," and you can't price a shown you don't count.

So the measurement build is not a nice-to-have for the earnings panel — it is
the thing that makes the *higher-value* inventory (node ads) monetizable at all.

> **The "different way" landing (further below) corrects the *bar*, not the
> existence.** The gate is real (you can't project from nothing), but it is a
> **lightweight** shown + clicked counter — *not* a YouTube-grade RPM-pricing
> telemetry stack. The "worthless without it" framing above is about the
> *existence* of counting; the landing is about the *bar* being low.

### The SaaS recurring math (the category strategy)

The operator: "software can be 70% commissions??" — and that changes the whole
math, because SaaS (via PartnerStack etc.) is **recurring**, not one-time:

| | Amazon (one-time) | SaaS (recurring) |
|---|---|---|
| Per conversion | $20 × 5% = **$1** | $50/mo × 30% = **$15/mo, forever** |
| Per referral, 12-mo life | $1 | **$180** |
| Per referral, 24-mo life | $1 | **$360** |

That's not 5x Amazon. It's **180x–360x per conversion.** And the conversion
rate is *higher* on web10 (below), which compounds it.

**The strategic call (first pass): push digital/recurring, not *someone
else's* physical products.** The bootcamp already lists PartnerStack, but the
ad form is still *Amazon-shaped* — one-time %, a single product link. The
high-value inventory for web10 is **SaaS + digital + recurring**, not *another
company's* physical goods. Two implications:

1. **The ad form should make recurring obvious** — a "/month" toggle, a
   "recurring" flag on the commission rate. A one-time-% form hides the best
   inventory.
2. **The earnings panel should project LTV per referral** (rate ×
   months-stayed), not just one-time commission. That's the number that makes a
   creator say "this is worth 100k views" instead of "$10 for 100k views, why
   bother."

### The third tier — own merch (the highest margin, the most organic)

The operator's addition (05.10.2026):

> "also, people can push their own merch in an ad on here, then they absolutely
> get more commission, if they do a printful store, etc"

This is a **third tier** in the commission hierarchy, and it's the one that
ties the whole conversation together:

| Tier | Product | Who owns it | Per-unit margin | Recurring? | Organic? |
|------|---------|-------------|-----------------|------------|----------|
| **Amazon affiliate** | physical, someone else's | the brand (Amazon) | 1–5% of price | no | low (a random product link) |
| **SaaS / digital recurring** | digital, someone else's | the SaaS company | 30–70% of MRR, recurring | **yes** | medium (a tool recommendation) |
| **Own merch** (Printful / Printify) | physical, **the creator's** | **the creator** | **100% of the product margin** | no | **highest** (the creator's own thing) |

The own-merch case is the **highest per-unit margin** on the platform: a $30
shirt with $10 COGS (Printful print-on-demand, no inventory, no upfront cost)
= **$20 margin, the creator keeps all of it.** No affiliate program taking a
cut. No brand in the middle. The creator *is* the merchant.

And it's the **most organic** ad type — the most natural recommendation
possible. A creator saying "I made this shirt, here's the link" is not an
interruption, not a sponsored spot, not a tracking link to someone else's
product. It's the creator's *own thing*, sold to the audience they built. That's
the "ads people like to look at" emotional core (above) in its purest form:
the ad *is* the creator's expression, not an extraction from the user.

**The strategic call (revised):** the category strategy is not just
"digital/recurring-first" — it's **a hierarchy of margin + organic-ness**:

1. **Own merch** (highest margin per unit, most organic, the creator's own
   thing) — the most natural ad, the one that best fits the "recommendation,
   not interruption" position.
2. **SaaS / digital recurring** (highest LTV per referral, recurring, a tool
   recommendation) — the best *revenue* per referral over time.
3. **Amazon affiliate** (lowest margin, someone else's product, a tracking
   link) — the easiest to start (no product to make, no SaaS to sign up for),
   but the lowest value.

The ad form should make **all three** easy to enter (the `kind` field already
has `affiliate` / `direct` / `own_store` — the `own_store` case is the merch
tier, and it should be *first*, not last, in the form's mental model). The
earnings panel should show the right number for each tier: **margin per unit**
for merch, **LTV per referral** for SaaS, **commission per sale** for Amazon.
The bootcamp should teach the hierarchy: "start with Amazon (easiest), move to
SaaS (best LTV), and if you have merch, that's your highest-margin, most
organic ad."

**The Printful / Printify angle:** print-on-demand means the creator doesn't
need inventory, upfront capital, or a logistics operation. They design the
shirt, Printful prints + ships it, the creator keeps the margin. The marginal
cost of "making a merch line" is near zero (a design + a Printful account),
which means the "6th post" argument extends to merch: the creator already has
the audience, the marginal cost of *selling to them* (via a Printful store +
an ad on their post) is near zero. The net catches merch too.

### The "beat YouTube" thesis (superseded — see the landing below)

> This section is the *first* step in the conversation's arc. The operator
> later dropped the competitive frame entirely ("we dont need to beat youtube,
> we need to do different than youtube") — see the "landing" and "final frame"
> sections further below. Read this as the stepping stone, not the position.

The operator: "i am brainstorming ways we can beat youtube." The honest answer:

**web10 does not beat YouTube on RPM.** You can't out-attention Meta's ad
auction. But you beat them on **revenue-per-conversion × conversion-rate**, and
both factors are *structurally* higher in the web10 model:

1. **Relevance.** YouTube's problem is a random car commercial hitting a random
   viewer watching a cooking video — low CTR, low conversion, so they need
   *volume* (hence the $2–10 RPM, selling attention at scale and praying a
   percentage converts). web10's ad is **attached to a post about that thing**,
   by a **creator the user chose to follow** for that content. A dev-tools
   creator recommends a $50/mo SaaS tool in a post about their workflow, to an
   audience that follows them for dev content. That's not a random ad — it's a
   **peer recommendation with a tracking link.** Higher CTR, higher conversion,
   180x commission.
2. **Less fatigue.** YouTube fires an ad every 30–90 seconds. Node ads on web10
   are maybe 1 in 10 posts. Each one lands harder because the user isn't
   fatigued, and the creator's recommendation carries trust a pre-roll never
   will. "You are supporting the creator, and not getting fatigued by youtube
   ads shit, the web10 node ads are way less frequent, lets the creators make
   the money."

So the pitch is not "more ads" — it's **"fewer, better-placed,
higher-commission ads that the creator actually stands behind."** That is the
creative-platform pitch the manifesto already makes (own your audience, 100%
delivery, no shadow-ban) applied to the ad economy.

### Refinement — it's a *different kind* of impression, not a worse one

The operator's correction to the "beat YouTube" framing (05.10.2026):

> "there are surfaces, the shorts, the vids, the posts. youtube is dialing in
> on the video impressions -> we dont have video ads, where mid video an ad
> plays, it makes sense if you got the viewers that far, and made them sit
> through a 30 second ad, that yes, you would get a deeper impression view
> thing where that is worth 2-10 per 1k, vs they clicked around your video, it
> got the impression, but then scroll into your ad even though they didnt
> brainrot on your video, it is a different kind of impression, we dont need to
> be insecure about it, pretty cool that we could make videos that are widely
> seen, but less captivating, posts too, all the media on here monetizable"

Two things this corrects:

1. **The "beat YouTube" framing was the wrong frame.** It's not "web10's
   impression is better than YouTube's." They're **different kinds of
   impressions**, and the operator is explicit: *"we dont need to be insecure
   about it."* The comparison was a "holy shit" moment, not a competitive
   claim. The honest frame: **YouTube's is a deeper impression, web10's is a
   broader one.**

2. **YouTube's $2–10/1k is specifically the *mid-roll video* impression.**
   YouTube dials in on the *video* surface and monetizes the *deepest* kind of
   attention it has: the viewer got that far into a video, sat through a 30s
   mid-roll ad, *and* the watch-time billing trigger fired. That's a high-
   commitment impression — the viewer brainrotted on the video long enough that
   a 30s interruption is tolerable. That's why it's worth $2–10/1k.

   **web10's impression is shallower but more numerous.** The viewer clicked
   into a video (or a post, or a short), got the impression, and scrolled into
   the ad — *without* having brainrotted on the content first. It's a lighter
   commitment, so it's worth less per impression. But:

   - **The surface is broader.** YouTube monetizes *video*. web10's
     monetizable surface is **all the media** — posts, shorts, vids, the whole
     feed. *"posts too, all the media on here monetizable."* A text post with
     an attached ad is an impression YouTube can't even make.
   - **The content is widely seen but less captivating.** *"pretty cool that we
     could make videos that are widely seen, but less captivating."* web10's
     100%-delivery architecture means the content reaches the whole audience
     (no shadow-ban, no ranking gate) — so the *volume* of impressions is
     higher, even if each one is a shallower commitment.

**The reframe, stated plainly:** don't price web10's impressions at YouTube's
mid-roll RPM. Price them at what a *shallow, broad, all-surface* impression is
worth — which is lower per 1k than a 30s mid-roll, but multiplied across a
broader surface (posts + shorts + vids) and a higher-delivery audience. The
win is **volume × breadth**, not **depth**. That's a defensible, honest
position — and it's the one the operator landed on: not insecure, just a
different kind of impression.

**Implication for the measurement build:** the impression counter should be
**per-surface** (post / short / video) and **per-depth** (a shallow scroll-past
vs a deeper dwell), because the two are worth different things. A single
"impression" number that lumps a 0.5s scroll-past with a 30s dwell would
misprice the inventory. (This is the "Impression = what?" open question, now
 sharper: it's not one number, it's a *distribution* across surfaces and depths.)

### The creator-behavior implication — the "fishing net"

The operator's next move (05.10.2026), the behavioral consequence of the
breadth model:

> "people can do alot more frequent smaller content, just posts and stuff, and
> people will be seeing ads of their on that stuff, this is really expanding
> the net of the influencer. this competing with youtube in #### numbers doesnt
> make so much sense maybe. this is almost like casting a fishing net"

This is the **incentive flip** the breadth model produces, and it's the part
that makes the model *self-reinforcing*:

1. **The creator's optimal strategy changes.** On YouTube, the rational move is
   to make *few, long, high-retention* videos — because the deep mid-roll
   impression is where the money is, and you need watch-time to unlock it. On
   web10, the rational move is to make **many, small, frequent** pieces of
   content — posts, shorts, quick clips — because *every single one* is
   monetizable surface. A text post with an attached ad is an impression
   YouTube can't even make. The more you post, the more net you cast.

2. **The "net" metaphor is the model, stated plainly.** Each post/short/vid is
   a cast of the net. The audience is the water. The ads attached to the content
   are what the net catches. **More casts = more catches**, even if each cast
   is a smaller net. YouTube is a *deep* net (few casts, each one holds a lot).
   web10 is a *broad* net (many casts, each one holds less, but the total
   surface area is larger). The operator: *"this is almost like casting a
   fishing net."*

3. **"Competing with YouTube in #### numbers doesn't make sense."** The
   operator is dropping the direct-comparison frame entirely. You don't beat
   YouTube on their numbers (RPM, watch-time, mid-roll depth). You play a
   *different game* — one where the unit of monetization is the *post*, not the
   *video*, and the creator's edge is *frequency + breadth*, not *depth +
   retention*. The "holy shit" and the "beat YouTube" were both the wrong
   frames; the right frame is **"a different game, with a different optimal
   strategy for the creator."**

4. **This is the manifesto's "own your audience" applied to the ad economy.**
   The 100%-delivery architecture (no shadow-ban, no ranking gate) is what
   makes the net *actually* cast — every post reaches the whole audience, so
   the volume of impressions is real. On YouTube, the algorithm decides who
   sees your video; on web10, your followers *all* see your post. The net
   catches what the algorithm would have hidden.

**The reframe, stated plainly:** web10's ad model doesn't compete with
YouTube's on depth. It **changes the creator's optimal strategy** from "make
few deep videos" to "cast many small nets." The monetizable surface is broader
(all media, not video-only), the delivery is higher (100%, not algorithm-
gated), and the creator's edge is frequency, not retention. That's the "fishing
net" — and it's the honest, defensible position that replaces both the "holy
shit" and the "beat YouTube" frames.

**Implication for the product:** the ad experience should *reward frequency*.
If the creator's optimal strategy is "cast more nets," the ad form should make
it *fast* to attach an ad to a new post (the `ad-creative-labor.md` need is
exactly this — the 30-ads labor problem *is* the friction on casting more
nets). The economics panel should show a **portfolio view** (all 30 ads,
projected total) so the creator sees the net's total catch, not just one
 cast's. The bootcamp should teach the "cast more nets" strategy explicitly —
 frequency + breadth is the play, not "make one great video."

### The landing — "different than YouTube, not better than YouTube"

The operator's final frame (05.10.2026), which *corrects* the over-build in the
sections above:

> "we dont need to beat youtube, we need to do different than youtube, we have
> a more organic ad surface, we dont need to hyper log impression shit, this is
> just a different way."

Three things this lands:

1. **"Different than," not "better than."** The "beat YouTube" and even the
   "volume × breadth, not depth" frames were still *comparative* — still
   measuring web10 against YouTube's numbers. The operator drops the comparison
   entirely: web10 is a **different way**, not a better version of the same
   thing. The organic ad surface (the ad attached to a post the creator made,
   seen by an audience the creator owns) is the *point* — not a compromise
   against YouTube's mid-roll.

2. **"We don't need to hyper-log impression shit."** This is the direct pushback
   on the per-surface + per-depth impression machine sketched above. The
   operator is saying: don't build YouTube-grade impression telemetry just to
   price node ads at an RPM. The "different way" doesn't need YouTube's
   instrumentation. The measurement that matters is **lightweight** — enough to
   answer "is this ad earning, roughly?" — not a deep-dwell, per-surface,
   watch-time-billing telemetry stack. The "non-negotiable gate" framing
   (below) is *too strong*: the gate is real (you can't project earnings from
   nothing), but the *bar* is low. A simple "ad was shown" + "link was clicked"
   counter is enough. The per-depth / dwell-time / watch-time billing is
   YouTube's problem, not web10's.

3. **"A more organic ad surface" is the whole thesis, in one phrase.** The ad
   is organic because it's *content* — a post the creator made, with an offer
   attached, seen by people who follow the creator. It's not an interruption
   (a pre-roll, a mid-roll, a banner). That's the structural difference from
   YouTube, and it's why the "different way" frame is right: you can't compare
   an organic ad to an interrupted one on the same axis. They're different
   animals.

**The reframe, stated plainly (replacing the "beat YouTube" and "volume ×
breadth" frames):** web10's ad model is **organic** — the ad is content, the
audience is owned, the surface is all media. It's not a worse YouTube, not a
better YouTube, not a YouTube you beat on RPM. It's a **different way** to
monetize an audience, and the measurement it needs is **lightweight** (shown +
clicked), not YouTube-grade telemetry. The "holy shit" (the RPM gap) and the
"beat YouTube" (the competitive frame) were both stepping stones to this
landing: *different way, organic surface, light measurement.*

**Implication for the build (correcting the over-build):** the impression
counter is **simple** — an "ad was shown" event + a "link was clicked" event.
No dwell-time, no watch-time billing, no per-depth pricing tiers. That's
enough to (a) answer "is this ad earning, roughly?" and (b) feed the what-if
calculator with a real click-through rate. The per-surface + per-depth
instrumentation sketched in the "different kind of impression" section is
**deferred** — it's YouTube's problem, and the operator is explicit that web10
doesn't need it. If it's ever wanted, it's a follow-up, not the gate.

### The final frame — "a new muscle" + the "6th platform"

The operator's closing frame (05.10.2026), the strategic position the whole
conversation lands on:

> "we just need to be unique, different, like a new work out working a new
> muscle. if an influencer is hitting 5 platforms with the same video, why not
> web10 the 6th post? hit the audience in a different way, the ad experience is
> just different, wont fatigue, and also they get to keep their audience"

Two metaphors, one position:

1. **"A new muscle."** web10 isn't competing with YouTube for the same muscle
   (deep video retention, mid-roll RPM). It's a **new muscle** — a different
   workout. An influencer who trains the YouTube muscle (long-form video,
   watch-time, mid-rolls) can *also* train the web10 muscle (frequent small
   posts, organic attached ads, owned audience). The muscles don't compete;
   they're additive. That's why "different than" is the right frame and "beat
   than" was wrong — you don't beat a muscle, you *add* one.

2. **"Why not web10 the 6th post?"** This is the **distribution** argument, and
   it's the most concrete one yet. An influencer already cross-posts the same
   content to 5 platforms (YouTube, Instagram, TikTok, X, …). The marginal cost
   of a **6th** post is near zero — they're already making the content. web10
   is not asking them to make *new* content; it's asking them to **post the
   same content one more place**, to a **6th audience** — one they *own* (no
   algorithm, no shadow-ban, 100% delivery). The ad experience on that 6th
   post is **different** (organic, attached, low-fatigue) and the **audience is
   theirs to keep** (the whole thesis — "own your audience").

**The reframe, stated plainly (the final position):** web10 is the **6th
platform** an influencer already posts to — a **new muscle** they train
alongside the other five. The content is the same (low marginal cost), the
audience is owned (the thesis), the ad experience is different (organic, not
interruptive, low-fatigue). The win is not "better than YouTube" or "more
breadth than YouTube" — it's **"one more place to post, to an audience you
keep, with an ad experience that doesn't fatigue them."** That's the unique
position. No comparison, no RPM, no telemetry arms race. Just: *a different
way, a new muscle, the 6th post.*

**Implication for the product + the pitch:**
- **The onboarding / bootcamp pitch is "the 6th post."** Not "join web10 and
  beat YouTube" — "you already post to 5 platforms; post the 6th here, keep
  the audience, the ads are different and don't fatigue your people."
- **The ad experience is the differentiator, not the RPM.** The organic,
  attached, low-fatigue ad is the *product* — not a number to optimize against
  YouTube's. The measurement stays lightweight (shown + clicked) because the
  value is the *experience*, not the telemetry.
- **"They get to keep their audience" is the closer.** Every other platform
  rents the audience (the algorithm decides who sees it; the platform can
  shadow-ban, can take the ad revenue, can change the rules). web10 is the one
  where the audience is *theirs*. That's the line that makes the 6th post worth
  making.

### The emotional core — "ads people like to look at"

The operator's final emotional landing (05.10.2026), the *why* behind the whole
"different way" frame — why people will actually tolerate web10's ads when they
hate everyone else's:

> "we are clearly offering a different ad experience, there are pros cons,
> youtube is doing something crazy with that $2-$10 per 1000, but we are not
> youtube. we have a platform with ads people like to look at, ads that arent
> cringe, duh, people have to make money, not eww this fucking zuckerberg guy
> is getting in the middle ads"

This is the **user-side** of the argument, and it's the part that makes the
model *sustainable* (not just defensible):

1. **"Ads people like to look at, ads that aren't cringe."** The user's
   relationship to the ad is the whole thing. On YouTube/Facebook/TikTok, the
   ad is an **interruption** — a 30s spot you didn't ask for, inserted by the
   platform to extract money from you. The user's emotional response is
   *"eww this fucking zuckerberg guy is getting in the middle."* On web10, the
   ad is **content** — a post the creator made, with an offer attached, seen in
   the context of content the user *chose* to follow. The user's emotional
   response is *"oh, they recommend this, cool."* Same economic function (the
   creator gets paid), completely different emotional experience. **The ad is
   not cringe because it's not an interruption — it's a recommendation.**

2. **"People have to make money."** The operator is naming the *moral*
   dimension. Every platform needs to make money; the question is *how*.
   YouTube/Facebook make money by **interrupting the user** (the user is the
   product, the ad is the extraction). web10 makes money by **letting the
   creator recommend** (the user is the audience, the ad is the creator's
   voice). The user *allows* the ad because it's the creator they trust, not
   the platform they resent. That's the difference between an ad you tolerate
   (because leaving is costly) and an ad you *welcome* (because it's the person
   you follow).

3. **"YouTube is doing something crazy, but we are not YouTube."** The operator
   is *acknowledging* the RPM gap ($2–10/1k is "crazy") and *not* trying to
   match it. The "crazy" number is what you get when the ad is an interruption
   (the user tolerates it because the alternative is leaving, and the platform
   extracts maximum value from that tolerance). web10's number is lower, but
   the user *likes* it, which means:
   - **Lower fatigue** → the user stays longer, sees more content, the net
     casts more (the "fishing net" above).
   - **Higher trust** → the creator's recommendation converts better (the
     "relevance" point above).
   - **A defensible position** → "we don't do cringe ads" is a *feature*, not a
     limitation. It's the reason a user picks web10 over the alternatives.

**The reframe, stated plainly (the emotional landing):** web10's ad model is
**sustainable because the user likes the ad.** YouTube's $2–10/1k is "crazy"
because it's extracted from a user who *hates* the interruption (the "eww
zuckerberg" response). web10's lower number is *earned* by a user who *welcomes*
the ad (the "oh, they recommend this" response). The trade is explicit and
honest: **less per impression, but the user stays, trusts, and converts.** That's
not a compromise — it's a *different deal* with the user, and it's the deal that
makes the platform something people want to be on, not something they tolerate.

**Implication for the pitch + the design:**
- **The user-facing pitch is "ads that aren't cringe."** Not "we pay creators
  more" (that's the creator pitch) — "the ads here are recommendations from
  people you follow, not interruptions from a platform." That's the line that
  makes a *user* sign up.
- **The ad design must preserve the "recommendation, not interruption" feel.**
  The ad dressing (the "Ad"/"Sponsored" badge + the disclosure) is *required*
  (transparency, the manifesto), but the *placement* (attached to a post, in
  the context of content the user chose) is what makes it a recommendation.
  Don't add pre-rolls, mid-rolls, or banner ads — that would turn the
  recommendation back into an interruption and destroy the whole position.
- **"People have to make money" is the moral frame for the creator pitch.** The
  creator isn't being exploited by the platform (the platform takes a small %
  of revenue, the creator keeps the audience + the relationship). The ad is the
  creator's *choice* to recommend, not the platform's *extraction* from the
  user. That's the "supporting the creator" line the operator keeps coming back
  to.

### What this means for the build (the implications)

- **The measurement is lightweight, not YouTube-grade** — an "ad was shown" +
  "link was clicked" counter is enough to answer "is this ad earning, roughly?"
  and feed the calculator. The per-surface + per-depth / dwell-time / watch-time
  billing is **deferred** (the "different way" landing above) — it's YouTube's
  problem, not web10's. The gate is real (you can't project from nothing) but
  the *bar* is low.
- **The ad form should be recurring-aware** — a "/month" / recurring toggle on
  the commission rate, so SaaS/digital (the best inventory) is easy to enter.
- **The earnings panel should project LTV** (recurring) and one-time (physical)
  per referral, not just one-time commission.
- **The category strategy is digital/recurring-first** — the bootcamp + the ad
  form should surface SaaS/digital programs as the high-value path, not treat
  Amazon as the default.
- **The impression counter is simple** — shown + clicked, per ad. No dwell-time,
  no watch-time billing, no per-depth pricing tiers (the "different way"
  landing). Posts, shorts, and vids are all monetizable — the all-surface
  breadth is the win — but the counter doesn't need to *price* the depth
  difference, only count it.
- **The pitch is "a different way," not "better than YouTube"** — the organic,
  attached, low-fatigue ad surface is the product (the "new muscle" / "6th
  post" frame above), not a number to optimize against YouTube's RPM. The
  operator's verbatim: *"we dont need to be insecure about it"* + *"we just
  need to be unique, different, like a new work out working a new muscle."*
- **The ad experience should reward frequency** — the creator's optimal
  strategy is "cast more nets" (many small posts, not few deep videos). The
  `ad-creative-labor.md` need (the 30-ads photo labor) *is* the friction on
  casting more nets — solving it directly serves the breadth model. The
  earnings panel should show a **portfolio view** (all ads, projected total
  catch) so the creator sees the net's total, not one cast's. The bootcamp
  should teach frequency + breadth as the play.

## What web10 CAN build (the honest scope)

Given the wall, the buildable thing is a **per-ad economics panel** that
combines three inputs, two of which the creator supplies and one the platform
measures:

| Input | Source | Notes |
|-------|--------|-------|
| **Item cost** | creator-entered (or pulled from the link, see `external-link-embeds.md`) | the product price |
| **Commission rate** | creator-entered (a % or flat $) | the affiliate program's rate |
| **Impressions / views** | **platform-measured** (the new ad-impression counter) | the gate — not built yet |
| **Clicks** | platform-measurable (an outbound-link click on the ad) | a closer proxy to conversion than impressions |

From those, web10 can show:
- **Commission per conversion** = rate × item cost (a pure calc, no data needed
  — buildable *today*).
- **Projected earnings at X views** = X × (historical click-through rate) ×
  (historical conversion rate) × commission-per-conversion. The CTR +
  conversion rates come from the platform's own measured clicks/impressions
  (a creator's own historicals, not a guess) — **once impressions + clicks are
  counted.**
- **A calculator** (the operator's "not sure if we need a calculator") — a
  what-if slider: drag views/clicks, see projected earnings. This is a thin
  client-side calc over the measured rates; it's the *display* of ask #3, and
  it's only meaningful after the measurement exists.

**What it cannot show:** the *actual* payout (ask #1's literal "how much
commission each ad makes") — that's the affiliate program's number. web10 can
show the *modeled* earnings and the creator's *reported* earnings (if the
creator logs actuals), but not the ground-truth payout.

## The build order (lightweight measurement first)

> The "gate is first" framing below is the *minimum* — a simple shown + clicked
> counter. The "different way" landing (above) is explicit that this is **not**
> a YouTube-grade telemetry build. The bar is low: enough to answer "is this ad
> earning, roughly?" and feed the calculator.

1. **Ad-shown + ad-clicked measurement** (the lightweight gate). Count how many
   times an ad is rendered (shown) and how many times its link is clicked.
   Simple, D60-generic (an "ad was shown/clicked" event, not an "Amazon"
   concept). No dwell-time, no watch-time billing, no per-depth tiers (deferred
   — see the "different way" landing). Without this, asks #2 and #3 have no x.
2. **Per-ad economics fields** on the ad body (app-owned, D60): `item_cost`,
   `commission_rate` (creator-entered; `item_cost` could be auto-filled from
   the link via the `external-link-embeds.md` primitive) **+ a
   `recurring: boolean` / `period: 'month'` flag** on the rate (the SaaS
   toggle — the category-strategy call above).
3. **The economics panel** in the ad surface: commission-per-conversion (pure
   calc), **LTV-per-referral** for recurring ads (rate × months-stayed, the
   number that makes SaaS worth 100k views) vs one-time for physical, projected
   earnings at the ad's *measured* shown/clicked counts, and the what-if
   calculator (a slider over the measured click-through rate).

## Open questions (operator)

1. **Is the modeled number enough, or do you want actuals?** web10 can show
   *expected* earnings (rate × measured clicks × conversion). The *real* payout
   lives with the affiliate program. Do you want a "log actual earnings" field
   so you can record the program's number against the ad, or is the projection
   the point?
2. **Shown = what (kept deliberately simple)?** The "different way" landing
   (above) is explicit: **don't** build a dwell-time / watch-time / per-depth
   telemetry stack. The counter is a simple "ad was rendered" (shown) event —
   one count per render, no in-viewport-N-seconds logic, no depth tiers. The
   earlier "per-surface + per-depth" sketch is **deferred** (a follow-up if
   ever wanted, not the gate). The question that *does* remain is just: count a
   shown on every render, or dedupe per-reader-per-session (so one person
   scrolling past the same ad 5× counts once)? The latter is more honest and
   still cheap. That's the whole decision — not a telemetry architecture.
3. **Clicks.** Do we count an outbound click on the ad's link as the conversion
   proxy? (Most affiliate programs pay on click or on sale; click is the one
   web10 can measure.)
4. **Calculator scope.** A per-ad what-if (this ad, at X views) vs a portfolio
   view (all 30 ads, projected total)? The portfolio view is the "how much am
   I standing to make" at the catalog level.

## Files (when built)

- **Measurement (the gate):** an ad-impression + ad-click event — likely a
  reaction-style doc or a counter on the ad/post read path (the node already
  counts reads; an ad-shown event is the same shape). D60-generic.
- `marketing/web10-social/src/data/ads-catalog.ts` — `item_cost` +
  `commission_rate` on the ad body; the projection calc (pure function).
- `marketing/web10-social/src/components/Monetization/CreatorMonetization.tsx`
  — the per-ad economics panel + the what-if calculator.
- `external-link-embeds.md`'s link-card primitive — to auto-fill `item_cost`
  (and the image) from the offer link.
