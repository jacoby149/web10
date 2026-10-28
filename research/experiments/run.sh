#!/usr/bin/env bash
# web10 SIGMOD experiment — the go-go-go orchestrator.
#
# Usage (on the experiment box, after git clone):
#   cd research/experiments
#   ./run.sh
#
# Or with overrides:
#   USERS=100000 POSTS=20 CONCURRENCY=50 DURATION=120 ./run.sh
#
# What it does:
#   1. Brings up the web10 docker-compose stack (api + clickhouse + minio).
#   2. Waits for the API to be healthy.
#   3. Seeds the synthetic dataset (seed.py).
#   4. Runs the bench (bench.py) — the query-engine load test.
#   5. Collects docker stats (memory per container) + the seed/bench results.
#   6. Writes results/ — the JSON files for the paper's evaluation section.
#
# The whole thing runs on localhost. No external traffic during measurement.
# When done: ../teardown.sh (from the repo) to destroy the box.

set -euo pipefail

cd "$(dirname "$0")"

# ── config (override via env) ───────────────────────────────────────────────
USERS="${USERS:-10000}"
POSTS="${POSTS:-50}"
COMMENTS="${COMMENTS:-2}"
REACTIONS="${REACTIONS:-3}"
SEED="${SEED:-42}"
READERS="${READERS:-100}"
CONCURRENCY="${CONCURRENCY:-20}"
DURATION="${DURATION:-60}"
API_PORT="${API_PORT:-6000}"
COMPOSE_FILE="${COMPOSE_FILE:-../../docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-web10-prod}"
RESULTS_DIR="$(pwd)/results"

mkdir -p "$RESULTS_DIR"

echo "============================================"
echo " web10 SIGMOD experiment"
echo "============================================"
echo " users:       ${USERS}"
echo " posts/user:  ${POSTS}"
echo " comments:    ${COMMENTS}/post"
echo " reactions:   ${REACTIONS}/post"
echo " seed:        ${SEED}"
echo " readers:     ${READERS}"
echo " concurrency: ${CONCURRENCY}"
echo " duration:    ${DURATION}s"
echo " api:         localhost:${API_PORT}"
echo "============================================"

# ── 1. bring up the stack ───────────────────────────────────────────────────
echo ""
echo "[run] bringing up docker-compose stack..."
# Only the services the bench needs: api, clickhouse, minio.
# (ui/rtc/sdk/proxy are not needed for the query-engine measurement.)
docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d api clickhouse minio

echo "[run] waiting for the API to be healthy..."
for i in $(seq 1 120); do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${API_PORT}/docs" | grep -q "200"; then
    echo "[run] API is up (${i}s)"
    break
  fi
  if [[ $i -eq 120 ]]; then
    echo "[run] error: API not healthy after 120s" >&2
    docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" logs api | tail -30
    exit 1
  fi
  sleep 1
done

# Wait for ClickHouse to accept queries (the API may be up before CH is ready).
echo "[run] waiting for ClickHouse..."
for i in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" exec -T clickhouse \
    clickhouse-client --user web10 --password web10 --database web10 \
    --query "SELECT 1" 2>/dev/null | grep -q "1"; then
    echo "[run] ClickHouse is up (${i}s)"
    break
  fi
  if [[ $i -eq 60 ]]; then
    echo "[run] error: ClickHouse not ready after 60s" >&2
    exit 1
  fi
  sleep 1
done

# ── 2. seed ─────────────────────────────────────────────────────────────────
echo ""
echo "[run] seeding ${USERS} users..."
python3 seed.py \
  --users "$USERS" \
  --posts-per-user "$POSTS" \
  --comments-per-post "$COMMENTS" \
  --reactions-per-post "$REACTIONS" \
  --seed "$SEED" \
  --truncate \
  --host localhost \
  --port 8123 \
  --db web10 \
  --user web10 \
  --password web10

# ── 3. bench ────────────────────────────────────────────────────────────────
echo ""
echo "[run] running the bench (${READERS} readers, ${CONCURRENCY} concurrency, ${DURATION}s)..."
python3 bench.py \
  --readers "$READERS" \
  --duration "$DURATION" \
  --concurrency "$CONCURRENCY" \
  --api "http://localhost:${API_PORT}" \
  --log-cmd "docker logs -f ${COMPOSE_PROJECT}-api-1" \
  --seed-summary "$(pwd)/seed-summary.json" \
  --out "${RESULTS_DIR}/bench-results.json"

# ── 4. collect docker stats (memory per container) ──────────────────────────
echo ""
echo "[run] collecting docker stats..."
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' \
  | grep "${COMPOSE_PROJECT}" > "${RESULTS_DIR}/docker-stats.txt" || true
cat "${RESULTS_DIR}/docker-stats.txt"

# ── 5. collect system info (the hardware spec for the paper) ────────────────
echo ""
echo "[run] collecting system info..."
{
  echo "hostname: $(hostname)"
  echo "cpu: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
  echo "cpus: $(nproc)"
  echo "ram: $(free -h | awk '/^Mem:/ {print $2}')"
  echo "disk: $(df -h / | awk 'NR==2 {print $2 " (" $5 " used)")')"
  echo "os: $(grep PRETTY /etc/os-release | cut -d= -f2 | tr -d "\"")"
  echo "docker: $(docker --version | awk '{print $3}' | tr -d ,)"
  CH_VER=$(docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" images clickhouse --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || echo unknown)
  echo "clickhouse: ${CH_VER}"
} > "${RESULTS_DIR}/system-info.txt"
cat "${RESULTS_DIR}/system-info.txt"

# ── 6. done ─────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " done. results in ${RESULTS_DIR}/"
echo "============================================"
ls -la "${RESULTS_DIR}/"
echo ""
echo "next: copy ${RESULTS_DIR}/ back (scp), then ../teardown.sh to destroy the box."
