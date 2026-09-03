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
| **Request** | Anyone can request, owner approves | Private profiles, curated communities |
| **Invite only** | Only people explicitly added can join | Close friends, private circles |

## Roles and Permissions

Each group defines its own roles. Each role lists the services it applies to and the explicit permissions it grants. No inheritance. No hidden defaults.

**Content permissions:**

| Permission | What it does |
|---|---|
| `readAll` | View any content in the service |
| `create` | Add new content |
| `updateOwn` | Edit your own content |
| `deleteOwn` | Remove your own content |
| `hideAll` | Hide any content from group discover (moderation) |

**Group management permissions:**

| Permission | What it does |
|---|---|
| `manageRoles` | Add, rename, or remove role definitions |
| `assignRoles` | Add members or promote existing members |
| `revokeRoles` | Remove members or demote roles |
| `deleteGroup` | Delete the group |
| `modifyJoinPolicy` | Change join policy |

**Example — community group:**

```json
{
  "roles": [
    {
      "name": "owner",
      "services": ["*"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll", "manageRoles", "assignRoles", "revokeRoles", "deleteGroup"]
    },
    {
      "name": "moderator",
      "services": ["posts", "comments"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn", "hideAll", "assignRoles", "revokeRoles"]
    },
    {
      "name": "member",
      "services": ["posts", "comments"],
      "permissions": ["readAll", "create", "updateOwn", "deleteOwn"]
    }
  ]
}
```

## Social Patterns

Every social mechanic is a group with different settings:

### Follows

Following is joining a group. `alice.followers` is a group where Alice is the owner.

```
alice.followers → join_policy: "open"
  roles: owner (full), member (readAll on posts)
  → Bob joins → Bob sees Alice's posts
```

Unfollow is leaving the group. No separate follows table.

### Discover (Public Board)

The public board is a group everyone belongs to. Posts attached to it are public.

```
{provider}/groups/web10/discover → join_policy: "open"
  → auto-enrollment on signup
  → anyone can read, you can post to it
```

### Close Friends

Private circle. Only invited members can see content.

```
alice.close-friends → join_policy: "invite_only"
  → only people Alice explicitly adds
  → private posts attached here
```

### Communities

Topic-based groups with moderation.

```
charlie/chess-club → join_policy: "request"
  roles: owner, moderator, member
  → members request to join, owner approves
  → moderators can hide content, not edit
```

### DMs

Two-person private group.

```
alice-and-bob → join_policy: "invite_only"
  members: alice, bob
  → both can post, both can read
  → messages live in the sender's collection
```

## Posting to Groups

When you create content, you pick the groups it belongs to:

```ts
await w.create('posts', {
  text: { type: 'text', value: 'behind the scenes' },
}, {
  groups: ['web10.app/groups/alice/close-friends'],
})
```

- **No groups** = private. Only the author sees it.
- **Multiple groups** = union of members. Anyone in either group can read it.
- **One insert, zero fan-out.** The API writes once. Readers filter by membership at query time.

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
await w.blockUserInGroup('bob', 'web10.app/groups/dave/jazz-collectors')
```

## Sharing Toggle

Pause sharing with a group without leaving. You stay a member. You still see their content. They can't see yours. Reversible.

```ts
await w.setSharing('web10.app/groups/dave/jazz-collectors', false)  // pause
await w.setSharing('web10.app/groups/dave/jazz-collectors', true)   // resume
```

## Group URLs

Free — namespaced by creator:
```
web10.app/groups/alice/jazz-collectors
```

Premium — vanity URL (paid to node owner):
```
web10.app/groups/jazz-collectors
```

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
- **Block sharing** — pause sharing without leaving
- **Opt out all documents** — bulk remove content from a group
- **Make everything private** — remove all groups from all content
- **Kill switch** — turn off all app contracts. No website touches your data.

## Summary

Groups are policy containers, discovery mechanisms, and owned audience relationships. They hold people, not data. Any document from any service can be attached to any group. Roles define access scoped to services. One membership. Infinite apps.

For the creator, the group membership list is the asset — 50k followers is 50k people they can reach directly. Exportable. Portable. Owned. That's the difference between renting an audience and owning one.