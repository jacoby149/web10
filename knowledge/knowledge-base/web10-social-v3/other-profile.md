# Other Person's Profile

You visit someone else's profile. You see what's visible to you — groups you share, posts in those groups.

## What the Screen Shows

```
[avatar] alice
         bio text here

Public groups:
[web10.app/groups/alice/public]     [open] — 50 posts
[web10.app/groups/alice/followers]  [request] — "Follow" button

Posts you can see:
post 1 | 2h ago | [like] [comment]
post 2 | 1d ago | [like] [comment]
```

## Protocol Mapping

**Avatar and bio:** Same as your profile.

```ts
const profile = await w.read('profile', { groups: ['me'], username: 'alice' })
// → { avatar: { type: 'minio', ... }, bio: { type: 'text', ... } }
```

**Public groups:** Groups where join_policy is "open" or you're a member.

```ts
const allGroups = await w.getGroups({ member: 'jacoby149' })
const aliceGroups = allGroups.filter(g => g.group_id.startsWith('web10.app/groups/alice/'))
```

**"Follow" button:** Check if you're in `web10.app/groups/alice/followers`.

```ts
const groups = await w.getGroups({ member: 'jacoby149' })
const following = groups.some(g => g.group_id === 'web10.app/groups/alice/followers')
// following → show "Following" + "Unfollow"
// !following → show "Follow"
```

**Posts you can see:** Read documents filtered by groups you share with alice.

```ts
const posts = await w.read('posts', {
  groups: ['web10.app/groups/alice/followers', 'web10.app/groups/alice/public'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

If you're only in `web10.app/groups/alice/public`, you see posts attached to that group. If you're also in `web10.app/groups/alice/close-friends`, you see those too. The groups control visibility.

**Post counts per group:** Aggregate documents by group.

```ts
const counts = await w.aggregate('posts', [
  { $match: { author: 'alice' } },
  { $group: { _id: '$group_id', count: { $sum: 1 } } },
])
```

## The Data Flow

The visitor's profile **paints on the ONE read** (3.223.0 — the same model the
Video wall 3.219.1, Shorts wall 3.220.0, and Watch page 3.221.0 got): the first
paint is one round-trip, and the non-critical reads (the Saved-tab collections,
the follower / following counts) land in the background and patch in. The posts
are read through the D73 query engine (`readUserPublicProfile`) — the author's
public posts, scoped to `[followers, discover]`, with the media resolved inline
+ the face URLs (avatar / banner) minted by the prepare pass. The grid's media
map is built synchronously from those inline refs — no second media round-trip
holds the first paint.

```
User opens /alice
  → Promise.all([ readUserProfile, readFollow, readUserPublicProfile ])
  → build the media map from the posts' inline refs + the face URLs (synchronous)
  → PAINT (banner, avatar, name, bio, follow, the grid with thumbnails) — one round-trip
  → background (patches in, never blocks the paint):
      readUserPublicCollections (the Saved tab) + countFollowers + countUserFollowingReal
```

**The wall pages** (3.223.0, the feed-paging lane): `readUserPublicProfile`
takes an `offset` (the D73 query applies `LIMIT … OFFSET`); a sentinel
(`profile-wall-sentinel`, `IntersectionObserver` `rootMargin: 200px`) appends
the next page (offset +50, deduped by id, the page's inline media merged into
the map); `hasMore` keys off the page size (`page.length >= 50`). The visitor's
face is re-merged from a ref on each page (the face query is `LIMIT 1` — only
page one carries it).

## The Follow Flow

```ts
// Open join policy — instant follow
await w.joinGroup('web10.app/groups/alice/followers')
// → { group_id: 'web10.app/groups/alice/followers', member_key: 'jacoby149', role: 'member' }

// Request join policy — pending until owner approves
await w.requestJoin('web10.app/groups/alice/followers')
// → { group_id: 'web10.app/groups/alice/followers', status: 'pending' }
// → alice gets a notification
// → alice approves → jacoby149 is now a member
```

No follows table. Group join or join request. Done.

## TODO

- [ ] Follow/unfollow button state — check group membership, toggle join request
- [ ] Group visibility filter — only show groups the viewer has access to
- [ ] Post count per group — aggregation query
- [ ] "Private group" indicator — show "X posts, request to join" for non-member groups
- [ ] Block button — `w.blockUser('alice')`

## Proof

Another person's profile is the same protocol as your own — just filtered by group membership. The groups control what you see. No "public" endpoint. No "private" endpoint. One SDK call with group filters. The protocol handles it.