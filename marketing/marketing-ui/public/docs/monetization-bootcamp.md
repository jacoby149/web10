# Monetization Bootcamp

**Who this is for:** you — a creator who has an audience on web10 and wants
to start earning from it. Today. No audience minimum, no waiting on a
platform to "unlock" you.

This is the ramp: from "I have followers" to "my first affiliate payout,"
step by step.

## The use case

On the paved platforms, your revenue is a black box — the platform's ad
manager owns the inventory, it decides when you "qualify," it takes a cut,
and it can demonetize you with a sentence.

You want the opposite: **your links, your payout, your terms, delivered to
100% of your followers by architecture.** That's the whole game here. web10
doesn't run an ad network and doesn't take a cut of your affiliate revenue.
It gives you a place to hold the link that pays (the **offer**), wrap it in
a piece of content (the **creative**), and pin it to a post so your
followers see it every time. The money flows from the affiliate program
straight to you.

Keep the two layers straight:

- **Your ads** — the offers *you* chose. An Amazon tag, a brand you DM'd,
  your own store. This bootcamp is about this layer.
- **Node ads** — the node operator's inventory, attached at a percentage.
  Not your money, not your decision. You don't manage it; it rides along.

## The one rule that makes everything else easy

On web10, an ad is **a post with a link that pays.** Not a service, not a
campaign, not a "sponsorship slot." It's a piece of content you made,
carrying:

- **The creative** — your text + media. A photo of the product, a video of
  you using it, a plain text post.
- **The offer** — the link that pays: the kind (`affiliate` / `direct` /
  `own_store`), the partner, the link, the CTA, the disclosure.
- **The status** — `active` or `paused`.

You build it in the **ad maker** (the Studio's Ads card in the
authenticator), then **pin** it to a post (in the social app's composer, or
right from the catalog). The post carries the ad; the ad keeps its own
identity, so pausing it stops it everywhere it's pinned.

The disclosure is not optional. The FTC line shows on every ad, always. Say
"I may earn a commission" — it's the law, and it's also the trust.

## The ramp: from zero to first payout

### Step 0 — Pick your lane before you sign up

Don't join everything. Pick the 1–2 programs that match what you actually
post about. A tech creator: Amazon (gear) + Semrush or Shopify (tools). A
lifestyle creator: Amazon + Target + eBay. A service creator: Fiverr +
HubSpot. The match between your content and the catalog is what makes the
link feel genuine instead of slathered on.

The shortlist, with sign-up links: [Affiliate
Programs](/docs/affiliate-programs).

### Step 1 — Sign up for the program(s)

Each program has its own signup. The common thread:

1. **You need a site to list** — your node's domain (`web10.app`,
   `social.web10.app`, or your custom domain). List the bare domains.
2. **You need to actually display the links** — Amazon's 180-day rule: no
   live tagged link within 180 days and the account closes. So the signup
   and the first ad are the same task — sign up, then make the first ad the
   same week.
3. **The tag is yours** — it goes in the offer's link, and it pays *you*,
   not the node.

> **The node account vs. your account.** If you also run the node, that's a
> *separate* account for the *node's* ads. Your creator account is for
> *your* ads. Two accounts can list the same domain — the programs key
> payment off the tag in the link. Don't funnel your creator revenue
> through the node's account; that makes the node the merchant of record
> for your sales, which is the payments-company problem the platform
> deliberately doesn't want.

### Step 2 — Make your first ad in the ad maker

In the authenticator's Studio → **Ads** → **New Ad**:

- **Copy** — the headline. "Everything I use, linked."
- **Offer kind** — `affiliate` (a program link), `direct` (a brand you cut
  a deal with), or `own_store` (your own merchandise or product).
- **Partner** — who it is (Amazon, Target, your brand).
- **Link** — the one that pays. For Amazon, the tagged URL. For a direct
  deal, the brand's link. For your store, the store URL.
- **CTA** — the button text. "Get it," "See my setup," "Shop the look."
- **Disclosure** — the FTC line. "I may earn a commission from links in
  this post." Always.
- **Status** — `active`.

Optionally attach **media** — a photo of the product, a clip of you using
it. The creative is the post itself; the media is the same upload as any
post.

### Step 3 — Pin it to a post

Two ways:

- **From the composer** (social app): make a post, tap **Attach ad**, pick
  the ad from your catalog. The post now carries it.
- **From the catalog** (Studio): open the ad, **Pin** it to one of your
  posts.

The post renders with the ad block under it — creative, offer, CTA, and the
disclosure. Your followers see it 100% of the time, because delivery is by
architecture, not by an algorithm deciding your post "performed well
enough."

### Step 4 — Organize as you grow

- **Albums** — group ads by campaign or season ("Summer 2026," "My setup").
  An ad can be in a few.
- **Pause / retire** — a deal ends? Pause it. It stops rendering on every
  post that carries it, but stays in your catalog. Done for good? Retire it.
- **Pin, don't rotate (for now)** — today you pin a specific ad to a
  specific post. The full curation engine (round-robin, greedy,
  frequency-capped) is a later model — don't plan around it.

The full surface — the catalog, the actions, the composer — is
[Ad Catalog](/docs/ad-catalog).

## Doing it genuinely (the part that isn't in the spec)

The mechanics are easy. The hard part is not becoming the person who slaps
a link on everything until nobody trusts them. A few principles that keep
the revenue *and* the audience:

- **Only link what you'd buy.** The disclosure makes it legal; taste makes
  it sustainable. If you wouldn't recommend it to a friend, the 10% isn't
  worth the trust you just spent.
- **The content is the ad.** A video of you actually using the thing, with
  the link, beats a text post that's just a link. The creative is why
  someone clicks.
- **Disclose like it's the headline, not the fine print.** "I may earn a
  commission" up top, in plain words. The platforms that hide it are the
  ones people leave.
- **Your audience is the asset.** The whole reason to be on web10 is that
  it's yours. A link that pays this month but burns the audience is a loss,
  not a win. The audience outlives any single affiliate program.

## What this is not

- **Not an ad network.** No bidding, no exchange, no third-party targeting.
  The only sponsors a follower sees are the ones *you* chose.
- **Not a payment processor.** web10 doesn't touch your affiliate money.
  You are the merchant of record for your own links. See
  [Payment Rails](/docs/payment-rails).
- **Not memberships or tips.** That's a different surface, a different
  model — later. This bootcamp is the *link* side: affiliate, direct deals,
  and your own store.

## The sequence, linked

1. [Ads](/docs/ads) — what an ad is (a post with a link that pays)
2. [Ad Catalog](/docs/ad-catalog) — where your ads live and how they pin
3. [Affiliate Programs](/docs/affiliate-programs) — which programs, how to
   sign up
4. [Payment Rails](/docs/payment-rails) — who gets paid, who takes a cut
5. *(you, here)* — the ramp, end to end
