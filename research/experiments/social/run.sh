#!/usr/bin/env bash
# Run from the repo root. Dependencies are explicit operator setup, never installed here:
# npm ci --prefix e2e
# (from e2e/) node node_modules/@playwright/test/cli.js install --with-deps chromium
set -euo pipefail
exec python3 "$(dirname "${BASH_SOURCE[0]}")/collector.py"
