# Your Profile

You visit your own profile. You see your avatar, bio, groups, and posts.

## What the Screen Shows

```
[avatar] jacoby149
         bio text here

Groups:    Posts:    Followers:
3          42        1,203

[web10.app/groups/jacoby149/public]     [open]
[web10.app/groups/jacoby149/close-friends] [invite only]
[web10.app/groups/dave/jazz-collectors]        [request]

--- posts ---
post 1 | 2h ago | [like] [comment]
post 2 | 1d ago | [like] [comment]
```

## Protocol Mapping

**Avatar and bio:** A post in `jacoby149.profile`.
```
GET /jacoby149/profile
→ { "avatar": {"type": "minio", "value": "jacoby149/avatar.png"}, "bio": {"type": "text", "value": "builder"} }
```
API converts minio to presigned URL. One CRUD call.

**Groups you belong to:** Group membership query.
```
GET /groups?member=jacoby149
→ [web10.app/groups/jacoby149/public, web10.app/groups/jacoby149/close-friends, web10.app/groups/dave/jazz-collectors]
```
For each group, fetch metadata from `group_contracts`.

**Groups you admin:** Filter by owner role.
```
SELECT gm.group_id, gc.name, gc.join_policy
FROM group_members gm
JOIN group_contracts gc ON gm.group_id = gc.group_id
WHERE gm.member_key = 'jacoby149'
  AND gm.role = 'owner'
  AND gm.deleted = 0
  AND gc.deleted = 0;
```

**Follower count:** Group membership count.
```
SELECT count() FROM group_members
WHERE group_id = 'web10.app/groups/jacoby149/followers' AND deleted = 0;
```

**Your posts:** CRUD discover.
```
GET /jacoby149/posts?discover=true&author=jacoby149
→ posts in groups jacoby149 belongs to (all of them — you're the author)
```
Or simpler: `GET /jacoby149/posts` (no discover flag — you see your own posts regardless of groups).

## The Data Flow

```
User opens /jacoby149
  → GET /jacoby149/profile          (avatar, bio)
  → GET /groups?member=jacoby149   (groups list)
  → GET /jacoby149/posts           (your posts)
  → parallel: group metadata for each group
  → parallel: follower count
  → render
```

Four parallel calls. No joins. No mirrors.

## TODO

- [ ] Avatar upload flow — presigned MinIO PUT, then write profile post with minio ref
- [ ] Bio edit — update profile post (ReplacingMergeTree, higher updated_at)
- [ ] Group join policy display — fetch from group_contracts
- [ ] Post list pagination — LIMIT/OFFSET or keyset pagination on created_at
- [ ] Follower count caching — Redis counter, increment/decrement on group membership change

## Proof

Your profile is one collection, one groups query, and some counts. No dedicated profile endpoint. No user table. No followers table. The protocol handles it.
