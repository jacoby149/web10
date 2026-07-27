#!/bin/bash
# install_cron.sh — one-command cron install for night_owl
# Usage: bash install_cron.sh [--uninstall]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NIGHT_OWL="$SCRIPT_DIR/night_owl.py"
LOG="$SCRIPT_DIR/night_owl.log"

if [[ "${1:-}" == "--uninstall" ]]; then
    crontab -l 2>/dev/null | grep -v "night_owl.py" | crontab - || true
    echo "night_owl: cron entry removed"
    exit 0
fi

# Check prerequisites
if ! command -v python3 &>/dev/null; then
    echo "night_owl: python3 not found" >&2
    exit 1
fi

if ! command -v screencapture &>/dev/null; then
    echo "night_owl: screencapture not found (macOS only)" >&2
    exit 1
fi

if ! command -v curl &>/dev/null; then
    echo "night_owl: curl not found" >&2
    exit 1
fi

# Verify VISION_API_KEY is set
if [[ -z "${VISION_API_KEY:-}" ]]; then
    echo "night_owl: VISION_API_KEY not set. Export it first:" >&2
    echo "  export VISION_API_KEY=sk-ant-..." >&2
    echo "  bash install_cron.sh" >&2
    exit 1
fi

# Build the cron entry (every 40 minutes)
CRON_LINE="*/40 * * * * cd $SCRIPT_DIR && python3 $NIGHT_OWL >> $LOG 2>&1"

# Install (preserve existing crontab entries)
CURRENT=$(crontab -l 2>/dev/null || true)
if echo "$CURRENT" | grep -q "night_owl.py"; then
    echo "night_owl: cron entry already installed, updating..."
    echo "$CURRENT" | grep -v "night_owl.py" | crontab -
fi

echo "$CURRENT" | grep -v "night_owl.py" > /tmp/night_owl_cron.tmp || true
echo "$CRON_LINE" >> /tmp/night_owl_cron.tmp
crontab /tmp/night_owl_cron.tmp
rm /tmp/night_owl_cron.tmp

echo "night_owl: cron installed — every 40 minutes"
echo "  log: $LOG"
echo "  manual cycle: python3 $NIGHT_OWL --once"
echo "  uninstall: bash $0 --uninstall"
