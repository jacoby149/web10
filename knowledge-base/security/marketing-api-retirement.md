# Marketing API Retirement (D91)

Date: 2026-10-18. Intent: operator-directed removal of the unused service, not
activation/replacement of legacy payment or importer features.

## Preserved Product Paths

- Marketing/social ReportBug call node `POST /bug_report`; the E2E now checks
  its submitted/report_id/created_at response rather than legacy `/feedback`.
- Social imports call node `/v3/imports` start/status/upload primitives; the
  marketing `/import` information page remains. Node import code is untouched.
- Both apps send analytics directly to node `/analytics/event`.
- Social Node preview server remains independently shipped and unchanged.

Caller tracing found no current repository product calls to the removed service.
This is not proof that external consumers or deployed container data do not exist.
Removed wiring includes service-specific CI/Dependabot/mirror, Docker/compose,
build origins, readiness/smoke/host arrays, future DNS/NPM hosts and Swagger card.
No speculative compatibility adapter is added.

## Security Disposition

Historical MA/MB/MC receipts remain valid evidence at their pinned commit. The
marketing source and local scaffold findings are retired from current source,
not certified safe or closed in live deployments. Shared B-2/node findings,
credentials and historical exposure are not fixed by deleting this directory.
Deployment artifacts and configuration edits invalidate any current-source
assumption attached to older inventory counts; refresh before scanning them.
SDK exhaustive L1 is next; old October SDK findings are not complete coverage.

## Cutover Gate

No deployment, container/data deletion, credential rotation, or DNS/proxy API
operation was performed. Before any deployment using `--remove-orphans`, the
operator must inspect access logs/external clients and preserve required old
container-layer feedback/accounting data from `/app/app/data/`. The service has
no dedicated persistence volume, so removing its container can destroy it.
Follow `ubuntu-deployment/README.md` "Retired Marketing API" for deliberate
container, DNS, proxy and obsolete environment cleanup. Keep shared storage,
node/RTC services and the social preview server. Provision scripts do not
automatically remove the old DNS/proxy entries; old Portainer stacks can retain
orphans. Existing certificates still used by remaining services must be retained.

## Verification

- Marketing UI: 291 tests passed; production TypeScript/Vite build passed.
- Preserved node reporting/import behavior: 112 tests passed across
  `test_bugbot.py`, `test_imports_endpoint.py`, `test_import_worker.py` and
  `test_importers_youtube.py`; no node runtime source changed.
- New Links regression preserves six real destinations and removes the retired
  service link. Desktop and 375px screenshots were captured and individually read.
- E2E discovery: 32 tests in the seven affected specs; node reporting contract
  now represented. No live E2E stack was available: Docker daemon unavailable
  and local node connection refused, so no live submission success is claimed.
- E2E `tsc --noEmit` reports 11 diagnostics. Same command on an isolated
  `origin/dev` archive at `90beab4ef0fb8addc98afa55ade8bb5312fd98cb` reports
  those same 11 plus five in the deleted legacy exporter helpers; the seven
  files producing shared errors and dependency/TS config files are unchanged.
- Both affected compose files validate offline with synthetic required env;
  edited shell/Python/YAML/JSON configurations parse successfully.
- Fresh independent design-intent/code review found no introduced product-path
  or invariant regression; its tracker/ritual/changelog corrections incorporated.
  This is not deployment acceptance or model-diverse security sign-off.
- PR CI exposed a gate matcher bug: a nested marketing path containing
  `api/app/main.py` was misclassified as the root node boundary. Root file paths
  now match exactly and directory scopes match only from the repository root.
  The new regression fails with the old matcher and passes with the fix; real
  node/authenticator/SDK/RTC paths still enforce size, record and test rules.
  No exemption marker or budget increase was used.
