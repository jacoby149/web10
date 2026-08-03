# Federated Groups

Groups span providers. The group membership list is the federation map.

## The Problem

Each provider runs its own ClickHouse instance. A group can have members on different providers. How does Bob on provider-B see Alice's posts on provider-A?

## The Solution

The group tells you which providers to query.

```
jazz-collectors:
  members:
    alice @ provider-a
    bob @ provider-b
    charlie @ provider-a
```

When Bob queries the group on provider-B, he sees: "there are members on provider-A too." He queries provider-A's instance.

```
Bob → GET /groups/jazz-collectors/posts
  provider-b: scans local posts in jazz-collectors
  provider-b: sees alice, charlie are on provider-a
  provider-b: federated query → provider-a: "posts in jazz-collectors?"
  provider-a: returns alice's posts
  provider-b: merges results
```

## The Group Membership Table

Each provider stores the same group membership list. The `provider_key` tells you where to query.

```sql
CREATE TABLE group_members (
    group_id String,
    member_key String,
    provider_key String,     -- 'provider-a', 'provider-b'
    role String,             -- 'admin', 'member'
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);
```

## The Federated Query

```sql
-- Bob queries jazz-collectors on provider-b
SELECT DISTINCT provider_key FROM group_members
WHERE group_id = 'jazz-collectors'
  AND provider_key != 'provider-b'
-- Returns: provider-a

-- Federated query to provider-a
SELECT * FROM remote('provider-a', 'posts', 'user', 'password')
WHERE post_id IN (
  SELECT post_id FROM remote('provider-a', 'post_groups', 'user', 'password')
  WHERE group_id = 'jazz-collectors'
)
  AND deleted = 0
```

ClickHouse's `remote()` function queries other instances. The group membership tells you which providers to hit.

## Mail Across Providers

The inbox is scoped by provider:

```
provider-a.alice.inbox → open join
provider-b.alice.inbox → open join
```

Bob on provider-B sends mail → attaches to `provider-b.alice.inbox` → Alice discovers it on provider-B.

But Alice also queries `provider-a.alice.inbox` on provider-A. She sees mail from provider-A members.

Alice's inbox is the union of all her provider-scoped inbox groups. She queries each provider for her inbox on that provider.

```
Alice → GET /alice/inbox
  provider-a: scans provider-a.alice.inbox
  provider-b: scans provider-b.alice.inbox
  merge: all mail
```

## Cross-Provider Groups

A group can span providers. Members on different providers see each other's posts.

```
web10-dev:
  members:
    alice @ provider-a
    bob @ provider-b
    charlie @ provider-c
```

Alice posts on provider-A → attached to `web10-dev` → Bob discovers it on provider-B (federated query to provider-A) → Charlie discovers it on provider-C (federated query to provider-A).

One group. Three providers. Federated discovery.

## The Authenticator

Shows which providers your groups span:

```
web10-dev → admin: you
  members:
    alice @ provider-a (you)
    bob @ provider-b
    charlie @ provider-c
  [Add member] [Remove member] [Query provider-a] [Query provider-b] [Query provider-c]
```

## Scale

The group membership list is small. A group with 100k members might span 10 providers. You query 10 instances, not 100k rows. The federation is efficient.

## Summary

Groups span providers. The group membership list tells you which providers to query. ClickHouse's `remote()` function queries other instances. One query per provider. Merge results. Federated discovery.

The inbox is scoped by provider. Alice queries each provider for her inbox on that provider. Union of results.

One group. Many providers. Federated query.