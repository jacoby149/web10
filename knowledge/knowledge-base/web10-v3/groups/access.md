# Group Access Control

The canonical reference for who can do what in a group. This is the model
D58 decided. `overview.md` is the tour; this doc is the spec. If they ever
disagree, this doc and D58 win.

## The two trust layers

Every access question has two answers, and **both must pass**:

1. **App trust** — *can this app do this?* The app contract (ACR) grants an
   app origin per-service ops. Enforced by CORS + the app-permission check on
   every document op. This is the outer wall.
2. **Person trust** — *can this principal do this, in this group?* The group
   role (this doc) grants a principal per-service ops. Enforced on the read
   and write of group content, and on group-management ops. This is the inner
   permission.

```
request: app A, principal P, group G, service S, op O
  1. app contract:   does A grant O on S?        (outer wall)
  2. group role:     does P's effective role in G grant O on S?  (this doc)
  both yes → allowed
```

The app contract is unchanged by D58. This doc is the person-trust layer.

## The role shape: a per-service map

A role is a named bundle of **per-service permissions** — a map from service
to the ops it grants:

```json
{ "name": "editor",
  "permissions": {
    "posts":    ["readAll", "create", "updateOwn"],
    "comments": ["readAll"]
  } }
```

- The map **is** the scope. There is no separate `services` array (the old
  `{services: [], permissions: []}` shape is retired — the array was never
  enforced).
- `'*'` is the wildcard over all document services.
- `'group'` is the reserved key for **structural** management ops on the group
  itself — ops that change the group's *shape*, not its content
  (`manageRoles`, `assignRoles`, `revokeRoles`, `deleteGroup`, the
  join/member ops). Content ops — including `hideAll` moderation — live under
  the **service key** (or the `'*'` wildcard), because they act on documents,
  not on the group's structure.
- This is the **same shape the app contract uses**, so there is one
  permission language across both trust layers.

**One role per person.** `group_members` stores a single `role` per
(group, member). The per-service map makes one role fully expressive — any
(principal, service, op) matrix fits in one map — so there is no
"stack multiple roles" escape hatch. If a person needs a distinct
permission set, define a distinct role.

Roles are **generic** — a group defines whatever roles fit its purpose
(`owner`, `moderator`, `page-curator`, `member`, or `dj`, `listener`,
`contributor`). The platform doesn't care what they're called.

## Principal classes

Access is granted to **principals**. There are three nested classes,
broadest to narrowest:

| class | who it is |
|---|---|
| `anyone` | every request, signed in or not |
| `authenticated` | a valid token — any web10 user, member or not |
| `member` | has a member row in this group |

Nesting: `anyone ⊇ authenticated ⊇ member`. A member is also authenticated,
and also anyone.

These classes are **reserved keys in `group_members`** — no new table. A
group grants a class a role by storing a member row for the reserved key:

```
group_members:
  (G, 'anyone',        'reader')    ← the group is public
  (G, 'authenticated', 'reader')    ← signed-in users can read
  (G, 'bob',           'moderator') ← bob is a moderator
  (G, 'alice',         'owner')     ← alice is the owner
```

The discover board's old `anon` member row is the `anyone` row — same
mechanism, honest name.

## The effective role (union semantics)

A principal's effective permissions in a group are the **union** of the
permission maps of every class they belong to:

```
effective(P, G) =
    grant(G, 'anyone')                          // always
  ∪ ( P authenticated ? grant(G, 'authenticated') : ∅ )
  ∪ ( P a member of G ? grant(G, P's role)      : ∅ )
```

So:

- a **signed-out visitor** holds only the `anyone` grant
- a **signed-in stranger** holds `anyone` ∪ `authenticated`
- a **member** holds `anyone` ∪ `authenticated` ∪ their member role

The nesting gives a monotonicity invariant for free: **a member always sees
at least what a signed-in stranger sees.** You cannot make a member see less
than a bystander — the model won't let you express it.

## What is gated what way

| surface | read gate | write gate |
|---|---|---|
| **Identity** (name, banner, description, website, tags — an app-named service, e.g. `web10-social-group-identity`) | **public** — via the `anyone` read grant on that service | role grant on that service (owner / `page-curator`) |
| **Content** (posts / comments / media docs) | effective role grants `readAll` on that service | effective role grants the op on that service — including `hideAll` moderation (a content op: it hides a *doc*, so it's scoped to the service, not the `"group"` key) |
| **Group structure** (roles, members, join, delete) | — | effective role grants the op under the `'group'` key (structural ops only) |

**Identity is public; content is role-gated.** That split is what makes the
Facebook-shaped front door work: a stranger lands on a group, sees the
cover, the name, the about, the member count, and the Join button — but
"Join to view posts" below. The group's *face* is always visible; its
*content* is access-controlled. The D53 directory is a public metadata list
for the same reason.

## Public / private / signed-in-only

There is no separate "visibility" flag. Publicness **is** a role grant to a
principal class:

| group kind | the grant | who reads content |
|---|---|---|
| **fully public** | `readAll` on `anyone` | everyone, signed in or not |
| **signed-in only** | `readAll` on `authenticated` | any web10 user; signed-out can't |
| **private** | only on member roles | members only |

**Join policy is orthogonal.** It controls how a *human* becomes a *member*
(open = instant, request = pending, invite_only = owner adds). It says
nothing about what a non-member bystander can see. A group can be
`invite_only` to join *and* `anyone`-readable (a public board you don't need
to join to watch) — the discover board is exactly that.

## Worked examples

**Public community** — anyone can read, members can post:
```
roles:
  reader:  { "posts": ["readAll"] }
  member:  { "posts": ["readAll", "create", "updateOwn", "deleteOwn"] }
  owner:   { "*": [readAll, create, updateOwn, updateAll, deleteOwn, deleteAll, hideAll],
            "group": [manageRoles, assignRoles, revokeRoles, deleteGroup] }
members:
  (G, 'anyone', 'reader')
  (G, 'alice',  'owner')
  (G, 'bob',    'member')
```
A signed-out visitor reads posts (the `anyone`→`reader` grant). Bob reads and
posts (member). Alice manages (owner).

**Signed-in-only group** — must be a web10 user, no join required to read:
```
members:
  (G, 'authenticated', 'reader')
  (G, 'alice',         'owner')
```
A signed-out visitor sees the identity (public) but no posts. A signed-in
stranger reads posts. Only alice manages.

**Private circle** — members only:
```
members:
  (G, 'alice', 'owner')
  (G, 'bob',   'member')
```
No `anyone` / `authenticated` row. A bystander sees the identity and
"Join to view posts."

**The discover board** — public, not join-gated, not directory-listed:
```
members:
  (G, 'anyone', 'reader')     // was 'anon'
```
`discoverable: false` (not a directory entry) + `anyone`-readable (the public
board). The two controls are independent — see `discoverability.md`.

## Why ClickHouse makes this cheap

The role check never touches the big `documents` table. The read path is:

```
small metadata tables (group_members + group_contracts.roles)
  → compute the group_ids the reader's effective role clears, per service
  → the columnar documents scan runs as it always has, with that list
```

Fine-grained control lives in the relational layer, where it is an index
lookup. The scan stays a scan. AWS-level control, zero scan-time penalty.

## Invariants

- **I3 holds, role-gated.** A content read returns docs only for groups whose
  effective role grants `readAll` on that service to the reader. A non-member
  with no `anyone`/`authenticated` grant gets no content — only the public
  identity.
- **Identity is never I3-gated.** It is a public table, readable by any
  principal. It is group-keyed metadata, not user content.
- **Monotonicity.** A member's effective permissions ⊇ a signed-in
  stranger's ⊇ a signed-out visitor's. The nesting enforces it.
- **The write side is gated too.** Attaching/creating content in a group
  requires the effective role to grant the op on that service — this closes
  the attach hole (a bystander cannot attach their doc to a group they can't
  write).
- **`discoverable` gates the directory only.** It never gates content or
  identity. See `discoverability.md`.

## Relationships

- `overview.md` — the group model tour (policy containers, owned audience).
- `identity.md` — the group's face (documents in an app-named service, public
  via the `anyone` grant) and who writes it (the higher role).
- `discoverability.md` — the directory and the `discoverable` blasting flag.
- `detail.md` — the by-ID principal-based read.
- `social-contracts.md` — the concrete role JSON for the five social group
  types, in the per-service map shape.
- D58 in `strategy/decisions.md` — the decision and its reasoning.
