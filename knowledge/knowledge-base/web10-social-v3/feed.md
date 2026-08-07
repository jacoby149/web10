# Your Feed

Your personal feed. Posts from all groups you belong to, minus the public board.

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

**Your feed is all groups you belong to, minus the discover group.** The discover group (`web10.app/groups/web10/discover`) is the public board — it has its own screen. Your feed is personal: followers, communities, close-friends.

```ts
const groups = await getGroups({ member: 'jacoby149' });
// → [web10.app/groups/web10/discover,
//    web10.app/groups/jacoby149/followers,
//    web10.app/groups/jacoby149/close-friends,
//    web10.app/groups/charlie/st-louis-chess-club,
//    web10.app/groups/dave/jazz-collectors, ...]

const feedGroups = groups.filter(g => g !== 'web10.app/groups/web10/discover');

const posts = await getDocuments({ groups: feedGroups, sort: 'newest', limit: 50 });
```

One SDK call. All your groups. Public board excluded.

**Narrowing to followers only.** The app can filter to just followers groups:
```ts
const followersGroups = groups.filter(g => g.endsWith('/followers'));
const feed = await getDocuments({ groups: followersGroups, sort: 'newest', limit: 50 });
```

**Narrowing to a specific group.** This is how profile pages and group pages work:
```ts
// Alice's profile — only her followers group
const profilePosts = await getDocuments({ groups: ['web10.app/groups/alice/followers'], sort: 'newest' });

// Chess club page — only that group
const clubPosts = await getDocuments({ groups: ['web10.app/groups/charlie/st-louis-chess-club'], sort: 'newest' });
```

Same SDK call. Different groups.

## The Data Flow

```
User opens /feed
  → getGroups({ member: 'jacoby149' })
  → filter out web10/discover
  → getDocuments({ groups: feedGroups, sort: 'newest', limit: 50 })
  → parallel: resolve author avatars
  → render
```

## Feed vs Discover

| Your Feed | Discover |
|---|---|
| All groups you belong to, minus discover | Only `web10.app/groups/web10/discover` |
| Personal: followers, communities, close-friends | Public board: everything posted to discover |
| Chronological | Chronological or trending |
| Excludes discover group | Is the discover group |

Same SDK call. Different groups. Your feed is personal. Discover is public.

## TODO

- [ ] Follow list caching — app maintains list of followed users for faster queries
- [ ] Mute feature — per-author exclusion
- [ ] "See post" from feed → post detail screen
- [ ] Infinite scroll — keyset pagination on created_at
- [ ] WebSocket push — new posts from groups arrive in real-time

## Proof

Your feed is one SDK call with a list of groups. No feed table. No fan-out on write. No "compute feed" job. The groups define what's in your feed. The protocol handles it.