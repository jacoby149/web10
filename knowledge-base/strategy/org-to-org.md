# org-to-org.md — the dominant strategy: getting the world online, node by node

Operator direction, 15.11.2026:

> now the dominating strategy should be b2b or o2o org to org bus 2 bus,
> getting the world online, much more similar to the old internet in that
> way, node by node

This document is the dominant go-to-market frame. It supersedes the
creator/influencer track as the *dominant* strategy; it does not delete it
(see "Archived, not erased" below). The same-session customer clarification
(organizations, in-house capability, the ick of current social media,
hygienic but connected) is recorded verbatim in
`torah-anytime.md`'s marketing-proposition section and summarized here.

## The customer: the organization

An organization with a message, an audience and **no in-house social media
capability** — not an individual creator fleeing a ban. Torah Anytime is the
first anchor (`torah-anytime.md`): a library, a publishing operation and a
large audience that wants to spread Torah on its own branded, on-mission
node, at a scale it can actually carry (operator target: a node that scales
to 1M).

The org's problem is not deplatforming. It is **capability and hygiene**:

- it would rather not build and run a social platform in-house;
- it does not want its community and its message mixed up with the ick of
  current social media — other platforms' content, ad machinery, engagement
  traps, moderation failures;
- it wants reliable delivery to its own audience, on its own brand.

The offer: web10 runs that capability for them. A white-label node — the
social experience under their brand, their content policy, their speakers —
with the network underneath. The DEMO/THEME/TABS kit in `torah-anytime.md`
is the reusable shape of that onboarding.

## The network grows node by node, like the old internet

The old internet was a patchwork of organizational homepages — the shul, the
band, the business, the city — each with its own space, linked into one web.
The monoculture feed is the aberration. web10 grows the way the old web did:
**one node at a time**, each organization bringing its community online onto
a slice of the network it owns.

Adoption is counted in **nodes** — organizations onboarded, branded, live,
carrying their audience — not individual signups on one shared feed. Each
node contributes its community's scale to the whole, so the network's value
compounds per node. That is the org version of "the data outlives the app."

## Hygienic but connected (the org's two requirements)

- **Hygienic.** Each node's community experience is on-mission. A
  Torah-only node stays Torah-only — content policy, roles, moderation
  (`torah-anytime.md`). No firehose of unrelated content, no ick from other
  platforms. The clean house is the point, not a side effect.
- **Connected.** The node is not a walled garden. The network is
  interoperable by design (D41: readable by design; public content is the
  product). Other communities pull in a slice at the dose the reader
  chooses — per-source mixer weight (`federated-feed-mixer.md`). The
  operator's example: a Reform Jew on their own feed pulls a little Torah
  in, not the 100% blast. An org's message can travel across the network
  without the org joining everyone else's content.

## Archived, not erased: the relationship to the creator track

The influencer strategy — the 100-name machine, the M0 kill test, the
20-pitch sales kit, the segment splits, the sourcer tooling — is preserved
intact at `archive/creator-influencer-track/`. Nothing in it was erased or
rewritten; it stays readable and stays in the `web10web10!` re-read stack.
It is no longer the dominant frame, and D112 authorizes no execution of it;
reactivating it is a separate operator decision.

| | Creator track (archived) | Org track (dominant) |
|---|---|---|
| customer | banned/burned individual creator | organization with something positive to spread |
| pain | landlord owns the audience; deplatforming | no in-house social capability; the ick of current social media |
| pitch | escape: "own your audience or leave" | mission infrastructure: a clean, on-mission node that scales to your audience |
| unit of adoption | creator + their followers | node (org + its community) |
| growth mechanic | the creator's reach gap | node by node; interop slices across nodes |

The product spine is shared: D41 data policy (not privacy), readable-by-
design node, 100% delivery, PWA, the generic API (D60). What the org track
changes is **who we sell to and what story we tell** — the same machine, a
different door. `thesis.md` remains the product test; its banned-creator
"specific use case" is the archived track's illustration of the product,
not a claim that individuals are the only customer.

## Implications (planning direction, not execution scope)

- **White-label is the onboarding surface for every org.** DEMO1–DEMO3,
  THEME0–THEME2 and TABS1 in `torah-anytime.md` were scoped for the first
  anchor; they are the reusable kit for subsequent orgs. TA0–TA4 is the
  per-org rollout shape.
- **Scale targets are per-node.** "A node that scales to 1M" is the Torah
  Anytime target; each org node brings its own. Capacity planning
  (catalog/search, playback, operating cost) runs against the anchor's
  banner metrics + 1M, not a single global number.
- **The org pipeline is unscoped.** The creator track had a 100-name
  machine; the org track has no prospect list, segment split, kill gate or
  pitch copy yet. Building it (org segments, sourcing, the M0 equivalent,
  copy) is a new lane item when the operator wants it — not implied by
  this record.

## Scope and non-goals

- This record changes strategy dominance and the `strategy/` folder
  structure (creator-track files moved to `archive/creator-influencer-track/`
  unchanged). It changes no code, no demo scope, no partner commitment, no
  pricing, and no lane ownership beyond file paths.
- D20 (social platform first, protocol second) remains the product test;
  this is a GTM realignment, not a D20 reversal.
- Federation claims follow the same rules everywhere: per-source pulling
  across nodes is protocol design (`federated-feed-mixer.md`), and its
  connected two-node verification remains open. "Hygienic but connected" is
  the frame, not a deployment receipt.
