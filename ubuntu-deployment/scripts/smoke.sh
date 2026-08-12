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

# v3 POST check — all v3 endpoints are POST-only
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

  # v3 smoke — full auth flow: signup → login → use token
  echo "  -- v3 --"
  APISRV="https://api.${pre}web10.app"
  PROVIDER="api.${pre}web10.app"
  U="smoke$(date +%s%N)"
  P="smoketest123"

  # Sign up
  SU=$(curl -s --max-time 15 -X POST "$APISRV/v3/auth/signup" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$U\",\"password\":\"$P\"}")
  SU_CODE=$(echo "$SU" | grep -o '"status":"ok"' || echo "")
  if [[ -n "$SU_CODE" ]]; then
    echo "  ok   v3 signup"
  else
    echo "  FAIL v3 signup ($SU)"; fail=1
  fi

  # Login — get token
  LOGIN=$(curl -s --max-time 15 -X POST "$APISRV/v3/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$U\",\"password\":\"$P\"}")
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
  if [[ -n "$TOKEN" ]]; then
    echo "  ok   v3 login (got token)"
  else
    echo "  FAIL v3 login ($LOGIN)"; fail=1
  fi

  # Authenticated v3 endpoints (all require token)
  if [[ -n "$TOKEN" ]]; then
    check_post "v3 stats"              200 "$APISRV/v3/stats" "{\"token\":\"$TOKEN\"}"
    check_post "v3 profile"            200 "$APISRV/v3/account/profile" "{\"token\":\"$TOKEN\"}"
    check_post "v3 documents read"     200 "$APISRV/v3/documents/read" "{\"token\":\"$TOKEN\",\"service\":\"web10\"}"
    check_post "v3 groups list"        200 "$APISRV/v3/groups/list" "{\"token\":\"$TOKEN\"}"
    check_post "v3 appstore list"      200 "$APISRV/v3/apps/list" "{\"token\":\"$TOKEN\"}"
    check_post "v3 contracts list"     200 "$APISRV/v3/app-contracts/list" "{\"token\":\"$TOKEN\"}"
    check_post "v3 media list"         200 "$APISRV/v3/media/list" "{\"token\":\"$TOKEN\",\"limit\":1,\"offset\":0}"
  fi
done

exit $fail