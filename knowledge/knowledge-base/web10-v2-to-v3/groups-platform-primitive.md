# Groups: A Platform Primitive

## The Idea

Groups are not just a visibility type. They are a fundamental platform feature. Users create groups, add members, manage admins, and post to them. Groups are the building block for communities, teams, and circles.

Groups are a CRUD endpoint. The platform manages them. The user controls them.

## The Schema

```sql
CREATE TABLE groups (
    group_id String,
    name String,
    description String,
    admin_key String,          -- the creator/admin
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

## The API

```
# Group CRUD
POST   /groups                          → create a group
GET    /groups/{id}                     → get a group
PATCH  /groups/{id}                     → update a group (name, description)
DELETE /groups/{id}                     → delete a group (tombstone)

# Membership
POST   /groups/{id}/members             → add a member
GET    /groups/{id}/members             → list members
PATCH  /groups/{id}/members/{user}      → update role (promote to admin)
DELETE /groups/{id}/members/{user}      → remove a member

# Posts to a group
POST   /{user}/posts?group={group_id}   → create a post visible to group members
GET    /{user}/posts?group={group_id}   → read posts in this group
```

## Creating a Group

```ts
const group = await createGroup({
  name: "Web10 Dev Team",
  description: "Internal team discussions"
});
// Returns: { group_id: "grp-abc", name: "Web10 Dev Team", admin_key: "alice" }
```

The creator is the admin. The admin can add members and promote other admins.

## Adding Members

```ts
await addMember({
  group_id: "grp-abc",
  member_key: "bob",
  role: "member"
});

await addMember({
  group_id: "grp-abc",
  member_key: "charlie",
  role: "admin"  // promote to admin
});
```

The member receives a notification. They can see posts in the group on discover. They can post to the group.

## Posting to a Group

```ts
await createPost({
  text: "team update: v3 architecture locked",
  visibility: "group",
  visibility_scope: "grp-abc",
  discoverable: true  // discoverable within the group
});
```

The post is visible to all group members on `discover=true`. It is not visible to non-members. The `discoverable` flag controls whether it appears in the group feed or only by direct link.

## Group Discovery Query

When Alice hits discover, group posts are included if she's a member:

```sql
SELECT * FROM posts
WHERE deleted = 0
  AND (
    visibility = 'public'
    OR (visibility = 'followers' AND author_key IN (SELECT following_key FROM follows WHERE follower_key = 'alice'))
    OR (visibility = 'group'
        AND visibility_scope IN (
          SELECT group_id FROM group_members
          WHERE member_key = 'alice' AND deleted = 0
        ))
    OR author_key = 'alice'
  );
```

## Group Permissions

| Action | Who Can Do It |
|---|---|
| Create group | Any user |
| Add member | Admin or member (depending on group settings) |
| Remove member | Admin only |
| Promote to admin | Admin only |
| Delete group | Admin only |
| Post to group | Any member |
| See group posts | Any member (if discoverable) |

## Group Settings

Groups can have settings that control membership:

```json
{
  "group_id": "grp-abc",
  "name": "Web10 Dev Team",
  "join_policy": "invite-only",  // "open", "invite-only", "approval"
  "post_policy": "members-only", // "members-only", "admins-only"
  "discoverable": true           // group posts appear in member feeds
}
```

- `join_policy: "open"` — anyone can join
- `join_policy: "invite-only"` — only admins can add members
- `join_policy: "approval"` — members request to join, admins approve

- `post_policy: "members-only"` — any member can post
- `post_policy: "admins-only"` — only admins can post

## Why Groups Are Fundamental

Groups are not a feature. They are the building block for:

- **Teams** — internal collaboration, project discussions
- **Communities** — interest-based groups, hobby circles
- **Circles** — close friends, family, trusted contacts
- **Audiences** — newsletter subscribers, beta testers
- **Moderation** — admin-controlled spaces with rules

Groups replace the need for separate collection types. Instead of `public_posts`, `private_posts`, `group-posts`, the user creates groups and posts to them. The visibility is per-group. The membership is managed by the platform.

## The Privacy Panel Integration

The privacy panel shows groups the user is a member of:

```
Groups:
  Web10 Dev Team (admin) → 5 members, 120 posts
  Personal Circle (member) → 3 members, 45 posts
  Public Community (member) → 1200 members, 5000 posts
```

The user can leave groups, manage membership, and control which groups their posts appear in.

## Summary

Groups are a platform primitive. CRUD endpoint. Membership management. Admin controls. Post visibility. The building block for communities, teams, and circles. No separate collections. No term records. One table for groups. One table for membership. The API handles the rest.