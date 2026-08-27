#!/bin/bash
set -e
SQL_FILE="/docker-entrypoint-initdb.d/002-logs-table.sql.template"
DB="${CLICKHOUSE_DB:-web10}"
USER="${CLICKHOUSE_USER:-web10}"
PASS="${CLICKHOUSE_PASSWORD:-web10}"

echo "[init] applying logs table from $SQL_FILE ..."
clickhouse-client --user "$USER" --password "$PASS" -d "$DB" -n < "$SQL_FILE"
echo "[init] logs table ready."
