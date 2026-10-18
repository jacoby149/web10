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
web10.app/groups/jacoby149/jazz-collectors → members: alice, dave, eve
```

Both must pass. The app needs a service contract to make the call. The groups decide what's visible.

## The Mailer Pattern

The elegant flip: mail lives in the **sender's** collection, not the receiver's.

```
Bob's outbox:
  post-1 → groups: ["web10.app/groups/alice/inbox"]

Alice discovers:
  SELECT * FROM documents
  WHERE group_id = 'web10.app/groups/alice/inbox'
  → post-1 (bob's mail)
```

Bob owns his mail. Alice owns her inbox group. The group is the bridge.

**How it works:**

1. Alice creates `web10.app/groups/alice/inbox` group (open join — anyone can send)
2. Bob writes a mail in his `outbox` collection
3. Bob attaches the mail to `web10.app/groups/alice/inbox` group
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

## The Saved Mail Pattern

Sender deletion is the default. Bob deletes his mail, Alice's view vanishes. But Alice can save mail she wants to keep.

**How it works:**
1. Alice's mail app has a `saved_mail` service: `service:saved_mail → allowed: mailapp.com`
2. Alice taps "save" on Bob's mail
3. The mail app reads Bob's post from the inbox group (Alice has read permission)
4. The mail app writes a copy to Alice's `saved_mail` collection (her own data, her app, no extra auth)
5. Bob deletes the original → Alice's saved copy stays. She owns it.

```
Bob's outbox:
  post-1 → groups: ["web10.app/groups/alice/inbox"]

Alice's saved_mail:
  saved-1 → body: { "from": "bob", "text": "hi", "original_doc_id": "post-1" }
```

The save is opt-in. The ephemeral default is the feature. The save is the app's choice. Slightly fights the manifesto — the protocol makes it hard to save — but the user chooses. The mail app bridges the gap.

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
web10.app/groups/jacoby149/alice-and-bob → members: alice, bob
```

Alice's message → attached to `web10.app/groups/jacoby149/alice-and-bob` → Bob sees it via group membership.
Bob's message → attached to `web10.app/groups/jacoby149/alice-and-bob` → Alice sees it via group membership.

Each message lives in the sender's collection. The group is the bridge. Both can discover via the group.

## The Comments Pattern

Open. Anyone can participate. Comments are documents with a `ref` to the parent post.

```
web10.app/groups/jacoby149/post-123-comments → owner: jacoby149, request [Leave]
```

Alice's post → no groups (private by default).

Bob's comment → a post in `bob.comments` with `ref: "post-123"`, attached to `web10.app/groups/jacoby149/post-123-comments` group.
Charlie's reply → a post in `charlie.comments` with `ref: "post-123"` and `parent_ref: "bob-comment-xyz"`, attached to `web10.app/groups/jacoby149/post-123-comments` group.

Alice discovers all comments via the group. The `ref` in the JSON body links back to the parent. The `parent_ref` enables threading. No dedicated comments table — just documents with refs.

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
web10.app/groups/alice/inbox → open join [Block sharing] [Leave]
web10.app/groups/alice/close-friends → invite only [Add member] [Remove member]
```

**Groups you belong to** — what you can see.
```
web10.app/groups/charlie/st-louis-chess-club → owner: charlie, open join [Block sharing] [Leave]
web10.app/groups/jacoby149/post-123-comments → owner: jacoby149, request [Leave]
```

**Block sharing** — pause sharing without leaving. You stay a member. You still see their posts. They can't see yours. Reversible.

**Opt out all documents** — bulk remove your posts from a group. Reversible.

**Make everything private** — remove all groups from all your posts. One click.

## Scale

No Gmail mailing list limits. A group can have 100k members. ClickHouse filters it in milliseconds. One insert serves everyone. No fan-out.

```
alice.inbox → 50k senders
charlie/st-louis-chess-club → 100k members
jazz-collectors → 500k members
```

A post attached to any of these groups is discoverable by all members. One insert. Zero fan-out. The query filters at read time.

## Provider Service Contracts (v4)

Provider-level app filtering (server-enforced, beyond user-level CORS) is a v4 feature. See `../../web10-v4/sdk/advanced.md`.

## Summary

Content lives in the author's collection. Groups define who discovers it. Service contracts let apps make the call (CORS, browser-enforced). Group contracts let people see the content. Both must pass.

The mailer pattern is the model: sender writes to their outbox, attaches to receiver's inbox group, receiver discovers via group membership. Works for mail, DMs, comments, everything.

One insert. Zero fan-out. The author owns the data. The group controls the sharing. The authenticator manages both.

**Provider-level service contracts** — server-enforced app filtering beyond user-level CORS. v4 feature. See `../../web10-v4/sdk/advanced.md`.