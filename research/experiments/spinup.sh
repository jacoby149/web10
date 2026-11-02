#!/usr/bin/env bash
# web10 SIGMOD experiment — Digital Ocean spin-up.
#
# Usage:
#   export DO_API_TOKEN=<your-token>
#   ./spinup.sh
#
# Creates a s-4vcpu-16gb droplet in nyc3 (Ubuntu 24.04), waits for SSH,
# prints the IP. The droplet is tagged web10-sigmod so teardown.sh finds it.
# Hourly billing — destroy when done.
#
# The droplet is the experiment host: the web10 node runs in docker compose on
# it, the bench hammers localhost, no external traffic during measurement.

set -euo pipefail

: "${DO_API_TOKEN:?error: DO_API_TOKEN not set (Digital Ocean → API → Tokens)}"

REGION="${REGION:-nyc3}"
SIZE="${SIZE:-s-4vcpu-16gb}"
IMAGE="${IMAGE:-ubuntu-24-04-x64}"
SLUG="web10-sigmod-$(date +%m%d%H%M)"
API="https://api.digitalocean.com/v2"

echo "creating droplet: ${SLUG} (${SIZE}, ${REGION}, ${IMAGE})"

DROPLET_ID=$(curl -s -X POST \
  -H "Authorization: Bearer ${DO_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${SLUG}\",
    \"region\": \"${REGION}\",
    \"size\": \"${SIZE}\",
    \"image\": \"${IMAGE}\",
    \"tags\": [\"web10-sigmod\"],
    \"ssh_keys\": [],
    \"monitoring\": true
  }" \
  "${API}/droplets" | python3 -c "import sys,json; print(json.load(sys.stdin).get('droplet',{}).get('id',''))")

if [[ -z "$DROPLET_ID" ]]; then
  echo "error: could not create droplet" >&2
  exit 1
fi
echo "droplet id: ${DROPLET_ID}"
echo "waiting for active + public_ip..."

for i in $(seq 1 60); do
  STATE=$(curl -s -H "Authorization: Bearer ${DO_API_TOKEN}" \
    "${API}/droplets/${DROPLET_ID}" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('droplet', {})
v4 = [n['ip_address'] for n in d.get('networks',{}).get('v4',[]) if n.get('type')=='primary']
print(d.get('status',''), v4[0] if v4 else '')
")
  STATUS=$(echo "$STATE" | awk '{print $1}')
  IP=$(echo "$STATE" | awk '{print $2}')
  if [[ "$STATUS" == "active" && -n "$IP" ]]; then
    echo "active: ${IP}"
    echo "${IP}" > /tmp/web10-sigmod-ip
    echo "${DROPLET_ID}" > /tmp/web10-sigmod-id
    echo ""
    echo "done. the box is at ${IP}"
    echo "next:"
    echo "  ssh root@${IP}"
    echo "  git clone <repo> && cd sucre"
    echo "  cd research/experiments && ./run.sh"
    exit 0
  fi
  sleep 5
done

echo "error: droplet not active after 300s" >&2
exit 1
