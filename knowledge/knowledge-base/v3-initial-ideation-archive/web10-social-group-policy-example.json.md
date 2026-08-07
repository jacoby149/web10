# Web10 Social Group Policy Examples

One group. One JSON. Service-scoped roles. Explicit permissions.

Groups are collections of web10 users operating on data services. Roles define access, scoped to exactly which services they apply to. Default is self-focused: you only touch your own content unless explicitly granted otherwise.

**Multiple roles per user.** A user can hold multiple roles in the same group. `alice` can be a `member` (for posts/comments) AND a `page-curator` (for group-identity-service). The DB maps `user → group → [roles]`. Roles span different services.

## Example 1: Community Group

```json
{
  "group_id": "web10.app/groups/jacoby149/abacus-enthusiasts",
  "join_policy": "request",
  "roles": [
    {
      "name": "owner",
      "services": ["*"],
      "permissions": [
        "readAll", "create", "updateOwn", "updateAll",
        "deleteOwn", "deleteAll", "hideAll",
        "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"
      ]
    },
    {
      "name": "moderator",
      "services": ["posts", "comments"],
      "permissions": [
        "readAll", "create", "updateOwn",
        "deleteOwn", "hideAll",
        "assignRoles", "revokeRoles"
      ]
    },
    {
      "name": "page-curator",
      "services": ["group-identity-service"],
      "permissions": [
        "readAll", "create", "updateOwn", "deleteOwn"
      ]
    },
    {
      "name": "member",
      "services": ["posts", "comments"],
      "permissions": [
        "readAll", "create", "updateOwn", "deleteOwn"
      ]
    }
  ]
}
```

**Service-scoped roles.** Each role lists the services it applies to:
- `moderator` and `member` only touch `posts` and `comments`.
- `page-curator` only touches `group-identity-service` (banner, name, website).
- `owner` touches everything (`"*"`).

**Explicit, self-focused permissions.** Default is you only touch your own stuff. `updateAll` and `deleteAll` are reserved for v2 collaboration. `hideAll` is the moderation power.

- `readAll` — view any content in the service
- `create` — add new content
- `updateOwn` — edit your own content
- `deleteOwn` — remove your own content
- `hideAll` — hide any content from discover (moderation)
- `manageRoles` — create/edit/remove roles
- `assignRoles` / `revokeRoles` — manage user roles
- `deleteGroup` — destroy the group

**Append-only identity.** `group-identity-service` is append-only. Curators add records, they don't overwrite. Members see the most recent. No accidental overwrites.

## Example 2: Discover (Default)

The public board. Everyone is a member by default. Replaces the `discover: true` boolean entirely.

```json
{
  "group_id": "web10.app/groups/web10/discover",
  "join_policy": "open",
  "roles": [
    {
      "name": "member",
      "services": ["posts"],
      "permissions": [
        "readAll",
        "create",
        "updateOwn",
        "deleteOwn"
      ]
    }
  ]
}
```

**How it works:**
- `join_policy: "open"` + auto-enrollment on signup = **everyone is a member by default**.
- `readAll` = anyone can see anything posted here. This **is** the public board.
- `create`, `updateOwn`, `deleteOwn` = you can post to it and manage your own stuff.
- No moderators. No owners. One role. Everyone shares it.

**Discovery is group membership.** No `discover` boolean. No separate discover index logic. Posts attached to the discover group are public. Posts without it are private.

## Example 3: Private Circle (Burner Insta)

A private group. The creator is the only owner. Approved friends are members. Members can see private posts.

```json
{
  "group_id": "web10.app/groups/jacoby149/close-friends",
  "join_policy": "request",
  "roles": [
    {
      "name": "owner",
      "services": ["*"],
      "permissions": [
        "readAll", "create", "updateOwn", "updateAll",
        "deleteOwn", "deleteAll", "hideAll",
        "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"
      ]
    },
    {
      "name": "member",
      "services": ["posts"],
      "permissions": [
        "readAll",
        "create",
        "updateOwn",
        "deleteOwn"
      ]
    }
  ]
}
```

**How it works:**
- `join_policy: "request"` + no auto-enrollment = **private by default**.
- Owner posts private content to the group.
- Friends request to join. Owner approves. They become `member`.
- Members get `readAll` on posts, so they can see the owner's private posts.
- No moderators. No curators. Just owner + members.

**Private sharing is just a group.** No separate "private posts" service. No visibility booleans. If it's in the group, members see it. If it's not, they don't.

## Group Collections

Each group holds collections:

- `group-settings-service` — config, permissions
- `group-identity-service` — group banner, name, website, avatar (append-only)
- `posts` — group posts
- `comments` — group comments
- Whatever else the group needs

The group can hold any number of collections. Roles are scoped to exactly which ones they can touch.
