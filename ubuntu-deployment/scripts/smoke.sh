#!/usr/bin/env bash
# End-to-end smoke test for both environments. Run on the box (dev
# vhosts only resolve to the LAN IP, so only the box / a VPN client
# reaches them). Exits non-zero if any check fails.
#
#   bash ubuntu-deployment/scripts/smoke.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

fail=0
check() {  # check <label> <expected-code> <url> — retries while services boot
  # `compose up -d` returns when containers START, but gunicorn workers take
  # ~5-10s and the api has no Docker healthcheck the stabilize loop could
  # wait on — both 23.07 deploys went red on that race. Retry up to 30s.
  local tries=6 code
  for ((i = 1; i <= tries; i++)); do
    code=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 12 "$3" || echo 000)
    if [[ "$code" == "$2" ]]; then echo "  ok   $1 ($code)"; return; fi
    (( i < tries )) && sleep 5
  done
  echo "  FAIL $1 (got $code, want $2) $3"; fail=1
}

# v3 endpoints are POST-only; check_post sends a minimal JSON body
check_post() {  # check_post <label> <expected-code> <url> <json-body>
  local tries=6 code
  for ((i = 1; i <= tries; i++)); do
    code=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 12 \
      -X POST -H 'Content-Type: application/json' -d "$4" "$3" || echo 000)
    if [[ "$code" == "$2" ]]; then echo "  ok   $1 ($code)"; return; fi
    (( i < tries )) && sleep 5
  done
  echo "  FAIL $1 (got $code, want $2) $3"; fail=1
}

for env in dev prod; do
  if [[ "$env" == dev ]]; then pre=dev.; apex=dev.web10.app; else pre=; apex=web10.app; fi
  echo "== $env =="
  check "api docs"     200 "https://api.${pre}web10.app/docs"
  check "auth ui"      200 "https://auth.${pre}web10.app/"
  check "social"       200 "https://social.${pre}web10.app/"
  check "marketing"    200 "https://www.${pre}web10.app/"
  check "apex marketing" 200 "https://$apex/"
  check "marketing-api" 200 "https://marketing-api.${pre}web10.app/docs"

  # v3 smoke — stubs for each domain (all POST, minimal bodies)
  echo "  -- v3 --"
  check_post "v3 stats"             200 "https://api.${pre}web10.app/v3/stats" "{}"
  check_post "v3 auth login"        200 "https://api.${pre}web10.app/v3/auth/login" "{\"username\":\"_\",\"password\":\"_\"}"
  check_post "v3 auth signup"       200 "https://api.${pre}web10.app/v3/auth/signup" "{\"username\":\"_\",\"password\":\"_\",\"provider\":\"_\"}"
  check_post "v3 account profile"   200 "https://api.${pre}web10.app/v3/account/profile" "{}"
  check_post "v3 documents read"    200 "https://api.${pre}web10.app/v3/documents/read" "{}"
  check_post "v3 groups list"       200 "https://api.${pre}web10.app/v3/groups/list" "{}"
  check_post "v3 appstore list"     200 "https://api.${pre}web10.app/v3/appstore/list" "{}"
  check_post "v3 contracts list"    200 "https://api.${pre}web10.app/v3/contracts/list" "{}"
  check_post "v3 media list"        200 "https://api.${pre}web10.app/v3/media/list" "{}"
  check_post "v3 blocking block"    200 "https://api.${pre}web10.app/v3/blocking/block" "{}"
done

exit $fail