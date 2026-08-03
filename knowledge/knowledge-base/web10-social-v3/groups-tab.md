# Groups Tab

Manage your groups. See groups you admin, groups you belong to, pending join requests.

## What the Screen Shows

```
Groups
─────────────────────
You Admin (2)
─────────────────────
jacoby149.public          [open]    1,203 members  [Manage]
jacoby149.close-friends   [invite]  12 members     [Manage]

You Belong To (3)
─────────────────────
jazz-collectors           [request] admin: dave     [View] [Leave]
web10-dev                 [open]    admin: charlie  [View] [Leave]
alice.followers           [request] admin: alice    [Unfollow]

Pending Requests (1)
─────────────────────
bob wants to join jacoby149.close-friends  [Approve] [Deny]
```

## Protocol Mapping

**Groups you admin:**
```sql
SELECT group_id, name, join_policy
FROM group_contracts
WHERE admin_key = 'jacoby149' AND deleted = 0;
```

**Member counts:**
```sql
SELECT group_id, count() AS members
FROM group_members
WHERE deleted = 0
GROUP BY group_id;
```

**Groups you belong to (not admin):**
```sql
SELECT gm.group_id, gc.name, gc.admin_key, gc.join_policy
FROM group_members gm
JOIN group_contracts gc ON gm.group_id = gc.group_id
WHERE gm.member_key = 'jacoby149'
  AND gm.deleted = 0
  AND gc.deleted = 0
  AND gc.admin_key != 'jacoby149';
```

**Pending join requests:**
```sql
SELECT gjr.group_id, gjr.requester_key, gjr.requested_at, gc.name
FROM group_join_requests gjr
JOIN group_contracts gc ON gjr.group_id = gc.group_id
WHERE gjr.status = 'pending'
  AND gc.admin_key = 'jacoby149'
  AND gjr.deleted = 0;
```

**Approve a request:**
```sql
-- Update request status
INSERT INTO group_join_requests
SELECT group_id, requester_key, 'approved', requested_at, now(), updated_at, deleted
FROM group_join_requests
WHERE group_id = 'jacoby149.close-friends' AND requester_key = 'bob';

-- Add to group members
INSERT INTO group_members VALUES ('jacoby149.close-friends', 'bob', 'member', now(), now(), 0);
```

**Leave a group:**
```sql
INSERT INTO group_members
SELECT group_id, member_key, role, joined_at, now(), 1
FROM group_members
WHERE group_id = 'jazz-collectors' AND member_key = 'jacoby149';
```
Tombstone the membership. You're out.

**Block sharing (without leaving):**
```sql
INSERT INTO user_group_sharing VALUES ('jacoby149', 'jazz-collectors', 0, now(), now(), 0);
```
Your posts are hidden from the group. You still see their posts. Reversible.

## The Data Flow

```
User opens /groups
  → query: groups you admin          (group_contracts)
  → query: member counts             (group_members, GROUP BY)
  → query: groups you belong to      (group_members JOIN group_contracts)
  → query: pending requests          (group_join_requests)
  → parallel: all four queries
  → render
```

Four parallel queries. No joins between them. Clean.

## Group Management Screen

```
jacoby149.close-friends
─────────────────────
Join policy: invite only  [Change]
Members (12):
  jacoby149  [admin]
  alice      [member]  [Remove]
  bob        [member]  [Remove]
  ...

Your posts in this group: 24
  [Opt out all documents]
```

**Opt out all documents:** Bulk tombstone your doc_groups entries for this group.
```sql
INSERT INTO doc_groups
SELECT doc_id, group_id, permission, created_at, now(), 1
FROM doc_groups
WHERE group_id = 'jacoby149.close-friends'
  AND deleted = 0
  -- need author_key, which isn't in doc_groups — join with documents
```
Actually, need to join with posts to filter by author:
```sql
INSERT INTO doc_groups (doc_id, group_id, permission, created_at, updated_at, deleted)
SELECT pg.doc_id, pg.group_id, pg.permission, pg.created_at, now(), 1
FROM doc_groups pg
JOIN documents p ON pg.doc_id = p.doc_id
WHERE pg.group_id = 'jacoby149.close-friends'
  AND p.author_key = 'jacoby149'
  AND pg.deleted = 0;
```

## TODO

- [ ] Group management screen — members list, add/remove, change join policy
- [ ] Member search — find users to invite to a group
- [ ] Opt out all documents — bulk tombstone with author filter
- [ ] Create group flow — INSERT into group_contracts, auto-add admin as member
- [ ] Join request notifications — notify admin on new request (see notifications.md)

## Proof

Groups are managed through contract and membership tables. No dedicated social groups endpoint. No special permissions. CRUD on group_contracts and group_members. The protocol handles it.
