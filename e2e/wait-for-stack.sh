#!/usr/bin/env bash
# Wait for the e2e stack to be healthy before running Playwright.
# Usage: ./wait-for-stack.sh

set -euo pipefail

TIMEOUT=${TIMEOUT:-120}
INTERVAL=2
ELAPSED=0

echo "⏳ Waiting for e2e stack to be healthy..."

check_service() {
  local name="$1" url="$2"
  if curl -sf "$url" > /dev/null 2>&1; then
    echo "  ✓ $name"
    return 0
  else
    echo "  ✗ $name ($url)"
    return 1
  fi
}

while [ $ELAPSED -lt $TIMEOUT ]; do
  ALL_UP=true
  echo ""
  echo "--- health check at ${ELAPSED}s ---"

  # Check API
  if ! check_service "api" "http://api.localhost/ready"; then
    ALL_UP=false
  fi

  # Check auth UI
  if ! check_service "auth" "http://auth.localhost"; then
    ALL_UP=false
  fi

  # Check marketing UI
  if ! check_service "marketing" "http://marketing.localhost"; then
    ALL_UP=false
  fi

  # Check social UI
  if ! check_service "social" "http://social.localhost"; then
    ALL_UP=false
  fi

  # Check SDK (serves demo apps)
  if ! check_service "sdk" "http://sdk.localhost"; then
    ALL_UP=false
  fi

  # Check marketing-api
  if ! check_service "marketing-api" "http://marketing-api.localhost/v3/infra/health"; then
    ALL_UP=false
  fi

  if [ "$ALL_UP" = true ]; then
    echo "✓ All services are healthy after ${ELAPSED}s"
    exit 0
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "✗ Timeout waiting for stack after ${TIMEOUT}s"
exit 1