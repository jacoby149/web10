# web10 SDK

Build apps on web10. One client. Groups are baked into every CRUD operation.

## Quick Start

```bash
npm install web10-npm
```

```ts
import { createClient } from 'web10-npm'

const w = createClient({ authUrl: 'https://auth.web10.app' })

// Wait for the user to log in
await w.login()

// Create a post visible to your followers and the public discover board
const post = await w.create('posts', {
  text: { type: 'text', value: 'hello web10' },
}, {
  groups: [
    'web10.app/groups/alice/followers',
    'web10.app/groups/web10/discover',
  ],
})

// Read your own posts
const myPosts = await w.read('posts', { groups: ['me'] })

// Read the discover board (public posts)
const feed = await w.read('posts', {
  groups: ['web10.app/groups/web10/discover'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

That's the core pattern: **create with groups, read filtered by groups**. Every document is attached to groups at write time. Every read filters by group membership. No separate follow API, no discover endpoint, no inbox — just groups.

## Creating a Client

```ts
const w = createClient({
  authUrl: 'https://auth.web10.app',   // auth popup host
  apiOrigin: 'https://api.web10.app',  // optional, defaults to api.web10.app
})
```

## Auth

```ts
// Open the auth popup (resolves when the user logs in)
await w.login()

// Listen for sign-in / sign-out
w.authListen((signedIn) => {
  if (signedIn) {
    const token = w.readToken()
    console.log(`${token.username}@${token.provider}`)
  }
})

// Check if signed in
w.isSignedIn()

// Log out
w.signOut()
```

The auth popup is hosted at `auth.web10.app` (or your own node). It handles login, signup, password reset, and token minting. Your app opens the popup, receives a JWT via `postMessage`, and stores it in a cookie.

### Signup

```ts
await w.signup({
  username: 'alice',
  password: 'secret',
  phone: '+1234567890',  // optional
  email: 'alice@example.com',  // optional
})
```

### Account Management

```ts
await w.changePass({ password: 'old', newPass: 'new' })
await w.changePhone({ phone: '+1987654321' })
await w.setEmail({ email: 'alice@example.com' })
await w.verifyPhone({ code: '123456' })
await w.verifyEmail({ code: '654321' })
const profile = await w.getProfile()
```

## App Contracts — User-Level IAM

This is the first time a user has AWS-grade control over their data. One contract per app. Per-service, per-operation permissions. The user approves or denies in the authenticator.

```ts
// App declares what it needs — one call covers all services
await w.addAppContract('music.web10.com', {
  posts: ['readAll', 'create'],
  playlists: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  comments: ['readAll'],
})

// List active contracts
const contracts = await w.listAppContracts()

// Revoke one app
await w.revokeAppContract('music.web10.com')

// Kill switch — revoke all apps
// (done in the authenticator UI, one click)
```

**Permissions:**

| Permission | What it does |
|---|---|
| `readAll` | Read any content in the service |
| `create` | Create new content |
| `updateOwn` | Edit your own content |
| `deleteOwn` | Delete your own content |

Services are infinite — `posts`, `playlists`, `notes`, anything an app invents. Apps are the constraint. You have three apps you use. Three contracts. The user is always in control.

## CRUD with Groups

The four verbs. Groups change everything — they're not a separate API surface, they're metadata on every CRUD operation.

### Create

```ts
const doc = await w.create('posts', {
  text: { type: 'text', value: 'just shipped the new groups feature' },
  media: [{ type: 'minio', value: 'alice/media/img-abc.jpg' }],
}, {
  groups: [
    'web10.app/groups/web10/discover',       // public
    'web10.app/groups/alice/followers',       // followers
    'web10.app/groups/alice/close-friends',   // close friends
  ],
})
```

The API checks each group: is the user a member? Does their role grant `create` on that service? If a check fails, the attachment is rejected — but the document still creates, just not attached to that group.

- **No groups** = private. Only the author sees it.
- **Multiple groups** = union of members. Anyone in any group with the right role can read it.
- **One insert, zero fan-out.** Behind the scenes the API writes one row to `documents`, then one row per group to `doc_groups`.

### Read

Every read is group-filtered. You see a document because you're a member of a group it's attached to.

**Your own posts** — `me` is a reserved group that returns your own documents regardless of group attachment:

```ts
const myPosts = await w.read('posts', {
  groups: ['me'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

**Discover** — read from a group:

```ts
const posts = await w.read('posts', {
  groups: ['web10.app/groups/web10/discover'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

**Feed** — read across multiple groups (union):

```ts
const posts = await w.read('posts', {
  groups: [
    'web10.app/groups/web10/discover',
    'web10.app/groups/alice/followers',
    'web10.app/groups/charlie/chess-club',
  ],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

**Filtering** — `$match` filters before sorting:

```ts
const posts = await w.read('posts', {
  groups: ['web10.app/groups/web10/discover'],
  $match: {
    author_key: 'alice',
    tags: ['jazz'],
  },
  $limit: 50,
})
```

| Field | Speed |
|---|---|
| `author_key`, `collection_name`, `created_at` | Fast (indexed) |
| `tags` | Fast (`has()` function) |
| `body.*` (JSON path) | Slower (JSON scan) |

### Update

```ts
await w.update('posts', { _id: 'doc-123' }, {
  $set: { text: { type: 'text', value: 'updated content' } },
}, {
  $groups: ['web10.app/groups/web10/discover'],  // replace group attachments
})
```

`$groups` replaces the group attachment list. Add a group → the document appears in that group's discover. Remove a group → it disappears.

### Delete

```ts
await w.delete('posts', { _id: 'doc-123' })
```

Tombstone pattern — the document disappears from all groups. Background cleanup compacts on schedule.

## Group Operations

Groups are first-class. The SDK exposes them directly.

### Create a Group

```ts
const group = await w.createGroup({
  name: 'St. Louis Chess Club',
  join_policy: 'invite_only',
  roles: [
    {
      name: 'admin',
      services: ['*'],
      permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
    },
    {
      name: 'member',
      services: ['posts', 'comments'],
      permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    },
  ],
  members: [
    { member_key: 'alice', role: 'admin' },
  ],
})
// → { group_id: 'web10.app/groups/alice/st-louis-chess-club' }
```

### Join / Leave

```ts
// Open policy — instant
await w.joinGroup('web10.app/groups/alice/followers')

// Request policy — pending until owner approves
await w.requestJoin('web10.app/groups/alice/followers')

// Leave
await w.leaveGroup('web10.app/groups/alice/followers')
```

### Invite / Accept

```ts
await w.inviteMember('web10.app/groups/alice/close-friends', 'bob', 'member')
await w.acceptInvite('web10.app/groups/alice/close-friends')
await w.declineInvite('web10.app/groups/alice/close-friends')
```

### Manage

```ts
// Get groups you belong to
const groups = await w.getGroups({ member: 'alice' })

// Get groups you manage
const managed = await w.getGroups({ manages: 'alice' })

// Get members
const members = await w.getMembers('web10.app/groups/alice/followers')

// Remove member
await w.removeMember('web10.app/groups/alice/close-friends', 'bob')

// Update group settings
await w.updateGroup('web10.app/groups/alice/close-friends', {
  join_policy: 'request',
})
```

### Blocking

```ts
// Block someone entirely
await w.blockUser('bob')
await w.unblockUser('bob')

// Block someone in one group (they stay a member, just can't see your content)
await w.blockUserInGroup('bob', 'web10.app/groups/dave/jazz-collectors')
await w.unblockUserInGroup('bob', 'web10.app/groups/dave/jazz-collectors')
```

### Sharing Toggle

```ts
// Pause sharing with a group without leaving
await w.setSharing('web10.app/groups/dave/jazz-collectors', false)
await w.setSharing('web10.app/groups/dave/jazz-collectors', true)  // resume
```

## Media

Three-step upload: request presigned URL, upload to object storage, confirm.

```ts
// Convenience — does all three steps
const record = await w.upload(file, {
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  altText: 'screenshot',
})

// Manual flow
const presigned = await w.requestUploadUrl({
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: file.size,
})
// POST FormData to presigned.upload_url
const record = await w.confirmUpload({
  url: presigned.upload_url,
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: file.size,
})

// Get a read URL (presigned GET, cached)
const { readUrl } = await w.getReadUrl(record.object_key)
```

## App Store

```ts
// Register an app
await w.registerApp({
  url: 'https://myapp.com',
  name: 'My App',
  description: 'A web10 app',
  iconUrl: 'https://myapp.com/icon.png',
})

// List approved apps
const apps = await w.getApps()

// Rate an app (1-5)
await w.rateApp({ appId: 'https://myapp.com', rating: 5 })

// Read ratings
const ratings = await w.getAppRatings('https://myapp.com')
```

## v2 Compatibility

The legacy `wapi.js` SDK (v2) is still available for backward compatibility. The v3 `createClient` is the primary SDK. Key differences:

| v2 (wapi.js) | v3 (createClient) |
|---|---|
| `create(service, body)` — no groups | `create(service, body, { groups })` — groups required for visibility |
| `read(service, query)` — raw collection | `read(service, { groups })` — always group-filtered |
| SMR contracts per service | App contracts per app with per-service permissions |
| Separate follow/friend APIs | Follow = join group |
| `discoverable` boolean | Groups handle visibility. `web10/discover` = public board |
| Inbox fan-out | No inbox. Discovery is group membership query |

## Resources

- [Protocol Spec](/docs/protocol-spec) — the data model, auth, permissions
- [Groups](/docs/groups) — groups as the unifying primitive
- [Conventions](/docs/conventions) — document typing, ref pattern, media
- [CLI Quickstart](/docs/cli-quickstart) — drive a node from the terminal

## Source

The SDK source lives in [`sdk/`](https://github.com/jacoby149/web10/tree/dev/sdk) in this repository.