#!/usr/bin/env bash
# Run one e2e shard: boot its own stack (own ports, own docker project, own
# ClickHouse/API/UIs) and run its slice of the specs. The 4 shards run in
# parallel on the box, each isolated on its own docker network — the nginx
# proxy only routes to same-network containers, so identical *.localhost vhost
# labels don't cross-route (verified on the box).
#
# Usage: ./run-shard.sh <shard-index>      (1-based, matches shards.json order)
# Env:   E2E_SHARDS (optional) — extra specs to append (comma-separated), for
#        re-running a failed shard's specs without touching the manifest.
set -euo pipefail

SHARD="${1:?usage: run-shard.sh <1|2|3|4>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Port scheme: shard N -> HTTP 80(90+(N-1)*100), MINIO 9(100+(N-1)*100).
HTTP_PORT=$(( 8090 + (SHARD - 1) * 100 ))
MINIO_PORT=$(( 9100 + (SHARD - 1) * 100 ))
MINIO_CONSOLE_PORT=$(( MINIO_PORT + 1 ))
PROJECT="e2e-s${SHARD}"

# Read this shard's name + workers from the manifest.
read -r NAME WORKERS < <(python3 -c "
import json
m = json.load(open('shards.json'))
s = m['shards'][$SHARD - 1]
print(s['name'], s['workers'])
")

export E2E_HTTP_PORT="$HTTP_PORT"
export E2E_MINIO_PORT="$MINIO_PORT"
export E2E_MINIO_CONSOLE_PORT="$MINIO_CONSOLE_PORT"

echo "=== shard $SHARD ($NAME) — project=$PROJECT http=$HTTP_PORT minio=$MINIO_PORT workers=$WORKERS ==="

# Start THIS shard's stack from the pre-built images (the CI `build` job — or a
# local `docker compose -f docker-compose.yml build` — already built them).
docker compose -p "$PROJECT" -f docker-compose.yml up -d

# Initialize ClickHouse schema (same as the single-stack flow).
for i in $(seq 1 60); do
  if docker compose -p "$PROJECT" -f docker-compose.yml exec -T clickhouse \
      clickhouse-client --user default --password "" -q "SELECT 1" 2>/dev/null; then
    echo "  clickhouse ready (attempt $i)"; break
  fi
  sleep 2
done
docker compose -p "$PROJECT" -f docker-compose.yml exec -T clickhouse \
  clickhouse-client --user default --password "" \
  -q "CREATE USER IF NOT EXISTS web10 IDENTIFIED BY 'web10'; CREATE DATABASE IF NOT EXISTS web10; GRANT ALL ON web10.* TO web10;"
docker compose -p "$PROJECT" -f docker-compose.yml exec -T clickhouse \
  clickhouse-client --user web10 --password web10 --database web10 \
  < clickhouse-init/001-init-v3-schema.sql.template
docker compose -p "$PROJECT" -f docker-compose.yml exec -T clickhouse \
  clickhouse-client --user web10 --password web10 --database web10 \
  < clickhouse-init/002-logs-table.sql.template

# Wait for stack health.
TIMEOUT=300 bash wait-for-stack.sh

# Build the spec list for this shard.
mapfile -t SPECS < <(python3 -c "
import json
m = json.load(open('shards.json'))
print('\n'.join(m['shards'][$SHARD - 1]['specs']))
")
# Optional extra specs (re-run a failed shard's specs without editing the manifest).
if [ -n "${E2E_SHARDS:-}" ]; then
  IFS=',' read -r -a EXTRA <<< "$E2E_SHARDS"
  SPECS+=("${EXTRA[@]}")
fi

echo "=== running ${#SPECS[@]} specs with $WORKERS workers ==="
npx playwright test \
  --workers "$WORKERS" \
  "${SPECS[@]/#tests/}"
