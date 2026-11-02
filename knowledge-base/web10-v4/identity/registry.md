# Identity Registry — DNS-Style Name Resolution for web10 Users

**Status: PLANNED (v4).** This doc specifies a lightweight, third-party
identity-registry service that resolves a user's chosen name (e.g.
`@coolguydavid`) to the node where that user's data currently lives.
It is the missing piece that turns "your data is portable" from a
promise into a working mechanism: when a user moves nodes, their name
follows them, and anyone who knows the name can find the new location.

## Why This Exists

The thesis (`knowledge-base/strategy/thesis.md`) says the creator owns
their audience and can walk away. The multi-node federation design
(`knowledge-base/strategy/multi-node.md`, D84) gives a canonical
`{provider}/users/{username}` principal format so nodes can distinguish
`alice` on node A from `alice` on node B. But today the `provider` part
is baked into the identity: a user's address is only as portable as the
node they happen to be on.

The registry decouples the **name** from the **node**. The name is a
stable, user-chosen identifier. The node is a mutable pointer. A user
can move from node A to node B, update the registry, and their
`@coolguydavid` address keeps working. Followers, apps, and other users
resolve the name through the registry and reach the current node.

This is the same pattern as DNS: the domain name is stable, the IP
address changes, and the resolver (DNS server) maps one to the other.

## What the Registry Stores

A minimal key-value record per registered name:

```
name:        @coolguydavid
node_url:    https://node-b.web10.app
public_key:  <node B's JWKS public key, or a user-level key>
registered:  2026-11-02T12:00:00Z
updated:     2026-11-02T12:00:00Z
```

- **name** — the user-chosen identifier. Globally unique across the
  registry. Case-insensitive. ASCII alphanumerics + hyphen + underscore,
  3–32 chars.
- **node_url** — the base URL of the node where the user's data lives.
  This is what changes when the user moves.
- **public_key** — the key the registry vouches for. In v1 this is the
  node's JWKS public key (the same key D7/I1 uses for cross-node token
  verification). In a later version it could be a per-user key that the
  user controls directly, making the registry a pure name→key mapping
  independent of any node.
- **registered / updated** — timestamps for audit and TTL logic.

The registry does **not** store user data, content, group membership,
or tokens. It is a name-resolution service, not a data store.

## How Resolution Works

1. A client (app, SDK, or another node) wants to reach `@coolguydavid`.
2. It queries the registry: `GET /resolve/@coolguydavid`.
3. The registry returns `{ node_url, public_key }`.
4. The client uses `node_url` to make the actual API call (read a
   profile, follow, send a DM, etc.) and uses `public_key` to verify
   the token the node returns (the same JWKS verification D7 already
   specifies).

The registry is **on the read path** but not on the data path. Content
never flows through the registry. A registry outage degrades name
resolution (clients fall back to a cached `node_url` or the user can
be reached by direct node URL) but does not block data access to a
node whose URL is already known.

## How a User Moves Nodes

1. The user creates an account on node B (or node B provisions one
   during a migration flow).
2. The user's data is migrated from node A to node B (the export/import
   path, `knowledge-base/web10-v3/social/import.md`).
3. The user (or node B, with the user's signed authorization) updates
   the registry: `PATCH /names/@coolguydavid` with the new `node_url`
   and `public_key`.
4. The registry records the update. Subsequent resolutions return node B.
5. Node A's copy of the user's data is tombstoned or archived per the
   node's retention policy. The registry no longer points to node A.

The update in step 3 is **authenticated**: the user signs the update
with their account key (the same key that authenticates them to the
node). The registry verifies the signature before accepting the change.
This means a node operator **cannot** re-point a user's name without
the user's cryptographic consent. The name is the user's, not the
node's.

## Trust Model

- **The registry is a trusted third party for name resolution only.**
  It can tell you where `@coolguydavid` currently lives. It cannot
  read, modify, or delete the user's data. It cannot mint tokens. It
  cannot grant access to any group.
- **The user's key is the trust anchor for identity.** The registry
  stores a public key; the user holds the private key. Moving the
  pointer requires the private key. Losing the private key is a
  recovery problem (handled by the node's existing recovery flow,
  `knowledge-base/web10-v3/auth/auth.md`), not a registry problem.
- **The node is the trust anchor for data.** The node enforces I1–I6
  on its own data. The registry does not add or remove any data-access
  guarantee. A node that misbehaves is a legal problem (the thesis's
  "you can sue them" model), not a protocol problem.
- **The registry is not a censorship point for content.** It resolves
  names to nodes. It does not inspect, filter, or moderate content.
  Content moderation is each node operator's responsibility (D81,
  D59).

## Infrastructure: "Boring DNS, Not a Blockchain"

The registry is a **small, boring, highly-available key-value service**
hosted on conventional infrastructure. The explicit design goal is to
be as unremarkable as a DNS server:

- **No blockchain, no crypto wallet UX.** The user does not manage a
  wallet, sign transactions, or pay gas. The "crypto" is the
  signature on the pointer update (Ed25519 or ECDSA), which the node's
  existing auth layer already handles. The user experience is
  "change your address in settings," not "open your wallet."
- **Registrar: Njalla (njal.la).** The registry's own domain and
  hosting are registered through Njalla, a privacy-focused registrar
  based in Costa Rica. Rationale:
  - Njalla does not proactively police content. It has a track record
    of hosting elections, activist sites, leak sites, and other
    "controversial but legal" content. The only stated suspension
    trigger is content affecting "anyone's health or safety"
    (malware, CSAM), which is a reasonable floor.
  - Costa Rica jurisdiction: no US extradition for political speech,
    strong privacy laws, slow enough a legal process that a takedown
    order is not instantaneous.
  - Njalla's ToS: "We're not going to give your customer data out
    easily. However, we will help if there are legal merits to any
    formal government requests." This is the right balance for a
    registry that must be reachable but should not be a data broker.
  - Njalla accepts crypto payments (Bitcoin, Litecoin, Monero,
    Ethereum) and PayPal, so the registry operator's own payments
    are not a single point of failure.
- **DNS resolution: Cloudflare.** The registry's domain uses Cloudflare
  for DNS (anycast, fast, reliable, DDoS-resistant). The registrar
  (Njalla) and the DNS resolver (Cloudflare) are deliberately
  different companies: the registrar holds the registration, Cloudflare
  resolves the name. Neither alone can take the registry offline.
- **Hosting: VPS in Iceland or Switzerland.** The registry service
  itself (a small FastAPI or similar service + a key-value store) runs
  on a VPS in a jurisdiction with strong privacy laws and a track
  record of resisting extraterritorial takedown requests. Iceland
  (home to Njalla's operational history and the old Wikileaks hosting)
  or Switzerland (strong privacy law, neutral jurisdiction) are the
  primary candidates.
- **Redundancy: at least two VPS instances in different jurisdictions.**
  The registry is a name-resolution service; if one instance goes
  down, the other serves. Clients cache the last-known `node_url` so a
  full registry outage is a degradation, not a failure.
- **No single point of failure in the trust chain.** The user's key
  (held by the user/node), the node's JWKS key (held by the node), and
  the registry's pointer (held by the registry) are three independent
  trust anchors. Compromising one does not compromise the others.

## What the Registry Does NOT Do

- **Does not store user data.** No documents, no media, no group
  membership, no tokens.
- **Does not enforce access control.** I1–I6 are enforced by the node,
  not the registry.
- **Does not moderate content.** The registry resolves names; it does
  not inspect what the user posts.
- **Does not replace the node's auth.** The user still authenticates to
  the node with their normal credentials (password, phone, etc.). The
  registry is not an SSO provider.
- **Does not require a crypto wallet.** The user's "key" is the same
  account credential the node already uses. There is no separate
  wallet, no seed phrase, no gas fee.

## Relationship to Existing Decisions

- **D84 (multi-node federation):** the registry is the missing
  "name→node" layer that D84's canonical principal format implies but
  does not build. D84 says `provider/username` is the canonical form;
  the registry makes `provider` a resolvable, mutable value instead of
  a fixed string.
- **D7 (JWKS cross-node token verification):** the registry's
  `public_key` field is the node's JWKS key. The registry does not
  change the verification protocol; it just tells the client which key
  to use.
- **D41 (readable by design, data policy not privacy):** the registry
  is consistent with D41. It does not add encryption or secrecy. It
  adds a name-resolution layer that makes the "you can walk away"
  promise operational.
- **D60 (node stays generic):** the registry is a separate service,
  not a node endpoint. The node does not learn about the registry; the
  SDK/client does. This keeps the node generic.
- **Gap 4 in `ads-october/gaps.md` (export/portability):** the
  registry is the "301 redirect" mechanism the operator described.
  When a user moves, their name redirects to the new node. The
  registry is the infrastructure that makes the redirect work.

## Open Questions

1. **Name claim process.** How does a user claim `@coolguydavid`?
   First-come-first-served? Verification (phone/email) to prevent
   squatting? A short waiting period after a name is released?
2. **Name release.** When a user deletes their account or leaves a
   node, does their name become available? After what delay? Can the
   user "park" a name without active data?
3. **Registry operator governance.** Who runs the registry? web10 Inc.?
   A foundation? A community-governed entity? The operator's identity
  and jurisdiction are a trust decision, not just a technical one.
4. **Federation of registries.** Is there one global registry, or can
   different communities run their own registries (like different DNS
   TLD operators)? This affects whether `@coolguydavid` is globally
   unique or per-registry.
5. **Rate limiting and abuse.** The registry is a public lookup
   service. It needs rate limiting to prevent enumeration attacks
   (someone iterating over `@user1`, `@user2`, ... to map the user
   base). The rate-limit policy is a product decision.
6. **Migration tooling.** When a user moves nodes, who performs the
   data migration? The user manually exports/imports? Node B pulls from
   node A? A migration service? The registry update (step 3 in "How a
   User Moves Nodes") is the last step; the data transfer is a
   separate problem.

## The One-Liner

**The registry is DNS for web10 identities: a boring, third-party,
name→node lookup that lets a user's name survive a node change, with
the user's key as the trust anchor and no wallet, no blockchain, and
no content stored.**