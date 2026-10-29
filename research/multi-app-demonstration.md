# Multi-App Generality Demonstration

**Status: planned; not yet built.**

This document specifies the paper's generality proof: a demonstration that web10
is a *data platform*, not a *social backend*. The claim is that independent
applications, built by different developers, can read and compose the same
user-owned data through the query layer — with no changes to any existing
application and no inter-app API agreement.

## The Thesis

web10-social (Developer A) implements feeds, groups, profiles, and direct
messages. It does not implement games or commerce — and it **need not**. The
platform is the data and access layer; the applications are whoever builds on
top. A game developer (Developer B) can build a snake game and a marketplace
that read the *same* profile documents web10-social wrote — avatars, display
names, walls — without web10-social exposing a "seller profile" endpoint,
without Developer A's consent, and without a single line of web10-social code
changing.

The data is the user's, not the app's. That is the architectural property the
demonstration must make visible.

## Why This Is the Paper's Argument

A per-app backend cannot do this. If Instagram owned your profile, a game
developer could not render your avatar in their leaderboard without an API
deal with Instagram. On web10, the avatar is a document in the user's
namespace, readable through a grant the user gave. Developer B's game reads it
through the same query boundary web10-social uses. Developer A never built an
"embed your avatar" endpoint. Developer A never knew.

The demonstration converts the paper's abstract claim ("a node general enough
to host a messaging app, a music app, or a shop") into a concrete, clickable
artifact: two applications, built by a different developer, consuming the
first application's user data through grants.

## The Three-Part Demonstration

### Part 1 — web10-social (Developer A) — the platform, demonstrated

Already built. 46,285 source lines across 141 files. Feeds, groups, direct
messages, discovery, monetization. The star of the paper. Unchanged by this
work.

- Services: `posts`, `reactions`, `comments`, `profile`,
  `web10-social-group-identity`, `media_metadata`, `settings`, `contacts`,
  `notifications`, `saved`.
- Query shape: reader-scoped. "Show me posts I can read, ranked by
  engagement." Feed-group scope. Content-centric.

This part exists. It is the baseline the other parts read from.

### Part 2 — "Most Popular on web10" (same-domain analytics probe)

A single query over the same services web10-social uses, with different
semantics: an author-level aggregation rather than a reader-scoped feed.

- **Query:** group by author, sum engagement across all readable content,
  rank. "Who is most popular on the platform?"
- **Services:** `posts`, `reactions`, `comments`, `profile` (same as the feed).
- **Query shape:** author-centric, cross-group aggregation. Different join
  shape (group by author, not by post), different projection (author +
  aggregate score, not post + engagement), different scope (platform-wide,
  not feed-group).
- **Proves:** the same data, read with different query semantics, produces a
  different application. The node has no "leaderboard" or "popularity"
  concept. The application wrote the query.

Deliverable: a static page (single HTML + JS file) that authenticates against
the node, issues the query, and renders a ranked list. No node changes. No
new tables. No new endpoints.

### Part 3 — Developer B's applications (cross-domain, cross-developer)

Two small applications, built by a *different developer*, that read
web10-social's `profile` documents and store their own domain data. The
critical property: **web10-social is unchanged.**

#### 3a. Snake (game)

A minimal game (or a high-score form standing in for gameplay) that:

- Stores `high_scores` documents: `{game: "snake", score: 4820, ts: ...}`.
- Reads `profile` documents (avatar, display name) written by web10-social.
- Renders a leaderboard: each player's real web10 avatar, display name,
  score, and a link to their web10-social wall.

The "game" is the excuse for the score. The demonstration is the **join**:
`high_scores` (Developer B's data) joined with `profile` (Developer A's data)
in a single application query. The node has no "game" concept, no "high
score" endpoint, no "social-game" table.

- **Services (new, Developer B's):** `high_scores`.
- **Services (read, Developer A's):** `profile`.
- **Query shape:** cross-domain join. `high_scores` JOIN `profile` ON
  author_key, ranked by score.
- **Proves:** a different developer's application reads another developer's
  application data through the user's grants, with no changes to the first
  application.

#### 3b. Marketplace (commerce)

A minimal marketplace that:

- Stores `listings` documents: `{title, price, seller_key, body: ...}`.
- Reads `profile` documents (avatar, display name) to show seller identity.
- Renders listing pages: product, seller avatar, seller name, "view their
  web10 wall" link.

Buyers and sellers do not recreate profiles. The marketplace does not need
web10-social to expose a "seller profile" API. The seller's avatar and wall
are their own documents, readable through a grant.

- **Services (new, Developer B's or C's):** `listings`.
- **Services (read, Developer A's):** `profile`.
- **Query shape:** cross-domain join. `listings` JOIN `profile` ON
  seller_key = author_key.
- **Proves:** a commerce application reads social application data for
  identity, with no inter-app agreement and no changes to the social app.

## The Combined Query (the strongest single demonstration)

The single query that makes the paper's argument:

```sql
-- "Friends & Scores": people in my group, their latest post, their high score
-- Written by Developer B's game. Reads Developer A's profile and posts.
SELECT
  p.author_key,
  prof.body AS profile,          -- Developer A's data: avatar, name, wall
  latest_post.body AS latest_post,
  hs.body AS high_score          -- Developer B's data: score
FROM high_scores hs
JOIN profile prof ON prof.author_key = hs.author_key
JOIN posts latest_post
  ON latest_post.author_key = hs.author_key
WHERE hs.author_key IN (/* reader's group members */)
ORDER BY hs.body->>'score' DESC
LIMIT 20
```

Every service name resolves through the same boundary CTEs. The reader's
readable-group filter applies to `profile` and `posts` (Developer A's
services). `high_scores` is Developer B's service, readable by the same
reader. The node has no "friends-and-scores" concept. The application wrote
the join across two developers' data.

This is the query that no per-app backend could express: it joins Developer A's
`posts` and `profile` with Developer B's `high_scores` in one statement,
because all three live in the same `documents` table under the same
`(author_key, doc_id)` key, with access enforced by the same boundary.

## What the Node Does NOT Have

For the demonstration to be valid, the node must have **none** of these:

- [ ] No `high_scores` table or endpoint (it's a service in `documents`).
- [ ] No `listings` table or endpoint (it's a service in `documents`).
- [ ] No "leaderboard" endpoint.
- [ ] No "seller profile" endpoint.
- [ ] No "embed avatar" endpoint.
- [ ] No "game" or "marketplace" concept in `api/`.
- [ ] No inter-app API agreement or federation between web10-social and
      Developer B's apps.
- [ ] No changes to web10-social source code.

If any of these exist, the demonstration has leaked app-specific surface into
the node (violating D60) and the generality claim is not earned.

## Seed Data

A seed script creates the cross-domain documents for users who already have
web10-social `profile` documents:

- `high_scores`: ~10 documents, one per active user,
  `{game: "snake", score: <random>, ts: <now>}`.
- `listings`: ~5 documents, `{title, price, seller_key: <existing user>,
  body: <short description>}`.

The profiles, posts, and groups already exist (written by web10-social). The
seed only adds Developer B's domain data. The cross-app read is the point:
the profiles were written by Developer A's app and read by Developer B's.

## Paper Integration

### §3.4 (or new §3.5) — "Multiple Applications, One Data Plane"

Replace the current hand-wave ("a shop could define catalog services") with a
demonstrated multi-app table:

| Application | Developer | Domain | Services (own) | Services (read from other apps) | Query shape | Proves |
|---|---|---|---|---|---|---|
| web10-social | A | social | posts, reactions, comments, profile, ... | — | reader-scoped feed, engagement joins | platform hosts a full social app |
| Most Popular | A | social (analytics) | — | posts, reactions, comments, profile | author-aggregation, cross-group | same data, different query semantics |
| Snake | B | game | high_scores | profile (from web10-social) | cross-domain join, ranked by score | cross-developer read, no app changes |
| Marketplace | B/C | commerce | listings | profile (from web10-social) | cross-domain join, seller identity | cross-developer read, no inter-app API |

The narrative paragraph:

> web10-social (Developer A) implements feeds, groups, and profiles. It does
> not implement games or commerce — and need not. Developer B builds a snake
> game and a marketplace on the same node. The game's leaderboard reads
> `profile` documents (avatar, display name) written by web10-social,
> rendering each player's real avatar and linking to their social wall. The
> marketplace's listing pages read the same `profile` documents to show seller
> identity. Neither application modifies web10-social; neither requires an
> inter-app API agreement; both read through the user's grants and the same
> query boundary. The data outlives and outscopes any single application.

### Title implication

The demonstration supports widening the title from "Social Data Platform" to
"User Data Platform" or "Data Platform": the paper now shows two developers'
applications sharing a data plane, with the user's data as the connective
tissue. The social app is one tenant, not the whole system.

### Abstract / Intro adjustment

The abstract's current last line ("a node general enough to host a messaging
app, a music app, or a shop") becomes *demonstrated* rather than asserted, if
the marketplace and game are built. The intro's "motivating application"
paragraph can note that the platform hosts a second developer's applications
in the evaluation.

## Deliverables and Gates

- [ ] Validate the "Most Popular" leaderboard query against the live node
      (correct rows, correct readable-group filtering, correct deduplication).
- [ ] Build the "Most Popular" static page (single HTML + JS, no build step).
- [ ] Write the seed script for `high_scores` and `listings` documents.
- [ ] Build the Snake static page: high-score form/display + query joining
      `high_scores` with `profile`. Render avatar, name, score, wall link.
- [ ] Build the Marketplace static page: listing display + query joining
      `listings` with `profile`. Render product, seller avatar, name, wall
      link.
- [ ] Validate the combined "Friends & Scores" query against the live node.
- [ ] Confirm the node has none of the "must NOT have" items above (no
      app-specific endpoints, tables, or concepts).
- [ ] Screenshot each page (desktop + 375px mobile) for the paper.
- [ ] Draft the §3.4/§3.5 expansion with the table and narrative paragraph.
- [ ] Link all static pages as paper artifacts (pinned revision, same as all
      other implementation links).
- [ ] Decide title: "Social Data Platform" (honest, narrow) vs. "User Data
      Platform" (backed by the multi-app demonstration).

## Acceptance Bar

- Developer B's applications (Snake, Marketplace) read Developer A's data
  (`profile`, `posts`) with **zero changes** to Developer A's application and
  **no inter-app agreement**.
- The combined query joins services from two different developers in a single
  statement, enforced by the same boundary CTEs.
- The node has no app-specific surface for games, commerce, leaderboards, or
  cross-app identity (D60 compliance).
- The paper's §3.4/§3.5 shows the multi-app table and the narrative paragraph.
- All static pages load against the live node without node-side changes.

## Scope Note

This is a **demonstration of generality**, not a performance comparison. The
game and marketplace are not benchmarked; they are not workloads for E2/E3.
They exist to make the paper's platform claim honest: the node hosts multiple
independent applications, not one. Their smallness is the argument — the less
code Developer B writes, the more the platform carries.

The "TBD" framing is correct and intentional: web10-social does not implement
games or commerce, and the platform does not require it to. The social app's
incompleteness is irrelevant because the platform is the data layer, not the
social app.
