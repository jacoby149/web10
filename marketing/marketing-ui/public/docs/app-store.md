# App Store

**Who this is for:** you — a node operator (and, in passing, anyone
curious how the store's numbers stay honest). This is your node's public
storefront: what apps are, how they get there, what the numbers mean, and
the one job that's yours to do — approving them.

## What the store is

Your node's public storefront. Apps register themselves, the node records
which **real web10 users** use them, and the store shows what people
actually use — **sorted by active users. No algorithm, no promotion, no
pay-to-play.**

The store is a public surface: a signed-out visitor can browse it, open an
app's page, and read every rating. Only two things need more than that —
rating (a rating carries the author's name) and approving (that's you).

## An app is a URL — including the path

The store's identity for an app is its **full URL, path included.**
`https://www.web10.app/docs/notes/` is a different app from
`https://www.web10.app/` and from `https://social.web10.app/`.

That's the load-bearing call: a host can host many apps. The rule in one
line: **a known host at its root is infrastructure; a known host with a
path is an app.** Any page that runs the web10 SDK and has its own URL is a
registrable app — if it's a real web10 app (loads the SDK, does CRUD, ships
a PWA manifest), it belongs in the store.

The identity is stored in canonical form (lowercase host, no `www.`, one
trailing slash, no query string) so an app can't fork itself into two
entries by spelling its URL differently.

## How an app gets there

Apps don't apply. They **register on every run** — the SDK pings the node
when the app loads. What the node does with a ping:

- **First time** — the app appears in your node's app list, marked
  **pending**. It's not in the public store yet.
- **Every run after** — the registration record stays stable; it doesn't
  grow with traffic.
- **A ping from a signed-in user** — counts as usage (below).

Registration is **anonymous by design** — the store is a public surface,
and a signed-out visitor's app has to be able to register. The *counting*
is a separate, stricter surface (next section).

## The numbers: real users, un-gameable

The store's numbers are **queries over a usage log, computed live** — not
maintained counters. The log only gets a row when:

1. The ping carries a **verified token** — signature-checked, never
   decoded unsigned. Only your node mints tokens, at login. An app cannot
   mint one for itself.
2. That user was last counted on that app **more than 3 hours ago** — a
   power user navigating 100× in an hour produces one row.

Anonymous pings are dropped at ingest — they keep the registration alive
but never count as a user.

Per app, the store shows:

| Metric | Meaning |
|---|---|
| `users_1d` / `users_30d` / `users_90d` / `users_1y` | Distinct real users with a counted visit in the trailing window |
| `visits` | Counted sessions — sustained activity, not page loads |

**The headline and the sort key is `users_30d`** — stable (not spiky like
1-day), fair to new apps (a full month to build), and un-gameable by
construction: an app grows the number only by getting real logged-in web10
users to use it. Your node's own homepage leads with the same math at the
node level ("N web10 users · 30d"), so the node number and the per-app
numbers are consistent by construction — same log, same windows.

## What the store shows

Two layers:

- **Plug slots (curated, above the grid)** — the first-party catalog,
  hand-picked: the social app (the flagship), the node console
  (authenticator), the importer.
- **The grid (everything else, sorted by `users_30d`)** — every approved
  app that isn't a plug slot, paginated 20 at a time. Localhost URLs are
  filtered out unconditionally — the store is a public surface, and
  `something.localhost` is not a place a visitor can go.

Each app's **name and icon come from its PWA manifest** — the node fetches
`{app-url}/manifest.json` and proxies it back, so a third-party app shows
its real name and icon without doing anything special. No manifest → falls
back to the registered name, then the host.

Each app has a **product page** — a real URL, refreshable and shareable:
the description, the full metric breakdown, the ratings, and your node's
numbers for context. You can send someone the link to an app the way you'd
send any link.

## Your job: the review

Apps land **pending**. You review them in the node console (the
authenticator, as admin):

- **Approve** — it joins the public grid.
- **Reject** — it stays out.

That's the whole moderation model: **small node, operator's call.** There's
no review queue state machine, no appeals process, no takedown workflow —
your approve/reject *is* the review, and an approved app's listing updates
when it re-registers with new metadata. Ratings are one per user, latest
wins, no moderation queue either.

The bar worth keeping: it's a real web10 app (SDK + CRUD + manifest), it's
not spam, and its name/icon aren't impersonating something else. You're
curating your node's storefront, not running an app review board.

## What the store is not

- **Not a discovery feed** — there's no social "app posts" ledger; the URL
  is the key and the product page is the surface.
- **Not a counter game** — no visit counters, no per-URL rate games, no IP
  tricks. The node sits behind a proxy; the only honest keys are the URL +
  a verified token, and that's all it uses.
- **Not installable-by-default** — a manifest (name + icon) is what makes
  an app look like an app in the store; a service worker is per-app, later.

Next: [Your Audience](/docs/your-audience) — the other side of the node:
the creators you host and the lists they own.
