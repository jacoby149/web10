# Public Discover

The discover page. Posts from all groups you're a member of, sorted by time or engagement.

## What the Screen Shows

```
Discover
─────────────────────
[jacoby149] posted 2h ago in [web10-dev]
  "just shipped the new groups feature"
  [❤️ 42] [💬 8]

[alice] posted 3h ago in [jazz-collectors]
  "this album is fire"
  [🎵 attachment]
  [❤️ 15] [💬 3]

[bob] posted 5h ago in [alice.followers]
  "behind the scenes"
  [❤️ 120] [💬 24]
```

## Protocol Mapping

**Discover query:** The same query from overview.md, but broader — all groups, not one.
```sql
SELECT p.post_id, p.author_key, p.body, p.tags, p.created_at,
       pg.group_id
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.discoverable = 1
  AND gm.member_key = 'jacoby149'
  AND gm.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM user_blacklist
    WHERE user_key = p.author_key AND blocked_key = 'jacoby149'
  )
ORDER BY p.created_at DESC
LIMIT 50;
```

One query. All groups. Filtered by membership. Blacklisted authors excluded.

**Sorted by engagement:** Count reactions (posts with ref type pointing to this post).
```sql
SELECT p.post_id, p.author_key, p.body, p.created_at,
       (SELECT count() FROM posts r
        WHERE r.deleted = 0
          AND r.collection_name = 'reactions'
          AND hasToken(r.body, p.post_id)
       ) AS reaction_count
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.discoverable = 1
  AND gm.member_key = 'jacoby149'
  AND gm.deleted = 0
ORDER BY reaction_count DESC, p.created_at DESC
LIMIT 50;
```

Subquery on posts table. No dedicated reactions table. The `hasToken` function scans the JSON body for the ref value.

**Group label:** The `post_groups` join returns the group_id. Resolve to group name from `group_contracts`.

## The Data Flow

```
User opens /discover
  → GET /discover?sort=newest    (or ?sort=trending)
  → ClickHouse: discover query with group membership filter
  → parallel: resolve author avatars (GET /{author}/profile for each unique author)
  → parallel: resolve group names (batch query group_contracts)
  → render
```

One heavy query. Parallel lookups for avatars and group names. Cache avatars in Redis.

## Engagement Count Optimization

The subquery on every row is expensive. Options:
1. **Redis cache** — on reaction write, increment `post:{post_id}:reactions` counter. Read from Redis, fallback to query.
2. **ClickHouse JSON path index** — index the `ref` field in the body JSON for faster `hasToken` lookups.
3. **Aggregation table** — a lightweight table that the API writes to on reaction insert: `post_engagement(post_id, count)`. Not a materialized view — just a counter the API maintains.

Option 3 is simplest. The API already knows about the write. Increment a counter. No materialized view needed.

## TODO

- [ ] Sort toggle — newest vs. trending
- [ ] Pagination — keyset on created_at (cursor-based, not OFFSET)
- [ ] Author avatar caching — Redis, TTL 5m
- [ ] Group name caching — Redis, TTL 1h (groups don't change often)
- [ ] Engagement counter table — `post_engagement(post_id, reaction_count, comment_count)`
- [ ] Filter by group — `?group=jazz-collectors` to narrow discover

## Proof

Discover is one query. One table. Group membership is the filter. Engagement is a count of posts with refs. No dedicated reactions table. No discovery index. No mirrors. The protocol handles it.
