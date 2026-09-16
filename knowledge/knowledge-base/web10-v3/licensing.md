# licensing.md — why web10 is SSPL, why the core is never gated, and where the money actually is

The Why layer: the reason web10 ships under the **Server Side Public
License v1** with a **free, ungated core** — and the line it does not
cross (no license key, no usage cap, no "you need a license" pester).
Read this before touching the `LICENSE`, before adding any activation /
gating / metering to the node, or before "simplifying" the license to MIT.
The decision record is **D75** (`knowledge/strategy/decisions.md`).

## the abstract use case

A creator gets deplatformed. Five hundred thousand real followers, frozen
in a walled garden they no longer control. They need somewhere to land
that audience where the building is *theirs* — not a lease the landlord
can reprice. web10 is that somewhere: an open, self-hostable node, the
WordPress of social.

WordPress won because its **core is free for commercial use** — no key,
no tier, no "get a license to run this commercially" banner. A
10-million-visitor commercial site runs on free core, and Automattic asks
for nothing for the software. The money is in the *service* around the
core: hosting (WordPress.com), the theme/plugin marketplace, and
enterprise (VIP). That is the whole flywheel, and it only turns if the
core is unconditionally free.

web10 is the same shape: **free core, paid service.** The license exists
to protect the service line, not to tax the core.

## the specific use case

The operator of a 500k-follower node wants three things at once: (1) to
run web10 on their own box with no key and no metering phone-home — the
ownership story depends on it; (2) to monetize (node ads, the no-ads
subscription) without the software holding their audience hostage; and
(3) for web10 Inc. to be able to *compete* on the hosted-node offering
without a fast-follower cloning web10's modifications closed-source and
undercutting on price.

A license-key / usage-cap model satisfies (3) by breaking (1) and (2) —
it is the landlord changing the locks, the exact thing web10 exists to
reject. SSPL satisfies all three: the core stays free to run and extend,
the operator's audience is never gated, and §13 stops the closed-source
service clone.

## the technical how

**The license is SSPL-1.0, verbatim.** The `LICENSE` at the repo root is
MongoDB's Server Side Public License v1, reproduced **unchanged**. The
copyright line in it reads `Copyright © 2018 MongoDB, Inc.` on purpose —
that is the copyright in the *license text itself* (SSPL was authored by
MongoDB). web10's copyright is asserted on the **web10 source code**, not
on the license document. The SSPL forbids altering its own text ("changing
it is not allowed"), so it is kept verbatim; rebranding it to "web10"
would void it as valid SSPL (the prior `LICENSE-Community.txt` state,
fixed in 3.98.3).

**What SSPL grants (the free part).** Run the unmodified node, modify it
for your own use, build apps on it, self-host it for a personal or a
500k-follower audience — all free, irrevocable, no key, no cap. Running a
node, even a big commercial one, is *running* the software, not
*conveying* a modified version, so no obligation is triggered.

**What SSPL requires (the one condition, §13).** If you make the
functionality of web10 **or a modified version** available to third
parties **as a service**, you must make the **Service Source Code**
available via network download to everyone at no charge, under the same
license. "Service Source Code" is broad: the source of the Program and of
every program you use to offer it (management software, UIs, APIs,
automation, monitoring, backup, storage, hosting) — enough that a user
could run an instance of the service from it. This is the moat: it stops
a competitor from offering a *modified* web10-as-a-service while keeping
their changes closed.

**What SSPL does NOT do (the honest limits).**
- It does not stop someone running web10 **unmodified** as a service and
  competing on price/support. §13 forces the release of *modifications*,
  not the cessation of competition.
- It is **source-available, not OSI open source.** A small loss of the
  "open source" halo and some reflexive adoption friction; accepted
  because the audience is creators (not infra devs) and the service moat
  is worth more.
- It has **no legal reach into other codebases.** It cannot be pointed at
  WordPress or any other product; it only governs web10 and works based
  on it.

**The tiers are services, never software licenses.** The "personal /
influencer / corporate" tiers map onto hosting + support, the WordPress
core / .com / VIP shape:

| Tier | What it is | The WordPress analog |
|---|---|---|
| **Personal** | Free core — self-host or free hosted. No key, no cap. | WordPress core |
| **Influencer** | The hosted node ($49 / $199). Pay for *us hosting it*, not the software. | WordPress.com |
| **Corporate / Enterprise** | The $999+ tier: dedicated node, SLA, DR, white-glove. A contract is normal here — enterprise wants a party to sue. | WordPress VIP |

The gate, if any, is on **hosting and support** — never on the software.

**The "soft wall," done right.** No "you need a license" banner — that is
the opposite of the no-landlord brand that *is* the product, and a demand
reads as greed. The nudge is an **upsell to a service**: when a
self-hosted node gets big, the message is "your node's getting poppin —
want us to host it and take the infra off your plate?" No registration
cap on the free core — a large self-hosted node is a *lighthouse* (proof
the platform scales, a case study, a recruiting ad), not a free-rider to
cap. Capping it would cap web10's own marketing.

## the line it does not cross

- **The core is never gated.** No license key, no activation, no usage /
  registration cap, no metering phone-home. If a change would require a
  key or a license to *run* the node, it is a thesis violation, not a
  config tweak. The ownership story ("you can never be evicted") dies the
  moment the software holds the audience hostage.
- **The data and audience are always portable.** A license (or the lack
  of one) is on the *software use*, never on the *data*. The creator's
  audience list, their posts, their terms — exportable and movable
  regardless of tier. That is the actual ownership promise, and it is
  untouched by the license.
- **The money is on the service, not the software.** web10 Inc. earns
  from hosted nodes (usage tiers), node ads (10–15% take), the no-ads
  subscription (70/30), and enterprise. The software itself is free.
  Charging for the *software* is the greedy move that kills the
  "next WordPress" play; charging for the *service* is how WordPress
  became a $1B+ company while keeping the core free.

## logistics

- **Built (3.98.3):** `LICENSE` restored to verbatim SSPL-1.0 (the
  rebranded "web10" copyright line reverted), `LICENSE-Community.txt`
  renamed to `LICENSE`, README License section added.
- **Decided (D75, 3.98.4):** the full model — SSPL, free core, no gate,
  tiers-as-services, the soft-wall nudge, the MIT reject, the §13
  moat. `knowledge/strategy/decisions.md`.
- **Customer-facing:** `marketing/marketing-ui/public/docs/licensing.md`
  (the plain-English "what can I do with this" page, the credible
  "same license as MongoDB" framing).
- **The one gray area to get a lawyer on *before* it matters:** the
  **SDK-embedding** case. If web10's data layer / auth is ever embedded
  inside a *third party's* closed product, §13's "offering the Program as
  a service" gets murky (is their app offering the Program?). For the
  node-as-a-platform model this is a non-issue; if the embed-SDK story
  becomes important, get a read on §13 scope first — do not assume.
- **Deferred:** the in-node hosted-upgrade *nudge* surface (the "your
  node's getting poppin" banner, an upsell to hosting, not a license
  demand) — a small UI bite on the Node Config / status surface, to be
  scoped when the hosted tiers (D57, M2) are live.
