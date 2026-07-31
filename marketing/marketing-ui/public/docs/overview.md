# web10

> What you make is yours.

web10 starts from one premise: **what you make is yours.** Every user gets
their own database collection. Every record is `{service, body}`. Apps are
stateless frontends that borrow access through a scoped, expiring token, do
their work, and step aside. The data outlives any app — because the data was
never the app's to keep.

On that protocol stands the product: **a platform for creators who refuse to
rent their own audience.** Today a creator with a million subscribers reaches
three hundred thousand — not by accident, but by design. The platform
withholds your reach so it can sell it back to you. web10 removes the
landlord. On your own node, a post reaches 100% of your followers, delivered
to each one's inbox the moment you publish. There is no algorithm to please,
no throttle to buy your way past, no shadow ban to fear. This is not a
promise written in a policy that can be revised. It is the architecture, and
architecture cannot be quietly revoked.

The model is WordPress applied to social media: open, self-hostable nodes.
Creators run them, under their own name and their own domain, and keep what
they earn. Accounts are free for their audience. web10 takes a small
percentage of the revenue that moves through its payment rails — paid for
value delivered, not for permission granted.

## The premise, made concrete

| | |
| --- | --- |
| **You own your data** | One collection per user — the record of your own life, held by you. Export it, move it, erase it. Delete means delete. |
| **No shadow ban** | Every post reaches every follower, by construction (fan-out on write). The feed is chronological, because a feed should report — not editorialize. |
| **Apps are just frontends** | An app earns access through a scoped, expiring, revocable token. It never owns what it touches. |
| **Federated identity** | Identity is `(username, provider)`, like email. No central registry to petition, no account that can be taken from you. |
| **Private, not permanent** | Unlike a blockchain, your data can be private, temporary, and deletable. E2E encryption (phone-as-keychain) is in progress — we don't claim what isn't built. |
| **Self-hostable** | One `docker compose up` runs a node on hardware you own. The escape hatch is real, and that is what makes the ownership real. |

## The reach gap

A million followers, and the platform decides which 300,000 see the next
post. Subscribing was never delivery — it was permission for the algorithm
to maybe show you. That gap is visible in your own analytics right now. On
your web10 node, 100% delivery is architecture, not a setting someone can
change.

## How it works

1. **You post once** — text, photos, video, published from your node, on
   your domain.
2. **It lands in every inbox** — every follower's inbox gets the post the
   instant you publish. No feed algorithm decides who's shown.
3. **100% delivery, by architecture** — it can't be quietly revoked,
   because it isn't a policy; it's how the inbox pattern works.

## Principles

- **Data ownership.** Users own their data. Apps are lenses, not platforms.
- **Statelessness.** Apps hold nothing but a scoped, expiring token.
- **Least privilege.** Every actor — app, agent, LLM — acts under a token
  with the minimal scope its job needs, and no more.
- **Portability.** Data, algorithm, and identity move with the user across
  nodes.
- **Open protocol.** Self-hostable nodes; the reference implementation is
  one valid node, not the only one.
- **Never fake it.** No stock photos of smiling people, no invented
  testimonials, no logos of companies that don't use us. Real screenshots,
  real numbers, real mechanics.

## The roadmap (what we're building toward)

- **Today.** The node runs: data, auth, media, a social app (feed, profiles,
  DMs), an admin/consent UI, and an SDK. Self-hostable in one `docker
  compose up`. A live node is up at `web10.app`.
- **Now → Oct 2026 — the rule of 100.** Founding creators onboarded
  one-at-a-time, white-glove. Memberships and the sponsored-products tag
  card wired to real payment rails. The "why I left" moment turns the
  flywheel for the first time.
- **Oct 2026 — the verdict.** One signed creator posting within four weeks
  means M2 is real: onboard, measure `%`-audience-joined, first revenue on
  the dashboard. A hundred sends and zero closes would mean stop building
  and diagnose — we will not soften that signal.
- **Oct–Nov 2026 — M2.** Creator #1 live, branded, earning. Founding
  creators #2–3 from the remaining pipeline. The raise window opens; we
  evaluate, we don't default to yes.
- **Dec 2026 – Apr 2027 — grind to breakeven.** Five to six paying creators
  ≈ breakeven (≈ month 9). The starter tier opens. M1 goes public when
  self-host onboarding is one-command clean.

We document where the work actually is, not where we wish it were. E2E
encryption, expiring posts, and the phone-as-keychain land in the docs the
phase they ship — never before.

## Where to go next

- **[Protocol Spec](/docs/protocol-spec)** — the wire protocol, the data
  model, the auth model. The ground truth.
- **[Conventions](/docs/conventions)** — the names and shapes every node
  and app agrees on.
- **[SDK Guide](/docs/sdk)** — `npm install web10-npm`, the frontend
  library web10 apps are built with.
- **[CLI Quickstart](/docs/cli-quickstart)** — drive a node from the
  terminal.

> web10 is built for people whose work carries their name. If the idea
> earns your respect, star the repo. Better — run a node, and build
> something you'd sign.

---

*Authored by **Jacob Hoffman** — [jacobhoffman.xyz](https://jacobhoffman.xyz)*