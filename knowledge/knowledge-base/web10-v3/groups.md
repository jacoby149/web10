# Groups: Policy Containers

Groups are not data containers. They are policy containers — they define who gets what access to content that lives elsewhere.

## What Groups Are

A group is a named membership list with a policy. It doesn't hold posts, files, or playlists. It holds people. When you attach a document to a group, the group's policy decides who can see it.

```
Group "alice.close-friends":
  admin: alice
  members: bob, charlie, dave
  policy: members get read, admins get write
```

That's it. No data. Just who's in it and what they can do.

## What Groups Are Not

Groups are not collections. A collection holds data. A group holds permissions. A post lives in Alice's collection but can be attached to a group so Bob can read it.

Groups are not restrictions. They are grants. A collection's service contract says who can access it by default. Attaching to a group *widens* that access to group members.

## Two Contract Types

v3 has two contract types. They do different things:

**Service contract** — on a service (collection). Restricts access.
```
alice.posts:
  allow: user:alice
  allow: app:blog
```

**Group contract** — manages a membership list. Grants access when referenced.
```
alice.close-friends:
  admin: alice
  members: bob, charlie, dave
```

The service contract is the floor. The group contract widens the boundary. A post in `alice.posts` attached to `alice.close-friends` is readable by alice (service contract) plus bob, charlie, dave (group grant).

## Posting to Groups

When you create a post, you pick the groups it belongs to. Those groups already define who sees it.

```ts
await createPost({
  text: "behind the scenes",
  groups: ["alice.close-friends"]
});
```

Bob sees it because he's a member. Eve doesn't. No visibility column needed — the groups *are* the visibility.

A post can belong to multiple groups:
```ts
await createPost({
  text: "team update",
  groups: ["alice.close-friends", "web10-dev"]
});
```

Anyone in either group can read it. Union of members.

## The Data Model

Two tables. One for groups, one for membership.

```sql
CREATE TABLE groups (
    group_id String,
    name String,
    admin_key String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY group_id;

CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,               -- 'admin', 'member'
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);
```

Posts reference groups:
```sql
CREATE TABLE post_groups (
    post_id String,
    group_id String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (post_id, group_id);
```

## Discover Query

Discover returns posts the user can see through any group membership:

```sql
SELECT p.* FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND gm.member_key = 'bob'
  AND gm.deleted = 0
ORDER BY p.created_at DESC;
```

Bob sees every post attached to a group he belongs to.

## Cross-App Identity

Groups carry across apps. The same membership works everywhere:

```
alice.close-friends:
  members: bob, charlie

Social app → bob sees alice's posts in this group
Music app  → bob sees alice's playlists in this group
Doc app    → bob sees alice's files in this group
```

One membership. Infinite apps. The group is managed once, at the platform level. Every app can scope content to it.

## The User Panel

The privacy panel has two views:

**Service contracts** — your data, who can read each service by default.
```
alice.posts      → user:alice, app:blog
alice.private    → user:alice (only you)
```

**Group contracts** — your circles, who's in each one.
```
alice.close-friends → admin: you, members: bob, charlie, dave
jazz-collectors     → admin: dave, members: alice, dave, eve
```

When you remove someone from a group, they instantly lose access to every document attached to that group. Atomic. One place to manage it.

## Follows as Groups

Follows are groups. `alice.followers` is a group where Alice is the admin. Bob requests to join → Alice approves → Bob is a member → Bob sees posts attached to that group.

```ts
await followUser('alice');        // request to join alice.followers
await approveFollower('bob');     // approve bob into alice.followers
await unfollow('alice');          // leave alice.followers
```

No separate follows table needed. Groups handle it.

## Why Groups Replace Collections-as-Permissions

v2 uses collections as permissions — `public_posts` is readable by everyone, `private_posts` is readable by the owner. The problem: you can't have a middle ground. No "followers only." No "these three people." No "this community."

Groups solve it. One collection. Many groups. Any combination of access.

```
alice.posts collection:
  service contract: user:alice (private by default)

Groups that widen access:
  alice.public       → open join, anyone can read posts attached to it
  alice.followers    → request to join, followers can read posts attached to it
  alice.close-friends → invite only, close friends can read posts attached to it
```

A post attached to `alice.public` is public. A post attached to `alice.close-friends` is private to that circle. Same collection. Different groups.

## Summary

Groups are policy containers. They don't hold data — they hold people and permissions. Any document from any service can be attached to any group. The group's policy decides who sees it. Groups carry across apps. One membership. Infinite apps. Two contract types: service contracts restrict, group contracts grant. Together they define access.