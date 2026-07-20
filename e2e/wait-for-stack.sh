#!/usr/bin/env bash
# Wait for the e2e stack to be healthy before running Playwright.
# Usage: ./wait-for-stack.sh

set -euo pipefail

TIMEOUT=${TIMEOUT:-120}
INTERVAL=2
ELAPSED=0

echo "⏳ Waiting for e2e stack to be healthy..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  ALL_UP=true

  # Check API
  if ! curl -sf http://api.localhost/ready > /dev/null 2>&1; then
    ALL_UP=false
  fi

  # Check auth UI
  if ! curl -sf http://auth.localhost > /dev/null 2>&1; then
    ALL_UP=false
  fi

  # Check marketing UI
  if ! curl -sf http://marketing.localhost > /dev/null 2>&1; then
    ALL_UP=false
  fi

  # Check social UI
  if ! curl -sf http://social.localhost > /dev/null 2>&1; then
    ALL_UP=false
  fi

  # Check marketing-api
  if ! curl -sf http://marketing-api.localhost/health > /dev/null 2>&1; then
    ALL_UP=false
  fi

  if [ "$ALL_UP" = true ]; then
    echo "✓ All services are healthy after ${ELAPSED}s"
    exit 0
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  printf "\r⏳ Elapsed: %ds / %ds..." "$ELAPSED" "$TIMEOUT"
done

echo ""
echo "✗ Timeout waiting for stack after ${TIMEOUT}s"
exit 1