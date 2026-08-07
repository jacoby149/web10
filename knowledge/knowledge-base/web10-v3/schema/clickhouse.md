# ClickHouse Schema

The data model. Every table, every index, every pattern.

## Documents

Everything structured. One table. JSON body for schema flexibility. `ref_value` is the universal link — any document can point to any other.

```sql
CREATE TABLE documents (
    doc_id String,
    author_key String,
    collection_name String,
    body String,
    ref_value String DEFAULT '',
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, doc_id)
TTL created_at + INTERVAL 90 DAY;
```

**Primary key:** `(author_key, doc_id)` — fast lookups by author and by document ID.

**ReplacingMergeTree:** updates are inserts with higher `updated_at`. The engine keeps the latest version. Old versions are garbage collected on merge.

**Tombstones:** deletes are inserts with `deleted = 1` and higher `updated_at`. Queries filter `WHERE deleted = 0`. TTL physically removes old data after 90 days.

**`ref_value`:** the universal link. The API writes it on create (extracts the `ref` from the JSON body). Indexed by the primary key scan — instant lookups for counting references. Comments, reactions, replies, quotes, bookmarks, votes — all just documents with a `ref`.

**`collection_name`:** low cardinality. The API uses it to distinguish posts, reactions, comments, outbox, profile — all in the same table.

**`tags`:** freeform labels. Fast filtering with `has(tags, 'jazz')`.

## Doc Groups

Document-to-group mapping. Groups define who can see the document.

```sql
CREATE TABLE doc_groups (
    doc_id String,
    group_id String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (doc_id, group_id);
```

**Primary key:** `(doc_id, group_id)` — fast lookups for "which groups is this document in?" and "which documents are in this group?" (via JOIN).

**No `permission` column.** Roles define access, not per-attachment permissions. The group contract holds the roles. The doc_groups table just maps documents to groups.

## Group Contracts

People + policy. Service-scoped roles.

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

**`roles` is JSON.** Each role defines the services it touches and the permissions it grants. See `../schema/contracts.md` for the full role model.

## Group Members

Active members. Multiple roles per user.

```sql
CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,               -- role name from the contract (e.g. 'owner', 'member')
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);
```

**Multiple roles per user:** a user can hold different roles for different services in the same group. Each role is a separate row.

## Group Join Requests

Pending join requests for "request" join policy.

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

## Service Contracts

App Trust. Binary infrastructure toggle. CORS. Browser-enforced.

```sql
CREATE TABLE service_contracts (
    user_key String,
    service_name String,
    allowed_origin String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, service_name, allowed_origin);
```

## User Group Sharing

Per-user, per-group toggle. "Pause sharing without leaving."

```sql
CREATE TABLE user_group_sharing (
    user_key String,
    group_id String,
    sharing_enabled UInt8,     -- 1 = sharing, 0 = blocked
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, group_id);
```

## Blacklists

Two levels of blocking.

```sql
CREATE TABLE user_blacklist (
    user_key String,
    blocked_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, blocked_key);

CREATE TABLE group_blacklist (
    user_key String,
    group_id String,
    blocked_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, group_id, blocked_key);
```

## Patterns

Every table follows the same conventions:

| Pattern | How | Why |
|---|---|---|
| **Updates** | `ReplacingMergeTree(updated_at)` — insert new row with higher `updated_at` | Append-only. No race conditions. The engine keeps the latest. |
| **Deletes** | Insert with `deleted = 1` and higher `updated_at` | Tombstones. Queries filter `WHERE deleted = 0`. TTL cleans up. |
| **No row = denied** | Missing row in service_contracts = app blocked | Explicit allowlist. Default deny. |
| **No row = enabled** | Missing row in user_group_sharing = sharing on | Opt-out model. Default on. |
| **TTL** | `TTL created_at + INTERVAL 90 DAY` on documents | Physical cleanup. Old data disappears automatically. |
| **Background compaction** | Tables without TTL get a background job | Tombstones take space. Compact on schedule. |

## Indexes

ClickHouse uses primary keys for indexing. No secondary indexes needed for the core patterns:

| Query | Indexed by |
|---|---|
| Read by author | `(author_key, doc_id)` — primary key |
| Read by doc_id | `(author_key, doc_id)` — primary key (needs author_key) |
| Read by collection | `collection_name` — low cardinality, cached |
| Read by tags | `has(tags, 'x')` — array scan, fast |
| Ref count | `ref_value` — subquery on the already-filtered result set |
| Group membership | `(group_id, member_key)` — primary key |
| Doc-to-group | `(doc_id, group_id)` — primary key |

For `ref_count` ranking: the result set is already filtered by group membership (typically 50 rows). A subquery on `ref_value = :doc_id` against the reactions/comments collection is fast because `ref_value` is a column, not buried in JSON.

## Data Flow

```
Client → w.create('posts', body, { groups: [...] })
  API → INSERT INTO documents (doc_id, author_key, collection_name, body, ref_value, tags, ...)
  API → INSERT INTO doc_groups (doc_id, group_id, ...) — one per group
  API → WebSocket: push to group channels

Client → w.read('posts', { groups, $sort, $match })
  API → SELECT FROM documents
        JOIN doc_groups
        JOIN group_members
        WHERE deleted = 0 AND group IN (...) AND member = :user
        [filter by $match]
        [compute $sort score]
        ORDER BY [score | field]
        LIMIT 50
```

One table for data. One table for visibility. One table for people. Three tables. Everything else is a query.

## See Also

- `../schema/contracts.md` — full contract tables (service, provider, group, sharing, blacklists)
- `../sdk/api.md` — SDK surface (CRUD, groups, sort, match)
- `../sdk/implementation.md` — SQL behind every SDK call