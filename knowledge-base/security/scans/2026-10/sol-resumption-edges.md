# Sol Resumption: Packaging And Deployment Edges

28.10.2026. HEAD verified: `49178a87dcd651337e7f17dea68b66f377ae2e05`.
Delta baseline: `1332abc678344d24dc6f85227549dda2b0bef9a9`.
Reviewer: OpenCode, Sol parent context; configured model
`openrouter/openai/gpt-6.1-sol` (`openai/gpt-6.1-sol`). No independent model-family
or three-dry credit. Coordinator owns inventories and central model note.
**Bounded read-only resumption; no security PASS or L2 advancement.**

## Contract And Orientation

Only this receipt is written with apply_patch. No runtime/test/central-doc edits,
installs, downloads, builds, listeners, host configuration changes, live credentials,
network calls, DB access, temporary disk fixtures, commits or pushes. Existing dirty
`ui/src/interfaces/Interface.tsx` is outside scope and untouched.

Read AGENTS.md in full, security learnings, security method README, orient/checklist/
design-intent guidance, thesis, current L1 index/exclusions, packaging/deploy receipts
and both repair receipts. Browsed strategy directory, checked plan/lane security
items and recent changelog. Also read node-config intent. Prior read completion and
reported CI are attributed historical evidence, not independently repeated here.

Onboarding: retain B-2, BP-3, PKG-02 and artifact/provenance obligations rather than
duplicate IDs. Recession: replay PKG-01 and DEPLOY-01 repairs, including scheduling.
Obvious gap: locks assume trustworthy producer/dependency bytes; API isolation
assumes stores and management interfaces cannot bypass it; RTC assumes a trusted
verifier and actual admission timing. These assumptions remain unproved operationally.

## Exact Fresh Reads

All ranges below are inclusive, complete files including comments/blanks and EOF.
Working sources in these scopes matched HEAD (`git diff --exit-code HEAD -- ...`,
exit 0); probes additionally loaded pinned Git blobs. No claim to reread all 171
historically selected paths, all locks, generated SDK outputs or the whole tree.

| Changed Production/CI Path Since Baseline | Full Range |
|---|---|
| `api/tools/audit_mongo.py` | 1-240 |
| `api/tools/extract_accounts.py` | 1-218 |
| `.github/workflows/api.yml` | 1-43 |
| `.github/workflows/docker.yml` | 1-86 |
| `marketing/marketing-ui/Dockerfile` | 1-82 |
| `marketing/web10-social/Dockerfile` | 1-64 |

These six scoped paths are the complete production/CI delta for tools, workflows,
the two Dockerfiles, RTC, Ubuntu deployment, ClickHouse init, root compose/app/dev
YAML and social preview paths. `git diff --stat <baseline> HEAD -- <scope>`:
six files, 15 insertions/7 deletions. Not the complete API/SDK/UI runtime delta.

Evidence reads: `api/tests/test_docker_frozen_installs.py:1-65`,
`api/tests/test_mongo_connection_output.py:1-58`,
`api/tests/test_extract_accounts.py:1-231` (all changed/added), and unchanged
`api/tests/conftest.py:1-142` (context only; not executed).

| Unchanged Boundary Path Freshly Read | Full Range |
|---|---|
| `api/rtc/index.ts` | 1-74 |
| `api/rtc/Dockerfile` | 1-13 |
| `api/rtc/package.json` | 1-19 |
| `api/rtc/tsconfig.json` | 1-16 |
| `docker-compose.yml` | 1-121 |
| `clickhouse-init/001-init-v3-schema.sh` | 1-28 |
| `clickhouse-init/002-logs-table.sh` | 1-10 |
| `ubuntu-deployment/docker-compose.ecosystem.yml` | 1-227 |
| `ubuntu-deployment/docker-compose.edge.yml` | 1-45 |
| `ubuntu-deployment/prep-vm.sh` | 1-102 |
| `.github/workflows/deploy.yml` | 1-215 |
| `.github/workflows/cd.yml` | 1-194 |
| `.github/workflows/js.yml` | 1-52 |
| `scripts/security-gate.sh` | 1-123 |
| `marketing/web10-social/preview/card.mjs` | 1-269 |
| `marketing/web10-social/preview/server.mjs` | 1-83 |
| `marketing/web10-social/preview/markdown.mjs` | 1-79 |
| `marketing/web10-social/docker-entrypoint.sh` | 1-28 |
| `marketing/web10-social/nginx.conf` | 1-150 |

`git rev-parse <pin>:<path>` comparison independently confirmed all 19 blobs equal
to baseline. Other historical bootstrap/SQL templates, RTC lock, deployment helpers,
env files, root app/dev YAML and external implementations were not freshly read.

## Commands And Results

- `git status --short`, `git rev-parse HEAD`, `git diff --name-status <baseline> <HEAD>`: pinned HEAD, pre-existing UI edit; no reset/checkouts/fetch.
- `git diff <baseline> HEAD -- <six changed paths> api/tests/test_extract_accounts.py`: reviewed exact changes after complete reads.
- `python3 -I -B -c 'import sys; print(sys.version); import pytest; print("pytest", pytest.__version__)'`: Python 3.12.6, existing pytest 9.1.1; no install.
- `python3 -I -B - <<'PY'` session replay: executed the committed frozen-install test module in memory and invoked its six shell cases plus two CI controls directly. **8 PASS**; actual RUN text, inert Bun, locked exit 0/41 preserved. Baseline RUN replay reproduced all **3 fail-open sites**. This was not a full pytest run.
- Same Python session: AST-loaded both pinned Mongo tools, removing only external pymongo import; mocked client/collections, captured stdout/stderr and intercepted `open` with StringIO. Four committed-test URI forms times audit/stdout/file destinations: **12 baseline URI-retention results, 12 HEAD omission controls PASS**. Original URI forwarded, client closed, account hash/count/checksum preserved. Synthetic values withheld. File sink verified plain `open(path, "w")`, not real filesystem permissions. Repo-output guard replaced only for the in-memory file case; not tested by this replay.
- `node --experimental-vm-modules --input-type=module <<'JS'`: Node v24.18.0; pinned RTC source with imports/interface/type assertion removed, inert PeerServer/JWT/axios. **8 cases PASS**: valid normalized ID, non-200, rejection, wrong ID, invalid decode, nonstring token, HTTP verifier override and unsigned provider destination. Initial harness expected dots in ID and failed; corrected expectation to source's underscore normalization, reran all. Not a source defect.
- Same Node replay: actual pinned card/markdown VM modules with inert fetch; denied post/group/profile reads yield generic specs, fixed API destination/no token, hostile-looking post ID cannot select fetch host. Markdown preserves markup (not a sanitizer). All assertions PASS; expected experimental VM warning. No HTTP server module body executed.
- `ruby -ropen3 -e ...`: Git-blob equality checks above and `bash -n` via stdin on both ClickHouse init shells, prep-vm, social entrypoint and security gate: **5 PASS**, bodies never executed.

Inline replay programs were session-only, not persisted test artifacts. No native
Bun installs, Linux images, browser, actual renderer, storage or full suite rerun.

## Six-Class Disposition

| Class | Result And Evidence Limits |
|---|---|
| 1. Access control | No new demonstrated unauthorized access in scoped delta. RTC `index.ts:36-60` still trusts decoded provider for verifier destination and HTTP 200 for identity admission (BP-3). Stub success does not prove real signature authority, pre-admission timing or signaling denial. Preview anonymous reads delegate protection to API; crawler UA is not authorization. |
| 2. Injection | Tool JSON/fixed Mongo selectors and Docker/shell changes introduce no demonstrated code/query injection. Preview markup survives stripping; real render escaping remains a direct-edge gate, not proven XSS. Operator URI/path/env authority is intentional, not remote-user control. |
| 3. Boundaries/transport | Local `CERTIFY_BASE_URL: http://api` override remains intentional. Production RTC lacks explicit override; actual trusted verifier policy remains open. Management publications/socket mounts and shared networks are source declarations, not proven Internet reach or host compromise. Internal preview API hostname versus public PROVIDER is an existing compatibility assumption, not a proven grant bypass. |
| 4. Availability | Deploy basic-regex password predicate, shared checkout concurrency, UI builder-stage publication, preview process supervision and generic missing-post 200 remain prior correctness/reliability concerns. No new C+I finding or load test; shell syntax alone proves little. |
| 5. Lifecycle | PKG-01 output omission holds locally, not historical deletion. PKG-02 plain file creation/link/umask/TOCTOU remains conditional; no filesystem disclosure replay. Preserve the only account backup. Tokens, CI traces, caches, old containers/logs and actual retention/rotation remain operational gates. |
| 6. Hygiene/supply chain | DEPLOY-01 no longer falls back and CI schedules/builds the actual social production image. B-2 public/repeatable defaults still exist (values withheld), not validated live. Floating Bun publication (`cd.yml:119-134`) versus SDK CI 1.3.14, mutable images/actions and orphan/generated artifact provenance remain OPEN. No malicious dependency or shipped secret demonstrated. |

## Disposition And Gates

No new proven finding assigned; no repaired-source recession reproduced for PKG-01
or DEPLOY-01. Source repair is not whole-tool safety, deployment or diverse review.
The repair receipt reports prior equivalent-input Linux image CI; it was read,
not fetched/revalidated here and does not attest this HEAD's deployed images.
Security-gate exemption remains deliberate, with existing reason/eligibility and
packaging-path coverage limitations; not a newly discovered application bypass.

Required follow-up: actual RTC verifier/admission/replay evidence (BP-3), issuer/
default provisioning (B-2/BP-1), protected backup filesystem and output consumers,
renderer/public-grant checks, build/published/copied/cached cohort provenance,
approved host/firewall/network/secret policy, historical exposure/rotation, current
revision CI/deployment evidence and independent model-diverse review. Changed SDK/
UI/API implementation belongs to coordinator-assigned scopes, not implicit credit.

Design-intent assessment: report-only, zero behavioral delta; retain D41 readable
node/PWA, D56 content-blind telemetry, D60 generic API, body tokens/JS cookies,
authorized public/group previews and intentional baseline-admin/local bootstrap.
Protected account hashes remain intended export data; redundant URI credentials
do not. No blanket hardening, bootstrap removal, risk acceptance or rollout is
authorized. Central inventory, learnings, queues and model note remain coordinator-owned.
