# ubuntu-deployment — running web10 on the box

One Linux box, two Portainer stacks from ONE compose file
(`docker-compose.ecosystem.yml`), each carrying the whole ecosystem:
node (api, ui, rtc, minio, db) + web10-social + marketing-ui +
marketing-api. Nginx Proxy Manager (itself a Portainer stack)
terminates TLS; Cloudflare does DNS. Everything is visible and
manageable in the Portainer UI from the LAN/VPN.

**Agents doing ops work on the box: `AGENT-OPS.md` is your file.**
Read it fully before your first SSH — connection procedure, diagnosis
sequence, current known breakage, and the rules. Log every session in
`OPS-LOG.md`.

## Files

| File | Purpose |
|------|---------|
| `AGENT-OPS.md` | Field manual for agents operating the box (SSH, diagnose, redeploy, guardrails) |
| `OPS-LOG.md` | Append-only ledger of box changes — read before ops, write after |
| `prep-vm.sh` | One-shot box prep: Docker + Portainer + shared `proxy` network |
| `scripts/` | The deployment as idempotent code — DNS, stacks, NPM cert+routes, smoke test (read secrets from `.env`, commit nothing sensitive). See `scripts/README.md` |
| `docker-compose.edge.yml` | The `edge` stack: NPM itself as a Portainer stack — proxy mappings in the `npm-data` volume, visible/editable in the NPM UI |
| `docker-compose.ecosystem.yml` | THE stack file — one parameterized compose, deployed as two Portainer stacks (dev / prod) |
| `env.dev.example` / `env.prod.example` | Per-stack env vars to paste into Portainer (one file per environment) |
| `.env.example` | Template for the box secrets. The real file lives at `~/web10-ops/.env` ON the box (outside the repo — survives re-clones); `ubuntu-deployment/.env` is a symlink to it. See §Secrets |
| `DEPLOYMENT-PLAN.md` | Architecture rationale (why Portainer + NPM + Cloudflare) |

## The two environments

| Stack | Vhosts | DNS points at | Reachable from | Purpose |
|-------|--------|---------------|----------------|---------|
| `web10-dev` | `*.dev.{zone}` | **INTERNAL LAN IP** | **VPN/LAN only** | merged work soaks here |
| `web10-prod` | `{zone}` real names | PUBLIC IP | internet | production |

The dev trick: its DNS records resolve publicly but point at the
box's LAN IP, so off-VPN they route nowhere. Zero port-forwards for
dev, no exposure, and still real domain names — so TLS, CORS, and
vhost routing behave exactly like prod. Dev TLS certs MUST use the
**DNS-01** challenge (HTTP-01 can't reach a VPN-only vhost; DNS-01
needs no inbound traffic — NPM does it with the Cloudflare API token).

(A third public `web10-staging` env existed briefly — deliberately
cut, 19.07.2026: dev + prod covers the need on one lean box. If you
ever need a public preview of unreleased work, that's the moment to
resurrect it from this same compose. The legacy staging stack +
`*.staging` DNS records get decommissioned once dev + prod are live —
see AGENT-OPS.md §4.)

Env vars per stack live in `env.dev.example` / `env.prod.example` —
paste ALL of them into the Portainer stack. Every one is required; a
missing var fails the deploy loudly instead of silently baking wrong
origins into a frontend bundle.

## URL map — what to visit, per environment

NPM forwards by the **stack-prefixed alias** on the `proxy` network
(never the bare service name — with multiple stacks up, bare names
resolve ambiguously across environments). Zone `web10.app`:

| Service | NPM forward target | dev (VPN-only) | prod |
|---------|-------------------|----------------|------|
| API | `{stack}-api:80` | `api.dev.web10.app` | `api.web10.app` |
| UI (auth/consent) | `{stack}-ui:80` | `auth.dev.web10.app` | `auth.web10.app` |
| RTC signaling | `{stack}-rtc:80` | `rtc.dev.web10.app` | `rtc.web10.app` |
| Minio S3 API | `{stack}-minio:9000` | `minio.dev.web10.app` | `minio.web10.app` |
| web10-social | `{stack}-social:80` | `social.dev.web10.app` | `social.web10.app` |
| marketing-ui | `{stack}-marketing-ui:80` | `www.dev.web10.app` + `dev.web10.app` | `www.web10.app` + `web10.app` |
| marketing-api | `{stack}-marketing-api:80` | `marketing-api.dev.web10.app` | `marketing-api.web10.app` |

Quick health check: `https://{api-vhost}/docs` should return the
FastAPI docs page.

⚠ `minio` forwards to **9000** (S3 API, needed for media URLs) —
never 9001 (admin console).

Admin panels — LAN/VPN only, in EVERY environment. No DNS records, no
NPM proxy hosts, no router port-forward (only 80/443 are forwarded).
See "Security model" below.

| Panel | Access (from LAN/VPN) | Remote without VPN |
|-------|----------------------|--------------------|
| Portainer | `http://{vm-lan-ip}:9000` | `ssh -L 9000:localhost:9000 {ssh-user}@{vm-ip}` |
| Nginx Proxy Mgr | `http://{vm-lan-ip}:81` | `ssh -L 81:localhost:81 {ssh-user}@{vm-ip}` |
| Minio console | `http://{vm-lan-ip}:9001` | `ssh -L 9001:localhost:9001 {ssh-user}@{vm-ip}` |

## First deployment (box prep)

```bash
# 0. Locally: copy .env.example → .env, fill in CF token / zone /
#    IPs / SSH user.

# 1. On the box (Ubuntu, 4+ CPU / 8+ GB / 64+ GB):
sudo bash prep-vm.sh     # Docker + Portainer + "proxy" network

# 2. Router/firewall: forward ONLY 80 and 443 to the box.
```

### Portainer + stacks (all from the Portainer UI, LAN/VPN)

1. **Portainer**: `http://{vm-lan-ip}:9000` — create admin account
2. **The `edge` stack (NPM itself)**: Stacks → Add stack → name it
   `edge` → paste `docker-compose.edge.yml` → deploy. The proxy runs
   as a Portainer stack on purpose: every mapping is inspectable in
   the NPM UI, and all reverse-proxy config persists in the
   `npm-data` volume (certs in `npm-letsencrypt`) — redeploys and
   reboots keep the routing.
3. **NPM**: `http://{vm-lan-ip}:81` — first login
   `admin@example.com` / `changeme`, change both immediately. Then
   Settings → SSL → Providers → Add
   - Provider: `cloudflare`
   - API Token: (Cloudflare API token with DNS edit scope for your zone)
4. **Portainer stack, one per environment**: Stacks → Add stack →
   name it `web10-dev` / `web10-prod`
   - Web composer → paste `docker-compose.ecosystem.yml`
   - Env vars: ALL values from the matching `env.{env}.example`
     (`STACK` must equal the stack name; `MINIO_PASSWORD` fresh per
     env — the S3 API is exposed)
   - Deploy
5. **NPM proxy hosts** (Proxy Hosts → Add): one per row of the URL
   map above, forward target = the stack-prefixed alias.
   - SSL tab: Force HTTPS + Let's Encrypt
   - Prod vhosts: HTTP-01 works (port 80 is forwarded)
   - **Dev vhosts: use the DNS challenge (Cloudflare token)** —
     HTTP-01 will fail, the vhost is unreachable from the internet
6. **Cloudflare DNS** — see below
7. **Smoke test** — see below

### Cloudflare DNS records

All records are **DNS only** (proxy off — WebRTC and auth need direct
connections; the CDN is not useful for backend services).

```bash
export CF_API_TOKEN="your-token"   # from ubuntu-deployment/.env
ZONE="your-zone"
PUBLIC_IP="the box's public IP"    # VM_PUBLIC_IP in .env
LAN_IP="the box's LAN IP"          # VM_IP in .env — dev records only

# dev (VPN-only) — content = LAN IP, useless off-VPN by design:
for host in dev auth.dev rtc.dev minio.dev social.dev www.dev \
            marketing-api.dev; do
  cloudflare dns record create "$ZONE" --type A --name "$host.$ZONE" \
    --content "$LAN_IP" --proxied=false
done

# prod (public) — content = PUBLIC IP:
for host in api auth rtc minio social www marketing-api; do
  cloudflare dns record create "$ZONE" --type A --name "$host.$ZONE" \
    --content "$PUBLIC_IP" --proxied=false
done
cloudflare dns record create "$ZONE" --type A --name "$ZONE" \
  --content "$PUBLIC_IP" --proxied=false   # the apex → marketing

# decommission (once dev+prod are live): DELETE the legacy records
# staging / auth.staging / rtc.staging / minio.staging.
```

⚠ **Prod cutover caution**: `api.web10.app` / `auth.web10.app` are the
origins hardcoded in historical app builds and may already point at an
older deployment. `dig` each name and confirm with the operator before
moving prod DNS — this is a cutover, not a create.

## Promotion flow (dev → prod)

Keep it manual-button simple until E4 (automated provisioning):

1. **Merge to `dev` branch** → redeploy the `web10-dev` stack
   (Portainer → Stacks → web10-dev → *Pull and redeploy* with rebuild).
   Work soaks here; run the smoke test + e2e against `*.dev.{zone}`.
2. **Soak passes** → tag/release on `main` → redeploy `web10-prod`
   the same way, from the release ref.
3. Any env var change (origins, CORS): edit the stack env vars AND
   force a **rebuild** — frontends bake origins at build time; a
   restart is not enough.
4. Log every promotion in `OPS-LOG.md`.

The one thing VPN-only dev can't prove is public-internet behavior
(TLS issuance, off-network loads) — you get that check for free the
moment prod deploys; there's no separate staging env.

## Redeploy (update code)

In Portainer UI:
1. Stacks → `web10-{env}` → Actions → Update stack
2. Update the compose YAML if it changed (paste new version of
   `docker-compose.ecosystem.yml`)
3. Or simply: Actions → Redeploy → pull latest + rebuild

Or via SSH:
```bash
ssh {ssh-user}@{vm-ip}
cd /opt/web10 && git pull
docker compose -p web10-dev --env-file env.dev \
  -f ubuntu-deployment/docker-compose.ecosystem.yml up -d --build
```

After ANY redeploy: run the smoke test (below) against that env.

## Where things live

| Location | Contents |
|----------|----------|
| Docker volume `{stack}_postgres-data` | FerretDB/DocumentDB data (one per stack) |
| Docker volume `{stack}_minio-data` | Media blobs (one per stack) |
| Docker volume `edge_npm-data` | ALL reverse-proxy config (NPM proxy hosts + its db) |
| Docker volume `edge_npm-letsencrypt` | Let's Encrypt certificates |
| Docker volume `portainer-data` | Portainer database |

Portainer prefixes volume names with the stack name — the three
environments never share data volumes.

```bash
docker volume ls
docker volume inspect web10-dev_postgres-data
```

## Wipe + reseed (fresh start)

⚠️ This destroys all user data on the TARGET ENV ONLY — triple-check
the stack name. Routine for dev (paired with the C6 persona seed
script), never casually for prod.

```bash
ssh {ssh-user}@{vm-ip}

# Stop and remove the stack (Portainer: Stacks → select → Stop/Remove)
# Remove THAT STACK'S data volumes — the prefix is the safety check:
docker volume rm web10-dev_postgres-data web10-dev_minio-data

# Redeploy the stack in Portainer, then (dev) run the e2e persona
# seed script to repopulate fixtures.
```

## Signup → login → post (smoke test)

Run against the env you touched:

1. Open `https://auth.{env}.{zone}` (e.g. `auth.dev.web10.app`)
2. First boot: setup wizard auto-redirects. Complete:
   - Node identity (name, tagline)
   - Admin account (username + password)
   - Access policy (open — no phone/beta required)
3. After setup, logged in as admin
4. Test CRUD via API:

```bash
# Login to get a token (route is POST /web10token, not /login)
curl -X POST "https://{api-vhost}/web10token" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password", "provider": "{api-vhost}"}'

# Create a record
curl -X PATCH "https://{api-vhost}/{username}/posts" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"body": {"text": "Hello!", "ts": "2026-07-19T00:00:00Z"}}'

# Read it back
curl "https://{api-vhost}/{username}/posts" \
  -H "Authorization: Bearer <token>"
```

5. Whole-ecosystem check: `https://social.{env}.{zone}` and
   `https://www.{env}.{zone}` load, and the social app can log in
   against this env's auth (once the origin-parameterized builds from
   lanes B/D are merged — see AGENT-OPS.md §4 known issues).

## Troubleshooting

### Containers not starting

Portainer → Stacks → `web10-{env}` → Logs tab. Or SSH:
```bash
docker ps --filter "name=web10"
docker logs {container-name} --tail 50
```

Common issues: a required stack env var missing (the deploy error
names it — compare against `env.{env}.example`), or FerretDB not
ready before the API on first boot — wait a few seconds and restart
the API container.

### NPM proxy not working

1. Check NPM → Proxy Hosts → is the host active (green dot)?
2. Forward host must be the **stack-prefixed alias**
   (`web10-dev-api`, `web10-prod-ui`, …) — a bare name (`api`) is
   ambiguous with several stacks on the proxy network and will route
   cross-env.
3. Container must be on the `proxy` network (edge services are, by
   default, in the stack; postgres/ferretdb are intentionally NOT)
4. Test direct container access:
   ```bash
   docker run --rm --network proxy curlimages/curl -sS \
     -o /dev/null -w '%{http_code}\n' http://web10-dev-api:80/docs
   ```

### Let's Encrypt failing

1. Public vhosts: DNS must resolve to the box's public IP first;
   HTTP-01 needs port 80 (it's forwarded).
2. **Dev vhosts: must use the DNS challenge** — HTTP-01 cannot reach
   a VPN-only vhost, ever. NPM → SSL → the cert request has a
   "Use a DNS challenge" toggle → Cloudflare + API token.
3. NPM logs: `docker logs {npm-container}`

### CORS errors from UI

The API's CORS allow-list comes from `CORS_SERVICE_MANAGERS`
(comma-separated hostnames, set per stack — see `env.{env}.example`).
It must contain every browser origin that calls the API: the auth UI,
social, and the marketing site hosts for that env.

```bash
# Check what the running API resolved
docker exec -it {api-container} uv run python -c \
  "from app import settings; print(settings.CORS_SERVICE_MANAGERS)"
```

If wrong: edit the stack env var in Portainer and redeploy (restart
is enough for the API — CORS is runtime, not baked).

### Minio presigned URLs not working

The API generates presigned URLs using `S3_ENDPOINT` =
`http://{stack}-minio:9000` (internal). For browser access, the minio
container also carries the public hostname (`MINIO_HOST`) as a
network alias. If uploads fail, check the alias matches the env's
`minio.` vhost and the NPM proxy host forwards to `{stack}-minio:9000`.

### TLS cert renewal

NPM handles this automatically. Certs renew 30 days before expiry.
Check: NPM → SSL Certificates → Expiry column. DNS-01 certs (dev)
renew without inbound traffic — nothing extra needed.

## Security model: public app, private admin

This copies how WordPress hosting actually works. WordPress has two
admin layers and treats them differently:

- **`wp-admin`** — the *application's* admin. It lives on the public
  domain behind the app's own login. Everyone can reach the URL; the
  app's auth is the boundary. Our equivalent is `auth.{env}.{zone}`
  (the web10 node UI). It's public, TLS'd, and guarded by web10's own
  auth — that's the product, it's supposed to be reachable.
- **cPanel / the hosting control panel** — the *infrastructure* admin.
  No serious host hangs this off your public site domain; it's a
  separate, restricted surface. Our equivalents are **Portainer
  (:9000)**, the **NPM admin UI (:81)**, and the **Minio console
  (:9001)** — each one is root on the box or close to it.

So the split is:

| Surface | Exposure | How |
|---------|----------|-----|
| API, UI, RTC, Minio S3 API, social, marketing | **Public** (dev env: VPN-only by DNS) | Cloudflare DNS → NPM (80/443) → container, Let's Encrypt TLS |
| Portainer, NPM admin, Minio console | **LAN/VPN only** | No DNS record, no NPM proxy host, no router port-forward |

### How the private side is enforced

The boundary is the router, not obscurity: only 80/443 are forwarded
to the box, so :81/:9000/:9001 are simply unreachable from the
internet. Not creating DNS records for them keeps them out of
certificate-transparency logs and casual scans, but the port-forward
rule is the actual wall.

To reach an admin panel:

- **On the LAN or VPN'd into it** — hit the box's LAN IP directly:
  `http://{vm-lan-ip}:9000` (Portainer), `:81` (NPM), `:9001` (Minio).
  If your VPN drops you on the home subnet, this Just Works — no DNS
  needed. (Optional nicety: an A record on a *private* DNS server or
  `/etc/hosts` entry like `portainer.home → {vm-lan-ip}`. Never in
  public Cloudflare DNS.)
- **Remote without VPN** — SSH tunnel:
  `ssh -L 9000:localhost:9000 {ssh-user}@{vm-ip}` then open
  `http://localhost:9000`. Same pattern for 81 and 9001.

### Optional hardening (belt-and-suspenders)

If the box ever gets a public interface directly (no NAT), add host
firewall rules so the admin ports only answer to the LAN/VPN subnet:

```bash
ufw allow 80,443/tcp
ufw allow from {lan-subnet} to any port 81,9000,9001 proto tcp
ufw allow from {vpn-subnet} to any port 81,9000,9001 proto tcp
ufw enable
```

And if you someday *want* an admin panel reachable over the internet
(the "managed WordPress" convenience trade-off), do it the way hosts
do: a dedicated subdomain + TLS + NPM Access List (basic auth or IP
allowlist) *in addition to* the panel's own login — never a bare
proxy host. Default answer is still: don't.

## Secrets

### Where the box secrets live (read this before touching /opt/web10)

The canonical secrets file is **`/home/jacob/web10-ops/.env`** on the
box (chmod 600, directory 700) — deliberately OUTSIDE any repo
checkout. `/opt/web10/ubuntu-deployment/.env` is a **symlink** to it,
so the `scripts/` keep working unchanged. History: on 22.07.2026 the
GitOps conversion re-cloned `/opt/web10` and wiped the gitignored
`.env` that lived inside it, losing the Portainer admin password
(reset via `portainer/helper-reset-password`; see OPS-LOG). Rules:

- If you ever recreate `/opt/web10`, restore the symlink:
  `ln -sfn ~/web10-ops/.env /opt/web10/ubuntu-deployment/.env`
- Add/rotate secrets in `~/web10-ops/.env` only — never in a file
  that lives inside a checkout.
- To read the creds (VPN/LAN):
  `ssh jacob@192.168.8.25 cat web10-ops/.env`
- The actual passwords do NOT go in this README — the repo is public
  on GitHub, so "VPN-only" does not protect anything committed here.

- **JWT keys**: Generated by setup wizard, stored in the data volume
- **DB credentials**: Default `web10:web10` in compose — acceptable
  because postgres/ferretdb sit on the stack's internal network only,
  never on `proxy`
- **Minio credentials**: `minioadmin` / `MINIO_PASSWORD` stack env var
  (required at deploy; fresh value per environment)
- **Stripe/Twilio**: Mocked or test keys only outside prod
- **Cloudflare API token**: Stored in NPM settings (DNS edit scope only)
- No secrets in git

## Architecture

Portainer manages Docker stacks via UI. Nginx Proxy Manager owns
80/443, terminates TLS (Let's Encrypt), and forwards to containers
over the shared `proxy` Docker network that `prep-vm.sh` creates —
always by the stack-prefixed alias (`web10-dev-api`), never the bare
service name: with several stacks on one network, a bare name like
`api` resolves ambiguously across environments.

See `DEPLOYMENT-PLAN.md` for the full architecture rationale and
history.
