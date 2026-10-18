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
  web10.app/groups/jacoby149/followers       [Manage]
  web10.app/groups/jacoby149/close-friends   [Manage]
  web10.app/groups/dave/jazz-collectors      [Block sharing] [Leave]

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

```ts
const contracts = await w.getServiceContracts()
// → [
//    { service: 'posts', allowed_origin: 'twitter-clone.web10.com' },
//    { service: 'playlists', allowed_origin: 'music.web10.com' },
//  ]
```

**Revoke app access:**

```ts
await w.revokeServiceContract({ allowed_origin: 'twitter-clone.web10.com' })
```

**Kill all app access:**

```ts
await w.revokeAllServiceContracts()
```

One call. All origins revoked. No website touches your data.

**Blocked users:**

```ts
const blocked = await w.getBlockedUsers()
// → ['spam-bot-123', 'troll-account']
```

**Block a user:**

```ts
await w.blockUser('spammer')
```

**Unblock a user:**

```ts
await w.unblockUser('spammer')
```

**Block sharing with a group:**

```ts
await w.blockSharing('web10.app/groups/dave/jazz-collectors')
```

Your content is hidden from the group. You still see their content. Reversible.

**Make everything private:** Read all your documents, remove all group attachments.

```ts
const myDocs = await w.read('posts', { groups: ['me'] })
for (const doc of myDocs) {
  await w.update('posts', { _id: doc.doc_id }, {}, { $groups: [] })
}
```

One loop. All posts detached from all groups. Everything goes dark.

**Export data:** Query all your documents, groups, and contracts.

```ts
const docs = await w.read('posts', { groups: ['me'] })
const groups = await w.getGroups({ member: 'jacoby149' })
const contracts = await w.getServiceContracts()
```

**Delete account:** Tombstone everything through the authenticator.

```ts
await w.deleteAccount()
```

## The Data Flow

```
User opens /settings
  → w.getServiceContracts()      (app access list)
  → w.getGroups({ member: 'jacoby149' })  (groups list)
  → w.getBlockedUsers()          (blocked users)
  → parallel: all three calls
  → render
```

Three calls. No joins. Clean.

## Per-Group Blacklist

The per-group blacklist is managed from the group management screen, not settings. But it's worth noting:

```ts
await w.blockUserInGroup('dave', 'web10.app/groups/dave/jazz-collectors')
// → dave is still a member
// → dave sees everyone's content in jazz-collectors
// → dave does NOT see jacoby149's content in jazz-collectors
```

## TODO

- [ ] Service contract management — list, revoke, kill switch
- [ ] Block/unblock user — user_blacklist CRUD
- [ ] Per-group block sharing — user_group_sharing toggle
- [ ] Make everything private — bulk remove group attachments
- [ ] Export data — query all user data, return JSON blob
- [ ] Delete account — tombstone everything, TTL cleans up
- [ ] Notification preferences — per-type toggle (notifications table)

## Proof

Settings is CRUD on contract and blacklist tables through the SDK. Kill switch is a bulk revoke. Make everything private removes group attachments. Block a user is a single call. The protocol handles sovereignty through data operations, not special endpoints. The user controls their data.