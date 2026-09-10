#!/usr/bin/env bash
# Run one e2e shard on a GitHub-HOSTED runner. Each matrix leg is its own
# isolated VM, so this uses DEFAULT ports (80/9000/9001) and the DEFAULT docker
# project — no port juggling, no project prefixes, no /etc/hosts hacks (the
# *.localhost vhost names resolve to 127.0.0.1 by default on the runner).
#
# Boots the shard's stack, inits its ClickHouse schema, waits for health, then
# runs the shard's slice of the specs (from shards.json).
#
# Usage: ./run-shard.sh <shard-index>      (1-based, matches shards.json order)
# Env:   E2E_SHARDS (optional) — extra specs to append (comma-separated), for
#        re-running a failed shard's specs without touching the manifest.
set -euo pipefail

SHARD="${1:?usage: run-shard.sh <1|2|3|4>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Default ports — each hosted runner is an isolated VM, so no collisions.
export E2E_HTTP_PORT=80
export E2E_MINIO_PORT=9000
export E2E_MINIO_CONSOLE_PORT=9001

# Read this shard's name + workers from the manifest.
read -r NAME WORKERS < <(python3 -c "
import json
m = json.load(open('shards.json'))
s = m['shards'][$SHARD - 1]
print(s['name'], s['workers'])
")

echo "=== shard $SHARD ($NAME) — workers=$WORKERS ==="

# Build + start this shard's stack.
docker compose -f docker-compose.yml up --build -d

# Initialize ClickHouse schema (same as the single-stack flow).
for i in $(seq 1 60); do
  if docker compose -f docker-compose.yml exec -T clickhouse \
      clickhouse-client --user default --password "" -q "SELECT 1" 2>/dev/null; then
    echo "  clickhouse ready (attempt $i)"; break
  fi
  sleep 2
done
docker compose -f docker-compose.yml exec -T clickhouse \
  clickhouse-client --user default --password "" \
  -q "CREATE USER IF NOT EXISTS web10 IDENTIFIED BY 'web10'; CREATE DATABASE IF NOT EXISTS web10; GRANT ALL ON web10.* TO web10;"
docker compose -f docker-compose.yml exec -T clickhouse \
  clickhouse-client --user web10 --password web10 --database web10 \
  < ../clickhouse-init/001-init-v3-schema.sql.template
docker compose -f docker-compose.yml exec -T clickhouse \
  clickhouse-client --user web10 --password web10 --database web10 \
  < ../clickhouse-init/002-logs-table.sql.template

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
