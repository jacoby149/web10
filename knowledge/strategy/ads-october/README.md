# Ads — October conversation (operator pass, 05.10.2026)

**Status: OPEN.** The operator is in the middle of making the **ad experience
solid** — they just made 30 ads in one sitting (the 3.217.0 "one tab, personal
OR node ad" surface) and the friction surfaced at scale. This folder captures
that conversation. The `needs/` subfolder holds the five distinct needs that
came out of it, one topic per doc. **The operator's framing: "this is all
brainstorming, i think it is productive, to bring up a lot of needs, even if we
dont address them all."** The needs are captured for the record and to inform
the build order — not all of them will be built, and the speculative ones
(#5, the product entity) are captured to *evaluate* against the simplicity
constraint, not to commit. The conversation also produced a **strategic
landing** (the "different than YouTube" / "new muscle" / "6th post" frame) that
replaces the earlier "beat YouTube" competitive framing — see the overlaps
section below.

> The ad model is sound and mostly built (D55/D57/D75 — an ad is a `posts` doc
> tagged `ad` / `ad`+`node_ad`, two formats inline/post, albums, pin-to-post,
> the `ad-improvements.md` work order is largely merged). What's missing at
> **scale** is the *labor* of making many ads, and the *visual* of links that
> pay. Neither is a new protocol — both are app-owned surface work (D60).

## The needs

1. **`needs/ad-creative-labor.md`** — "not bad that you need to do your own
   photos, but definitely laborious if you have like 30 ads." The ad form
   takes one manually-attached creative per ad; 30 ads × 30 manual photos is
   the pain.
2. **`needs/external-link-embeds.md`** — "do the affiliate links have good
   embed photos? … where the link has a photo?" An Amazon affiliate link in a
   post renders as a bare favicon chip, not a product card.
3. **`needs/ad-earnings.md`** — "need to know how much commission each ad
   makes … the cost of the item … how much i stand to make with x amount of
   views." The per-ad economics: commission, item cost, and a projection.
4. **`needs/ad-catalog-scale.md`** — "you have 20 affiliate links, to 20
   products, maybe you want a few ad versions of each … put those ads into
   collections … a storefront here … pin round robin style ads, a collection of
   ads rotate on that post." The *catalog* problem at scale: versions (multiple
   angles per product), the storefront (a public surface for the creator's
   catalog), and round-robin pinning (pin a collection, the read rotates).
5. **`needs/product-entity.md`** — "maybe it makes sense to have products and
   then ads, where the products you put the affiliate links, photos … the
   commission … you can make an ad off of a product … easier to do ad
   variations. at the same time dont want to overcomplicate." A *data-model*
   idea (the most speculative of the five): a "product" entity as the stable
   thing an ad is *about* (link + photo + commission + cost), with the ad as
   the variable thing (the angle). The operator's constraint: **"we want this
   to be simple for people, people actually making ads!"** The recommendation:
   **Option B** (the product is an *implicit* grouping by `offer.link`, not a
   new entity) for v1; **Option C** (an explicit product doc) for v2, when the
   catalog is big enough. The simplicity rule: the product should be a
   *consequence* of making ads, not a *prerequisite*.

## The overlaps (the load-bearing observations)

**Needs 1 + 2 share one primitive.** Both point at *pull a product photo from
an affiliate/product link.* If the system can fetch the linked page's image
once, it solves **both** — the ad's creative auto-fills from the offer link
(labor gone), and a pasted affiliate link in a post renders a product card
(embed gone). That primitive is the real build; the two needs are its two
consumers. See `external-link-embeds.md` for why it's a server-side surface
(D60) and why Amazon in particular blocks naive scraping.

**Need 3 is gated on measurement that doesn't exist yet — but the bar is low.**
The projection ("x amount of views") has no x — the platform does not count ad
showns or clicks today. And the *actual* commission lives with the affiliate
program, not web10's rails. So need 3 is really: build a **lightweight**
ad-shown/ad-clicked counter (first), then a per-ad economics panel + what-if
calculator over the measured rates. The "different way" landing (below) is
explicit that this is **not** a YouTube-grade telemetry build — a simple shown +
clicked counter is enough. See `ad-earnings.md` for the wall, the honest scope,
and the landing.

**The economic rationale is in `ad-earnings.md` — and it lands on "different
than YouTube," not "beat YouTube."** The operator's "holy shit" moments (the
YouTube RPM comparison, the 70% SaaS commissions) were stepping stones. The
reframe that survives: web10 has **two** monetization models — **affiliate ads**
(the *conversion* model, pays on the sale) and **node ads** (the *impression*
model, pays on the view). The category call: push **digital/recurring** (SaaS,
180x–360x Amazon per conversion), not physical products. But the *competitive*
frame ("beat YouTube on RPM") is **dropped** — see the landing below. This is
the economic rationale that should exist before anyone scopes the measurement
build or the form changes.

**The "different kind of impression" refinement.** The operator pushed back on
the competitive framing: it's not "web10's impression is better than YouTube's"
— *it's a different kind, and we don't need to be insecure about it.* YouTube's
$2–10/1k is specifically the **mid-roll video** impression (a *deep* one — the
viewer brainrotted on the video long enough that a 30s interruption is
tolerable). web10's is **shallower but broader**: the viewer clicked into a
video/post/short, got the impression, scrolled into the ad — *without* having
brainrotted first. Worth less per 1k, but the monetizable surface is **all the
media** (posts + shorts + vids, not video-only) and the 100%-delivery
architecture means higher *volume*. Full section: `ad-earnings.md` "Refinement —
it's a different kind of impression, not a worse one."

**The "fishing net" — the creator-behavior implication.** The breadth model
*changes the creator's optimal strategy*. On YouTube the rational move is few,
long, high-retention videos (the deep mid-roll is where the money is). On web10
it's **many, small, frequent** pieces — posts, shorts, quick clips — because
*every one* is monetizable surface. *"this is almost like casting a fishing
net."* Each post/short/vid is a cast; more casts = more catches. The 100%-
delivery architecture is what makes the net *actually* cast (every post reaches
the whole audience, no algorithm gate). Implication: the ad experience should
**reward frequency** — the `ad-creative-labor.md` need *is* the friction on
casting more nets, the earnings panel should show a **portfolio view** (the
net's total catch), and the bootcamp should teach frequency + breadth as the
play. Full section: `ad-earnings.md` "The creator-behavior implication — the
'fishing net'."

**The landing — "different than YouTube, not better than YouTube."** The
operator's correction to the over-build: *"we dont need to beat youtube, we need
to do different than youtube, we have a more organic ad surface, we dont need to
hyper log impression shit, this is just a different way."* Three things: (1)
**"different than," not "better than"** — the organic ad surface (the ad
attached to a post the creator made, seen by an owned audience) is the *point*,
not a compromise against YouTube's mid-roll. (2) **"we don't need to hyper-log
impression shit"** — the per-surface + per-depth / dwell-time / watch-time
telemetry sketched earlier is **deferred**; the measurement that matters is
**lightweight** (shown + clicked), enough to answer "is this ad earning,
roughly?" — not a YouTube-grade RPM-pricing stack. (3) **"a more organic ad
surface" is the thesis in one phrase** — the ad is *content*, not an
interruption. Full section: `ad-earnings.md` "The landing — 'different than
YouTube, not better than YouTube'."

**The final frame — "a new muscle" + the "6th platform."** The strategic
position the conversation lands on: *"we just need to be unique, different, like
a new work out working a new muscle. if an influencer is hitting 5 platforms
with the same video, why not web10 the 6th post? hit the audience in a
different way, the ad experience is just different, wont fatigue, and also they
get to keep their audience."* Two metaphors: (1) **"a new muscle"** — web10
doesn't compete with YouTube for the same muscle (deep video retention); it's a
*new* muscle an influencer trains alongside the other five (additive, not
competitive). (2) **"the 6th post"** — the distribution argument: an influencer
already cross-posts to 5 platforms; the marginal cost of a **6th** post is near
zero, and that 6th audience is **owned** (no algorithm, no shadow-ban, 100%
delivery) with a **different, low-fatigue** ad experience. The pitch is not
"beat YouTube" — it's **"one more place to post, to an audience you keep, with
an ad experience that doesn't fatigue them."** Implication: the onboarding /
bootcamp pitch is "the 6th post"; the ad *experience* (organic, attached, low-
fatigue) is the differentiator, not the RPM; the measurement stays lightweight
because the value is the experience, not the telemetry. Full section:
`ad-earnings.md` "The final frame — 'a new muscle' + the '6th platform'."

**The third tier — own merch (the highest margin, the most organic).** The
operator's addition: *"people can push their own merch in an ad on here, then
they absolutely get more commission, if they do a printful store, etc."* This
is a **third tier** in the commission hierarchy, and it ties the conversation
together: **own merch** (highest per-unit margin — the creator keeps 100% of
the product margin, no affiliate cut; *most* organic — the creator's own thing,
the "recommendation, not interruption" position in its purest form) > **SaaS /
digital recurring** (highest LTV per referral, recurring) > **Amazon affiliate**
(lowest margin, someone else's product, the easiest to start). The `kind` field
already has `own_store` (the merch tier) — it should be *first* in the form's
mental model, not last. The earnings panel shows the right number per tier:
**margin per unit** (merch), **LTV per referral** (SaaS), **commission per
sale** (Amazon). The Printful / Printify angle: print-on-demand means no
inventory, no upfront capital — the marginal cost of "making a merch line" is
near zero (a design + a Printful account), so the "6th post" argument extends to
merch: the creator already has the audience, the marginal cost of *selling to
them* is near zero. The net catches merch too. Full section: `ad-earnings.md`
"The third tier — own merch (the highest margin, the most organic)."

**The emotional core — "ads people like to look at."** The operator's final
emotional landing, the *why* behind the whole "different way" frame — why
people will actually *tolerate* web10's ads when they hate everyone else's:
*"we have a platform with ads people like to look at, ads that arent cringe,
duh, people have to make money, not eww this fucking zuckerberg guy is getting
in the middle ads."* The user-side of the argument: on YouTube/Facebook/TikTok
the ad is an **interruption** (the user's response: *"eww zuckerberg is getting
in the middle"*); on web10 the ad is **content** — a recommendation from a
creator the user chose to follow (the user's response: *"oh, they recommend
this, cool"*). Same economic function, completely different emotional
experience. YouTube's $2–10/1k is "crazy" because it's extracted from a user
who *hates* the interruption; web10's lower number is *earned* by a user who
*welcomes* the ad (lower fatigue → stays longer → net casts more; higher trust
→ converts better). The trade is explicit and honest: **less per impression, but
the user stays, trusts, and converts.** Implication: the *user-facing* pitch is
"ads that aren't cringe" (not "we pay creators more"); the ad design must
preserve the "recommendation, not interruption" feel (no pre-rolls / mid-rolls /
banners — that would turn the recommendation back into an interruption);
"people have to make money" is the moral frame for the creator pitch (the ad is
the creator's *choice* to recommend, not the platform's *extraction* from the
user). Full section: `ad-earnings.md` "The emotional core — 'ads people like to
look at'."

**Need 4 is the *organizing* side of the same "run 30 ads" problem.** Need 1
(`ad-creative-labor.md`) is the *making* side (the 30-ads photo labor); need 4
(`ad-catalog-scale.md`) is the *organizing + disseminating* side — versions
(multiple angles per product), the storefront (a public surface for the
creator's catalog), and round-robin pinning (pin a collection, the read
rotates). The **albums** (already built, Apple-Photos-style) are the spine all
three hang off: versions group by offer, the storefront organizes by album, and
round-robin pins an album. The round-robin resolution is the node-ad hash
(`(doc_id, reader)`) — a proven, D60-generic mechanism, so each fan sees a
*different* product from the collection, consistently. Full section:
`ad-catalog-scale.md`.

## The gaps (the holistic holes, the operator's takes)

**`gaps.md`** — the eight biggest holes in the business plan / manifesto /
thesis, identified in the holistic pass, **plus the operator's take on each**
(which reframes, closes, or defers them). The operator's framing: *"were
getting there, just getting things great first though"* — the ads experience
(this folder) is the current focus; the gaps are the *next* concerns.

**The eight gaps, and what the operator's takes did to them:**

1. **Fan migration** (the cold-start mechanism) — the operator: *"this is
   almost separate, this is sales side, the web10 importer different concern
   from the ads part."* **Deferred** — the sales-side concern, "getting things
   great first."
2. **The "ads platform" revenue certainty** — the operator: *"lets just get in
   on that shit … mastodon style shit with ads hasnt been done before + this is
   the new internet protocol, totally generic backend."* **Reframed** — the
   "ads platform" is *positioning* (mastodon-style + ads = novel), not a
   revenue guarantee.
3. **The operator's ad-sales capability** — the operator: *"the node operator is
   almost like a record label, they are curating the celebrities for their node
   thematically … they are a mastermind a big picture killer."* **Reframed** —
   the operator is a *strategist* (a record label), not a passive host. Changes
   the customer model.
4. **Export/portability** — the operator: *"export your audience will have to
   be something that looks like a 301 permanent redirect … each node should
   have a migrations table … the nodes could just do it automatically."*
   **Made concrete** — the 301-redirect + migrations table + one-big-sweep
   mechanism. The ownership story made real.
5. **Federation** (the network effect) — the operator: *"we are close, we could
   in the ui have i round robin the discovers of multiple nodes, feed is
   straight up vert doable."* **Closed as a blank** — federation is *close*
   (round-robin the discovers, vertical feed), not a blank.
6. **The ownership story** ("are we telling a better-than-life story?") — the
   operator: *"maybe this own your own node is a big big sell. this version
   makes the internet down a level from this zuckerberg mafia … are we telling
   a better than life story here."* **The honest question** — the ownership
   story is the *big sell* (the anti-Zuckerberg pitch), but it's also the thing
   most likely to be a "better-than-life story" if pitched *before* the export
   + federation ship. The *sequencing* question: lead with the ownership story
   (the risk) or lead with the stay (the thing that's built)?
7. **"No algorithm" vs. content quality** — the operator: *"you make your own
   algo! the feed lets you tune your knobs how you want, it is cool i actually
   use it."* **Dissolved** — the algorithm is *user-tuned* (the knobs), not
   *platform-tuned* (the shadow ban). "You make your own algo."
8. **"Why pay for hosted when self-hosting is free?"** — the operator: *"you
   can make money on the node ads on EVERYONES content, set a node ad
   percentage of 10%, you make money on 10% of all content on the whole node!"*
   **Closed** — the hosted tier is the *media company* tier (node ads on
   everyone's content at 10%), the self-hosted tier is the *solo creator* tier.
9. **The marketing pages are out of sync with the strategy** — the marketing
   tells the *join* story (ownership) but not the *stay* story (monetization).
   **Live breakage (verified in `marketing-ui/src/pages/`):** (a) **Join page
   step 3 is a dead link** — points to `auth.web10.app?mode=studio` ("Open the
   Studio"), but the Studio was **removed in 3.99.0** (D75, monetization moved
   to the social app's `/monetize`); zero "studio" refs left in the
   authenticator `ui/`. A new creator following the onboarding steps hits a
   dead end at step 3. (b) **Home page has no monetization story** — all
   "Your audience. 100% delivery." (the join), no "you make money here" (the
   stay). (c) **Everything page promises a marketplace** (M3, not shipped —
   the "better-than-life story" risk from gap 6). (d) **Freedom page is
   aligned** (the ownership story, told well). The fix: update the marketing to
   tell *both* the join and the stay; fix the dead link first (it's breaking
   the onboarding flow).

**The gaps that remain genuinely open:** #1 (fan migration, deferred), #2 (ads
platform revenue certainty, the positioning), #6 (the "better-than-life story"
sequencing question), #9 (marketing out of sync — the Join page dead link is
*live*). The rest are reframed, closed, or made concrete by the operator's
takes. Full doc: `gaps.md`.

## Not a duplicate of `ad-improvements.md`

`knowledge/strategy/ad-improvements.md` (20.09.2026) is the **model** work
order — edit, formats, media attach, pin-from-edit, node-ad bugs. That's
largely merged (3.134.0, 3.159.0, 3.217.0). This folder is the **scale** pass
that came after: the model exists, now make it *fast to run many of* and make
the *links inside them* look good.
