# Public Discover

The public board. Everything posted to the discover group, sorted by time or
engagement. Same for every user.

## The Discover Group is a Node Default

`{provider}/groups/web10/discover` is a **node default**, not an app-created
group. The id is provider-derived — `{provider}` is the node's configured
`PROVIDER` (its API host), so each node's board has a unique global id. The
node creates it at boot (`ensure_discover_group()`, idempotent):
every user — including `anon` — is a member by default (auto-enroll at
signup, backfill for pre-existing accounts). A post is public when its author
attaches it to the group; membership is universal, discoverability is
per-post.

**Discovery IS a group read.** There is no separate discover endpoint (the v2
`/discover/posts` board endpoint is gone). The board is just the discover
group in the `groups` list, read through the normal read path. It is
anon-readable: a token-less read runs as the node's `anon` member, so the
marketing trending page and any public surface read the board without a
token. Anon's access stays bounded by group membership (I3) — it can only
read groups it is a member of (the discover group).

## What the Screen Shows
```
Discover
─────────────────────
[bob] posted 5h ago
   "behind the scenes"
   [📷 attachment]
   [❤️ 120] [💬 24]

[jacoby149] posted 2h ago
   "just shipped the new groups feature"
   [📷 attachment]
   [❤️ 42] [💬 8]

[alice] posted 3h ago
   "this album is fire"
   [🎵 attachment]
   [❤️ 15] [💬 3]
```

## Protocol Mapping

**Discover query:** One group. Same for everyone.

```ts
const posts = await w.read('posts', {
  groups: ['{provider}/groups/web10/discover'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

One SDK call. One group. No personalization. `web10/discover` is the node-default public board — every user (including anon) is a member, so anyone can read it. A token-less read runs as `anon` (the public surface); a signed-in user reads as themselves. The author chooses to attach to it for public visibility.

**Sorted by engagement (trending):**

```ts
const trending = await w.aggregate('posts', [
  { $match: { groups: '{provider}/groups/web10/discover' } },
  { $countReactions: '$doc_id' },
  { $sort: { reaction_count: -1, created_at: -1 } },
  { $limit: 50 },
])
```

## The Data Flow

```
User opens /discover
  → w.read('posts', { groups: ['{provider}/groups/web10/discover'], $sort: { created_at: -1 }, $limit: 50 })
  → parallel: resolve author avatars
  → render
```

One SDK call. Parallel avatar lookups. Cache avatars in Redis.

## Discover vs Feed

| Discover | Feed |
|---|---|
| Only `{provider}/groups/web10/discover` | All groups you belong to, minus discover |
| Same for every user | Personal — followers, communities, close-friends |
| Public board | Personal feed |

## Engagement Count Optimization

The subquery on every row is expensive. Options:
1. **Redis cache** — on reaction write, increment `post:{doc_id}:reactions` counter. Read from Redis, fallback to query.
2. **ClickHouse JSON path index** — index the `ref` field in the body JSON for faster lookups.
3. **Aggregation table** — a lightweight table that the API writes to on reaction insert: `post_engagement(doc_id, count)`. Not a materialized view — just a counter the API maintains.
4. **SQL aggregation join (no table)** — the ranking query LEFT JOINs one grouped scan of the reactions + comments collections (`SELECT ref_value, count() … GROUP BY ref_value`), computes the power-mean score in SQL, and pages in the DB. Exact, no maintained state.

**What shipped (v1, 3.18.3): option 4.** The operator picked it over the counter table — "this is clickhouse." It is exact (no staleness), race-free (a read-modify-write counter is not atomic in ClickHouse → lost updates), needs no backfill, and touches no write path — and it matches the house's own 3.15.0 "metric-as-query, no maintained counters" precedent. The cost is a read-time grouped scan of the reactions + comments collections; for board scale that is cheap. **The counter table (option 3) is the v2 trigger** — adopt it only if the board grows large enough that the read-time scan actually hurts.

## TODO

- [ ] Sort toggle — newest vs. trending
- [ ] Pagination — keyset on created_at (cursor-based, not OFFSET)
- [ ] Author avatar caching — Redis, TTL 5m
- [ ] (v2 trigger) Engagement counter table — `post_engagement(doc_id, reaction_count, comment_count)` — only if the board outgrows the read-time aggregation scan

## Proof

Discover is one SDK call to one group. Same for everyone. No personalization. No discovery index. No mirrors. The protocol handles it.