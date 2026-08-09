# web10

> What you make is yours.

web10 starts from one premise: **what you make is yours.** Every user's data lives in a single data lake. Apps are stateless frontends that hold a scoped, expiring token, do their work, and step aside. The data outlives any app — because the data was never the app's to keep.

On that protocol stands the product: **a platform for creators who refuse to rent their own audience.** Today a creator with a million subscribers reaches three hundred thousand — not by accident, but by design. The platform withholds your reach so it can sell it back to you. web10 removes the landlord. On your own node, a post reaches 100% of your followers. There is no algorithm to please, no throttle to buy your way past, no shadow ban to fear. This is not a promise written in a policy that can be revised. It is the architecture, and architecture cannot be quietly revoked.

The model is WordPress applied to social media: open, self-hostable nodes. Creators run them, under their own name and their own domain, and keep what they earn. Accounts are free for their audience. web10 takes a small percentage of the revenue that moves through its payment rails — paid for value delivered, not for permission granted.

## The premise, made concrete

| | |
| --- | --- |
| **You own your data** | One data lake. Export it, move it, erase it. Delete means delete. |
| **No shadow ban** | Every post reaches every follower, by construction. The feed is chronological, because a feed should report — not editorialize. |
| **User-level IAM** | For the first time, a user has AWS-grade control over their data. Per-app, per-service, per-operation permissions. Revoke an app in one click. Kill switch for everything. |
| **Groups are everything** | Follows, discovery, sharing, DMs — all the same primitive. One group. Infinite apps. Your circles follow you everywhere. |
| **Apps are just frontends** | An app earns access through a scoped, expiring, revocable token. It never owns what it touches. |
| **The internet is too permanent** | Content lives in the author's collection. When the author deletes it, it's gone. Not cached. Not mirrored. Not archived. Gone. |
| **Self-hostable** | One `docker compose up` runs a node on hardware you own. The escape hatch is real, and that is what makes the ownership real. |

## The reach gap

A million followers, and the platform decides which 300,000 see the next post. Subscribing was never delivery — it was permission for the algorithm to maybe show you. That gap is visible in your own analytics right now. On your web10 node, 100% delivery is architecture, not a setting someone can change.

## How it works

1. **You post once** — text, photos, video, published from your node, on your domain.
2. **It lands in every inbox** — every follower's inbox gets the post the instant you publish. No feed algorithm decides who's shown.
3. **100% delivery, by architecture** — it can't be quietly revoked, because it isn't a policy; it's how group membership works.

## Groups: the primitive that replaces everything

Groups are not data containers. They hold people and roles. Content lives in the author's collection. Groups define who can discover it.

**Follows** — `alice.followers` is a group. Joining is following. Leaving is unfollowing. No separate follows table.

**Discovery** — the public board is a group everyone belongs to. Posts attached to it are public. Posts without it are private.

**Close friends** — an invite-only group. Only people you add can see content.

**Communities** — topic-based groups with moderation. Request to join. Owner approves.

**DMs** — a two-person private group. Messages live in the sender's collection. The group is the bridge.

One primitive. Four social patterns. Same tables, same CRUD, same roles.

## User-level IAM

For the first time, a user has AWS-grade control over their data. App contracts are IAM policies — per-app, per-service, per-operation. The user approves or denies in the authenticator.

```
music.web10.com → {
  "posts": ["readAll", "create"],
  "playlists": ["readAll", "create", "updateOwn", "deleteOwn"]
}
```

Services are infinite — any app can invent new ones. Apps are the constraint. You have three apps you use. Three contracts. The user is always in control.

**Kill switch** — revoke all app contracts. No website touches your data. Ever.

## Principles

- **Data ownership.** Users own their data. Apps are lenses, not platforms.
- **Statelessness.** Apps hold nothing but a scoped, expiring token.
- **Least privilege.** Every actor — app, agent, LLM — acts under a token with the minimal scope its job needs, and no more.
- **Portability.** Data, algorithm, and identity move with the user across nodes.
- **Open protocol.** Self-hostable nodes; the reference implementation is one valid node, not the only one.
- **Never fake it.** No stock photos of smiling people, no invented testimonials, no logos of companies that don't use us. Real screenshots, real numbers, real mechanics.

## Where to go next

- **[SDK Guide](/docs/sdk)** — `npm install web10-npm`, the frontend library web10 apps are built with.
- **[Protocol Spec](/docs/protocol-spec)** — the data model, auth, permissions. The ground truth.
- **[Groups](/docs/groups)** — the unifying primitive: follows, discovery, sharing, DMs.
- **[Conventions](/docs/conventions)** — document typing, ref pattern, media.
- **[CLI Quickstart](/docs/cli-quickstart)** — drive a node from the terminal.

> web10 is built for people whose work carries their name. If the idea earns your respect, star the repo. Better — run a node, and build something you'd sign.

---

*Authored by **Jacob Hoffman** — [jacobhoffman.xyz](https://jacobhoffman.xyz)*