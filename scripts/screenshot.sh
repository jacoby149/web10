#!/usr/bin/env bash
# screenshot.sh — one-command screenshots for PR evidence and the
# multimodal "LOOK at the screenshots" acceptance bar.
#
# Usage:
#   scripts/screenshot.sh <url> <out.png> [options]
#
# Options:
#   --width N        viewport width  (default 1280)
#   --height N       viewport height (default 800)
#   --mobile         shorthand for --width 375 --height 812
#   --full-page      capture the full scrollable page
#   --wait MS        extra wait after load (default 1500 — lets SPAs render)
#
# Examples:
#   scripts/screenshot.sh http://localhost:5173/docs /tmp/docs-desktop.png --full-page
#   scripts/screenshot.sh http://localhost:5173/docs /tmp/docs-mobile.png --mobile --full-page
#
# Uses the playwright CLI via npx (no repo dependency added). The first
# run downloads the Chromium build into the shared playwright cache
# (~/Library/Caches/ms-playwright) if missing — subsequent runs are fast.
set -euo pipefail

URL="${1:-}"
OUT="${2:-}"
if [[ -z "$URL" || -z "$OUT" ]]; then
  sed -n '2,20p' "$0"
  exit 1
fi
shift 2

WIDTH=1280
HEIGHT=800
FULL_PAGE=0
WAIT=1500
while [[ $# -gt 0 ]]; do
  case "$1" in
    --width) WIDTH="$2"; shift 2 ;;
    --height) HEIGHT="$2"; shift 2 ;;
    --mobile) WIDTH=375; HEIGHT=812; shift ;;
    --full-page) FULL_PAGE=1; shift ;;
    --wait) WAIT="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

ARGS=(screenshot --viewport-size "$WIDTH, $HEIGHT" --wait-for-timeout "$WAIT")
[[ "$FULL_PAGE" == 1 ]] && ARGS+=(--full-page)

mkdir -p "$(dirname "$OUT")"
npx -y playwright "${ARGS[@]}" "$URL" "$OUT"
echo "screenshot: $OUT (${WIDTH}x${HEIGHT})"
