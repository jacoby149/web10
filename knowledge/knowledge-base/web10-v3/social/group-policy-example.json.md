# Web10 Social Group Policy Examples

One group. One JSON. Per-service role maps. Explicit permissions.

Groups are collections of web10 users operating on data services. Roles define access as a **per-service permission map** — one role per person, each role a map from service to the ops it grants. Default is self-focused: you only touch your own content unless explicitly granted otherwise.

**One role per user.** A user holds exactly one role in a group (D58). The per-service map makes one role fully expressive — any (service, op) matrix fits in a single map — so there's no "stack multiple roles" escape hatch. If a person needs a distinct permission set, they get a distinct role. The DB maps `user → group → role`.

## Example 1: Community Group

```json
{
  "group_id": "web10.app/groups/jacoby149/abacus-enthusiasts",
  "join_policy": "request",
  "roles": [
    {
      "name": "owner",
      "permissions": {
        "*": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll"],
        "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
      }
    },
    {
      "name": "moderator",
      "permissions": {
        "posts": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll"],
        "comments": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll"],
        "group": ["assignRoles", "revokeRoles"]
      }
    },
    {
      "name": "page-curator",
      "permissions": {
        "group-identity-service": ["readAll", "create", "updateOwn", "deleteOwn"]
      }
    },
    {
      "name": "member",
      "permissions": {
        "posts": ["readAll", "create", "updateOwn", "deleteOwn"],
        "comments": ["readAll", "create", "updateOwn", "deleteOwn"]
      }
    }
  ]
}
```

**Per-service role maps.** Each role is a map from service to the ops it grants — the map *is* the scope:
- `moderator` and `member` only touch `posts` and `comments`.
- `page-curator` only touches `group-identity-service` (banner, name, website).
- `owner` touches everything (`"*"`) plus the management ops under the reserved `"group"` key.

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
      "permissions": {
        "posts": ["readAll", "create", "updateOwn", "deleteOwn"]
      }
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
      "permissions": {
        "*": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll"],
        "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
      }
    },
    {
      "name": "member",
      "permissions": {
        "posts": ["readAll", "create", "updateOwn", "deleteOwn"]
      }
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

## Example 4: Follow a Public Profile

Following a public profile is a group join. The user's followers group uses `join_policy: "open"`, so the follow is instant — no approval needed. The follower is added as a `member` and can see posts the author attaches to that group.

```json
{
  "group_id": "web10.app/groups/coolguydavid/followers",
  "join_policy": "open",
  "roles": [
    {
      "name": "owner",
      "permissions": {
        "*": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll"],
        "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
      }
    },
    {
      "name": "member",
      "permissions": {
        "posts": ["readAll"]
      }
    }
  ]
}
```

**How it works:**
- `join_policy: "open"` = **instant follow**. Click follow → you are added as a `member` of `coolguydavid/followers`. No request. No approval.
- The follower's `member` role only grants `readAll` on `posts` — they can see what the author shares, not post or modify.
- The author posts by attaching content to the `followers` group. Members discover it via group membership.
- Unfollow is just leaving the group. No approval needed.

**Public vs private profile is the join policy.** The same group shape works for both:
- `join_policy: "open"` → public profile. Anyone can follow instantly.
- `join_policy: "request"` → private profile. Follow requires the author's approval (same shape as Example 3).

**Follows are groups.** No follows table. No follows endpoint. One group membership, one set of roles, one permission model. The author controls the join policy. The follower gets `readAll` on posts. That's the entire follow mechanic.

## Group Collections

Each group holds collections:

- `group-settings-service` — config, permissions
- `group-identity-service` — group banner, name, website, avatar (append-only)
- `posts` — group posts
- `comments` — group comments
- Whatever else the group needs

The group can hold any number of collections. Roles are scoped to exactly which ones they can touch.
