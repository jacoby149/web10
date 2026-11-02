#!/usr/bin/env bash
# Disposable host only. Dependencies and Chromium must already be installed.
set -euo pipefail
umask 077

die() { printf 'interoperability-demo: %s\n' "$*" >&2; exit 1; }
[[ ${WEB10_DISPOSABLE:-} == interoperability-demo ]] || die 'set WEB10_DISPOSABLE=interoperability-demo on a disposable host'
[[ $(uname -s) == Linux ]] || die 'Linux is required'
for tool in docker node git curl sha256sum flock; do
  command -v "$tool" >/dev/null || die "missing prerequisite: $tool (nothing will be installed)"
done
for variable in DOCKER_HOST DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_API_VERSION; do
  [[ ${!variable+x} != x ]] || die "$variable must be unset"
done
[[ -S /var/run/docker.sock ]] || die 'local /var/run/docker.sock is required'
context=$(docker context show)
endpoint=$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')
[[ $endpoint == unix:///var/run/docker.sock ]] || die 'Docker context must use unix:///var/run/docker.sock'

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
ROOT=$(cd -- "$HERE/../.." && pwd -P)
E2E="$ROOT/e2e"
BASE="$E2E/docker-compose.yml"
OVERRIDE="$HERE/compose.override.yml"
CONFIG="$HERE/playwright.config.ts"
CLI="$E2E/node_modules/playwright/cli.js"
[[ -f $CLI && -f $CONFIG && -f $OVERRIDE ]] || die 'demo config, loopback override and existing E2E Playwright installation are required'

# Paper receipts always mean the full, serial desktop/mobile/API matrix.
[[ $# == 0 ]] || die 'no options accepted; use Playwright directly for diagnostic partial runs'

# A host-wide lock prevents two checkouts from tearing down the same project.
exec 9>/var/lock/web10-interop.lock
flock -n 9 || die 'another web10-interop run holds the host lock'

# Empty interpolation environment prevents .env, COMPOSE_* and service secrets
# from redirecting this fixed, local stack. Docker's existing registry login is
# still available through HOME; no authentication/provisioning is performed.
docker_local() {
  env -i PATH="$PATH" HOME="$HOME" docker --host unix:///var/run/docker.sock "$@"
}
compose() {
  docker_local compose --project-name web10-interop --project-directory "$E2E" \
    --env-file /dev/null -f "$BASE" -f "$OVERRIDE" "$@"
}

running=$(docker_local ps -q)
for id in $running; do
  owner=$(docker_local inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
  [[ $owner == web10-interop ]] || die 'unrelated running containers found; use a free disposable host'
done

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN="$ROOT/.context/interoperability-demo/run-$RUN_ID"
mkdir -p "$RUN/screenshots" "$RUN/test-results"
printf 'Evidence: %s\n' "$RUN"
started=false
finish() {
  local status=$? diagnostic_status=0 cleanup_status=0 ids id
  trap - EXIT INT TERM
  set +e
  if [[ $started == true ]]; then
    # Never dump inspect JSON, environment, health output or API logs: those
    # can contain tokens. These fields are deliberately an allowlist.
    ids=$(docker_local ps -aq --filter label=com.docker.compose.project=web10-interop)
    diagnostic_status=$?
    for id in $ids; do
      docker_local inspect --format \
        '{{.Id}} service={{index .Config.Labels "com.docker.compose.service"}} image={{.Image}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} ports={{json .NetworkSettings.Ports}}' \
        "$id" >> "$RUN/containers.txt" || diagnostic_status=1
      image=$(docker_local inspect --format '{{.Image}}' "$id")
      docker_local image inspect --format '{{.Id}} digests={{json .RepoDigests}} created={{.Created}}' \
        "$image" >> "$RUN/images.txt" || diagnostic_status=1
    done
    compose down --volumes --remove-orphans >/dev/null 2>&1
    cleanup_status=$?
    remaining=$(docker_local ps -aq --filter label=com.docker.compose.project=web10-interop)
    [[ $? == 0 && -z $remaining ]] || cleanup_status=1
  fi
  [[ $status != 0 || $diagnostic_status == 0 && $cleanup_status == 0 ]] || status=1
  printf 'exit=%s diagnostics=%s cleanup=%s finished=%s\n' \
    "$status" "$diagnostic_status" "$cleanup_status" "$(date -u +%FT%TZ)" > "$RUN/status.txt"
  printf 'Evidence retained: %s (exit %s)\n' "$RUN" "$status"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

{
  printf 'run=%s\nstarted=%s\nproject=web10-interop\n' "$RUN_ID" "$(date -u +%FT%TZ)"
  printf 'revision='; git -C "$ROOT" rev-parse HEAD
  printf 'tracked_diff_sha256='
  git -C "$ROOT" diff --binary HEAD -- . | sha256sum
  printf 'untracked_file_hashes (excluding dependencies and evidence):\n'
  while IFS= read -r -d '' file; do
    case "$file" in .context/*|node_modules/*|*/node_modules/*) continue ;; esac
    [[ -f $ROOT/$file ]] || continue
    sha256sum "$ROOT/$file"
  done < <(git -C "$ROOT" ls-files --others --exclude-standard -z)
  printf 'kernel='; uname -srmo
  printf 'logical_cpus='; getconf _NPROCESSORS_ONLN
  printf 'memory (bytes):\n'; free -b
  printf 'node='; node --version
  printf 'playwright='; node "$CLI" --version
  node --input-type=module - "$E2E/node_modules/playwright/index.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(pathToFileURL(process.argv[2]));
console.log(`chromium=${execFileSync(chromium.executablePath(), ['--version'], { encoding: 'utf8' }).trim()}`);
NODE
  docker_local version --format 'docker_client={{.Client.Version}} docker_server={{.Server.Version}}'
  docker_local compose version
  printf 'source_config_hashes:\n'
  sha256sum "$BASE" "$OVERRIDE" "$CONFIG" "$HERE/run.sh" \
    "$HERE/interop.spec.ts" "$HERE/helpers.ts" "$HERE/http.spec.mjs" \
    "$ROOT/research/experiments/social/interop.mjs" \
    "$ROOT/marketing/marketing-ui/public/docs/marketplace/script.js" \
    "$ROOT/marketing/marketing-ui/public/docs/interop/style.css" \
    "$E2E/package-lock.json" "$E2E/wait-for-stack.sh" \
    "$ROOT/clickhouse-init/001-init-v3-schema.sql.template" \
    "$ROOT/clickhouse-init/002-logs-table.sql.template"
  printf 'resolved_compose_sha256='
  compose config | sha256sum
} > "$RUN/provenance.txt"
git -C "$ROOT" diff --binary HEAD -- . ':!.context' > "$RUN/source.patch"
tar -czf "$RUN/source-overlay.tar.gz" -C "$ROOT" \
  research/interoperability-demo/{run.sh,compose.override.yml,playwright.config.ts,interop.spec.ts,helpers.ts,http.spec.mjs,marketplace.test.mjs} \
  e2e/playwright.ts e2e/tests/interop-demos.spec.ts \
  marketing/marketing-ui/public/docs/marketplace/script.js \
  marketing/marketing-ui/public/docs/interop/style.css

# Always begin fresh, even if a previous interrupted run left this project up.
started=true
compose down --volumes --remove-orphans
# The API's boot-time schema pass must not race the initial table creation.
compose up -d clickhouse minio
ready=false
for ((attempt=1; attempt<=60; attempt++)); do
  if compose exec -T clickhouse clickhouse-client --user default --password '' \
      -q 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
[[ $ready == true ]] || die 'ClickHouse readiness timed out'
compose exec -T clickhouse clickhouse-client --multiquery --user default --password '' \
  -q "CREATE USER IF NOT EXISTS web10 IDENTIFIED BY 'web10'; CREATE DATABASE IF NOT EXISTS web10; GRANT ALL ON web10.* TO web10;"
for template in 001-init-v3-schema 002-logs-table; do
  compose exec -T clickhouse clickhouse-client --multiquery --user web10 --password web10 --database web10 \
    < "$ROOT/clickhouse-init/$template.sql.template"
done
compose up --build -d
compose exec -T clickhouse clickhouse-client --user web10 --password web10 --database web10 \
  -q 'SELECT version()' > "$RUN/clickhouse-version.txt"
(
  cd "$E2E"
  env -i PATH="$PATH" HOME="$HOME" TIMEOUT=300 E2E_HTTP_PORT=80 \
    COMPOSE_PROJECT_NAME=web10-interop COMPOSE_FILE="$BASE:$OVERRIDE" \
    NO_PROXY='*' no_proxy='*' bash ./wait-for-stack.sh
) 2>&1 | tee "$RUN/readiness.log"

(
  cd "$HERE"
  env -i PATH="$PATH" HOME="$HOME" CI=1 E2E_HTTP_PORT=80 \
    INTEROP_SHOT_DIR="$RUN/screenshots" \
    PLAYWRIGHT_JSON_OUTPUT_FILE="$RUN/results.json" \
    NO_PROXY='*' no_proxy='*' \
    node "$CLI" test --config "$CONFIG" "$@" \
      --output "$RUN/test-results" --trace off --reporter=list,json
) 2>&1 | tee "$RUN/playwright.log"

# Playwright can exit zero when everything is skipped. That is not evidence.
node --input-type=module - "$RUN/results.json" <<'NODE'
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (report.stats.expected !== 3 || report.stats.unexpected || report.stats.skipped || report.stats.flaky) {
  throw new Error('Demo incomplete: require all three matrix cases, no skipped, flaky or failed tests');
}
NODE
for viewport in desktop mobile; do
  for shot in 01-social-profile 02-snake-consent 03-snake-joined-profile 04-snake-revoked \
    05-marketplace-consent 06-marketplace-joined-profile paper-snake-identity paper-marketplace-identity; do
    [[ -s "$RUN/screenshots/$viewport/$shot.png" ]] || die "missing screenshot: $viewport/$shot"
  done
done
