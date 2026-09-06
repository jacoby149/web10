# web10 Protocol Specification

**Version:** 3

The reference for the web10 v3 protocol: the data model, the token, the two
contract types, the full API surface (CRUD, the flexible read, groups,
contracts, media, account, recovery), the engagement model, the ad model, and
the security invariants. Every request/response shape below is the real API —
copy-pasteable against a running node.

## 1. Overview

web10 is a protocol for **user-owned data** on the internet. Each user's data
lives in a single data lake — one table for everything structured. Apps are
stateless frontends that hold a **scoped, expiring token** and talk to the
user's data over a tiny CRUD API. The data outlives any app.

### 1.1 Design Principles

- **Data ownership:** Users own their data. Apps are lenses, not platforms.
- **Statelessness:** Apps hold nothing but a scoped, expiring token.
- **User-level IAM:** A user has per-app, per-service, per-operation control
  over their data.
- **Groups as the primitive:** Follows, discovery, sharing, DMs, communities —
  all the same group mechanism.
- **Readable by design:** The node is a readable, accountable broker — content
  is node-readable (discovery, search, auditability); access is
  terms-controlled (D41).
- **Open protocol:** Self-hostable nodes; the reference implementation is one
  valid node, not the only one.

## 2. Data Model

### 2.1 The Documents Table

Everything structured lives in one table. Posts, reactions, comments, notes,
mail — all documents. `collection_name` is the service label; `body` is a JSON
blob — schemaless, app-defined.

```
documents:
  doc_id          String           — unique identifier (node-generated)
  author_key      String           — who created it (the username)
  collection_name String           — service label ('posts', 'reactions', 'comments', ...)
  body            String           — JSON content (typed at the leaf level)
  ref_value       String           — the universal link: a reference to another document's doc_id
  tags            Array(String)    — freeform labels (fast filtering: has(tags, 'ad'))
  created_at      DateTime64(3)
  updated_at      DateTime64(3)    — version key
  deleted         UInt8            — tombstone flag (0 = live, 1 = deleted)
  ad_mode         String           — 'none' | 'pinned' (the ad preference, §11)
  ad_target       String           — the pinned ad's doc_id (when ad_mode = 'pinned')

ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, doc_id)
```

**Versioning:** updates are inserts with a higher `updated_at`; the engine
keeps the latest version per `(author_key, doc_id)`. **Deletes are
tombstones** — an insert with `deleted = 1`; every read filters
`WHERE deleted = 0`.

### 2.2 Document-to-Group Mapping

Documents are attached to groups through a separate mapping table:

```
doc_groups:
  doc_id      String
  group_id    String
  created_at  DateTime64(3)
  updated_at  DateTime64(3)
  deleted     UInt8
```

A document with no group attachments is private — only the author sees it.
Attaching to a group makes it visible to the principals the group's roles
grant access to (§4.2).

### 2.3 The Ref Pattern

`ref_value` is the universal link — any document can point at any other
document's `doc_id`. This is how comments, reactions, replies, and ads
compose — no dedicated tables:

```json
// A comment on a post (a `comments` document authored by the commenter)
{ "text": "great post!" }          // body
// ref_value: "doc-post-123"       // the top-level column, set at create
```

Leaf-typed `ref` values inside `body` serve the same purpose for
app-internal references (e.g. a post's `media_refs` point at media document
ids and are resolved to read URLs on read).

## 3. Authentication

### 3.1 Token Format

Tokens are JWTs. A v3 token carries exactly these claims:

```json
{
  "username": "alice",
  "provider": "api.web10.app",
  "site": "web10",
  "expires": "2026-12-01T00:00:00.000000"
}
```

| Claim | Meaning |
|---|---|
| `username` | The user's web10 username (the `user_key` used everywhere) |
| `provider` | The node that minted the token — also the API host to address |
| `site` | The app/site hostname the token is scoped to (defaults to `"web10"`) |
| `expires` | ISO-8601 expiry — **not** the standard numeric `exp` claim; the SDK parses it with `Date.parse()` |

`target` is a legacy optional claim on cross-node tokens; the permission
check still honors it while cross-node federation (I1) is in flight. New
tokens minted by a v3 node do not carry it.

### 3.2 Token Certification

Every API request certifies the token before touching data:

- **No token** → the request reads as the node's `anon` member (the public
  board — D41: the node is readable by design). Anon's access stays bounded
  by group grants (I3).
- **Signed and valid** — the signature is verified with the node's key.
- **`provider` matches this node** — a token from another node is certified
  remotely (federation, in flight).
- **`username` is present.**
- **`expires` is in the future** (anon is exempt).

### 3.3 The Auth Flow

1. App opens the authenticator popup (`auth.web10.app`)
2. User signs in (username + password, or the contact flow — §3.4)
3. Server verifies and mints a scoped JWT (`POST /v3/login`)
4. Popup posts the token back to the app via `postMessage`
5. App stores the token in a cookie (`SameSite=Lax`, `Secure`, 60-day max age)
6. Every subsequent API call carries the token

The handoff is idempotent (D45): the popup re-sends the token on every
"return to app," and the SDK treats a repeat delivery for the same user as a
no-op for the signed-in callback.

### 3.4 Contact-Anchored Auth (D61)

The account is anchored on a **contact** — a phone number OR an email —
verified by a 6-digit code. The contact is the front door: **enter contact →
code → pick an account on that contact (or create a new username) → signed
in.** Sign-up, sign-in, and password-change are the same flow. A contact can
carry many usernames.

The requirement is **node policy** (D10): the `require_contact` node-config
flag. When on, `POST /v3/signup` requires a phone or email (401
`CONTACT_REQUIRED`); username + password login stays as a fallback for
accounts without a contact.

The three endpoints are **unauthenticated** — the contact + code are the
credential:

```
POST /v3/recovery/request
Body: { "contact": "+15551234567" }        // or "user@example.com"
→ { "sent": true, "kind": "phone" }        // "email" for an email contact
```

Sends a 6-digit code via Twilio Verify — `channel=sms` for a phone,
`channel=email` for an email (one provider for both). An invalid contact
shape → 400 `BAD_CONTACT`. The response is the same whether or not the
contact is registered (no existence oracle). Sending is rate-limited per
contact (429 `RATE_LIMIT`).

```
POST /v3/recovery/verify
Body: { "contact": "+15551234567", "code": "123456" }
→ {
    "accounts": [ { "username": "alice", "email": "alice@example.com" } ],
    "verify_token": "eyJhbG..."
  }
```

Checks the code (wrong code → 401 `WRONG_CODE`). Returns the **list of
accounts** on that contact (the "pick one of the users" step) + a
short-lived (5-minute) signed `verify_token` — the proof the code was right.
An empty `accounts` list is valid — it means "no account on this contact
yet, create one" (the unified sign-up path).

```
POST /v3/recovery/complete
Body: { "verify_token": "eyJhbG...", "username": "alice", "new_password": "optional" }
→ { "token": "eyJhbG..." }
```

Validates `verify_token` (signature + 5-minute expiry +
`purpose: "recovery"`), confirms the picked account actually carries the
contact (defense in depth → 401 `CONTACT_NOT_LINKED`), then:

- **Existing account** — signs in. A `new_password` sets the password (the
  password-change path — no old password required).
- **New username** — creates the account carrying the verified contact (a
  random password when none is set, so the contact is the credential).

Marks the contact verified and mints the login JWT (the same shape the popup
flow mints). The `verify_token` is the gate: `complete` cannot mint a token
without a valid, unexpired one, so a raw `{contact, username}` can't sign in.

### 3.5 Account Endpoints

```
POST /v3/signup
Body: { "username": "alice", "password": "secret", "phone": "+15551234567", "email": "alice@example.com" }
→ { "username": "alice", "phone": "+15551234567", "email": "alice@example.com" }
```

Username: `^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$` (401 `BAD_USERNAME`);
password non-empty (401 `BAD_PASSWORD`); duplicate → 401 `EXISTS`. The new
account is auto-enrolled in the discover group (every account is a member of
the universal public board by default).

```
POST /v3/login
Body: { "username": "alice", "password": "secret", "site": "app.example.com" }
→ { "token": "eyJhbG..." }

POST /v3/change-pass       Body: { token, password, new_pass }  → { "status": "changed" }
POST /v3/change-phone      Body: { token, phone }               → { "phone": "..." }
POST /v3/set-email         Body: { token, email }               → { "email": "..." }
POST /v3/send_code         Body: { token }                      → the verification SID (a string)
POST /v3/verify-phone      Body: { token, code }                → { "phone_verified": true }
POST /v3/verify-email      Body: { token, code }                → { "email_verified": true }
POST /v3/set_recovery_phone Body: { token, phone }              → { "phone_number": "..." }
POST /v3/profile           Body: { token }                      → { "username", "phone", "email", "phone_verified", "email_verified" }
```

All account mutations update the `users` table via `ReplacingMergeTree` —
new insert with a higher `updated_at`.

## 4. Permissions — Two Contracts

Two contract types. They control completely different concerns.

### 4.1 App Contracts — Infrastructure Trust

"What can this app do with my data?" One contract per app origin.
Per-service, per-operation permissions — the same permission language as
group roles (§4.2):

```json
{
  "allowed_origin": "https://music.web10.com",
  "permissions": {
    "posts": ["readAll", "create"],
    "playlists": ["readAll", "create", "updateOwn", "deleteOwn"],
    "comments": ["readAll"]
  }
}
```

**The paradigm:** services are infinite (`posts`, `playlists`, `notes` — any
app can invent new ones). Apps are the constraint. One contract per origin.
The user approves or denies in the authenticator.

**Kill switch:** revoke all app contracts → no website touches your data.
Ever.

**Origin is curation, not a wall (D64):** the `Origin` header is
client-controlled — a browser enforces it, but a non-browser client forges it
freely. The real boundary is the user's token + the user's app contract
(user-centric). Abuse prevention is rate limiting (§6.4), not origin gating.

### 4.2 Group Contracts — People Access

"Who can see my content?" Groups hold people (and principal classes) and
roles. Content is attached to groups. Access is decided by the reader's
**effective role** in the group.

**Roles are per-service permission maps (D58).** A role is
`{ name, permissions: { service: [ops] } }` — the same shape the app contract
uses, so there is one permission language across both contract types:

```json
{
  "group_id": "api.web10.app/groups/charlie/st-louis-chess-club",
  "join_policy": "request",
  "roles": [
    {
      "name": "owner",
      "permissions": {
        "*": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll"],
        "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
      }
    },
    {
      "name": "moderator",
      "permissions": {
        "posts": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll"],
        "comments": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll"],
        "group": ["assignRoles", "revokeRoles"]
      }
    },
    {
      "name": "member",
      "permissions": {
        "posts": ["readAll", "create", "updateOwn", "deleteOwn"],
        "comments": ["readAll", "create", "updateOwn", "deleteOwn"]
      }
    }
  ]
}
```

- **`*`** is the wildcard over document services.
- **`group`** is the reserved key for management ops on the group itself
  (`manageRoles`, `assignRoles`, `revokeRoles`, `deleteGroup`).
- **`hideAll`** is a *content* op (it hides a doc), scoped to the service key
  — a moderator with `hideAll` on `posts` can hide posts but not comments.
- **One role per member.** The per-service map makes a single role fully
  expressive — any (principal, service, permission) matrix fits in one map.
- By convention, roles are listed most-privileged to least; the last entry is
  the baseline member role.

**Principal classes (D58).** Three nested classes, stored as reserved
`group_members` rows — no new table:

| Class | Who it is | Nesting |
|---|---|---|
| `anyone` | every request, signed in or not | broadest |
| `authenticated` | valid token, any web10 user, member or not | ⊂ anyone |
| `member` | has a member row in this group | ⊂ authenticated |

**Union semantics:** a principal's effective permissions in a group = the
union of the permission maps of every class they belong to. A signed-out
visitor holds the `anyone` grant; a signed-in stranger holds `anyone` ∪
`authenticated`; a member holds `anyone` ∪ `authenticated` ∪ their member
role. The nesting enforces the invariant for free: a member always sees at
least what a signed-in stranger sees.

**Public / private is a role grant, not a flag:** fully public → `readAll`
on `anyone`; signed-in only → on `authenticated`; private → only on member
roles. Join policy stays orthogonal — it controls how a *human* becomes a
*member* (`open` = instant, `request` = pending approval, `invite_only` =
owner adds).

### 4.3 The Decision Chain

For any operation, both contracts must pass:

```
1. App contract: origin allowed for this service + operation? → yes/no
2. Group contract: the reader's effective role grants the op on this
   service in this group? → yes/no
Both must pass.
```

The app contract is the outer wall. The group contract is the inner
permission.

### 4.4 Permission Levels

| Permission | What it does | Scope |
|---|---|---|
| `readAll` | Read content in the service | service key (or `*`) |
| `create` | Create new content | service key (or `*`) |
| `updateOwn` | Edit your own content | service key (or `*`) |
| `updateAll` | Edit any content in the group | service key (or `*`) |
| `deleteOwn` | Delete your own content | service key (or `*`) |
| `deleteAll` | Delete any content in the group | service key (or `*`) |
| `hideAll` | Hide content from the group's discover (moderation) | service key (or `*`) |
| `manageRoles` | Manage role definitions | `group` key |
| `assignRoles` | Add or promote members | `group` key |
| `revokeRoles` | Remove or demote members | `group` key |
| `deleteGroup` | Delete the group | `group` key |

## 5. CRUD API

All CRUD operations use a unified `POST /v3/<action>` pattern with a JSON
body carrying the token and parameters.

### 5.1 Create

```
POST /v3/create
Body: {
  "token": "eyJhbG...",
  "service": "posts",
  "body": { "text": "hello world" },
  "groups": ["api.web10.app/groups/web10/discover"],   // optional
  "ref_value": "doc-post-123",                          // optional — point at a target doc
  "ad_preference": { "mode": "pinned", "target": "doc-ad-1" }  // optional
}
→ { "doc_id": "doc-abc123", "author_key": "alice", "service": "posts", "body": {...}, "ref_value": "...", "tags": [...], "ad_mode": "none", "ad_target": "", "created_at": "...", "updated_at": "...", "groups": [...] }
```

Creates a document in the specified service. The node generates the
`doc_id`. `tags` are read from `body.tags`.

**The write gate (D58):** the author may only attach the doc to groups their
effective role grants `create` on this service. Non-writable groups are
dropped from the attachment; if none are writable → 403.

### 5.2 Read

```
POST /v3/read
Body: {
  "token": "eyJhbG...",              // optional — a missing token reads as anon
  "service": "posts",
  "groups": ["api.web10.app/groups/web10/discover"],  // required unless doc_id
  "limit": 50,                        // default 50
  "offset": 0
}
→ [ { "doc_id", "author_key", "body", "tags", "created_at", "ref_value", "ad_mode", "ad_target", "service", "ad"?, "node_ad"? } ]
```

Returns documents attached to the specified groups where the reader's
effective role grants `readAll` on the service. `groups: ["me"]` returns the
documents in all the reader's readable groups.

**Single-doc read:** `doc_id` instead of `groups` —
`{ token, service, doc_id }` → the one document (404 if not readable).

**The `ref` filter** — "give me the comments/reactions for these posts":

```
Body: { "token": "...", "service": "comments", "groups": ["..."], "ref": "doc-post-123" }
// or a list: "ref": ["doc-post-123", "doc-post-456"]
```

Routed through the safe-query engine (§6), so it carries the full boundary —
group filter + block/sharing/hidden — not just a raw `WHERE`.

**The `count` shape** — with `ref`, return a `{ref_value: count}` map instead
of the docs (the server-side engagement count — exact for the reader's
readable groups, no cap):

```
Body: { "token": "...", "service": "reactions", "groups": ["..."], "ref": ["doc-1", "doc-2"], "count": true }
→ { "doc-1": 42, "doc-2": 7 }
```

**Ranked read:** an optional `sort` (power-mean feed knobs: `recency`,
`likes`, `comments`, `half_life_ms`, `character`) returns the board
pre-sorted by the reader's algorithm (D36).

**Access failure vs empty result (D42):** an explicit group list the reader's
effective role grants `readAll` on *none* of → **403**
`"not a member of the requested group"` — an access failure the app can act
on, not an empty result. (Anon is exempt: an empty public board is a valid
empty result.)

**What the read attaches:** media refs in `body` are resolved to presigned
read URLs; a pinned ad (`ad_mode: "pinned"`) comes back inline under `ad`
(I3-checked — a pinned ad the reader can't see is simply absent); an active
node ad (D57) comes back under `node_ad`; transcoded video gets a signed
HLS `manifest_url` in `body.transcoding_settings`.

### 5.3 Update

```
POST /v3/update
Body: {
  "token": "eyJhbG...",
  "doc_id": "doc-abc123",
  "body": { "text": "edited" },       // merged into the existing body
  "groups": ["..."],                  // optional — replaces the attachments
  "ad_preference": { "mode": "none" } // optional — omitted = keep existing
}
→ { "doc_id": "doc-abc123", ... }
```

A new version with a higher `updated_at`. The author must own the doc
(`author_key` match) and hold `updateOwn` on the service.

### 5.4 Delete

```
POST /v3/delete
Body: { "token": "eyJhbG...", "doc_id": "doc-abc123" }
→ { "doc_id": "doc-abc123", "status": "deleted" }
```

Tombstones the document and detaches it from all groups. It disappears from
every group read.

## 6. The Flexible Read (Query Engine)

### 6.1 `POST /v3/query` (D63)

The caller writes a ClickHouse `SELECT` over their **service names**
(`posts`, `comments`, …) and the node runs it — read-only by construction.

```
POST /v3/query
Body: {
  "token": "eyJhbG...",                        // optional — a missing token reads as anon
  "sql": "SELECT p.doc_id, count() AS reactions FROM posts p JOIN reactions r ON r.ref_value = p.doc_id GROUP BY p.doc_id ORDER BY reactions DESC",
  "groups": ["..."]                            // optional — omitted = all the reader's groups
}
→ {
    "rows": [ { "doc_id": "doc-abc123", "reactions": 42 } ],
    "count": 1
  }
```

Each service exposes: `doc_id`, `author_key`, `body` (a JSON string —
`JSONExtractString(body, 'field', 'value')` for fields), `ref_value`, `tags`,
`created_at`, `updated_at`. `rows` is keyed by the query's column names; a
`body` column comes back parsed; datetimes are ISO-8601.

**What the caller can do:** filters, cross-service self-joins
(`ref_value = doc_id`), aggregations, subqueries, and their own CTEs — the
"do anything" read power.

**What the caller cannot do:** anything but a single `SELECT` (DML/DDL →
403), reference raw node tables (`documents`, `doc_groups`, … → 403), use
table functions (`file()`, `s3()`, … → 403), or touch a service the app
contract doesn't grant `readAll` on (→ 403).

### 6.2 The Boundary: a Wall, Not a Membrane

The caller's SQL is **never executed as-is**. It is parsed into an AST,
validated (single `SELECT`, every table reference checked), and re-emitted
with each referenced service replaced by an API-built **boundary CTE** — the
service's docs, deduped, joined to `doc_groups`, filtered to the reader's
readable groups for that service, with block/sharing/hidden applied. The raw
tables are **unreachable** from the caller's query: the boundary is on the
*input*, not a filter on the output, so an aggregation can't bake in data
the filter would have removed. The compiled SQL is round-trip re-parsed as a
backstop.

An explicit `groups` list the reader can read *none* of → 403 (D42, same rule
as the group read). A caller-SQL failure (a column the boundary CTE doesn't
expose, a bad function arg) → **400**; a boundary violation → **403**.

### 6.3 Performance Bounds

- **Max rows:** an unbounded query gets `LIMIT 1000` appended server-side; a
  caller-supplied `LIMIT` is honored as-is.
- **Query timeout:** `max_execution_time = 10` seconds.
- **Data bound:** the boundary CTE is the bound — a query can only scan the
  caller's readable groups, not the whole node.

### 6.4 Per-User Rate Limit (D65)

`/v3/query` is rate-limited **per user**, keyed on the **verified
`user_key`** from the token — not IP (the node sits behind a proxy, so XFF is
spoofable), not the raw token (a user could game it with multiple tokens).
In-memory, per-worker: **60 queries per 60-second window**. A user over
budget gets **429** `RATE_LIMIT` until the window resets. Anon has no
verified `user_key`, so it is not per-user-limited (a separate, deferred
concern). This is the abuse-prevention bound — origin/app approval is
curation, not a security boundary (D64).

## 7. The Engagement Model (D62)

Comments and reactions are **documents in the engager's own service** —
`comments` / `reactions` — authored by the person who engaged, pointing at
their target post via `ref_value` (the post's `doc_id`).

**Authorship ≠ visibility.** The comment lives in the commenter's data
(whose it is); the group decides who can see it. That split is the model —
no contradiction between "the post lives in the author's group" and "the
comment lives in the commenter's service."

- **Default group is discover** — the universal public board. Every user can
  write there (auto-enrolled), and it's `anyone`-readable, so the public
  surface sees it.
- **The group-picker is a feature** — the comment/reaction UI lets the user
  choose which groups to attach it to (same picker as the post composer); in
  a community the default is `discover` + the community group.
- **Private accounts are deferred** — Instagram-style private accounts (posts
  + engagement off the public board) need a design pass; public accounts work
  with the discover default.

**Reading engagement back:** the `ref` filter (§5.2) pulls a post's
comments/reactions; the `count` shape pulls exact engagement counts for a
batch of posts. The `ref_value` is a top-level create field — the client must
send it at create time (a comment whose `ref_value` was never written is
orphaned and never matches a ref read).

## 8. Group Operations

```
POST /v3/groups/create
Body: {
  "token": "...",
  "name": "chess club",
  "join_policy": "open",                    // open | request | invite_only
  "roles": [ { "name": "member", "permissions": { "posts": ["readAll"] } } ],
  "members": [ { "member_key": "bob", "role": "member" } ],
  "discoverable": true                      // optional — list in the public directory (default: not)
}
→ { "group_id": "api.web10.app/groups/users/alice/chess-club" }
```

Idempotent — re-creating an existing group does not append duplicate rows.
The `group_id` is derived: `{provider}/groups/users/{creator}/{slug}`.

```
POST /v3/groups/list          Body: { token }                        → [ groups the user belongs to ]
POST /v3/groups/get           Body: { token, group_id }              → the group contract
POST /v3/groups/manages       Body: { token }                        → [ groups the user manages ]
POST /v3/groups/update        Body: { token, group_id, roles?, join_policy?, discoverable? }
POST /v3/groups/delete        Body: { token, group_id }              // requires deleteGroup
POST /v3/groups/join          Body: { token, group_id }              // open → instant member; request → { "status": "pending" }
POST /v3/groups/leave         Body: { token, group_id }
POST /v3/groups/invite        Body: { token, group_id, member_key, role }
POST /v3/groups/accept-invite Body: { token, group_id }
POST /v3/groups/decline-invite Body: { token, group_id }
POST /v3/groups/members/list  Body: { token, group_id }              → [ { member_key, role } ]
POST /v3/groups/members/add   Body: { token, group_id, member_key, role }   // requires assignRoles
POST /v3/groups/members/remove Body: { token, group_id, member_key }        // requires revokeRoles
POST /v3/groups/requests/join/list    Body: { token, group_id }    // requires assignRoles
POST /v3/groups/requests/join/approve Body: { token, group_id, requester_key }
POST /v3/groups/requests/join/deny    Body: { token, group_id, requester_key }
```

**The directory + detail (D53):**

```
GET /v3/groups/directory?limit=50&offset=0     // anon-browsable; discoverable groups only
→ { "groups": [ { "group_id", "name", "owner", "join_policy", "member_count", "permission_summary" } ], "limit", "offset" }

GET /v3/groups/detail?group_id=...&token=...   // unlisted-model: any existing group is reachable
→ { "group_id", "join_policy", "discoverable", "member_count", "roles", "is_member", "posts_state": "ok" | "join_to_view", "posts" }
```

**Group-scoped blocking + sharing:**

```
POST /v3/groups/block      Body: { token, group_id, blocked_key }   // block a user from your content in this group
POST /v3/groups/unblock    Body: { token, group_id, blocked_key }
POST /v3/groups/sharing/set Body: { token, group_id, enabled }      // pause/resume your sharing in this group
```

**Moderation** (a role with `hideAll` on the service, or the node admin):

```
POST /v3/groups/hide    Body: { token, group_id, doc_id }   // hide a doc from the group's discover (board-level; the author's copy is untouched)
POST /v3/groups/unhide  Body: { token, group_id, doc_id }
POST /v3/groups/hidden  Body: { token, group_id }           → { "hidden": [...] }
```

### 8.1 The Social Group Types

Every screen in the reference social app maps to one of five group
contracts (full shapes in the KB, `groups/social-contracts.md`):

| Use case | Group ID | Join policy | Notes |
|---|---|---|---|
| Discover (public board) | `{provider}/groups/web10/discover` | `open` | Node default, created at boot; `anyone` holds a read role — discovery IS a group read, there is no separate discover endpoint |
| Followers | `{provider}/groups/users/{username}/followers` | `open` (instant follow) or `request` (private profile) | Follower = `member` with `readAll` on `posts` |
| Close friends | `{provider}/groups/users/{username}/close-friends` | `request` | Members can post and comment |
| Community | `{provider}/groups/users/{owner}/{name}` | `open` / `request` / `invite_only` | Owner + moderators + members |
| DM | `{provider}/groups/{first}/dm-{second}` | `invite_only` | Two equal members; messages are posts in the group |

## 9. App Contract Operations

```
POST /v3/app-contracts/add
Body: { "token": "...", "allowed_origin": "https://music.web10.com", "permissions": { "posts": ["readAll", "create"] } }
→ { "allowed_origin": "...", "permissions": { ... } }

POST /v3/app-contracts/list
Body: { "token": "..." }
→ [ { "allowed_origin", "permissions" } ]

POST /v3/app-contracts/revoke
Body: { "token": "...", "allowed_origin": "https://music.web10.com" }   // omit allowed_origin to revoke all
→ { "status": "revoked" }
```

`add` and `revoke` are callable **only from an authenticator origin** — apps
must go through the consent popup, they cannot create or revoke contracts
directly.

## 10. Blocking

```
POST /v3/block    Body: { token, blocked_key }   // block a user entirely (user-wide)
POST /v3/unblock  Body: { token, blocked_key }
```

A user-wide block hides the blocked user's content from the blocker,
everywhere. A **group-scoped** block (`POST /v3/groups/block`, §8) hides it
in one group only; the block is one-directional (the blocked user still sees
the blocker's content). **Sharing** (`POST /v3/groups/sharing/set`) is the
author pausing their own content in a group without leaving — the author's
own reads are exempt.

## 11. Ads (D55)

An ad is a **`posts` document tagged `ad`** — not a service, not a
collection, not an ad network. It is a piece of content (the post's own text
+ media) plus a link that pays the creator (the `offer`), delivered to the
creator's followers by the same architecture that delivers every other post.

```json
{
  "text": "Everything I use, linked.",
  "media_refs": ["doc-media-123"],
  "tags": ["ad"],
  "offer": {
    "kind":       { "type": "text", "value": "affiliate" },
    "partner":    { "type": "text", "value": "Amazon" },
    "link":       { "type": "text", "value": "https://amzn.to/abc?tag=alice-20" },
    "cta":        { "type": "text", "value": "Get it" },
    "disclosure": { "type": "text", "value": "I may earn a commission." }
  },
  "status": "active"
}
```

- **The creative is the post itself** — `text` + `media_refs` (the same
  doc-id refs a post uses, resolved through the same media machinery). The
  creative is data; the HTML is the app's (the renderer draws the ad block —
  layout, CTA, partner badge, disclosure).
- **`offer.kind`** is `affiliate` | `direct` | `own_store`. The platform never
  rewrites the link, never cloaks it — the creator's link is the link.
- **`status`** is `active` | `paused` (default `active`); curation and the
  renderer filter on it.
- **No stats counters in the doc** — a counter is a write on a read path;
  revenue settlement is a later layer.
- **The disclosure is never hidden** — the FTC line is always shown, and the
  only sponsors a viewer sees are the ones the creator chose.

**Delivery:** the feed read returns ad posts like any other post (they are
posts in the reader's groups); the renderer styles the ones tagged `ad`.
Because the read is group-scoped, an ad is only ever visible to the
creator's audience (or the public, if attached to discover) — I3 holds.

**Carrying an ad (pinning):** a post pins an ad via its `ad_preference`
(`{ "mode": "pinned", "target": "<ad doc_id>" }` — the `ad_mode` /
`ad_target` columns). The read serves the pinned ad inline under `doc.ad`,
I3-checked (a pinned ad the reader can't see is simply absent — the doc
renders plain).

**Node ads (D57):** the node can attach its own ad to posts at the
operator's configured rate — it comes back under `doc.node_ad`, alongside
the creator's `doc.ad` (neither suppresses the other).

**The catalog** is a tag-filtered read of the creator's own posts
(`tags ∋ 'ad'`, client-side filter — a creator's own posts are a bounded
set). No new collection, no new contract permission.

## 12. Media

The presigned-URL flow — the node never proxies bytes:

```
POST /v3/media/upload-url
Body: { "token": "...", "body": { "filename": "clip.mp4", "mime_type": "video/mp4" } }
→ { "upload_url": "https://...", "fields": { ... }, "object_key": "alice/...", "content_type": "video/mp4" }

POST /v3/media/confirm
Body: { "token": "...", "body": { "object_key": "alice/...", ... } }
→ { "doc_id": "doc-media-1", ... }        // the media document — store the object_key, not a URL

POST /v3/media/read-url
Body: { "token": "...", "body": { "object_key": "alice/..." } }
→ { "read_url": "https://...", "expires_in": 60 }

POST /v3/media/list
Body: { "token": "...", "limit": 50, "offset": 0, "doc_ids": ["..."] }
→ [ media documents ]

POST /v3/media/delete
Body: { "token": "...", "doc_id": "doc-media-1" }
→ { "doc_id": "doc-media-1", "status": "deleted" }
```

Documents referencing media by `object_key` (leaf-typed `minio` refs) get
presigned read URLs injected on read.

**HLS transcoding (D44):** `POST /v3/media/transcode`
`{ token, doc_id }` queues a video document (its `body.video` must be a
`minio` ref) for HLS transcoding; the doc's `body.transcoding_settings`
tracks `status: processing → done | failed`. Transcoded reads carry a signed
`manifest_url`; the manifest/variant/segment endpoints
(`GET /v3/media/hls/manifest|variant|segment?doc_id=...&sig=...`) re-verify
group access on every fetch (10-minute sig TTL).

## 13. Security Invariants

- **I1.** A provider verifies any token's issuer cryptographically, without
  trusting the token's own claims. *(Partially in flight — symmetric signing
  means cross-node verification is not yet possible; the fix is in progress.)*
- **I2.** Authorization decisions use only verified token data — never an
  unsigned decode.
- **I3.** No query returns documents for an `author_key` the token doesn't
  own, unless group membership grants access.
- **I4.** The node is a readable, accountable broker: content is
  node-readable by design (discovery, search, auditability).
  Operator-blindness is explicitly **not** a goal (D41). Access is
  terms-controlled; the operator is legally liable for hosted data.
- **I5.** Every actor (app, agent, LLM) acts under a scoped, expiring,
  revocable token enforced by app contracts.

## 14. Contract Requests (ACR + GCR)

Apps request access through **contract requests**, sent to the authenticator
in one batch; the user approves or denies each in the consent UI. One flow
covers both kinds:

```js
// An ACR — app access (per-service permissions)
{ kind: 'app', app_origin: 'https://music.web10.com', permissions: { posts: ['readAll', 'create'] } }

// A GCR — a group operation (create / update / join)
{ kind: 'group', app_origin: 'https://music.web10.com', action: 'create_group', name: 'my playlist fans', join_policy: 'open', roles: [...], members: [...] }
```

There is no distinction between a "first request" and a "permission change"
— an ACR replaces the existing contract for that origin, and the consent UI
diffs against whatever exists already (added permissions green, removed
red). Apps cannot directly create or modify groups or contracts — the
authenticator is the only writer (the `app-contracts/add` + `revoke`
endpoints are authenticator-origin-gated, §9).

**ACR is infrastructure trust** — "do we want to give this app these
permissions?" It does not control who sees data. Groups do that.
