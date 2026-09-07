# web10 SDK

For developers building apps on web10 data. One client. Groups are baked into every CRUD operation — no separate follow API, no discover endpoint, no inbox. Just groups.

## Quick Start

The browser flow (what the demo apps use). Load the SDK, open the auth popup, request your app's contract, and you're in:

```html
<script src="/docs/wapi.js"></script>
```

```js
const w = window.web10.createV3Client({ apiOrigin: 'https://api.web10.app' })

// Open the auth popup and request the app's contract (what it may do with the user's data)
window.web10.openAuthPortal('https://auth.web10.app')
w.contractRequest(
  [{ kind: 'app', app_origin: window.location.origin, permissions: { posts: ['readAll', 'create'] } }],
  'https://auth.web10.app',
  (resp) => { /* resp.status: 'approved' | 'denied' | 'error' */ },
)

// When the user signs in (a real transition — not every "return to app")
window.web10.authListen(() => {
  const t = w.readToken()  // → { username, provider, site, target, expires }
  console.log(`${t.provider}/${t.username}`)
})

// Create a post visible to your followers and the public discover board
const post = await w.create('posts', {
  text: { type: 'text', value: 'hello web10' },
}, {
  groups: [
    'web10.app/groups/alice/followers',
    '{provider}/groups/web10/discover',
  ],
})

// Read your own posts
const myPosts = await w.read('posts', { groups: ['me'], limit: 50 })

// Read the discover board (public posts)
const feed = await w.read('posts', {
  groups: ['{provider}/groups/web10/discover'],
  limit: 50,
})
```

That's the core pattern: **create with groups, read filtered by groups.** Every document is attached to groups at write time. Every read filters by group membership.

In a bundler (no `window.web10`), import the client:

```ts
import { createV3Client } from 'web10-npm'
const w = createV3Client({ apiOrigin: 'https://api.web10.app' })
```

## Creating a Client

```ts
const w = createV3Client({
  apiOrigin: 'https://api.web10.app',  // the node's API host (default)
  // token: '...',            // pre-set a token (server-side / pre-auth)
  // rtcServer: 'rtc.web10.app',  // RTC host (for web10-npm/rtc)
})
```

## Auth

Two ways in. The **consent flow** (the auth popup — the user signs in *and* grants your app's contract) is what web apps use. **Direct login** (username + password → a token) is for apps that manage their own auth.

### The consent flow (browser)

```js
// Open the auth popup
window.web10.openAuthPortal('https://auth.web10.app')

// Request the app's contract — the user approves or denies in the popup
w.contractRequest(
  [{ kind: 'app', app_origin: window.location.origin, permissions: { posts: ['readAll', 'create'] } }],
  'https://auth.web10.app',
  (resp) => {
    if (resp.status === 'approved') { /* the user granted the contract */ }
  },
)

// Listen for the sign-in transition (fires once, on a real login — not every "return to app")
window.web10.authListen(() => {
  const t = w.readToken()
  // ...
})

// Close the popup when you're done
window.web10.closeAuthPopup()
```

`contractRequest` is the unified consent protocol: it sends all your contract requests (app access + group ops) in one batch, and the callback fires with `{ status: 'approved' | 'denied' | 'error', errors? }`. `authListen` fires only on a real sign-in transition; a delivery for a different user is rejected (it can't hijack the app's identity).

### Direct login (npm / server-side)

```ts
// username + password → a token (the client stores it)
const { token } = await w.login('alice', 'password')

// Check state / read the token (decoded locally, no network)
w.isSignedIn()
const t = w.readToken()  // → { username, provider, site, target, expires } | null

// Log out
w.signOut()
```

### Account management

```ts
await w.signup('alice', 'secret', '+1234567890', 'alice@example.com')
await w.changePassword('old', 'new')
await w.changePhone('+1987654321')
await w.setEmail('alice@example.com')
await w.sendCode()               // send a verification code
await w.verifyPhone('123456')   // verify the phone
await w.verifyEmail('654321')   // verify the email
await w.setRecoveryPhone('+1987654321')
const profile = await w.getProfile()
```

## App Contracts — user-level IAM

One contract per app. Per-service, per-operation permissions. The user approves or denies in the authenticator.

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

// Kill switch — revoke all apps (one click in the authenticator UI)
```

| Permission | What it does |
|---|---|
| `readAll` | Read any content in the service |
| `create` | Create new content |
| `updateOwn` | Edit your own content |
| `deleteOwn` | Delete your own content |

Services are infinite — `posts`, `playlists`, `notes`, anything an app invents. Apps are the constraint. The user is always in control.

## CRUD with Groups

The four verbs. Groups are not a separate API surface — they're metadata on every CRUD operation.

### Create

```ts
const doc = await w.create('posts', {
  text: { type: 'text', value: 'just shipped the new groups feature' },
  media: [{ type: 'minio', value: 'alice/media/img-abc.jpg' }],
}, {
  groups: [
    '{provider}/groups/web10/discover',       // public
    'web10.app/groups/alice/followers',       // followers
    'web10.app/groups/alice/close-friends',   // close friends
  ],
  // ref_value: 'doc-123',  // point at a target (a comment/reaction on a post)
})
```

The API checks each group: is the user a member? Does their role grant `create` on that service? If a check fails, the attachment is rejected — but the document still creates, just not attached to that group.

- **No groups** = private. Only the author sees it.
- **Multiple groups** = union of members.
- **One insert, zero fan-out.** The API writes one row to `documents`, then one row per group to `doc_groups`.

### Read

Every read is group-filtered. The read opts are `{ groups, limit?, offset?, ref? }` — `groups` is required; `limit`/`offset` paginate; `ref` filters to docs whose `ref_value` matches (a post's comments/reactions).

**Your own posts** — `me` is a reserved group that returns your own documents regardless of group attachment:

```ts
const myPosts = await w.read('posts', { groups: ['me'], limit: 50 })
```

**Discover** — read from a group:

```ts
const posts = await w.read('posts', {
  groups: ['{provider}/groups/web10/discover'],
  limit: 50,
})
```

**Feed** — read across multiple groups (union):

```ts
const posts = await w.read('posts', {
  groups: [
    '{provider}/groups/web10/discover',
    'web10.app/groups/alice/followers',
    'web10.app/groups/charlie/chess-club',
  ],
  limit: 50,
  offset: 0,
})
```

**The ref filter** — a post's comments without pulling the whole service:

```ts
const comments = await w.read('comments', {
  groups: ['{provider}/groups/web10/discover'],
  ref: postDocId,
})
```

**Engagement counts** — `{ ref_value: count }` for a set of posts (exact, no cap):

```ts
const counts = await w.readRefCounts('reactions', {
  groups: ['{provider}/groups/web10/discover'],
  ref: [postDocId1, postDocId2],
})  // → { [postDocId1]: 12, [postDocId2]: 7 }
```

**Single doc by id:**

```ts
const post = await w.readById('doc-123', 'posts')
```

There's no client-side `$sort`/`$match` — the read returns docs in the node's default order (newest first). For custom sorting, filtering, aggregation, or cross-service joins, use the **flexible read** below.

### Update

```ts
await w.update('doc-123', {
  text: { type: 'text', value: 'updated content' },
}, {
  groups: ['{provider}/groups/web10/discover'],  // replace group attachments
})
```

`groups` replaces the group attachment list. Add a group → the document appears in that group's discover. Remove a group → it disappears.

### Delete

```ts
await w.delete('doc-123')
```

Tombstone pattern — the document disappears from all groups. Background cleanup compacts on schedule.

## The flexible read — `w.query`

Write a ClickHouse `SELECT` over your services and the node runs it. Read-only by construction: the safe-query engine rejects anything but a single `SELECT`, raw node tables, and table functions. Every service you reference is scoped to the groups you can read it in — so aggregations, self-joins, subqueries, and your own CTEs all work, and none can leak past your groups.

Each service exposes: `doc_id`, `author_key`, `body` (a JSON string — `JSONExtractString(body, 'field', 'value')` for fields), `ref_value`, `tags`, `created_at`, `updated_at`.

```ts
// Trending posts — cross-service self-join + aggregation
const { rows, count } = await w.query(`
  SELECT p.doc_id, p.author_key, count() AS reactions
  FROM posts p
  JOIN reactions r ON r.ref_value = p.doc_id
  GROUP BY p.doc_id, p.author_key
  ORDER BY reactions DESC
  LIMIT 20
`)

// Reaction breakdown by type — JSON body fields
const { rows } = await w.query(`
  SELECT JSONExtractString(body, 'reaction_type', 'value') AS type, count() AS n
  FROM reactions
  WHERE ref_value = '${postDocId}'
  GROUP BY type
`)
```

`rows` is keyed by the query's column names (a `body` column comes back parsed); `count` is the number of rows. Scope to specific groups with `w.query(sql, { groups: [...] })`. An unbounded query gets `LIMIT 1000` appended; an unsafe query is a **403**, a caller-SQL failure is a **400**.

## Group Operations

Groups are first-class. The SDK exposes them directly.

### Create a Group

Roles use the **per-service permission map**: each role is `{ name, permissions }` where `permissions` maps a service (or the `group` structural key) to the ops granted.

```ts
const group = await w.createGroup(
  'St. Louis Chess Club',
  'invite_only',
  [
    {
      name: 'admin',
      permissions: {
        posts: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'],
        comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup', 'modifyJoinPolicy'],
      },
    },
    {
      name: 'member',
      permissions: {
        posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        comments: ['readAll', 'create'],
      },
    },
  ],
  [{ member_key: 'alice', role: 'admin' }],
)
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
// Groups you belong to / manage
const groups = await w.getMyGroups()
const managed = await w.getGroupsManages()

// Members
const members = await w.getGroupMembers('web10.app/groups/alice/followers')
await w.addGroupMember('web10.app/groups/alice/followers', 'bob', 'member')
await w.removeGroupMember('web10.app/groups/alice/close-friends', 'bob')

// Update group settings
await w.updateGroup('web10.app/groups/alice/close-friends', { join_policy: 'request' })
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

### Sharing toggle

```ts
// Pause sharing with a group without leaving
await w.setSharing('web10.app/groups/dave/jazz-collectors', false)
await w.setSharing('web10.app/groups/dave/jazz-collectors', true)  // resume
```

## Media

Three-step upload: request a presigned URL, upload to object storage, confirm.

```ts
// 1. Request a presigned upload URL
const presigned = await w.requestMediaUploadUrl({
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: file.size,
})  // → { upload_url, fields, object_key, content_type }

// 2. POST the file (FormData) to presigned.upload_url
const formData = new FormData()
for (const [k, v] of Object.entries(presigned.fields || {})) formData.append(k, v)
formData.append('file', file, 'photo.jpg')
await fetch(presigned.upload_url, { method: 'POST', body: formData })

// 3. Confirm — store the reference (the object key), not a URL
const record = await w.confirmMediaUpload({
  object_key: presigned.object_key,
  filename: 'photo.jpg',
  mime_type: 'image/jpeg',
})

// Read URL (presigned GET — the doc stores the object key, not a live URL)
const { read_url } = await w.getMediaReadUrl(record.body.object_key)

// List / delete your media
const media = await w.listMedia({ limit: 50 })
await w.deleteMedia(record.doc_id)
```

## App Store

```ts
// Register an app (anonymous — the app identifies itself by url)
await w.registerApp({
  url: 'https://myapp.com',
  name: 'My App',
  description: 'A web10 app',
  icon_url: 'https://myapp.com/icon.png',
})

// List approved apps
const apps = await w.getApps()

// Rate an app (1-5)
await w.rateApp('https://myapp.com', 5)

// Read ratings
const ratings = await w.getAppRatings('https://myapp.com')
```

## Resources

- [Protocol Spec](/docs/protocol-spec) — the data model, auth, permissions
- [Groups](/docs/groups) — groups as the unifying primitive
- [Conventions](/docs/conventions) — document typing, ref pattern, media
- [CLI Quickstart](/docs/cli-quickstart) — drive a node from the terminal

## Source

The SDK source lives in [`sdk/`](https://github.com/jacoby149/web10/tree/dev/sdk) in this repository.
