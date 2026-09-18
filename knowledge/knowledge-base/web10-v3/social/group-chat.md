# Group chat — N-person messaging in the Messages surface

A group chat is a conversation with more than two people. It has a **name**
(the thing the operator asked for — "some kind of chat name"), a **member
list**, and **per-sender messages** (every bubble says who said it, because
with N people the sender is no longer implicit). It lives in the **Messages**
surface, alongside 1:1 DMs — not in the Groups surface (that's the community
*feed*). This doc defines what a group chat *is* on the wire and how the
client builds, lists, and renders one.

## The use case

A creator wants a room for their close fans, their collab partners, or their
team — a named place where a handful of people talk at once. They open
Messages, tap "New group," give it a name, add the people, and it shows up in
their conversation list like a DM. They open it, see the group name up top and
the member count, and the thread shows each message with the sender's name and
avatar (not just "you / them"). That is the whole feature.

## What a group chat is on the wire

A group chat is a **group** — the same node primitive a DM is. A DM is a
2-member `dm-` group; a group chat is an **N-member group** (N ≥ 2, typically
3+) with a user-chosen name. Messages are `posts` docs in the group, exactly
like a DM. The only new thing is the **kind** marker that tells the app "this
group is a chat, not a community."

### The `kind` marker (the source of truth)

A group's face lives in the `web10-social-group-identity` service (the same
service communities use for their name/avatar — D60). A group chat's identity
doc carries **`kind: 'chat'`**. A community's identity has no `kind` (or
`kind: 'community'`). This is the single field that separates the two:

```
group chat identity:  body = { kind: 'chat', name: 'The Crew', avatar_ref: '…' }
community identity:   body = { name: 'Synthwave Sessions', tags: […], … }   // no kind
```

Why a `kind` field and not a group_id prefix (e.g. `chat-{slug}`): a prefix
collides with a community someone legitimately names "Chat Room" (slug
`chat-room`), and the group_id is an internal identifier the user never sees.
The `kind` field is explicit, collision-free, and lives on the face the app
already reads for the name. **Classification is: read the identity, check
`kind`.** A group with no identity, or an identity without `kind: 'chat'`, is
a community (backward compatible — every pre-existing community has no `kind`).

### Roles

A group chat is **invite_only** (no random joiners — you add people, you don't
let the node's public directory find it). Two roles:

- **`owner`** — the creator. Read + create + edit + delete on `posts`, full
  control of the face (`web10-social-group-identity`), and group management
  (assign/revoke roles, delete the group). The creator is the only owner.
- **`member`** — everyone added. Read + create + edit-own + delete-own on
  `posts` (send a message, edit/delete their own), and **read-only** on the
  face (they see the name + avatar, they can't rename the chat).

Member keys are **bare usernames** (the node's user-key form — the same rule as
DMs; a provider-qualified key would not match the real user). The creator is
added as `owner`; the chosen members as `member`.

### The group_id

`createGroup` derives the group_id from the caller's token:
`{provider}/groups/users/{creator}/{slug}`. The slug is the slugified chat
name. The **pretty name** lives in the identity doc (the slug loses
capitalization/spaces); the app always displays the identity `name`, falling
back to the slug only when the face read fails. The creator is embedded in the
id (whoever creates it owns it) — the same asymmetry as a DM, resolved the same
way (the recipient finds it by membership, not by deriving the id).

## The data seam

New module `src/data/groupChat.ts` (sibling to `dms.ts`):

- `createGroupChat(name, memberUsernames)` — slugifies the name, calls
  `createGroup(slug, 'invite_only', CHAT_ROLES, [owner, …members])` (bare-
  username member keys), takes the **returned** `group_id` (never a locally
  computed one — the API derives it), then writes the face
  (`{ kind: 'chat', name }`). Returns the `group_id`.
- `getMyGroupChats()` — `getMyGroups()` minus infra (discover / followers /
  app-storage) minus DMs (`isDmGroup`), then read each remaining group's
  identity and keep the ones with `kind: 'chat'`. Returns
  `{ groupId, name, avatarRef }[]`. (Per-group identity reads; the list is
  small. Batching is a later optimization.)
- `readGroupChatFace(groupId)` — read the identity doc → `{ name, avatarRef }`
  (degrades to `{}` on a 403 / no face, like `readGroupIdentity`).
- `readGroupChatMessages(groupId)` — read `posts` in the group, sorted by
  `created_at` (the same read a DM runs, scoped to one group). Returns
  `DmRecord[]`-shaped messages (they carry `sender_username` / `sender_provider`
  in the body — see below).
- `sendGroupChatMessage(groupId, message)` — create a `posts` doc in the group
  with `body = { message, sender_username, sender_provider, … }`. The write
  gate (D58) requires membership; a non-member 403s (I3).

`getMyCommunityGroups()` is unchanged in v1 — a group chat is a non-infra group, so it
may **also** appear in the Groups surface's My Groups (a known v1 duplication; the
`kind: 'chat'` filter there is a small follow-up). The two surfaces are intended to be
disjoint (Messages = DMs + chats, Groups = communities); v1 just doesn't enforce it on
the Groups side yet.

### Per-sender attribution (why the message body carries the sender)

A DM can hide the sender (it's implicit: you or them). A group chat has N
senders, so **every message must say who sent it**. The message body already
carries `sender_username` + `sender_provider` (the DM write sets them; the
group write does the same). The thread renders each bubble with the sender's
name + avatar (resolved from the profile, like the DM list does for the other
party) **except** the reader's own messages (right-aligned, no name — the
"you" case). This is the one render difference between a DM thread and a group
thread.

## The UI (Messages surface)

### The list

The conversation list shows **DMs and group chats together**, sorted by
last-message recency (the existing DM sort). A group-chat row shows the group
**name** (not a person's name), a group avatar (the face, or a `Users`-glyph
fallback when unset), and the last-message preview. It is deep-linkable at
`/messages/group/{groupId}` (the splat route; the `group/` prefix distinguishes
it from a DM key, which is `provider/user--provider/user`).

### The create flow

"New group" CTA in the Messages header (next to "New message"). Opens a sheet:
a **name** field + an **add members** picker (the same contact/follow source as
the DM picker, multi-select). Submit → `createGroupChat` → navigate to the new
chat. Minimum: a name + at least one other member (a 1-person "group" is just a
note to self, not a chat).

### The thread view

Same shell as a DM thread, with three differences:
1. **Header** — the group **name** (not a person's name) + a member count
   ("N members"), tappable to a member list. No presence dot (presence is a
   1:1 concept; group presence is a follow-up).
2. **Per-sender bubbles** — every inbound bubble shows the sender's avatar +
   name above the text; the reader's own bubbles are right-aligned with no name.
3. **No "delete conversation" for non-owners** — only the owner deletes the
   group; members can leave (a follow-up) or delete their own messages.

## Real-time (v1: CRUD-only)

The DM real-time fast path (D69 / the P2P data channel) is **pairwise** — it
nudges one peer. A group chat has N peers, so fanning a nudge out to all of
them (and handling the ones who are offline) is a real design question. **v1
ships CRUD-only**: a group message lands when the recipient opens or refreshes
the conversation (the same guarantee a DM has when P2P is off). The instant
nudge to a group is a **follow-up** (fan the P2P nudge to every member's peer,
best-effort, offline members catch up on the next read). This is explicitly
shippable — the message is durable in the group regardless of the nudge.

## Security invariants

- **I3 holds** — a group message is a `posts` doc in the group; writing it
  requires membership (the D58 write gate), and the read is a group-scoped read
  through the safe-query engine. A non-member's read 403s (the same anti-test
  as a DM: a third party cannot read the group).
- **No escalation** — the face (`kind: 'chat'`, name, avatar) is a content-
  limited doc in a service members can already read; reading it grants nothing
  the group membership did not.
- **`kind` is not a security boundary** — it is a render hint (chat vs
  community). Access is decided by group membership + the D58 gate, never by
  the `kind` field.
- **invite_only by construction** — a group chat is never `discoverable` (it is
  not blasted into the public directory); you reach it by being added or by a
  member sharing the deep link.

## What this is not

- **Not a community.** A community is a *feed* (posts with author, in the
  Groups surface, optionally public/discoverable). A group chat is a
  *conversation* (in Messages, invite_only, per-sender bubbles, a name). Same
  group primitive, different surface + `kind`.
- **Not real-time fan-out (yet).** v1 is CRUD-only; the P2P group nudge is a
  follow-up.
- **Not group management (yet).** The owner can delete the group; renaming,
  adding/removing members after creation, and leaving are follow-ups. v1 sets
  the name + members at creation.
- **Not a node change.** Groups, roles, the identity service, and `posts`-in-a-
  group all exist. This is a client-side composition of existing primitives +
  one new `kind` field on the face.

## Reference

- The DM model this generalizes (2-member `dm-` group, messages as `posts`):
  `../../../../marketing/web10-social/src/data/dms.ts`
- The group primitive + the identity service (D60) + the community create flow:
  `../../../../marketing/web10-social/src/data/groups.ts`
- The group-contract model (invite_only, roles, the D58 write gate):
  `../../groups/social-contracts.md`
- The engagement/security invariants (I3, the safe-query read): `../overview.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
