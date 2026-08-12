#!/bin/bash
set -e
# Resilient ClickHouse init — retries until the server accepts connections.
# ClickHouse entrypoint runs .sh scripts in docker-entrypoint-initdb.d
# before the server is fully ready, so we must handle the race ourselves.

SQL_FILE="/docker-entrypoint-initdb.d/001-init-v3-schema.sql.template"
DB="${CLICKHOUSE_DB:-web10}"
USER="${CLICKHOUSE_USER:-web10}"
PASS="${CLICKHOUSE_PASSWORD:-web10}"

echo "[init] waiting for ClickHouse to accept connections..."
for attempt in $(seq 1 60); do
  if clickhouse-client --user "$USER" --password "$PASS" -q "SELECT 1" 2>/dev/null; then
    echo "[init] ClickHouse ready (attempt $attempt)"
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "[init] FATAL: ClickHouse did not respond after 60 attempts" >&2
    exit 1
  fi
  sleep 1
done

echo "[init] applying schema from $SQL_FILE ..."
clickhouse-client --user "$USER" --password "$PASS" -d "$DB" -q "$(cat "$SQL_FILE")"
echo "[init] schema applied. Tables created:"
clickhouse-client --user "$USER" --password "$PASS" -d "$DB" -q "SHOW TABLES"