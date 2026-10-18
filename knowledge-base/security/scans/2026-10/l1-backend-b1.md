# L1 Backend B1: Root Configuration and ClickHouse Bootstrap

- Source pin: `db325cd3ca242774ed0afdaf743fdf35419da1e7`; scan date: 2026-10-18.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Disposition: **OPEN** (existing B-2 credential hygiene); coverage complete, security review/sign-off pending.
- File-local static scan only; no fixes, production activation, exploit, credential validity, or deployment compromise claimed.

## Orientation

- Read root AGENTS, security theory/checklist/design-intent gate, I1-I6 overview, thesis, learnings, security record, and current plan/lane/changelog.
- Onboarding: B-2 already owns source/default credentials; B-4 owns sensitive request/response logging. Reuse these IDs rather than duplicate findings.
- Recession: credential defaults remain in bootstrap/configuration source; historical hardening is not assumed merged or effective.
- Obvious gap: build-context exclusions, host publication, daemon access and environment provenance require integration evidence. Dependency integrity remains a known gap.
- Preserve D41 node-readability, I3 query-boundary enforcement without default DB row ACLs, operator configuration, body tokens, accepted cookies and D56 telemetry/useful diagnostics.
- I1/I2/I5 token verification and I6 federation behavior are not implemented by these files; no assurance inferred from their absence.

## Whole-File Coverage

All paths below are repository-root-relative. Every logical line, including comments and blanks, was read against all six checklist classes.
The assigned **729 LOC** is the newline count (`wc -l`); three files have unterminated final lines, giving **732 logical lines** read, not additional files.

| Whole tracked file | Newlines | Inclusive logical range | Per-symbol/range review |
|---|---:|---|---|
| `.dockerignore` | 61 | 1-62 | 1-29 build/editor exclusions; 30-43 secret/local scratch patterns; 44-58 subprojects/docs; 59-62 intentional Git metadata inclusion |
| `docker-compose.yml` | 121 | 1-121 | 1-19 proxy/socket; 20-39 API; 40-57 authenticator; 58-75 RTC; 76-84 SDK; 85-98 ClickHouse; 99-115 MinIO; 116-121 volumes |
| `web10.app.yml` | 116 | 1-116 | 1-20 API; 21-41 auth; 42-56 RTC; 57-71 CRM; 72-84 docs; 85-97 home; 98-112 mail; 113-116 network |
| `web10.dev.yml` | 74 | 1-74 | 1-19 API; 20-40 auth; 41-55 RTC; 56-70 CRM; 71-74 network |
| `clickhouse-config/999-ci-logging.xml` | 5 | 1-5 | Entire logger/console configuration |
| `clickhouse-init/001-init-v3-schema.sh` | 27 | 1-28 | 1-11 setup/defaults; 12-23 readiness/retry; 24-28 schema execution and table listing |
| `clickhouse-init/001-init-v3-schema.sql.template` | 294 | 1-295 | Entire DDL; table enumeration below |
| `clickhouse-init/002-logs-table.sh` | 10 | 1-10 | Setup/defaults, fixed template redirection, quoted client arguments and progress messages |
| `clickhouse-init/002-logs-table.sql.template` | 21 | 1-21 | 1-3 intent; 4-17 fields; 18-21 engine, partition, ordering and TTL |

Schema table/range accounting (intervening comments and blank separators included in whole-file review):
- 1-18 `documents`; 19-27 `doc_groups`; 28-39 `group_contracts`; 40-59 `group_identity`.
- 60-69 `group_members`; 70-81 `group_join_requests`; 82-91 `group_hidden_docs`; 92-102 `moderation_flags`.
- 103-112 `service_contracts`; 113-121 `user_blacklist`; 122-131 `group_blacklist`; 132-141 `user_group_sharing`.
- 142-150 `provider_service_contracts`; 151-163 `users`; 164-174 `node_config`; 175-190 `apps`.
- 191-202 `app_ratings`; 203-215 `app_visits`; 216-225 `app_contracts`; 226-239 `banned_users`.
- 240-257 `bug_reports`; 258-277 `marketing_events`; 278-295 `content_events`.

## Checklist Dispositions

| Class | File-local result |
|---|---|
| 1. Access control | DDL is storage structure, not an API auth gate. Tombstones/version fields and public-metadata comments do not demonstrate authorized reads. No local token-auth exploit established. |
| 2. Injection | SQL templates are fixed DDL, not interpolated shell templates. Scripts quote environment-derived client arguments and redirect fixed paths; no eval or attacker-controlled shell source shown. No demonstrated SQL/shell/path injection. |
| 3. Boundaries/transport | Host ports, HTTP routing and Docker socket mount are explicit source properties; public reachability, proxy bypass, socket misuse and RTC admission remain unverified integration questions. |
| 4. Availability/DoS | Readiness retries, missing retry in logs bootstrap, resources and append-only storage are reliability concerns, not new C+I findings. |
| 5. Data lifecycle | Version/tombstone ordering needs consumer queries; DDL alone cannot establish revocation failure. Telemetry/log TTLs exist; free-form log fields alone do not demonstrate protected content persisted. |
| 6. Hygiene | Existing B-2 confirmed statically in additional configuration/bootstrap locations below. Build-artifact inclusion, sensitive logging and daemon/port consequences are not proven. |

## Confirmed Local Evidence

**B-2 (existing, OPEN): literal/default infrastructure credentials in tracked source.**
- `docker-compose.yml:35-37,94-97,111-114` supplies literal storage account/password configuration, including blob-store root credentials.
- `clickhouse-init/001-init-v3-schema.sh:8-10` and `clickhouse-init/002-logs-table.sh:4-6` retain repeatable credential fallbacks.
- Proof is direct static source inspection, not execution or authentication. All credential values withheld. This is additional B-2 evidence, not a new L1-B1 duplicate or a claim these values are active anywhere.
- Later repair must preserve local bootstrap usability and operator overrides while removing accidental reusable credentials; scan performs no rotation or fix.

## UNVERIFIED L2+ Handoffs

- **L1-B1-U01, build context:** `.dockerignore:30-35` excludes root environment variants but only selected nested names; `59-62` intentionally retains Git metadata. Trace actual context contents and Dockerfile COPY/stages before claiming secrets enter an artifact. No local secret inventory or image inspection performed.
- **L1-B1-U02, storage publication:** `docker-compose.yml:85-115` declares storage host publications alongside B-2 literals. Trace invocation, bind/firewall/override policy and image authentication before naming reachable unauthorized storage access. No host or production exposure inferred.
- **L1-B1-U03, daemon boundary:** `docker-compose.yml:17-18` mounts a Docker socket read-only into the proxy. Filesystem read-only does not itself establish daemon API authorization; inspect actual proxy/image/socket use before claiming host control. No socket contacted.
- **L1-B1-U04, routing/admission:** app/dev manifests publish service ports and provide external-network/vhost wiring. Trace active manifests, proxy/TLS configuration, env consumers (including verify-option spelling), and existing BP-3 RTC admission ownership. No missing gate inferred from absent manifest settings.
- **L1-B1-U05, lifecycle/log provenance:** schema version/tombstone semantics and logs `request_body`/`response_body`/`meta` fields require actual producers/read gates. Existing B-4 owns demonstrated sensitive logging; no new leak established by DDL or console enablement.
- **L1-B1-U06, schema drift:** `001-init-v3-schema.sql.template:40-58` retains app-specific identity DDL/comments despite current D60 guidance. Trace migration/consumer behavior before asserting public-data exposure; design drift alone is not a C+I exploit.

## Reproduction and Limits

- Executed read-only baseline check: `git diff --quiet db325cd3ca242774ed0afdaf743fdf35419da1e7 -- .dockerignore docker-compose.yml web10.app.yml web10.dev.yml clickhouse-config/999-ci-logging.xml clickhouse-init/001-init-v3-schema.sh clickhouse-init/001-init-v3-schema.sql.template clickhouse-init/002-logs-table.sh clickhouse-init/002-logs-table.sql.template`.
- Result: exit 0, no output; all nine worktree sources match the exact baseline.
- Executed `wc -l` with those same nine paths in that order: `61,121,116,74,5,27,294,10,21`; total `729`.
- Exact static proof locations are listed under B-2; no dynamic probes executed, hence no synthetic sink or exploit outcome claimed.
- No services, shell bootstrap scripts, SQL, container builds, package installs, network calls or credential validation executed. No Git mutations, runtime changes or central-doc edits.
- Coverage excludes all other schema/deployment/API files. Context documents are orientation only, not additional scanned coverage.
- No severity escalation to deployed compromise, whole-service safety, PASS, repair closure, model-diverse review or three-dry claim. Fresh independent document/design-intent review remains pending.
