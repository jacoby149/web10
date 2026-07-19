# web10

<img src="ui/public/logo512.png" alt="web10 logo" height="75" />

web10 is a system for users to **own their data** on the internet.

Every user gets their own database collection. Every record is
`{service, body}`. Apps are stateless frontends — *lenses* — that hold a
scoped, expiring token and talk to the user's collection over a tiny CRUD
API. The data outlives any app.

The product built on top of it is a **platform for creators**: run your own
node, own your audience, and reach 100% of your followers by architecture —
posts are delivered to every follower's inbox (fan-out on write), so there is
no algorithm to throttle you and no shadow ban to fear. It's not a policy
promise; it's how the system is built.

**Think: WordPress for social media.** Open, self-hostable nodes; creators
run them and monetize; user accounts are free; web10 takes a small % of
revenue through its payment rails.

## Why it's different

| | |
| --- | --- |
| **You own your data** | One collection per user. Export it, delete it, take it to another node. Delete means delete. |
| **No shadow ban** | The inbox pattern delivers every post to every follower. Chronological feed, no ranking algorithm. |
| **Apps are lenses** | Any app can read/write your data — with your permission, under a scoped, expiring, revocable token. |
| **Federated identity** | Identity is `(username, provider)`, like email. Nodes verify each other's tokens. |
| **Private, not permanent** | Unlike blockchain: your data can be private, temporary, and deletable. E2E encryption (phone-as-keychain) is in progress. |
| **Self-hostable** | One `docker compose up` runs a whole node on your own hardware or any cloud. |

## Run a node locally

Requirements: Docker.

```bash
git clone <your fork of this repo>
cd web10
docker compose up --build
```

Then open **http://auth.localhost** to sign up on your local node.

That's it — no config files to copy. Settings are environment variables
(see `api/app/settings.py` for the full list and defaults). The compose
stack includes:

- **api** — the node itself: data, auth, billing, media (`api.localhost`)
- **ui** — signup/login, consent, contracts, admin (`auth.localhost`)
- **ferretdb + postgres** — the default open database backend
  (FerretDB speaks the MongoDB wire protocol on top of DocumentDB/postgres)
- **minio** — S3-compatible blob storage for media
- **rtc** — WebRTC signaling (`rtc.localhost`)
- **sdk** — serves `wapi.js` and demos (`sdk.localhost`)

Prefer real MongoDB? It's a supported backend:

```bash
DB_URL=mongodb://mongo:27017 docker compose --profile mongo up
```

Atlas or any external Mongo works the same way — just set `DB_URL`. If
something else owns port 80 on your machine, set `WEB10_HTTP_PORT`.

## Deploy to a server

`ubuntu-deployment/` has a one-shot deploy script for a fresh Ubuntu VM:
Docker, Caddy with automatic TLS, and the full node stack. Point your DNS
at the box and certs provision themselves. See
[`ubuntu-deployment/README.md`](ubuntu-deployment/README.md).

## What's in this repo

| directory | what it is |
| --- | --- |
| `api/` | FastAPI — the node. All data + auth + billing + media. |
| `api/rtc/` | WebRTC signaling server. |
| `ui/` | React admin/consent UI (signup, login, contracts, settings). |
| `sdk/` | `wapi.js`, the frontend library web10 apps are built with. |
| `marketing/web10-social/` | The killer app: all-in-one social lens (feed, profiles, DMs, media). CRM and Mail live here as sub-apps. |
| `marketing/marketing-ui/` | web10 Inc.'s site: landing page, docs, App Store, Exporter UI. |
| `marketing/marketing-api/` | Backend for the marketing site: ZIP import pipeline (bring your Instagram/Facebook/YouTube data), analytics. |
| `marketing/web10-cli/` | CLI tool for web10. |
| `mobile/encryptor/` | Expo app — the seed of the phone-as-keychain (E2E encryption). |
| `ubuntu-deployment/` | One-shot server deploy (Docker + Caddy + TLS). |

## Learn more

- **[`plan.txt`](plan.txt)** — the roadmap and the why.
- **[`GLOSSARY.md`](GLOSSARY.md)** — the vocabulary (node, provider, service, lens, token…).
- **[`decisions.md`](decisions.md)** — why the big calls were made.
- **[`manifesto.md`](manifesto.md)** — the fan-facing pitch that ships on every node.
- **Developer docs** — protocol spec, conventions, schemas: `marketing/marketing-ui/public/docs/`.
- **[`SECURITY.md`](SECURITY.md)** — how to report vulnerabilities, and the security invariants (I1–I5) that define what a break means.

## Community

- Discord: https://discord.gg/Dbd4VEDznU
- Live node: https://web10.app

Have fun with web10, use it responsibly, and please give the repo a star.
