# Domain Identity — the DNS TXT claim, the user column, and the alias-not-principal rule

**Status: v3, decided.** This doc is the authoritative reference for how a
web10 user claims a domain as their identity, how the node stores and
verifies it, and — critically — why the domain is an **alias**, not a
replacement for the username principal.

Companion docs: `setup/custom-domain.md` (the operator runbook for adding
the TXT record) · `../web10-v4/identity/registry.md` (the v4 public
name→node registry) · `db/clickhouse.md` (the `users` table schema) ·
`groups/access.md` (the I3 read gate).

---

## The one-liner

**The username is the principal. The domain is an alias that points at
the principal. Groups, tokens, and the read gate key on the username,
never the domain. The domain is resolved at display and lookup time, not
baked into the data.**

This is the DNS rule: `example.com` (the domain) points to an IP (the
principal). You can change the IP without changing the domain, and you
can change the domain without changing the IP. The two are independent.
web10 follows the same separation: the username is the IP, the domain is
the name.

---

## Why the domain is an alias, not a principal

This is the load-bearing decision. Getting it wrong breaks the model.

### What goes wrong if groups key on the domain

The group membership row is `member_key = {provider}/users/{username}`.
That is the **principal** — it is *who you are*, not *what you call
yourself*. The domain is a **label** you point at yourself. If you
rewrite every `member_key` to the domain:

1. **Identity couples to a mutable label.** The username is stable. The
   domain can change — you rebrand, you sell the domain, the registrar
   lapses it, you move to a new registrar. Every time the domain
   changes, every group row on every node you are a member of becomes
   stale. That is the "one big sweep per node" migration the KB was
   trying to avoid, now triggered by a *cosmetic* change.
2. **Cross-node breaks.** A member row on node B references
   `A/users/alice`. If alice's domain changes, node B's row is stale.
   The domain is not federated; the username is. The canonical principal
   format (D84) exists specifically so a node can tell `alice` on node A
   from `alice` on node B. The domain does not help with that; it
   obscures it.
3. **The I3 read gate breaks.** The read gate does
   `member_key = reader`. The reader principal is derived from the token
   as `{provider}/users/{username}`. If groups key on the domain but the
   token keys on the username, the JOIN fails and nobody can read
   anything. The read gate is the security boundary; it must key on the
   same stable principal the token carries.

### The DNS analogy (why this is the right shape)

| DNS | web10 |
|---|---|
| Domain name (`example.com`) | Domain alias (`coolguydavid.com`) |
| IP address (`93.184.216.34`) | Username principal (`api.web10.app/users/jacoby149`) |
| A record (domain → IP) | TXT record (domain → principal + key) |
| You can change the IP without changing the domain | You can change the node without changing the domain |
| You can change the domain without changing the IP | You can change the domain without changing the username |
| The IP is what servers actually route to | The username is what groups, tokens, and the read gate actually key on |
| The domain is what humans actually type | The domain is what humans actually see and share |

The domain is the **human-facing address**. The username is the
**machine-facing principal**. They are different layers, and conflating
them is the bug.

---

## The TXT record (the claim)

The user claims a domain by adding a TXT record to their DNS. The record
is the **proof** that the domain belongs to the user.

### Format

```
Type:  TXT
Name:  web10
Value: web10.v=1;provider=api.web10.app;user=jacoby149;key=<base64-nopad-ed25519-pubkey>
TTL:   300
```

| Field | Meaning |
|---|---|
| `web10.v` | Version tag. Always `1`. Lets the parser reject unknown formats. |
| `provider` | The node's API host (the `provider` claim in JWTs). |
| `user` | The web10 username (the `username` claim in JWTs). |
| `key` | Base64 (no padding) Ed25519 public key. The key the node uses to sign tokens for this user. |

The record is a single string, semicolon-delimited, no spaces. The
`web10.v=1` prefix is the namespace tag — it tells a resolver "this TXT
record is a web10 identity claim, not a DKIM record or some other TXT
data."

### Why TXT and not A/CNAME

- **A record** = "this domain resolves to this IP." That is routing. The
  web10 identity is not a routing decision; it is a data claim.
- **CNAME** = "this domain is an alias for that domain." That is
  delegation, not identity.
- **TXT** = "this domain carries this structured data." That is exactly
  what an identity claim is. The domain is the *subject*; the TXT record
  is the *predicate*.

This is the same pattern the web already uses for identity claims:
- **DKIM** — TXT record proving "this email is signed by me"
- **SPF** — TXT record listing "these servers are authorized for me"
- **OpenPGPkey** — TXT record for PGP key discovery

### The trust model

Three separate trust anchors, none of which can forge the others:

1. **The domain** is the *claim*. Whoever controls the DNS for
   `coolguydavid.com` can set the TXT record.
2. **The TXT record** is the *proof*. It names the `provider`, the
   `user`, and the `key`.
3. **The node's key** is the *trust anchor*. The node signs tokens with
   its private key; the public key in the TXT record is what a verifier
   checks against.

A domain squatter can point `coolguydavid.com` at their own server and
add their own TXT record. But they cannot sign a token with the real
`key` — so the node rejects their token. The TXT record is necessary but
not sufficient: the key is the real trust anchor.

---

## The `users` table: the `domain` column

The claimed domain is stored on the user's account, alongside `phone`
and `email`. This is account-level identity, not app-level data — the
same category as the phone number and email address the user already
stores on the node.

### Schema change

```sql
ALTER TABLE users ADD COLUMN domain String DEFAULT '' AFTER email_verified;
ALTER TABLE users ADD COLUMN domain_verified UInt8 DEFAULT 0 AFTER domain;
```

- **`domain`** — the claimed domain (e.g. `coolguydavid.com`). Empty
  string when no domain is claimed.
- **`domain_verified`** — `1` when the TXT record has been verified by
  the node, `0` otherwise. Set to `1` by the claim flow; set to `0` when
  the domain is released or the TXT record is removed.

### Why this is acceptable node surface (D60 check)

D60 says the node stays generic — no app-specific concepts. The test:
*"Would a notes app, a music app, or a shop use this column?"*

Yes. A domain claim is **account-level identity**, not an app concept.
Every app that uses web10 auth would want to know "does this user have a
verified domain?" The same way every app would want to know "does this
user have a verified phone?" The `domain` column is the domain analog of
the `phone` column — a universal account attribute, not a
social-specific field.

This is distinct from, say, a "followers group" or a "profile
visibility" — those are social concepts that only make sense for
web10-social. A domain claim makes sense for any app that authenticates
users against the node.

### Service functions

Following the existing INSERT-SELECT pattern (the same pattern
`change_phone`, `set_email`, `verify_email` use):

```python
def set_domain(username: str, domain: str, verified: int = 0) -> None:
    """Set the user's claimed domain. INSERT-SELECT: copy the latest row,
    update domain + domain_verified + updated_at."""
    client.command(
        "INSERT INTO users (username, password_hash, phone, phone_verified, "
        "email, email_verified, domain, domain_verified, created_at, updated_at, deleted) "
        "SELECT username, password_hash, phone, phone_verified, email, email_verified, "
        "%(domain)s, %(verified)s, created_at, %(updated_at)s, 0 "
        "FROM users WHERE username = %(username)s AND deleted = 0",
        {"username": username, "domain": domain, "verified": verified, "updated_at": _ch_ts(_now())},
    )

def get_user_domain(username: str) -> dict | None:
    """Read the user's domain + verified flag. Returns None if no domain set."""
    result = client.query(
        "SELECT domain, domain_verified FROM users "
        "WHERE username = %(username)s AND deleted = 0 "
        "ORDER BY updated_at DESC LIMIT 1",
        {"username": username},
    )
    row = result.result_rows[0] if result.result_rows else None
    if row is None or not row[0]:
        return None
    return {"domain": row[0], "verified": bool(row[1])}

def clear_domain(username: str) -> None:
    """Release the domain: set domain = '' and domain_verified = 0."""
    set_domain(username, "", 0)
```

### Self-heal migration

Pre-existing ClickHouse volumes (created before the `domain` column
existed) need the ALTER. Following the existing self-heal pattern
(`ensure_apps_schema`, `ensure_discover_group` in `main.py`):

```python
def ensure_users_domain_column() -> None:
    """Idempotent: add domain + domain_verified columns if absent."""
    client.command(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS domain String DEFAULT ''"
    )
    client.command(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS domain_verified UInt8 DEFAULT 0"
    )
```

Called at boot, alongside the other `ensure_*` functions.

---

## The verification flow

### Step 1: User adds the TXT record

The user goes to their DNS provider (Njalla recommended) and adds:

```
Type:  TXT
Name:  web10
Value: web10.v=1;provider=api.web10.app;user=jacoby149;key=<pubkey>
```

The authenticator UI generates this value for them (it knows the
`provider`, the `user`, and the node's public key) and displays
copy-paste instructions.

### Step 2: User hits "Verify" in the authenticator

The authenticator calls `POST /v3/domains/verify` with the domain.

### Step 3: Node does the DNS lookup

The node:
1. Resolves `web10.<domain>` via DNS TXT query (using `dnspython`).
2. Parses the TXT record value.
3. Validates the format:
   - Must start with `web10.v=1;`
   - Must contain `provider=`, `user=`, `key=`
   - `provider` must match the node's own `provider` (you can only claim
     a domain for your own node)
   - `user` must match the calling user's username (you can only claim a
     domain for yourself)
   - `key` must be valid base64 (no padding) and decode to a valid
     Ed25519 public key
   - `key` must match the node's current signing public key (the key the
     node actually uses to sign tokens)
4. If all checks pass: `set_domain(username, domain, verified=1)`.
5. If any check fails: return the specific failure (no TXT record found,
   wrong format, wrong provider, wrong user, key mismatch).

### Step 4: Node stores the verified domain

The `users` table now has `domain = 'coolguydavid.com'` and
`domain_verified = 1` for the user.

### Step 5: The domain is usable

- **Display:** the social app, the marketing site, and any app that
  renders a user's profile can show the domain instead of (or alongside)
  the username. The domain is the *human-facing* address; the username
  is the *machine-facing* principal.
- **Lookup:** any client can resolve `web10.<domain>` to find the
  `provider` + `user` + `key`, then authenticate with the node as that
  user. This is the "find me by my domain" flow.
- **Share links:** permalinks can use the domain
  (`coolguydavid.com/posts/abc123`) instead of the node URL
  (`api.web10.app/users/jacoby149/posts/abc123`). The domain is the
  shareable address.

---

## What the domain does NOT do

- **Does not replace the username in group rows.** `member_key` stays
  `{provider}/users/{username}`. The domain is never written into a
  group membership row.
- **Does not replace the username in tokens.** The JWT `username` claim
  stays the username. The domain is not a token claim.
- **Does not replace the username in the read gate.** The I3
  `member_key = reader` JOIN stays keyed on the username principal.
- **Does not federate.** The domain is a per-user, per-node claim. It
  does not make the user "federated" with other nodes. Federation (D84)
  is about cross-node token verification and group membership; the
  domain is an identity alias on a single node.
- **Does not replace the v4 registry.** The v4 identity registry
  (`web10-v4/identity/registry.md`) is a *public, third-party*
  name→node lookup. The domain TXT record is a *per-user, per-domain*
  claim on the user's own DNS. They complement each other: the TXT
  record says "this domain belongs to this user on this node"; the
  registry says "this user is currently on this node." The TXT record is
  per-domain; the registry is per-user.

---

## The "backfill" question (and why the answer is no)

The operator asked: *"all web10 docs will need to backfill as well to
allow the domain instead of the username."*

**No. There is no backfill.** Here is why:

The domain is an **alias**, not a **principal**. Documents, group rows,
and tokens all reference the **principal** (the username). The domain is
a **pointer to the principal**, stored on the user's account. When a
client needs to display a user, it looks up the user's domain (one read
of the `users` table) and shows the domain if present, the username if
not. The underlying data — the documents, the group rows, the tokens —
never changes.

This is the same reason you don't "backfill" a DNS change. When
`example.com` changes its IP from `93.184.216.34` to `93.184.216.35`,
you don't go rewrite every HTTP request that referenced the old IP. The
domain still resolves; the IP changed; the routing follows the domain.
The data (the web pages) never knew which IP it was being served from.

Similarly: when a user changes their domain from `coolguydavid.com` to
`davidcool.com`, you don't go rewrite every document, every group row,
and every token that referenced `coolguydavid.com`. None of them
referenced the domain. They referenced the username. The domain is a
label; the username is the data.

**The only "migration" is the display layer:** apps that render a user's
profile need to read the `domain` column and show it if present. That is
a one-line change in the profile renderer, not a data migration.

---

## The API surface

### `POST /v3/domains/verify`

Auth-required. The user asks the node to verify their domain's TXT
record.

```
Request:
{
  "token": "<jwt>",
  "domain": "coolguydavid.com"
}

Response (success):
{
  "domain": "coolguydavid.com",
  "verified": true,
  "provider": "api.web10.app",
  "user": "jacoby149"
}

Response (failure):
{
  "domain": "coolguydavid.com",
  "verified": false,
  "error": "txt_record_not_found"
  // or: "bad_format" | "wrong_provider" | "wrong_user" | "key_mismatch"
}
```

The node does the DNS lookup, validates the format, and if valid, calls
`set_domain(username, domain, verified=1)`.

### `POST /v3/domains/release`

Auth-required. The user releases their domain (sets `domain = ''`,
`domain_verified = 0`).

```
Request:
{
  "token": "<jwt>",
  "domain": "coolguydavid.com"
}

Response:
{
  "domain": "coolguydavid.com",
  "released": true
}
```

### `GET /v3/users/{username}/domain`

Public (anon-capable). Returns the user's domain + verified flag. This
is the "look up a user by their domain" read — any app can call it to
check if a user has a verified domain.

```
Response:
{
  "username": "jacoby149",
  "domain": "coolguydavid.com",
  "verified": true
}

// or, if no domain:
{
  "username": "jacoby149",
  "domain": null,
  "verified": false
}
```

---

## The authenticator UI

A new **Claim Domain** card in the Settings screen
(`ui/src/components/Settings/ClaimDomain.tsx`), following the existing
card pattern (receives `{ I }`, wrapped in `AppShell`):

1. **Input:** the user types their domain (`coolguydavid.com`).
2. **Generate:** the authenticator calls the node to get the TXT record
   value (the node knows the `provider`, the `user`, and its public
   key). The UI displays the value with copy-paste instructions:
   > "Go to your DNS provider (Njalla recommended: njal.la). Add a TXT
   > record with host `web10` and this value:
   > `web10.v=1;provider=...;user=...;key=...`"
3. **Verify:** the user hits "Verify." The authenticator calls
   `POST /v3/domains/verify`. The node does the DNS lookup + format
   validation. Success → "Your domain is claimed." Failure → the
   specific error ("TXT record not found," "key mismatch," etc.).
4. **Status:** if the user already has a verified domain, the card shows
   it with a "Release" button.

The user never sees the key, never manages a wallet, never signs a
transaction. The "crypto" is the TXT record's `key` field, which the
node generates from its existing key material. The user's action is:
**add a TXT record to their DNS, then hit Verify.**

---

## Security considerations

- **The TXT record is public.** Anyone can read it. This is by design —
  it is an identity claim, not a secret. The `key` field is a *public*
  key (Ed25519 public keys are meant to be shared). The *private* key
  stays on the node.
- **Domain squatters.** Someone else can register `coolguydavid.com`
  and add their own TXT record. But they cannot sign a token with the
  real `key` — so the node rejects their token. The TXT record is
  necessary but not sufficient: the key is the real trust anchor.
- **Key rotation.** If the node rotates its signing key, the TXT
  record's `key` field becomes stale. The node operator should update
  the TXT record (or the user should, if they manage their own DNS).
  The `web10.v=1` version tag allows for future format changes (e.g.
  `web10.v=2` with a key-ID field for rotation).
- **One domain per user.** A user can claim one domain. If they want to
  change it, they release the old one and claim the new one. (Multiple
  domains per user is an open question, not a v3 concern.)
- **One user per domain.** A domain can only be claimed by one user. If
  user A claims `coolguydavid.com`, user B cannot claim it (the node
  checks the `users` table for an existing claim on that domain before
  accepting a new one).
- **DNS spoofing.** The node does the DNS lookup server-side (not
  client-side), so a malicious client cannot spoof the TXT record. The
  node queries the real DNS for `web10.<domain>` and validates the
  response.

---

## Relationship to existing decisions

- **D84 (multi-node federation):** the domain is an alias on a single
  node. It does not change the canonical principal format
  (`{provider}/users/{username}`). The domain is a *display* and
  *lookup* layer on top of the principal, not a replacement for it.
- **D7 (JWKS cross-node token verification):** the TXT record's `key`
  field is the node's JWKS public key. The domain claim does not change
  the verification protocol; it adds a domain-bound layer of trust on
  top.
- **D41 (readable by design, data policy not privacy):** the domain TXT
  record is public. This is consistent with D41 — the identity claim is
  not a secret. The *private* key (the node's signing key) is not
  exposed.
- **D60 (node stays generic):** the `domain` column on `users` is
  account-level identity, not an app concept. The test passes: a notes
  app, a music app, or a shop would all want to know "does this user
  have a verified domain?" The domain is the analog of the `phone`
  column — a universal account attribute.
- **Gap 4 in `ads-october/gaps.md` (export/portability):** the domain
  claim is the "301 redirect" mechanism the operator described, at the
  DNS level. When a user moves nodes, they update the TXT record to
  point at the new node. The domain follows the user; the username
  stays the same on the new node (or gets a new username, in which case
  the TXT record's `user` field changes).

---

## Open questions

1. **Multiple domains per user.** Can a user claim more than one domain?
   (e.g. `coolguydavid.com` + `davidcool.dev`.) The current schema
   supports one. Multiple would need a separate `user_domains` table.
2. **Domain expiration.** If the user's domain registration lapses,
   should the node auto-unverify it? (The TXT record would still be
   there, but the domain would no longer resolve.) Probably: the node
   should periodically re-verify claimed domains and unverify ones that
   no longer resolve.
3. **Domain transfer between users.** Can user A transfer their domain
   to user B? (e.g. A studio transferring its domain to a new
   operator.) This would require user A to release the domain and user B
   to claim it. The TXT record would need to be updated by the new
   owner.
4. **Subdomain claims.** Can a user claim `blog.coolguydavid.com`
   instead of the root domain? The current format supports any domain
   (the TXT record is at `web10.<domain>`). Subdomains would work
   without schema changes, but the "one domain per user" rule would
   need to clarify whether subdomains count as separate domains.
5. **Display preference.** Should the domain *replace* the username in
   the UI, or appear *alongside* it? (e.g. `@jacoby149` →
   `coolguydavid.com`, or `@jacoby149 (coolguydavid.com)`.) This is a
   product decision, not a protocol one. The data model supports both.

---

## The one-liner (restated)

**The username is the principal. The domain is an alias. Groups,
tokens, and the read gate key on the username, never the domain. The
domain is stored on the user's account (`users.domain`), claimed via a
DNS TXT record (`web10.v=1;provider=...;user=...;key=...`), verified by
the node, and resolved at display and lookup time. There is no
backfill — the domain is a pointer, not a replacement.**