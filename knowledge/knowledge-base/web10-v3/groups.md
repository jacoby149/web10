# Groups: Policy Containers

Groups are not data containers. They are policy containers — they define who gets what access to content that lives elsewhere.

## What Groups Are

A group is a named membership list. It doesn't hold posts, files, or playlists. It holds people. When you attach a document to a group, group members can see it.

```
Group "jazz-collectors":
  admin: dave
  members: alice, dave, eve
```

Alice attaches a post, a file, and a playlist to this group. Dave and eve can see all three. Same group. Different doc types. The group doesn't care what the document is.

## Two Contract Types

v3 has two contract types. They control different things.

**Service contract** — which websites can access your service. CORS. App-level.

```
service:posts → allowed: twitter-clone.web10.com
service:playlists → allowed: music.web10.com
```

The browser enforces this. A malicious site can't spoof the `Origin` header. If you turn off all service contracts, no website touches your data. Ever. Kill switch.

**Provider level** — which apps can participate on this node. Server-enforced. A bad app floods the network → providers block it at the node level.

```
provider-a:
  allowed apps: twitter-clone.web10.com, music.web10.com
  blocked apps: spamapp.com
```

The provider protects itself. The user protects their data. Two layers.

**Group contract** — which people can see which content. Sharing. People-level.

```
jazz-collectors → members: alice, dave, eve
```

Both must pass. The app needs a service contract to even make the call. The groups decide what's visible.

```
service:posts → allowed: twitter-clone.web10.com → GET /alice/posts?discover=true
  1. Service contract: origin allowed? → yes
  2. Groups: which posts are in groups bob belongs to? → post-1, post-2
  3. Return post-1, post-2
```

The service contract is the outer wall. The groups are the inner permissions.

## Posting to Groups

When you create a post, you pick the groups it belongs to. Those groups already define who sees it.

```ts
await createDocument({
  text: "behind the scenes",
  groups: ["alice.close-friends"]
});
```

Bob sees it because he's a member. Eve doesn't.

A post can belong to multiple groups:
```ts
await createDocument({
  text: "team update",
  groups: ["alice.close-friends", "web10-dev"]
});
```

Anyone in either group can read it. Union of members.

A post with no groups is private — only the author sees it.

## Join Policies

Groups have three join policies:

| Policy | How it works |
|---|---|
| Open | Anyone joins automatically |
| Request | Anyone can request, admin approves or denies |
| Invite only | Only people the admin explicitly adds can join |

**Open** — `alice.public`. Anyone can see posts attached to it. No gatekeeping.

**Request** — `alice.followers`. Bob requests to join → Alice approves → Bob is a member. This is the follow flow.

**Invite only** — `alice.close-friends`. Alice adds Bob and Charlie. No one else can join unless Alice invites them.

The author decides the permission level, not the group. You set it when you attach:

```ts
await attachToGroup({
  doc_id: "post-1",
  group_id: "jazz-collectors",
  permission: "read"   // or "write"
});
```

The group admin can add/remove people, but they can't change `read` to `write` on your doc. Two separate controls:

- **Group admin** — who's in the group
- **Document author** — what access the group gets

## Moderation

Group admins can moderate content in their group. They can remove a post from the group's discover — hiding it from group members. They cannot edit the content.

```
Group admin can:
  ✓ Remove a post from group discover
  ✓ Remove a member
  ✗ Edit the content
  ✗ Escalate read to write
```

The post still exists in your collection. It's just removed from that group's discover. Like YouTube taking down a video — your file is still yours, it's just not on their platform.

The group is a curation layer, not an ownership layer.

## Blocking

Two levels of blocking. The author controls both.

**User-wide blacklist** — block someone entirely. They can't see any of your content, anywhere.

```
user-wide blacklist:
  blocked: bob, charlie
```

**Per-group blacklist** — block someone from seeing your content in a specific group. They're still in the group. They still see everyone else's content. Just not yours.

```
jazz-collectors → per-group blacklist: dave
  dave is still a member
  dave sees everyone's posts in jazz-collectors
  dave does NOT see alice's posts in jazz-collectors
```

The per-group blacklist is the nuance. You can be in a group with someone you don't want seeing your content. You don't have to leave the group. You don't have to kick them out. You just block them from your posts in that group.

## Cross-App Identity

Groups carry across apps. The same membership works everywhere:

```
jazz-collectors:
  members: alice, dave, eve

Social app → dave sees alice's posts in this group
Music app  → dave sees alice's playlists in this group
Doc app    → dave sees alice's files in this group
```

One membership. Infinite apps. The group is managed once, at the platform level.

## The Authenticator — Group Management

The web10 authenticator is where you manage groups and take charge of your data.

**Groups you administer** — you control membership.
```
alice.close-friends → admin: you, invite only
  members: bob, charlie, dave
  [Add member] [Remove member]
```

**Groups you belong to** — you can view membership, leave, or control sharing.
```
jazz-collectors → admin: dave, request
  members: alice (you), dave, eve
  [View members] [Block sharing] [Leave]
```

**Block sharing** — pause sharing with a group without leaving. You stay a member. You still see their posts. They can't see yours. Reversible.

```
jazz-collectors → [Block sharing]
  Your posts: hidden from group
  Their posts: still visible to you
  [Unblock]
```

**Opt out all documents** — bulk remove every post you've attached to a group. Reversible.

**Make everything private** — remove all groups from all your posts. One click. Everything goes dark.

**Turn off all service contracts** — no website touches your data. Ever. Kill switch.

## Scale

No Gmail mailing list limits. A group can have 100k members. ClickHouse filters it in milliseconds. One insert serves everyone. No fan-out.

```
alice.followers → 50k members
web10-dev → 100k members
jazz-collectors → 500k members
```

A post attached to any of these groups is discoverable by all members. One insert. Zero fan-out. The query filters at read time.

## Follows as Groups

Follows are groups. `alice.followers` is a group where Alice is the admin. Bob requests to join → Alice approves → Bob is a member → Bob sees posts attached to that group.

```ts
await followUser('alice');        // request to join alice.followers
await approveFollower('bob');     // approve bob into alice.followers
await unfollow('alice');          // leave alice.followers
```

No separate follows table. Groups handle it.

## Summary

Groups are policy containers. They hold people, not data. Any document from any service can be attached to any group. The author decides the permission level. The group admin manages membership and can moderate (remove from discover, not edit). Groups carry across apps. One membership. Infinite apps.

Service contracts control which websites can access your data. Group contracts control which people can see your content. Both must pass. Browser enforces the outer wall. Server enforces the inner permissions.

The authenticator is where you take charge: block sharing, opt out, privatize all, kill switch. One toggle. Everything goes dark.