# Your Profile

You visit your own profile. You see your avatar, bio, groups, and posts.

## What the Screen Shows

```
[avatar] jacoby149
         bio text here

Groups:    Posts:    Followers:
3          42        1,203

[jacoby149.public]     [open]
[jacoby149.close-friends] [invite only]
[jazz-collectors]        [request]

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
→ [jacoby1449.public, jacoby149.close-friends, jazz-collectors]
```
For each group, fetch metadata from `group_contracts`.

**Groups you admin:** Filter by admin key.
```
SELECT group_id, name, join_policy FROM group_contracts
WHERE admin_key = 'jacoby149' AND deleted = 0;
```

**Follower count:** Group membership count.
```
SELECT count() FROM group_members
WHERE group_id = 'jacoby149.followers' AND deleted = 0;
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
