# L1-005: Remaining Backend Inventory

Date: 2026-10-18. Source: `db325cd3ca242774ed0afdaf743fdf35419da1e7` (HEAD at inventory).
Author: OpenCode, `gpt-6.1 sol` (exact API ID: `openrouter/openai/gpt-6.1-sol`). Status: **INVENTORIED, NOT SCANNED**.
Read-only path/line accounting, not a vulnerability scan, PASS, finding closure or independent review.
Only this document is written; central records, queues and changelog remain coordinator-owned.
RTC and marketing app scans are assigned concurrently elsewhere; no completed receipt is claimed here.

## Method And Denominator

`git ls-files -z` enumerated all **1,482 tracked files**; clean index/worktree at start and HEAD verified.
Every LOC below is literal newline count (`wc -l`), including comments/blanks, not logical code lines.
Counts use committed blobs rather than mutable working files; an unterminated final line is not a newline.
No runtime, dependency installer, network request, credential validation or credential-value output was used.
Reproduce each path's count: `git show "$H:$p" | wc -l`, with `H=db325cd3ca242774ed0afdaf743fdf35419da1e7`.
On this unchanged index, `git ls-files -z -- <prefix>` selects recursively; restrict to manifest paths below.
For a later checkout use `git ls-tree -rz --name-only "$H"` instead of the current index enumeration.
The manifests below select **109 files / 16,362 newlines**. Prefix headings are literal path prefixes;
each `relative-path=count` entry is one file, including zero-line packages. No directory wildcard hides extra files.

| Manifest | Files | Newlines |
|---|---:|---:|
| RTC | 5 | 492 |
| Marketing API runtime/packaging | 19 | 3,007 |
| API packaging/migration tools | 8 | 2,417 |
| Root orchestration/schema | 9 | 729 |
| Ubuntu runtime/deployment | 11 | 1,024 |
| CI/dependency automation | 12 | 1,085 |
| Root operational scripts | 6 | 440 |
| Edge/build/dependency packaging | 19 | 4,450 |
| Social preview backend | 3 | 422 |
| Other operator/CLI tooling | 17 | 2,296 |

## Exact Manifests

**RTC: `api/rtc/` (all tracked files).**
`Dockerfile=13`; `bun.lock=370`; `index.ts=74`; `package.json=19`; `tsconfig.json=16`.

**Marketing API: `marketing/marketing-api/`.**
`Dockerfile=12`; `pyproject.toml=36`; `uv.lock=863`.
App has exactly **16 Python files / 2,096 newlines**:
`app/__init__.py=3`; `app/facebook.py=194`; `app/instagram.py=221`; `app/main.py=21`.
`app/models.py=135`; `app/utils.py=106`; `app/validation.py=146`; `app/web10.py=116`; `app/youtube.py=196`.
`app/v3/__init__.py=17`; `app/v3/endpoints/__init__.py=0`; `app/v3/endpoints/feedback.py=139`.
`app/v3/endpoints/imports.py=405`; `app/v3/endpoints/infra.py=10`; `app/v3/endpoints/issue_tracking.py=74`; `app/v3/endpoints/pay.py=313`.

**API outside app/RTC/tests: `api/`.**
`.env_example=2`; `Dockerfile=19`; `pyproject.toml=72`; `uv.lock=1733`.
`tools/__init__.py=1`; `tools/audit_mongo.py=240`; `tools/extract_accounts.py=218`; `tools/migrate_accounts.py=132`.
No separate tracked API entrypoint script exists: commands live in Docker/compose; `app/main.py` belongs to the prior app denominator.

**Root orchestration/schema (full paths).**
`.dockerignore=61`; `docker-compose.yml=121`; `web10.app.yml=116`; `web10.dev.yml=74`.
`clickhouse-config/999-ci-logging.xml=5` (CI-oriented config retained, not hidden in test exclusions).
`clickhouse-init/001-init-v3-schema.sh=27`; `clickhouse-init/001-init-v3-schema.sql.template=294`.
`clickhouse-init/002-logs-table.sh=10`; `clickhouse-init/002-logs-table.sql.template=21`.
`git ls-files -- minio-init` returns **0 files**. MinIO command/env/config boundaries remain in compose manifests, not an invented init directory.

**Ubuntu: `ubuntu-deployment/`.**
`.env.example=38`; `env.dev.example=36`; `env.prod.example=42`; `prep-vm.sh=101`.
`docker-compose.ecosystem.yml=243`; `docker-compose.edge.yml=45`.
`scripts/deploy-stacks.py=211`; `scripts/lib.sh=39`; `scripts/smoke.sh=92`; `scripts/sync-dns.py=80`; `scripts/sync-npm.py=97`.
Environment examples were counted without displaying their contents.

**CI: `.github/` (all tracked files).**
`dependabot.yml=64`; `workflows/api.yml=40`; `workflows/cd.yml=193`; `workflows/deploy.yml=215`.
`workflows/docker.yml=81`; `workflows/e2e.yml=99`; `workflows/ghcr-mirror.yml=94`; `workflows/js-ci.yml=77`.
`workflows/js.yml=52`; `workflows/link-health.yml=60`; `workflows/marketing-api.yml=40`; `workflows/security-gate.yml=70`.

**Root scripts: `scripts/` (all tracked files).**
`ci-failures.sh=33`; `dev-shot.sh=91`; `link-health.sh=98`; `run-e2e.sh=43`; `screenshot.sh=52`; `security-gate.sh=123`.

**Edge/build packaging (prefix per line).**
`ui/`: `.env_example=13`; `Dockerfile=50`; `bun.lock=816`; `package.json=49`.
`sdk/`: `Dockerfile=11`; `bun.lock=374`; `package.json=57`.
`marketing/marketing-ui/`: `.dockerignore=2`; `Dockerfile=83`; `build-status.sh=346`; `bun.lock=937`; `nginx.conf=39`; `package.json=62`.
`marketing/web10-social/`: `.dockerignore=2`; `Dockerfile=66`; `bun.lock=1291`; `docker-entrypoint.sh=28`; `nginx.conf=150`; `package.json=74`.
Generated locks are deliberately included as dependency-integrity inventory, not dependency-audit results.

**Additional shipped backend: `marketing/web10-social/preview/` (all tracked files).**
`card.mjs=260`; `markdown.mjs=79`; `server.mjs=83`.
Production Dockerfile lines 43-65 copy this Node server and start it alongside nginx; it is not frontend-only or a screenshot harness.
Tracked-path inspection found no further Python/Node server outside the named backends; static demos are deferred below, not certified inert.

**Other operational tooling (prefix per line).**
`night_owl/`: `config.json=40`; `install_cron.sh=59`; `night_owl.py=113`; `texter.py=153`; `vision.py=270`.
`persona-orchestration/`: `seed_personas.py=607`; `seed_personas.sh=106`.
`marketing/marketing-ui/scripts/`: `render-demo-icons.mjs=44`.
`marketing/web10-cli/`: `package.json=28`; `package-lock.json=690`.
`marketing/web10-cli/bin/`: `create.js=94`; `fileCopy.js=11`; `fun_example.js=18`; `help.js=9`; `index.js=20`; `invalid.js=7`; `readline_example.js=27`.
Cron/persona automation and scaffolder are operator/tool surfaces, not additional public API services. Config values were not printed.

## Explicit Exclusions

These are disjoint **file counts**, not LOC estimates: subtract the 109 manifest paths first, then apply
the following Ruby regex rules in order to the `git ls-files -z` array. Remove each matching set before the next.
This reproducibly assigns every remaining path; exclusions are inventory classifications, never scan coverage.

```ruby
rules = {
  prior_api: %r{^api/app/}, # 59; prior receipts, not rescanned here
  tests: %r{(^e2e/|/tests/|/__tests__/|\.test\.|\.spec\.|/screenshots/(capture.mjs|harness/|vite.config.ts)|playwright.*config)}, # 279
  generated_vendor: %r{(^sdk/dist/|/wapi.js$|/hls.min.js$|/peerjs.min.js$|/reset.min.css$)}, # 31
  assets: %r{\.(png|jpg|jpeg|webp|svg|ico|mp4|pdf)$}, # 308
  data: %r{^marketing/marketing-api/app/data/}, # 1: feedback.json, 14 newlines; not displayed
  docs: %r{(^knowledge-base/|^ai-pack/|\.md$|\.txt$|^sdk/presentations/|^sdk/figures/)} # 331
}
# remaining = tracked_paths - expanded_manifest_paths
rules.each { |name, re| paths = remaining.grep(re); puts [name, paths.size]; remaining -= paths }
puts [:deferred_frontend_templates_dev_config, remaining.size] # 364
```

Reconciliation: **109 + 59 + 279 + 31 + 308 + 1 + 331 + 364 = 1,482**.
Independent reviewer verified the inventory: **109 selected files / 16,362 newlines / 1,482 tracked files total**; this is not scan sign-off.
The final 364 are explicitly deferred client/shared source, static demo/template code and build/dev configuration,
including Vite/TS configs, HTML/service workers, schema JSON, CLI templates and `.conductor/settings.toml`.
They are not dropped as harmless assets. `sdk/dist` and copied browser bundles still need later artifact/source comparison.
Tests include all 32 `api/tests/` files and all 4 marketing API test files; e2e configuration is intentionally test-only here.
Ubuntu excludes exactly 5 Markdown operations docs; API excludes its 2 Markdown docs; no tracked vendor/build directory is assumed absent without the path rules.

## Bounded Next Scopes

All scope totals below are **newlines**, not logical-line counts. Complete-file reads must reach logical EOF,
including any unterminated final line; batch sizing must include that extra logical line where present.
Immediate next **B1** manifest: the **nine full paths under Root orchestration/schema above, through EOF, 729 newlines total**.
This is disjoint from concurrent RTC/marketing app work. Start with a complete read, redact values, write a separate L1 receipt; no edits or PASS by inventory.
Then **B2**: all four `api/tools/` paths plus `api/.env_example`, `api/Dockerfile`, `api/pyproject.toml`: **7 files / 684 newlines**.
**B3/B4**: `api/uv.lock:1-900` and `901-1733` (**900 / 833** logical lines and newlines), no overlap.
**B5**: Ubuntu three env examples, `prep-vm.sh`, both compose files (**6 / 505**); **B6**: its five scripts (**5 / 519**).
**B7**: `.github/workflows/{cd,deploy,ghcr-mirror}.yml` (**3 / 502**); **B8**: remaining nine `.github/` files (**583**).
**B9**: all six root scripts plus all three preview files (**9 / 862**).
Remaining edge/operator manifests stay explicit debt: partition in listed order into whole-file batches <=1,000 logical lines;
split oversized files into consecutive <=1,000-logical-line ranges (`marketing/web10-social/bun.lock`: 1-1000, 1001-1291).
Both partitioned locks were inspected at the pinned commit and end in newline: their logical ranges above cover EOF exactly.
RTC's complete manifest is **492 newlines**; marketing agents must slice **2,096 app newlines** and **911 packaging newlines** into <=1,000-logical-line receipts, including EOF without double-counting.
Inventory is complete only for this tracked snapshot. Untracked/ignored secrets, live volumes, external proxy/DNS state,
container image contents, transitive dependencies and actual deployment activation remain outside this evidence.
Source-to-runtime snapshot comparison, including deployed code/dependency versions versus these committed sources/locks, is out of scope.
No exploit, vulnerability determination, project-wide L1 completion, fresh independent design-intent review or three-dry sign-off is claimed.
