# Start a Node

**Who this is for:** you — a node operator. This gets a web10 node running:
locally in two minutes, or on a server for real users.

## What a node is

A node is the whole platform: the database, the API, the authenticator
(sign-in + data controls), the media storage, and the social app. One
Docker Compose stack. The reference implementation is one valid node — not
the only one, but the one to start from.

The v3 data plane is **ClickHouse** (all the structured data) +
**MinIO** (media blobs, S3-compatible). Everything else is a container
around those two.

## Local: two minutes

```bash
git clone https://github.com/jacoby149/web10
cd web10
docker compose up --build
```

Then open **`http://auth.localhost`** — the first visit shows the
**setup wizard** (see [Node Config](/docs/node-config) for what it does).
Complete it, and you're logged in as the node's admin.

What's running:

| Service | Where | What it is |
|---|---|---|
| Authenticator (UI) | `http://auth.localhost` | Sign-in, signup, the setup wizard, your data controls |
| API | `http://api.localhost` | All the data + auth + media |
| RTC signaling | `http://rtc.localhost` | WebRTC P2P (messages, calls) |
| SDK CDN | `http://sdk.localhost` | `wapi.js` + the SDK demos |
| ClickHouse | `localhost:8123` | The v3 database (data + schema init) |
| MinIO | `localhost:9000` (console `:9001`) | Media storage (S3) |
| vhost proxy | `localhost:80` | Routes the `*.localhost` names so it just works |

(The compose also spins up a couple of v2-legacy database services —
postgres/FerretDB — that are being retired; the v3 node doesn't need them.)

**That's the node.** `docker compose down` stops it; your data lives in
Docker volumes and survives restarts.

## The setup flow

First boot, the authenticator walks you through:

1. **Node Identity** — the node's provider domain (what goes into tokens;
   `api.localhost` locally, your API host in production).
2. **Admin Account** — the username + password for the node's admin.
3. **Access Policy** — the signup gates: require a beta code, require a
   phone number, require a subscription. All off = an open node.
4. **Storage** — the S3/MinIO wiring (pre-filled in the compose stack).
5. **Complete** — you're logged in as admin.

After that, the wizard only shows for admins, and only on a node with no
users yet. A node with any user is "already in use."

## Pointing at your own domain

Locally, the `*.localhost` vhosts are the whole story. For a real node,
three things carry your domain:

- **`PROVIDER`** — the API's identity (e.g. `api.web10.app`). It's baked
  into every token the node mints, and group ids are derived from it, so
  set it to your API host and don't change it later.
- **The vhosts** — your API, authenticator, RTC, and media hosts
  (`api.web10.app`, `auth.web10.app`, …).
- **`CORS_SERVICE_MANAGERS`** — the hosts allowed to mint tokens
  (your authenticator hosts). Every browser origin that calls the API
  needs to be in the API's CORS allow-list.

The frontends bake their backend origins at **build time** — changing an
origin means rebuilding the stack, not just restarting it.

## Production: the fleet

A public node is a **lean multi-container fleet** on one box — not one
container, and not a pile of hand-started processes. The deployment lives
in `ubuntu-deployment/`: **one parameterized compose file**
(`docker-compose.ecosystem.yml`) deployed as two environments (dev +
prod), managed in **Portainer**, with **Nginx Proxy Manager** terminating
TLS and **Cloudflare** doing DNS.

The stack: ClickHouse + MinIO + API + authenticator + RTC + the social app
+ the marketing site. Per environment:

| | dev | prod |
|---|---|---|
| Vhosts | `*.dev.{zone}` | `{zone}` real names |
| Reachable from | **VPN/LAN only** | the internet |
| Purpose | merged work soaks here | production |

The dev environment is the safety net: its DNS names resolve publicly but
point at the box's LAN IP, so off-VPN they route nowhere. Real domain
names, zero exposure.

**The security model is "public app, private admin"** — the same split
WordPress hosting uses:

- **Public:** the API, authenticator, social app, media — TLS'd, on your
  domain. This is the product; it's supposed to be reachable.
- **Private:** Portainer, the proxy admin, the MinIO console — **no DNS
  record, no proxy host, no port-forward.** Only 80/443 leave the box, so
  the admin ports are simply unreachable from the internet. You reach them
  from the LAN/VPN, or over an SSH tunnel.

**First deployment, in short:**

1. Box prep: `sudo bash prep-vm.sh` (Docker + Portainer + the shared proxy
   network). Router: forward **only 80 and 443**.
2. Portainer → deploy the `edge` stack (the proxy itself) → set up its TLS
   provider (Cloudflare token).
3. Portainer → one stack per environment: paste
   `docker-compose.ecosystem.yml`, paste **all** the env vars from
   `env.{env}.example` (a missing var fails the deploy loudly instead of
   baking a wrong origin into a frontend).
4. Proxy hosts: one per service in the URL map; Force HTTPS + Let's
   Encrypt (dev vhosts use the DNS challenge — they're unreachable from
   the internet by design).
5. Cloudflare DNS: A records, **DNS only** (proxy off — WebRTC and auth
   need direct connections).
6. Smoke test: open `https://auth.{env}.{zone}`, run the setup wizard,
   sign up → post → read.

The full field manual — the URL map, the promotion flow (dev → prod),
redeploys, troubleshooting, secrets handling — is
`ubuntu-deployment/README.md` in the repo. That file is the source of
truth for box ops; this page is the shape of it.

## What you are, after this

You run a node: you hold the admin account, you set the access policy
(open, beta-gated, phone-required), you approve the apps that show up in
your [app store](/docs/app-store), and you're liable for the data you host
(the node is readable by design — that's the trade). Your users' data is
theirs, not yours: they can export it, revoke every app, and take it to
another node. That's the whole operating posture.

Next: [Node Config](/docs/node-config) — what the admin can actually
touch.
