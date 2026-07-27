#!/usr/bin/env bash
# ci-failures.sh <pr-number> — print the error lines of every failing CI job on a PR.
#
# Why this exists: `gh run view --log` frequently shows the wrong job's output
# (or a truncated one), and agents were burning context on log archaeology —
# or worse, GUESSING at the failure cause. This is the one command that always
# lands on the real error lines:
#
#   scripts/ci-failures.sh 325
#
# Never claim a CI failure is "pre-existing" without also running the same
# command on origin/dev locally and quoting its output.
set -euo pipefail

pr="${1:?usage: ci-failures.sh <pr-number>}"

failures=$(gh pr checks "$pr" --json name,bucket,link \
  --jq '.[] | select(.bucket=="fail") | [.name,.link] | @tsv')

if [[ -z "$failures" ]]; then
  echo "no failing checks on PR #$pr"
  exit 0
fi

while IFS=$'\t' read -r name link; do
  job_id="${link##*/}"
  echo "=== FAILING: $name (job $job_id) ==="
  gh api "repos/{owner}/{repo}/actions/jobs/$job_id/logs" \
    | grep -iE "error|failed|##\[error\]" \
    | grep -vE "DeprecationWarning|trace-deprecation" \
    | head -40
  echo
done <<< "$failures"
