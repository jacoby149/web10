# Group Identity Management

The group's **face** — the display metadata (name, description, banner,
avatar, website, tags) and who writes it. The access model that decides
*who* can write it (and read content) is in `access.md`; this doc is the
identity itself.

## The Model

A group is a collection of web10 users operating on data services. Roles
define access as a **per-service permission map** — one role per person, each
role a map from service to the ops it grants. One group. No parent-child
chains. The full access model (principal classes, union semantics, the
gates) is in `access.md`.

```
Group contract (one record):
  group_id, join_policy, roles

Roles are per-service maps (one role per person):
  owner          → { "*": [all content ops incl. hideAll], "group": [structural ops] }
  moderator      → { "posts": […, hideAll], "comments": […, hideAll], "group": [assignRoles, revokeRoles] }
  page-curator   → { "group-identity-service": [readAll, create, updateOwn, deleteOwn] }
  member         → { "posts": […], "comments": […] }
```

**Per-service roles.** Each role is a map from service to the explicit
permissions it grants. A `page-curator` can only touch the identity service.
A `moderator` can only touch posts and comments. A follower `member` only
gets `readAll` on posts — no create, no update, no delete. The map *is* the
scope; there is no separate `services` array. The model scales infinitely
without creating more groups.

## Group Permissions

Each role is a per-service map of explicit permissions. Permissions are camelCase, self-focused by default:

- `readAll` — view any content in the service
- `create` — add new content
- `updateOwn` — edit your own content
- `deleteOwn` — remove your own content
- `hideAll` — hide any content from discover (moderation)
- `manageRoles` — create/edit/remove roles
- `assignRoles` / `revokeRoles` — manage user roles
- `deleteGroup` — destroy the group

`updateAll` and `deleteAll` are reserved for collaboration. Default is self-focused: you only touch your own stuff unless explicitly granted otherwise.

**Role examples** (per-service maps):
- **Owner** — `{ "*": [all ops], "group": [manageRoles, assignRoles, revokeRoles, deleteGroup] }`
- **Moderator** — `{ "posts": [readAll, create, updateOwn, deleteOwn, hideAll], "comments": [readAll, create, updateOwn, deleteOwn, hideAll], "group": [assignRoles, revokeRoles] }`
- **Page Curator** — `{ "group-identity-service": [readAll, create, updateOwn, deleteOwn] }`
- **Member** — `{ "posts": [readAll, create, updateOwn, deleteOwn], "comments": [readAll, …] }`
- **Follower** — `{ "posts": [readAll] }` only (no create, no update, no delete)

## Group Profile

The group's profile — banner, name, description, website, avatar, tags — is
**documents in an app-named service** (e.g. `web10-social-group-identity`),
read and written through the **normal CRUD path**, exactly like `posts`. It is
**not** a platform table: the protocol does not know what a "banner" is. (D60:
the platform stays universal — app concepts live in app-named services + role
grants, not bespoke tables/endpoints.)

**Public by a role grant, not by construction.** The group grants `anyone`
`readAll` on the identity service → the face is public (a non-member, anon
included, reads it — the front door depends on a stranger seeing it). No
special read path; the normal group read applies.

**Gated-higher write.** The write is gated by the per-service role map:
`page-curator`/`owner` get `create` on the identity service, `member` doesn't.
That is the exact per-service mechanism that lets one service be gated at a
*higher* role than the content services (`access.md`) — the identity is the
first such service.

Any app can define its own `*-identity` / `*-profile` / `*-config` service with
whatever schema + access level it wants. The platform's directory/detail
endpoints stay **generic** (the name falls back to the group's slug; the app
renders the full face from its own service).

## Group Collections

Each group holds collections:
- `group-settings-service` — config, permissions
- `posts` — group posts
- `comments` — group comments
- `web10-social-group-identity` (or the app's own `*-identity`) — the group's face (see "Group Profile" above)
- Whatever else the group needs

The group can hold any number of collections. Roles are scoped to exactly which ones they can touch.

## Group URLs

Free — namespaced by creator:
```
web10.app/groups/jacoby149/abacus-enthusiasts
web10.app/groups/alice/abacus-enthusiasts
```

No fighting over names. Anyone can claim any slug under their own username.

Premium — vanity URL (paid):
```
web10.app/groups/abacus-enthusiasts
```

You pay the node owner for the bare name. No username prefix. Status as a service — like a domain registration. The username-prefixed URL stays as the canonical anchor; the vanity URL redirects to it. Node owner collects revenue, user buys visibility.

## Service URLs

Same pattern. Collections are namespaced by username — `jacoby149/posts`, `alice/posts`.

Multiple apps can claim the same collection name. That's a feature — if two apps speak the same format to the same collection, they interoperate by default. Collision means your data works everywhere. The collection is the contract. Shared format = free for all mosh pit.

## Content Lives With The Author

Posts, notes, mail, files — live in the author's collection. Groups define who discovers them.

```ts
// Alice posts to a group
await createDocument({
  service: "posts",
  body: { text: "Check out this jazz record", groups: ["web10.app/groups/jacoby149/abacus-enthusiasts"] }
});
// Lives in Alice's collection. Visible to group members with readAll on posts.

// Bob discovers Alice's post
const posts = await discover({ group: "web10.app/groups/jacoby149/abacus-enthusiasts" });
// Returns posts from all group members.
```

One insert. Zero fan-out. Groups are discovery, not containers.

## Impersonation & Verification

- Names aren't unique. Two groups can be named "Jazz Lovers."
- Owner and moderator list is public. Users can see who controls the group.
- Verified badges (future): `verified: true` in metadata.
- Users can report impersonating groups.

## App-Level vs Platform-Level

- **Platform:** documents table, CRUD API, `group_contracts` / `group_members` tables
- **App (web10-social):** metadata schema, UI, role enforcement

## CRUD Operations

- **Create:** `INSERT INTO group_contracts` — auto-add owner
- **Read:** `SELECT * FROM group_contracts WHERE group_id = 'web10.app/groups/jacoby149/abacus-enthusiasts' AND deleted = 0`
- **Update:** owner/manager tombstones old, inserts new
- **Delete:** owner tombstones

## Summary

Groups are collections of users operating on data services. The contract holds per-service role maps and explicit permissions. One group. One role per user. Roles define access per service. Content lives with the author. Groups define discovery. One insert. Zero fan-out.