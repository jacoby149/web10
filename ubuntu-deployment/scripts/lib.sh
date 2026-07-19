#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Source this; never run it.
#
# Every script here is idempotent and reads secrets ONLY from
# ubuntu-deployment/.env (gitignored). No secret is ever passed on a
# command line or written to the repo. These scripts ARE the record of
# how the box is operated — the AGENT-OPS.md procedures point at them.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # ubuntu-deployment/
ENV_FILE="$HERE/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE missing. Copy .env.example → .env and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${VM_IP:?set VM_IP in .env}"
: "${CF_ZONE:?set CF_ZONE in .env}"
PORTAINER="http://localhost:9000/api"
NPM="http://localhost:81/api"

# --- Portainer -------------------------------------------------------
portainer_jwt() {
  : "${PORTAINER_USER:?}" "${PORTAINER_PASSWORD:?}"
  curl -fsS -X POST "$PORTAINER/auth" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,os;print(json.dumps({"username":os.environ["PORTAINER_USER"],"password":os.environ["PORTAINER_PASSWORD"]}))')" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])'
}

# --- NPM -------------------------------------------------------------
npm_jwt() {
  : "${NPM_USER:?}" "${NPM_PASSWORD:?}"
  curl -fsS -X POST "$NPM/tokens" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,os;print(json.dumps({"identity":os.environ["NPM_USER"],"secret":os.environ["NPM_PASSWORD"]}))')" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'
}
