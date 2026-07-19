# Ubuntu Deployment Plan (v2 — Portainer + NPM)

Replaces the `ubuntu-deploy.sh` approach. Homelab infra is managed
through Portainer (stack UI) + Nginx Proxy Manager (reverse proxy + TLS).
Cloudflare handles DNS. No more shell scripts copying compose files
around the filesystem.

## Environments

| Name | Purpose | Domain | TLS |
|------|---------|--------|-----|
| **staging** | Dev team testing, pre-demo validation | `staging.{zone}` | Let's Encrypt via NPM |
| **prod** | Live creator node | `{creator}.{zone}` or custom domain | Let's Encrypt via NPM |

Staging is NOT "dev" — it's a deployed environment the team hits for
e2e testing. Prod is what a creator runs. Same stack, different domain
+ data volumes. The staging compose overlay (`docker-compose.staging.yml`)
is the template both use.

## Architecture

```
Internet → Cloudflare DNS → Proxmox host (public IP)
                                    │
                    ┌───────────────┼───────────────┐
                    │  Nginx Proxy Manager (port 80/443)
                    │  Routes: *.staging.{zone} → backend containers
                    │  Auto TLS: Let's Encrypt (Cloudflare DNS challenge)
                    │
                    │  Portainer (port 9000)
                    │  Stack management UI
                    │
                    │  web10 staging stack (docker compose)
                    │  ├─ api (gunicorn, port 6000)
                    │  ├─ ui (static nginx, port 3000)
                    │  ├─ ferretdb + postgres (port 27017)
                    │  ├─ rtc (bun, port 6363)
                    │  └─ minio (port 9000/9001)
                    │
                    └─ marketing stack (if co-located)
                       ├─ marketing-ui (port 5173)
                       └─ marketing-api (port 8000)
```

## DNS Records (Cloudflare)

For staging:
| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| `staging.{zone}` | A | `{public-ip}` | DNS only |
| `auth.staging.{zone}` | A | `{public-ip}` | DNS only |
| `rtc.staging.{zone}` | A | `{public-ip}` | DNS only |
| `minio.staging.{zone}` | A | `{public-ip}` | DNS only |

For prod (per creator):
| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| `{creator}.{zone}` | A | `{public-ip}` | Proxied (CF CDN) |
| `auth.{creator}.{zone}` | A | `{public-ip}` | DNS only |
| `rtc.{creator}.{zone}` | A | `{public-ip}` | DNS only |

Proxy = "on" puts Cloudflare CDN in front (good for prod static assets,
bad for WebRTC). RTC and auth stay DNS-only. API can go either way.

## NPM Proxy Rules

| Forward Hostname | Forward Port | SSL | Let's Encrypt |
|-----------------|--------------|-----|---------------|
| `staging.{zone}` | `web10-api` | Yes | Yes |
| `auth.staging.{zone}` | `web10-ui` | Yes | Yes |
| `rtc.staging.{zone}` | `web10-rtc` | Yes | Yes |
| `minio.staging.{zone}` | `web10-minio` | Yes | Yes |

NPM uses Docker network names for forwarding, so containers must be on
the same network as NPM (or a shared `proxy` network).

## Stack Files

### `docker-compose.staging.yml` (self-contained, not overlay)

The overlay format needs to become a standalone stack for Portainer.
Portainer stacks are single compose files. The staging compose should
include all services inline (no `-f base -f overlay` chaining).

### Marketing stack

`docker-compose.marketing.yml` is already standalone — fine as-is.

## What Changes in This Repo

| File | Action |
|------|--------|
| `ubuntu-deploy.sh` | **Delete** or reduce to "prep-vm.sh" (Docker + Portainer + NPM install only) |
| `docker-compose.staging.yml` | Rewrite as self-contained stack (no overlay) |
| `docker-compose.ui-prod.yml` | **Delete** (merged into staging stack) |
| `docker-compose.rtc-prod.yml` | **Delete** (merged into staging stack) |
| `STAGING-RUNBOOK.md` | Update for Portainer/NPM workflow |
| `README.md` | Update to reflect Portainer approach |
| `docker-compose.marketing.yml` | Keep as-is |

## SSH Access

The host is accessed through a `web10ssh` shell alias (added to the
local `~/.zshrc`/`~/.bashrc`):

```bash
alias web10ssh='ssh root@{vm-ip}'
```

Agent workflow: run `web10ssh` → you're in. No need to share IPs or
remember credentials — the alias handles it.

## Secrets (.env, gitignored, persistent)

Cloudflare API token and other secrets live in `.env` files that are:
- **Gitignored** (`.env` in `.gitignore`)
- **Persistent** (copied to the VM, not committed)
- **Loaded** by compose stacks and scripts automatically

### `ubuntu-deployment/.env.example` (committed, no real values)

```
CF_API_TOKEN=your-cloudflare-api-token-here
CF_ZONE=your-zone.example.com
VM_IP=192.168.8.20
```

### `ubuntu-deployment/.env` (gitignored, real values)

Copied from `.env.example`, filled in with real values. The agent
reads this file for Cloudflare operations and VM access. Never committed.

`prep-vm.sh` and any future scripts source this `.env` automatically
if it exists on the VM (`/opt/web10/ubuntu-deployment/.env`).

## Execution Steps (Agent Can Do)

1. Run `web10ssh` → SSH into Proxmox host
2. `docker rm -f $(docker ps -aq)` — kill existing containers
3. `docker volume prune -f` — clear stale volumes (⚠️ destroys data)
4. Run `prep-vm.sh` (Docker + Portainer + NPM + shared `proxy` network)
5. Copy `.env` to the VM (`/opt/web10/ubuntu-deployment/.env`)
6. Create Cloudflare DNS records via `cloudflare` CLI (reads `CF_API_TOKEN` from `.env`)
7. In NPM UI: add proxy hosts + SSL (Let's Encrypt, Cloudflare DNS challenge)
8. Import `docker-compose.staging.yml` as Portainer stack
9. Test: signup → login → post end-to-end

## Cloudflare DNS Challenge (vs HTTP-01)

NPM supports both HTTP-01 and DNS challenge for Let's Encrypt.
DNS challenge via Cloudflare API is better because:
- Works before DNS propagates (HTTP-01 needs port 80 accessible)
- Wildcard certs possible (one cert for `*.staging.{zone}`)
- No port conflicts (NPM owns 80/443, CF DNS challenge bypasses HTTP)

Requires NPM env vars: `DNS_PROVIDER=cloudflare`, `CF_API_EMAIL`, `CF_API_KEY`
(or `CF_DNS_API_TOKEN` — preferred, narrower scope).

## Next Steps

1. You: add `web10ssh` alias to shell profile, give me Cloudflare zone + API token
2. I: create `ubuntu-deployment/.env` (gitignored) with your CF token + zone
3. I: run `web10ssh` → assess current box state
4. I: run `prep-vm.sh` → Portainer + NPM up
5. I: Cloudflare CLI → create DNS records
6. I: NPM → proxy hosts + Let's Encrypt
7. I: Portainer → import staging stack
8. I: e2e test + update runbook with actuals