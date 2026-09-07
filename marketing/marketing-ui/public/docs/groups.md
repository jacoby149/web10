# Groups

Groups are the unifying primitive in web10. They replace follows, inbox, contacts, visibility toggles, discovery — everything social is a group.

## What Groups Are

A group holds **people and roles**, not data. Content lives in the author's collection. Groups define who can discover it. One group. Infinite apps. The same membership works everywhere.

```
Group "jazz-collectors":
  members: alice (curator), dave (listener), eve (contributor)

Social app → dave sees alice's posts in this group
Music app  → dave sees alice's playlists in this group
Doc app    → dave sees alice's files in this group
```

Three things happen when a group exists:

1. **Discovery** — content attached to the group is visible to members
2. **Policy** — roles define what each member can do, scoped to services
3. **Ownership** — the group owner holds the audience relationship. They can see every member's identity, reach out directly, and that list is theirs

## The Owned Audience

This is the killer differentiator for creators. On other platforms, your followers are the platform's asset — you can't export them, can't message them without permission, can't take them if you leave.

On web10, the group membership is your data. The owner can read the full membership list — usernames, emails (if set), phones (if set). They can message a follower, email a fan, text a supporter — directly. The influencer owns that relationship.

```
alice.followers → 50k members
  → 50k people the influencer can reach directly
  → exportable, portable, owned
```

## Join Policies

| Policy | How it works | Social use |
|---|---|---|
| **Open** | Anyone joins automatically | Public profiles, discover board, open communities |
| **Request** | Anyone can request, owner approves | Private profiles, close friends, curated communities |
| **Invite only** | Only people explicitly added can join | DMs, private circles |

## Roles and Permissions

Each group defines its own roles. **A role is a per-service permission map** —
the map *is* the scope: each key is a service name, each value is the list of
ops granted on that service. It's the same shape the app contract uses, so
there is one permission language across both trust layers.

```json
{
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

- **`*`** is the wildcard over all document services.
- **`group`** is the reserved key for management ops on the group itself
  (`manageRoles`, `assignRoles`, `revokeRoles`, `deleteGroup`). `hideAll` is
  a *content* op — it hides a doc, so it lives under the service key, not
  `group`.
- **One role per person.** The per-service map makes a single role fully
  expressive — any (principal, service, op) matrix fits in one map. If a
  person needs a distinct permission set, define a distinct role.
- By convention, roles are listed most-privileged to least; the last entry is
  the baseline member role.

### Principal Classes

Access is granted to **principals** — three nested classes, broadest to
narrowest, stored as reserved member rows (no new table):

| Class | Who it is | Nesting |
|---|---|---|
| `anyone` | every request, signed in or not | broadest |
| `authenticated` | a valid token — any web10 user, member or not | ⊂ anyone |
| `member` | has a member row in this group | ⊂ authenticated |

**Union semantics:** a principal's effective permissions in a group are the
**union** of the permission maps of every class they belong to. A signed-out
visitor holds the `anyone` grant; a signed-in stranger holds `anyone` ∪
`authenticated`; a member holds `anyone` ∪ `authenticated` ∪ their member
role. The nesting enforces the invariant for free: a member always sees at
least what a signed-in stranger sees.

**Public / private is a role grant, not a flag:** fully public → `readAll` on
`anyone`; signed-in only → on `authenticated`; private → only on member
roles. Join policy stays orthogonal — it controls how a *human* becomes a
*member* (`open` = instant, `request` = pending approval, `invite_only` =
owner adds).

### The Permission Vocabulary

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

## Social Patterns

Every social mechanic is a group with different settings:

### Follows

Following is joining a group. The followers group is
`{provider}/groups/users/alice/followers`, where Alice is the owner.

```
{provider}/groups/users/alice/followers → join_policy: "open"
  roles: owner (full), member (readAll on posts)
  → Bob joins → Bob sees Alice's posts
```

Unfollow is leaving the group. No separate follows table. A **public**
profile also grants the `anyone` principal a read role, so a signed-out
visitor can read the posts without following; a **private** profile omits
that grant (`join_policy: "request"` — follow requires approval).

### Discover (Public Board)

The public board is a group everyone belongs to. Posts attached to it are
public.

```
{provider}/groups/web10/discover → join_policy: "open"
  → auto-enrollment on signup
  → anyone can read (the `anyone` principal holds a read role), you can post to it
```

Discovery **is** a group read — there is no separate discover endpoint. The
board's id is provider-derived, so each node's board has a unique global id.

### Close Friends

Private circle. Join requires the owner's approval.

```
{provider}/groups/users/alice/close-friends → join_policy: "request"
  → friends request to join, Alice approves
  → private posts attached here
```

### Communities

Topic-based groups with moderation.

```
{provider}/groups/users/charlie/st-louis-chess-club → join_policy: "request"
  roles: owner, moderator, member
  → members request to join, owner approves
  → moderators can hide content, not edit
```

### DMs

Two-person private group. The id is deterministic — both parties derive the
same one (usernames sorted):

```
{provider}/groups/alice/dm-bob → join_policy: "invite_only"
  members: alice, bob (both `member`, equal permissions)
  → both can post, both can read
  → messages are posts in the group
```

## Posting to Groups

When you create content, you pick the groups it belongs to:

```ts
await w.create('posts', {
  text: { type: 'text', value: 'behind the scenes' },
}, {
  groups: ['{provider}/groups/users/alice/close-friends'],
})
```

- **No groups** = private. Only the author sees it.
- **Multiple groups** = union of members. Anyone in either group can read it.
- **One insert, zero fan-out.** The API writes once. Readers filter by membership at query time.
- **The write gate:** you may only attach a doc to groups your effective role grants `create` on that service. Non-writable groups are dropped; if none are writable, the create is a 403.

## The Engagement Model

Comments and reactions are **documents in the engager's own service** —
`comments` / `reactions` — authored by the person who engaged, pointing at
their target post via the `ref_value` column (the post's `doc_id`).

**Authorship ≠ visibility.** The comment lives in the commenter's data (whose
it is); the group decides who can see it. That split is the model — no
contradiction between "the post lives in the author's group" and "the comment
lives in the commenter's service."

- **Default group is discover** — the universal public board. Every user can
  write there (auto-enrolled), and it's `anyone`-readable, so the public
  surface sees it.
- **The group-picker is a feature** — the comment/reaction UI lets the user
  choose which groups to attach it to (same picker as the post composer); in
  a community the default is `discover` + the community group.
- **Private accounts are deferred** — Instagram-style private accounts (posts
  + engagement off the public board) need a design pass; public accounts work
  with the discover default.

```ts
// A reaction on a post — a `reactions` doc authored by the reactor
await w.create('reactions', {
  reaction_type: { type: 'text', value: 'like' },
}, {
  groups: ['{provider}/groups/web10/discover'],
  ref_value: postDocId,
})
```

Reading engagement back: the read's `ref` filter pulls a post's
comments/reactions; `readRefCounts` pulls exact engagement counts for a batch
of posts.

## Moderation

A role with `hideAll` can hide content from group discover — removing it from group members' view. The content still exists in the author's collection. The group is a curation layer, not an ownership layer.

```
Moderator can:
  ✓ Hide content from group discover
  ✓ Remove a member (if role grants revokeRoles)
  ✗ Edit content they don't own
  ✗ Escalate their own permissions
```

## Blocking

Two levels. The author controls both.

**User-wide** — block someone entirely. They can't see any of your content, anywhere.

```ts
await w.blockUser('bob')
```

**Per-group** — block someone from your content in one group. They stay a member. They still see everyone else's content. Just not yours.

```ts
await w.blockUserInGroup('bob', '{provider}/groups/users/dave/jazz-collectors')
```

## Sharing Toggle

Pause sharing with a group without leaving. You stay a member. You still see their content. They can't see yours. Reversible.

```ts
await w.setSharing('{provider}/groups/users/dave/jazz-collectors', false)  // pause
await w.setSharing('{provider}/groups/users/dave/jazz-collectors', true)   // resume
```

## Group IDs

Group ids are derived, not chosen — namespaced by provider and creator:

```
{provider}/groups/users/alice/jazz-collectors   — a created group
{provider}/groups/web10/discover                — the public board
{provider}/groups/alice/dm-bob                  — a DM (usernames sorted)
```

`{provider}` is the node's API host (e.g. `api.web10.app`), so every node's
groups live in a unique namespace.

## Scale

No mailing list limits. A group can have 100k+ members. One insert serves everyone. The query filters at read time.

```
alice.followers → 50k members
charlie/chess-club → 100k members
jazz-collectors → 500k members
```

## The Authenticator

The web10 authenticator is where you manage groups and take charge of your data:

- **Groups you manage** — you control membership, roles, and see your audience
- **Groups you belong to** — view membership, leave, or control sharing
- **Pause sharing** — pause sharing without leaving
- **Opt out all documents** — bulk remove content from a group
- **Make everything private** — remove all groups from all content
- **Kill switch** — turn off all app contracts. No website touches your data.

## Summary

Groups are policy containers, discovery mechanisms, and owned audience
relationships. They hold people, not data. Any document from any service can
be attached to any group. Roles are per-service permission maps, granted to
three nested principal classes (`anyone` / `authenticated` / `member`) with
union semantics — public or private is a role grant, not a flag. Engagement
(comments, reactions) is documents in the engager's own service, attached to
groups like any other content. One membership. Infinite apps.

For the creator, the group membership list is the asset — 50k followers is
50k people they can reach directly. Exportable. Portable. Owned. That's the
difference between renting an audience and owning one.