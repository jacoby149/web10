# web10 v4: Shadowguard

02.11.2026. **Status: deferred web10 v4 concept, not on the active v3 roadmap.**
The operator explicitly said this is not planned any time soon. This note
preserves the idea for later, not an implementation assignment, scheduled release,
approved protocol or security guarantee. No blockchain, DID method, wallet provider
or contract selected. See the [parking lot](later.md#web10-v4-shadowguard).

Do not start protocol evaluation, implementation or a new execution lane for this
concept without explicit operator reactivation for v4 planning. Current v3 work,
including its existing identity/federation and security obligations, is unchanged
and must not acquire a Shadowguard dependency.

> Change your host. Keep your identity. Keep your audience.

## Why It Exists

A creator builds an audience, then the company providing their account decides
they are no longer welcome. Exporting posts is not enough if every follower has
to find a replacement account and click Follow again. Ownership ought to include
an exit, not merely a suitcase full of JSON.

Shadowguard's goal is deplatforming-resistant identity and audience access, not
merely an account-export or migration feature. The operator clarified: "the idea
is no one could deplatform you, they would all resolve your domain with the tech".
Participating clients resolve the creator's address/portable identity through
independently accessible, verifiable records rather than asking web10 or the old
host whether that creator is still allowed to exist. A provider dropping the
creator must not erase their identity, sever follows or veto a valid new location.
Followers recognize the same creator after a change of username, domain or server.
It serves the existing
[thesis](thesis.md): own the audience and distribution, not server-blind privacy
or a cryptocurrency economy.

The operator's priority is explicit: "migration doesnt even matters who cares
about the old data and shit, they want their audience". Old posts, media, messages
and account history are not Shadowguard's deliverable. A creator must be able to
start with an empty server and still reach the people who already follow them.

The operator's name for it: "web10 shadowguard". The eventual identity direction:
"you follow web10.app/jacoby149 -> [...] some id thing that is globally unique".
Earlier discussion considered making a domain itself the identity. The later
key-based proposal separates the friendly address from what followers follow.

## The Creator's Move

Jacoby is discovered at `web10.app/jacoby149`. A fan follows him there. With
Shadowguard, the follow binds to a portable cryptographic identity rather than
only that provider-qualified address.

Later Jacoby moves to another node. He authorizes the new location using the
identity's controlling key or keys. The fan's app verifies the change and finds
the same identity at its new home, without asking the fan to refollow.
The new node can start empty. Jacoby publishes a new post and existing followers
receive it through compatible clients. Recovering his old posts is irrelevant to
whether Shadowguard succeeds.
His memberships and roles on other available group nodes also still recognize
the same identity; changing where it resolves must not require being invited or
promoted again.

```text
web10.app/jacoby149       Friendly address used for discovery
          |
portable identity        What a Shadowguard follow binds to
          |
authorized location      How a client finds the current node
```

This is an illustrative relationship, not an identifier format or wire schema.
An independently generated cryptographic identifier can make accidental collisions
negligibly unlikely; it does not need a globally exclusive human-readable name.

## Optional, Not Homework

The operator explicitly wants the choice "to not do it at all".

- **Default:** use an ordinary web10 account/address without buying a domain,
  installing an external wallet or enabling Shadowguard. Do not imply that the
  existing account already has provider-independent identity or seamless migration.
- **DNS:** optionally use a domain such as `creator.com` as a discovery address.
  Conventional registrar/registry control and expiration still apply.
- **ENS:** optionally use a name such as `creator.eth` as a discovery address.
  Its deployed contracts, record-control permissions and dependencies need review.

Shadowguard enrollment and key custody remain design questions. DNS and ENS are
optional naming integrations, not prerequisites for cryptographic identity. A name
change or sale must not silently transfer an existing key-based audience to the
new name owner. The treatment of old discovery aliases needs explicit rules.

## What Must Be Real

Resolution is part of the protection, not an optional convenience. Losing access
to web10's website, directory, resolver or hosting must not prevent a compatible
client from obtaining and verifying the latest owner-authorized location through
independent infrastructure. No mandatory central approval, provider blacklist or
administrator-controlled renewal path may be able to revoke the portable identity.
Ordinary DNS/ENS aliases do not automatically satisfy this requirement: if an alias
is suspended, existing follows must still resolve the underlying identity. Selecting
and verifying technology with these properties remains an open protocol decision.

The identity controller must be able to authorize a location change without the
old hosting provider's approval. Direct followers must verify that authority;
merely returning a new URL from a directory is not proof. The new node must also
prove its authorization to serve that identity. Identity control is not a substitute
for the node's credential, app-contract or group-access checks.

Existing follows must survive independently of the creator's old host. A fan's
subscription to the stable identity must keep resolving to its authorized location;
the old provider cannot be the only keeper of that relationship. Where those
subscriptions live and how compatible clients consume them is a protocol decision.
A location record alone is insufficient if the ban also destroys every follow.

**Group permissions follow the identity too.** A group's member/role grant must
reference the stable principal, not the current API URL, host account or username.
When the identity's owner-authorized location record changes (including a DNS/ENS
record where supported), the group node resolves the new location as needed and
verifies that the caller still controls the same principal. Its existing live
grants continue to apply without copying a permission table from the old creator
host or asking the group to re-add the member.

```text
Group grant: portable identity -> moderator
Location:    portable identity -> old node, then new node
Result:      same member and current moderator grant; different location
```

Resolution locates an identity; it does not award roles. A changed DNS answer or
a matching display name alone must not confer authority. The group remains the
authority for current grants, expiry and revocation: a revoked role stays revoked
after relocation, and taking over an old alias must not inherit the member's role.
Availability of the group node and its own grant records is a separate dependency.

Do not make post exports, content backups, historical membership tables or audit
history prerequisites for Shadowguard. Historical-data migration is a separate,
optional feature. Public audience continuity must work on a fresh node without
the old provider's cooperation. New/private access still needs valid authorization:
following an identity does not itself grant private access or revive revoked grants.

## Protocol Choice Is Open

An existing reviewed DID/signed-record protocol and a wallet-controlled on-chain
registry are candidates. Reuse established cryptography and protocols; do not
invent a signature scheme, consensus network or recovery mechanism for this feature.

Ethereum is optional. In an on-chain design, publish only the small identity/
authority/location state required by the chosen protocol. Posts, media and normal
feed reads stay on web10 nodes; fans should not need blockchain transactions to
follow or read. Blockchain reads do not inherently consume gas, but RPC requests,
hosting and on-chain updates have costs and availability dependencies.

The operator's concern is stronger than a website promising not to ban users:
can an administrator seize an identity, redirect it or prevent a valid renewal?
Evaluate actual deployed permissions and upgrade paths, not the word
"decentralized". ENS website access, ENS governance and name-contract control
are different layers; this note does not certify ENS as administrator-free.

## Decisions Before Code

- Stable identifier and authority model, including whether keys can rotate without
  changing the identity and how an existing account proves its initial binding.
- Custody, enrollment, lost-key recovery and stolen-key response; distinguish
  owner-authorized recovery from an operator's power to confiscate an identity.
- Discovery after the old host disappears, including replicated location records,
  freshness, conflicting updates, rollback/replay resistance and outages.
- Name binding and release, binding existing follows to portable identities, and
  subscription persistence outside the creator's old provider. Bind live group
  memberships/roles to that same principal, independent of location, while keeping
  authorization/revocation with the group. Historical content migration is not a
  launch gate.
- Resolver trust, unsafe destination handling, privacy of published records,
  operating costs and compatibility with cross-node authentication.

These extend the current `{provider}/users/{username}` model in
[multi-node.md](multi-node.md); they do not silently replace D84 or declare
federation complete. Portable identity and permission to read another node's data
are separate problems. Any adopted architectural change needs its own decision
record and bounded implementation plan.

## Acceptance And Limits

The prototype acceptance scenario: a fan follows a creator, then the creator's
old provider bans them and makes its content, directory and resolver unavailable.
The creator authorizes a fresh, empty node and publishes a new public post.
The existing fan's independently operated compatible client resolves the same
identity and receives that post without refollowing. No old posts, media, account
database export or creator-side membership backup may be required to pass.
The fan's pre-existing follow must survive outside the banning creator host.

Before relocation, grant that identity membership and a service-specific role in
an independently hosted group. After the location update, verify the same permitted
reads/writes from the new node without re-invitation or role changes. Revoke a grant
at the group, then relocate again: access must remain denied. An attacker changing
an alias/endpoint without identity authority must not inherit those grants.

Verify that forged/stale redirects fail, private/revoked access stays denied,
and names can change without changing the followed identity. A solution requiring
the banning provider to approve the move fails. Key recovery is a separate gate,
not something successful audience continuity proves.

The target is that **no individual provider can deplatform the creator from the
network by revoking their address or trapping their audience**. That is stronger
than preserving an export. It is not a claim that every third-party app must show
the creator: a search engine can delist, a client can filter, a host can refuse
service and a payment processor can decline transactions. The creator must remain
independently resolvable and reachable through compatible clients and an available
host. Blockchain/relay availability and network blocking remain dependencies;
absolute worldwide availability is not an implemented or proven guarantee.

If explicitly reactivated for v4, first compare existing protocols against these
requirements in a docs-only decision bite before selecting infrastructure or
writing runtime code. That comparison is deferred too, not a next task for the
current fleet. No release date, security sign-off or completed portability claim
accompanies this concept.
