#!/usr/bin/env bash
# web10 SIGMOD experiment — Hetzner Cloud spin-up.
#
# Usage:
#   export HCLOUD_TOKEN=<your-token>
#   ./spinup.sh
#
# Creates a cx42 (4 vCPU AMD EPYC, 16 GB, 80 GB NVMe) in fsn1 (Falkenstein),
# Ubuntu 24.04. Waits for the IP, prints it. Tagged web10-sigmod so
# teardown.sh finds it. Hourly billing — destroy when done.
#
# The box is the experiment host: the web10 node runs in docker compose on it,
# the bench hammers localhost, no external traffic during measurement.

set -euo pipefail

: "${HCLOUD_TOKEN:?error: HCLOUD_TOKEN not set (https://console.hetzner.cloud → API tokens)}"

REGION="${REGION:-fsn1}"
SERVER_TYPE="${SERVER_TYPE:-cx42}"
IMAGE="${IMAGE:-ubuntu-24.04}"
LABEL="web10-sigmod-$(date +%Y%m%d-%H%M%S)"
API="https://api.hetzner.cloud/v1"

echo "creating server: ${LABEL} (${SERVER_TYPE}, ${REGION}, ${IMAGE})"

CREATE=$(curl -s -X POST \
  -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"server\": {
      \"name\": \"${LABEL}\",
      \"server_type\": \"${SERVER_TYPE}\",
      \"image\": \"${IMAGE}\",
      \"location\": \"${REGION}\",
      \"labels\": {\"web10-sigmod\": \"1\"},
      \"public_net\": {\"ipv4\": true}
    }
  }" \
  "${API}/servers")

SERVER_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['server']['id'])")
echo "server id: ${SERVER_ID}"
echo "waiting for ip..."

for i in $(seq 1 60); do
  IP=$(curl -s -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
    "${API}/servers/${SERVER_ID}" | python3 -c "
import sys, json
s = json.load(sys.stdin)['server']
for n in s.get('public_net', {}).get('ipv4', []):
    if n.get('ip'):
        print(n['ip']); break
")
  if [[ -n "$IP" ]]; then
    echo "ip: ${IP}"
    echo "${IP}" > /tmp/web10-sigmod-ip
    echo "${SERVER_ID}" > /tmp/web10-sigmod-id
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

echo "error: no ip after 300s" >&2
exit 1
