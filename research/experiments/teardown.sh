#!/usr/bin/env bash
# web10 SIGMOD experiment — Hetzner Cloud teardown.
#
# Usage:
#   export HCLOUD_TOKEN=<your-token>
#   ./teardown.sh
#
# Deletes the server created by spinup.sh (reads /tmp/web10-sigmod-id).
# Billing stops immediately. The box is gone.

set -euo pipefail

: "${HCLOUD_TOKEN:?error: HCLOUD_TOKEN not set}"

API="https://api.hetzner.cloud/v1"

if [[ ! -f /tmp/web10-sigmod-id ]]; then
  echo "error: /tmp/web10-sigmod-id not found (did spinup.sh run?)" >&2
  exit 1
fi

SERVER_ID=$(cat /tmp/web10-sigmod-id)
IP=$(cat /tmp/web10-sigmod-ip 2>/dev/null || echo "?")

echo "deleting server ${SERVER_ID} (${IP})..."

curl -s -X DELETE \
  -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
  "${API}/servers/${SERVER_ID}" > /dev/null

echo "deleted. billing stopped."
rm -f /tmp/web10-sigmod-id /tmp/web10-sigmod-ip
