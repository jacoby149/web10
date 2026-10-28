# L1-DEPLOY-01 Frozen Install Repair

27.10.2026. Baseline `e0c271da1585dec8c9f736424b6a4589da519e3b` (#1267 merged).
Author/fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol` contexts;
same-model, not model-diverse three-dry sign-off. Source repair verified locally;
pending PR review/merge, not deployed. Linux container compatibility remains a CI
gate; no L1 PASS or full supply-chain assurance.

## Finding And Repair

Three Docker RUN instructions tried `bun install --frozen-lockfile || bun install`:
marketing-ui's application install, its SDK producer install, and social's
application install. A failed locked resolution could therefore become a
successful unrestricted install. This is demonstrated integrity-control hygiene,
not evidence of a poisoned dependency or application authorization exploit.

Remove only the three unrestricted fallbacks. Successful frozen installs follow
the original build path; failure stops the layer. All COPY layouts, supported
local `file:` dependencies, SDK browser build/copy, build-time origins, telemetry
inputs and final runtime assembly remain unchanged. No lock, manifest, producer
version or browser artifact is updated. This does not resolve separate floating
compiler/base-image, artifact-provenance or dependency-trust obligations.

## Repro And Compatibility

`api/tests/test_docker_frozen_installs.py` extracts the actual RUN instructions
and executes each with an inert shell Bun. Before repair: three frozen-failure
cases incorrectly exited zero after invoking both installs; three success controls
passed. After repair: all six pass, preserving frozen failure code 41 and making
exactly one frozen invocation on success or failure. No registry/network involved
in these controls. The harness expects the current single-line instruction form;
restructuring it requires updating the test, not silently omitting a site.

Fresh review found the new regression would not run on future Dockerfile-only
PRs. Added both Dockerfile paths to API CI's pull_request filter and a seventh
regression (red before, green after). This changes test scheduling only.
`uv run --frozen pytest -q --disable-warnings --tb=short`: **1,232 passed, four
subtests passed**. Focused suite: seven pass; Ruff check/format and diff checks pass.

Native compatibility was exercised in a clean detached baseline worktree outside
the workspace, using Bun 1.3.14 on macOS. All three real `bun install
--frozen-lockfile` commands succeeded; marketing-ui/social `bun run build` and
SDK `bun run build:browser` succeeded. Tracked status and manifest/lock diffs
remained clean. Shared discover and SDK local file dependencies were resolved.
The temporary worktree was removed after verification; no generated output or
dependency change entered this patch. Build warnings concerned bundle size and
mixed dynamic/static imports, not failed compilation.

Independent review replayed baseline/current shell controls, checked dependency
paths and unchanged input/tool pins; it did not rerun the native builds. Docker
daemon was unavailable locally, so Alpine/mirrored-image Bun, actual Docker COPY
layout, BuildKit status generation and final runtime assembly are NOT verified.
Required follow-up: successful Linux image CI for both applications, including
social (not present in the standalone Docker matrix; the E2E stack builds it).
That gate is not waived by native success. Current local-package lock metadata
also has pre-existing correspondence differences; Bun acceptance is not a claim
that all local-package metadata or external dependency code is certified.

## DESIGN-INTENT REVIEW

- Intent: ship marketing/social and the marketing SDK producer using locked inputs, supported local packages and operator-selected origins.
- Delta: locked-install failure stops a build instead of silently resolving unrestricted dependencies; successful build flow is unchanged.
- By-design conflict: none found with D74 local dependencies, D41, D56 or D60; no screen, auth or telemetry behavior changed.
- Conventional deviation: none introduced; fail-closed lock enforcement restores the recorded integrity control.
- Untested risk: Linux toolchain/platform/registry failures may now stop a deployment that previously continued. Container checks remain required; no operator acceptance of skipping them is recorded.

The intentional failure behavior is the repair, not an outage to mask with a
fallback. Correct inconsistent approved inputs/toolchains deliberately. Reopen on
lock/local-package changes, COPY-layout changes, base-image/Bun changes or failed
container checks; never restore unrestricted fallback as the remedy. Fresh review
found no remaining source blocker after CI trigger coverage was repaired. Actual
merge/deployment, dependency authenticity and required diverse sign-off remain
open; no private protocol data or real credentials were used in the probes.
