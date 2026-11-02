# Custom Domain for Your web10 Node

**Status: v3, docs-only.** This is a guideline for node operators and users
who want to claim a web10 identity on their own domain (e.g.
`coolguydavid.com`) using a DNS TXT record. No code changes are required —
the node already verifies tokens against its configured key. This doc is
the operator-facing runbook for the DNS-claim flow.

## Why

A custom domain is the operator's **brand surface** and the user's
**portable identity anchor**. The domain is the address the world knows;
the TXT record is the cryptographic claim that binds the domain to a
specific web10 user on a specific node.

This is the same pattern the web already uses for identity claims:
- **DKIM** — TXT record proving "this email is signed by me"
- **SPF** — TXT record listing "these servers are authorized for me"
- **OpenPGPkey** — TXT record for PGP key discovery

web10's version: a TXT record that says "this domain belongs to
`@username` on `provider`, and here's the public key that proves it."

## The DNS Record

**Type: TXT** (not A, not CNAME). The domain is an identity claim, not a
traffic route. The A record (if any) is a separate concern — it points
the domain at a server for web traffic. The TXT record carries the
web10 identity data.

### Format

```
Type:  TXT
Name:  web10
Value: web10.v=1;provider=api.web10.app;user=jacoby149;key=<base64-nopad-ed25519-pubkey>
TTL:   300
```

| Field | Meaning | Example |
|---|---|---|
| `web10.v` | Version tag. Always `1`. Lets the parser reject unknown formats. | `1` |
| `provider` | The node's API host (the `provider` claim in JWTs). | `api.web10.app` |
| `user` | The web10 username (the `username` claim in JWTs). | `jacoby149` |
| `key` | Base64 (no padding) Ed25519 public key. The key the node uses to sign tokens for this user. | `dGhpcyBpcyBhIGtleQ==` |

The record is a single string, semicolon-delimited, no spaces. The
`web10.v=1` prefix is the namespace tag — it's what tells a resolver
"this TXT record is a web10 identity claim, not a DKIM record or some
other TXT data."

### Why TXT and not A/CNAME

- **A record** = "this domain resolves to this IP." That's routing.
  The web10 identity is not a routing decision; it's a data claim.
- **CNAME** = "this domain is an alias for that domain." That's
  delegation, not identity.
- **TXT** = "this domain carries this structured data." That's exactly
  what an identity claim is. The domain is the *subject*; the TXT
  record is the *predicate*.

### Why the key is in the record

The key is the trust anchor. When a client wants to verify that
`@jacoby149` on `api.web10.app` is really the person who owns
`coolguydavid.com`, the flow is:

1. Client reads `web10.coolguydavid.com` (TXT) → gets `provider`,
   `user`, `key`.
2. Client asks the node (`provider`) for a token for `user`.
3. Node signs the token with its private key.
4. Client verifies the token's signature against `key` from the TXT
   record.
5. If the signature matches, the domain's claim is verified: the
   person who controls the domain (can set the TXT record) is the
   same person who controls the web10 account (can get the node to
   sign a token with the matching key).

The domain is the *claim*, the TXT record is the *proof*, and the node
is the *enforcement*. Three separate trust anchors, none of which can
forge the others.

## Prerequisites

- A domain name registered with any registrar. **Highly recommended:
  Njalla (njal.la)** — privacy-focused, Costa Rica jurisdiction, does
  not proactively police content, accepts crypto payments. Any
  registrar works (GoDaddy, Namecheap, Porkbun, Cloudflare, etc.);
  Njalla is the recommended default for the "gives no fucks" posture
  and protection from being banned.
- DNS access for that domain (the ability to add TXT records).
- A web10 account on a node (you have a `username` and the node has a
  `provider`).
- The node's Ed25519 public key (the key it uses to sign JWTs). This
  is in the node's `node_config` (`private_key` field's corresponding
  public key). Ask the node operator, or read it from the node's
  JWKS endpoint if one is configured.

## Step 1 — Get your public key

The `key` field in the TXT record is the **Ed25519 public key** the
node uses to sign your tokens. This is NOT your personal key — it's
the node's key, scoped to your user.

How to get it:
- **From the node operator:** ask them for the public key. It's the
  counterpart to the `private_key` in `node_config`.
- **From the JWKS endpoint** (if the node has one configured, per D7):
  `GET https://api.web10.app/.well-known/jwks.json` → the `n` (modulus)
  and `e` (exponent) fields, or the `x` field for Ed25519.
- **From your token:** decode your JWT (it's base64, no signature
  needed to read the header). The `kid` (key ID) in the header tells
  you which key signed it. The node operator can give you the
  corresponding public key.

The key must be **base64-encoded, no padding** (the `=` characters at
the end are stripped). This is the standard for DNS TXT records (which
have a 255-character limit per string, and base64-with-padding can
exceed it).

## Step 2 — Add the TXT record

In your DNS provider's control panel, add:

```
Type:  TXT
Name:  web10
Value: web10.v=1;provider=api.web10.app;user=jacoby149;key=<YOUR_BASE64_KEY>
TTL:   300
```

The `Name` is `web10` — this creates the record at
`web10.yourdomain.com`. The `web10.` prefix is the namespace: it's
what tells a resolver "this is a web10 identity record, not a DKIM
record or an SPF record."

**For Njalla:**
1. Log in at njal.la
2. Go to your domain's DNS management
3. Add the TXT record as above
4. Njalla's anycast DNS will propagate within minutes

**For GoDaddy / Namecheap / Porkbun / Cloudflare:**
Same idea — find the DNS management panel, add a TXT record with
host `web10` and the value string. Every registrar supports TXT
records; the UI varies but the data is the same.

## Step 3 — (Optional) Point the domain at your node

If you also want the domain to serve web traffic (the node's landing
page, the social app, the authenticator), add an **A record** or
**CNAME** separately:

```
Type:  A
Name:  @
Value: <node's public IP>
TTL:   300
```

Or, if using Cloudflare:
```
Type:  A (proxied)
Name:  @
Value: <node's public IP>
```

The A record is for **traffic routing** (pointing the domain at a
server). The TXT record is for **identity** (claiming the domain
belongs to a web10 user). They are independent: you can have the TXT
record without the A record (identity-only, no web traffic), or the A
record without the TXT record (web traffic, no web10 identity claim).

## Step 4 — Verify

1. **Check the TXT record is live:**
   ```
   dig TXT web10.coolguydavid.com
   ```
   You should see your `web10.v=1;provider=...;user=...;key=...`
   string in the response.

2. **Verify the key matches:**
   The `key` in the TXT record should be the same key the node uses to
   sign your tokens. If you have a token, decode it and check that the
   signature verifies against the TXT record's key.

3. **Test the full flow** (once the SDK/client supports DNS-claim
   resolution):
   - A client resolves `web10.coolguydavid.com` → gets `provider`,
     `user`, `key`.
   - The client authenticates with the node (`provider`) as `user`.
   - The node returns a token signed with its key.
   - The client verifies the token against the TXT record's `key`.
   - Match → the domain's identity claim is verified.

## Step 5 — (Optional) Subdomain layout

A common layout for a creator node:

```
coolguydavid.com              → landing page / public profile
web10.coolguydavid.com        → TXT record (the web10 identity claim)
www.coolguydavid.com          → same as root (or the social app)
api.coolguydavid.com          → the node's API (where the SDK points)
auth.coolguydavid.com         → the authenticator (login, consent, node config)
```

The SDK's `API_HOST` should be set to `https://api.coolguydavid.com`.
The authenticator's origin should be `https://auth.coolguydavid.com`.
The identity claim lives at `web10.coolguydavid.com` (TXT).

## The Authenticator UI (planned)

The authenticator (`auth.web10.app`) will expose a **"Claim your
domain"** surface in the user settings. The flow:

1. User enters their domain (`coolguydavid.com`).
2. The authenticator looks up the node's public key for the user's
   account (from the node's JWKS or config).
3. The authenticator generates the TXT record value:
   `web10.v=1;provider=<node>;user=<username>;key=<pubkey>`.
4. The authenticator displays the record with copy-paste
   instructions: "Go to your DNS provider (Njalla recommended), add a
   TXT record with host `web10` and this value."
5. The authenticator polls `dig TXT web10.<domain>` until the record
   appears (propagation check).
6. Once the record is live, the authenticator confirms: "Your domain
   is claimed. `@jacoby149` is now verifiably bound to
   `coolguydavid.com`."

The user never sees the key, never manages a wallet, never signs a
transaction. The "crypto" is the TXT record's `key` field, which the
authenticator generates from the node's existing key material. The
user's action is: **add a TXT record to their DNS.** That's it.

## Njalla-specific notes

- **Why Njalla:** privacy-focused registrar, Costa Rica jurisdiction,
  does not proactively police content. If your web10 content is
  controversial (political, edgy, niche), Njalla is the registrar that
  will not take down your domain for a political opinion. Their only
  stated suspension trigger is content affecting "anyone's health or
  safety" (malware, CSAM).
- **Domain registration:** Njalla registers the domain under their own
  name (you are not the registrant of record). This is the privacy
  feature — no one can look up who owns the domain. You retain full
  control (DNS, transfer, delete) through your Njalla account.
- **DNS management:** Njalla provides anycast DNS. You manage records
  in their control panel. Propagation is fast (anycast). TXT records
  are supported.
- **Payments:** Njalla accepts Bitcoin, Litecoin, Monero, Ethereum,
  and PayPal. No credit card required.
- **Jurisdiction:** Costa Rica. No US extradition for political
  speech. Strong privacy laws. A legal process in Costa Rica is slow
  enough that a takedown order is not instantaneous.
- **Signup:** https://njal.la/signup/
- **Support:** Njalla's support is email-based. Response times are
  reasonable for DNS issues; they're not a 24/7 phone-support company.

## What this is NOT

- **Not a protocol change.** The node's token verification is
  unchanged. The TXT record is a *client-side* verification aid: the
  client reads the TXT record to learn which key to verify against.
  The node still verifies tokens with its own key. The TXT record
  adds a *domain-bound* layer of trust on top.
- **Not a v4 registry feature.** The v4 identity registry
  (`web10-v4/identity/registry.md`) is a separate, third-party
  name→node resolution service. The TXT record is the *operator's own*
  DNS claim; the registry is a *public* lookup. They complement each
  other: the TXT record says "this domain belongs to this user on this
  node"; the registry says "this user is currently on this node." The
  TXT record is per-domain; the registry is per-user.
- **Not a replacement for the node's auth.** The user still
  authenticates to the node with their normal credentials (password,
  phone, etc.). The TXT record is not an SSO provider; it's an
  identity *claim* that the domain makes, verifiable by any third
  party.

## Security considerations

- **The TXT record is public.** Anyone can read it. This is by design —
  it's an identity claim, not a secret. The `key` field is a *public*
  key (Ed25519 public keys are meant to be shared). The *private* key
  stays on the node.
- **Domain squatters.** Someone else can register `coolguydavid.com`
  and add their own TXT record. But they can't sign a token with the
  real `key` — so the node rejects their token. The TXT record is
  necessary but not sufficient: the key is the real trust anchor.
- **Key rotation.** If the node rotates its signing key, the TXT
  record's `key` field becomes stale. The node operator should update
  the TXT record (or the user should, if they manage their own DNS).
  The `web10.v=1` version tag allows for future format changes (e.g.
  `web10.v=2` with a key-ID field for rotation).
- **Multiple users on one domain.** The current format supports one
  user per TXT record. If a domain needs to claim multiple users
  (e.g. a studio with multiple creators), the format would need to
  extend to `web10.v=2;users=jacoby149:KEY1,sarah:KEY2`. This is an
  open question, not a v3 concern.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dig TXT web10.domain.com` returns nothing | TXT record not added, or wrong host | Check the DNS panel; the host should be `web10`, not `@` or `www` |
| TXT record visible but key doesn't match | Wrong key in the record | Get the correct public key from the node operator; update the TXT record |
| Token verification fails | Key in TXT record ≠ key node used to sign | The node rotated its key. Update the TXT record with the new public key |
| DNS changes not propagating | TTL too high, or DNS provider caching | Wait for TTL to expire; use `dig +short web10.domain.com` to verify |
| TXT record too long (>255 chars) | Key is too long, or value has spaces | Base64-encode the key with no padding; ensure no spaces in the value string |

## The one-liner

**Add a TXT record at `web10.yourdomain.com` with the value
`web10.v=1;provider=<node>;user=<username>;key=<pubkey>`. That's the
claim. The node's key is the proof. The domain is the address. Buy the
domain on Njalla (njal.la) if you want it to stay up no matter what
you post.**