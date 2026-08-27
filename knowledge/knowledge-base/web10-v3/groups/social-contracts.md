# Group Contracts for Web10 Social Use Cases

This doc maps every group contract the social app creates. Each entry is the exact JSON sent to `POST /v3/groups/create` — the group name, join policy, roles, and initial members. The generic group model is in `../groups/overview.md`. This is the social app's concrete application of it.

## Group Types

| Use Case | Group ID | Join Policy | Default Role | Owner | Members |
|---|---|---|---|---|---|
| Discover (public board) | `web10.app/groups/web10/discover` | `open` | `member` | System | Everyone (auto-join) |
| Followers | `web10.app/groups/{username}/followers` | `open` or `request` | `member` | `{username}` | Followers |
| Close Friends | `web10.app/groups/{username}/close-friends` | `request` | `member` | `{username}` | Approved friends |
| Community | `web10.app/groups/{owner}/{name}` | `open`, `request`, or `invite_only` | `member` | `{owner}` | Community members |
| DM | `web10.app/groups/{first}/dm-{second}` | `invite_only` | `member` | None | Two participants |

## Default Role

Every group contract declares a `default_role` — the role assigned when:

1. **Open join** — someone joins an `open` group automatically gets `default_role`
2. **Invite with role omitted** — `inviteMember(groupId, memberKey)` without a role assigns `default_role`
3. **Invite with explicit role** — `inviteMember(groupId, memberKey, "moderator")` overrides to that role

```json
{
  "group_id": "web10.app/groups/charlie/st-louis-chess-club",
  "join_policy": "open",
  "default_role": "member",
  "roles": [
    { "name": "owner", ... },
    { "name": "moderator", ... },
    { "name": "member", ... }
  ]
}
```

The `default_role` must match one of the defined role names. It defaults to the last role in the roles array if omitted (convention: list roles from most privileged to least, so the last entry is the baseline member role).

---

## 1. Discover (Public Board)

The public board. Every post attached here is visible to everyone. This is a
**node default**, not an app-created group: the node creates it at boot
(`ensure_discover_group()`) and auto-enrolls every user — including `anon` —
as a member. A token-less read of the group runs as `anon`, which is what
makes the board anon-readable (the marketing trending page, any public
surface). Discovery IS a group read — there is no separate discover endpoint.

```json
{
  "group_id": "web10.app/groups/web10/discover",
  "join_policy": "open",
  "roles": [
    {
      "name": "member",
      "services": ["posts"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn"]
    }
  ]
}
```

**How it works:**
- Node default + auto-enrollment = everyone (including anon) is a member by default
- `readAll` = anyone can see anything posted here. This **is** the public board.
- `create`, `updateOwn`, `deleteOwn` = you can post to it and manage your own stuff
- No moderators. No owners. One role. Everyone shares it.

**Discovery is group membership.** No `discover` boolean. No separate discover index logic. Posts attached to the discover group are public. Posts without it are private.

---

## 2. Followers

Following a public profile is a group join. The user's followers group uses `join_policy: "open"`, so the follow is instant. The follower is added as a `member` with `readAll` on posts.

```json
{
  "group_id": "web10.app/groups/coolguydavid/followers",
  "join_policy": "open",
  "roles": [
    {
      "name": "owner",
      "services": ["*"],
      "permissions": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
    },
    {
      "name": "member",
      "services": ["posts"],
      "permissions": ["readAll"]
    }
  ]
}
```

**How it works:**
- `join_policy: "open"` = instant follow. Click follow → you are added as a `member` of `coolguydavid/followers`. No request. No approval.
- The follower's `member` role only grants `readAll` on `posts` — they can see what the author shares, not post or modify.
- The author posts by attaching content to the `followers` group. Members discover it via group membership.
- Unfollow is just leaving the group. No approval needed.

**Private profile variant:** Same group shape, `join_policy: "request"` — follow requires the author's approval.

**The audience is the asset.** The owner can read the full membership list. Every follower's web10 username, email (if set), phone (if set). They can message a follower, email a fan, text a supporter — directly, through web10. That list is theirs.

---

## 3. Close Friends

A private group. The creator is the only owner. Approved friends are members. Members can see private posts and can post/comment themselves.

```json
{
  "group_id": "web10.app/groups/jacoby149/close-friends",
  "join_policy": "request",
  "roles": [
    {
      "name": "owner",
      "services": ["*"],
      "permissions": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
    },
    {
      "name": "member",
      "services": ["posts", "comments"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn"]
    }
  ]
}
```

**How it works:**
- `join_policy: "request"` + no auto-enrollment = private by default
- Owner posts private content to the group
- Friends request to join. Owner approves. They become `member`
- Members get `readAll` on posts AND comments, plus `create`, `updateOwn`, `deleteOwn` — they can post and comment
- No moderators. No curators. Just owner + members

---

## 4. Community

A community with an owner, moderators, curators, and members. Used for topic-based communities, interest groups, and curated spaces.

```json
{
  "group_id": "web10.app/groups/charlie/st-louis-chess-club",
  "join_policy": "request",
  "roles": [
    {
      "name": "owner",
      "services": ["*"],
      "permissions": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
    },
    {
      "name": "moderator",
      "services": ["posts", "comments"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll", "assignRoles", "revokeRoles"]
    },
    {
      "name": "page-curator",
      "services": ["group-identity-service"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn"]
    },
    {
      "name": "member",
      "services": ["posts", "comments"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn"]
    }
  ]
}
```

**How it works:**
- `join_policy: "request"` — members request to join, owner or moderator approves
- Owner has full control, moderators can hide content and manage roles
- Page curators manage the group identity (banner, name, website) without touching posts
- Members can post, comment, and edit their own content

**Join policy variants:**
- `open` — anyone joins instantly (public community)
- `request` — join requires approval (curated community)
- `invite_only` — only invited members can join (private community)

---

## 5. DM (Direct Message)

A private group between two users. Messages are posts in this group. Both users are `member` — no owner, no hierarchy.

```json
{
  "group_id": "web10.app/groups/alice/dm-bob",
  "join_policy": "invite_only",
  "roles": [
    {
      "name": "member",
      "services": ["posts", "comments"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn"]
    }
  ]
}
```

**How it works:**
- `join_policy: "invite_only"` — only the two participants can join
- Both users are added as `member` at creation time
- One role. Equal permissions. Both can read, create, update own, delete own.
- Group name is deterministic: `dmGroupId(a, b)` sorts the usernames, so `dmGroupId("alice", "bob")` == `dmGroupId("bob", "alice")`
- DMs are posts in the group. Reading the conversation is `read('posts', { groups: [dmGroup] })`

---

## Summary

| Group | Services | Key Permission | Join Policy |
|---|---|---|---|
| Discover | `posts` | `readAll` (everyone) | `open` |
| Followers | `posts` | `readAll` (member) | `open` / `request` |
| Close Friends | `posts`, `comments` | `readAll`, `create` (member) | `request` |
| Community | `posts`, `comments`, `group-identity-service` | `readAll`, `create` (member); `hideAll` (moderator) | `open` / `request` / `invite_only` |
| DM | `posts`, `comments` | `readAll`, `create` (member) | `invite_only` |

Every screen in the social app maps to one of these five group contracts. No dedicated social endpoints. No special tables. CRUD + groups + refs.

For the generic group model, see `../groups/overview.md`. For contract schemas, see `../sdk/contracts.md`.
