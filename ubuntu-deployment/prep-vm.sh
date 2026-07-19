#!/usr/bin/env bash
# prep-vm.sh — prepare a fresh Ubuntu box: Docker + Portainer + the
# shared "proxy" network. Everything else (the NPM edge proxy, the
# web10 env stacks) deploys as Portainer stacks so it's all visible
# in the Portainer UI.
#
# Run this ONCE on a new box. After it finishes, access Portainer at
# http://{vm-ip}:9000 and deploy the "edge" stack first
# (docker-compose.edge.yml), then the web10-* stacks.
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

info "=== web10 box prep (Docker + Portainer + proxy network) ==="

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
# The edge proxy (NPM stack) and web10 stacks share this network so
# NPM can forward traffic to containers by stack-prefixed alias.
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
# NOT deployed here — NPM runs as the FIRST Portainer stack ("edge",
# from docker-compose.edge.yml) so the proxy itself is visible and
# manageable in the Portainer UI and its config/certs live in named
# volumes. See the runbook.

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
info ""
info "Next steps:"
info "  1. Log into Portainer (create admin account)"
info "  2. In Portainer: Stacks → Add stack → name 'edge' → paste"
info "     docker-compose.edge.yml → deploy. Then log into NPM at :81"
info "     (admin@example.com/changeme — change immediately) and add the"
info "     Cloudflare DNS provider under Settings → SSL"
info "  3. In Portainer: Stacks → Add stack (web10-dev / web10-prod) →"
info "     paste docker-compose.ecosystem.yml + env vars from env.{env}.example"
info "  4. In NPM: Proxy Hosts → add forward hosts for each subdomain"
info "     (target = stack-prefixed alias e.g. web10-dev-api, port = 80,"
info "     SSL + Let's Encrypt; DNS-01 challenge for VPN-only dev vhosts)"
info ""
info "Stack file: ubuntu-deployment/docker-compose.ecosystem.yml"
info "Runbook:    ubuntu-deployment/README.md"