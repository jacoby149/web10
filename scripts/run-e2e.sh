#!/bin/bash
set -e

COMPOSE="docker compose -f e2e/docker-compose.yml"
NETWORK="e2e_e2e-net"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.61.1-noble"

echo "⏳ Building & starting e2e stack..."
$COMPOSE up --build -d

echo "⏳ Waiting for stack health..."
bash e2e/wait-for-stack.sh

echo "⏳ Resolving proxy IP..."
PROXY_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$($COMPOSE ps -q proxy)")
if [ -z "$PROXY_IP" ]; then
  echo "✗ Could not resolve proxy IP"
  $COMPOSE down -v
  exit 1
fi
echo "  proxy at $PROXY_IP"

echo "⏳ Running gauntlet tests in container..."
docker run --rm \
  --network "$NETWORK" \
  --add-host api.localhost:"$PROXY_IP" \
  --add-host auth.localhost:"$PROXY_IP" \
  --add-host sdk.localhost:"$PROXY_IP" \
  --add-host marketing.localhost:"$PROXY_IP" \
  --add-host social.localhost:"$PROXY_IP" \
  --add-host marketing-api.localhost:"$PROXY_IP" \
  -v "$(pwd)/e2e":/e2e \
  -w /e2e \
  -e E2E_HTTP_PORT=80 \
  "$PLAYWRIGHT_IMAGE" \
  sh -c "npm install && npx playwright test $@"

EXIT=$?

echo "⏳ Tearing down stack..."
$COMPOSE down -v

exit $EXIT
