# Environments Runbook (Portainer + NPM)

One Ubuntu box (Proxmox VM), three Portainer stacks from ONE compose
file (`docker-compose.ecosystem.yml`), each carrying the whole
ecosystem: node (api, ui, rtc, minio, db) + web10-social +
marketing-ui + marketing-api. Nginx Proxy Manager terminates TLS,
Cloudflare does DNS.

## The three environments

| Stack | Vhosts | DNS points at | Reachable from | Purpose |
|-------|--------|---------------|----------------|---------|
| `web10-staging` | `*.staging.{zone}` | PUBLIC IP | internet | pre-prod checks |
| `web10-dev` | `*.dev.{zone}` | **INTERNAL LAN IP** | **VPN/LAN only** | merged work soaks here |
| `web10-prod` | `{zone}` real names | PUBLIC IP | internet | production |

The dev trick: its DNS records resolve publicly but point at the
box's LAN IP, so off-VPN they route nowhere. Zero port-forwards for
dev, no exposure, and still real domain names — so TLS, CORS, and
vhost routing behave exactly like prod. Dev TLS certs MUST use the
**DNS-01** challenge (HTTP-01 can't reach a VPN-only vhost; DNS-01
needs no inbound traffic — NPM does it with the Cloudflare API token).

Env vars per stack live in `env.staging.example` / `env.dev.example` /
`env.prod.example` — paste ALL of them into the Portainer stack. Every
one is required; a missing var fails the deploy loudly instead of
silently baking wrong origins into a frontend bundle.

## Quick reference — public surfaces

NPM forwards by the **stack-prefixed alias** on the `proxy` network
(never the bare service name — with multiple stacks up, bare names
resolve ambiguously across environments). Per env (`{env}` = staging /
dev; prod uses the bare zone names):

| Service | NPM forward target | staging/dev vhost | prod vhost |
|---------|-------------------|-------------------|------------|
| API | `{stack}-api:80` | `{env}.{zone}` | `api.{zone}` |
| UI (auth/consent) | `{stack}-ui:80` | `auth.{env}.{zone}` | `auth.{zone}` |
| RTC signaling | `{stack}-rtc:80` | `rtc.{env}.{zone}` | `rtc.{zone}` |
| Minio S3 API | `{stack}-minio:9000` | `minio.{env}.{zone}` | `minio.{zone}` |
| web10-social | `{stack}-social:80` | `social.{env}.{zone}` | `social.{zone}` |
| marketing-ui | `{stack}-marketing-ui:80` | `www.{env}.{zone}` | `www.{zone}` + `{zone}` |
| marketing-api | `{stack}-marketing-api:80` | `marketing-api.{env}.{zone}` | `marketing-api.{zone}` |

⚠ `minio` forwards to **9000** (S3 API, needed for media URLs) —
never 9001 (admin console).

Admin panels — LAN/VPN only, in EVERY environment. No DNS records, no
NPM proxy hosts, no router port-forward (only 80/443 are forwarded).
See README's "Security model" section.

| Panel | Access (from LAN/VPN) | Remote without VPN |
|-------|----------------------|--------------------|
| Portainer | `http://{vm-lan-ip}:9000` | `ssh -L 9000:localhost:9000 root@{vm-ip}` |
| Nginx Proxy Mgr | `http://{vm-lan-ip}:81` | `ssh -L 81:localhost:81 root@{vm-ip}` |
| Minio console | `http://{vm-lan-ip}:9001` | `ssh -L 9001:localhost:9001 root@{vm-ip}` |

## First deployment (box prep)

```bash
# 1. Create Ubuntu 24.04 VM on Proxmox (see specs below)
# 2. SSH in
ssh root@{vm-ip}

# 3. Run the prep script
curl -fsSL <url-to-prep-vm.sh> | sudo bash
```

The prep script installs Docker, creates the shared `proxy` network,
and deploys Portainer + Nginx Proxy Manager.

### Proxmox VM specs

- **OS**: Ubuntu 24.04 LTS
- **CPU**: 4 cores
- **RAM**: 8192 MB (consider 16384 with all three stacks up)
- **Disk**: 64 GB SCSI
- **Network**: virtio, bridge to internal LAN + NAT for outbound
- **Open ports (router-forwarded)**: 80, 443 only. Admin ports
  (81 NPM, 9000 Portainer, 9001 Minio console) stay LAN/VPN-only —
  never forward them.

### After prep — Portainer + NPM setup

1. **Portainer**: `http://{vm-lan-ip}:9000` — create admin account (from LAN/VPN)
2. **NPM**: `http://{vm-lan-ip}:81` — create admin account (from LAN/VPN)
3. **NPM SSL provider**: Settings → SSL → Providers → Add
   - Provider: `cloudflare`
   - API Token: (Cloudflare API token with DNS edit scope for your zone)
4. **Portainer stack, one per environment**: Stacks → Add stack →
   name it `web10-staging` / `web10-dev` / `web10-prod`
   - Web composer → paste `docker-compose.ecosystem.yml`
   - Env vars: ALL values from the matching `env.{env}.example`
     (`STACK` must equal the stack name; `MINIO_PASSWORD` fresh per
     env — the S3 API is exposed)
   - Deploy
5. **NPM proxy hosts** (Proxy Hosts → Add): one per row of the quick
   reference table above, forward target = the stack-prefixed alias.
   - SSL tab: Force HTTPS + Let's Encrypt
   - Staging/prod vhosts: HTTP-01 works (port 80 is forwarded)
   - **Dev vhosts: use the DNS challenge (Cloudflare token)** —
     HTTP-01 will fail, the vhost is unreachable from the internet
6. **Cloudflare DNS** — see below

### Cloudflare DNS records

All records are **DNS only** (proxy off — WebRTC and auth need direct
connections; the CDN is not useful for backend services).

```bash
export CF_API_TOKEN="your-token"   # from ubuntu-deployment/.env
ZONE="your-zone"
PUBLIC_IP="the box's public IP"    # VM_PUBLIC_IP in .env
LAN_IP="the box's LAN IP"          # VM_IP in .env — dev records only

# staging (public) — one per staging vhost in the table:
for host in staging auth.staging rtc.staging minio.staging \
            social.staging www.staging marketing-api.staging; do
  cloudflare dns record create "$ZONE" --type A --name "$host.$ZONE" \
    --content "$PUBLIC_IP" --proxied=false
done

# dev (VPN-only) — SAME names s/staging/dev/, but content = LAN IP:
for host in dev auth.dev rtc.dev minio.dev social.dev www.dev \
            marketing-api.dev; do
  cloudflare dns record create "$ZONE" --type A --name "$host.$ZONE" \
    --content "$LAN_IP" --proxied=false
done

# prod (public): api, auth, rtc, minio, social, www, marketing-api
# + the apex — content = PUBLIC IP.
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

Staging sits outside the promotion path: it's the throwaway public
check (e.g. TLS/DNS behavior that VPN-only dev can't prove).

## Redeploy (update code)

In Portainer UI:
1. Stacks → `web10-{env}` → Actions → Update stack
2. Update the compose YAML if it changed (paste new version of
   `docker-compose.ecosystem.yml`)
3. Or simply: Actions → Redeploy → pull latest + rebuild

Or via SSH:
```bash
ssh root@{vm-ip}
cd /path/to/web10-clone && git pull
docker compose -p web10-dev --env-file env.dev \
  -f ubuntu-deployment/docker-compose.ecosystem.yml up -d --build
```

After ANY redeploy: run the smoke test (below) against that env.

## Where things live

| Location | Contents |
|----------|----------|
| Docker volume `{stack}_postgres-data` | FerretDB/DocumentDB data (one per stack) |
| Docker volume `{stack}_minio-data` | Media blobs (one per stack) |
| Docker volume `npm-data` | NPM config (proxy rules, certs) |
| Docker volume `npm-letsencrypt` | Let's Encrypt certificates |
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
script), exceptional for staging, never casually for prod.

```bash
ssh root@{vm-ip}

# Stop and remove the stack (Portainer: Stacks → select → Stop/Remove)
# Remove THAT STACK'S data volumes — the prefix is the safety check:
docker volume rm web10-dev_postgres-data web10-dev_minio-data

# Redeploy the stack in Portainer, then (dev) run the e2e persona
# seed script to repopulate fixtures.
```

## Signup → login → post (smoke test)

Run against the env you touched (`{env}.{zone}` = `dev.web10.app`,
`staging.web10.app`, or `api.web10.app` for prod):

1. Open `https://auth.{env-prefixed zone}` (e.g. `auth.dev.web10.app`)
2. First boot: setup wizard auto-redirects. Complete:
   - Node identity (name, tagline)
   - Admin account (username + password)
   - Access policy (open — no phone/beta required)
3. After setup, logged in as admin
4. Test CRUD via API:

```bash
# Login to get a token
curl -X PATCH "https://{api-vhost}/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'

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
3. NPM logs: `docker logs npm`

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

## Secrets

- **JWT keys**: Generated by setup wizard, stored in the data volume
- **DB credentials**: Default `web10:web10` in compose — acceptable
  because postgres/ferretdb sit on the stack's internal network only,
  never on `proxy`
- **Minio credentials**: `minioadmin` / `MINIO_PASSWORD` stack env var
  (required at deploy; fresh value per environment)
- **Stripe/Twilio**: Mocked or test keys only outside prod
- **Cloudflare API token**: Stored in NPM settings (DNS edit scope only)
- No secrets in git
