# Groups Tab

Manage your groups. See groups you manage, groups you belong to, pending join requests.

## What the Screen Shows

```
Groups
─────────────────────
You Manage (2)
─────────────────────
web10.app/groups/jacoby149/followers       [open]    1,203 members  [Manage]
web10.app/groups/jacoby149/close-friends   [invite]  12 members     [Manage]

You Belong To (3)
─────────────────────
web10.app/groups/dave/jazz-collectors           [request] owner: dave     [View] [Leave]
web10.app/groups/charlie/st-louis-chess-club                 [open]    owner: charlie  [View] [Leave]
web10.app/groups/alice/followers           [request] owner: alice    [Unfollow]

Pending Requests (1)
─────────────────────
bob wants to join web10.app/groups/jacoby149/close-friends  [Approve] [Deny]
```

## Protocol Mapping

**Groups you manage:**

```ts
const managed = await w.getGroups({ manages: 'jacoby149' })
// → [
//    { group_id: 'web10.app/groups/jacoby149/followers', name: 'Followers', join_policy: 'open', member_count: 1203, my_role: 'owner' },
//    { group_id: 'web10.app/groups/jacoby149/close-friends', name: 'Close Friends', join_policy: 'invite_only', member_count: 12, my_role: 'owner' },
//  ]
```

**Groups you belong to (all, then filter out managed):**

```ts
const all = await w.getGroups({ member: 'jacoby149' })
const notManaged = all.filter(g => g.my_role !== 'owner')
```

**Pending join requests:** Fetch members with pending status for groups you manage.

```ts
const pending = await w.getPendingRequests('web10.app/groups/jacoby149/close-friends')
// → [{ requester_key: 'bob', requested_at: '2026-01-15T10:30:00' }]
```

**Approve a request:**

```ts
await w.acceptInvite('web10.app/groups/jacoby149/close-friends', 'bob')
// → Bob is now a member with the offered role
```

**Leave a group:**

```ts
await w.leaveGroup('web10.app/groups/dave/jazz-collectors')
// → { group_id: 'web10.app/groups/dave/jazz-collectors', member_key: 'jacoby149', status: 'left' }
```

**Block sharing (without leaving):**

```ts
await w.blockSharing('web10.app/groups/dave/jazz-collectors')
// → Your content: hidden from group
// → Their content: still visible to you
// → Reversible
```

## The Data Flow

```
User opens /groups
  → w.getGroups({ manages: 'jacoby149' })    (groups you manage)
  → w.getGroups({ member: 'jacoby149' })     (all groups)
  → w.getPendingRequests(...)                (pending join requests)
  → parallel: all three calls
  → render
```

Three parallel SDK calls. No joins. Clean.

## Group Management Screen

```
web10.app/groups/jacoby149/close-friends
─────────────────────
Join policy: invite only  [Change]
Members (12):
  jacoby149  [owner]
  alice      [member]  [Remove]
  bob        [member]  [Remove]
  ...

Your posts in this group: 24
  [Opt out all documents]
```

**Opt out all documents:** Read your documents in this group, then update each to remove the group attachment.

```ts
const myPosts = await w.read('posts', {
  groups: ['me'],
  $match: { groups: 'web10.app/groups/jacoby149/close-friends' },
})
for (const post of myPosts) {
  const currentGroups = post.groups.filter(g => g !== 'web10.app/groups/jacoby149/close-friends')
  await w.update('posts', { _id: post.doc_id }, {}, { $groups: currentGroups })
}
```

## TODO

- [ ] Group management screen — members list, add/remove, change join policy
- [ ] Member search — find users to invite to a group
- [ ] Opt out all documents — bulk remove group attachment
- [ ] Create group flow — `w.createGroup(...)`
- [ ] Join request notifications — notify owner on new request (see notifications.md)

## Proof

Groups are managed through SDK calls. No dedicated social groups endpoint. No special permissions. CRUD on group_contracts and group_members through the SDK. The protocol handles it.