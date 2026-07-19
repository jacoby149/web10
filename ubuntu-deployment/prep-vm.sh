#!/usr/bin/env bash
# prep-vm.sh — prepare a fresh Ubuntu VM for Portainer + NPM
#
# Run this ONCE on a new VM. After it finishes, access Portainer at
# http://{vm-ip}:9000 and Nginx Proxy Manager at http://{vm-ip}:81.
# Then import stacks from ubuntu-deployment/ in the Portainer UI.
#
# Usage:
#   curl -fsSL <url> | sudo bash
#   OR
#   sudo bash prep-vm.sh

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

info() { echo -e "${GREEN}[prep]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }

info "=== web10 VM prep (Docker + Portainer + NPM) ==="

export DEBIAN_FRONTEND=noninteractive

# ── 1. System packages ────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release

# ── 2. Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  usermod -aG docker root
else
  info "Docker already installed."
fi

# ── 3. Create the shared "proxy" network ──────────────────────────────
# Nginx Proxy Manager and web10 stacks share this network so NPM can
# forward traffic to containers by service name.
if ! docker network inspect proxy &>/dev/null; then
  info "Creating shared 'proxy' network..."
  docker network create proxy
else
  info "Shared 'proxy' network already exists."
fi

# ── 4. Portainer ──────────────────────────────────────────────────────
info "Deploying Portainer..."
docker volume create portainer-data
docker run -d \
  --name portainer \
  --restart unless-stopped \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer-data:/data \
  portainer/portainer-ce:latest

# ── 5. Nginx Proxy Manager ───────────────────────────────────────────
info "Deploying Nginx Proxy Manager..."
docker volume create npm-data
docker volume create npm-letsencrypt

docker run -d \
  --name npm \
  --restart unless-stopped \
  --network proxy \
  -p 80:80 \
  -p 443:443 \
  -p 81:81 \
  -v npm-data:/data \
  -v npm-letsencrypt:/etc/letsencrypt \
  jc21/nginx-proxy-manager:latest

# ── 6. Cloudflare CLI (optional, for DNS management) ──────────────────
info "Installing cloudflare CLI..."
curl -fsSL https://github.com/cloudflare/cloudflare-go/releases/latest/download/cloudflare-linux-amd64 \
  -o /usr/local/bin/cloudflare 2>/dev/null \
  && chmod +x /usr/local/bin/cloudflare \
  || warn "cloudflare CLI install failed (optional — can use API manually)"

# ── 7. Done ───────────────────────────────────────────────────────────
info ""
info "=== VM prep complete ==="
info ""
info "Portainer:      http://$(hostname -I | awk '{print $1}'):9000"
info "Nginx Proxy Mgr: http://$(hostname -I | awk '{print $1}'):81"
info ""
info "Next steps:"
info "  1. Log into Portainer (create admin account)"
info "  2. Log into Nginx Proxy Manager (create admin account)"
info "  3. In NPM: Settings → SSL → Providers → add Cloudflare DNS provider"
info "     (API token with DNS edit scope for your zone)"
info "  4. In Portainer: Stacks → Add stack (web10-staging/-dev/-prod) →"
info "     paste docker-compose.ecosystem.yml + env vars from env.{env}.example"
info "  5. In NPM: Proxy Hosts → add forward hosts for each subdomain"
info "     (target = stack-prefixed alias e.g. web10-dev-api, port = 80,"
info "     SSL + Let's Encrypt; DNS-01 challenge for VPN-only dev vhosts)"
info ""
info "Stack file: ubuntu-deployment/docker-compose.ecosystem.yml"
info "Runbook:    ubuntu-deployment/STAGING-RUNBOOK.md"