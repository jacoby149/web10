# Settings / Privacy

Manage service contracts, groups, blocking, and account-level controls.

## What the Screen Shows

```
Settings
─────────────────────

App Access
  twitter-clone.web10.com  [Revoke]
  music.web10.com          [Revoke]
  [Kill all app access]

Groups
  jacoby149.public          [Manage]
  jacoby149.close-friends   [Manage]
  jazz-collectors            [Block sharing] [Leave]

Blocked Users
  spam-bot-123   [Unblock]
  troll-account  [Unblock]

Account
  [Make everything private]
  [Export data]
  [Delete account]
```

## Protocol Mapping

**App access (service contracts):**
```sql
SELECT service_name, allowed_origin
FROM service_contracts
WHERE user_key = 'jacoby149' AND deleted = 0;
```

**Revoke app access:**
```sql
INSERT INTO service_contracts
SELECT user_key, service_name, allowed_origin, created_at, now(), 1
FROM service_contracts
WHERE user_key = 'jacoby149'
  AND allowed_origin = 'twitter-clone.web10.com'
  AND deleted = 0;
```

**Kill all app access:**
```sql
INSERT INTO service_contracts
SELECT user_key, service_name, allowed_origin, created_at, now(), 1
FROM service_contracts
WHERE user_key = 'jacoby149' AND deleted = 0;
```
One tombstone query. All origins revoked. No website touches your data.

**Blocked users:**
```sql
SELECT blocked_key FROM user_blacklist
WHERE user_key = 'jacoby149';
```

**Block a user:**
```sql
INSERT INTO user_blacklist VALUES ('jacoby149', 'spammer', now());
```

**Unblock a user:**
```sql
-- No tombstone for MergeTree — just DELETE
ALTER TABLE user_blacklist DELETE
WHERE user_key = 'jacoby149' AND blocked_key = 'spammer';
```

**Block sharing with a group:**
```sql
INSERT INTO user_group_sharing VALUES ('jacoby149', 'jazz-collectors', 0, now(), now(), 0);
```

**Make everything private:** Bulk tombstone all post_groups entries.
```sql
INSERT INTO post_groups (post_id, group_id, permission, created_at, updated_at, deleted)
SELECT pg.post_id, pg.group_id, pg.permission, pg.created_at, now(), 1
FROM post_groups pg
JOIN posts p ON pg.post_id = p.post_id
WHERE p.author_key = 'jacoby149'
  AND pg.deleted = 0;
```
One query. All posts detached from all groups. Everything goes dark.

**Export data:** Query all your posts, groups, and contracts. Return as JSON.
```sql
SELECT * FROM posts WHERE author_key = 'jacoby149' AND deleted = 0;
SELECT * FROM service_contracts WHERE user_key = 'jacoby149' AND deleted = 0;
SELECT gm.group_id FROM group_members gm WHERE gm.member_key = 'jacoby149' AND gm.deleted = 0;
```

**Delete account:** Tombstone everything.
```sql
-- Tombstone all posts
INSERT INTO posts SELECT post_id, author_key, collection_name, body, discoverable, tags, created_at, now(), 1 FROM posts WHERE author_key = 'jacoby149' AND deleted = 0;

-- Tombstone all service contracts
INSERT INTO service_contracts SELECT user_key, service_name, allowed_origin, created_at, now(), 1 FROM service_contracts WHERE user_key = 'jacoby149' AND deleted = 0;

-- Tombstone all group memberships
INSERT INTO group_members SELECT group_id, member_key, role, joined_at, now(), 1 FROM group_members WHERE member_key = 'jacoby149' AND deleted = 0;
```

## The Data Flow

```
User opens /settings
  → GET /service-contracts          (app access list)
  → GET /groups?member=jacoby149   (groups list)
  → GET /user-blacklist             (blocked users)
  → parallel: all three queries
  → render
```

Three queries. No joins. Clean.

## Per-Group Blacklist

The per-group blacklist is managed from the group management screen, not settings. But it's worth noting:

```
jazz-collectors → per-group blacklist: dave
  → INSERT INTO group_blacklist ('jacoby149', 'jazz-collectors', 'dave', now())
  → dave is still a member
  → dave sees everyone's posts in jazz-collectors
  → dave does NOT see jacoby149's posts in jazz-collectors
```

## TODO

- [ ] Service contract management — list, revoke, kill switch
- [ ] Block/unblock user — user_blacklist CRUD
- [ ] Per-group block sharing — user_group_sharing toggle
- [ ] Make everything private — bulk tombstone post_groups
- [ ] Export data — query all user data, return JSON blob
- [ ] Delete account — tombstone everything, TTL cleans up
- [ ] Notification preferences — per-type toggle (notifications table)

## Proof

Settings is CRUD on contract and blacklist tables. Kill switch is a bulk tombstone. Make everything private is a bulk tombstone. Block a user is an insert. The protocol handles sovereignty through data operations, not special endpoints. The user controls their data.
