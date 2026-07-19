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


## the conference paper (distribution, not product)

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
