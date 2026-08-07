# Group Identity Management

## The Model

A group is a collection of web10 users operating on data services. Roles define access, scoped to exactly which services they apply to. One group. No parent-child chains.

```
Group contract (one record):
  group_id, join_policy, roles

Roles are service-scoped:
  owner → all services ("*")
  moderator → posts, comments
  page-curator → group-identity-service
  member → posts, comments
```

**Service-scoped roles.** Each role lists the services it applies to. A `page-curator` can only touch the identity service. A `moderator` can only touch posts and comments. The model scales infinitely without creating more groups.

## Group Permissions

Each role defines explicit permissions scoped to its services. Permissions are camelCase, self-focused by default:

- `readAll` — view any content in the service
- `create` — add new content
- `updateOwn` — edit your own content
- `deleteOwn` — remove your own content
- `hideAll` — hide any content from discover (moderation)
- `manageRoles` — create/edit/remove roles
- `assignRoles` / `revokeRoles` — manage user roles
- `deleteGroup` — destroy the group

`updateAll` and `deleteAll` are reserved for v2 collaboration. v1 is self-focused: you only touch your own stuff unless explicitly granted otherwise.

## Group Profile

The `group-identity-service` holds the group's profile — banner, name, website, avatar. Append-only. Curators add records, they don't overwrite. Members see the most recent. No accidental overwrites.

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
// Lives in Alice's collection. Visible to group members.

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

Groups are collections of users operating on data services. The contract holds service-scoped roles and permissions. One group. Roles define access per service. Content lives with the author. Groups define discovery. One insert. Zero fan-out.
