# Focus — what we're actually building (the narrowing)

**Status: LIVING.** The `needs/` folder is the brainstorm (5 needs, one topic
each). The `gaps.md` is the holistic holes (9 gaps). This doc is the
**narrowing** — what makes the cut for the current focus, what's deferred, and
why.

> The operator's framing: *"this needs thing not all of it is going to make it
> into the product, so we are going to have this narrowing kind of a thing.
> really, i need to make some ads, i need to use this stuff more, and i will
> develop some really good opinions here."*
>
> The operator's narrowing (05.10.2026): *"i think the most valid things are
> getting that amazon storefront parity + just a little more ease of use as we
> use it, like putting in the commision of the products, the price of them, and
> maybe just a little projection that says 100k impressions ~ -> $30
> approximately."*

The narrowing principle: **what will I actually touch when making and running
ads?** The focus is the "use it more" path — the things that are friction *right
now*, at 30 ads. The operator will *use* the focused things and *develop
opinions* on them — the focus is narrow enough that hands-on use generates the
opinions that decide the next narrowing.

---

## IN the focus (the "use it more" path)

### 1. Amazon storefront parity (the anchor — "the most valid thing")

A **public, browsable catalog** of the creator's products/ads — the affiliate
version of a Linktree/Stan-store page, but specifically **Amazon storefront
parity**: the thing Amazon gives its top affiliates (a storefront that lists
their recommended products) but which "only works if you blow up." web10 gives
**every** creator one from day one.

**What it is:** a public surface (a route or a profile tab) that renders the
creator's ad catalog as a browsable grid — each tile = a product (photo + name
+ price + the offer CTA). The data is already there (the creator's `ad`-tagged
docs in their followers group); the storefront is a *read + render* of it,
organized by album (the built albums become the storefront's sections).

**Why it's the anchor:** it's the "here's everything I recommend" destination —
the *collection* of the net's catch. The creator casts ads across their posts
(the "fishing net"), and the storefront is where the audience goes to browse
the whole catalog. It's the most *visible* thing (a shareable, deep-linkable
page), and it's the thing that makes the 30 ads feel like a *store*, not a pile
of posts.

**The "parity" framing:** Amazon's storefront is gated (you need a big
following / a verified storefront). web10's is *not* gated — every creator gets
one. That's the parity *plus*: the same thing Amazon gives its top affiliates,
but for everyone.

### 2. Product fields on the ad (the "ease of use")

**"Just a little more ease of use as we use it, like putting in the commission
of the products, the price of them."**

The ad form gains a **"product section"** — the product attributes on the ad
(the operator's refinement: *"all ads objects are ads, and can have the same
attributes as products"*):
- **Item price** (the product's price)
- **Commission rate** (the % or flat $ the affiliate program pays)
- **Product pics** (the basic pics of the product, separate from the creative media)
- **The target** (what the ad advertises: a product / a collection / a
  storefront / nothing)

These are **fields on the ad** — not a separate product entity (the refinement
in `needs/product-entity.md` supersedes the old "separate Product doc" model).
The operator enters them when making the ad (the "product section" of the ad
form, filled in when the ad is a product, left blank when it's not). They're
the inputs for the projection (#3) and the "what is this ad worth" number.

**Why it's the focus:** it's the "ease of use" the operator named — the things
they need to *put in* when making an ad, so they can see what the ad is worth.
No new entity, no new surface, no new write path — the product attributes are a
*section* of the ad form. The simplicity constraint holds: *"we want this to be
simple for people, people actually making ads!"*

**What it IS (the refinement):** the ad is the **superset** — it has the
creative (text + media, "your cool text and media") *plus* the product
attributes (when it's a product). An ad can advertise a **single product** (it
*has* the product attributes), a **collection of products** (it points to an
album), a **collection of ads** (it points to an album of ads), a **storefront**
 (it points to the creator's catalog), or **nothing** (a pure ad, just text +
media, no product). The storefront is a **collection of ads** (an album) — no
separate product object. See `needs/product-entity.md` "The operator's
refinement: the ad is the superset" for the full model.

**The layering (media on top of the product):** the ad has **two layers of
media**, separate — the **product pics** (`product_pics`, the product's own
photos, the *base*) and the **creative media** (`media_refs`, the ad's own
video/carousel/lifestyle content, the *overlay*). The ad *layers the creative
on top of the product*: the product pics say "this is the thing," the creative
media says "here's why you want it." This is what makes the **listing ad**
(product-heavy, creative-thin, the inline format) and the **post ad**
(creative-heavy, product-anchored, the post format) both work from the same
object. *"The post ads the listing ads, it is nice and flexible"* — the same
object, two shapes, the layering is the flexibility. See
`needs/product-entity.md` "The layering: media on top of the product."

### 3. The little projection ("100k impressions ~ $30 approximately")

**"Maybe just a little projection that says 100k impressions ~ -> $30
approximately."**

A **static projection line** on the ad — a rough "if this ad gets 100k
impressions, you'll make about $X" number. The key word is **static**: it uses
**assumed** CTR + conversion rates (industry averages, or the operator's own
estimates), **not** measured rates. No impression measurement, no click
tracking, no live data.

**The math (the assumed rates):**
```
100k impressions
× assumed CTR (e.g. 1%)        = 1,000 clicks
× assumed conversion (e.g. 1%) = 10 sales
× commission per sale (price × rate) = $X
```

The operator sees "100k impressions ~ $30 approximately" — a rough number, good
enough to *prioritize* which ads to make and run. It's not a precise forecast;
it's a "this ad is worth more than that one" signal.

**Why it's the focus (and why it's *static*):** the operator named it — "maybe
just a little projection." The word "little" is the scope: it's a *rough*
number, not a precise one. The *live* projection (using *measured* impressions
+ clicks, the creator's own historicals) is the *next* narrowing — it needs the
shown + clicked measurement (the gate), which is deferred. The *static*
projection (assumed rates) is buildable *today*, no data needed, and it's
enough for the "do I care about this ad" decision.

**The open decision (the operator's call, after use):** what are the assumed
CTR + conversion rates? Industry averages? The operator's own estimates? A
per-category default (Amazon vs. SaaS vs. merch have different CTR/conversion
rates)? The operator will have an opinion after seeing the numbers.

### 4. Click analytics + the projection-vs-actual tell (the diagnostic)

**"i think analytics are a part of it too, like seeing the amount of clicks,
where the redirects are happening, we already have analytics cooking in the
plan. i.e. if we have our projection, and the analytics, the money could be
off, that will be a really good tell! feedback, hey analytics is projecting
$$$ but making $$, this isnt good, whats up......"**

Two things, one diagnostic:

**The lightweight click counter.** Count how many times the ad's link is
clicked (the redirect). This is the *lightweight* analytics — not a full
analytics suite, just "this ad's link was clicked N times." The operator:
*"we already have analytics cooking in the plan"* — the GA4/Hotjar telemetry
(D56) is already platform-wide; this is the *ad-specific* click count (the
outbound redirect on the ad's link), which is a small, D60-generic event
("an ad's link was clicked," not "an Amazon product was clicked").

**The projection-vs-actual tell.** The projection (#3) is a *hypothesis*
(assumed CTR × conversion → projected $). The click counter is the *reality*
(measured clicks → actual $, via the affiliate program's payout). The **gap
between them is the diagnostic**:

- **Projection says $30, actual is $30** → the assumed rates are right, the ad
  is performing as expected.
- **Projection says $30, actual is $3** → *"this isnt good, whats up"* — the
  assumed rates are wrong (the CTR or conversion is lower than assumed), the
  audience isn't converting, the product is a bad fit, or the ad creative is
  weak. The gap is the *feedback signal* that tells the creator what to fix.
- **Projection says $3, actual is $30** → the assumed rates were conservative,
  this ad is a winner, make more like it.

**Why it's the focus:** the operator named it — the projection *without* the
analytics is just a guess; the analytics *without* the projection is just a
number. Together, they're a **diagnostic**: "is this ad performing as expected,
and if not, what's wrong?" That's the "use it more" feedback loop — the
operator makes an ad, sees the projection, watches the clicks, and the gap
tells them whether to keep running it, change the creative, or drop it.

**The scope (lightweight, not a suite):**
- **In:** the click count per ad (the outbound redirect), the projection-vs-
  actual comparison (the tell), "where the redirects are happening" (the
  destination URL the click goes to — the affiliate link), **the actuals box**
  ("how much did this actually make?" — the operator enters the payout from
  their affiliate dashboard), and **the self-calibration** (the operator sets
  the click→purchase % themselves, from their own data).
- **Out:** the impression count (the *shown* measurement — still deferred; the
  projection's "100k impressions" is a *hypothetical* input, not a measured
  value), the full analytics suite (the GA4/Hotjar telemetry is D56, separate),
  and the per-click attribution (which post the click came from — the *next*
  narrowing). The revenue *tracking* (web10 automatically knowing the payout)
  is out — but the revenue *entry* (the operator logs the actual $) is in, via
  the actuals box.

**The "where the redirects are happening" detail:** the click counter records
the *destination* (the affiliate link the click goes to). This is the "where"
in "where the redirects are happening" — the operator can see *which* affiliate
link is getting clicked (Amazon? SaaS? merch?), which is the per-product
breakdown without a full product entity. The click is attributed to the ad's
`offer.link`, so the operator sees "this Amazon link got 50 clicks, this SaaS
link got 200 clicks" — the per-product signal, for free, from the click
counter.

**The self-calibration (the operator sets the click→purchase %):**

> "we know the clicks, we know the actual money coming in we can definitely
> set the percentage from clickthrough rate percentage to purchase ourselves!"

The operator has *both* halves of the equation that web10 can't see:
- **The clicks** — web10 measures them (the click counter, focus #4).
- **The actual money** — the operator knows them (their affiliate dashboard
  shows the payout).

So the operator can **calibrate the conversion rate themselves**: "I got 100
clicks and $20 in sales, so my click→purchase rate is 20% with an average
order of $1 — let me set that." The projection's assumed conversion rate
(#3) becomes the operator's *measured* conversion rate, calibrated from their
own data. The projection stops being a guess and starts being *theirs*.

**The actuals box ("how much did this actually make?"):**

> "if there is a box how much did this actually make?"

A field on the ad where the operator **logs the actual payout** from their
affiliate dashboard. This is the *actuals* half of the projection-vs-actual
tell:
- **Projection** (web10-computed, assumed/calibrated rates): "100k impressions
  ~ $30"
- **Clicks** (web10-measured): "this ad got 500 clicks"
- **Actuals** (operator-entered): "this ad actually made $22"
- **The tell:** projection $30, actuals $22 → close, the rates are about
  right. Projection $30, actuals $3 → *"this isnt good, whats up"* — the rates
  are wrong, the audience isn't converting, the product is a bad fit.

The actuals box is what makes the tell *real* — without it, the operator has to
mentally connect web10's clicks to their affiliate dashboard's payout. With it,
the comparison is *on the screen*: projection vs. clicks vs. actuals, side by
side.

**Why the operator-entered actuals (not web10-tracked):** web10 can't see the
affiliate payout (the payment happens off-platform, the affiliate program owns
it). But the operator *can* see it (their dashboard). So the actuals box is the
*human-in-the-loop* data source — the operator logs the number web10 can't
measure. This is the "simplified, no Stripe integration" principle (the
operator's earlier framing): web10 doesn't process the payment, the operator
just *tells* web10 what it made. Simple, no integration, and it's enough for
the tell.

**Why a box, not an integration (the "organic" trade-off):**

> "obviously would be nice if this was integrated, but this is some more
> organic shit, so maybe hard to legit integrate"

It *would* be nice if web10 automatically pulled the payout from the affiliate
program (Amazon, PartnerStack, etc.) — no box, no manual logging, the actuals
just *appear*. But that's **hard to legit integrate**:
- **No open payout APIs.** Amazon Associates doesn't have an API for "here's
  what you earned this month." PartnerStack has a dashboard, not a payout
  webhook. The affiliate programs are *closed* — they show you the number in
  their UI, but they don't give it to you programmatically.
- **A different integration per program.** Even if each program *did* have an
  API, it'd be a different one per program (Amazon's API ≠ PartnerStack's API
  ≠ the SaaS program's API). Building N integrations for N affiliate programs
  is the "overcomplicate" the operator flagged — it's a maintenance burden that
  scales with the number of programs, not the number of creators.
- **The "organic" nature of the data.** The payout is *organic* in the sense
  that it's a *human* number — the operator looks at their dashboard, sees the
  number, and *knows* it. It's not a machine-readable feed; it's a human
  reading a screen. The actuals box matches that: the operator reads the
  number, types it in. It's as organic as the data itself.

**The box is the right v1.** It's the *minimum* that makes the tell work
(projection vs. actuals, side by side). It's *enough* for the "do I care about
this ad" decision. And it's *honest* — it doesn't pretend web10 can see the
payout (it can't, not without N integrations). The integration is the *next*
narrowing, if/when a specific affiliate program (the one the operator uses
most) has an API worth building against. For now, the box is the organic,
simplified, no-integration answer — and it's the right one.

**The open decision (the operator's call, after use):** what does "where the
redirects are happening" mean exactly? The destination URL (the affiliate link)?
The source post (which post the click came from)? The time of day? The operator
will have an opinion after seeing the data.

---

## DEFERRED (not in the focus, with the reason)

| Need / Gap | Why deferred |
|------------|--------------|
| **The link-card primitive** (server-side URL → card metadata, auto-fills the product photo from the link) | The operator didn't name it in the narrowing. The creator manually adds photos for now ("not bad that you need to do your own photos" — the pain is accepted). The link card is the *next* ease-of-use step, after the storefront + product fields are in use. |
| **The impression (shown) counter** — counting how many times the ad is *rendered* (the "shown" measurement) | The click counter (focus #4) is in; the *impression* counter is out. The projection's "100k impressions" is a *hypothetical* input, not a measured value. The operator calibrates the conversion rate from clicks + actuals (focus #4), so the impression count isn't needed for the tell. The impression counter is the *next* narrowing, if the operator wants a per-impression rate. |
| **The what-if calculator + portfolio view** (the interactive projection tools) | The static projection line (focus #3) + the actuals box (focus #4) are enough for the "do I care about this ad" decision. The interactive calculator (drag a slider, see the projected $) and the portfolio view (all 30 ads, projected total) are the *next* narrowing, after the operator uses the basic tools. |
| **Need 4 (catalog scale — versions, round-robin)** | Scale stuff. The storefront (focus #1) is the *browsable catalog*; versions + round-robin are the *rotation* machinery, which is the *next* scale step. The operator has 30 ads, not 20 products × 3 versions. |
| **Need 5 (separate product entity — Option C)** — a stable "product" doc separate from the ad | **Resolved by the refinement** (05.10.2026): the operator refined the model to "the ad is the superset" — no separate product entity. The product attributes (price, commission, pics) live *on the ad* (focus #2), and the ad can advertise a product / a collection / a storefront / nothing (the `target` field). The storefront is a *collection of ads* (an album), not a collection of products. A separate product entity is rejected — see `needs/product-entity.md` "The operator's refinement: the ad is the superset." |
| **Need 2 (external-link-embeds)** — the product card for a pasted affiliate link in a post | The storefront (focus #1) is the *catalog* surface; the in-post product card is the *inline* surface. The operator named the storefront, not the in-post card. The in-post card is the *next* visual step, after the storefront is in use. |
| **Gap 1 (fan migration)** | The sales-side concern. The operator: *"were getting there, just getting things great first though."* Deferred. |
| **Gap 2 (ads revenue certainty)** | Positioning, not a build. The falsification is the business plan's §6e. |
| **Gap 3 (record label)** | A reframe of the customer model, not a build. Captured in the business plan when settled. |
| **Gap 4 (301-redirect export)** | The ownership story made real, but it's the *join* side, not the *stay*. Deferred. |
| **Gap 5 (federation)** | "We are close" but it's the *join* side. Deferred. |
| **Gap 6 (better-than-life story)** | The *sequencing* question. The focus IS the answer: lead with the *stay* (the ads, the thing that's built), let the *join* (the ownership story) catch up. |
| **Gap 7 (no algorithm)** | Dissolved — the algorithm is user-tuned (the knobs). No build. |
| **Gap 8 (why pay for hosted)** | Closed — the hosted tier is the media company tier. No build. |
| **Gap 9 (marketing out of sync)** | The Join-page dead link is *live* (a bug, fix it), but the marketing refresh is a separate work order, not part of the ads focus. |

---

## Design principles (cross-cutting, apply to all the builds)

**1. Post-ad feature parity (the post ad is indistinguishable from a post):**

> "also i think the posts came a long way, important the post ads are in sync
> with the posts, have feature parity with the posts i.e. they look kind of
> indestinguishable"

The post ad format has **full feature parity** with a regular post — it should
be *indistinguishable* from a post except for the ad disclosure (the
"Ad"/"Sponsored" badge + the offer CTA + the disclosure line). The post ad is a
`posts` doc (the D55 model), so it has media, title + caption (D82), comments,
likes/dislikes/reposts, and the post chrome for free. The *only* differences
are the ad dressing — a *label*, not a *different rendering*. The test: "would
a user tell the difference by *looking* (not by the disclosure)?" If yes, the
post ad failed. **The constraint:** as posts gain features, post ads gain them
too (feature parity, not feature lag). The post ad is a post; when posts
evolve, post ads evolve with them. This is the "ads people like to look at"
emotional core (`ad-earnings.md`) applied to the rendering: the ad is *content*
(a post), not an *interruption* (a different kind of card). Full section:
`needs/product-entity.md` "The feature-parity principle."

---

## The focus, stated plainly

**Five builds:**
1. **Amazon storefront parity** (the public catalog of the creator's
   products/ads) — the anchor, "the most valid thing." The "here's everything I
   recommend" destination. The storefront is a *collection of ads* (an album),
   not a collection of a separate product entity.
2. **Product fields on the ad** (the "product section": item price, commission
   rate, product pics, the target) — "just a little more ease of use as we use
   it." The ad is the superset — it has the creative (text + media) *plus* the
   product attributes (when it's a product). No separate product entity.
3. **The little projection** ("100k impressions ~ $30 approximately") — a
   *static* projection using assumed rates, no live measurement. A rough "this
   ad is worth more than that one" signal.
4. **Click analytics + the projection-vs-actual tell** (the diagnostic) — the
   click counter (the outbound redirect), the **actuals box** ("how much did
   this actually make?" — the operator logs the payout from their affiliate
   dashboard), and the **self-calibration** (the operator sets the click→
   purchase % themselves, from their own clicks + actuals). The projection is
   the hypothesis, the clicks + actuals are the reality, and the gap is the
   feedback: *"hey analytics is projecting $$$ but making $$, this isnt good,
   whats up."*
5. **The Monetization tab restructure** (Ads | Products | Analytics, all in one
   place) — the IA decision that *contains* builds 1–4. The Monetization tab
   (currently My Ads | Node Ads) gains a **Products** section (the catalog of
   the ad's product attributes — the storefront's data) and an **Analytics**
   section (the clicks + the projection-vs-actual tell + the actuals box). The
   operator's framing: *"we have people groups discover following, we could do
   ads products separation real nicely! and analytics! all in one place!
   analytics, ads, products, all one screen is that a good idea? all in
   monetization tab?"* — **yes**, with a structure (see below).

**The operator uses them, develops opinions, and the next narrowing happens.**
The link-card primitive (auto-fill the photo from the link), the impression
(shown) counter, the interactive calculator + portfolio view, the catalog scale
(versions, round-robin), and the in-post product card are all *next*, not
*now*. The focus is narrow enough that hands-on use generates the opinions that
decide what's next.

---

## Build 5 — The Monetization tab restructure (Ads | Products | Analytics)

**The question (verbatim):**

> "also fit well, we have people groups discover following, we could do ads
> products separation real nicely! and analytics! all in one place! analytics,
> ads, products, all one screen is that a good idea? all in monetization tab?"

**The answer: yes, with a structure.** All-in-one-screen is the right call for
the *stay* — the operator (the record label, the media company) needs to see
the whole monetization picture in one place: the ads (what's running), the
products (what they're selling), and the analytics (how it's performing).
Scattering those across three surfaces would force the operator to context-
switch, and the *tell* (projection vs. actuals, build #4) only works when the
projection (on the ad) and the actuals (in analytics) are *close together*.

**But "all one screen" ≠ "one flat list."** The Monetization tab already has a
tab-row idiom (My Ads | Node Ads, from 3.217.0 — the URL holds the section,
`?tab=`, deep-linkable, the X/Threads idiom the Posts screen's Discover |
Following row established). The restructure *extends* that idiom: the
**creator** Monetization tab becomes **Ads | Products | Analytics** (three
sections, the tab row, `?tab=` deep-linkable, the same idiom). The **Node Ads**
tab (admin-only) stays separate (it's the node operator's inventory, a
different role — the record label's *node* ads vs. the *creator's* ads).

**The three sections (what each shows):**

| Section | What it is | The build it surfaces |
|---------|-----------|----------------------|
| **Ads** | The ad catalog (the existing My Ads) — the ads that are running, the format (inline/post), the pin, the status. The "what's running" view. | The existing surface (3.217.0), unchanged. |
| **Products** | The catalog of the ad's **product attributes** (the "product section" of the ads — item price, commission, pics, the affiliate link). The **storefront's data** (build #1) — the "what I'm selling" view. An ad that has product attributes shows here; an ad that's a pure ad (no product) doesn't. The storefront (build #1) is the *public* face of this; the Products section is the *private* management face. | Build #1 (storefront parity) + build #2 (product fields on the ad). |
| **Analytics** | The **clicks** per ad (build #4), the **projection-vs-actual tell** (projection $30 vs. actuals $22, side by side), the **actuals box** ("how much did this actually make?"), and the **self-calibration** (the operator sets the click→purchase %). The "how it's performing" view. | Build #3 (the projection) + build #4 (the tell). |

**Why "all in one place" works (the operator's reasoning):**
- **"We have people groups discover following"** — the app already has the
  *tab-row idiom* (the Discover | Following tabs, the My Ads | Node Ads tabs).
  The Monetization tab restructure is the *same idiom* applied to the
  monetization surface. It's not a new pattern; it's the existing pattern,
  extended.
- **"We could do ads products separation real nicely"** — the product
  attributes (build #2) are a *section* of the ad, but they're also a *view*
  (the Products section). The same data, two lenses: the ad form (the
  "product section" — the *write* view) and the Products tab (the *catalog*
  view). The separation is clean because the data is on the ad (the superset),
  not on a separate entity.
- **"Analytics, ads, products, all one screen"** — the *tell* (build #4) needs
  the projection (on the ad) and the actuals (in analytics) to be *close*.
  Putting them in the same tab (the Analytics section, next to the Ads section)
  makes the tell *visible* — the operator sees the projection and the actuals
  side by side, not on two different surfaces.

**The structure (the IA, stated plainly):**
- **The Monetization tab** (the creator's surface) = **Ads | Products |
  Analytics** (three sections, the tab row, `?tab=` deep-linkable).
  - **Ads** (`?tab=` default) — the ad catalog (the existing My Ads).
  - **Products** (`?tab=products`) — the product catalog (the storefront's
    data; the ads that have product attributes).
  - **Analytics** (`?tab=analytics`) — the clicks + the tell + the actuals box
    + the self-calibration.
- **The Node Ads tab** (`?tab=node`, admin-only) — the node operator's
  inventory (unchanged, separate role).
- **The storefront** (build #1) — the *public* face of the Products section (a
  separate route, the shareable catalog). The Products section is the *private*
  management face; the storefront is the *public* browsing face. Same data, two
  surfaces.

**The "is it a good idea?" answer, stated plainly:** yes — all-in-one-screen is
right for the *stay* (the operator sees the whole monetization picture: what's
running, what they're selling, how it's performing). The *structure* is the
existing tab-row idiom (Ads | Products | Analytics), not a flat list. The *tell*
(build #4) works *because* the projection and the actuals are in the same tab.
The storefront (build #1) is the *public* face of the Products section. The
Node Ads tab stays separate (a different role).
