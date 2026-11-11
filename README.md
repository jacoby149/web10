# web10

[![npm version](https://img.shields.io/npm/v/web10-npm)](https://www.npmjs.com/package/web10-npm)

<img src="ui/public/logo512.png" alt="web10 logo" height="75" />

web10 starts from one premise: **what you make is yours.**

Every user gets their own database collection. Every record is
`{service, body}`. Apps are stateless frontends that borrow
access through a scoped, expiring token, do their work, and step aside.
The data outlives any app, because the data was never the app's to keep.

On that protocol stands the product: **a platform for creators who refuse
to rent their own audience.** Today a creator with a million subscribers
reaches three hundred thousand — not by accident, but by design. The
platform withholds your reach so it can sell it back to you. web10 removes
the landlord. On your own node, a post reaches 100% of your followers,
delivered to each one's inbox the moment you publish. There is no algorithm
to please, no throttle to buy your way past, no shadow ban to fear. This
is not a promise written in a policy that can be revised. It is the
architecture, and architecture cannot be quietly revoked.

The model is WordPress, applied to social media: open, self-hostable
nodes. Creators run them, under their own name and their own domain, and
keep what they earn. Accounts are free for their audience. web10 takes a
small percentage of the revenue that moves through its payment rails —
paid for value delivered, not for permission granted.

## The premise, made concrete

| | |
| --- | --- |
| **You own your data** | One collection per user — the record of your own life, held by you. Export it, move it, erase it. Delete means delete. |
| **No shadow ban** | Every post reaches every follower, by construction (fan-out on write). Delivery is 100% — and how the reader ranks what they see is the reader's own choice, not the platform's. |
| **Apps write their own queries** | The node ships a read-only query engine: the app's SQL is compiled against the reader's grants, so a new read pattern is a new query, not a new backend. |
| **Built like the best, owned like yours** | web10 uses PostHog for usage analytics and optional content-masked replay/heatmaps to compete on experience. Your content is never tracked, sold, or fed to an ad machine; the trade is stated in the terms (D56/D103). |
| **Apps are just frontends** | An app earns access through a scoped, expiring, revocable token. It never owns what it touches. |
| **Federated identity** | Identity is `(username, provider)`, like email. No central registry to petition, no account that can be taken from you. |
| **Private, not permanent** | Unlike a blockchain, your data can be private, temporary, and deletable. You set who sees it via terms — and delete means delete. |
| **Self-hostable** | One `docker compose up` runs a node on hardware you own. The escape hatch is real, and that is what makes the ownership real. |

## Run a node locally

Requirements: Docker.

```bash
git clone https://github.com/jacoby149/web10
cd web10
docker compose up --build
```

Then open **http://auth.localhost** — the first visit shows the **setup
wizard**: the node's identity, the admin account, the signup gates
(beta code, phone, subscription — all off is an open node), and the
storage wiring. Complete it and you're logged in as the node's admin;
from there, users sign up on your node.

No config archaeology — settings are environment variables, with working
defaults (see `api/app/settings.py` for the full list). The v3 data plane
is **ClickHouse** (all the structured data — one `documents` table) plus
**MinIO** (media blobs, S3-compatible). The compose stack includes:

- **proxy** — routes the `*.localhost` vhosts so the browser experience just works
- **api** — the node itself: data, auth, billing, media, and the query engine (`api.localhost`)
- **ui** — the Authenticator: setup wizard, signup/login, consent, contracts, admin (`auth.localhost`)
- **clickhouse** — the v3 database (schema init from `clickhouse-init/`)
- **minio** — S3-compatible blob storage for media
- **rtc** — WebRTC signaling (`rtc.localhost`)
- **sdk** — serves `wapi.js` and the SDK demos (`sdk.localhost`)

Pointing the node at your own ClickHouse? Set `CLICKHOUSE_HOST` /
`CLICKHOUSE_PORT` / `CLICKHOUSE_DATABASE` / `CLICKHOUSE_USER` /
`CLICKHOUSE_PASSWORD` (or `CLICKHOUSE_SECURE` over TLS). If something
else owns port 80 on your machine, set `WEB10_HTTP_PORT`.

## Deploy to a server

`ubuntu-deployment/` runs a whole node on one Linux box: one
parameterized compose file (`docker-compose.ecosystem.yml`) deployed as
two Portainer stacks — **dev** (LAN/VPN-only; merged work soaks here
under real DNS names) and **prod** (the public node) — with Nginx Proxy
Manager terminating TLS and Cloudflare doing the DNS. The deployment is
idempotent code in `ubuntu-deployment/scripts/`, driven by GitHub
Actions. See [`ubuntu-deployment/README.md`](ubuntu-deployment/README.md).

## What's in this repo

| directory | what it is |
| --- | --- |
| `api/` | FastAPI — the node. All data + auth + billing + media + the query engine. |
| `api/rtc/` | WebRTC signaling server (P2P data channels, e.g. messages). |
| `ui/` | The Authenticator — React: setup wizard, signup/login, consent, contracts, node admin. |
| `sdk/` | `wapi.js` (`web10-npm`), the frontend library web10 apps are built with. |
| `marketing/web10-social/` | The killer app: all-in-one social lens (feed, profiles, DMs, media, video + streaming). |
| `marketing/marketing-ui/` | web10 Inc.'s site: landing, docs, App Store, creator discovery. |
| `marketing/web10-cli/` | CLI tool for web10. |
| `marketing-importing/` | OPS: the headless creator-import pipeline (Instagram → web10) — `web10identify` / `web10import` / `web10accountsync`. Its README is the "how we do it". |
| `clickhouse-init/` | v3 schema initialization for the node's ClickHouse. |
| `media-delivery/` | Protected CDN media delivery — edge-verified media capabilities, off by default. |
| `ubuntu-deployment/` | Server deploy: Portainer + Nginx Proxy Manager + Cloudflare on one box. |
| `e2e/` + `scripts/` | End-to-end test stack and helpers. |
| `knowledge-base/` | The project's brain: the v3 contracts (`web10-v3/`), the strategy (plan, decisions, design standard, manifest), the changelogs, and written security. |
| `ai-pack/` | The portable AI method: how to work with this codebase (use theory, security theory, how to write). |
| `research/` | The paper — "Your Data, Your Rules: Extending the Decentralized Web." (SIGMOD 2027 industry track) — plus the experiment harness. |

The marketing site and social app call the node API directly for reporting
and analytics. There is no separate marketing API service (D91).

## Learn more

- **[`knowledge-base/`](knowledge-base/README.md)** — where to start
  understanding web10: the v3 contracts, the strategy docs, the changelogs,
  and written security, with a suggested reading order.
- **[`strategy/plan.md`](knowledge-base/strategy/plan.md)** — the roadmap
  and the why.
- **[`strategy/decisions.md`](knowledge-base/strategy/decisions.md)** — why
  the big calls were made.
- **[`strategy/manifesto.md`](knowledge-base/strategy/manifesto.md)** — the
  fan-facing pitch that ships on every node.
- **[`changelogs/CHANGELOG.md`](knowledge-base/changelogs/CHANGELOG.md)** —
  what shipped and why, newest first.
- **The paper** — [research strategy and maps](research/README.md) · the
  [working manuscript](research/sixth-draft/main.pdf) · the
  [decentralized-IAM thesis](research/decentralized-iam-thesis.md) that is
  the paper's spine.
- **[`strategy/SECURITY.md`](knowledge-base/strategy/SECURITY.md)** — how to
  report vulnerabilities, and the security invariants (I1–I6) that define
  what a break means.
- **Developer docs** — protocol spec, conventions, schemas:
  `marketing/marketing-ui/public/docs/` (live at [web10.app/docs](https://www.web10.app/docs)).
- **SDK** — `npm install web10-npm` · [npm](https://www.npmjs.com/package/web10-npm) · [docs](https://www.web10.app/docs/sdk)
- **[`AGENTS.md`](AGENTS.md)** — the operating manual for AI agents working
  in this repo.

## Community

- Discord: https://discord.gg/Dbd4VEDznU
- Live node: https://web10.app

## License

The web10 node is licensed under the **Server Side Public License v1 (SSPL-1.0)** — see [`LICENSE`](LICENSE).

SSPL is a strong copyleft license. In plain terms:

- **Run it, self-host it, build on it — free.** You may run an unmodified web10 node, modify it for your own use, and build apps on top of it. No license key, no fee, no cap.
- **The one condition (Section 13):** if you offer a *modified* web10 to others **as a service**, you must release your Service Source Code under the same license. Running your own node — even a big one, even commercially — does not trigger this; you're *running* the software, not *conveying* a modified version.
- **The copyright line in `LICENSE` says "MongoDB, Inc."** on purpose. That line is the copyright in the *license text itself* (SSPL was authored by MongoDB). web10's copyright is asserted on the web10 source code, not on the license document. The SSPL forbids altering the license text, so it is reproduced verbatim.

SSPL is **source-available**, not OSI-approved open source — the same category MongoDB's own server sits in. web10's hosted-node offering is the commercial service; the software stays free to run and extend.

web10 is built for people whose work carries their name. If the idea
earns your respect, star the repo. Better — run a node, and build
something you'd sign.
