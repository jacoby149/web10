# Staging Node Runbook (Portainer + NPM)

Internal staging node on Proxmox. Managed through Portainer (stack UI)
and Nginx Proxy Manager (reverse proxy + TLS). Cloudflare DNS.

## Quick reference

Public (DNS + NPM + Let's Encrypt):

| Service | Portainer container | NPM proxy host |
|---------|-------------------|----------------|
| API | `api` (port 80) | `staging.{zone}` |
| UI (auth/consent) | `ui` (port 80) | `auth.staging.{zone}` |
| RTC signaling | `rtc` (port 80) | `rtc.staging.{zone}` |
| Minio S3 API | `minio` (port 9000) | `minio.staging.{zone}` |

Admin panels — LAN/VPN only. No DNS records, no NPM proxy hosts, no
router port-forward (only 80/443 are forwarded). See README's
"Security model" section.

| Panel | Access (from LAN/VPN) | Remote without VPN |
|-------|----------------------|--------------------|
| Portainer | `http://{vm-lan-ip}:9000` | `ssh -L 9000:localhost:9000 root@{vm-ip}` |
| Nginx Proxy Mgr | `http://{vm-lan-ip}:81` | `ssh -L 81:localhost:81 root@{vm-ip}` |
| Minio console | `http://{vm-lan-ip}:9001` | `ssh -L 9001:localhost:9001 root@{vm-ip}` |

## First deployment

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
- **RAM**: 8192 MB
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
4. **Portainer stack**: Stacks → Add stack → name it `web10-staging`
   - Web composer → paste `docker-compose.staging.yml`
   - Set env vars: `PROVIDER=staging.{zone}`,
     `MINIO_PASSWORD={strong random}` (required — deploy fails without
     it; the S3 API is internet-facing)
   - Deploy
5. **NPM proxy hosts** (Proxy Hosts → Add):

| Domain | Forward IP/Host | Forward Port | Block Commits |
|--------|----------------|--------------|---------------|
| `staging.{zone}` | `api` | 80 | Yes |
| `auth.staging.{zone}` | `ui` | 80 | Yes |
| `rtc.staging.{zone}` | `rtc` | 80 | Yes |
| `minio.staging.{zone}` | `minio` | 9000 | Yes |

   ⚠ `minio` forwards to **9000** (S3 API, needed for media URLs) —
   never 9001 (admin console). Do NOT add proxy hosts for Portainer,
   the NPM admin UI, or the Minio console — those are LAN/VPN only.

   - SSL tab: Force HTTPS + Let's Encrypt (enable)
   - Custom cert: No (LE will provision automatically)
   - CSR: Let's Encrypt email

6. **Cloudflare DNS** — create A records (see below)

### Cloudflare DNS records

```bash
# Via cloudflare CLI (if installed by prep-vm.sh):
export CF_API_TOKEN="your-token"
ZONE="your-zone"
IP="your-vm-public-ip"

cloudflare dns record create "$ZONE" --type A --name "staging.$ZONE" --content "$IP" --proxied=false
cloudflare dns record create "$ZONE" --type A --name "auth.staging.$ZONE" --content "$IP" --proxied=false
cloudflare dns record create "$ZONE" --type A --name "rtc.staging.$ZONE" --content "$IP" --proxied=false
cloudflare dns record create "$ZONE" --type A --name "minio.staging.$ZONE" --content "$IP" --proxied=false

# Or via Cloudflare dashboard: add A records, proxy = DNS only
```

All records are **DNS only** (proxy off). WebRTC and auth need direct
connections. Cloudflare CDN is not useful for backend services.

## Redeploy (update code)

In Portainer UI:
1. Stacks → `web10-staging` → Actions → Update stack
2. Update the compose YAML if it changed (paste new version)
3. Or simply: Actions → Redeploy → pull latest images + rebuild

Or via SSH:
```bash
ssh root@{vm-ip}
docker compose -f /path/to/docker-compose.staging.yml pull
docker compose -f /path/to/docker-compose.staging.yml up -d --build
```

## Where things live

| Location | Contents |
|----------|----------|
| Docker volume `postgres-data` | FerretDB/DocumentDB data |
| Docker volume `minio-data` | Media blobs |
| Docker volume `npm-data` | NPM config (proxy rules, certs) |
| Docker volume `npm-letsencrypt` | Let's Encrypt certificates |
| Docker volume `portainer-data` | Portainer database |

```bash
# List all volumes
docker volume ls

# Inspect a volume's mount point
docker volume inspect postgres-data
```

## Wipe + reseed (fresh start)

⚠️ This destroys all user data on the staging node.

```bash
ssh root@{vm-ip}

# Stop and remove the stack
docker compose -f /path/to/docker-compose.staging.yml down

# Remove persistent data volumes
docker volume rm web10-staging_postgres-data web10-staging_minio-data
# Or in Portainer: Volumes → select → Remove

# Redeploy
# In Portainer: Stacks → web10-staging → Redeploy
```

## Signup → login → post (end-to-end test)

1. Open `https://auth.staging.{zone}`
2. First boot: setup wizard auto-redirects. Complete:
   - Node identity (name, tagline)
   - Admin account (username + password)
   - Access policy (open — no phone/beta required)
3. After setup, logged in as admin
4. Test CRUD via API:

```bash
# Login to get a token
curl -X PATCH "https://staging.{zone}/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'

# Create a record
curl -X PATCH "https://staging.{zone}/{username}/posts" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"body": {"text": "Hello staging!", "ts": "2026-07-19T00:00:00Z"}}'

# Read it back
curl "https://staging.{zone}/{username}/posts" \
  -H "Authorization: Bearer <token>"
```

## Troubleshooting

### Containers not starting

Portainer → Stacks → `web10-staging` → Logs tab. Or SSH:
```bash
docker ps --filter "name=web10"
docker logs {container-name} --tail 50
```

Common issue: FerretDB not ready before API starts. The compose
`depends_on` handles this, but if FerretDB is slow on first boot,
wait a few seconds and restart the API container.

### NPM proxy not working

1. Check NPM → Proxy Hosts → is the host active (green dot)?
2. Forward host must be the **container name** (`api`, `ui`, `rtc`, `minio`)
3. Container must be on the `proxy` network (it is by default in the stack)
4. Test direct container access:
   ```bash
   docker exec -it {container-name} wget -qO- http://localhost:80
   ```

### Let's Encrypt failing

1. DNS must resolve to the VM's public IP first
2. NPM → SSL Certificates → check the cert status
3. NPM logs: `docker logs npm`
4. Common fix: DNS challenge via Cloudflare requires the API token
   in NPM settings. HTTP-01 challenge needs port 80 accessible (it is).

### CORS errors from UI

The API's CORS is derived from `CORS_SERVICE_MANAGERS` in settings.
Make sure it includes the auth subdomain:

```bash
# Check current CORS config
docker exec -it {api-container} uv run python -c \
  "from app import settings; print(settings.CORS_SERVICE_MANAGERS)"
```

If missing, add `CORS_SERVICE_MANAGERS` to the API environment in
the Portainer stack (edit stack → env vars).

### Minio presigned URLs not working

The API generates presigned URLs using `S3_ENDPOINT=http://minio:9000`
(internal Docker network). For browser uploads, the Minio container
has a network alias (`minio.{PROVIDER}`). If uploads fail, check that
the alias matches what the API is configured to use.

### TLS cert renewal

NPM handles this automatically. Certs renew 30 days before expiry.
Check: NPM → SSL Certificates → Expiry column.

## Secrets

- **JWT keys**: Generated by setup wizard, stored in the data volume
- **DB credentials**: Default `web10:web10` in compose (internal only)
- **Minio credentials**: `minioadmin` / `MINIO_PASSWORD` stack env var
  (required at deploy — the S3 API is public via NPM, so no default)
- **Stripe/Twilio**: Mocked or test keys only on staging
- **Cloudflare API token**: Stored in NPM settings (DNS edit scope only)
- No secrets in git