#!/usr/bin/env bash
# web10 SIGMOD experiment — Digital Ocean teardown.
#
# Usage:
#   export DO_API_TOKEN=<your-token>
#   ./teardown.sh
#
# Destroys the droplet created by spinup.sh (reads /tmp/web10-sigmod-id).
# Billing stops immediately. The box is gone.

set -euo pipefail

: "${DO_API_TOKEN:?error: DO_API_TOKEN not set}"

API="https://api.digitalocean.com/v2"

if [[ ! -f /tmp/web10-sigmod-id ]]; then
  echo "error: /tmp/web10-sigmod-id not found (did spinup.sh run?)" >&2
  exit 1
fi

DROPLET_ID=$(cat /tmp/web10-sigmod-id)
IP=$(cat /tmp/web10-sigmod-ip 2>/dev/null || echo "?")

echo "destroying droplet ${DROPLET_ID} (${IP})..."

curl -s -X DELETE \
  -H "Authorization: Bearer ${DO_API_TOKEN}" \
  "${API}/droplets/${DROPLET_ID}" > /dev/null

echo "destroyed. billing stopped."
rm -f /tmp/web10-sigmod-id /tmp/web10-sigmod-ip
