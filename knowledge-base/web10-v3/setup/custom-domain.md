# Custom Domain for Your web10 Node

**Status: v3 specification, implemented.** This is a guideline for node operators and users
who want to claim a web10 identity on their own domain (e.g.
`coolguydavid.com`) using a DNS TXT record.
This is the operator-facing runbook for the DNS-claim flow; see
`../identity/domain-identity.md` for the specification.

## Why

A custom domain is the operator's **brand surface** and the user's
**portable identity alias**. The domain is the address the world knows;
DNS control publishes a pointer to a specific web10 user on a specific node.
The username remains the principal; groups, tokens, and the read gate never
key on the domain.

This is the same pattern the web already uses for identity claims:
- **DKIM** — TXT record proving "this email is signed by me"
- **SPF** — TXT record listing "these servers are authorized for me"
- **OpenPGPkey** — TXT record for PGP key discovery

web10's version: a TXT record that says "this domain points to
`@username` on `provider`." An authenticated server verify request binds
that pointer to the caller's account.

## The DNS Record

**Type: TXT** (not A, not CNAME). The domain is an identity claim, not a
traffic route. The A record (if any) is a separate concern — it points
the domain at a server for web traffic. The TXT record carries the
web10 identity data.

### Format

```
Type:  TXT
Name:  web10
Value: web10.v=1;provider=api.web10.app;user=jacoby149
TTL:   300
```

| Field | Meaning | Example |
|---|---|---|
| `web10.v` | Version tag. Always `1`. Lets the parser reject unknown formats. | `1` |
| `provider` | The node's API host (the `provider` claim in JWTs). | `api.web10.app` |
| `user` | The web10 username (the `username` claim in JWTs). | `jacoby149` |

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

### How verification binds the account

DNS control allows publication of the pointer; it does not prove control of
the named account. In this flow, the user authenticates normally and
requests `POST /v3/domains/verify`. The node looks up `web10.<domain>` itself
and checks that the record's provider matches the node and its username
matches the authenticated caller. Only then does it store the verified alias.

Lookup discovers identity only. DNS never grants account login, group rights,
or continuity with the previous principal after a domain transfer. Ordinary
authentication, token verification, and authorization remain unchanged.

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

## Step 1 — Get your provider and username

Use your account's known provider host and authenticated username. For
`api.web10.app` and `jacoby149`, the value is
`web10.v=1;provider=api.web10.app;user=jacoby149`.
No signing material or record-generation endpoint is required.

## Step 2 — Add the TXT record

In your DNS provider's control panel, add:

```
Type:  TXT
Name:  web10
Value: web10.v=1;provider=api.web10.app;user=jacoby149
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
   You should see your `web10.v=1;provider=api.web10.app;user=jacoby149`
   string in the response.

2. **Request server verification (once implemented):**
   Sign in normally and submit the domain to `POST /v3/domains/verify`
   using your normal authentication token. The server performs the DNS
   lookup and requires the provider and username to match the node and
   authenticated caller. A local `dig` result alone does not verify the account.

3. **Test lookup (once client resolution is implemented):**
   A client resolves `web10.coolguydavid.com` to discover `provider` and
   `user`. This does not authenticate the client as that user or grant access.

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

## The Authenticator UI

The authenticator (`auth.web10.app`) exposes a **"Claim your
domain"** card in the user settings (the `#domain` deep link opens it). The flow:

1. User enters their domain (`coolguydavid.com`).
2. The authenticator derives the TXT record value from the known provider
   and authenticated username, without a separate generation endpoint:
   `web10.v=1;provider=api.web10.app;user=jacoby149`.
3. The authenticator displays the record with copy-paste
   instructions: "Go to your DNS provider (Njalla recommended), add a
   TXT record with host `web10` and this value."
4. The user hits Verify. The authenticator sends an authenticated request
   to `POST /v3/domains/verify`; the server looks up and validates the record.
5. Only after server success does the authenticator confirm: "Your domain
   is claimed." Otherwise it displays the verification error.

The user's action is: **add a TXT record to their DNS, then hit Verify
while signed in.** No wallet or signing material is required.

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

- **Not an auth protocol change.** Ordinary token verification is unchanged.
  The server verify flow checks an alias pointer against the
  authenticated caller; DNS lookup is discovery, not authentication.
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

- **The TXT record is public.** Anyone can read the provider and username.
  It is an identity pointer, not a secret or a credential.
- **Domain squatters and transfers.** A new controller can replace the
  pointer, but does not inherit the previous account, login, group rights,
  or principal continuity. Verification must match the authenticated caller.
- **DNS trust.** Server-side lookup avoids trusting client-supplied DNS
  results. It is not protection against compromised DNS or a compromised
  resolver. Stored verification is not permanent proof of ownership;
  re-verification and transfer handling remain open in the identity spec.
- **Multiple users on one domain.** The current format supports one
  user per TXT record. If a domain needs to claim multiple users
  (e.g. a studio with multiple creators), that requires a separate design
  decision. This is an open question, not a v3 concern.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dig TXT web10.domain.com` returns nothing | TXT record not added, or wrong host | Check the DNS panel; the host should be `web10`, not `@` or `www` |
| Server returns `wrong_provider` | Provider differs from the verifying node | Use the account's provider host in the TXT record |
| Server returns `wrong_user` | Username differs from the authenticated caller | Sign in to the intended account and use its username |
| DNS changes not propagating | TTL too high, or DNS provider caching | Wait for TTL to expire; use `dig +short web10.domain.com` to verify |
| Server returns `bad_format` | Missing version/provider/user or malformed value | Use the documented semicolon-delimited format with no spaces |

## The one-liner

**Add a TXT record at `web10.yourdomain.com` with the value
`web10.v=1;provider=api.web10.app;user=jacoby149` (using your provider and
username), then request authenticated server verification once implemented.
The domain is an alias, not a principal or a login credential. Buy the
domain on Njalla (njal.la) if you want it to stay up no matter what
you post.**
