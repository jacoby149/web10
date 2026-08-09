# Contract Schemas

Two concerns. Two contracts. One model.

1.  **App Contracts:** "What can this app do with my data?" Per-app, per-service permissions. Contract with the app.
2.  **Group Contracts:** "Who can see my content?" Granular social policy with service-scoped roles. Contract with people.

## The Paradigm: Infinite Services, Finite Apps

Services are infinite. `posts`, `playlists`, `comments`, `notes`, `mail`, `reactions`, `bookmarks` — any app can invent new ones. They're just data labels. ClickHouse doesn't care. The `documents` table has a `collection_name` column. That's it. No schema migration. No approval process. No limit.

Apps are the constraint. There are a handful of apps you actually use. `music.web10.com`, `social.web10.com`, `notes.web10.com`. Each one asks for access. You approve or deny.

**Service schemas (v4).** While services are infinite, they need shape. A `posts` schema defines what a post looks like — `text`, `media`, `tags`. Schemas evolve — version 1 had `content`, version 2 has `text`. ClickHouse handles this with **real-time data migrations on read**: old data stays as-is, new writes use the new schema, reads always return the latest shape. No downtime. No migration scripts. A future "Services" tab in the authenticator will show schema versions and let apps propose schema updates.

The old model (v2) treated services as scarce — each service needed a contract, a whitelist, a blacklist. That doesn't scale to an interoperable internet. The new model treats apps as the unit of trust. One contract per app. The app declares every service it touches. You decide once.

```
v2: 12 services × 3 apps = 36 contracts to manage
v3: 3 apps × 1 contract each = 3 contracts to manage
v4: 3 apps + infinite services with schema versions = still 3 contracts
```

Services are free. Apps are the gate. Schemas are the shape.

## App Contracts

App Trust (Infrastructure). One contract per app (origin). The contract declares every service the app needs and what it can do on each. No user-level whitelist/blacklist — that's what groups are for.

The contract is with the app, not the service. When music.web10.com asks for access, you're saying "I trust this app to read my posts and manage my playlists." Not "I trust posts." The app is the party.

```sql
CREATE TABLE app_contracts (
    user_key String,           -- owner of the data
    allowed_origin String,     -- 'music.web10.com'
    permissions String,        -- JSON: { "posts": ["readAll", "create"], "playlists": ["readAll", "create", "updateOwn", "deleteOwn"] }
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, allowed_origin);
```

**One row per app.** An app that needs posts, playlists, and comments declares all three in one contract. The user approves or denies once.

```json
{
  "allowed_origin": "music.web10.com",
  "permissions": {
    "posts": ["readAll", "create"],
    "playlists": ["readAll", "create", "updateOwn", "deleteOwn"],
    "comments": ["readAll"]
  }
}
```

**Query:** can `music.web10.com` read `alice.posts`?
```sql
SELECT permissions FROM app_contracts
WHERE user_key = 'alice'
  AND allowed_origin = 'music.web10.com'
  AND deleted = 0
LIMIT 1;
-- Check: has 'posts' key? Does the permissions array contain 'readAll'?
```

The API checks two things for every operation:
1. **Origin check** — does this origin have an active contract for this user?
2. **Permission check** — does the contract's permissions object cover this service with this operation?

If either fails, the operation is denied. Groups run after — the app gets through the door, the person's role decides what they see inside.

**Kill switch:** revoke one app = one row tombstoned.
```sql
INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted)
SELECT user_key, allowed_origin, permissions, created_at, now(), 1
FROM app_contracts
WHERE user_key = 'alice' AND allowed_origin = 'music.web10.com' AND deleted = 0;
```

Revoke all apps = tombstone every row for the user.

Tombstone-append. Background job compacts. Same pattern everywhere.

## Provider App Contracts

Node Trust. Which apps can participate on this node. Server-enforced. Provider admin manages.

```sql
CREATE TABLE provider_app_contracts (
    provider_key String,       -- 'provider-a'
    allowed_origin String,     -- 'twitter-clone.web10.com'
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (provider_key, allowed_origin);
```

**Query:** can `spamapp.com` participate on `provider-a`?
```sql
SELECT 1 FROM provider_app_contracts
WHERE provider_key = 'provider-a'
  AND allowed_origin = 'spamapp.com'
  AND deleted = 0
LIMIT 1;
```

Blocked apps simply have no row. No row = denied.

## Group Contracts

Group membership, roles, join policy. The contract is people + policy only. Roles are service-scoped — each role lists the services it applies to and the explicit permissions it grants.

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
```

**Query:** what's the join policy and roles for `web10.app/groups/jacoby149/abacus-enthusiasts`?
```sql
SELECT join_policy, roles
FROM group_contracts
WHERE group_id = 'web10.app/groups/jacoby149/abacus-enthusiasts' AND deleted = 0;
```

**Roles are JSON.** Each role defines the services it touches and the permissions it grants:
```json
{
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

A `page-curator` only touches `group-identity-service`. A `moderator` only touches `posts` and `comments`. A follower `member` only gets `readAll` on `posts`. The model scales infinitely without creating more groups.

**Profile data** (banner, description, website, avatar) lives in `group-identity-service` — not the contract. Roles with access to that service write it, members read. The contract stays pure: people + policy.

## Group Membership

Active members.

```sql
CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,                -- 'owner', 'moderator', 'page-curator', 'member'
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);
```

**Multiple roles per user.** A user can hold multiple roles in the same group. The DB maps `user → group → [roles]`. Roles span different services.

## Group Membership Requests

Pending join requests. The "request" join policy needs a queue.

```sql
CREATE TABLE group_join_requests (
    group_id String,
    requester_key String,
    status String,             -- 'pending', 'approved', 'denied'
    requested_at DateTime64(3),
    resolved_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, requester_key);
```

**Open policy flow (instant follow):**
```
Bob follows a public profile (open join policy)
  → INSERT INTO group_members ('web10.app/groups/alice/followers', 'bob', 'member', now(), ...)
  → Bob is immediately a member with the 'member' role
  → No request queue. No approval. Instant.
```

**Request policy flow (private follow):**
```
Bob requests to follow a private profile (request join policy)
  → INSERT INTO group_join_requests ('web10.app/groups/alice/followers', 'bob', 'pending', ...)
Alice approves
  → UPDATE status to 'approved', resolved_at = now()
  → INSERT INTO group_members ('web10.app/groups/alice/followers', 'bob', 'member', ...)
Alice denies
  → UPDATE status to 'denied', resolved_at = now()
```

## Block Sharing

Per-user, per-group toggle. "Pause sharing without leaving."

```sql
CREATE TABLE user_group_sharing (
    user_key String,           -- the user controlling sharing
    group_id String,
    sharing_enabled UInt8,     -- 1 = sharing, 0 = blocked
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, group_id);
```

**Query:** is Alice sharing with `web10.app/groups/dave/jazz-collectors`?
```sql
SELECT sharing_enabled FROM user_group_sharing
WHERE user_key = 'alice'
  AND group_id = 'web10.app/groups/dave/jazz-collectors'
  AND deleted = 0;
```

Default is `1` (sharing on). If the row is missing, sharing is on. Toggle to `0` → the discover query filters out Alice's posts for this group. Toggle back to `1` → posts reappear. Reversible.

## Blacklists

Two levels of blocking.

**User-wide blacklist** — block someone entirely.
```sql
CREATE TABLE user_blacklist (
    user_key String,
    blocked_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, blocked_key);
```

**Per-group blacklist** — block someone from your content in one group.
```sql
CREATE TABLE group_blacklist (
    user_key String,
    group_id String,
    blocked_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, group_id, blocked_key);
```

## Summary

All contract tables follow the same patterns:
- `ReplacingMergeTree(updated_at)` for updates
- `deleted UInt8 DEFAULT 0` for tombstones
- Background job compacts tombstones on schedule
- No row = denied (app contracts, provider contracts)
- Missing row = enabled (sharing toggle — default on)
- Roles are JSON arrays with service-scoped permissions
- Multiple roles per user in the same group
- Open join policy = instant membership, no request queue
- Request join policy = pending request, owner approves or denies

## Group Requests

Apps cannot directly create or modify groups. They must request the operation through `group_requests`, and the user approves through the authenticator UI. This is the consent layer for group operations — the same pattern as SMR/SIR for app contracts.

```sql
CREATE TABLE group_requests (
    request_id String,          -- unique ID
    user_key String,            -- whose groups are affected
    app_origin String,          -- requesting app (CORS origin)
    action String,              -- 'create_group', 'update_group', 'add_member', 'remove_member', 'invite_member', 'delete_group'
    params String,              -- JSON: operation parameters
    status String,              -- 'pending', 'approved', 'denied'
    requested_at DateTime64(3),
    resolved_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, request_id);
```

One request per operation. Granular consent. The user can approve some and deny others. See `../groups/requests.md` for the full model.