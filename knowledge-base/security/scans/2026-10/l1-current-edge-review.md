# Current L1 Edge Evidence And Design Review

Integration: inputs were promoted from `.context/` alongside this review; `l1-current-exclusions.md` closes selected-denominator accounting, not findings/sign-off.

Date: 2026-10-27. Reviewer: fresh OpenCode review session.
Model: `openai/gpt-6.1-sol`; exact routed ID: `openrouter/openai/gpt-6.1-sol`.
Runtime evidence pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2`, independently verified as HEAD.
Inputs: `.context/l1-current-packaging.md`, `.context/l1-current-sdk-artifacts.md`, `.context/l1-current-deploy.md`.
Disposition: **bounded evidence accepted with the corrections below; not a security PASS or current protocol L1 gate closure**.

This is a fresh read-only evidence/design review, not a second exhaustive line-by-line scan of every input blob. All three receipts were read completely; key implementation boundaries, manifest arithmetic and safe probes were independently checked. This reviewer did not author those receipts in this session, but uses the same model family. Fresh-session review is not model diversity, three-dry convergence or independent human assurance.

Only this file is written. No runtime, tests, central records, queues, changelog or original receipts are edited. No production access, network, real credentials, installs, builds, operational scripts, database connections, commits or pushes. Existing dirty settings/central-document/test work is outside this review and is left intact. Working documentation is orientation, not proof of runtime changes at the pin.

## Review Blockers And Corrections

### 1. Gate Exemption Is Deliberate; Do Not Count Its Existence As A New Vulnerability

References: `scripts/security-gate.sh:17-18,70-74,119-120`; `ai-pack/ai-security-theory/the-gauntlet/README.md:89-94`; `.github/workflows/security-gate.yml:42-48,50-73`; deploy receipt:129-135.

The implementation and the method explicitly expose `SECURITY-GATE-EXEMPT` as an escape hatch. Skipping the size/record/repro checks is the interface, not an accidental missing authentication check. PR body is deliberately supplied to this decision by the workflow. The reason, small-change qualification and genuinely non-security classification are documented policy, but no reason parser, size constraint on exemptions or reviewer approval is implemented here.

Independent replay of the pinned script, with a shell function replacing Git diff output, confirmed a synthetic 600-line auth change with no test/record exits 1 without the marker and reports all three violations. A bare marker exits 0. The additional body `do not use SECURITY-GATE-EXEMPT here` also exits 0: matching is an unstructured substring, not an affirmative exemption declaration. No repository state or PR was changed.

**Correction to L1-DEPLOY-02:** retain a LOW process-policy/enforcement limitation, not a demonstrated new application-security exploit or an unauthorized bypass of a supposedly non-exemptible gate. The observed skip is deliberate. Missing reason/eligibility validation and incidental mention acceptance are real local facts, but whether automated enforcement is required rather than human review is an explicit policy decision still needed. Do not silently delete the escape hatch or invent a mandatory approval mechanism as established intent. A later fix needs a specified exemption grammar/authority and legitimate-exemption controls before it can claim to repair a defect.

The separate gauntlet job is not skipped by this script's early exit. Actual branch protection, approval requirements and merge authority were not inspected. A passing method script is not proof a PR could merge. `scripts/test-security-gate.py:14-65`, read but not run, always supplies an empty PR body and does not pin exemptions. It is an explicitly excluded test/helper dependency of the workflow, not an additional freshly scanned runtime file in the 37-file count.

There is a distinct documentation/implementation discrepancy: design-intent method README:160-178 says block presence is checked; the script has no such check. Touching a test pathname proves only presence, not an exploit or red-to-green result. Keep these process limitations visible without claiming the script can mechanically establish semantic security review.

### 2. Backup Permissions Are Conditional And Unverified, Not A Replayed Disclosure

References: `api/tools/extract_accounts.py:150-170,185-186,204-211`; packaging receipt:122-145,309-320,347-351; migration KB:128-132.

P6 was independently replayed and confirms the actual output call is exactly `open(path, "w")` with no keyword arguments, using an in-memory substitute. It neither creates a file nor observes filesystem permissions, ACLs, parent-directory traversal rights, encryption, umask, ownership or symlink behavior.

**Correction to L1-PKG-02 disposition:** confirmed absence of tool-enforced protection, with conditional filesystem confidentiality/integrity risk; actual insecure backup permissions and exploitation remain **UNVERIFIED**. The receipt already qualifies the proof correctly in its body; its finding title/status must not be compressed into a confirmed world-readable-backup vulnerability. Under ordinary POSIX creation semantics a permissive umask can permit broader file reads, but a protected directory or ACL can prevent effective access even with 0644. Existing destinations, links, truncation and path substitution require their own filesystem evidence and attacker preconditions. No filesystem exploit, race or production mode was demonstrated here.

The repo guard rejection was reproduced. `--allow-repo` is an explicit dangerous operator override; inability to discover a repo warns and proceeds. Neither is a remote-user bypass. The migration KB requires encrypted, access-controlled storage, while its example uses `/tmp`; that example alone does not prove the actual destination is insecure. Preserve complete hashes and the only backup in any future hardening. Safe filesystem regressions and deployment inspection require separately authorized follow-up; they were not performed.

### 3. Raw Mongo URI Output Is Confirmed, With A Real But Conditional Credential Source

References: `api/tools/audit_mongo.py:48-56`; `api/tools/extract_accounts.py:126-134,204-211`; packaging receipt:101-120.

Independent replay confirmed synthetic URI userinfo survives the successful audit CLI into captured stdout and extraction into manifest/stdout. The intercepted file-output payload also contains it. These use real pinned function bodies with only external imports removed and inert Mongo/storage substitutes. Unlike manufacturing a secret-bearing exception, this supplies a supported credential-bearing URI directly to the real output path; no exception is needed. **L1-PKG-01 stands as one local credential-output class across both tools**, not two independent incidents or a B-8 duplicate.

Preconditions: an operator supplies credentials in a URI and the resulting output/backup becomes accessible to an unintended reader. Credential-free defaults do not demonstrate a password leak. Account hashes/PII are intentional protected export contents; connection credentials are redundant extra material. No live credential validity, unauthorized log access, exfiltration or historical disclosure is established. Future redaction must consider secret URI parameters as well as userinfo while retaining useful diagnostics and complete account export.

### 4. Locks And Artifact Equality Are Not External-Code Assurance

References: packaging receipt:223-238; SDK receipt:58,98,170-180; deploy receipt:121-141,160.

Independent parsing/replay supports 63 API package records and 1,088 artifact declarations with the reported URL/hash syntax controls. It does not fetch or authenticate artifacts, inspect package implementations, establish absence of malicious code/CVEs, attest image provenance or prove deployed versions. A lock constrains selected bytes only to the extent the producer enforces it and the declared hashes/provenance are trusted. Do not promote inventory, checksum syntax or copy equality to dependency trust.

L1-DEPLOY-01 remains a MEDIUM conditional supply-chain integrity-control finding: two marketing Dockerfile sites and one social site explicitly fall back from frozen to unrestricted install. Inert shell replay returned success after exactly the frozen-failure and ordinary-install calls. No installer, resolver or image was run, and no poisoned dependency was demonstrated. ART-01 remains repeatability/control debt, not evidence of compromise. CI's Bun 1.3.14 declaration and CD's latest declaration were independently confirmed; compiler drift on those paths was not dynamically reproduced.

SDK replay reproduced local cookie attack denial, hostile sender acceptance and consent-response acceptance in the scoped runtimes. These establish bounded local behavior, not browser cookie planting, valid tokens, backend access or grants. Existing S-1 and joint A-01/F-01 remain open; S-6 remains metadata hygiene. Six orphan declaration/map paths and the older docs RTC IIFE retain provenance/correctness debt. No new build, publication or cache verification occurred.

## Exact Manifest Reconciliation

All counts are physical newline bytes versus logical newline-delimited lines, including unterminated EOF, not executable LOC. Independently counted Git blobs at the pin; SDK replay also checked inventory/copy equality and maps. Original manifest tables are the exact path lists; no path is added implicitly by a COPY, import or workflow invocation.

| Receipt | Paths | Newlines | Logical Lines | Result |
|---|---:|---:|---:|---|
| API packaging/tools including uv.lock | 8 | 2417 | 2417 | Seven-file subtotal 684 plus lock 1733; correct |
| SDK artifacts/config/token source | 32 | 6377 | 6398 | Correct; 24 dist plus three public copies plus four producer/config files plus token source |
| Deployment/producer edges | 37 | 3193 | 3200 | Correct; includes actual `.dockerignore`, not nonexistent `root.dockerignore` |
| Disjoint physical union | 77 | 11987 | 12015 | Receipt denominators, not 77 freshly rescanned files in this review |

SDK declarations are **1113 logical lines**, maps **10**, total **1123**, not 1224. This is a correction to the earlier requested denominator already made correctly by the SDK author, not a newly missing 101-line file. Four byte-equal browser files account for three duplicate streams: SDK unique-byte denominator is 29 streams / 3557 newlines / 3578 logical lines. Across the three disjoint manifests, that yields 74 unique streams / 9167 newlines / 9195 logical lines. Deduplication is accounting, not permission to skip different runtimes or certify source/build provenance.

Pinned tree enumeration confirms all four API tools, all 24 SDK dist paths, all ten workflow files (plus dependabot = eleven GitHub files), and all sixteen tracked Ubuntu files. The eleven Ubuntu runtime/configuration files are present in the deploy manifest; the other five are explicitly named documentation exclusions totaling 1426 logical lines. No omitted runtime was found inside those enumerated directories under the stated manifests.

### Executable Exclusions And Historical Credit

There is no whole-project/runtime-completeness claim. In particular, public docs/assets are not necessarily inert documentation:

- `marketing/web10-social/preview/{server,card,markdown}.mjs` are shipped backend runtime explicitly excluded by the deploy receipt, not silently credited as frontend or freshly reviewed here. Their historical receipt does not establish current closure.
- Public executable exclusions include `marketing/marketing-ui/public/docs/{peerjs.min.js,media/hls.min.js}`, demo `script.js` files, public HLS bundles and service workers. Only the three named public SDK copies are included by the SDK receipt. Do not fold all public runtime into a safe-docs exclusion or Wave 1 completion claim without an explicit protocol-relevance disposition.
- Root `scripts/{ci-failures,dev-shot,link-health,run-e2e,screenshot}.sh` and `scripts/test-security-gate.py` are outside the deploy fresh-read manifest. Workflow references do not scan them. The test helper was read for this review only; its filesystem-writing test suite was not executed.
- API app implementation and tests, six unchanged non-test SDK source files, frontend app/build-tool source and frontend locks remain outside these fresh edge denominators. Source imports and package manifests are not transitive code coverage. OAuth-era API changes and current callers still need their separately queued review.
- Eight root B1 paths retain historical credit only; changed root `.dockerignore` is freshly included. Five RTC paths likewise retain historical credit only. These thirteen are not added to the 77-file fresh receipt union. Historical source equality is not present operational assurance.

Thus the manifests are internally complete for their declared path sets, not proof that every deployed/protocol-relevant executable has been reviewed. Broad exclusions are disclosed, but promotion to a protocol gate requires explicit ownership/disposition of relevant excluded runtime, not quiet disappearance from the denominator.

## Probe Record

Executed on 2026-10-27, offline, from the repository root:

- Both packaging receipt Python proof blocks replayed using `python3 -I -B`, exit 0. All nine P1-P9 groups and declaration/count checks passed. Synthetic output was captured in memory; credential payloads were not printed. External imports/sinks were replaced as disclosed by the receipt.
- SDK published `node --experimental-vm-modules` replay, exit 0. Inventory/copy checks passed; ten maps parsed, 5121 VLQ segments, three absent source paths. Cookie controls, hostile auth/consent events, tokenless GET, shared-array/state-cookie controls and fake RTC ICE/reply differences matched the receipt. Only expected experimental warnings appeared. Fake windows/fetch/cookies/peers are not actual browser/server integration.
- Independently constructed Ruby/Open3 gate replay used pinned shell source plus an inert Git function. Empty body exit 1; bare marker exit 0; negated incidental mention exit 0. This extended the receipt's two cases without changing repository state.
- Independent Ruby/Open3 deployment checks reproduced basic-regex MinIO predicate exit 1 versus extended-regex control exit 0, and inert frozen fallback success after two calls. Three source fallback sites and pinned-CI/latest-CD declarations were asserted.
- Independent Git-blob arithmetic confirmed packaging/deploy counts. Scoped packaging/deploy working files matched the pin. HEAD was verified at the requested pin; dirty unrelated source/status text was not used as runtime proof.

These are behavioral/evidence probes, not a product test-suite run, repair regression gate, deployment or new exhaustive L1 scan. No actual filesystem permission test was run.

## Integrity Versus Availability

Retain the project's C+I scope: whole-collection memory use, malformed input failures, cleanup/supervision gaps, timeout behavior and readiness weakness are primarily correctness/availability debt, not extra I1-I6 vulnerabilities. This does not mean all operational mutation is merely availability. The proven MinIO predicate chooses credential regeneration and source shows secret-file replacement: that is an unintended configuration-integrity change as well as a possible outage precursor, without demonstrated attacker control or actual replacement on disk. Shared checkout races similarly could affect release integrity, but actual overlap, wrong delivery and adversarial influence remain unproved. Do not inflate these into remote compromise; do not erase their integrity relevance by blanket DoS labeling.

Migration bad metadata/duplicates/string truthiness into an inert sink establish local input-validation effects, not durable account corruption or remote account takeover. Service authorization, validation, idempotency and real operator-input provenance remain L2+. D41 intentional operator readability is not an exemption for unnecessary credential copies; availability concerns do not justify changing body-token transport, cookies, public grants or default encryption policy.

## Fresh Design-Intent Review

DESIGN-INTENT REVIEW (fresh session, read-only; same model, not diverse sign-off)

- Intended behavior: generic node packaging and deploy tooling must preserve operator-controlled configuration and usable bootstrap. Account migration preserves existing logins/hashes with protected, loss-avoiding backups. Browser/ESM/RTC delivery supports the PWA and creator data ownership; the method intentionally permits deliberate non-security exemptions.
- Changed behavior: none for operators, creators, fans, apps or nodes. This report corrects evidence/disposition only; it does not authorize an exemption redesign, backup rewrite, credential rotation, deployment or new risk acceptance.
- By-design conflict? No introduced conflict. Thesis D41's readable-node/PWA/no-default-E2E, D56 content-blind telemetry, deliberate body tokens, JS-readable cookies and direct privileged migration are preserved. Raw URI copies are not justified by these choices.
- Conventional standard violated intentionally? Existing deliberate deviations remain those documented in the thesis/learnings. The gate escape hatch is explicitly documented by the method; whether exemptions require machine-validated reasons/approval needs a decision, not a guessed requirement. Operator-protected credential export is intentional; unverified backup protection is not accepted as safe.
- Tests cover the delta? No runtime delta or test edits. Offline probes substantiate the bounded claims above; no filesystem exploit, dependency audit, clean build, real browser/session, database or deployment test is supplied.
- Untested intent risk: a future gate restriction could block legitimate maintenance; output hardening could lose the only backup, omit hashes or break supported legacy/current extraction and pilot selection; producer changes could alter analytics, public reads, consent or RTC. These remain unaccepted implementation risks requiring focused controls and a separate fresh review if a fix is proposed. This report cannot accept deployment/integration risk on the operator's behalf.
- KB write-back: not performed under the explicit scratch-only instruction. Coordinator must carry corrections/dispositions into central records if adopted. No finding is closed and no policy reversal is recorded here.

## Remaining Scope

Before protocol L1 gate closure: disposition B-2 and the confirmed URI-output class; keep filesystem protection conditional pending actual evidence; resolve gate policy/documentation mismatch without treating the intentional escape hatch itself as an exploit; retain frozen-install and producer/provenance obligations; reconcile relevant excluded executables and current API changes. Source fixes elsewhere do not close historical credentials, retained logs/backups or deployed exposure.

L2 caller/callee edges, L3 transitive services, L4 protocol rollout/issuer/artifact integration, dependency implementation/provenance, operational filesystem/network/branch policy, publication/deployed cache evidence and required model-diverse convergence remain owed. This same-model replay adds evidence, not diversity credit, fix verification or whole-project assurance.
