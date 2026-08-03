# Your Feed

Your personal feed. Posts from people you follow, sorted chronologically.

## What the Screen Shows

```
Feed
─────────────────────
[alice] posted 1h ago
  "morning coffee run"
  [📷 attachment]
  [❤️ 12] [💬 2]

[bob] posted 3h ago
  "working on something cool"
  [❤️ 5] [💬 0]
```

## Protocol Mapping

**The feed is discover filtered to your followers groups.** You follow people → you're a member of their `username.followers` groups → their posts attached to that group appear in your feed.

```sql
SELECT p.post_id, p.author_key, p.body, p.created_at
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.discoverable = 1
  AND gm.member_key = 'jacoby149'
  AND gm.deleted = 0
  AND pg.group_id LIKE '%.followers'    -- only followers groups, not jazz-collectors
  AND NOT EXISTS (
    SELECT 1 FROM user_blacklist
    WHERE user_key = p.author_key AND blocked_key = 'jacoby149'
  )
ORDER BY p.created_at DESC
LIMIT 50;
```

The `LIKE '%.followers'` filter narrows to follow relationships. Your feed is discover with a group filter. Same query, different scope.

**Alternative:** The app tracks which users you follow in a local list. Build the group_ids explicitly:
```sql
-- jacoby149 follows alice, bob, charlie
WHERE pg.group_id IN ('alice.followers', 'bob.followers', 'charlie.followers')
```
Faster than LIKE. The app maintains the follow list as a convenience.

## The Data Flow

```
User opens /feed
  → GET /feed
  → ClickHouse: discover query filtered to *.followers groups
  → parallel: resolve author avatars
  → render
```

Same discover query, narrower filter. The protocol doesn't need a "feed" concept — it's discover with a group filter.

## Feed vs Discover

| Feed | Discover |
|---|---|
| `*.followers` groups only | All groups you're a member of |
| Chronological | Chronological or trending |
| People you follow | All shared content |
| Personal | Broad |

Same query. Different WHERE clause. The groups define the difference.

## TODO

- [ ] Follow list caching — app maintains list of followed users for faster queries
- [ ] Mute feature — per-author exclusion (extend user_blacklist or add mute table)
- [ ] "See post" from feed → post detail screen (ref to post-detail.md)
- [ ] Infinite scroll — keyset pagination on created_at
- [ ] WebSocket push — new posts from followed users arrive in real-time (see real-time-feeds.md)

## Proof

Your feed is a discover query with a group filter. No feed table. No fan-out on write. No "compute feed" job. One query at read time. The groups define what's in your feed. The protocol handles it.
