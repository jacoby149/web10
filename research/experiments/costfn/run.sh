#!/usr/bin/env bash
# Access-control cost function experiment — the go-go-go orchestrator.
#
# Usage (on the experiment host, after git clone + docker available):
#   cd research/experiments/costfn
#   ./run.sh
#
# Or with overrides:
#   CREATORS=1000 FOLLOW=100 K_VALUES="10 100 1000" RUNS=20 ./run.sh
#
# What it does:
#   1. Brings up the web10 stack (api + clickhouse + minio) under a dedicated
#      compose project (web10-costfn) so it never touches a dev/prod stack.
#   2. Waits for the API to be healthy.
#   3. Seeds the metadata-only dataset (seed.py) — N creators, one reader
#      following K of them, a discover board.
#   4. Runs the bench (bench.py) across the matrix: feeds x K x readable-mode
#      x {A,B,C} lines, driving the three evaluation flags by restarting the
#      api container per cell.
#   5. Writes results/ — per-cell JSON + report.json (the paper's numbers).
#   6. Tears down ONLY the web10-costfn project + its volumes.
#
# Everything runs on localhost. The three QUERY_EVAL_* flags are set per-cell
# via `docker compose -e`; they default OFF, so a stray flag never leaks into
# another cell. When done, the box is destroyed by the caller (spinup/teardown
# in ../ or the DO scripts) — this script only manages the local compose stack.

set -euo pipefail
cd "$(dirname "$0")"

# ── config (override via env) ───────────────────────────────────────────────
CREATORS="${CREATORS:-1000}"
FOLLOW="${FOLLOW:-100}"
POSTS_PER_CREATOR="${POSTS_PER_CREATOR:-5}"
SEED="${SEED:-42}"
K_VALUES="${K_VALUES:-10 100 1000}"
FEEDS="${FEEDS:-personal discover}"
MODES="${MODES:-per-group batched}"
LINES="${LINES:-A B C}"
RUNS="${RUNS:-20}"
API_PORT="${API_PORT:-6000}"
API_BASE="http://localhost:${API_PORT}"
COMPOSE_FILE="${COMPOSE_FILE:-../../docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-web10-costfn}"
COMPOSE="docker compose -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT}"
RESULTS_DIR="$(pwd)/results"
MANIFEST="$(pwd)/seed-manifest.json"

mkdir -p "$RESULTS_DIR"

echo "============================================"
echo " access-control cost function experiment"
echo "============================================"
echo " creators:        ${CREATORS}"
echo " follow (K max):  ${FOLLOW}"
echo " posts/creator:   ${POSTS_PER_CREATOR}"
echo " seed:            ${SEED}"
echo " K values:        ${K_VALUES}"
echo " feeds:           ${FEEDS}"
echo " readable modes:  ${MODES}"
echo " lines:           ${LINES}"
echo " runs/cell:       ${RUNS}"
echo " api:             ${API_BASE}"
echo " compose project: ${COMPOSE_PROJECT}"
echo "============================================"

# ── 1. bring up the stack (only what the bench needs) ───────────────────────
echo ""
echo "[run] bringing up ${COMPOSE_PROJECT} (api + clickhouse + minio)..."
$COMPOSE up -d api clickhouse minio

echo "[run] waiting for the API to be healthy..."
for i in $(seq 1 120); do
  if curl -s -o /dev/null -w "%{http_code}" "${API_BASE}/docs" | grep -q "200"; then
    echo "[run] API is up (${i}s)"
    break
  fi
  if [[ $i -eq 120 ]]; then
    echo "[run] error: API not healthy after 120s" >&2
    $COMPOSE logs api | tail -30
    exit 1
  fi
  sleep 1
done

echo "[run] waiting for ClickHouse..."
for i in $(seq 1 60); do
  if $COMPOSE exec -T clickhouse \
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

# ── 2. seed (metadata-only, through the real API) ───────────────────────────
echo ""
echo "[run] seeding ${CREATORS} creators, reader follows ${FOLLOW}..."
python3 seed.py \
  --creators "$CREATORS" \
  --follow "$FOLLOW" \
  --posts-per-creator "$POSTS_PER_CREATOR" \
  --seed "$SEED" \
  --api "$API_BASE" \
  --out "$MANIFEST"

# ── 3. bench (the matrix) ────────────────────────────────────────────────────
echo ""
echo "[run] running the bench across the matrix..."
python3 bench.py \
  --manifest "$MANIFEST" \
  --k $K_VALUES \
  --feeds $FEEDS \
  --modes $MODES \
  --lines $LINES \
  --runs "$RUNS" \
  --api "$API_BASE" \
  --compose "$COMPOSE" \
  --out "$RESULTS_DIR"

# ── 4. collect system info (the hardware spec for the paper) ────────────────
echo ""
echo "[run] collecting system info..."
{
  echo "hostname: $(hostname)"
  echo "cpu: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs 2>/dev/null || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown)"
  echo "cpus: $(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  echo "ram: $(free -h 2>/dev/null | awk '/^Mem:/ {print $2}' || sysctl -n hw.memsize | awk '{print $1/1073741824 " GB"}')"
  echo "os: $(grep PRETTY /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '\"' || uname -a)"
  echo "docker: $(docker --version 2>/dev/null | awk '{print $3}' | tr -d , || echo unknown)"
} > "${RESULTS_DIR}/system-info.txt"
cat "${RESULTS_DIR}/system-info.txt"

# ── 5. teardown (ONLY this project + its volumes) ───────────────────────────
echo ""
echo "[run] tearing down ${COMPOSE_PROJECT}..."
$COMPOSE down -v --remove-orphans || true

echo ""
echo "============================================"
echo " done. results in ${RESULTS_DIR}/"
echo "============================================"
ls -la "${RESULTS_DIR}/"
echo ""
echo "next: copy ${RESULTS_DIR}/ off the box BEFORE destroying it,"
echo "then destroy the droplet (../teardown.sh or the DO scripts)."
