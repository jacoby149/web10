# Public Discover

The discover page. Posts from all groups you're a member of, sorted by time or engagement.

## What the Screen Shows

```
Discover
─────────────────────
[jacoby149] posted 2h ago
   "just shipped the new groups feature"
   [📷 attachment]
   [❤️ 42] [💬 8]

[alice] posted 3h ago
   "this album is fire"
   [🎵 attachment]
   [❤️ 15] [💬 3]

[bob] posted 5h ago
   "behind the scenes"
   [📷 attachment]
   [❤️ 120] [💬 24]
```

## Protocol Mapping

**Discover query:** Read across all groups the user belongs to.

```ts
const posts = await w.read('posts', {
  groups: [
    'web10.app/groups/web10/discover',
    'web10.app/groups/jacoby149/followers',
    'web10.app/groups/charlie/st-louis-chess-club',
    'web10.app/groups/dave/jazz-collectors',
  ],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

One SDK call. All groups. Filtered by membership. Blacklisted authors excluded automatically.

**Sorted by engagement:** Use aggregate to count reactions per post.

```ts
const trending = await w.aggregate('posts', [
  { $match: { groups: 'web10.app/groups/web10/discover' } },
  { $countReactions: '$doc_id' },
  { $sort: { reaction_count: -1, created_at: -1 } },
  { $limit: 50 },
])
```

Subquery on documents table. No dedicated reactions table. The `ref` type links reactions to their target.

**Group label:** The API returns the group_id on each document. Resolve to group name by fetching group metadata.

```ts
const groups = await w.getGroups({ member: 'jacoby149' })
// → [{ group_id, name, ... }, ...]
```

## The Data Flow

```
User opens /discover
  → w.read('posts', { groups: [...], $sort: { created_at: -1 }, $limit: 50 })
  → parallel: resolve author avatars
  → parallel: resolve group names
  → render
```

One heavy SDK call. Parallel lookups for avatars and group names. Cache avatars in Redis.

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
- [ ] Group name caching — Redis, TTL 1h (groups don't change often)
- [ ] Engagement counter table — `post_engagement(doc_id, reaction_count, comment_count)`
- [ ] Filter by group — `?group=web10.app/groups/dave/jazz-collectors` to narrow discover

## Proof

Discover is one SDK call. One table. Group membership is the filter. Engagement is a count of documents with refs. No dedicated reactions table. No discovery index. No mirrors. The protocol handles it.