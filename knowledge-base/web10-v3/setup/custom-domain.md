# Custom Domain for Your web10 Node

**Status: v3, docs-only.** This is a guideline for node operators who want
to run their web10 node on their own domain (e.g. `www.coolguydavid.com`)
instead of a subdomain of the node's default host (e.g. `node.web10.app`).
No code changes are required — the node already serves its API on whatever
host it's configured with. This doc is the operator-facing runbook.

## Why

A custom domain is the operator's **brand surface**. It's the URL that
appears in:
- The node's public profile / landing page
- Share links and permalinks
- The authenticator's "you're about to authorize X" screen
- Any app that displays the node's identity

For a creator running their own node, the domain **is** the brand.
`coolguydavid.com` is the address their fans know. `node-42.web10.app`
is not.

## Prerequisites

- A domain name registered with any registrar. **Recommended: Njalla
  (njal.la)** — privacy-focused, Costa Rica jurisdiction, does not
  proactively police content, accepts crypto payments. Any registrar
  works; Njalla is the recommended default for the "gives no fucks"
  posture.
- DNS access for that domain (the ability to add A / CNAME records).
- A web10 node that is already running and reachable at its default
  host (e.g. `node.web10.app`).

## Step 1 — Point the domain at the node

Add an **A record** (or CNAME) in your DNS provider's control panel:

```
Type:  A
Name:  @            (or www, or both)
Value: <node's public IP>
TTL:   300
```

If the node is behind a reverse proxy or CDN, point the A record at the
proxy's IP instead. The key requirement: the domain must resolve to a
server that will serve your web10 node's API.

For **Njalla** specifically:
1. Log in at njal.la
2. Go to your domain's DNS management
3. Add the A record as above
4. Njalla's anycast DNS will propagate within minutes

## Step 2 — Configure the node to recognize the domain

The node needs to know that requests arriving on the custom domain are
legitimate. Two things to set:

### 2a. CORS / `cors_service_managers`

The node's `node_config` has a `cors_service_managers` field: the list of
hosts allowed to mint tokens (the authenticators). If your custom domain
will also host the authenticator (the typical case — you want
`auth.coolguydavid.com` to be the login screen), add it:

```
POST /config/update
{
  "cors_service_managers": [
    "auth.coolguydavid.com",
    "auth.web10.app"
  ]
}
```

Keep the default `auth.web10.app` in the list so the stock authenticator
still works (useful for debugging, and for any app that hardcodes it).

### 2b. `provider` identity

The `provider` field in `node_config` is what gets baked into every JWT
the node mints. It's the node's **API identity** — the host that apps use
to address the node.

If you want the custom domain to be the canonical provider identity:

```
POST /config/update
{
  "provider": "coolguydavid.com"
}
```

**Important:** changing `provider` means new tokens will carry
`provider: "coolguydavid.com"`. Any app that has cached a token with the
old provider will need to re-authenticate. This is a **breaking change
for existing sessions** — do it during a low-traffic window, or better,
do it before you have real users.

If you just want the domain to work as an **alias** (the node still
identifies itself as `node.web10.app` in tokens, but also accepts
requests on `coolguydavid.com`), leave `provider` unchanged and just
make sure the reverse proxy / load balancer forwards
`coolguydavid.com` traffic to the node. The node will serve the same API
on both hosts.

## Step 3 — TLS (HTTPS)

The node requires HTTPS for the authenticator flow (the popup-based
token handoff uses `postMessage`, which is blocked on `http://`).

Options:
- **Let's Encrypt** (free) — the standard choice. If your reverse proxy
  is Caddy, Traefik, or Nginx with `certbot`, this is a one-liner.
- **Cloudflare** (free tier) — put the domain on Cloudflare's proxy and
  let them handle TLS. The A record points at Cloudflare; Cloudflare
  proxies to your node's IP. This also gives you DDoS protection and
  caching for free.
- **Njalla's TLS** — Njalla does not provide TLS as a service. You
  handle it yourself (Let's Encrypt or Cloudflare).

**Recommended: Cloudflare.** It's the boring, reliable option. The
domain resolves to Cloudflare's anycast IPs; Cloudflare terminates TLS
and proxies to your node. You get DDoS protection, a global CDN, and
no certificate renewal headaches.

## Step 4 — Verify

1. Open `https://coolguydavid.com` in a browser. You should see the
   node's API response (or the landing page, if you've set one up).
2. Open `https://auth.coolguydavid.com` (if you've configured the
   authenticator on the same domain). You should see the login screen.
3. Log in as a user. The token you receive should have
   `provider: "coolguydavid.com"` (if you changed it in step 2b) or
   `provider: "node.web10.app"` (if you kept the alias setup).
4. Share a post permalink. The URL should use the custom domain.

## Step 5 — (Optional) Subdomain layout

A common layout for a creator node:

```
coolguydavid.com          → the node's landing / public profile
www.coolguydavid.com      → same as above (or the social app)
api.coolguydavid.com      → the node's API (where the SDK points)
auth.coolguydavid.com     → the authenticator (login, consent, node config)
```

The SDK's `API_HOST` should be set to `https://api.coolguydavid.com`.
The authenticator's origin should be `https://auth.coolguydavid.com`.

If you're running the social app (`web10-social`) on the same domain,
it typically lives at the root or at `/social`, and the API is at
`/api` or on a separate subdomain.

## Njalla-specific notes

- **Domain registration:** Njalla registers the domain under their own
  name (you are not the registrant of record). This is the privacy
  feature — no one can look up who owns the domain. You retain full
  control (DNS, transfer, delete) through your Njalla account.
- **DNS management:** Njalla provides anycast DNS. You manage records
  in their control panel. Propagation is fast (anycast).
- **No content scanning:** Njalla does not scan your site's content.
  They will not take down a domain for a political opinion, edgy art,
  or a controversial community. Their only stated suspension trigger is
  content affecting "anyone's health or safety" (malware, CSAM).
- **Payments:** Njalla accepts Bitcoin, Litecoin, Monero, Ethereum, and
  PayPal. No credit card required.
- **Jurisdiction:** Costa Rica. No US extradition for political speech.
  Strong privacy laws. A legal process in Costa Rica is slow enough that
  a takedown order is not instantaneous.
- **Support:** Njalla's support is email-based. Response times are
  reasonable for DNS issues; they're not a 24/7 phone-support company.

## What this is NOT

- **Not a protocol change.** The node's API is the same whether it's
  served on `node.web10.app` or `coolguydavid.com`. The domain is a
  transport-layer concern, not a data-model concern.
- **Not a federation feature.** A custom domain does not make your node
  "federated" with other nodes. Federation (D84) is about cross-node
  token verification and group membership. A custom domain is just
  "my node has its own URL."
- **Not a v4 registry feature.** The v4 identity registry
  (`web10-v4/identity/registry.md`) is a separate, third-party
  name→node resolution service. A custom domain is the operator's own
  DNS; the registry is a public lookup. They complement each other: the
  registry tells the world where `@coolguydavid` is; the custom domain
  is where that node actually lives.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | A record points to wrong IP | Check the node's public IP; update the A record |
| `ERR_CERT_COMMON_NAME_INVALID` | TLS cert doesn't cover the domain | Reissue the cert (Let's Encrypt) or check Cloudflare's TLS settings |
| `403 Forbidden` on API calls | CORS: the authenticator's origin isn't in `cors_service_managers` | Add the origin to the config (step 2a) |
| Token has wrong `provider` | `provider` field not updated, or app cached an old token | Update `provider` (step 2b) + have the user re-auth |
| Social app can't reach API | SDK's `API_HOST` still points at the old domain | Update the app's config to use the new API host |
| DNS changes not propagating | TTL too high, or DNS provider caching | Wait for TTL to expire; use `dig +short coolguydavid.com` to verify |

## The one-liner

**Buy a domain (Njalla recommended), point it at your node's IP, add
the domain to the node's CORS config, set up TLS (Cloudflare
recommended), and update the `provider` field if you want the domain to
be the node's canonical identity. That's it. The node already serves
its API on whatever host it's pointed at.**