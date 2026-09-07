# Ad Catalog

**Who this is for:** you — a creator who wants to earn on web10. This is
where your ads live: the Studio in the authenticator, and the one control in
the composer that ties them to your posts.

## Where it is

The **Studio** is the monetization screen in the authenticator (the same
window you sign in with). It's where the money lives:

- **Affiliate Programs** — the "START HERE" card. The shortlist of programs
  worth joining, each with a sign-up link. You sign up there, then make your
  first ad in the Ads card. (See [Affiliate
  Programs](/docs/affiliate-programs).)
- **Ads** — your catalog. Your ads, your albums, and the posts they run on.
- **Direct Deals** — offers from brands you cut deals with directly.
- **Memberships** — the paid-subscription surface (a later model — see
  [Payment Rails](/docs/payment-rails)).

## The catalog: your ads

The **Ads** card is your inventory. Every ad you've made, in one list. Each
row shows:

- **The creative** — your text + media (the ad is a post, so it looks like
  one).
- **The offer** — the partner, the kind, the CTA, the disclosure.
- **The status** — `active` or `paused`.
- **The attached posts** — the posts that carry this ad.

What's in the catalog is exactly what gets delivered — there's no separate
"live" list to reconcile. It's your own posts, the ones you marked as ads.

### The actions

- **New Ad** — the ingest flow. Pick an offer (from your programs, or
  define one inline), write the copy, attach media, set the status. Done —
  it's in the catalog and ready to pin.
- **Edit** — change the copy, re-point the link, swap the media.
- **Pause / resume** — flip the status. A paused ad stops showing on every
  post that carries it, but stays in the catalog. A deal ends? Pause it.
- **Retire** — take it out for good. It falls out of the catalog and of
  every feed.

### Albums

Group your ads by campaign or season — "Summer 2026," "My setup." An ad can
be in a few albums. Albums are how you organize the catalog as it grows;
they don't change what gets delivered.

## The composer: pinning an ad to a post

In the social app, when you make a post, there's an **Attach ad** control
next to the media and visibility options. Tap it → a list of your catalog
(creative, partner, kind) → pick one. The post now carries that ad.

That's the whole mechanic:

- The **post is the vehicle; the ad is the payload.** The post doesn't copy
  the ad — it points at it. One ad can be carried by many posts.
- **Pause the ad, and it stops rendering on all of them.** The post is
  unchanged; the ad is just off.
- A post with no ad renders exactly as it always did.

Your followers see the post plus the ad block under it — creative, offer,
CTA, disclosure — 100% of the time, because delivery is by architecture.

## The sequence, end to end

1. **Sign up** for a program (the Affiliate Programs card).
2. **Make the ad** (Ads → New Ad): copy + offer + disclosure.
3. **Pin it** to a post (the composer's Attach ad, or from the catalog).
4. **Tend it** — pause when a deal ends, retire when it's done, album it as
   you grow.

That's the loop. The next two docs are the two halves of step 1 and the
whole ramp: [Affiliate Programs](/docs/affiliate-programs) and
[Monetization Bootcamp](/docs/monetization-bootcamp).
