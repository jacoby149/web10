# Contract Schemas

Two concerns. Two contracts.

1.  **Service Contracts (App Trust):** "Do we want to spin up these data buckets for this app?" Binary infrastructure toggle.
2.  **Group Contracts (People Access):** "Who do we want this data to reach?" Granular social policy.

## Service Contracts

App Trust (Infrastructure). Which websites can access your service. CORS. App-level. Browser-enforced.

```sql
CREATE TABLE service_contracts (
    user_key String,           -- owner of the service
    service_name String,       -- 'posts', 'mail', 'notes'
    allowed_origin String,     -- 'twitter-clone.web10.com'
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, service_name, allowed_origin);
```

**Query:** can `twitter-clone.web10.com` access `alice.posts`?
```sql
SELECT 1 FROM service_contracts
WHERE user_key = 'alice'
  AND service_name = 'posts'
  AND allowed_origin = 'twitter-clone.web10.com'
  AND deleted = 0
LIMIT 1;
```

**Kill switch:** revoke all origins for a user.
```sql
INSERT INTO service_contracts
SELECT user_key, service_name, allowed_origin, created_at, now(), 1
FROM service_contracts
WHERE user_key = 'alice' AND deleted = 0;
```

Tombstone-append. Background job compacts. Same pattern everywhere.

## Provider Service Contracts

Node Trust. Which apps can participate on this node. Server-enforced. Provider admin manages.

```sql
CREATE TABLE provider_service_contracts (
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
SELECT 1 FROM provider_service_contracts
WHERE provider_key = 'provider-a'
  AND allowed_origin = 'spamapp.com'
  AND deleted = 0
LIMIT 1;
```

Blocked apps simply have no row. No row = denied.

## Group Contracts

Group membership, roles, join policy. The contract is people + policy only. Roles are service-scoped.

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

**Profile data** (banner, description, website, avatar) lives in `group-identity-service` — not the contract. Roles with access to that service write it, members read. The contract stays pure: people + policy.

**Service-scoped roles.** Each role lists the services it applies to. A `page-curator` only touches `group-identity-service`. A `moderator` only touches `posts` and `comments`. The model scales infinitely without creating more groups.

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

**Flow:**
```
Bob requests to join alice.followers
  → INSERT INTO group_join_requests ('alice.followers', 'bob', 'pending', ...)
Alice approves
  → UPDATE status to 'approved', resolved_at = now()
  → INSERT INTO group_members ('alice.followers', 'bob', 'member', ...)
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

**Query:** is Alice sharing with `jazz-collectors`?
```sql
SELECT sharing_enabled FROM user_group_sharing
WHERE user_key = 'alice'
  AND group_id = 'jazz-collectors'
  AND deleted = 0;
```

Default is `1` (sharing on). If the row is missing, sharing is on. Toggle to `0` → the discover query filters out Alice's posts for this group. Toggle back to `1` → posts reappear. Reversible.

## Summary

All contract tables follow the same patterns:
- `ReplacingMergeTree(updated_at)` for updates
- `deleted UInt8 DEFAULT 0` for tombstones
- Background job compacts tombstones on schedule
- No row = denied (service contracts, provider contracts)
- Missing row = enabled (sharing toggle — default on)
