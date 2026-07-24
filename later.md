# later.md — far-out ideas, deliberately NOT on the roadmap

this file is the parking lot for ideas that are exciting, plausibly real,
and explicitly not being built now. plan.txt's LATER section holds
near-term deferrals (perf, clickhouse, schema contracts); this file
holds the sci-fi tier. the bar for promoting anything out of here:
the M0 video has shipped AND a creator conversation asked for it.
until then, nothing below is anyone's task.

each entry records the idea, why it's genuinely good, and the honest
reason it's parked — so it doesn't get re-pitched from scratch every
six months (same job decisions.md does for settled calls).


## the lens: feed customizability + the llm chatbox (cut from phase 8, D20)

the idea: the feed algorithm + experience config as a record the user
owns (ranking rules, topic mutes, weights, time budgets, ui toggles),
preset lenses (chronological, close-friends, detox, creator mode),
and a chatbox where an llm edits the record in english. "my feed
algorithm is my prompt" / "nobody has ever owned their algorithm
before."

why it's good:
- technically NOT far out: a bounded llm task (read a json config,
  apply an instruction, emit a schema-validated diff, show it, apply
  it). the feed re-renders instantly from config; the llm is only in
  the loop at moments of change. byok plumbing already decided (D19).
  roughly a week of work on top of a config-driven feed.
- the most legible 10-second demo of data ownership that exists:
  "i told an ai to fix my feed and watched it happen." if a
  consumer-attention wedge is ever needed, this is the cheapest
  attention machine in the repo.
- incumbents can't copy it without self-harm: engagement-optimized
  feeds ARE their revenue.

why it's parked (D20):
- the buyer is the creator, and the creator pitch doesn't need it:
  ownership + no-shadowban + monetization close the deal or nothing
  does. the killer app stands on its own as a plain good social app
  or it isn't killer.
- <5% of users ever open settings. retention comes from good
  defaults, not configuration surface. "the customizable social
  network" was ello/vero's pitch and it doesn't travel.
- the feed ships chronological + a sort dropdown. "no algorithm" is
  itself the anti-shadowban feature (THE STORY beat 3) and costs
  zero code beyond the inbox pattern.

promotion bar (on top of the file's): creators or their audiences
ASK for feed control, or the creator-pitch wedge stalls and a
consumer-attention wedge is needed.


## vibe-coded apps / themes (the real gutenberg)

the idea: an llm generates a complete web10 app on request — react +
the typed sdk (phase 6) + the conventions doc (D1) as its context —
deployed as static files, talking to the user's node under a scoped
token. "wordpress themes" where the marginal cost of a whole app
dropped to the cost of a theme, so apps ARE the themes. themes/apps
are records: portable, shareable, remixable ("steal this look" —
the tumblr effect).

why it's good:
- interoperability is what makes generated apps safe to be DISPOSABLE:
  the data outlives every app, so the worst a bad one does is render
  your life ugly. no other platform can offer "run untrusted generated
  code over your social data" — scoped tokens (I5) + the consent
  screen bound the blast radius.
- phases 6/6.5 are already building the llm's raw materials without
  calling them that: typed sdk, json schemas, create-web10 templates.
  an llms.txt-style bundle of those IS the theme development kit.

why it's parked:
- the sandboxing problem is real and unsolved here: scoping limits
  what a generated app can REACH, not what it can EXFILTRATE from
  what it reads. the boring answer is csp (connect-src pinned to the
  user's node for personal apps; review-gated for shared ones) —
  design it when tier 3 is actually being built, not before.
- decided in-conversation, worth keeping: NO homemade template/block
  dsl (the middle gutenberg tier). rectangles-npm was this mistake
  once already. tiers are: (1) theme record — design tokens + ui
  toggles as a user-owned record (was near-term while the chatbox
  existed; parked with it under D20 — operator-level theming, a
  creator's node wearing THEIR brand, remains phase 2.5 roadmap);
  (3) whole generated apps, above. there is no tier 2.


## the amorphous app (generative ui / just-in-time software)

the idea: web10-social as a shell + llm chat. "i want to message
friends" -> it codes the messenger on the spot, wired to your real
contacts and dm records. the app is clay: surfaces get generated,
then persist as records (generate-once-then-harden — the llm is the
BUILDER you summon, never the per-session renderer).

why it's good:
- every generative-ui experiment dies on state: conjured apps own
  their data, so regeneration = amnesia. web10 severs exactly that —
  data model fixed and durable, apps stateless lenses. a conjured
  messenger here opens ALREADY FULL of your life (exporters +
  conventions doc). the 2021 protocol is accidentally the
  persistence layer for software that doesn't exist until asked for.
- demo arc: wish 1 changes what you see (lens), wish 2 changes what
  EXISTS (a new surface, populated). wish 2 is the m1/m2 showstopper
  — one pre-rehearsed generation, not a general capability.

why it's parked:
- as a daily driver it fails on boring physics: social apps open 40x
  a day on reflex; codegen takes a minute and costs tokens. muscle
  memory is a feature — an app that's different every morning is a
  usability bug. one-shot generated code is demo-grade, not the
  hundred-small-refinements grade a lived-in messenger needs.
- if it ever graduates: the shape is shell + surfaces (shell = auth,
  consent, chatbox, sandbox, design tokens — permanent; surfaces =
  generated artifacts stored as records — mutable). that split would
  change phase 8's structure, so decide BEFORE building it, in
  decisions.md, not by drift.


## the network: node-to-node federation (trusted nodes, distribution deals, shared trending)

the idea (operator, 23.07 — "this isnt necessary for a social platform,
just add these ideas far out in the plan"): the authenticator's admin
panel becomes the operator's relationship desk with OTHER web10 nodes on
the network. a list of known nodes, a trust/contract-per-node setting
(not a binary follow — "trusted for distribution?", "trusted to receive my
trending?", "trusted to receive my users' public posts?"), and a deals
surface so an entrepreneurial operator can strike a distribution agreement
with another node ("i carry your content, you carry mine, we split
discoverability"). the storefront of nodes, basically, treating the
network as a market the operator works.

why it's good:
- the protocol is already a federation primitive (identity is
  (username, provider) per CLAUDE.md; cross-node record write paths exist
  via the certify + token handoff). "share my trending with these nodes"
  is the same fan-out-on-write the no-shadowban claim already depends on,
  run against an allowlist instead of the user's follow graph.
- distribution IS the creator pitch's missing second half: "you own your
  audience" only stays true if the audience's NODE chose to carry you. an
  operator who brokers distribution deals can literally guarantee reach
  across the network à la an MCN, which is the monetization Shape the
  catalog sells on top of plain subs.
- self-hosters ARE the network here (D16's reveal: real registered apps +
  208 real users already live). deals surface turns the operator into a
  sysadmin with a rolodex, which is the WordPress.com-to-WP.org dynamic
  the founder pitch cites without ever building.

proposed surfaces (record for later, DO NOT build now):
- admin panel: a "Network" card next to App Store Approvals — known
  nodes, per-node trust switches (distribution / trending-share)
  reusing the admin model from the curation endpoints
  (POST /nodes/admin, POST /nodes/approve, parallel to /apps/*).
- public ledger: trusted-node list as a record, so a fan can see "my
  node is federated with these others" — transparent reach claims
  instead of shadow algorithms.
- distribution deals: a contracts service (record in the operator's
  collection) surfacing paired agreements — operator A authorizes
  operator B to mirror public_posts / discovery_posts, optionally
  metered, optionally with a revenue-share field (ties into stripe
  rails the memberships use).
- cross-node trending: /discover/posts extended to honor an allowlist
  of remote-provider reads (certify already verifies remote tokens;
  the read path against remote nodes already exists for cross-node
  DMs/comments).

why it's parked:
- the killer app first (plan.txt PRIORITY ONE, D29): D16(3) curation
  just landed on THE node's store; this is its multi-node analog and
  nobody has asked for it. the bar for promoting: at least one OTHER
  real operator is running a node AND a creator conversation surfaces
  "your reach stops at my node's door." until that's a felt pain, the
  fan-out is just specs in a drawer.
- federation is the M3 milestone ("the network": encryption
  integration + federation polish, parallel execution.txt), and M3 is
  gated on M0/M1/M2 — none of which are shipped. building this now
  puts the cart before the protocol is even hardened (RS256/EdDSA I1
  is still in flight; cross-node read paths aren't audited for load
  from a partner node mirroring your entire public_feed).
- the security surface is real: a "trusted for distribution" switch
  that lets another node READ your users' public_posts is a new
  cross-collection surface, and I3 ("no cross-collection access,
  ever") + the sandboxed aggregate were both tuned for the
  single-node case. the allowlist has to be enforced at the auth
  layer, not just the panel, and the contract test for it doesn't
  exist yet.

promotion bar: a real second operator on a different box, AND M0
shipped (the demo video first per the file-wide bar), AND the RS256
federation fix (lane A, I1) merged. then this is lane A + B work —
admin panel surface (B) + federation endpoints + contract tests (A).


## the goods marketplace (fb-marketplace-shaped, peer-to-peer)

the idea (operator, 24.07 — "that would be top top on a decentralized
social app"): users selling goods to users — listings, local/community
commerce, the craigslist/fb-marketplace surface — inside and across
web10 nodes. listings are records the seller owns (portable storefront:
switch nodes and your listings, sale history, and reputation come with
you — the ownership pitch generalized to commerce), discovery rides the
node's feed/discover surfaces, payment rides the stripe rails that
memberships already use, with inc's small % applying (business-model
aligned by construction). NAMING GUARD: this is NOT the "sponsor
marketplace" — that term is taken (plan.txt phase 4 rungs / M3 / D21:
brand-deal rails between sponsors and creators). this entry is goods,
peer to peer.

why it's good:
- marketplace is one of facebook's strongest daily-open habit loops,
  and on a decentralized social app it may matter even more: commerce
  gives a small node a reason to be opened daily before its content
  volume can.
- a creator community is a PRE-TRUSTED buyer pool with a shared niche
  — scene commerce (the guitar node trading pedals, the fashion node
  trading vintage) has the trust signal craigslist never had:
  reputation inside a scene where the regulars know your name (THE
  STORY, stage 3).
- the plumbing is mostly already planned: listings/offers are ordinary
  {service, body} records under a conventions schema, media via phase
  5, payments via the phase 4 stripe rails, disputes/reports via the
  phase 12 machinery. v0 is a listings convention + a lens, not an
  ebay.

why it's parked:
- D20: the buyer is the creator, and the creator pitch closes on
  ownership + no-shadowban + monetization. a goods marketplace closes
  zero creator-#1 conversations.
- liquidity physics: marketplaces die without density. one node's
  community is thin inventory and thin demand; this earns its keep
  only when real node populations exist (M2+), and cross-node
  listings inherit the M3 federation gate on top.
- the t&s burden is heavier than anything phase 12 currently scopes:
  scams, prohibited goods, escrow/chargebacks, shipping disputes.
  goods commerce is effectively a second company's worth of trust
  work, and it would land on inc's rails.
- the nearer rung already exists in-plan: creators selling THEIR
  stuff (amazon tag, direct deals, membership-gated merch — phase 4
  rung 0/1) covers most of the commerce demand the pitch actually
  meets before any peer-to-peer surface is justified.

promotion bar (on top of the file-wide bar): a hosted node's community
starts trading organically — buy/sell behavior visible in real posts/
DMs — or a founding creator asks for member-to-member selling. then
v0 is a listings schema in the conventions doc + a marketplace lens
over ordinary records, reusing payments and t&s rather than building
either.


## the paper: publish web10 as research

the idea: the problem is validated at the highest level (berners-lee/
solid, activitypub, at protocol, gdpr/dma) — if web10 advances the
state of the art, publish it. worst case upgrades from "dope project"
to "citable contribution."

the publishable claims (scoped honestly — reviewers will check):
- the lens: feed algorithm as a user-owned, portable record, edited
  by an llm under a scoped token. closest prior art is bluesky's
  feed generators (feeds OTHERS run that you pick); the delta is
  ownership + natural-language editing + token scoping. cite at
  proto or die in review.
- scoped/expiring/revocable tokens for llm agents over personal data
  stores (I5 + mcp) + the conformance suite mechanically enforcing
  the invariants.
- NOT publishable alone: {service, body} simplicity vs solid's rdf
  (engineering taste, not a result).

venues: thewebconf (www) demo track, cscw/icwsm, soups (consent/terms
angle); fosdem/dweb talks are not papers but reach exactly the
self-hosting audience and double as distribution.

why it's parked: the m0 demo IS the evaluation artifact — a dozen
real users reconfiguring feeds via the chatbox, with before/after
measurements, is the eval section nearly for free. paper is a
byproduct of shipping m0, never a substitute for the video.
