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

```
User opens /alice
  → w.read('profile', { groups: ['me'], username: 'alice' })  (avatar, bio)
  → w.getGroups({ member: 'jacoby149' })                      (groups you belong to)
  → w.read('posts', { groups: [...], $sort: { created_at: -1 } })  (posts in shared groups)
  → render
```

Same three-call pattern. The groups filter what's visible. No special permissions. No "public" flag on posts — the group membership is the permission.

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