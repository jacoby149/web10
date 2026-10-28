#!/usr/bin/env bash
# web10 SIGMOD experiment — pre-experiment: the baby test.
#
# Proves the Hetzner lifecycle works before we burn a box on the real thing:
#   1. Spin up a Hetzner Cloud server (cx22, the smallest — ~€0.0035/hr).
#   2. SSH in, run a hello-world docker container.
#   3. SSH in, run a docker container that exits non-zero (the error case).
#   4. Verify the box is still alive after the error (the error must not kill
#      the box — only our teardown does that).
#   5. Tear the box down. It survives only the experiment.
#
# Usage:
#   export HCLOUD_TOKEN=<your-token>
#   ./pre-experiment.sh
#
# The whole thing is idempotent-safe: if it dies mid-way, the box is tagged
# web10-sigmod-pre and you can find + delete it with:
#   hcloud server list --label web10-sigmod-pre=1
#   hcloud server delete <id>
# (or re-run this script — it cleans up a stale box first.)

set -uo pipefail

: "${HCLOUD_TOKEN:?error: HCLOUD_TOKEN not set (https://console.hetzner.cloud → API tokens)}"

REGION="${REGION:-fsn1}"
SERVER_TYPE="${SERVER_TYPE:-cx22}"   # smallest: 2 vCPU, 4 GB — enough for docker hello-world
IMAGE="${IMAGE:-ubuntu-24.04}"
LABEL="web10-sigmod-pre-$(date +%Y%m%d-%H%M%S)"
API="https://api.hetzner.cloud/v1"

SERVER_ID=""
IP=""

cleanup() {
  # Always tear the box down, even on a mid-way failure. "Only survive the
  # experiment" — the box must not outlive the script.
  if [[ -n "$SERVER_ID" ]]; then
    echo ""
    echo "[pre] cleanup: deleting server ${SERVER_ID}..."
    curl -s -X DELETE -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
      "${API}/servers/${SERVER_ID}" > /dev/null
    echo "[pre] deleted. the box only survived the experiment."
  fi
}
trap cleanup EXIT

echo "============================================"
echo " web10 SIGMOD pre-experiment (baby test)"
echo "============================================"

# ── 0. clean up a stale box from a previous failed run ──────────────────────
STALE=$(curl -s -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
  "${API}/servers?label_selector=web10-sigmod-pre=1" \
  | python3 -c "import sys,json; ids=[s['id'] for s in json.load(sys.stdin).get('servers',[])]; print(ids[0] if ids else '')")
if [[ -n "$STALE" ]]; then
  echo "[pre] found stale box ${STALE} from a previous run — deleting it first."
  curl -s -X DELETE -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
    "${API}/servers/${STALE}" > /dev/null
  sleep 5
fi

# ── 1. spin up ──────────────────────────────────────────────────────────────
echo ""
echo "[pre] creating server: ${LABEL} (${SERVER_TYPE}, ${REGION}, ${IMAGE})"
CREATE=$(curl -s -X POST \
  -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"server\": {
      \"name\": \"${LABEL}\",
      \"server_type\": \"${SERVER_TYPE}\",
      \"image\": \"${IMAGE}\",
      \"location\": \"${REGION}\",
      \"labels\": {\"web10-sigmod-pre\": \"1\"},
      \"public_net\": {\"ipv4\": true}
    }
  }" \
  "${API}/servers")

SERVER_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['server']['id'])" 2>/dev/null)
if [[ -z "$SERVER_ID" ]]; then
  echo "[pre] ERROR: could not create server:" >&2
  echo "$CREATE" >&2
  exit 1
fi
echo "[pre] server id: ${SERVER_ID}"

echo "[pre] waiting for ip + ssh..."
for i in $(seq 1 90); do
  IP=$(curl -s -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
    "${API}/servers/${SERVER_ID}" | python3 -c "
import sys, json
s = json.load(sys.stdin)['server']
for n in s.get('public_net', {}).get('ipv4', []):
    if n.get('ip'):
        print(n['ip']); break
")
  if [[ -n "$IP" ]]; then
    break
  fi
  sleep 5
done
if [[ -z "$IP" ]]; then
  echo "[pre] ERROR: no ip after 450s" >&2
  exit 1
fi
echo "[pre] ip: ${IP}"

# Wait for SSH to actually accept connections (the IP appears before sshd is up).
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

# ── 2. install docker (the box is a bare Ubuntu VM) ─────────────────────────
echo ""
echo "[pre] installing docker on the box..."
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
# docker run propagates the container's exit code. We expect 3.
if [[ "$ERR_CODE" -eq 3 ]]; then
  echo "[pre] PASS: error container exited with code 3 (as expected)."
else
  echo "[pre] NOTE: error container exited with code ${ERR_CODE} (expected 3)."
  # Not fatal — the point is the box survives, not the exact code.
fi

# ── 5. verify the box is still alive after the error ────────────────────────
echo ""
echo "[pre] verifying the box survived the error..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes root@"${IP}" "echo still-alive" 2>/dev/null | grep -q still-alive; then
  echo "[pre] PASS: box is still alive after the error container."
else
  echo "[pre] ERROR: box is unreachable after the error container!" >&2
  exit 1
fi

# ── done (cleanup trap deletes the box) ─────────────────────────────────────
echo ""
echo "============================================"
echo " pre-experiment PASSED"
echo "   - hetzner spin-up: ok"
echo "   - docker install:  ok"
echo "   - hello-world:     ok"
echo "   - error container: ok (box survived)"
echo "   - teardown:        (running now via trap)"
echo "============================================"
# The trap fires on exit and deletes the box.
