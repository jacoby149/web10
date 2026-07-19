# ubuntu-deployment

Deploy a web10 node on an Ubuntu VM (Proxmox homelab or any box) using
Portainer (stack UI) + Nginx Proxy Manager (reverse proxy + TLS) +
Cloudflare (DNS). No shell-script deploys — infra is managed through
the two admin UIs.

## Files

**Agents doing ops work on the box: `AGENT-OPS.md` is your file.**
Read it fully before your first SSH — it has the connection
procedure, the diagnosis sequence, the current known breakage, and
the rules. Log every session in `OPS-LOG.md`.

| File | Purpose |
|------|---------|
| `AGENT-OPS.md` | Field manual for agents operating the box (SSH, diagnose, redeploy, guardrails) |
| `OPS-LOG.md` | Append-only ledger of box changes — read before ops, write after |
| `prep-vm.sh` | One-shot VM prep: Docker + Portainer + NPM + shared `proxy` network |
| `docker-compose.staging.yml` | Self-contained staging stack (prod-mode: gunicorn, built UI, no hot-reload) |
| `docker-compose.marketing.yml` | Standalone marketing stack (marketing-ui + marketing-api) |
| `.env.example` | Template for local secrets (`CF_API_TOKEN`, zone, VM IP). Copy to `.env` — gitignored |
| `STAGING-RUNBOOK.md` | Day-2 operations (redeploy, volumes, wipe, e2e test, troubleshooting) |
| `DEPLOYMENT-PLAN.md` | Architecture rationale (why Portainer + NPM + Cloudflare) |

## How to use (first deploy)

```bash
# 0. Locally: copy .env.example → .env, fill in CF token / zone / VM IP.

# 1. On a fresh Ubuntu 24.04 VM (4 CPU / 8 GB / 64 GB):
sudo bash prep-vm.sh          # Docker + Portainer + NPM + "proxy" network

# 2. Portainer — http://{vm-lan-ip}:9000  (from LAN/VPN only, see below)
#    Create the admin account, then: Stacks → Add stack → name it
#    web10-staging → paste docker-compose.staging.yml → set env vars
#    PROVIDER=staging.{zone} and MINIO_PASSWORD={strong random}
#    (required; the S3 API is internet-facing) → Deploy.

# 3. Nginx Proxy Manager — http://{vm-lan-ip}:81  (LAN/VPN only)
#    Create the admin account, then add proxy hosts (SSL tab: Force
#    HTTPS + request a Let's Encrypt cert on each):
#      staging.{zone}        → api:80
#      auth.staging.{zone}   → ui:80
#      rtc.staging.{zone}    → rtc:80
#      minio.staging.{zone}  → minio:9000   # S3 API for media — NOT :9001
#
#    ⚠ Never add proxy hosts for Portainer, the NPM admin UI, or the
#    Minio console. Those stay off the internet entirely (see below).

# 4. Cloudflare DNS: A records for the four public hostnames above,
#    pointing at the box's public IP, proxy = DNS only. Nothing else
#    gets a record.

# 5. Router/firewall: forward ONLY 80 and 443 to the VM.

# 6. Smoke test: open https://auth.staging.{zone}, run the setup
#    wizard, then the signup → login → post flow in the runbook.
```

Day-2 (redeploy, wipe, troubleshooting): `STAGING-RUNBOOK.md`.

## Security model: public app, private admin

This copies how WordPress hosting actually works. WordPress has two
admin layers and treats them differently:

- **`wp-admin`** — the *application's* admin. It lives on the public
  domain behind the app's own login. Everyone can reach the URL; the
  app's auth is the boundary. Our equivalent is `auth.staging.{zone}`
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
| API, UI, RTC, Minio S3 API | **Public** | Cloudflare DNS → NPM (80/443) → container, Let's Encrypt TLS |
| Portainer, NPM admin, Minio console | **LAN/VPN only** | No DNS record, no NPM proxy host, no router port-forward |

### How the private side is enforced

The boundary is the router, not obscurity: only 80/443 are forwarded
to the VM, so :81/:9000/:9001 are simply unreachable from the
internet. Not creating DNS records for them keeps them out of
certificate-transparency logs and casual scans, but the port-forward
rule is the actual wall.

To reach an admin panel:

- **On the LAN or VPN'd into it** — hit the VM's LAN IP directly:
  `http://{vm-lan-ip}:9000` (Portainer), `:81` (NPM), `:9001` (Minio).
  If your VPN drops you on the home subnet, this Just Works — no DNS
  needed. (Optional nicety: an A record on a *private* DNS server or
  `/etc/hosts` entry like `portainer.home → {vm-lan-ip}`. Never in
  public Cloudflare DNS.)
- **Remote without VPN** — SSH tunnel:
  `ssh -L 9000:localhost:9000 root@{vm-ip}` then open
  `http://localhost:9000`. Same pattern for 81 and 9001.

### Optional hardening (belt-and-suspenders)

If the box ever gets a public interface directly (no NAT), add host
firewall rules so the admin ports only answer to the LAN/VPN subnet:

```bash
ufw allow 80,443/tcp
ufw allow from 192.168.8.0/24 to any port 81,9000,9001 proto tcp
ufw allow from {vpn-subnet} to any port 81,9000,9001 proto tcp
ufw enable
```

And if you someday *want* an admin panel reachable over the internet
(the "managed WordPress" convenience trade-off), do it the way hosts
do: a dedicated subdomain + TLS + NPM Access List (basic auth or IP
allowlist) *in addition to* the panel's own login — never a bare
proxy host. Default answer is still: don't.

## Architecture

Portainer manages Docker stacks via UI. Nginx Proxy Manager owns
80/443, terminates TLS (Let's Encrypt), and forwards to containers by
service name over the shared `proxy` Docker network that `prep-vm.sh`
creates.

See `DEPLOYMENT-PLAN.md` for the full architecture and DNS plan.
