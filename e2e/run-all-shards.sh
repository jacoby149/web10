#!/usr/bin/env bash
# Run all e2e shards CONCURRENTLY inside a single CI job. A self-hosted GitHub
# runner (this box) runs ONE job at a time, so a 4-leg matrix would serialize.
# Instead, one job launches all 4 shards as background processes — each boots
# its own stack (own ports/project/network) and runs its spec slice — and waits
# on all of them. The box's 8 cores feed all 4 stacks + their browser workers.
#
# Usage: ./run-all-shards.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

SHARDS=(1 2 3 4)
LOG_DIR="$(mktemp -d /tmp/e2e-shards.XXXXXX)"
PIDS=()
FAILED=0

echo "=== launching ${#SHARDS[@]} shards concurrently (logs: $LOG_DIR) ==="
for s in "${SHARDS[@]}"; do
  bash run-shard.sh "$s" > "$LOG_DIR/shard-$s.log" 2>&1 &
  PIDS[$s]=$!
  echo "  shard $s -> pid ${PIDS[$s]} (log: $LOG_DIR/shard-$s.log)"
done

echo "=== waiting for all shards to finish ==="
for s in "${SHARDS[@]}"; do
  if wait "${PIDS[$s]}"; then
    echo "  ✓ shard $s passed"
  else
    rc=$?
    echo "  ✗ shard $s FAILED (exit $rc)"
    FAILED=1
  fi
done

echo ""
echo "=== shard results ==="
for s in "${SHARDS[@]}"; do
  echo "--- shard $s (tail) ---"
  tail -15 "$LOG_DIR/shard-$s.log"
  echo ""
done

if [ "$FAILED" -ne 0 ]; then
  echo "✗ one or more shards failed — full logs in $LOG_DIR"
  exit 1
fi
echo "✓ all shards passed"
