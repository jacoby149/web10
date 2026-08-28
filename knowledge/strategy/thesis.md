# thesis.md — what web10 is, and what it refuses to be

the one answer to "what is this thing, actually?" read this before
touching a product surface. it supersedes the old "privacy platform"
framing (D41 reverses D6/D16–D19). if a feature doesn't serve this,
it's a no. the fan-facing version of the same idea is `manifesto.md`;
the creator pitch is `outreach.md`. this is the internal spine.

## the one-liner

web10 is a system for getting famous on your own terms — and a system
you can walk away from the second the people running it start acting
like assholes. it is **not** a privacy platform. it is a **data policy**
platform: you own the data, you set who sees it, you can take it with
you, and the operator is a real party you can sue if they do something
sketchy. that's the whole ballgame.

## why it exists (the human problem)

a creator builds an audience. the platform owns the audience. one TOS
change, one shadow ban, one demonetization, one "our systems detected
unusual activity" — and 500k followers become a number you can't touch,
can't export, can't message, can't take anywhere. the creator is a
tenant in their own house, and the landlord can change the locks.

that's the problem. not "the platform reads my DMs." (it does, and you
signed up for that — same as every other place on the internet.) the
problem is: **the platform owns the relationship between you and your
audience, and it can revoke it at will.** deplatforming is the endgame
of that ownership.

web10 exists so the creator owns the distribution. the audience is
theirs. the data is theirs. the terms are theirs. the building is
theirs — and they can never be evicted.

## the specific use case

a creator gets deplatformed. banned from the big app overnight, no
appeal that lands, audience frozen in a walled garden they no longer
control. they need somewhere to land 500k *real* followers where:

- every follower actually sees every post — 100% delivery, no shadow
  ban. that's the product, not a feature of it.
- the audience list is exportable and portable. it's *theirs*.
- the content is searchable and publicly auditable. it's a real
  network, not a dark forest no one can find or verify.
- the creator sets the terms, not the platform.

that's who we build for. not the person who wants Signal-grade secrecy.
that person exists, and Signal is for them. we are not competing with
Signal. we are competing with the platform that just banned them.

## why this way (data policy, not cryptography)

the old framing was "the node can't read your data" — e2e encryption,
phone-as-keychain, CP-ABE, MLS, the whole cryptographic cathedral. we
are killing that as a default. here is why it was the wrong bet:

1. **discovery needs the node to read.** feeds, trending, search,
   moderation — the actual product — all require the node to see
   content. you cannot run node-powered discovery on ciphertext.
   "discoverable" and "cryptographically hidden from the node" are
   mutually exclusive. you picked discovery. you picked node-readable.
2. **the real threat isn't the node reading; it's the node OWNING.**
   the platform reading your public posts is the norm — YouTube reads
   your "private" videos, Facebook read every message for a decade.
   what actually kills a creator is the platform owning the audience,
   the relationship, and the revenue, and revoking all of it. that is a
   **data policy** problem, not a cryptography problem.
3. **trust is legal, not cryptographic.** a web10 node operator who
   does something sketchy with your data can be **sued**. that is the
   trust model: a real party, with real liability, running a real
   service, holding your data under terms you set. you cannot sue
   math. "we can't read it" is a weaker promise than "you can take it
   and you can sue us."

so the node is **readable by design**. it is above water. it is
searchable. it is auditable. if someone puts garbage on a node, it is
visible, and the operator is on the hook for it. that is a feature — it
is what makes web10 a real, verifiable network instead of a pile of
encrypted black boxes no one can find, search, or hold accountable.

## and it tracks hard (D56)

the data-policy frame is not a privacy frame — and it is not a
no-telemetry frame either. web10 competes with Meta and TikTok for the
same attention, and their UX is the output of a decade of aggressive
telemetry. so web10 tracks hard, platform-wide: GA4 + Hotjar on every
user-facing surface (marketing site, social app, authenticator). the
recording is **content-blind by construction** — text masked, images
blocked; the operator sees cursor + layout + timing, never words or
pictures. GA4 events are **content-free by convention**: paths,
actions, counts — never post text, media URLs, or PII.

the line: **content is never tracked.** posts, DMs, media — not in the
recordings, not in the events, not sold, not fed to any ad machine (GA4
advertising features stay off; the only sponsors a fan sees are the
creator's, D50/D55). the trade is stated in the terms, not hidden
behind a consent popup: the platform watches how you use it so it can
keep being the best version of itself — if that is not for you, this
is the wrong platform for you.

full model: `knowledge-base/web10-v3/telemetry.md`. decision: D56.

## what this buys (the value)

- **creators:** own the audience, own the data, own the terms, 100%
  delivery, no shadow ban, export + leave anytime, keep the revenue.
  the audience is an asset they hold, not a lease they rent.
- **fans:** see everything the creator makes (no algorithm between you
  and them), not mined for ads, delete means delete, and the creator
  can't be evicted from under them.
- **the network:** interoperable (apps are stateless frontends; the
  data outlives any one app), portable (leave a provider, take your
  stuff with you), auditable (public, searchable, above water).

## what it is NOT (the rejections)

- **not a privacy platform.** if you want the node to be
  cryptographically blind to your DMs, that is Signal's job. we are not
  building that by default. (the door stays open — below.)
- **not a dark forest.** no "encrypted so no one can audit it." the
  network is public, searchable, and the operator is accountable for
  what's on it.
- **not a native mobile app.** the client is a **PWA**. no app store,
  no phone-as-keychain, no `mobile/encryptor`. that app is gone (D41).
  we are making the PWA the thing.

## the door stays open (but it is not our job)

e2e is not banned — it is **not the default and not our product.** a
user or a third party can always build their own e2e layer on top; the
SDK and WebRTC are there if someone wants to roll their own libs. we
just don't ship it by default, because:

- it conflicts with discovery (the product),
- it is not where the money is (the money is in helping influencers get
  replatformed and *keep* their audience),
- and "you can sue us and take your data" is a stronger trust story
  than "mathematically we can't read it."

if a creator ever says "I need my DMs to be cryptographically blind to
the node," that is a feature request we will hear — and it would be an
**opt-in tier, never the default.** but that is a "someday, if a real
creator asks," not a lane on the board.

## the test

before building anything, answer one question: does this help a creator
**own their audience, keep their data, and refuse to be evicted**? if
yes, build it. if it is really about making the node cryptographically
blind, park it — that is not this product.
