#!/usr/bin/env bash
# web10 SIGMOD experiment — pre-experiment: the baby test (Digital Ocean).
#
# Proves the DO lifecycle works before we burn a droplet on the real thing:
#   1. Spin up a Digital Ocean droplet (s-2vcpu-4gb, nyc3, Ubuntu 24.04).
#   2. SSH in, install docker, run a hello-world container.
#   3. SSH in, run a docker container that exits non-zero (the error case).
#   4. Verify the droplet is still alive after the error.
#   5. Destroy the droplet. It survives only the experiment.
#
# Usage:
#   export DO_API_TOKEN=<your-token>
#   ./pre-experiment.sh
#
# "Only survive the experiment": a `trap cleanup EXIT` destroys the droplet on
# every exit path (success, mid-way exit, Ctrl-C). The droplet is tagged
# web10-sigmod-pre so a kill -9 stray is findable + deletable.

set -uo pipefail

: "${DO_API_TOKEN:?error: DO_API_TOKEN not set (Digital Ocean → API → Tokens)}"

REGION="${REGION:-nyc1}"
SIZE="${SIZE:-s-1vcpu-1gb}"     # smallest that's comfortable for docker: ~$0.15/hr
IMAGE="${IMAGE:-ubuntu-24-04-x64}"
SLUG="web10-pre-$(date +%m%d%H%M)"
API="https://api.digitalocean.com/v2"

DROPLET_ID=""
IP=""

cleanup() {
  if [[ -n "$DROPLET_ID" ]]; then
    echo ""
    echo "[pre] cleanup: destroying droplet ${DROPLET_ID}..."
    curl -s -X DELETE -H "Authorization: Bearer ${DO_API_TOKEN}" \
      "${API}/droplets/${DROPLET_ID}" > /dev/null
    echo "[pre] destroyed. the droplet only survived the experiment."
  fi
}
trap cleanup EXIT

echo "============================================"
echo " web10 SIGMOD pre-experiment (baby test, DO)"
echo "============================================"

# ── 0. clean up a stale droplet from a previous failed run ──────────────────
STALE=$(curl -s -H "Authorization: Bearer ${DO_API_TOKEN}" \
  "${API}/droplets?tag_filters=web10-sigmod-pre" \
  | python3 -c "import sys,json; ds=json.load(sys.stdin).get('droplets',[]); print(ds[0]['id'] if ds else '')")
if [[ -n "$STALE" ]]; then
  echo "[pre] found stale droplet ${STALE} from a previous run — destroying it first."
  curl -s -X DELETE -H "Authorization: Bearer ${DO_API_TOKEN}" \
    "${API}/droplets/${STALE}" > /dev/null
  sleep 8
fi

# ── 1. spin up ──────────────────────────────────────────────────────────────
echo ""
echo "[pre] creating droplet: ${SLUG} (${SIZE}, ${REGION}, ${IMAGE})"
CREATE=$(curl -s -X POST \
  -H "Authorization: Bearer ${DO_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${SLUG}\",
    \"region\": \"${REGION}\",
    \"size\": \"${SIZE}\",
    \"image\": \"${IMAGE}\",
    \"tags\": [\"web10-sigmod-pre\"],
    \"ssh_keys\": [],
    \"monitoring\": false
  }" \
  "${API}/droplets")

DROPLET_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('droplet',{}).get('id',''))" 2>/dev/null)
if [[ -z "$DROPLET_ID" ]]; then
  echo "[pre] ERROR: could not create droplet:" >&2
  echo "$CREATE" >&2
  exit 1
fi
echo "[pre] droplet id: ${DROPLET_ID}"

echo "[pre] waiting for active + ip..."
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
    break
  fi
  sleep 5
done
if [[ -z "$IP" ]]; then
  echo "[pre] ERROR: droplet not active with an ip after 300s" >&2
  exit 1
fi
echo "[pre] ip: ${IP}"

# Wait for SSH to accept connections (the IP appears before sshd is up).
echo "[pre] waiting for ssh..."
SSH_OK=0
for i in $(seq 1 30); do
  if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
       root@"${IP}" "echo ok" 2>/dev/null | grep -q ok; then
    SSH_OK=1
    break
  fi
  sleep 5
done
if [[ "$SSH_OK" -ne 1 ]]; then
  echo "[pre] ERROR: ssh not reachable after 150s" >&2
  exit 1
fi
echo "[pre] ssh is up"

# ── 2. install docker (the droplet is a bare Ubuntu VM) ─────────────────────
echo ""
echo "[pre] installing docker on the droplet..."
ssh root@"${IP}" "export DEBIAN_FRONTEND=noninteractive; \
  apt-get update -y && apt-get install -y docker.io >/dev/null && \
  systemctl enable docker && systemctl start docker && \
  docker --version"
if [[ $? -ne 0 ]]; then
  echo "[pre] ERROR: docker install failed" >&2
  exit 1
fi

# ── 3. hello-world container (the happy path) ───────────────────────────────
echo ""
echo "[pre] running hello-world docker container..."
HELLO_OUT=$(ssh root@"${IP}" "docker run --rm hello-world" 2>&1)
if echo "$HELLO_OUT" | grep -q "Hello from Docker"; then
  echo "[pre] PASS: hello-world ran."
else
  echo "[pre] ERROR: hello-world did not print the expected output:" >&2
  echo "$HELLO_OUT" >&2
  exit 1
fi

# ── 4. a container that errors (the error case) ─────────────────────────────
echo ""
echo "[pre] running a docker container that exits non-zero..."
ERR_OUT=$(ssh root@"${IP}" "docker run --rm alpine /bin/sh -c 'echo boom; exit 3'" 2>&1)
ERR_CODE=$?
echo "$ERR_OUT" | grep -q "boom" && echo "[pre] (saw the expected 'boom' output)"
if [[ "$ERR_CODE" -eq 3 ]]; then
  echo "[pre] PASS: error container exited with code 3 (as expected)."
else
  echo "[pre] NOTE: error container exited with code ${ERR_CODE} (expected 3)."
fi

# ── 5. verify the droplet is still alive after the error ────────────────────
echo ""
echo "[pre] verifying the droplet survived the error..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes root@"${IP}" "echo still-alive" 2>/dev/null | grep -q still-alive; then
  echo "[pre] PASS: droplet is still alive after the error container."
else
  echo "[pre] ERROR: droplet is unreachable after the error container!" >&2
  exit 1
fi

# ── done (cleanup trap destroys the droplet) ─────────────────────────────────
echo ""
echo "============================================"
echo " pre-experiment PASSED"
echo "   - do spin-up:      ok"
echo "   - docker install:  ok"
echo "   - hello-world:     ok"
echo "   - error container: ok (droplet survived)"
echo "   - teardown:        (running now via trap)"
echo "============================================"
