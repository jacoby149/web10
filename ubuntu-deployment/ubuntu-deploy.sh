#!/usr/bin/env bash
# ubuntu-deploy.sh — run this on a fresh Ubuntu VM on Proxmox
# Deploys: web10 node (api + ui + db + rtc + minio) + marketing sites + caddy reverse proxy
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<you>/web10/<branch>/ubuntu-deployment/ubuntu-deploy.sh | sudo bash
#   OR copy to the VM and run: sudo bash ubuntu-deploy.sh
#
# Env vars (optional, will prompt if missing):
#   WEB10_REPO    — git repo URL (default: ask)
#   WEB10_BRANCH  — git branch to deploy (default: dev)
#   NODE_DOMAIN   — domain for the web10 node (e.g. node.web10.local)
#   MARKETING_DOMAIN — domain for marketing site (e.g. web10.local)
#   ADMIN_EMAIL   — email for Let's Encrypt (TLS certs)

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }

# ── 0. Ask for required vars ──────────────────────────────────────────
info "=== web10 Ubuntu deployment ==="

read -rp "Git repo URL (e.g. git@github.com:you/web10.git): " WEB10_REPO
read -rp "Git branch [dev]: " WEB10_BRANCH
WEB10_BRANCH="${WEB10_BRANCH:-dev}"
read -rp "Node domain (e.g. node.web10.local): " NODE_DOMAIN
read -rp "Marketing domain (e.g. web10.local): " MARKETING_DOMAIN
read -rp "Admin email for TLS certs: " ADMIN_EMAIL

info "Repo: $WEB10_REPO (branch: $WEB10_BRANCH)"
info "Node: $NODE_DOMAIN | Marketing: $MARKETING_DOMAIN | Email: $ADMIN_EMAIL"

# ── 1. System prep ────────────────────────────────────────────────────
info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release

# ── 2. Install Docker ─────────────────────────────────────────────────
info "Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker root

# ── 3. Install Caddy (reverse proxy + auto-TLS) ───────────────────────
info "Installing Caddy..."
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy
systemctl enable --now caddy

# ── 4. Clone the repo ─────────────────────────────────────────────────
info "Cloning web10 repo..."
DEPLOY_DIR="/opt/web10"
mkdir -p "$DEPLOY_DIR"
git clone "$WEB10_REPO" "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
git checkout "$WEB10_BRANCH"

# ── 5. Set up the web10 node ──────────────────────────────────────────
info "Setting up web10 node..."
NODE_DIR="/opt/web10-node"
mkdir -p "$NODE_DIR"

# Copy compose + source dirs needed for node
cp "$DEPLOY_DIR/docker-compose.yml" "$NODE_DIR/docker-compose.yml"
cp -r "$DEPLOY_DIR/api" "$NODE_DIR/"
cp -r "$DEPLOY_DIR/ui" "$NODE_DIR/"

# Create .env for the node
cat > "$NODE_DIR/.env" <<EOF
PROVIDER=$NODE_DOMAIN
DB_HOST=mongo
DB_PORT=27017
EOF

# ── 6. Set up marketing ───────────────────────────────────────────────
info "Setting up marketing services..."
MKTG_DIR="/opt/web10-marketing"
mkdir -p "$MKTG_DIR"

# Copy the marketing compose and source dirs
cp "$DEPLOY_DIR/ubuntu-deployment/docker-compose.marketing.yml" "$MKTG_DIR/docker-compose.yml"
if [ -d "$DEPLOY_DIR/marketing/marketing-ui" ]; then
  cp -r "$DEPLOY_DIR/marketing/marketing-ui" "$MKTG_DIR/marketing-ui"
fi
if [ -d "$DEPLOY_DIR/marketing/marketing-api" ]; then
  cp -r "$DEPLOY_DIR/marketing/marketing-api" "$MKTG_DIR/marketing"
fi

# Fix up compose paths to point at local dirs
sed -i 's|context: marketing/marketing-ui|context: ./marketing-ui|' "$MKTG_DIR/docker-compose.yml"
sed -i 's|context: marketing/marketing-api|context: ./marketing|' "$MKTG_DIR/docker-compose.yml"

# ── 7. Configure Caddy ────────────────────────────────────────────────
info "Configuring Caddy reverse proxy..."
cat > /etc/caddy/Caddyfile <<EOF
{
	email $ADMIN_EMAIL
}

# Web10 node — API (serves UI static files too once multi-stage Dockerfile lands)
$NODE_DOMAIN {
	reverse_proxy localhost:6000
	encode gzip
}

# Web10 node — RTC signaling
rtc.$NODE_DOMAIN {
	reverse_proxy localhost:6363
	encode gzip
}

# Marketing site (Vite preview / nginx static)
$MARKETING_DOMAIN {
	reverse_proxy localhost:5173
	encode gzip
}

# Marketing API (import pipeline + analytics)
api.$MARKETING_DOMAIN {
	reverse_proxy localhost:8000
	encode gzip
}
EOF

systemctl reload caddy

# ── 8. Build & start services ─────────────────────────────────────────
info "Building web10 node images..."
cd "$NODE_DIR"
docker compose up -d --build

info "Building marketing images..."
cd "$MKTG_DIR"
docker compose up -d --build

# ── 9. Done ───────────────────────────────────────────────────────────
info "=== Deployment complete ==="
info ""
info "Services running:"
info "  Node API:    https://$NODE_DOMAIN"
info "  Node RTC:    https://rtc.$NODE_DOMAIN"
info "  Marketing:   https://$MARKETING_DOMAIN"
info "  Marketing API: https://api.$MARKETING_DOMAIN"
info ""
info "DNS: point $NODE_DOMAIN, rtc.$NODE_DOMAIN, $MARKETING_DOMAIN, and"
info "api.$MARKETING_DOMAIN to this VM's IP. Caddy will auto-provision TLS."
info ""
info "Logs:"
info "  Node:     cd $NODE_DIR && docker compose logs -f"
info "  Marketing: cd $MKTG_DIR && docker compose logs -f"
info "  Caddy:    journalctl -u caddy -f"