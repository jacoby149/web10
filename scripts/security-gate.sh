#!/usr/bin/env bash
# security-gate.sh <base-ref> — the per-PR security gate (the theory's enforcement).
#
# Why this exists: the security theory (ai-pack/ai-security-theory/) *describes* the
# method, but a described process is discretionary — a 90-file security PR with no
# repro gate and no security record row would still merge if nobody read the doc. This gate
# makes the wrong way *un-mergeable*: on any PR that touches a trust boundary, it
# fails the build unless the PR conforms to the method.
#
# A trust-boundary PR must:
#   1. Be <=500 lines of code+test (the 90-file guard — docs/security record don't count).
#   2. Update the security record (knowledge-base/security/security-record.md) — a trust-boundary
#      change with no record is a claim with no evidence.
#   3. Have a repro test (touch a test file) OR a scrutinized L3/L4 explanation
#      (a SECURITY-EXPLAINED marker) — the repro gate.
#
# Escape hatch: a SECURITY-GATE-EXEMPT marker in the PR body (with a reason) skips
# the gate — for a small, genuinely non-security fix in a trust-boundary file.
#
# Usage: scripts/security-gate.sh origin/dev
#   (CI passes the PR body via the PR_BODY env var for the exemption check.)
set -euo pipefail

base="${1:-origin/dev}"

# --- Trust-boundary paths (the crown jewels — a wrong change here breaks a
# guarantee). Adjust this list as the surface evolves. ---
trust_boundary_patterns=(
  "api/app/services/auth.py"
  "api/app/v3/services/clickhouse.py"
  "api/app/v3/services/safe_query.py"
  "api/app/v3/endpoints/"
  "api/app/middleware.py"
  "api/app/main.py"
  "api/app/settings.py"
  "api/rtc/"
  "sdk/src/"
  "ui/src/"
)

# The security record a trust-boundary change must update.
record_file="knowledge-base/security/security-record.md"

# Files that don't count toward the 500-line code budget (docs / security record / learnings).
is_doc() { [[ "$(basename "$1")" == *.md ]]; }

# Test files (the repro test lives here) — match on the basename.
is_test() {
  local b; b="$(basename "$1")"
  [[ "$b" == test_*.py || "$b" == *_test.py || "$b" == *.test.ts \
    || "$b" == *.test.tsx || "$b" == *.spec.ts || "$b" == *.spec.tsx ]]
}

# --- 1. Does the PR touch a trust boundary? ---
changed=()
while IFS= read -r _line; do changed+=("$_line"); done < <(git diff --name-only "$base"...HEAD)
touched=""
for p in ${changed[@]+"${changed[@]}"}; do
  for tb in "${trust_boundary_patterns[@]}"; do
    if [[ "$p" == "$tb" || ( "$tb" == */ && "$p" == "$tb"* ) ]]; then touched="$p"; break 2; fi
  done
done

if [[ -z "$touched" ]]; then
  echo "security-gate: no trust-boundary change — gate not applicable. PASS"
  exit 0
fi
echo "security-gate: trust boundary touched ($touched) — running the gate."

# --- Escape hatch (exemption with a reason in the PR body). ---
if [[ -n "${PR_BODY:-}" && "$PR_BODY" == *"SECURITY-GATE-EXEMPT"* ]]; then
  echo "security-gate: SECURITY-GATE-EXEMPT found in PR body — gate skipped."
  exit 0
fi

fail=0

# --- Check 1: <=500 lines of code+test (docs/security record don't count). ---
code_lines=0
while IFS=$'\t' read -r add del _path; do
  [[ "$add" == "-" || "$del" == "-" ]] && continue   # binary file
  is_doc "$_path" && continue
  code_lines=$(( code_lines + add + del ))
done < <(git diff --numstat "$base"...HEAD)
if (( code_lines > 500 )); then
  echo "FAIL: trust-boundary PR is $code_lines lines of code+test (limit 500)."
  echo "      Split it — one finding per PR, target ~100. (The 1157/1159 guard.)"
  fail=1
else
  echo "ok: $code_lines lines of code+test (<=500)."
fi

# --- Check 2: the security record was updated. ---
if git diff --name-only "$base"...HEAD | grep -qx "$record_file"; then
  echo "ok: security record updated."
else
  echo "FAIL: trust-boundary change did not update $record_file."
  echo "      A trust-boundary change with no security record row is a claim with no evidence."
  fail=1
fi

# --- Check 3: a repro test (or a scrutinized L3/L4 explanation). ---
has_test=0
for p in ${changed[@]+"${changed[@]}"}; do is_test "$p" && has_test=1; done
if (( has_test )); then
  echo "ok: repro test present (a test file was touched)."
elif [[ -n "${PR_BODY:-}" && "$PR_BODY" == *"SECURITY-EXPLAINED"* ]]; then
  echo "ok: SECURITY-EXPLAINED marker present (scrutinized L3/L4 explanation)."
else
  echo "FAIL: no repro test and no SECURITY-EXPLAINED marker."
  echo "      Add a red->green repro test (the exploit, replayed and denied), or for"
  echo "      an L3/L4 finding that can't be made deterministic, a SECURITY-EXPLAINED"
  echo "      note (the exact sequence, why it's real, what prevents it — reviewed)."
  fail=1
fi

if (( fail )); then
  echo "security-gate: FAIL — the PR does not conform to the security method."
  echo "  (Small non-security fix in a trust-boundary file? Add SECURITY-GATE-EXEMPT"
  echo "   + a reason to the PR body.)"
  exit 1
fi
echo "security-gate: PASS — the PR conforms to the security method."
