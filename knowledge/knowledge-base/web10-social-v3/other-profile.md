# Other Person's Profile

You visit someone else's profile. You see what's visible to you — groups you share, posts in those groups.

## What the Screen Shows

```
[avatar] alice
         bio text here

Public groups:
[alice.public]     [open] — 50 posts
[alice.followers]  [request] — "Follow" button

Posts you can see:
post 1 | 2h ago | [like] [comment]
post 2 | 1d ago | [like] [comment]
```

## Protocol Mapping

**Avatar and bio:** Same as your profile.
```
GET /alice/profile
→ { "avatar": {"type": "minio", ...}, "bio": {"type": "text", ...} }
```

**Public groups:** Groups where join_policy is "open" or you're a member.
```
SELECT gc.group_id, gc.name, gc.join_policy
FROM group_contracts gc
WHERE gc.admin_key = 'alice'
  AND gc.deleted = 0
  AND (gc.join_policy = 'open'
       OR EXISTS (
         SELECT 1 FROM group_members gm
         WHERE gm.group_id = gc.group_id
           AND gm.member_key = 'jacoby149'
           AND gm.deleted = 0
       ));
```

**"Follow" button:** Check if you're in `alice.followers`.
```
SELECT 1 FROM group_members
WHERE group_id = 'alice.followers'
  AND member_key = 'jacoby149'
  AND deleted = 0;
```
No row → show "Follow". Row exists → show "Following" + "Unfollow".

**Posts you can see:** Discover query with group membership filter.
```
GET /alice/posts?discover=true
→ ClickHouse: posts WHERE author=alice AND post in groups jacoby149 belongs to
```
If you're only in `alice.public`, you see posts attached to `alice.public`. If you're also in `alice.close-friends`, you see those too. The groups control visibility.

**Post counts per group:**
```
SELECT pg.group_id, count(DISTINCT p.post_id)
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
WHERE p.author_key = 'alice'
  AND p.deleted = 0
  AND pg.deleted = 0
GROUP BY pg.group_id;
```

## The Data Flow

```
User opens /alice
  → GET /alice/profile                  (avatar, bio)
  → query: alice's public/member groups (group_contracts + group_members)
  → query: follow status                (group_members)
  → GET /alice/posts?discover=true      (posts in shared groups)
  → render
```

Same four-call pattern. The groups filter what's visible. No special permissions. No "public" flag on posts — the group membership is the permission.

## The Follow Flow

```
User taps "Follow" on alice's profile
  → POST /groups/alice.followers/join-requests
     { "requester": "jacoby149", "status": "pending" }
  → INSERT INTO group_join_requests
  → alice gets a notification
  → alice approves → INSERT INTO group_members
  → jacoby149 can now see posts in alice.followers
```

No follows table. Group join request + group membership. Done.

## TODO

- [ ] Follow/unfollow button state — check group membership, toggle join request
- [ ] Group visibility filter — only show groups the viewer has access to
- [ ] Post count per group — aggregation query
- [ ] "Private group" indicator — show "X posts, request to join" for non-member groups
- [ ] Block button — INSERT INTO user_blacklist

## Proof

Another person's profile is the same protocol as your own — just filtered by group membership. The groups control what you see. No "public" endpoint. No "private" endpoint. One discover query with a group filter. The protocol handles it.
