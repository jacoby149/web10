# Multi-Node Federation — how web10 nodes work together (operator pass, 29.09.2026)

**Status: PLANNED (foundation set, not built).** web10 is a **federation of
nodes**, not one node. This doc is the authoritative reference for *how* the
nodes work together — the read model, the cross-node boundary, the security
invariants, and the phase sequencing. It is the "how" companion to **D84**
(`decisions.md` — the decision + the canonical principal format) and **D7**
(`decisions.md` — HS256 → RS256/EdDSA + JWKS, the cross-node token
verification, in flight).

> **The one-liner (operator, 29.09.2026):** "we need to make the multi node
> thing possible, set the foundation, we don't need to show it working right
> away, but yes we should be reading the other node's feed some day, multi node
> feed absolutely, but there is more we need to discuss about how that would
> work. i.e. does one node query the other node, or does the user query both
> nodes (the node they're on and the node they're not on)?"

**Companion docs:** `decisions.md` D84 (the decision + canonical format) ·
D7 (JWKS) · `knowledge-base/web10-v3/security/overview.md` (I1–I5, the
Federation section) · `knowledge-base/web10-v3/auth/auth.md` (Cross-Node
Addressing) · `parallel-execution.md` lane `multi-node-federation (D84)`.

---

## The two things that make it possible

Multi-node is not one feature. It is two independent foundations that must
both land before any cross-node read works:

1. **A single canonical principal format** across the whole identity layer
   (D84). Today the same user is `jacoby149` in `author_key` + followers
   `member_key` but `web10.app/users/jacoby149` in community/DM `member_key`.
   The canonical form is **`{provider}/users/{username}`** everywhere. Without
   this, a node can't tell `alice` on node A from `alice` on node B — the
   exact collision the operator flagged.
2. **Cross-node token verification** (D7 / I1, in flight). HS256 →
   RS256/EdDSA + JWKS: each node publishes its public key at a well-known JWKS
   URL; a node verifies *another* node's token **cryptographically** instead of
   rejecting it. Today a token from node B fails signature verification on node
   A (local key only) — that's the wall.

Neither alone is enough. The canonical format makes a foreign principal
*addressable*; JWKS makes it *trusted*. Both gate the cross-node work.

---

## The linchpin: you do NOT need an account on the other node

This is the property that makes the whole model clean, and the thing to hold
onto when reasoning about any of it.

alice's home node is **A**. She follows bob on **B**. **She never signs up on
B.** When her client reads bob's posts from B, it presents **her A-token**
(`provider = A`). B verifies that token via JWKS, recognizes the principal as
`A/users/alice`, checks that `A/users/alice` is a member of bob's followers
group, and serves the posts. No B account, no B password. Her identity is
**verified, not registered**, on B.

Consequences:
- A user's following set can span N nodes; they have exactly **one** account
  (on their home node).
- A node's data is only ever read by people who hold a *verified* token that
  the node's own group-membership check authorizes — whether that token was
  minted by this node or a foreign one.
- "Following someone on another node" is a **cross-node membership**, not a
  cross-node account.

---

## The cross-node boundary: the HTTP API + a verified token. Never the database.

**A node never queries another node's ClickHouse.** The cross-node boundary is
the **HTTP API** with a **JWKS-verified token**. Node A (or the browser, see
the read model below) calls B's *API*; B enforces its own I3 on its own data;
A never sees B's raw ClickHouse.

**Why not ClickHouse's cross-server functions?** ClickHouse *can* query across
servers (`remote()` / `cluster()` table functions). We **reject** them for
federation: those functions are for a *trusted cluster* — shared config,
identical schema, nodes you operate. Using them across independent nodes:
- couples the nodes' schemas (a B-side schema change breaks A-side queries);
- leaks a **DB-level trust path that bypasses the API's auth entirely** — a
  node operator's DB creds become a federation credential;
- hands one node raw read access to another node's store, which is the
  operator-blindness / I4 violation the thesis forbids.

The safe seam is the API: every cross-node interaction is an HTTP call that
passes through B's normal auth + I3 gate, exactly like a local call.

---

## The read model: client-side fan-out (v1)

When a user's feed spans two nodes, **who queries whom?** Two models:

| | Who makes the cross-node call | Merging | Node-to-node trust |
|---|---|---|---|
| **(1) Client fan-out** | the browser (holds alice's A-token, calls A and B directly) | client-side ranked merge | none — B authorizes alice directly |
| **(2) Server proxy** | node A (calls B on alice's behalf) | node A merges | A↔B credential + A brokers data it doesn't own |

**Decision: (1) client-side fan-out for v1.** Server-proxy is deferred.

Reasons:
- **Matches the existing Cross-Node Addressing SDK seam.** `w.read('posts', {},
  'bob', 'B')` already routes to a remote node's origin (`auth.md` →
  Cross-Node Addressing). It's half-built; fan-out finishes it.
- **No node-to-node trust.** Each node authorizes the user directly against
  her verified token. There is no A↔B credential to steal.
- **I3 stays local.** B enforces I3 on B's data; A never sees B's raw rows.
  Model (2) has A *brokering* data it doesn't own — the I4 tension, plus a
  cache/consistency problem (A's cached copy of bob's posts going stale).
- **The node stays a dumb broker** (D60). No node learns to "merge feeds."

**Model (2)'s concrete risk (why it's deferred, not banned):** A *holds* B's
data (a cache) and serves it. A cache-keying bug that omits the reader
principal becomes a **confused-deputy leak** — bob's B-posts served to a
different user. If a server-side merge is ever needed (e.g. for a server-side
ranking the client can't do), the cache key **must** include the reader
principal. That's the one thing to manage, and it's a reason to keep v1
client-side.

### "Mixing up the feeds" — yes, but targeted, not broadcast

The UI does a **ranked merge** (the feed already has the power-mean ranking).
The client groups the user's following set **by provider** and queries only the
*distinct* nodes she follows people on — not every node on the network. If she
follows 3 people on B, the client hits **B once**, not 3 times. This is the KB's
"targeted queries, not broadcasts" (`faq/skeptical-points-addressed.md`).

The merge is a **result-set union of independently-authorized reads**: A
returns A's posts (A's own I3-gated read), B returns bob's posts (B's own
I3-gated read), and the two already-authorized result sets get ranked together.
See the security section — the merge is what keeps remote data from becoming
a query input.

---

## The end-state vision: reads are the business model (operator, 29.09.2026)

> **The one-liner (operator, 29.09.2026):** "multi node could really unify the
> nodes … clickhouse is very powerful, i feel like it could feel as if it were
> one node, but it is two nodes carrying each other's load, and the node ads are
> being served in proportion to the amount the nodes are being hit" → "the v2
> you're proposing is all that is needed honestly, because reads are profitable,
> reads carry the node adds etc."

The read layer is not a *feature* — it is the **business model**. A node earns
from *serving reads*; node-ads (D57) ride with reads (operator-curated posts,
not a programmatic ad network — D5). In client-side fan-out, when alice (on A)
reads bob's post, the client hits **B** for it, **B serves the read + B's ad**,
and **B earns the impression**. The federation *routes read-revenue to the
content-hosting node*. That is the "creator runs a node and monetizes" thesis
(D5) made cross-node: bob's content earns B's ad revenue from reads by users on
*any* node. More reads → more ad slots → more revenue, linearly.

**Why it works cross-node without the node holding the viewer's data:**
node-ads are operator-curated, **not user-targeted**. B doesn't need alice's
data to serve B's ad — the ad is the same for whoever reads bob's post. No
targeting, no PII crossing the boundary. That is the readable-by-design thesis
(I4) doing monetization work: the data was never secret, so a node can serve a
global read (and its ad) to a foreign viewer without a privacy violation.

**The "feel like one node" spectrum — what's winnable, what's the wall:**

- **v1 (decided above):** read fan-out — the client queries both nodes, merges
  the *feed*. The foundation.
- **v2 (the unification target — and, per the operator, all that's needed):**
  cross-node **engagement aggregation** — a *global* like/comment count for a
  post. A like is a doc in the *engager's* service (D62 — reactions live in the
  engager's service), so alice's like on bob's post physically sits on **A**.
  The global count = B's local likes + an aggregation of foreign likes from the
  nodes that have them. Each node's ClickHouse fast-scans its local likes (this
  is where ClickHouse's power is real — it's an OLAP engine; "sum these up" is
  its home turf); the **API layer** does the HTTP fan-out + merge (I6 — the
  boundary is the API, not the DB); the client shows a unified,
  **eventually-consistent** count. This is where "feel like one node" is real
  and achievable, and it's *enabled* by readable-by-design (a privacy-first
  system couldn't do a global count without consent plumbing; web10 can,
  because the data was never secret). **Eventually-consistent is the bar** —
  ClickHouse is already eventually consistent *within* a node
  (ReplacingMergeTree dedups at merge time, not write time); across nodes it's
  eventually consistent *and* aggregated over a boundary. A social feed's count
  is not strongly consistent anyway (Instagram's aren't), so a fast,
  accurate-enough number that settles in seconds is indistinguishable in
  practice.
- **v3 (the wall — not the goal):** cross-node **write** unification — "two
  nodes carrying each other's load" at the *write* layer, a single
  strongly-consistent global counter. This is where ClickHouse's model says
  no: it's not a distributed consensus/transactional store. `ReplicatedMergeTree`
  replicates within a *cluster you operate*; `remote()`/`cluster()` query other
  servers (rejected for federation — I6). A strongly-consistent global mutable
  counter across two independent nodes needs a consensus protocol, which is not
  what ClickHouse is, and not what users need. **v2 delivers the "unified
  nodes" feeling without picking this fight.**
- **Ads-in-proportion-to-load (a parallel, tractable track):** it does *not*
  need unified ClickHouse. It's a **metering + settlement** system: each node
  meters its own traffic; node-ads rotate in proportion to reported traffic.
  A traffic ledger + an ad-rotation policy, not a data-consistency problem.
  **Settlement nuance (open):** when B serves its ad to alice (an A-user), does
  A get a cut for *routing* the viewer, or does B keep the whole impression?
  Lean: **B keeps it** (B served the read, B owns the ad, B does the work); A's
  value is its own content's reads, not a tax on others'. A settlement-policy
  question, not an architecture one.

**The honest summary:** you get "feel like one node" at the **read layer**
(eventually-consistent global counts, fast local aggregation via ClickHouse +
API-layer merge) — and that is all that's needed, because reads are what's
profitable. You do *not* get it at the write layer (a single strongly-consistent
global counter across two independent nodes) — and you don't need to.

---

## How a cross-node follow works (Phase C)

Following bob on B, from home node A:

1. alice's client calls **B's** "join group" endpoint for bob's followers
   group, presenting **alice's A-token**.
2. B verifies the A-token via JWKS (D7/I1) → principal `A/users/alice`.
3. B adds a member row to bob's followers group:
   `member_key = A/users/alice`, `role = member` (the D84 canonical format).
4. Done. The follow is a **membership row on B**, referencing a foreign
   principal. bob's posts never leave B; only the membership reference crosses
   the boundary.

The canonical format is what makes this unambiguous: `A/users/alice` and
`B/users/alice` are distinct rows in B's followers group. Without it (today's
bare `alice`), they'd collide.

**The app-contract detail (open, Phase C):** for the browser to call B, B's
CORS + app contract must allow the social app. Two options: (a) a federated
app carries its app contract on each node it reads, or (b) the
group-membership gate is the real gate and the app-contract is relaxed for
cross-node reads (the app is already trusted on the user's home node). Decide
in Phase C — flagging now so it's not a surprise.

---

## Security: the invariants that keep it safe

The existing invariants (I1–I5, `security/overview.md`) carry over. Federation
adds one, and the whole model is built to hold it.

### I6 — the cross-node boundary is the HTTP API + a verified token; remote data is content, never control

Two hard rules, together:

1. **No node ever queries another node's ClickHouse.** The boundary is the
   HTTP API + a JWKS-verified token. (See "The cross-node boundary" above.)
2. **Remote data is content, not control.** A foreign node's response is
   *untrusted content* — the same category as a post body (already untrusted
   UGC). It is **never** query input, never a key into the local ClickHouse,
   and never a grant.

### Why the "mine Node A from Node B" attack fails

The operator's concern (29.09.2026): *"could have a user follow a user on
another node, then joins work unexpectedly … a contrived ClickHouse in Node B
set up perfectly to steal from Node A when doing multi node query."*

It fails at the first step, and the reason is a specific property worth
naming: **every read is re-authorized by the *serving* node against the
*verified* token. A data reference is not a grant.** That's the same reason a
malicious user on a single node can't read other people's posts (I3).
Federation doesn't weaken it; it adds the JWKS step so the serving node can
*verify* a foreign token before applying I3.

Walk the attack:

- **"Contrived ClickHouse in B, set up to mine A during a multi-node query."**
  Fails: **there is no multi-node query.** A never reads B's ClickHouse (rule
  1). B's ClickHouse can contain *anything*; A never sees it. B only ever sees
  A's *API responses*, which are JSON content B already authorized for this
  reader.

- **"Put the perfect stuff in B to get an off-limits payload from A."**
  The only way B's "stuff" reaches A is as an **API response (JSON)**. For that
  to mine A, A would have to feed B's response into a query against A's own
  ClickHouse — `SELECT ... FROM A WHERE <something_from_B>`. **We don't do
  that** (rule 2). The feed merge is a result-set *union*; B's posts are
  *values being merged*, never *parameters to a query against A*. B's data can't
  steer what A queries.

- **The sneaky version:** B returns a post whose body *references* an A-node
  `doc_id`, hoping the client fetches it from A and leaks it. The client calls
  A for that doc with alice's token — **A re-authorizes that read against the
  token** (I3). If alice isn't authorized for that A doc, A 404s. B "pointing"
  the client at A data doesn't grant it, because A re-checks. The reference is
  not the grant.

The attack requires breaking one of the two I6 rules. We hold both.

### The one thing to lock in (so a future implementer doesn't open it)

- **Never** use a remote node's id/field as a key into the local ClickHouse.
- **Validate the shape** of every remote response (B could return a malformed
  payload that confuses the merge — treat it like untrusted input).
- In any future server-side merge (model 2), the **cache key must include the
  reader principal** (the confused-deputy guard).

---

## The phases (the foundation, in order)

Each is its own PR/lane (see `parallel-execution.md` → `multi-node-federation
(D84)`). This doc scopes them; it does not build them.

- **H — the two-node test harness** (`api2.localhost`). A second node on a
  **separate** ClickHouse + MinIO, brought up alongside the first, so the
  multi-node work is testable. Independent — can land first to de-risk. It does
  not show federation working; it proves two nodes are *distinct* (a user on A
  is not a user on B; a token minted by A is rejected by B until B lands).
- **A — the canonical principal format + migration.** Rewrite `author_key`,
  every `group_members.member_key`, and the reader principal to
  `{provider}/users/{username}`. A **data migration** (insert new-format rows,
  tombstone the old — the ReplacingMergeTree pattern), not a schema change.
  **Reverses the 3.179.1 `/by-user` stopgap** (which collapsed to the bare
  form) — after A, `provider/username` is the real stored form. **Gates C, D.**
- **B — cross-node token verification** (D7/I1, in flight). HS256 →
  RS256/EdDSA + JWKS. A node verifies another node's token cryptographically.
  **Independent of A** (A is data, B is auth) but both are needed before C.
- **C — cross-node group membership.** Following someone on another node =
  joining *their* followers group on *their* node (see above). This is where
  the canonical format (A) and cross-node auth (B) meet. **Gates D.**
 - **D — cross-node reads (the multi-node feed).** Client-side fan-out + ranked
   merge, targeted by provider (see the read model). **Gated on C.**
 - **E — cross-node engagement aggregation (the "unified" feel, v2).** A
   *global* like/comment count for a post: each node fast-scans its local
   engagement (ClickHouse OLAP), the API layer does the HTTP fan-out + merge
   (I6), the client shows an eventually-consistent unified count. This is the
   "feel like one node" payoff and the read-revenue model (see the end-state
   vision). **Gated on C** (a like on a foreign post is a cross-node read of the
   post + a local write of the reaction doc).
 - **F — ads-in-proportion-to-load (the settlement track).** A metering +
   settlement system: each node meters its own traffic; node-ads (D57) rotate
   in proportion to reported traffic. A traffic ledger + ad-rotation policy,
   not a data-consistency problem. Independent of E (it rides the same cross-node
   API boundary but is an accounting concern). **Open:** the settlement split
   (does the routing node get a cut, or does the serving node keep the whole
   impression — lean: the serving node keeps it).

**Sequencing:** H is independent (land it first). A gates C and D. B is
independent of A but both gate C. C gates D and E. F is independent (a parallel
track). **v3 (cross-node write unification / a strongly-consistent global
counter) is not a phase** — it's the wall, and v2 (E) delivers the "unified"
feel without it.

---

## Open questions (to discuss, not decided)

1. **The app-contract detail** (Phase C) — federated app contract propagation
   vs. group-membership-as-the-gate. See "How a cross-node follow works."
2. **Server-side merge (model 2)** — is there a ranking the client can't do
   that justifies a node proxying? If so, the cache-key-must-include-reader
   guard is non-negotiable. Default: no, client-side.
3. **Cross-node search / discover** — does the People browser / Discover span
   nodes? That's a separate surface from the feed (the feed is *targeted* by
   the following set; discover is *open*). Probably a later phase.
4. **Media across nodes** — a post on B references media on B's MinIO. The
   client follows presigned URLs (host-reachable). Confirm the presigned-URL
   shape works cross-node (the `S3_PUBLIC_ENDPOINT` is per-node today).

---

## The seam

`api/app/services/auth.py` (token verification — D7/I1, Phase B) ·
`api/app/v3/endpoints/auth_helper.py` + the reader-principal derivation
(Phase A) · `api/app/v3/services/clickhouse.py` (the `author_key` +
`member_key` + read-gate — Phase A) · the data migration (Phase A) ·
`sdk/src/v3.ts` (the Cross-Node Addressing seam — Phases C/D) ·
`marketing/web10-social/src/data/` (the client-side feed merge — Phase D) ·
the two-node test harness (`api2.localhost`, Phase H).
