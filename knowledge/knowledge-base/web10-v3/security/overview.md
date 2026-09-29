# Security Model

web10 nodes hold people's data and creators' money. The security model is defined as five invariants. Every architectural decision is judged against them.

## The Invariants

Five guarantees that must hold every phase. The conformance/permission test suite enforces them mechanically.

| Invariant | Guarantee |
|---|---|
| **I1** | A provider verifies any token's issuer cryptographically, without trusting the token's own claims. |
| **I2** | Authorization decisions use only verified token data — never an unsigned decode. |
| **I3** | No query returns documents for an `author_key` the token doesn't own, unless group membership grants access. |
| **I4** | The node is a readable, accountable broker: content is node-readable by design (discovery, search, auditability). Operator-blindness is explicitly **not** a goal (D41). Access is controlled by terms (I3); the operator is legally liable for hosted data. |
| **I5** | Every actor (app, agent, LLM) acts under a scoped, expiring, revocable token enforced by app contracts. |
| **I6** | The cross-node boundary is the HTTP API + a verified token. No node ever queries another node's ClickHouse; remote data is content, never control (never query input, never a key into the local store, never a grant). |

**Known gap:** I1 is partially broken — symmetric HS256 signing means providers can't verify each other's tokens. The fix (RS256/EdDSA + JWKS, D7) is in flight. Do not add code that deepens the HS256 assumption.

**I6 (federation, D84):** the multi-node read model is **client-side fan-out** — the user's client queries each node and merges; a node never proxies another's data. The cross-node boundary is the HTTP API with a JWKS-verified token (I1), **never** a cross-ClickHouse query (`remote()`/`cluster()` are for trusted clusters and are rejected for federation). The feed merge is a result-set *union* of independently I3-authorized reads, so a foreign node's data can't steer what the local node queries — a data reference is not a grant (the same property that stops a local user reading other posts). Full model + the "mine Node A from Node B" walk-through: `knowledge/strategy/multi-node.md`.

## How ClickHouse Enforces I3

v3 uses a single `documents` table. There is no per-user collection to isolate access. The enforcement is query-level:

```
Every read query must:
  1. Filter by author_key = token.username (own documents), OR
  2. Traverse through doc_groups + group_members (group-discovered documents)
```

There is no sandboxed aggregation pipeline (v2). There is no cross-collection stage (v2). The ClickHouse queries are constructed by the API layer — they always include the `author_key` or group membership filter.

**The membership check includes the reserved principal-class rows (D58).** A reader reads a group's documents if they're a literal member (`member_key = reader`) **OR** the group carries the `anyone` grant (always — the public class) **OR** the `authenticated` grant (real users only). This is why the public (discover) board is anon-readable: the discover group's public member is the `anyone` class (the legacy `anon` row was renamed), not a literal `anon` membership. Every read path — the group read, the **read-by-id** (`read_document_by_id`, the watch page's post read), the people directory — applies this same principal-class gate. A read path that checks only literal membership (`member_key = reader`) silently 404s for anon on public groups (the watch-page bug, 3.172.1).

```mermaid
flowchart TD
    A["API receives request"] --> B{"Token username?"}
    B --> C["author_key = :username"]
    B --> D["OR group membership check"]
    D --> E["doc_groups JOIN group_members"]
    E --> F["member_key = :username"]
    C --> G["UNION"]
    F --> G
    G --> H["Filter deleted = 0"]
    H --> I["EXCEPT group_hidden_docs"]
    I --> J["Return results"]
```

## Two-Contract Access Model

v3 has two contract types that enforce completely different concerns. Both must pass for a request to succeed.

```mermaid
sequenceDiagram
    participant App as Client App
    participant API as API Server
    participant AC as App Contracts
    participant GC as Group Contracts
    participant D as Documents

    App->>API: GET /alice/posts
    API->>AC: Check app contract for origin
    AC-->>API: Allowed (posts/readAll)
    API->>GC: Check group membership
    GC-->>API: Member of jazz-collectors
    API->>D: SELECT WHERE author_key = 'alice' AND doc IN groups
    D-->>API: post-1, post-2
    API-->>App: Return results
```

**App contract** — Infrastructure trust. "What can this app do with my data?"
- One contract per origin
- Per-service permissions: `readAll`, `create`, `updateOwn`, `deleteOwn`
- CORS-enforced in the browser
- Server-enforced on every API call
- Stored in `app_contracts` table

**Group contract** — Social access. "Who gets to see this content?"
- Roles define permissions scoped to services
- Membership defines who is in the group
- Content is attached to groups via `doc_groups`
- Read queries filter through group membership
- Stored in `group_contracts` + `group_members` tables

## Token Security

JWT tokens carry `username`, `site`, `target`, `provider`, `expires`. The SDK stores them in a `SameSite=Lax`, `Secure` cookie (60-day max age).

Server-side verification:
- `decode_token` verifies the JWT signature before extracting claims
- Token username is used to scope all queries
- Token expiry is checked on every request

Client-side:
- `postMessage` tokens are only accepted from the configured `authOrigin`
- Tokens are posted only to the referrer origin, never to `'*'`
- No token in URL — cookie and request body only

## Blocking and Sharing

Two levels of user-controlled blocking:

**User-wide blacklist** — block someone entirely. They can't see any of your content, anywhere. Stored in `user_blacklist`.

**Per-group blacklist** — block someone from seeing your content in a specific group. They're still a member. They still see everyone else's content. Just not yours. Stored in `group_blacklist`.

**Sharing toggle** — per-user, per-group. "Pause sharing without leaving." You stay a member. You still see their content. They can't see yours. Stored in `user_group_sharing`.

## No E2E by design (D41)

web10 is a data-policy platform, not a privacy platform (D41, `thesis.md`). The
node is readable by design — discovery, search, and auditability all require it,
and "discoverable" and "hidden from the node" are mutually exclusive. Access is
controlled by the terms/permission model (I3), not by cryptography; trust in the
operator is legal (they can be sued), not cryptographic.

E2E is not banned — it is not the default and not our product. A user or third
party may build their own e2e layer on the SDK + WebRTC. If a real creator asks
for operator-blind DMs, that becomes an opt-in tier, never the default. The
former e2e design (phone-as-keychain, wrapped keys, CP-ABE, MLS) was reversed in
D41; the mobile encryptor app is deleted.

## Federation (I1 — in flight)

The federation signing weakness is being fixed: HS256 → RS256/EdDSA + JWKS. Asymmetric signing, per-node keypair, public keys published at a well-known JWKS URL, offline verification. Dual-verify during migration, then drop HS256.

## See Also

- `../auth/auth.md` — auth flow, token structure, ACR
- `../db/clickhouse.md` — schema: documents, doc_groups, group_contracts, group_members, app_contracts
- `../groups/overview.md` — group contracts, roles, join policies
- `../sdk/contracts.md` — app contracts, group contracts, blacklists
- `../sdk/implementation.md` — SQL behind every SDK call (author_key + group membership filters)
