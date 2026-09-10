#!/usr/bin/env bash
# Run all e2e shards CONCURRENTLY inside a single CI job. A self-hosted GitHub
# runner (this box) runs ONE job at a time, so a 4-leg matrix would serialize.
# Instead, one job launches all 4 shards as background processes — each boots
# its own stack (own ports/project/network) and runs its spec slice — and waits
# on all of them. The box's 8 cores feed all 4 stacks + their browser workers.
#
# Each shard's output is streamed to the CI log in real time with a [shardN]
# prefix (so you can watch tests pass/fail live) AND kept in a per-shard log
# file for the failure dump.
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
  # Stream this shard's output to the CI log (stdout) with a [shardN] prefix,
  # and keep a copy in the per-shard log file. The subshell's exit status is
  # the shard's (PIPESTATUS[0]), which `wait` below captures.
  (
    bash run-shard.sh "$s" 2>&1 | sed -u "s/^/[shard$s] /" | tee "$LOG_DIR/shard-$s.log"
    exit "${PIPESTATUS[0]}"
  ) &
  PIDS[$s]=$!
  echo "  [shard$s] launched (pid ${PIDS[$s]})"
done

echo "=== running — watching all shards (Ctrl-C safe: teardown is in the workflow) ==="
for s in "${SHARDS[@]}"; do
  if wait "${PIDS[$s]}"; then
    echo "  ✓ [shard$s] PASSED"
  else
    rc=$?
    echo "  ✗ [shard$s] FAILED (exit $rc)"
    FAILED=1
  fi
done

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "✗ one or more shards failed — per-shard logs in $LOG_DIR"
  exit 1
fi
echo "✓ all shards passed"
