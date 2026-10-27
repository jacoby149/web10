# Current Protocol L1: Deployment And Producer Edges

Integration: `l1-current-edge-review.md` supersedes exemption vulnerability wording. The escape hatch is deliberate; grammar/eligibility enforcement is a policy limitation, not a demonstrated unauthorized application bypass.

Date: 2026-10-27. Model: `openai/gpt-6.1-sol` (OpenCode).
Source pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2`.
Disposition: **coverage complete for the explicit 37-file manifest below; OPEN findings and integration debt; not security PASS**.

## Contract And Orientation

Read-only protocol producer/copy/serve/credential/deploy-edge review, not app implementation, Wave 2, L2, L3 or L4. Only this scratch receipt is written. No code/test/central-record edits, fixes, installs, builds, live network, credential validation, commits or pushes. Existing unrelated worktree changes were left untouched. Runtime/config evidence was read from Git blobs, not dirty workspace source. HEAD was verified before and after the probes and remained the requested pin.

Orientation read: root AGENTS instructions; `ai-pack/ai-security-theory/README.md`, `the-orient/README.md`, `the-scope-ladder/the-checklist.md`, `the-design-intent-gate/README.md`; `knowledge-base/strategy/thesis.md`; security learnings, strategy, overview, backend index and historical B1/RTC receipts; node-config intent; strategy directory inventory, plan/lane security queues and recent changelog entries. Plan/lane/changelog show historical coverage and later source repairs, not a completed current deployment scan. Orientation documents were workspace context, including concurrent uncommitted B-8 status; their status was not substituted for pinned runtime evidence. No independent reviewer or model-diverse three-dry review was available.

- Onboarding: reuse **B-2** for public/default credentials; **BP-3** for RTC admission; preserve B-4 source-repair versus historical/deployed-exposure distinctions. Browser correspondence is already tracked separately; this receipt adds producer-path evidence, not another cookie finding.
- Recession: CI pins the SDK producer to Bun 1.3.14, but the npm publication workflow still selects latest. Prior source/artifact parity does not establish parity on that publication path. Previously open credential defaults remain; no claim that a deployed repair regressed.
- Obvious gap: I1/I2 assume trusted deployed verifier/key configuration; I3 assumes storage cannot be reached around its API gate; I4 assumes operator access is intentional and accountable, not anonymous exposure; I5 assumes the shipped SDK/config matches tested authority behavior; I6 assumes remote content never controls local authority. Mutable producers, fallback resolution, shared deploy checkout, network membership, secret provenance and operational access can invalidate those assumptions. These files alone cannot establish the resulting protocol exploit. Dependency trust is the existing supply-chain gap, not a newly invented invariant. DoS remains reliability-only.

All credential literals are withheld in this receipt, including bootstrap and synthetic-account passwords and infrastructure account/access identifiers. Environment-variable names and references are configuration interfaces, not disclosed credential values. Blob IDs below identify public source objects, not credentials.

## Exact Current Manifest

Every logical line of each file below, including comments, blanks, scripts embedded in YAML, dependency declarations and unterminated EOF, was read against **all six classes**. Coverage means file-local review, not execution or transitive implementation review. `N` counts newline bytes; the inclusive range counts logical lines. Seven files have an unterminated final line. No assigned runtime file was omitted for size and no tool output in these source-read batches was truncated.

`root.dockerignore` is not a tracked path at the pin (`git cat-file -e` fails). The actual root `.dockerignore` was included explicitly as the root-ignore edge; this is not a claim that a file named `root.dockerignore` exists.

| Path | N | Inclusive Logical Range | Git Blob |
|---|---:|---|---|
| `.dockerignore` | 60 | 1-60 | `c1e7196ac0f1191687d857b0c9f3cee6b743b41a` |
| `.github/dependabot.yml` | 59 | 1-59 | `829524b1b66f319f94ef10dce053c6451edaed57` |
| `.github/workflows/api.yml` | 40 | 1-40 | `3730ec010326b82e4bc65be16028cd9cb02c453f` |
| `.github/workflows/cd.yml` | 193 | 1-194 | `29b370eeb475381441b388892500e2f5d7fa36d8` |
| `.github/workflows/deploy.yml` | 215 | 1-215 | `4c90e711ec841fb7bb6f84849aea2aa2c92d07ed` |
| `.github/workflows/docker.yml` | 81 | 1-81 | `69c20c844935bedf493022f1edb64189d2763c38` |
| `.github/workflows/e2e.yml` | 99 | 1-100 | `40fa6638db3c3024f1ecd0e19f4c5f5b6673e14f` |
| `.github/workflows/ghcr-mirror.yml` | 94 | 1-94 | `a35ef56d3430b86e276a742cd356e56b040aefe5` |
| `.github/workflows/js-ci.yml` | 77 | 1-77 | `539df7241e0336ac4ce160987178cd7670b3f7d2` |
| `.github/workflows/js.yml` | 52 | 1-52 | `e20b075a6a7a88c577f4725058006b691c9a1121` |
| `.github/workflows/link-health.yml` | 60 | 1-60 | `c0a635dd8a9813366d803f7b5899193fbada9db3` |
| `.github/workflows/security-gate.yml` | 73 | 1-73 | `c91d8f76492ca44b0c76074d65665e5368c50798` |
| `scripts/security-gate.sh` | 123 | 1-123 | `ea7dfb913407c50be74a784422a8d78038d35ea3` |
| `ubuntu-deployment/.env.example` | 38 | 1-38 | `2a072e8e5849db2d1c1a289a23aba87e3c276f23` |
| `ubuntu-deployment/docker-compose.ecosystem.yml` | 227 | 1-227 | `821615ef6afc2f9d03c87e592d1ea9695c51bcab` |
| `ubuntu-deployment/docker-compose.edge.yml` | 45 | 1-45 | `823c4a8bb96f242e065190368a1e90dd3f8de182` |
| `ubuntu-deployment/env.dev.example` | 35 | 1-35 | `2190178d9376ef2a594bdc8208a48a91631ce8b7` |
| `ubuntu-deployment/env.prod.example` | 41 | 1-41 | `8073061112b67b881949f4f5c0cb075882e9439d` |
| `ubuntu-deployment/prep-vm.sh` | 101 | 1-102 | `21d9fbec5ac662764608bf63bea23e446fe137d2` |
| `ubuntu-deployment/scripts/deploy-stacks.py` | 212 | 1-212 | `924313d47909c8330b03f0d7831900b26fdc1ba2` |
| `ubuntu-deployment/scripts/lib.sh` | 39 | 1-39 | `33a97d95980066da2cbd05b3d0ac3c1e0a39ddc6` |
| `ubuntu-deployment/scripts/smoke.sh` | 92 | 1-92 | `2fc261cd887cadb295a6a3d8ca0a3991396acd07` |
| `ubuntu-deployment/scripts/sync-dns.py` | 80 | 1-80 | `2653c11b34fc77e38ce78f5ea329e10f4dd0883c` |
| `ubuntu-deployment/scripts/sync-npm.py` | 96 | 1-96 | `c017bbfb1e267cca09c26d77adeee9f34f87a681` |
| `ui/.env_example` | 13 | 1-14 | `b6829bd421d9fe567768957d195a4b1d9edefec7` |
| `ui/Dockerfile` | 50 | 1-50 | `bcd28288bbb8b6fb5c2e36b9920e867e2a6d2ccb` |
| `ui/package.json` | 49 | 1-49 | `13a490ab0340dcbd112b9539fea5049b2145b180` |
| `marketing/marketing-ui/.dockerignore` | 2 | 1-2 | `f06235c460c2de3d97efc8371125594b7b761b08` |
| `marketing/marketing-ui/Dockerfile` | 82 | 1-82 | `2413dc4466fabc3383d16d77ac98d9b2af374470` |
| `marketing/marketing-ui/build-status.sh` | 346 | 1-347 | `01ead1ee381f07f6f0af8bd614fa2181b09b8ef2` |
| `marketing/marketing-ui/nginx.conf` | 39 | 1-39 | `b3231072f9e7953d5528da206af9d9c504b1ff41` |
| `marketing/marketing-ui/package.json` | 62 | 1-63 | `bf86d56a492686c11aa939001a472c91cfcdc6e8` |
| `marketing/web10-social/.dockerignore` | 2 | 1-2 | `f06235c460c2de3d97efc8371125594b7b761b08` |
| `marketing/web10-social/Dockerfile` | 64 | 1-64 | `826dee1f1fe02daee88f070815e5fe9976568313` |
| `marketing/web10-social/docker-entrypoint.sh` | 28 | 1-28 | `3ef510696e19f908fef86d0c5b4edca9c036dc97` |
| `marketing/web10-social/nginx.conf` | 150 | 1-150 | `23c1c0ae2e6ec55d141de75009d298e88b26d725` |
| `marketing/web10-social/package.json` | 74 | 1-75 | `e235c183d8d4a6ab2d9aceeaf8f6bc01c7906931` |

Totals: **37 files / 3,193 newlines / 3,200 logical lines**, disjoint whole-file ranges, no gaps. Subtotals in logical lines: Ubuntu 11 files/1,007; GitHub 11/1,045; gate script 1/123; root ignore 1/60; ui 3/113; marketing packaging 5/533; social packaging 5/319.

### Explicit Exclusions

All 16 tracked Ubuntu paths reconcile to 11 runtime/configuration files above plus these five excluded documentation files. No tracked Ubuntu assets were present. Documentation exclusions were inventoried, not source-scanned:

| Excluded Documentation | Newlines | Logical Lines |
|---|---:|---:|
| `ubuntu-deployment/AGENT-OPS.md` | 268 | 268 |
| `ubuntu-deployment/DEPLOYMENT-PLAN.md` | 176 | 176 |
| `ubuntu-deployment/OPS-LOG.md` | 453 | 453 |
| `ubuntu-deployment/README.md` | 461 | 461 |
| `ubuntu-deployment/scripts/README.md` | 67 | 68 |

Excluded docs total 1,425 newlines/1,426 logical lines. App source, public docs/assets/copied bundle contents, frontend locks, SDK source/dist/producer implementation, API implementation/packaging, preview implementation, external action/image/package code, root scripts other than the assigned gate, actual environment files, Git history contents and deployed configuration are outside this receipt. References/COPY statements do not add their targets to coverage. Link-health/CLI/e2e-related workflow lines were fully read, but no transitive Wave 2 scan is claimed.

### Historical Credit, Not New Reads

Compared Git blob IDs at historical pin `db325cd3ca242774ed0afdaf743fdf35419da1e7` and current pin. The following **eight B1 files / 668 newlines / 670 logical lines** are byte-identical and retain only their historical receipt credit: `docker-compose.yml`, `web10.app.yml`, `web10.dev.yml`, `clickhouse-config/999-ci-logging.xml`, `clickhouse-init/001-init-v3-schema.sh`, `clickhouse-init/001-init-v3-schema.sql.template`, `clickhouse-init/002-logs-table.sh`, `clickhouse-init/002-logs-table.sql.template`.

All **five RTC files / 492 newlines / 492 logical lines** are likewise byte-identical: `api/rtc/index.ts`, `api/rtc/Dockerfile`, `api/rtc/package.json`, `api/rtc/tsconfig.json`, `api/rtc/bun.lock`. Existing BP-3 and the old receipt's limitations remain. No RTC probes were re-executed here.

The ninth historical B1 path, `.dockerignore`, **changed** and is freshly read above; do not describe all historical B1 files as unchanged. The 13 unchanged paths are not added to this receipt's 37-file fresh-read denominator. Byte equality preserves historical source evidence only, not current deployment assurance or sign-off.

## All Six Classes

The following dispositions apply across every manifest row, with source-local exceptions and boundaries recorded below. An absent sink in a config/manifest is N/A for that local mechanism, not proof of downstream safety.

| Class | Exhaustive File-Local Disposition |
|---|---|
| 1. Access control, I1/I2/I3/I5 | No local JWT verifier, document ownership query or contract evaluator to certify. CI permissions/triggers/exemption handling, credential inputs, storage networks and management publications inspected. B-2 and L1-DEPLOY-02 apply; actual branch protections, token permissions and management/data access remain unverified. Public preview routing by User-Agent is dispatch, not authorization. |
| 2. Injection | Reviewed shell expressions/YAML scripts, Python JSON/urllib requests, Docker COPY/install commands, status heredocs/DOM use and nginx captures. Scripts source operator-owned env files intentionally; no remotely writable env precondition demonstrated. Python uses JSON encoding rather than SQL or shell evaluation. Status JSON interpolates operator/build metadata without JSON escaping (U04); no arbitrary remote-input execution/XSS demonstrated. Nginx captured path propagation is a handoff, not a proven SSRF/path traversal. |
| 3. Boundaries/transport, I5/I6 | Reviewed build-time/public versus runtime/internal origins, mandatory compose vars, localhost management HTTP, proxy TLS configuration, shared networks, SSH action inputs, crawler proxy routes and token-bearing curl calls. Static bindings do not establish internet reach. No account credential literal/URL is reproduced here. Body-token transport, JS-readable SDK cookies and development HTTP are not findings. U01/U03/U05/U06 retain integration questions. |
| 4. Availability/DoS | Password-presence bug, concurrent checkout/deploy races, preview process supervision, readiness checks, unbounded urllib calls, frontend target mismatch and smoke limitations are routed to correctness/reliability below, not counted as new C+I exploits. No load testing. |
| 5. Data lifecycle | Inspected env creation/restoration/overwrite, named storage/cert volumes, orphan removal, smoke-created accounts, CI trace retention, error-output copies and producer/copy stages. No durable live change occurred. No evidence of token replay or a storage tombstone bypass from these files. Credential/log/old-container retention and actual secret modes remain open. |
| 6. Hygiene/supply chain | Existing B-2 has additional static locations. L1-DEPLOY-01 proves lock-enforcement fallback. Existing artifact-correspondence debt gains a floating publication producer location. Mutable action/image tags, scheduled mirrors and external bootstrap downloads remain source-level trust assumptions, not demonstrated compromise. Gate limitations are L1-DEPLOY-02. |

### Local Range Notes

- Ubuntu compose: ecosystem 1-37 intent; 38-78 stores/credentials; 79-147 API/auth/RTC wiring; 148-215 frontend build/runtime origins and preview wiring; 217-227 volumes/networks. Edge 1-22 intent/bootstrap hints; 23-45 image, publications, persistent cert/config state and network. Environment examples in full define public origins versus empty secret inputs, not deployed values.
- Ubuntu scripts: prep 1-102 bootstrap/download/daemon/admin publication; deploy-stacks 1-68 env/auth/API helper, 70-94 stack env/selection, 96-171 registration/deprecated GitOps/state mutation, 174-212 dispatch; lib 1-39 trusted env sourcing and JSON credential posts; smoke 1-33 HTTP probes, 35-92 signup/login/authenticated checks; sync-dns 1-45 env/fixed API client, 47-80 record reconciliation/prune; sync-npm 1-58 env/auth/client, 60-96 certificate secret forwarding and vhost reconciliation.
- Workflows: every trigger, filter, permission, cache, matrix, embedded shell, credentials reference and artifact action was read. API/JS jobs use hosted PR runners; deploy uses push on dev/main; CD publishes on main/tag independently of PR checks; mirror runs scheduled/manual. No `pull_request_target` secret-execution claim is made. js-ci 71-77 explicitly disables RTC tests, consistent with historical debt, not a new test execution claim.
- Frontend edges: all package dependency/script/override/allowScripts declarations were read as declarations, not dependencies' implementation. UI copies SDK dist before its frozen install; marketing builds a browser SDK and overwrites the public docs copy; social copies SDK dist and frontend public/source inputs. Root-context builds use the root ignore, not the tiny per-directory ignores. Neither this scan nor the Dockerfiles prove freshness/equality of all delivered bundles.
- Status producer: 1-69 paths/version/git/origin derivation, 70-84 JSON generation, 86-278 static HTML/styles, 279-342 browser display/probes, 343-347 EOF. Text display uses `textContent`; health probes can accept opaque responses and are not protocol-authority or deployed-version attestations.
- Social nginx: 1-54 crawler map; 56-83 post route; 85-99 profile; 101-117 group; 119-132 watch; 134-145 shorts; 147-150 static SPA. Operator-owned PREVIEW_TARGET is the proxy destination; a spoofable crawler UA must not grant private content. Actual preview/API authorization is outside L1 here.

## Findings And Evidence IDs

### B-2: Additional Public/Repeatable Credentials, OPEN

Evidence `DEPLOY-E01`: `ubuntu-deployment/docker-compose.ecosystem.yml:43-45,61,99` retains literal storage credential configuration. The password at line 45 is direct public-source evidence; account/access identifiers alone are not treated as authentication bypasses. MinIO's secret at 64/100 is instead a required env reference, not a hardcoded password. Examples leave operator secret inputs empty. `ubuntu-deployment/scripts/smoke.sh:51-58,66-70` uses a repeatable source password to create/login a timestamp-named account, with no cleanup in 77-92. This is a shipping operational smoke script, not merely an inert test fixture.

All literal values withheld. Static source is the proof under checklist class 6; no authentication attempted. These extend existing B-2 rather than creating duplicate IDs. Potential account compromise requires knowing/guessing a still-existing account and actual successful creation; no such account or live exposure established. Edge/prep first-boot credential hints at edge:19 and prep:90-94 are withheld and depend on the actual upstream image/bootstrap state, not demonstrated current login validity.

Severity: B-2 remains HIGH public-source credential hygiene in the established register; no escalation to live service compromise. Preserve operable bootstrap and smoke intent while requiring deliberate operator secrets/account cleanup in a later bounded repair. No rotation, historical exposure review or fix performed.

### L1-DEPLOY-01: Frozen Install Fails Open, OPEN

Evidence `DEPLOY-E02`: `marketing/marketing-ui/Dockerfile:24,55` and `marketing/web10-social/Dockerfile:16` use `bun install --frozen-lockfile || bun install`. A failed frozen resolution is followed by an unrestricted install, so the lock constraint is not a build gate. This reaches the marketing SDK producer too, not only unrelated app dependencies. Known dependency-integrity gap; local class-6 supply-chain hygiene finding, not proof of malicious resolution or package execution.

Offline shell probe P2 used an inert `bun` function with frozen failure and ordinary-install success. It recorded exactly `install --frozen-lockfile`, then `install`, exit 0. The three literal fallback locations were independently counted as two marketing and one social occurrence. UI line 9 is frozen-only, a useful contrasting control.

Repair close condition: failing locked resolution must fail the image build; compatible, frozen inputs must still build. Preserve supported local file dependencies and operator-selected origins. No build or package install ran, so lock compatibility and generated outputs remain untested. Severity: MEDIUM integrity-control hygiene, conditional on dependency inconsistency/untrusted resolution; not an app authorization exploit.

### L1-DEPLOY-02: Exemption Marker Bypasses Documented Method Checks, OPEN

Evidence `DEPLOY-E03`: `scripts/security-gate.sh:17-18,70-74` describes an exemption with a reason for a small non-security change, but accepts any PR body containing the marker and returns before size/record/repro checks. Offline P3 executed the pinned script with an in-memory `git` function reporting a synthetic 600-line auth change, no security record and no test. Empty body exited 1 and reported all three violations; marker-only body exited 0 and skipped the gate. No repository diff or PR was fabricated/mutated.

This proves only local CI-method bypass under caller-supplied metadata. It does not bypass GitHub reviews/branch protection, create a merge, exfiltrate CI secrets or defeat application authentication. Exemptions themselves are intentional; the missing promised reason/scope enforcement is the finding. Severity: LOW process-integrity hygiene; actual merge impact unverified.

Related static limitation: no design-intent block is checked anywhere in the 123-line script, despite the method's enforcement statement. At 103-108 any touched test pathname suffices, and the explanation marker is not validated for substantive review. Workflow filters and script patterns do not cover most packaging/deploy changes reviewed here. These are evidence about what the gate does not enforce, not claims that all such PRs are exploitable or that markers can replace required human/model review. Later repair must retain explicitly approved exemptions without silently banning legitimate maintenance.

### Existing Artifact Correspondence: Publication Producer Still Floats

Evidence `DEPLOY-E04`, not a new duplicate security finding: `.github/workflows/js.yml:27-29` pins SDK CI to Bun 1.3.14, while `.github/workflows/cd.yml:104-134` installs latest Bun, runs `bun run build` and publishes on tags. Static assertion P4 confirmed both declarations. Marketing Dockerfile:2,53-60 rebuilds the browser SDK using a mutable `base-bun:1-alpine` producer; UI/social consume checked-in dist. Frozen dependencies do not pin the compiler runtime. An earlier source/byte-equality receipt under a pinned producer is not evidence for these other producer paths.

No floating producer was downloaded, no build drift reproduced here and no npm package inspected/published. Actual tool versions, npm provenance/OIDC configuration, package contents, copied public files and deployed caches require separate artifact/release evidence. Keep this under existing `L1-010`/`sdk-artifact-correspondence.md` obligations rather than claiming SDK-B-01 reopened or closed.

## Correctness And Reliability, Not New C+I Findings

- `DEPLOY-R01`, proven local predicate bug: deploy.yml:59,69,161,171 uses basic `grep -q '^MINIO_PASSWORD=.+'`. Under basic regex, `+` is literal; an ordinary nonempty synthetic assignment returned exit 1, while the `grep -E` control returned 0 (P1). Thus normal saved secrets take the regeneration branch. Both environment files are processed in each job, although only one stack is rebuilt. Source shows credential-file overwrite without deliberate rotation; actual disk/MinIO changes, existing clients and operational impact were not exercised. Regeneration uses random bytes, so this is not evidence of weak randomness or a remotely exploitable credential choice.
- `DEPLOY-R02`, static UI publish target mismatch: cd.yml:31-36,70-82 selects `ui/Dockerfile` target `build`, which ends at UI Dockerfile:40 before the static-serving runtime stage at 42-50. The image path publishes a builder rather than the final server. docker.yml:28-34 also tests only that target. No image was built or run, so report source-stage selection, not a demonstrated production outage.
- `DEPLOY-R03`, deploy identity/concurrency: deploy.yml:8 and 41-43/144-146 use per-ref concurrency groups but one shared `/opt/web10` checkout and fetch/reset current branch tip rather than the logged event SHA. Concurrent dev/main runs may race checkout/context/env preparation. Actual overlap or wrong release delivery is unproven; rollout atomicity and protocol cohort coordination are L4 evidence debt, not demonstrated integrity compromise here.
- `DEPLOY-R04`, preview lifecycle: docker-entrypoint.sh:18-28 backgrounds Node, installs a trap and then `exec`s the nginx entrypoint. The shell trap is not retained across exec; no child failure supervision appears locally. Container/PID1 behavior and impact need actual runtime testing. Do not infer private-preview access from a process-lifecycle concern.
- `DEPLOY-R05`, readiness/status limitations: deploy's stabilize loop accepts no-healthcheck containers and does not pin a minimum healthy count. Smoke only runs authenticated v3 checks for dev, has obsolete prod-v2 commentary and leaves created accounts. Status `deployedAt` is build time, opaque health responses are not authorization checks, and root ignore:52 excludes the changelog needed by the no-argument fallback. These are source-level limits on assurance, not evidence of a live failure.

## Unverified Handoffs

- `DEPLOY-U01`, management/storage reach: prep-vm.sh:62-68 publishes management HTTP on an unspecified host address with Docker socket access; edge compose:26-29 publishes admin port similarly. Comments rely on router/LAN/VPN restrictions, not bindings enforcing them. Ecosystem DB service is on a per-stack network but `internal` is a name, not `internal: true`; MinIO and API also join shared proxy. Inspect actual firewall/router/interface policy, Docker network membership, operator accounts and upstream image auth before claiming internet exposure, cross-env data access or host control. No socket, panel, storage or VM contacted.
- `DEPLOY-U02`, context/credential inclusion: root ignore:30-35 excludes root env variants but only selected nested names; 57-60 deliberately retains Git metadata. Repo-root Dockerfiles use targeted copies, except social/marketing copy their package subtrees. Actual nested env/local-secret inclusion, Vite env handling, cached layers, remote cache visibility and historical Git objects were not inventoried or built. Per-directory `.dockerignore` files do not independently protect repo-root contexts. No secret in an actual image/bundle demonstrated.
- `DEPLOY-U03`, operator env/SSH trust: lib.sh:18 and deploy.yml:75/177 source operator-controlled shell files; Python helpers parse their env files as text. CLI credential JSON is passed as process arguments in lib/smoke, contrary to lib's broad comment about no command-line secrets. Same-user/root process visibility, file permissions/umask, secret-agent forwarding and SSH host-key verification depend on deployed host/action behavior. The SSH action inputs have no explicit host fingerprint. Missing local pin is not proof of an active interception; no network test.
- `DEPLOY-U04`, unescaped status JSON: build-status.sh:71-84 interpolates build/operator version/origin/commit strings. Quotes/newlines can corrupt or add JSON fields; no remote attacker control of those inputs established. Browser display uses textContent; health-fetch targets can be operator-chosen and opaque success is weak. No demonstrated remote XSS, credential leak or SSRF. Preserve useful public status without calling it a deployment attestation.
- `DEPLOY-U05`, credential/error/log lifecycle: deploy-stacks.py:61-67,112-123,139-144 and sync-npm.py:51-57,70-76,92-96 can print upstream error bodies. E2E workflow:80-96 prints logs/uploads traces for seven days with a test-provider secret in job env. Smoke:63/74 prints failed signup/login responses. A protected-value source reaching those outputs was not demonstrated; do not manufacture a secret-bearing error and call it production disclosure. B-4's fixed API automatic logger does not certify these independent sinks, retained CI traces or historical backups.
- `DEPLOY-U06`, configuration/producer integration: ecosystem API env:88-101 does not explicitly provision a JWT signing-key override, and RTC env:140-141 does not fix a verifier base. Effective settings, other injection paths, default-key ownership and BP-3 need actual API/RTC integration; omission alone is not proof of an exploitable deployment. Frontend production-origin fallback comments, public/internal API split, preview envsubst and forwarding of caller paths/headers likewise require direct consumers. No authorization safety inferred from nginx/User-Agent routing.
- `DEPLOY-U07`, operational tool reconciliation: deploy-stacks.py's deprecated GitOps path uses one dev ref for all targets; env_for omits several origins now used by compose. sync-npm reconstructs proxy configuration with access-list id zero and empty advanced_config/locations; running it may erase manually added restrictions. These are operator-selected desired-state operations, not demonstrated unauthorized mutation. Preserve intentional public app access while verifying private/admin exceptions and D91 old-service retirement operationally.
- `DEPLOY-U08`, external supply chain: actions and images use mutable tags; prep obtains packages and an optional latest executable remotely; weekly mirror copies upstream-selected images. Dependabot and frozen lock declarations are controls, not proof of trust or absence of advisories. No upstream source, lock transitive code, attestation, signature, image digest or package vulnerability scan was performed.

## Offline Verification

All probes used Git reads, Ruby built-ins/Open3 and shell built-ins/system grep only. No actual deployment script, Python operational module, Docker command, package manager, SSH, curl, browser or network API was run. Syntax checks do not execute script bodies.

- Manifest/counts: `git ls-tree -r --name-only <pin> -- <assigned paths>`; `git show <pin>:<path>` for complete source; Ruby `s.count("\n")` and `s.lines.count`; `git rev-parse <pin>:<path>` for each blob. Independently summed 37/3,193/3,200, with all source batches within tool limits.
- Historical comparison: `git rev-parse <old-pin>:<path>` versus `<pin>:<path>` for all nine B1 and five RTC paths. Thirteen equal, root ignore unequal, as explicitly partitioned above. This compared blobs without reading historical runtime content anew.
- P1: synthetic nonempty assignment piped to the exact basic-regex predicate returned 1; extended-regex control returned 0. No real env file, secret generation or sed overwrite used.
- P2: inert `bun` function returned failure only for `install --frozen-lockfile`, captured arguments and allowed `install`. Exact fallback shell expression returned success after two calls. No dependency resolution or installer code executed.
- P3: pinned gate script executed in `bash -c` with a function shadowing `git`; name-only output contained only synthetic `api/app/services/auth.py`, numstat only a synthetic 600-line addition. Empty-body control exited 1 (size, record, repro violations); bare exemption marker exited 0. The script's real decision logic, not a rewritten equivalent, produced these results. No Git mutation, PR or merge tested.
- P4: pinned-string assertions confirmed CI SDK producer 1.3.14 versus CD latest and counted three unfrozen fallbacks. Static declarations only, not compiler-drift evidence.
- All three assigned package manifests parsed with Ruby JSON. `bash -n` passed all six assigned `.sh` files: status builder, social entrypoint, security gate, prep, lib and smoke. Python/YAML/nginx/Docker semantic validators were not run; no external parser installed.

Minimal replay of P1/P2, safe in memory (synthetic value is a canary, not a credential):

```bash
printf '%s\n' 'MINIO_PASSWORD=SYNTHETIC_CANARY' | grep -q '^MINIO_PASSWORD=.+'
# exit 1
printf '%s\n' 'MINIO_PASSWORD=SYNTHETIC_CANARY' | grep -Eq '^MINIO_PASSWORD=.+'
# exit 0
bun() { printf 'inert call: %s\n' "$*"; [[ "$*" != 'install --frozen-lockfile' ]]; }
bun install --frozen-lockfile || bun install
# two inert calls, final exit 0
```

P3 replay uses only the pinned gate source in memory:

```ruby
require 'open3'
pin = 'f7aabdb26346752141f46f19c393dbadfd25ddd2'
gate = IO.popen(['git', 'show', "#{pin}:scripts/security-gate.sh"], &:read)
shim = <<~'SH'
  git() {
    if [[ "$1" == diff && "$2" == --name-only ]]; then
      printf '%s\n' 'api/app/services/auth.py'
    elif [[ "$1" == diff && "$2" == --numstat ]]; then
      printf '600\t0\tapi/app/services/auth.py\n'
    else
      return 99
    fi
  }
SH
[['', 1], ['SECURITY-GATE-EXEMPT', 0]].each do |body, expected|
  out, err, status = Open3.capture3({'PR_BODY' => body}, 'bash', '-c', shim + gate)
  raise "unexpected gate result" unless status.exitstatus == expected
  puts out
end
```

## Design Intent And Limits

1. Intended behavior: supply generic API/SDK/RTC deployment and reliable public frontend delivery with environment-specific origins, operator-owned configuration, usable local bootstrap and inspectable diagnostics. Preserve D41's node-readable/PWA product, D56's content-blind telemetry and D60's generic node. Private content is protected by API authority, not a secret crawler User-Agent or encryption-by-default.
2. Changed behavior: none. This receipt changes no runtime, deployment, credential, test or central documentation. Proposed close conditions above are not implemented changes or operator authorizations.
3. By-design conflict: none introduced. Body tokens, JS-readable cookies, intentional public metadata/read grants, operator access, HTTP local management/development and telemetry are not indiscriminately flagged as vulnerabilities. Public-source passwords and bypassed producer/method constraints are different properties.
4. Conventional deviation: operator-readable storage, deliberate non-HttpOnly SDK storage and telemetry have existing intent; no new blanket requirement to eliminate them. Firewall-based private management is a stated deployment assumption, not evidence this host enforces it. Exemptions are deliberate, but their promised review/reason is not mechanically checked.
5. Untested intent risk: actual cold bootstrap, authenticated smoke flow/cleanup, environment isolation, signed URL host compatibility, preview/private fallback, PWA session restoration, package publication and coherent protocol rollout were not exercised. No risk acceptance for a fix or release is implied. Any repair needs its own red/green or appropriate static gate, fresh design-intent review, KB write-back and required independent/model-diverse sign-off.

No live credential validity, deployed reachability, successful unauthorized read/write, image/bundle secret, malicious package, server compromise, historical exposure closure, security finding repair, current-level advancement or whole-project pentest claim is made. This is a bounded L1 source receipt with local hygiene/process evidence and explicit follow-up debt; the coordinator must disposition the open findings before treating the protocol L1 gate as passed.
