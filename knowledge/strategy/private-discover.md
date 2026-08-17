# private-discover.md — groups + scoped discovery (design brainstorm)

Status: BRAINSTORM (31.07.2026) — not yet planned work. This doc captures the
operator's idea and the design option space before it becomes lane items in
`plan.txt` / `parallel execution.txt`. When a direction is picked, the
decision goes to `decisions.md` and the work gets bitten into the lanes.

## The idea (operator, 31.07.2026)

> "web10 needs to have groups added as a feature — providers, users, GROUPS
> in the contract! When you join a group, it makes a contract of posts for
> that group. Then the posts go on the private discover. When you do a feed
> search, your private part — not the public discover — it queries that
> private discover instead of the public discover. But they can be the same:
> public discover is just the PUBLIC group."

The unifying insight: **discovery is already group-scoped — today there is
exactly one group, "public", and everyone is a member.** Private discovery
is not a new subsystem; it is the same discovery machinery with an
audience/scope that isn't the whole world.

## Why it matters (strategy fit)

- D20: social platform first. Groups are the missing middle between "public
  post" and "DM" — the Facebook Groups / Close Friends / paid-tier shape.
- For the creator pitch this is THE monetization surface: paid-tier fans get
  a discovery feed the public never sees. Patronage as a feed, not a
  paywall page.
- It absorbs two already-deferred plan items: `friends_posts` (group =
  mutual follows) and `unlisted_posts` (same audience machinery, inverse
  flag).

## The contract model: providers, users, groups

Identity today is `(username, provider)`. The proposal adds a third
first-class principal: **groups**.

- A group is an addressable entity with its own terms/ACL records — a
  "contract of posts for that group" formed when you join.
- Joining a group = entering a contract: the group's terms grant you read
  (and maybe write) on the group's post service; your token + the terms
  decide what `is_permitted` already decides everywhere else.
- This reuses the existing machinery instead of inventing a parallel one:
  a group service is a service with a member ACL, exactly the
  `public_posts` / `private_posts` split pattern, with an ACL instead of an
  anon-whitelist. Bulk control stays instant (1 terms record).

Open question: is a group owned by one user (creator → fans: the group
service lives on the creator's collection) or is it a shared entity
(community: many members post in)? See "Shapes" below.

## Discovery unification: public = the public group

Today: `web10.discovery_posts` is a single world-readable index; a post is
in it or not.

Proposal: **every discovery query runs under a scope.** The default scope
is the public group (anon-OK, exactly today's behavior). An authenticated
user's query can run under additional scopes — the groups they belong to.

- "Your feed search" = public scope + your private scopes, merged (or
  queried per-scope and interleaved — UX decision).
- Same endpoints, same index machinery, same engagement aggregation — the
  only new concept is the audience field and the membership check.
- Public discovery literally becomes "discovery for the public group":
  one code path, no fork between public and private discovery.

## Design options

### 1. What is a group, concretely?

- **Option A — a service on the owner's collection** (e.g. creator's
  `group_posts`) with a terms record granting read to a member list.
  Cheapest fit; reuses terms/ACL; single-author broadcast (creator → fans).
- **Option B — a first-class group entity** (`groups` service with
  membership records, roles, invites). Heavier, but supports multi-member
  communities, multi-admin, membership management.
- **Option C — per-user circles** (Close Friends model): the author owns
  the audience list; no shared group identity at all.

Likely path: A first (monetization case, smallest build), B as a layer on
top later, C falls out of A with group = friends graph.

### 2. Where does the private index live?

- **Option A — scoped projections in the existing index.** Each
  `discovery_posts` entry carries `audience: public | group:<id>`. Queries
  must prove membership; API filters by audience. Risk: the index becomes
  a metadata leak — the node operator sees THAT a group post exists, its
  author, maybe its text. Brushes against I4.
- **Option B — per-group index collections** (`web10.discovery_<group>`),
  read-gated by the group's terms. Cleaner isolation; collection-per-group
  could explode.
- **Option C — no central index for groups; fan-out queries.** Group
  discovery queries the group service directly on the owner's collection —
  the author's collection IS the index. Simplest, most private; loses
  cross-author aggregation. Perfect for single-author groups.

Tension: cross-author group feed vs. privacy vs. index cost. Single-author
(creator → fans) works beautifully with C. Multi-member communities need
A or B.

### 3. How is membership proven at query time?

- **Query-time check** against the group's terms/member records (fresh,
  instantly revocable, a lookup per query — in the spirit of
  `is_permitted`).
- **Token claim** minted into the scoped token (fast, stale until expiry —
  but tokens are short-lived by design; in the spirit of federation).

Probably: query-time on the home node, token claims for cross-node later.

### 4. Encryption posture

D27: posts are plaintext by design; e2e is DMs only. Group posts sit in
between. Plaintext-on-node means the node operator can read "private"
group posts — a weaker promise than a paid tier may want. E2E group posts
need group keys (Signal sender-keys / MLS — already the named reuse
target). Phase-2 question, BUT: whatever index shape we pick should carry
metadata + pointers, not require plaintext bodies, so the e2e upgrade
later only changes the body, not the index.

### 5. Collisions / absorptions in the existing plan

- `friends_posts` (deferred, needs the friends graph) — absorbed: friends
  is a group.
- `unlisted_posts` (deferred) — same audience field, inverse flag.
- Composer visibility selector (Phase B, unticked) — becomes a 3+ way
  audience picker (public / group / private). Design the audience model
  BEFORE that UI ships or it gets reworked.
- Media access (Phase C: publishing must grant the audience read access to
  media) — gets easier: group media grant = same ACL as the group service.
- Moderation (1.0.297: profile wall reads collections directly, discovery
  is moderation-filtered) — group discovery needs its own moderation story:
  who moderates a group, the owner or the node board?

## The shape a v0 might take (sketch, not decided)

1. `audience` as a first-class field on the post + on the index
   projection: `public | group:<service@owner> | private`.
2. Group = a service with a member ACL on the owner's collection.
3. Discovery query takes an optional scope:
   `PATCH /discover/posts {scope: "group:..."}` — API verifies membership
   via terms at query time, serves the index filtered by that audience
   (or fans out to the group service for v0 single-author).
4. Index entries carry audience metadata only — e2e-upgradeable later.
5. v0 = single-author groups (creator → fans). v1 = multi-member
   communities. v2 = federated group discovery.

## Open questions for the operator

1. First use case: **creator → paid fans** (single author broadcasts to
   members) or **communities** (many members post in)? Decides option C
   vs. A/B and roughly halves or doubles the work.
2. Is plaintext-on-node acceptable for v0 group posts (like public posts
   today), or is "the node can't read my group's posts" part of the
   promise from day one?
3. Product shape: is a group something a user *joins*, or something a
   creator *grants* (a tier)? The terms machinery supports both; the UX
   differs.
4. "Providers, users, groups in the contract" — does group identity
   federate like user identity (`(group, provider)`), so a group on node A
   can have members from node B? That's the v2 federated-discovery shape;
   worth deciding early because it affects how group IDs are namespaced.
