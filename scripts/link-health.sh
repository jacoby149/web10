#!/usr/bin/env bash
# link-health.sh — checks that every /import step-1 export URL is live
# and still serves export-related content (not a generic help home).
# Reads marketing/marketing-ui/src/lib/export-links.json (one source of truth).
# Exits 0 if all links pass, 1 if any fail.
# On failure, prints a summary suitable for a GitHub issue body.
#
# Bot-blocking note: some platforms block curl/bots with 400/403 even with
# a browser UA. If a link has "botBlocked": true in export-links.json,
# any non-200 status is treated as acceptable (real users reach the page).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LINKS_FILE="$REPO_ROOT/marketing/marketing-ui/src/lib/export-links.json"

if [ ! -f "$LINKS_FILE" ]; then
  echo "ERROR: export-links.json not found at $LINKS_FILE"
  exit 1
fi

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

FAIL_COUNT=0
PASS_COUNT=0
FAIL_LINES=""

while IFS= read -r line; do
  platform=$(echo "$line" | jq -r '.platform')
  label=$(echo "$line" | jq -r '.label')
  url=$(echo "$line" | jq -r '.url')
  bot_blocked=$(echo "$line" | jq -r '.botBlocked // false')

  # Fetch the page (follow redirects, timeout 15s)
  http_code=$(curl -s -o /tmp/link-health-body -w '%{http_code}' -L --max-time 15 -A "$UA" "$url" 2>/dev/null || echo "000")

  # If the platform is known to block bots, we only check that the URL responds
  # (any non-error code). Skip content sniffing — the page loads via JS or requires auth.
  if [ "$bot_blocked" = "true" ]; then
    if [ "$http_code" = "000" ]; then
      FAIL_COUNT=$((FAIL_COUNT + 1))
      FAIL_LINES="${FAIL_LINES}  ✗ $label ($platform): fetch failed (timeout/network) — $url
"
      continue
    fi
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "  ✓ $label ($platform): bot-blocked HTTP $http_code (acceptable) — $url"
    continue
  fi

  if [ "$http_code" != "200" ]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAIL_LINES="${FAIL_LINES}  ✗ $label ($platform): HTTP $http_code — $url
"
    continue
  fi

  # Content sniff: at least one expected substring must appear (case-insensitive)
  body_lower=$(tr '[:upper:]' '[:lower:]' < /tmp/link-health-body 2>/dev/null || echo "")
  matched=false
  while IFS= read -r term; do
    term_lower=$(echo "$term" | tr '[:upper:]' '[:lower:]')
    if echo "$body_lower" | grep -q -- "$term_lower" 2>/dev/null; then
      matched=true
      break
    fi
  done < <(echo "$line" | jq -r '.expectedContent[]')

  if [ "$matched" != "true" ]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
    expected_str=$(echo "$line" | jq -r '.expectedContent | join(", ")')
    FAIL_LINES="${FAIL_LINES}  ✗ $label ($platform): content sniff failed — none of [$expected_str] found on $url
"
    continue
  fi

  PASS_COUNT=$((PASS_COUNT + 1))
  echo "  ✓ $label ($platform): OK — $url"
done < <(jq -c '.links[]' "$LINKS_FILE")

total=$((PASS_COUNT + FAIL_COUNT))

echo ""
echo "=== Link Health Report ==="
echo "Checked: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Result: $PASS_COUNT/$total links healthy"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "FAILED:"
  echo "$FAIL_LINES"
  echo "=== FAILURE DETAILS ==="
  echo "$FAIL_LINES"
  exit 1
fi

echo "All $total export links are healthy."
exit 0