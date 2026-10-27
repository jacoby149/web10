# Current Protocol L1 Executable Exclusion Accounting

Integration: referenced current reports/reviews now live alongside this receipt; `l1-current-index.md` owns the current finding/repair/sign-off disposition.

Date: 2026-10-27. Model: `openai/gpt-6.1-sol` (routed ID `openrouter/openai/gpt-6.1-sol`).
Pin and observed HEAD: `f7aabdb26346752141f46f19c393dbadfd25ddd2`.
Disposition: **selected first-party protocol L1 read-manifest exhaustive under the explicit boundary below; findings, integration and sign-off OPEN. No security PASS.**

Only this scratch receipt is written, via apply_patch. No application, test, central record, queue, changelog, original receipt, credential or deployment changes; no installs, builds, live calls, commits or pushes. Pre-existing dirty settings/B-8/tests/central documentation were left intact. Runtime evidence and counts come from pinned Git blobs, not the working settings overlay. Documentation reads are orientation, not evidence that an uncommitted repair exists at HEAD.

## Orientation And Contract

Read the complete current deploy, edge-review and SDK-artifact manifests; historical backend inventory/index, API index, SDK source/runtime-artifact index and preview receipt; current API review; security method/checklist, learnings, strategy, I1-I6 overview, thesis, strategy directory and relevant plan/lane/changelog state. Historical queue ticks are coverage, not current assurance. The current API review's evidence corrections and the edge review's exemption/backup qualifications remain binding on any consolidated summary.

Onboarding: reuse B-2/BP-3, S-1, joint A-01/F-01, S-6 and existing provenance obligations; do not allocate duplicate findings for inherited behavior. Recession: check every historical byte-equality claim, including preview rather than assuming the entire directory is unchanged. Obvious gap: a public JS file is executable even inside `docs/`; a workflow invocation or Docker COPY is not coverage. Frontend consumers, external implementations and deployment can invalidate a protocol guarantee, and their explicit deferral cannot certify that guarantee.

Wave 1 here means API/SDK/RTC plus their selected first-party packaging, copy, serving, bootstrap and deployment producers. Root helpers requested by the operator are included even when not protocol runtime. Frontend implementations and unrelated operational products remain Wave 2, not trusted or certified. The node's own C+I model assumes trustworthy third-party dependencies/interpreters; dependency compromise is an explicit external assumption, not proof established by this scan. Availability remains a separate reliability track.

## Newly Completed Reads

Every logical line, including comments/blanks and unterminated EOF, of these **12 paths / 821 newline bytes / 823 logical lines** was read against all six classes. These are disjoint additions to the three edge receipts and the API refresh, not imports implicitly credited as reads. Inclusive coverage is `1` through the Logical count.

| Path | Newlines | Logical | Git Blob |
|---|---:|---:|---|
| `scripts/ci-failures.sh` | 33 | 33 | `35c8148f1ae69f45c7f3366e86ddb1b2343d7dee` |
| `scripts/dev-shot.sh` | 91 | 91 | `8d721756a720c138039288c553d82c63e8380046` |
| `scripts/link-health.sh` | 98 | 99 | `353c943e42465b58fc398ee4b12edcc593e18af6` |
| `scripts/run-e2e.sh` | 42 | 42 | `60011d041b4a76579d69c676edf3309fe0e93dde` |
| `scripts/screenshot.sh` | 52 | 52 | `04b8c4ef67802f026c498691e188cf38bc021030` |
| `ui/vite.config.js` | 31 | 31 | `8996417466180ae49dbb1210dd9a92a71ae55a2a` |
| `marketing/marketing-ui/vite.config.js` | 38 | 38 | `c1d9d5ae365ebb3be100148c1f3b422ff123105e` |
| `marketing/web10-social/vite.config.ts` | 58 | 58 | `7b162b8fb7e1af4660a7cad7f4b1ab5f1b1a3d69` |
| `ui/tsconfig.json` | 28 | 29 | `57112cf38aaef196f174aff8584d315acf8d1c21` |
| `marketing/marketing-ui/tsconfig.json` | 41 | 41 | `1110ffa15558fce7b31a83d252db95c460db2670` |
| `marketing/web10-social/tsconfig.json` | 40 | 40 | `93bfa5fa234248546aa095be6e8dcac5118d10cf` |
| `marketing/web10-social/preview/card.mjs` | 269 | 269 | `728f5ac2eece7efbea1b843054e1dec2d0f81edc` |

Root-helper subtotal: 5/316/317. Frontend producer-config subtotal: 6/236/237. Changed preview producer: 1/269/269. These are physical paths, not executable LOC or unique-byte counts.

### Actual Reference Closure

Inspected pinned workflow references across all ten workflow files, covered Dockerfiles for API/RTC/SDK/UI/marketing/social, and their package script declarations. Root helpers are not all workflow-called: the actual direct root calls are `scripts/link-health.sh`, `scripts/security-gate.sh` and `scripts/test-security-gate.py`. Deploy's `bash scripts/smoke.sh` runs after changing to `ubuntu-deployment`, so it is the already-covered Ubuntu helper, not a nonexistent root smoke script. E2E's `bash run-shard.sh` runs in `e2e`, not the root. `ci-failures`, `dev-shot`, `run-e2e` and `screenshot` are operator helpers requested explicitly here; `dev-shot` calls the now-read screenshot helper.

The gate shell already has full coverage in the 37-path deploy receipt. Additional actual first-party test references were read completely for accounting/context, but remain test evidence excluded from the protocol production denominator:

| Path | Newlines / Logical | Disposition |
|---|---:|---|
| `e2e/run-shard.sh` | 73 / 73 | Actual workflow launcher; test stack/schema/spec selection, not production deployment |
| `e2e/wait-for-stack.sh` | 71 / 71 | Called by shard and root E2E launcher; test readiness, not an auth proof |
| `scripts/test-security-gate.py` | 69 / 69 | Actual workflow test helper; synthetic diff tests, not runtime enforcement |
| `sdk/vitest.config.ts` | 9 / 9 | Copied by SDK/marketing Dockerfiles; test configuration only, not a runtime producer |

These four files total 222 newlines/logical lines. Tests were not executed. Fixtures, test compose/proxy files, browser tests and screenshot harness descendants remain evidence exclusions; reading these four does not scan the whole E2E/test graph. Test-only bootstrap account literals are not reproduced or validated.

`marketing/marketing-ui/scripts/render-demo-icons.mjs` was also read completely (44/44), as an explicitly excluded Wave 2 developer asset producer. Its separate `render:icons` command is not called by `build`, Dockerfiles or workflows. It enumerates local demo directories, loads local SVGs in Playwright and writes raster icons. It neither produces the SDK nor changes protocol admission. Browser/SVG/file-system behavior remains untested, not certified. No script hidden behind this command is credited transitively.

SDK producers are inline package commands already fully read in the SDK receipt: core/RTC Bun builds, TypeScript declaration emission, browser IIFE build and explicit alias copy. API/RTC Dockerfiles have no excluded first-party entrypoint shell script. UI/marketing/social `build` delegates to `tsc -b && vite build`; the three Vite and three TS configurations above close the previously excluded first-party producer configuration edges. Vite plugins/TypeScript/Bun are external code, not skipped first-party producers. Status bake and social entrypoint already belong to the deploy receipt. App source/HTML is build input, explicitly deferred below, not an assertion that its contents were reviewed.

## Preview Pin Reconciliation

Compared exact Git blob bytes against `db325cd3ca242774ed0afdaf743fdf35419da1e7`, not merely file names or historical line counts:

| Current Path Under `marketing/web10-social/preview/` | Current Newlines / Logical | Result |
|---|---:|---|
| `card.mjs` | 269 / 269 | **Changed**, historical 260/260; full current read above |
| `markdown.mjs` | 79 / 79 | Equal, blob `c79e4a3d978d7a94da294c560ae5b0ec6a09a013` |
| `server.mjs` | 83 / 83 | Equal, blob `0b6f18363272eddca54bd2a472e7263333e90274` |

Current preview tree is exactly 3 paths/431 lines. The two equal files retain **historical credit only**, 2/162/162, even though their complete contents were read as supporting context here. No fresh scan credit or renewed sign-off for them. It would be false to call all three byte-equal or freshly scanned.

The card delta adds provider derivation from `new URL(API_ORIGIN).hostname` and replaces the old literal followers-group prefix with that provider. Full read covered module/origins/limits, truncate, all anonymous read/thumbnail/render helpers, author/avatar and group-face selection, generic private fallbacks, group/post/watch/short/profile entrypoints and EOF. Operator origins stay trusted configuration; caller IDs go into JSON and encoded canonical paths, not outbound host selection. The server-to-API internal host equaling the node's public provider is an integration assumption, not established by deriving a hostname. No wrong-provider access or public-grant bypass demonstrated.

Existing preview renderer/public-grant/order/error-sink handoffs remain OPEN; Markdown stripping is not escaping. A missing post still produces a generic rendered card locally rather than proving a 404. Unchanged server/markdown evidence is not authorization or renderer certification.

## Six-Class Disposition

Applied to every newly included file; local absence of a mechanism is N/A, not a downstream safety claim.

| Class | File-Local Result And Limits |
|---|---|
| 1. Access control, I1/I2/I3/I5 | Root helpers use operator/CI authority, not document auth. No new JWT evaluator or store gate to certify. Preview omits credentials intentionally and relies on anonymous API enforcement; failed reads produce generic specs. Vite/TS aliases/options are not auth gates. Existing API/SDK findings remain; no new demonstrated unauthorized read/grant here. |
| 2. Injection | Shell arguments, quoting, subprocess strings, fixed/output paths, regex terms, Vite aliases and JSON forwarding read completely. Root run-e2e expands operator arguments into a container `sh -c` command; this is a trusted CLI input boundary, not a demonstrated remote command exploit. Link inputs are repository-controlled JSON. Markdown/HTML survives into renderer specs, not local HTML evaluation; renderer escaping remains L2+. No caller input eval/SQL/filesystem sink in card. |
| 3. Boundaries/transport, I5/I6 | Screenshot URL/destination and dev directory/port are operator-controlled; helpers intentionally fetch/launch tools. Link health follows redirects with curl, does not establish a remote-user-controlled SSRF source. Preview fetch destinations are fixed operator-origin endpoint paths, with IDs in JSON and no token/header forwarding. Vite `host: true` is a dev/preview serving choice, not proof of production exposure. Widened UI env prefixes deliberately expose configured public frontend values; actual secret-bearing build inputs were not inspected. |
| 4. Availability/reliability | Root E2E failure skips teardown (offline proof below); dev-shot process-tree cleanup/readiness and reuse of existing server, link-health error classification/shared temp path, CI log truncation/pipeline failure and network timeouts remain reliability/evidence limits. No load test or new C+I issue inferred from these. |
| 5. Lifecycle | Screenshots/logs, temporary response body, test volumes/processes, preview media capability/crawler retention and build inputs inspected at their local interfaces. No local preview secret cache or persistent grant. Fixed `/tmp/link-health-body` lacks per-run allocation; concurrent/symlink/ownership scenarios require separately authorized filesystem evidence. No actual file overwrite, secret capture or permission exploit demonstrated. External logs/artifacts/old containers remain operational debt. |
| 6. Hygiene/supply chain | No new credential disclosure demonstrated in the 12-file addition. ci-failures prints selected upstream log lines intentionally; a reachable protected source/audience is not proved. npx screenshot pins a version but downloads external code; E2E npm install is unfrozen and image/tool tags are assumptions, not proven compromise. Existing frozen-install fallback/floating-producer/default-credential/provenance obligations are not closed by these reads. Compiler strictness/noEmit/aliases describe tooling, not runtime validation. |

No new confirmed protocol C+I finding is assigned by this supplement. The fixed temporary pathname and trusted `sh -c` interpolation are explicit candidates/boundaries, not promoted exploit claims without attacker/source evidence. No source repair or risk acceptance is performed.

## Offline Proofs

Executed 2026-10-27, using only pinned source, in-memory VM/shell doubles and local Git reads. No actual deployment/helper body with real network/Docker/package-manager access was run.

P1: Node VM loaded actual pinned card and markdown modules; inert fetch captured JSON. With API origin `https://node.invalid`, provider equals `node.invalid` and profile group equals `node.invalid/groups/users/alice/followers`. Synthetic display-name markup survives into the render spec. Every request uses that fixed origin and omits token. After fake read denial, a post ID shaped like an unrelated URL produces exactly read + generic render calls. All assertions passed, network=0; expected experimental VM warning only. This proves local composition and fallback, not renderer XSS, actual API denial/public grants, internal/public provider equivalence or private-content access.

P2: Executed actual pinned `scripts/run-e2e.sh` inside an isolated `bash -c` with shell functions replacing **all** Docker and nested bash calls. Fake proxy inspection returned a synthetic loopback IP, Docker run returned 23, and a down operation would emit a marker. Observed exit 23, test-failure marker present, teardown marker absent. This confirms `set -e` exits before `EXIT=$?` and `down -v` after a failed test. No container, test account, volume, filesystem fixture or network was touched. Reliability evidence only.

P3: `bash -n` supplied complete pinned contents of each of the five root helpers on stdin; all passed. Syntax is not semantic safety. Git enumeration/counts/blob comparisons independently checked the manifests. One whole-tree counting attempt rejected binary content as UTF-8; it was abandoned, not interpreted as a scan result. Final whole-tree exclusions are **path counts**, not bogus binary LOC; selected text counts were separately completed successfully.

Minimal safe replay of P2 (from repo root; no writes):

```ruby
require 'open3'
pin = 'f7aabdb26346752141f46f19c393dbadfd25ddd2'
source = IO.popen(['git', 'show', "#{pin}:scripts/run-e2e.sh"], &:read)
shim = <<~'SH'
  docker() {
    if [[ "$1" == inspect ]]; then printf '127.0.0.2';
    elif [[ "$1" == compose && "$*" == *' ps -q '* ]]; then printf 'INERT_PROXY';
    elif [[ "$1" == run ]]; then printf 'INERT_TEST_FAILURE\n'; return 23;
    elif [[ "$*" == *' down -v'* ]]; then printf 'INERT_TEARDOWN\n'; fi
  }
  bash() { return 0; }
SH
out, err, status = Open3.capture3('bash', '-c', shim + source)
raise unless status.exitstatus == 23 && out.include?('INERT_TEST_FAILURE')
raise if out.include?('INERT_TEARDOWN')
puts 'synthetic failure skips teardown; real Docker/network calls = 0'
```

## Selected Denominator

The exact selected path set S is the union below; all referenced manifests enumerate physical paths, not transitive imports:

| Disjoint Selection | Paths |
|---|---:|
| Packaging + SDK artifact + deploy tables (edge-review union) | 77 |
| All pinned `api/app/**/*.py` | 61 |
| SDK source browser/http/index/types/v3/rtc-index (token source already in 77) | 6 |
| Historical B1 root files except `.dockerignore` (already in 77) | 8 |
| All `api/rtc/` paths | 5 |
| All three social `preview/*.mjs` paths | 3 |
| Five root helpers in new-read table (gate already in 77) | 5 |
| Three frontend Vite and three TS configs in new-read table | 6 |
| **Selected S** | **171** |

S totals **30,417 newline bytes / 30,451 logical lines**. Physical union, not deduplicated runtime streams. In particular the four equal browser artifacts are still four physical paths; the SDK receipt separately gives its unique-byte accounting.

Current-pin complete-read receipts cover **105 paths / 20,910 newlines / 20,940 logical lines**: prior three-edge union 77/11,987/12,015 + API refresh 16/8,102/8,102 + this supplement 12/821/823. Existing receipts' reads are attributed to their authors, not falsely claimed as independently rerun exhaustive scans in this session.

The remaining **66 selected paths / 9,507 newlines / 9,511 logical lines** retain byte-equal historical coverage only: 45 API files + six SDK sources + eight B1 + five RTC + two preview files. API diff from `8af7e0fce922cada30002dff190a5bb3abcf4f63` has exactly 15 changed/added paths, all contained in the current API review's 16 complete files; unchanged settings is also refreshed there. The 15 changed paths total 7,962 logical lines. The six SDK sources compare equal to `caeed44278adb65d19f5c737ed9188ccf589b69c`; SDK token is freshly included elsewhere. B1/RTC comparisons are recorded in deploy and preview comparison above is independently checked here. No deleted marketing API file receives current coverage credit.

**Selected S unread debt: 0 paths, 0 lines.** This closes the denominator omission in the edge review, not PROTOCOL-01, a finding, a required independent review, or any higher rung. Current API and edge review corrections still apply. Historical equality preserves source evidence only, never deployment, new probe or fresh-security-review credit.

## Exact Excluded Debt

Pinned tracked tree contains **1,512 paths**. Subtract S first, then apply the following ordered rules, removing matches before the next rule. This makes exclusions disjoint and reproducible without pretending every asset is executable. `p` is the full repository-relative tracked path; regexes use Ruby syntax.

| Order / Category | Exact Selector After Subtracting Prior Sets | Paths |
|---|---|---:|
| Tests/evidence | `(^e2e/|/tests/|/__tests__/|\.test\.|\.spec\.|/screenshots/|playwright[^/]*config|^scripts/test-security-gate\.py$|^sdk/vitest\.config\.ts$)` | 514 |
| Third-party public minified JS | `/public/.*(?:hls|peerjs)\.min\.js$` | 4 |
| Wave 2 frontend/shared/scaffolder | `^(ui/|marketing/(marketing-ui|web10-social|shared|web10-cli)/)` | 486 |
| Wave 2 operator/outreach | `^(night_owl/|persona-orchestration/|knowledge-base/strategy/outreach_sourcer\.py$)` | 17 |
| Documentation/presentations | `(^knowledge-base/|^ai-pack/|\.md$|\.txt$|^sdk/presentations/|^sdk/figures/)` | 306 |
| Explicit residual below | No catch-all executable assumed inert | 14 |
| **Excluded from S** | **514 + 4 + 486 + 17 + 306 + 14** | **1,341** |

Reconciliation: **171 + 1,341 = 1,512**, every tracked path assigned. This is inventory, not a claim of 1,512 scanned paths. Counts include assets, docs and configuration; they are not counts of unreviewed executable files. Exactly 609 excluded paths match the explicit executable-language suffix inventory `\.(?:[cm]?js|jsx|ts|tsx|py|sh|html)$`: 275 test/evidence, four vendor, 318 frontend/shared/CLI, seven operator and five presentation HTML. This suffix inventory is not a semantic classifier or proof that other extensions cannot execute. The five context-only reads above remain excluded, not silently added to S.

### Public Executables

Only the three named public SDK copies are already covered; no blanket `public/` or `docs/` safety exclusion:

| Deferred First-Party Public JS | Newlines / Logical |
|---|---:|
| `marketing/marketing-ui/public/docs/feed/script.js` | 341 / 342 |
| `marketing/marketing-ui/public/docs/groups/script.js` | 418 / 419 |
| `marketing/marketing-ui/public/docs/hello/script.js` | 126 / 126 |
| `marketing/marketing-ui/public/docs/media/script.js` | 816 / 816 |
| `marketing/marketing-ui/public/docs/messages/script.js` | 452 / 453 |
| `marketing/marketing-ui/public/docs/notes/script.js` | 341 / 341 |
| `marketing/marketing-ui/public/docs/query/script.js` | 294 / 294 |
| `marketing/marketing-ui/public/docs/sharing/script.js` | 415 / 415 |
| `marketing/marketing-ui/public/docs/tasks/script.js` | 249 / 250 |
| `marketing/web10-social/public/serviceWorker.js` | 173 / 173 |
| `ui/public/registerWorker.js` | 7 / 8 |
| `ui/public/serviceWorker.js` | 17 / 18 |
| **12 paths** | **3,649 / 3,655** |

All twelve are **unscanned Wave 2 implementation debt**, not certified. Demo scripts are independent protocol consumers, not producers of the selected SDK implementation. Service workers can affect app caching/delivery and credentials; deferring their application-level implementation does not attest served SDK freshness or browser session safety. HTML (including inline scripts), frontend auth/consent/OAuth/token-vault flows, social/shared rendering/data layers and CLI templates remain in the 486-path Wave 2 set, with 318 executable-language paths. This explicitly limits any protocol guarantee requiring those consumers: inspect necessary direct edges at L2 and complete app/session/cache assurance in Wave 2; do not call their behavior safe because the SDK source was covered.

The four unscanned vendor files are `marketing/marketing-ui/public/docs/peerjs.min.js` (8/8), `marketing/marketing-ui/public/docs/media/hls.min.js` (2/2), `marketing/marketing-ui/public/hls.min.js` (4/4), and `marketing/web10-social/public/hls.min.js` (4/4): **4 paths / 18 newlines / 18 logical lines**. They are treated as third-party libraries outside the first-party node C+I implementation assumption, not inert assets or audited code. No provenance, dependency implementation, advisory, tamper or downloaded-byte verification is provided. Compromise of these or npm/transitive/image/action/interpreter dependencies is an explicit residual risk, not certified away.

Frontend locks `ui/bun.lock`, `marketing/marketing-ui/bun.lock`, `marketing/web10-social/bun.lock` are **3 paths / 3,044 newlines/logical lines**, unscanned in the Wave 2 set. Their first-party producer constraints were inspected, including existing fail-open frozen-install findings, but their declarations and dependencies are not newly audited here. API/RTC/SDK lock declarations already covered elsewhere do not cover these locks or external code.

### Other Executable And Residual Debt

Wave 2 operator set has 17 paths, seven executable-language paths: `knowledge-base/strategy/outreach_sourcer.py`, `night_owl/{install_cron.sh,night_owl.py,texter.py,vision.py}`, `persona-orchestration/{seed_personas.py,seed_personas.sh}`. These are outreach/cron/persona tooling, not required producers/verifiers of the generic protocol deployment reviewed here. Their credentials, authority and mutations are unscanned, not certified. Configs/assets/dependency declarations in those directories stay in the same 17-path debt set.

Documentation set includes five **unscanned executable HTML presentations**: `sdk/presentations/{README.html,server.html,ui_dev_pt1.html,ui_dev_pt2.html,user.html}`. They are historical presentation surfaces, not SDK package entrypoints/build producers; their scripts are not assumed safe. Reclassify and inspect if active consumers make them necessary to a protocol claim. Markdown examples and KB/AI tooling instructions are documentation, not executed as part of this scan.

The 14 residual paths are `.conductor/settings.toml`, `.gitattributes`, `.gitignore`, `LICENSE`, `sdk/.gitignore`, `sdk/LICENCE`, `sdk/typedoc.json`, `web10 Contributor Agreement.pdf`, and the six tracked `.context/brand-assets/{apple-touch-icon.png,favicon.ico,icon-192.png,icon-512.png,keys-mark-source-transparent.png,og-image.png}`. They are workspace/VCS/docs-tool configuration, licenses and binary assets, not protocol-runtime producers identified by these workflows/Dockerfiles. They are inventoried, not scanned. `sdk/typedoc.json` configures the separate documentation command, not shipped runtime builds. Actual ignored/untracked environments, Git history contents, live volumes and images are outside the tracked denominator entirely.

## Remaining Assurance

The selected first-party protocol read-manifest is now exhaustive at this pin, **not** the whole product or security guarantee. Exact unscanned tracked debt is the disjoint 1,341-path exclusion inventory above; zero selected paths remain unread. Context-read tests and icon tooling are still excluded from production scan credit. Byte-equal historical files are not fresh scans. Deleted D91 marketing API source is retired source, not deployed-remediated evidence.

Open local findings cannot be laundered into exclusions: B-2/issuer defaults, SDK sender/response integrity, URI-output, producer/lock/provenance and current API freshness/single-use/schema/revocation concerns retain their calibrated dispositions in original receipts and reviews. OAUTH-02 availability consequences are not a confirmed C+I exploit; backup modes, SQL/schema/merge/race reachability, protected error sources and live exposure remain unverified where stated. Gate exemption is intentional policy, with reason/grammar/enforcement limitations, not an accidental application-auth bypass. No finding closes by this accounting.

Still owed: bounded repairs and red/green evidence, central incorporation by the coordinator, fresh independent/model-diverse three-dry sign-off, L2 direct callers/sinks, L3 transitive protocol services, L4 issuer/configuration/artifact/rollout integration, actual public-grant/media/renderer and frontend session/cache behavior, external dependency/provenance trust, real branch/host/network/filesystem/credential policy, historical exposure/retained logs/backups, publication/deployment/cached-version evidence, and Wave 2 implementation scans. No live secret values, validity tests, private API calls, actual renderer/browser/DB/Docker execution or operational cleanup supplied.

Design intent: report only, no behavioral delta or accepted implementation risk. Preserve generic node D60, readable-node/PWA D41, content-blind telemetry D56, intentional body-token transport and JS-readable cookies, legitimate public/group access and operator bootstrap. No new blanket hardening, exemption redesign or credential rotation is authorized. **No protocol L1 security PASS, advancement to L2, whole-project completion, or release/deployment certification.**
