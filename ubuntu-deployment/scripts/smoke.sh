#!/usr/bin/env bash
# End-to-end smoke test for both environments. Run on the box (dev
# vhosts only resolve to the LAN IP, so only the box / a VPN client
# reaches them). Exits non-zero if any check fails.
#
#   bash ubuntu-deployment/scripts/smoke.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

fail=0
check() {  # check <label> <expected-code> <url>
  code=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 12 "$3" || echo 000)
  if [[ "$code" == "$2" ]]; then echo "  ok   $1 ($code)"; else echo "  FAIL $1 (got $code, want $2) $3"; fail=1; fi
}

for env in dev prod; do
  if [[ "$env" == dev ]]; then pre=dev.; apex=dev.web10.app; else pre=; apex=web10.app; fi
  echo "== $env =="
  check "api docs"     200 "https://api.${pre}web10.app/docs"
  check "api root"     200 "https://api.${pre}web10.app/"
  check "auth ui"      200 "https://auth.${pre}web10.app/"
  check "social"       200 "https://social.${pre}web10.app/"
  check "marketing"    200 "https://www.${pre}web10.app/"
  check "apex marketing" 200 "https://$apex/"
  check "marketing-api" 200 "https://marketing-api.${pre}web10.app/docs"
done

# money path on prod: signup a throwaway user, then get a token
echo "== prod money path =="
U="smoke$(date +%s)"
su=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST https://api.web10.app/signup \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"testpass123\",\"provider\":\"api.web10.app\"}")
[[ "$su" == 200 ]] && echo "  ok   signup ($su)" || { echo "  FAIL signup ($su)"; fail=1; }
tk=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST https://api.web10.app/web10token \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"testpass123\",\"provider\":\"api.web10.app\"}")
[[ "$tk" == 200 ]] && echo "  ok   token ($tk)" || { echo "  FAIL token ($tk)"; fail=1; }

exit $fail
