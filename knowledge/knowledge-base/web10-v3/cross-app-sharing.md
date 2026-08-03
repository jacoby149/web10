# Cross-App Sharing: Service Contracts + Groups

How apps share data across the platform. Two contract types. One permission model.

## The Two Contracts

**Service contract** — which websites can access your service. CORS. App-level.

```
service:notes → allowed: notesapp.com
service:mail → allowed: mailapp.com
```

The browser enforces this. A site without a service contract can't touch your data. Turn off all service contracts → kill switch. No website reaches your data.

**Group contract** — which people can see which content. Sharing. People-level.

```
alice.inbox → admin: alice, open join
alice.close-friends → admin: alice, invite only
web10-dev → admin: charlie, open join
```

Both must pass. The app needs a service contract to make the call. The groups decide what's visible.

## The Mailer Pattern

The elegant flip: mail lives in the **sender's** collection, not the receiver's.

```
Bob's outbox:
  post-1 → groups: ["alice.inbox"]

Alice discovers:
  SELECT * FROM posts
  WHERE group_id = 'alice.inbox'
  → post-1 (bob's mail)
```

Bob owns his mail. Alice owns her inbox group. The group is the bridge.

**How it works:**

1. Alice creates `alice.inbox` group (open join — anyone can send)
2. Bob writes a mail in his `outbox` collection
3. Bob attaches the mail to `alice.inbox` group
4. Alice discovers the mail via group membership check

**Why it's better:**

- Bob owns his mail — it lives in his collection
- Alice controls her inbox — she administers the group, can remove senders
- No whitelist needed — the group is the permission
- Cross-app — any app can send mail by attaching to the group
- Scale — ClickHouse filters 100k inboxes in milliseconds

**The group admin controls who can join:**

| Policy | How it works |
|---|---|
| Open | Anyone joins automatically |
| Request | Anyone can request, admin approves or denies |
| Invite only | Only people the admin explicitly adds can join |

## The Notes Pattern

Personal. No sharing.

```
Service contract: service:notes → allowed: notesapp.com
No groups → private, only alice sees them
```

The service contract lets the notes app read/write. No groups means no one else can discover anything. Simple.

## The DMs Pattern

Two people. Private.

```
alice-and-bob → admin: alice, members: alice, bob
```

Alice's message → attached to `alice-and-bob` → Bob sees it via group membership.
Bob's message → attached to `alice-and-bob` → Alice sees it via group membership.

Each message lives in the sender's collection. The group is the bridge. Both can discover via the group.

## The Comments Pattern

Open. Anyone can participate.

```
post-123-comments → admin: alice, open join
```

Alice's post → no groups (private by default).
Bob's comment → lives in bob.comments, attached to `post-123-comments` group.
Charlie's comment → lives in charlie.comments, attached to `post-123-comments` group.

Alice discovers all comments via the group. Anyone can join the group and comment. Alice can remove anyone.

## The Pattern

Every sharing model is the same:

1. **Content lives in the author's collection** — always owned by the creator
2. **Content attaches to groups** — groups define who can discover it
3. **Discover queries filter by group membership** — one query, no fan-out

```
Author writes → attaches to group → members discover
```

**Service contract** — lets the app make the call (CORS, browser-enforced)
**Group contract** — lets the person see the content (server-enforced)

## The Authenticator

Where you manage both:

**Service contracts** — which websites can access your services.
```
service:notes → allowed: notesapp.com [Revoke]
service:mail → allowed: mailapp.com [Revoke]
[Turn off all] ← kill switch
```

**Groups you administer** — who can send you content.
```
alice.inbox → open join [Block sharing] [Leave]
alice.close-friends → invite only [Add member] [Remove member]
```

**Groups you belong to** — what you can see.
```
web10-dev → admin: charlie, open join [Block sharing] [Leave]
post-123-comments → admin: alice, request [Leave]
```

**Block sharing** — pause sharing without leaving. You stay a member. You still see their posts. They can't see yours. Reversible.

**Opt out all posts** — bulk remove your posts from a group. Reversible.

**Make everything private** — remove all groups from all your posts. One click.

## Scale

No Gmail mailing list limits. A group can have 100k members. ClickHouse filters it in milliseconds. One insert serves everyone. No fan-out.

```
alice.inbox → 50k senders
web10-dev → 100k members
jazz-collectors → 500k members
```

A post attached to any of these groups is discoverable by all members. One insert. Zero fan-out. The query filters at read time.

## Provider Service Contracts

Providers control which apps participate on their nodes. Two levels of service contracts:

**User level** — which websites can access my data (CORS, browser-enforced)
```
service:notes → allowed: notesapp.com
```

**Provider level** — which apps can participate on this node (server-enforced)
```
provider-a:
  allowed apps: notesapp.com, mailapp.com
  blocked apps: spamapp.com
```

A bad app floods the network → providers block it at the node level. The provider protects itself. The user protects their data. Two layers.

## Summary

Content lives in the author's collection. Groups define who discovers it. Service contracts let apps make the call. Group contracts let people see the content. Both must pass.

Two levels of service contracts: user level (CORS, browser-enforced) and provider level (app filtering, server-enforced). The provider protects itself. The user protects their data.

The mailer pattern is the model: sender writes to their outbox, attaches to receiver's inbox group, receiver discovers via group membership. Works for mail, DMs, comments, everything.

One insert. Zero fan-out. The author owns the data. The group controls the sharing. The authenticator manages both.