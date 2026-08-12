#!/bin/bash
# clickhouse-migrate.sh — idempotently apply ClickHouse schema to a running container.
#
# ClickHouse init scripts only run on first startup (empty data dir).
# For existing stacks, this creates any missing tables.
# Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
#
# Usage:
#   scripts/clickhouse-migrate.sh web10-dev-clickhouse-1
#   scripts/clickhouse-migrate.sh web10-prod-clickhouse-1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INIT_SQL="${SCRIPT_DIR}/../../clickhouse-init/001-init-v3-schema.sql"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <container-name>"
  echo "  e.g. $0 web10-dev-clickhouse-1"
  exit 1
fi

CONTAINER="$1"

echo "Running ClickHouse migration against ${CONTAINER}..."

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "ERROR: Container ${CONTAINER} is not running."
  exit 1
fi

echo "Applying schema (CREATE TABLE IF NOT EXISTS — idempotent)..."
docker exec -i "$CONTAINER" clickhouse-client --database web10 < "$INIT_SQL"

echo "Verifying tables..."
for table in documents doc_groups group_contracts group_members group_join_requests \
             group_hidden_docs service_contracts user_blacklist group_blacklist \
             user_group_sharing provider_service_contracts app_contracts users \
             apps app_ratings bug_reports; do
  EXISTS=$(docker exec -i "$CONTAINER" clickhouse-client --database web10 --query "EXISTS TABLE ${table}")
  if [ "$EXISTS" = "1" ]; then
    echo "  ✓ ${table}"
  else
    echo "  ✗ ${table} MISSING"
  fi
done

echo "Done."