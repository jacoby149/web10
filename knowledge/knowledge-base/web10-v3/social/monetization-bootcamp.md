# The Monetization Bootcamp

A working guide for a creator who has an audience on web10 and wants to
start earning from it — today, with no audience minimum, no waiting on a
platform to "unlock" them. This is the ramp: which affiliate programs are
worth joining, how to get into each one, and how the web10 ad maker turns
a link you already have into a post that pays.

It is derived from the ad model in [`ads.md`](./ads.md) (what an ad is) and
[`ads-catalog.md`](./ads-catalog.md) (the two surfaces you touch). If this
guide and those docs disagree, the docs win.

## The Use Case

You are a creator. You have people who follow you. On the paved platforms
your revenue is a black box — the platform's ad manager owns the inventory,
it decides when you "qualify," it takes a cut, and it can demonetize you
with a sentence. You want the opposite: your links, your payout, your
terms, delivered to 100% of your followers by architecture.

That is the whole game here. web10 does not run an ad network and does not
take a cut of your affiliate revenue. It gives you a place to hold the link
that pays (the **offer**), wrap it in a piece of content (the **creative**),
and pin it to a post so your followers see it every time. The money flows
from the affiliate program straight to you. web10 is the delivery, not the
merchant of record.

Two layers, keep them straight (the full split is in `ads.md`):

- **Your ads** — the offers *you* chose. An Amazon tag, a brand you DM'd,
  your own store. This bootcamp is about this layer.
- **Node ads** — the node operator's inventory, attached at a percentage.
  Not your money, not your decision. You don't manage it; it rides along.

## The One Rule That Makes Everything Else Easy

On web10, an ad is **a post with a link that pays**. Not a service, not a
campaign, not a "sponsorship slot." It is a `posts` document tagged `ad`,
carrying:

- the **creative** — your text + media (a photo of the product, a video of
  you using it, a plain text post). The media rides the same pipeline as any
  post's video.
- the **offer** — the leaf-typed link that pays: `kind`
  (`affiliate` | `direct` | `own_store`), `partner`, `link`, `cta`,
  `disclosure`.
- the **status** — `active` | `paused`.

You build it in the **ad maker** (the Studio's Ads card in the
authenticator), then **pin** it to a post (in the social app's composer, or
right from the catalog). The post carries the ad; the ad keeps its own
identity, so pausing it stops it everywhere it's pinned.

The disclosure is not optional. The FTC line shows on every ad, always.
That is a review rejection if it's hidden. Say "I may earn a commission" —
it's the law, and it's also the trust.

## The Programs Worth Joining

The table below is the starting shortlist — the programs with real
catalogs, real payouts, and a low enough bar that a mid-tier creator can
get in and earn in the first month. Commission rates and cookie windows
shift; treat the numbers as a map, not a contract, and confirm on the
program's own page before you pitch a brand off them.

| Program | Niche | Commission | Why it's worth it |
|---|---|---|---|
| **Amazon Associates** | Universal e-commerce | 1–10% per sale | The catalog is everything. Lowest bar to start; the tag is the whole setup. |
| **Walmart Creator** | Retail, grocery, electronics | Up to 4% | Physical-retail trust, strong conversion on everyday items. |
| **Target Partners** | Lifestyle, apparel, home | Up to 8% | 7-day cookie (vs Amazon's 24h) — more credit for the click. |
| **eBay Partner Network** | Used, vintage, refurbished | 1–4% | Inventory you can't buy elsewhere; great for a "finds" niche. |
| **TikTok Shop Affiliate** | Viral, social-first products | 10–30%+ (volatile) | Native in-app checkout; the highest ceiling, the least stable. |
| **Shopify Affiliate** | E-commerce software, business tools | Up to 200% of monthly plan | High-value flat payouts for business/creator-economy traffic. |
| **Fiverr Affiliates** | Freelance, digital services | $15–$150 CPA | Dozens of service categories; fits a "how I run my business" angle. |
| **Semrush Affiliate** | SEO, marketing, SaaS | $200/sale + $10/trial | 120-day cookie; high-intent digital traffic converts. |
| **HubSpot Affiliate** | B2B software, CRM | 30% recurring for 1 year | Sticky software = predictable recurring payouts. |

A note on the shape of these: they are all the **same primitive** on web10.
An Amazon tag, a Semrush link, your own merch store — each is just an
`offer` with a different `kind`. The ad maker doesn't care which program
the link came from; it stores the link and delivers it. That's the point of
the object being "locked in what it is."

## The Ramp: From Zero to First Payout

### Step 0 — Pick your lane before you sign up

Don't join everything. Pick the 1–2 programs that match what you actually
post about. A tech creator: Amazon (gear) + Semrush or Shopify (tools). A
lifestyle creator: Amazon + Target + eBay. A service creator: Fiverr +
HubSpot. The match between your content and the catalog is what makes the
link feel genuine instead of slathered on.

### Step 1 — Sign up for the program(s)

Each program has its own signup. The common thread:

1. **You need a site or app to list.** This is the part that trips people
   up. Amazon Associates, in particular, asks for the "top-level websites
   and/or mobile apps where you'll display links." On web10, that's your
   node's domain — `web10.app`, `social.web10.app`, or your custom domain if
   you have one. You do **not** need to enumerate every path or subdomain;
   the registered domain family is the property. List the bare domains.
2. **You need to actually display the links.** Amazon's 180-day rule: if
   your listed site doesn't show a live, tagged link within 180 days, the
   account closes. So the signup and the first ad are the same task — sign
   up, then make the first ad in the ad maker the same week.
3. **The tag is yours.** Your Associates tag (e.g. `mysite-20`) is the
   credential. It goes in the offer's `link` (Amazon) or is the link itself
   (most other programs). It pays *you*, not the node. Keep it private-ish;
   it's your revenue identity.

> **The node account vs. your account.** If you are also the node operator
> (running web10.app's inventory), that's a *separate* Associates account
> for the *node's* ads. Your creator account is for *your* ads. Two
> accounts can list the same domain — Amazon keys payment off the tag in
> the link, not off which account listed the site. Don't funnel your
> creator revenue through the node's account; that makes web10 the merchant
> of record for your sales, which is the payments-company problem we
> deliberately don't want.

### Step 2 — Make your first ad in the ad maker

In the authenticator's Studio → **Ads** → **New Ad**:

- **Copy** — the headline. "Everything I use, linked."
- **Offer kind** — `affiliate` (a program link), `direct` (a brand you
  cut a deal with), or `own_store` (your own merchandise / digital product).
- **Partner** — who it is (Amazon, Target, your brand).
- **Link** — the one that pays. For Amazon, the tagged URL
  (`https://amzn.to/abc?tag=you-20`). For a direct deal, the brand's link.
  For your store, the store URL.
- **CTA** — the button text. "Get it," "See my setup," "Shop the look."
- **Disclosure** — the FTC line. "I may earn a commission from links in
  this post." Always.
- **Status** — `active`.

Optionally attach **media** — a photo of the product, a clip of you using
it. The creative is the post itself; the media is the same upload as any
post. (If the ad maker doesn't let you attach media yet, that's a known gap
— the spec says the creative carries `media_refs`; file it, don't work
around it by pasting a raw URL in the copy.)

### Step 3 — Pin it to a post

Two ways:

- **From the composer** (social app): make a post, tap **Attach ad**, pick
  the ad from your catalog. The post now carries it.
- **From the catalog** (Studio): open the ad, **Pin** it to one of your
  posts.

The post renders with the ad block under it — creative, offer, CTA, and the
disclosure. Your followers see it 100% of the time, because delivery is by
architecture, not by an algorithm deciding your post "performed well enough."

### Step 4 — Organize as you grow

- **Albums** — group ads by campaign or season ("Summer 2026," "My setup").
  An ad can be in a few.
- **Pause / retire** — a deal ends? Pause it. It stops rendering on every
  post that carries it, but stays in your catalog. Done for good? Retire it.
- **Rotate** — v3 is `pinned` | `none` (you pin a specific ad to a specific
  post). The full curation engine (round-robin, greedy, frequency-capped) is
  the v4 vision — not built yet, don't plan around it.

## Doing It Genuinely (the part that isn't in the spec)

The mechanics are easy. The hard part is not becoming the guy who slaps a
link on everything until nobody trusts him. A few principles that keep the
revenue *and* the audience:

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

## What This Is Not

- **Not an ad network.** No bidding, no exchange, no third-party targeting.
  The only sponsors a follower sees are the ones *you* chose. The
  network-exchange layer (brands buying inventory, CPM/CPC, DSP/SSP) is a
  separate v4 concern.
- **Not a payment processor.** web10 doesn't touch your affiliate money.
  Amazon pays Amazon's account. The brand pays the brand's deal. You are the
  merchant of record for your own links.
- **Not memberships or tips.** That's the payment model (v4, Stripe
  Connect, the 3+10+10+77 split) — a different surface, a different
  decision. This bootcamp is the *link* side: affiliate, direct deals, and
  your own store.

## Logistics

- **Built now (v3):** the ad object, the ad maker (Studio → Ads), the
  catalog, pin-to-post, albums, pause/retire. The `affiliate` / `direct` /
  `own_store` offer kinds. Disclosure always shown.
- **Known gap:** the ad maker's media attach (the creative's
  `media_refs`) — the spec carries it, the UI doesn't yet. Track it in the
  `ads` lane.
- **Deferred (v4):** the curation engine (round-robin / greedy /
  frequency-capped), `html_template` (your own ad layout), revenue
  settlement + impression verification, and the ad-network exchange.
- **The node layer** (node ads, the operator's inventory) is a separate
  surface — `node-ads.md`. You don't manage it as a creator.

For the ad object + the feed read, see [`ads.md`](./ads.md). For the two
surfaces (catalog + composer) in detail, see
[`ads-catalog.md`](./ads-catalog.md). For the node operator's layer, see
[`node-ads.md`](./node-ads.md).
