# Interoperability

**Who this is for:** you — a developer (or a curious user) who wants to see
web10's core claim working: **your data is yours, and any app you authorize
can read it — without the original app knowing or changing.**

## The short version

On a per-app backend, your profile belongs to the app. A game developer
cannot render your avatar in their leaderboard without an API deal with the
social network. On web10, your profile is a **document in your own
namespace**, readable through a grant *you* gave. A different developer's
game reads it through the same query boundary the social app uses. The
social app never built an "embed your avatar" endpoint. It never knew.

The data outlives and outscopes any single application. That is the
property this page makes visible — with two live, clickable demos.

## The live demos

Two small apps, hosted right here on this site, built by a "different
developer" on the same node as web10-social. Neither modifies web10-social.
Neither requires an inter-app API agreement. Both read web10-social's
`profile` documents (avatar, display name, wall link) through the user's
grants.

| App | Owns (writes) | Reads from web10-social | The join |
|---|---|---|---|
| [Snake](/docs/snake/) | `snake_scores` | `profile` | best score per player, joined to the latest readable social profile — real avatar, name, wall link |
| [Marketplace](/docs/marketplace/) | `marketplace_listings` | `profile` | listings joined to the seller's social identity — no "seller profile" API exists |

Open either app, log in with your node, and authorize access. The consent
window is the same authenticator you use everywhere — the grant is scoped to
that app's origin and the services it asked for, and you can revoke it at
any time.

**What to look for:** after you save a Snake score or publish a listing, the
app's query joins *your* app data with *social's* profile documents in a
single statement — `high_scores JOIN profile ON author_key` — and renders
your real social identity next to it. If you revoke the app's access, the
join stops returning your profile. The node has no "game" concept, no
"leaderboard" endpoint, no "seller profile" endpoint. The application wrote
the query; the node only enforced the boundary.

## Why this is the platform's argument

The query engine ([docs](/docs/query-engine)) gives every app the same read
power: you write a `SELECT` over service names, and the node enforces
readability per document. Service names are just namespaces in one shared
table — `posts` and `snake_scores` live side by side under the same
`(author_key, doc_id)` key, with the same access rules. A cross-app join is
not a special feature; it is the normal read path with two service names in
the `FROM` clause.

The strongest single statement:

```sql
-- "Friends & Scores": written by the game. Reads the social app's data.
SELECT
  hs.author_key,
  prof.body AS profile,      -- written by web10-social
  hs.body AS high_score      -- written by the game
FROM snake_scores hs
JOIN profile prof ON prof.author_key = hs.author_key
ORDER BY JSONExtractInt(hs.body, 'score') DESC
LIMIT 20
```

Every service resolves through the same permission-enforced boundary. The
reader's readable groups filter `profile`. `snake_scores` is the game's own
service. No node endpoint names a game, a score, or a leaderboard.

## What the node does NOT have

For the demonstration to be honest, the node has none of these:

- No `snake_scores` or `marketplace_listings` table or endpoint — they are
  services in the shared `documents` table.
- No "leaderboard" or "seller profile" or "embed avatar" endpoint.
- No "game" or "marketplace" concept in the node's API.
- No inter-app API agreement or federation between web10-social and these
  apps.
- No changes to web10-social's source code.

If any of these existed, the claim would not be earned.

## The access model, concretely

1. You log in to the app. It opens the authenticator at your node's origin.
2. You consent to a scoped app contract: this app's origin may
   `create`/`readAll` its own service and `readAll` your `profile`.
3. The app issues its queries through `w.query` with your token. The node
   compiles them against your readable groups — your profile is visible to
   the app only because you granted it, and only as far as your groups make
   it readable.
4. You revoke the contract. The app's next query that touches your profile
   is denied. Your data never left your node.

The same flow, the same authenticator, the same boundary — for the social
app, for the game, for the shop. That is the interoperability: not an API
between apps, but a property of the data layer.
