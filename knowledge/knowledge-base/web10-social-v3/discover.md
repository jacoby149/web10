# Public Discover

The public board. Everything posted to the discover group, sorted by time or engagement. Same for every user.

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
  groups: ['web10.app/groups/web10/discover'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

One SDK call. One group. No personalization. `web10/discover` is an open group with auto-enrollment — every user (including anon) is a member. Anyone can read. The author chooses to attach to it for public visibility.

**Sorted by engagement (trending):**

```ts
const trending = await w.aggregate('posts', [
  { $match: { groups: 'web10.app/groups/web10/discover' } },
  { $countReactions: '$doc_id' },
  { $sort: { reaction_count: -1, created_at: -1 } },
  { $limit: 50 },
])
```

## The Data Flow

```
User opens /discover
  → w.read('posts', { groups: ['web10.app/groups/web10/discover'], $sort: { created_at: -1 }, $limit: 50 })
  → parallel: resolve author avatars
  → render
```

One SDK call. Parallel avatar lookups. Cache avatars in Redis.

## Discover vs Feed

| Discover | Feed |
|---|---|
| Only `web10.app/groups/web10/discover` | All groups you belong to, minus discover |
| Same for every user | Personal — followers, communities, close-friends |
| Public board | Personal feed |

## Engagement Count Optimization

The subquery on every row is expensive. Options:
1. **Redis cache** — on reaction write, increment `post:{doc_id}:reactions` counter. Read from Redis, fallback to query.
2. **ClickHouse JSON path index** — index the `ref` field in the body JSON for faster lookups.
3. **Aggregation table** — a lightweight table that the API writes to on reaction insert: `post_engagement(doc_id, count)`. Not a materialized view — just a counter the API maintains.

Option 3 is simplest. The API already knows about the write. Increment a counter. No materialized view needed.

## TODO

- [ ] Sort toggle — newest vs. trending
- [ ] Pagination — keyset on created_at (cursor-based, not OFFSET)
- [ ] Author avatar caching — Redis, TTL 5m
- [ ] Engagement counter table — `post_engagement(doc_id, reaction_count, comment_count)`

## Proof

Discover is one SDK call to one group. Same for everyone. No personalization. No discovery index. No mirrors. The protocol handles it.