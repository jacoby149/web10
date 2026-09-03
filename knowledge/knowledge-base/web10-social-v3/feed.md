# Your Feed

Your personal feed. Posts from all groups you belong to, except discover.

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

**Your feed is all groups you belong to, except the discover group.** The discover group (`{provider}/groups/web10/discover`) is the public board — it has its own screen. Your feed is personal: followers, communities, close-friends.

```ts
const allGroups = await w.getGroups({ member: 'jacoby149' })
// → [
//    { group_id: '{provider}/groups/web10/discover', ... },
//    { group_id: 'web10.app/groups/jacoby149/followers', ... },
//    { group_id: 'web10.app/groups/jacoby149/close-friends', ... },
//    { group_id: 'web10.app/groups/charlie/st-louis-chess-club', ... },
//    { group_id: 'web10.app/groups/dave/jazz-collectors', ... },
//  ]

const feedGroups = allGroups
  .filter(g => g.group_id !== '{provider}/groups/web10/discover')
  .map(g => g.group_id)

const posts = await w.read('posts', {
  groups: feedGroups,
  $sort: { created_at: -1 },
  $limit: 50,
})
```

Two SDK calls. Get your groups, filter out discover, read across the rest.

**Narrowing to followers only:**

```ts
const followersGroups = allGroups
  .filter(g => g.group_id.endsWith('/followers'))
  .map(g => g.group_id)

const feed = await w.read('posts', {
  groups: followersGroups,
  $sort: { created_at: -1 },
  $limit: 50,
})
```

**Narrowing to a specific group.** Profile pages and group pages:

```ts
// Alice's profile — only her followers group
const profilePosts = await w.read('posts', {
  groups: ['web10.app/groups/alice/followers'],
  $sort: { created_at: -1 },
})

// Chess club page — only that group
const clubPosts = await w.read('posts', {
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
  $sort: { created_at: -1 },
})
```

## The Data Flow

```
User opens /feed
  → w.getGroups({ member: 'jacoby149' })
  → filter out web10/discover
  → w.read('posts', { groups: feedGroups, $sort: { created_at: -1 }, $limit: 50 })
  → parallel: resolve author avatars
  → render
```

## Feed vs Discover

| Your Feed | Discover |
|---|---|
| All groups you belong to, except discover | Only `{provider}/groups/web10/discover` |
| Personal: followers, communities, close-friends | Public board: everything posted to discover |
| Chronological | Chronological or trending |
| Different for every user | Same for every user |

## TODO

- [ ] Follow list caching — app maintains list of followed users for faster queries
- [ ] Mute feature — per-author exclusion
- [ ] "See post" from feed → post detail screen
- [ ] Infinite scroll — keyset pagination on created_at
- [ ] WebSocket push — new posts from groups arrive in real-time

## Proof

Your feed is two SDK calls. Get groups, filter out discover, read across the rest. No feed table. No fan-out on write. No "compute feed" job. The groups define what's in your feed. The protocol handles it.