# Groups: A Platform Primitive

## The Idea

Groups are not just a visibility type. They are a fundamental platform feature. Users create groups, add members, manage roles, and post to them. Groups are the building block for communities, teams, and circles.

Groups are policy containers. They hold people, not data. Any document from any service can be attached to any group. The group's roles define who sees it and what they can do.

## The Schema

```sql
CREATE TABLE group_contracts (
    group_id String,           -- 'web10.app/groups/jacoby149/abacus-enthusiasts'
    roles String,              -- JSON array of roles with services + permissions
    join_policy String,        -- 'open', 'request', 'invite_only'
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY group_id;

CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,               -- role name from the contract (e.g. 'member', 'owner')
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);
```

No `admin_key` in the groups table. The owner is the member with the `owner` role. The contract defines what `owner` means.

## The API

```
# Group CRUD
POST   /groups                          → create a group
GET    /groups/{id}                     → get a group
PATCH  /groups/{id}                     → update a group (roles, join policy)
DELETE /groups/{id}                     → delete a group (tombstone)

# Membership
POST   /groups/{id}/members             → add a member
GET    /groups/{id}/members             → list members
PATCH  /groups/{id}/members/{user}      → update role
DELETE /groups/{id}/members/{user}      → remove a member

# Posts to a group
POST   /{user}/posts                    → create a post
   { text: "hello", groups: ["grp-abc"] }
GET    /{user}/posts?discover=true      → discover posts (group membership filter)
```

## Creating a Group

```ts
const group = await createGroup({
  name: "Web10 Dev Team",
  join_policy: "invite_only",
  roles: [
    {
      name: "owner",
      services: ["*"],
      permissions: ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
    },
    {
      name: "member",
      services: ["posts", "comments"],
      permissions: ["readAll", "create", "updateOwn", "deleteOwn"]
    }
  ]
});
// Returns: { group_id: "grp-abc", name: "Web10 Dev Team" }
```

The creator is the owner. The owner can add members and assign roles.

## Adding Members

```ts
await addMember({
  group_id: "grp-abc",
  member_key: "bob",
  role: "member"
});
```

The member receives a notification. They can see posts in the group on discover. They can post to the group if their role allows it.

## Posting to a Group

```ts
await createDocument({
  text: "team update: v3 architecture locked",
  groups: ["grp-abc"]
});
```

The post is visible to all group members on `discover=true`. It is not visible to non-members. The author controls which groups the post is attached to.

## Group Discovery Query

When Alice hits discover, group posts are included if she's a member:

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND gm.member_key = 'alice'
  AND gm.deleted = 0
ORDER BY p.created_at DESC
LIMIT 50;
```

No visibility column. No collection ceiling. Just group membership.

## Group Permissions

| Action | Who Can Do It |
|---|---|
| Create group | Any user |
| Add member | Owner or member with `assignRoles` |
| Remove member | Owner or member with `revokeRoles` |
| Update role | Owner or member with `assignRoles` |
| Delete group | Owner (member with `deleteGroup`) |
| Post to group | Any member with `create` on the service |
| See group posts | Any member with `readAll` on the service |

## Group Settings

Groups control membership through join policies:

```json
{
  "group_id": "grp-abc",
  "join_policy": "invite_only",
  "roles": [
    { "name": "owner", "services": ["*"], "permissions": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"] },
    { "name": "member", "services": ["posts", "comments"], "permissions": ["readAll", "create", "updateOwn", "deleteOwn"] }
  ]
}
```

- `join_policy: "open"` — anyone can join instantly
- `join_policy: "request"` — members request to join, owner approves
- `join_policy: "invite_only"` — only the owner can add members

## Why Groups Are Fundamental

Groups are not a feature. They are the building block for:

- **Teams** — internal collaboration, project discussions
- **Communities** — interest-based groups, hobby circles
- **Circles** — close friends, family, trusted contacts
- **Audiences** — followers, newsletter subscribers, beta testers
- **Moderation** — owner-controlled spaces with roles

Groups replace the need for separate collection types. Instead of `public_posts`, `private_posts`, `group-posts`, the user creates groups and posts to them. The visibility is per-group. The membership is managed by the platform.

## The Authenticator Integration

The authenticator shows groups the user manages and belongs to:

```
Groups you manage:
  Web10 Dev Team (owner) → 5 members, invite only
  Personal Circle (owner) → 3 members, invite only

Groups you belong to:
  Public Community (member) → 1200 members, open
  Jazz Collectors (member) → 500 members, request
```

The user can leave groups, manage membership, and control which groups their posts appear in.

## Summary

Groups are a platform primitive. Policy containers. Service-scoped roles. Join policies. Membership management. The building block for communities, teams, and circles. No visibility column. No collection ceiling. No term records. Groups define who sees what. Roles define what they can do.