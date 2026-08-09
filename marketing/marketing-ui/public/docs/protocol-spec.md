# web10 Protocol Specification

**Version:** 3.0.0-draft
**Status:** Draft — under active development

## 1. Overview

web10 is a protocol for **user-owned data** on the internet. Each user's data lives in a single data lake — one table for everything structured. Apps are stateless frontends that hold a **scoped, expiring token** and talk to the user's data over a tiny CRUD API. The data outlives any app.

### 1.1 Design Principles

- **Data ownership:** Users own their data. Apps are lenses, not platforms.
- **Statelessness:** Apps hold nothing but a scoped, expiring token.
- **User-level IAM:** For the first time, a user has AWS-grade control over their data — per-app, per-service, per-operation permissions.
- **Groups as the primitive:** Follows, discovery, sharing, DMs — all the same group mechanism.
- **Portability:** Data, identity, and audience move with the user across nodes.
- **Open protocol:** Self-hostable nodes; the reference implementation is one valid node, not the only one.

## 2. Data Model

### 2.1 The Documents Table

Everything structured lives in one table. Posts, reactions, comments, notes, mail — all documents. The `collection_name` column is the service label. The `body` column is a JSON blob — schemaless, app-defined.

```
documents:
  doc_id          — unique identifier
  author_key      — who created it (username)
  collection_name — service label ('posts', 'reactions', 'comments', ...)
  body            — JSON content (typed at the leaf level)
  tags            — array of strings (fast filtering)
  ref_value       — reference to another document
  created_at      — timestamp
  updated_at      — timestamp (used for versioning)
```

### 2.2 Document-to-Group Mapping

Documents are attached to groups through a separate mapping table:

```
doc_groups:
  doc_id    — the document
  group_id  — the group it's attached to
```

A document with no group attachments is private — only the author sees it. Attaching to a group makes it discoverable by group members.

### 2.3 The Ref Pattern

Documents reference each other through the `ref` type in the JSON body. This is how reactions, comments, and replies work — no dedicated tables:

```json
// A reaction to a post
{
  "ref": { "type": "ref", "value": "post-123" },
  "reaction_type": { "type": "text", "value": "like" }
}

// A comment on a post
{
  "ref": { "type": "ref", "value": "post-123" },
  "parent_ref": { "type": "ref", "value": "comment-abc" },
  "text": { "type": "text", "value": "great post!" }
}
```

## 3. Authentication

### 3.1 Token Format

Tokens are JWTs with the following payload:

```json
{
  "username": "alice",
  "provider": "api.web10.app",
  "site": "music.web10.com",
  "target": "api.web10.app",
  "expires": "2026-12-01T00:00:00.000Z",
  "type": "tiered"
}
```

| Claim | Meaning |
|---|---|
| `username` | The user's web10 username |
| `provider` | The node that minted the token |
| `site` | The app hostname the token is scoped to |
| `target` | Target provider (for cross-node tokens) |
| `expires` | ISO-8601 expiry |
| `type` | Token type hint |

### 3.2 Auth Flow

1. App opens the authenticator popup (`auth.web10.app`)
2. User enters credentials
3. Server verifies and mints a scoped JWT
4. Popup posts the token back to the app via `postMessage`
5. App stores the token in a cookie
6. Every subsequent API call carries the token

### 3.3 Token Certification

Every API request certifies the token before touching data:
- Token is signed and valid
- `provider` matches this node
- `username` is present
- `expires` is in the future

## 4. Permissions — Two Contracts

Two contract types. They control completely different concerns.

### 4.1 App Contracts — Infrastructure Trust

"What can this app do with my data?" One contract per app. Per-service, per-operation permissions. CORS. Browser-enforced.

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

**The paradigm:** services are infinite (`posts`, `playlists`, `notes` — any app can invent new ones). Apps are the constraint. One contract per app. The user approves or denies in the authenticator.

**Kill switch:** revoke all app contracts → no website touches your data. Ever.

### 4.2 Group Contracts — People Access

"Who can see my content?" Groups hold people and roles. Content is attached to groups. Members discover it based on their role.

```json
{
  "group_id": "web10.app/groups/alice/followers",
  "join_policy": "open",
  "roles": [
    { "name": "owner", "services": ["*"], "permissions": ["readAll", "create", "updateOwn", "deleteOwn", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"] },
    { "name": "member", "services": ["posts"], "permissions": ["readAll"] }
  ]
}
```

### 4.3 The Decision Chain

For any operation, both contracts must pass:

```
1. App contract: origin allowed for this service + operation? → yes/no
2. Group contract: requester a member with the right role? → yes/no
Both must pass.
```

The app contract is the outer wall. The group contract is the inner permission.

### 4.4 Permission Levels

| Permission | What it does |
|---|---|
| `readAll` | Read any content in the service |
| `create` | Create new content |
| `updateOwn` | Edit your own content |
| `deleteOwn` | Delete your own content |
| `hideAll` | Hide content from group discover (moderation) |
| `manageRoles` | Manage role definitions |
| `assignRoles` | Add or promote members |
| `revokeRoles` | Remove or demote members |
| `deleteGroup` | Delete the group |

## 5. CRUD API

All CRUD operations use a unified `POST /v3/<action>` pattern with a JSON body carrying the token and parameters.

### 5.1 Create

```
POST /v3/create
Body: { token, collection, body, groups? }
```

Creates a document in the specified collection. Optionally attaches to groups. Returns the created document.

### 5.2 Read

```
POST /v3/read
Body: { token, collection, groups, limit?, offset? }
```

Returns documents attached to the specified groups where the user is a member. The `groups` parameter is required — `["me"]` returns the user's own documents.

### 5.3 Update

```
POST /v3/update
Body: { token, doc_id, body, groups? }
```

Updates a document's body and/or group attachments.

### 5.4 Delete

```
POST /v3/delete
Body: { token, doc_id }
```

Tombstones the document. It disappears from all groups.

## 6. Group Operations

```
POST /v3/groups/create    — create a group with roles and members
POST /v3/groups/get       — get group details
POST /v3/groups/list      — get groups you belong to
POST /v3/groups/manages   — get groups you manage
POST /v3/groups/update    — update group settings
POST /v3/groups/join      — join (open) or request join (request/invite)
POST /v3/groups/leave     — leave a group
POST /v3/groups/invite    — invite a member
POST /v3/groups/accept-invite
POST /v3/groups/decline-invite
POST /v3/groups/members/list
POST /v3/groups/members/add
POST /v3/groups/members/remove
```

## 7. App Contract Operations

```
POST /v3/app-contracts/add     — add an app contract
POST /v3/app-contracts/list    — list active contracts
POST /v3/app-contracts/revoke  — revoke a contract
```

## 8. Blocking

```
POST /v3/block          — block a user entirely
POST /v3/unblock        — unblock a user
POST /v3/block-in-group — block a user from your content in one group
POST /v3/unblock-in-group
```

## 9. Media

```
POST /v3/media/upload    — upload media (presigned URL flow)
POST /v3/media/list      — list media
POST /v3/media/delete    — delete media
```

## 10. Security Invariants

- **I1.** A provider can cryptographically verify who issued any token.
- **I2.** Authorization decisions use only verified token data.
- **I3.** A request can only touch the addressed user's data.
- **I4.** Private content is unreadable by the node operator (e2e encryption, planned).
- **I5.** Every actor acts under a scoped, expiring, revocable token.

## 11. App Contract Requests (ACR)

Apps request access through **App Contract Requests (ACR)**. The user approves or denies in the authenticator. One request covers all services — create or replace, the operation is identical. The consent UI diffs against whatever contract exists already.

## 12. Group Contract Requests (GCR)

Apps cannot directly create or modify groups. They submit **Group Contract Requests (GCR)** — the user approves through the authenticator. One request per operation. Granular consent.