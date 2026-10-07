# Security Findings Ledger

An operator needs to know what failed, what the current code prevents, and what still needs proving. A passing suite is not a certificate. This ledger keeps those three things separate.

## Scope And Evidence

Reviewed 06.10.2026 against the **current, dirty working tree**, including concurrent security changes, not just HEAD. This documentation pass changed no application code. The October [audit](../../../security-audit/october/README.md) remains the historical record; its original blanket data-isolation verdict is explicitly superseded.

Stable IDs below must survive fixes. Severity describes the original weakness or remaining risk, not a claim that a fixed exploit still works. `fixed-in-worktree` means the inspected implementation addresses the named path, with the stated local evidence. It does **not** mean merged, deployed, independently audited, or incident cleanup completed. `partial` means a meaningful mitigation exists but a named gap remains. `open` means unresolved. `bounded-design` means an explicit trust assumption or limitation, not a newly proven exploit.

Evidence levels: **source** = current implementation inspected; **local regression** = named tests run here, typically with mocked storage/network; **live regression** = actual ClickHouse execution; **session report** = earlier session evidence supplied by the operator, not independently reproduced by this documentation pass. Function names are durable references where concurrent edits move line numbers. All code/test paths below are repository-relative.

### Verification Record

From `api/`, ran `uv run pytest tests/test_auth_security.py tests/test_settings_security.py tests/test_middleware_security.py tests/test_query_security.py tests/test_direct_document_security.py tests/test_group_document_authz.py tests/test_media_security.py tests/test_account_contact_security.py tests/test_system_security.py tests/test_delegation.py tests/test_delegation_surfaces.py tests/test_import_worker.py tests/test_node_ads.py tests/test_node_config.py -q`: **642 passed, 1 skipped**, 438 warnings. The skip was the opt-in live direct-read probe. Warnings included dependency deprecations, naive-UTC deprecations, and deliberately exercising the old short published signing default; they are not evidence of deployment configuration.

Then ran `DIRECT_READ_LIVE_CONTAINER=houston-clickhouse-1 uv run pytest tests/test_direct_document_security.py -q`: **5 passed**. The probe creates a uniquely named temporary database, copies schema, stops merges only on those temporary tables, and drops that database in `finally`. No application records are used. See `api/tests/test_direct_document_security.py:43-137`.

From `sdk/`, ran `bun run test -- src/browser.test.ts`: **10 passed**. UI restoration tests were inspected as evidence candidates, not run in this documentation pass. No full API suite, production probe, browser E2E, deployment review, key-history scan, or independent penetration test is claimed.

**Later current-tree refresh, 06.10.2026:** after alternate-route delegation changed, ran from `api/`:

- `uv run pytest tests/test_delegation_surfaces.py tests/test_imports_endpoint.py tests/test_import_worker.py -q`: **190 passed**, 161 warnings.
- `uv run pytest tests/test_import_delegation.py -q`: **51 passed**, 38 warnings. This exercises signed admission, persisted/rehydrated scope, expiry/contract/service/role revocation, worker checks after parsing and between insertion/attachment, and page-import service grants with mocked storage/network.

These focused results are evidence of their respective trees, not a rerun of the earlier 642-test batch or live ClickHouse probe.

**Latest current-tree refresh, 06.10.2026:** the operator reports **1708 API tests passed**, **5 opt-in live tests passed**, and **184 SDK tests passed** after the group-gate and SDK repairs. These are **session-report evidence, not independently rerun in this documentation refresh**. Current source was reread: `can_read_group` requires effective service `readAll`; `can_write_group` requires effective service `create`; `readable_groups_batched` unions named/public/authenticated role grants rather than admitting all members. The current live direct-read fixture also compares point/batched gates, executes service-boundary queries, and denies writes for read-only roles with merges disabled. SDK `appContractCovers` excludes `group`, `node`, `user`, and `imports` from document wildcard coverage; popup callbacks accept new same-user tokens and reject unusable session shapes. Independent latest-suite/live reruns, browser E2E, actual network/TLS SSRF validation, production probes and deployment review: **not run**. No merge or deployment claim.

### Resume Verification

Independently ran on 06.10.2026: `uv run pytest -q` from `api/`: **1717 passed, 1 skipped, 1134 warnings** (the opt-in live direct-read probe was skipped). From `sdk/`, `bun run test`: **187 passed** across four files; `bun run typecheck` passed. Repository-wide `git diff --check` passed. Runs used the dirty tree based on HEAD `c26cfc07b5e5300ef2439c0b6d96678915bb243e`, not that commit alone. Earlier results remain historical evidence for their respective trees. The API total includes conformance stubs (SEC-027), not 1717 independent behavioral security assertions. No live-storage rerun, UI/social suite, browser E2E, production review or independent audit was performed in this resume pass.

## Threat Model

**Documentation-only follow-up, 06.10.2026:** the residuals and rating correction below are source inspection, not new test results. Earlier batches retain their original evidence level; they do not certify subsequent concurrent edits. Future run records must include the commit plus dirty-diff fingerprint and a sanitized artifact reference; no such fingerprint or artifact is invented for the historical runs above.

Attackers include unauthenticated callers, ordinary group members, malicious apps holding valid delegated tokens, pages with a reference to an app window, and holders of stolen bearer credentials. Request Origin is attacker-controlled outside browsers. Document IDs, SQL projections, body metadata, object keys, archive headers, provider claims, and DNS answers are untrusted.

The node is readable by design (D41); operator-blindness and default end-to-end encryption are not goals. Authorized public discovery is not a leak. The trusted operator, deployment secrets, storage isolation, HTTPS termination, and dependency supply chain remain assumptions. A compromised operator or signing key invalidates the local trust root. D89 requires **app permission AND the person's current authority**, never one in place of the other. Document wildcards grant no group/node management powers.

## Identity And Credentials

### SEC-001 | Critical | Published/default symmetric signing authority

**Lifecycle:** partial. Historical B-1. A publicly known HS256 default permits forging any local identity wherever that value is actually configured; this is a single-node impersonation problem, not merely a federation problem. Current `api/app/settings.py` removes the default; `api/app/services/auth.py::encode_token`, `verified_payload`, and `public_jwks` support local RS256 with an RSA key of at least 2048 bits, explicit `kid`, and public-only JWKS. Legacy HS256 requires explicit configuration; with RS256 enabled it requires a future `AUTH_LEGACY_VERIFY_UNTIL`. The old published default is rejected even during migration.

**Evidence:** source plus local regression, `api/tests/test_auth_security.py::test_published_old_default_is_not_a_migration_credential`, `test_rsa_roundtrip_public_jwks_and_endpoint`, `test_bounded_dual_verify`, `test_unknown_kid_and_algorithm_confusion`. **Remaining:** explicit HS256-only configuration is still supported; key entropy, persistence, rollout and removal of legacy verification require operator proof. Provision and rotate real keys; do not infer safety from defaults disappearing.

### SEC-002 | High | Foreign issuer confusion and incomplete federation

**Lifecycle:** fixed-in-worktree for foreign local impersonation; federation remains open. `auth.py::decode_token` requires local provider/issuer and target. `certify_with_remote_provider` fails closed instead of fetching an untrusted provider; local JWKS publication is **not** remote issuer verification or federated identity. Bare local usernames cannot safely represent foreign principals.

**Evidence:** source plus local regression, `test_auth_security.py::test_foreign_issuer_cannot_impersonate_local_user`. **Next:** namespace foreign identities, establish trusted issuers and key rotation/cache policy, then adversarially test remote JWKS. Do not restore network certification as an unsigned-claim shortcut.

This lifecycle covers the Python local verifier, not all runtimes: RTC retains an unsigned-provider remote-200 fallback (SEC-029).

### SEC-003 | High | Unsigned decode, expiry and credential-kind confusion

**Lifecycle:** fixed-in-worktree. Historical B-3 understated the unsafe helper. `auth.py::decode_token` now always verifies even if passed the shipped `private_key=False` keyword; validates custom ISO expiry, timezone normalization, nonempty identity, self/app kind, canonical app origin, target and session purpose. Recovery credentials cannot become sessions; recovery requires finite numeric `exp` and recovery purpose/kind/contact. Ambiguous old sessions must log in again.

**Evidence:** source plus local regression, `test_auth_security.py` bad/missing expiry, invalid session claims, recovery/session separation and unconfigured-key cases. **Residual:** client JWT decoding remains unverified UX metadata (SEC-023); no browser payload decoder is an authorization oracle.

### SEC-004 | High | Source defaults, historical secrets and credential cleanup

**Lifecycle:** partial. Historical B-2. `settings.py` removes signing, Stripe, Twilio, database/object-store and bootstrap-administrator defaults; typed environment coercion no longer silently turns numeric/boolean values into strings. The settings dump entry point is removed.

**Evidence:** source plus local regression, `api/tests/test_settings_security.py`. **Remaining:** no historical secret scan or deployment inventory was performed here. Any real key exposed in repository history, logs, backups or artifacts must be treated as compromised: rotate/revoke, restrict access, and purge under an operator-approved retention process. Editing code cannot undo disclosure. Never paste confidential key contents into this ledger or an audit report.

### SEC-005 | High | Credential/content logging and exception disclosure

**Lifecycle:** partial. Historical B-4 and S-2 compose: body transport placed credentials in persisted request logs, and response/error text could expose further secrets. `api/app/middleware.py::log_requests` now stores method, server-defined route template, status and latency, with empty bodies/origin/user/meta; does not consume request or response streams. `api/app/main.py` emits generic correlated unhandled errors and generic validation errors. Query execution/preparation errors are generic and correlated; readiness hides database exception text.

**Evidence:** source plus local regression, `test_middleware_security.py`, `test_query_security.py::test_backend_errors_are_generic_and_correlated_without_secret_logs`, `test_system_security.py::test_ready_does_not_disclose_exception`. **Remaining:** old logs need operator cleanup and token/key rotation. Other service/worker/proxy/browser logging sinks are not globally certified; `system.py::ready` still logs a server-side traceback and import/transcode paths have diagnostic logging. Do not reintroduce payload logging merely to increase observability.

### SEC-006 | High | Unrestricted self-token handoff and Origin-dependent app checks

**Lifecycle:** fixed-in-worktree for inspected delegation paths. Apps historically received owner-like sessions, while absent Origin could skip CRUD/query app contracts; a stolen old same-user session was not safely scoped by a browser header. D89 introduces signed `credential_kind=app` and `app_origin`; `auth_helper.py::app_contract_origin` checks the live contract even without Origin and rejects a supplied mismatch. Self credentials remain powerful and must not leave the authenticator. Delegation is self-only; app tokens cannot issue more authority or edit app grants/credentials/recovery/admin lists.

**Evidence:** source plus local regression, `api/tests/test_delegation.py`, `test_delegation_surfaces.py`; `api/app/v3/endpoints/auth.py`, `contracts.py`, `documents.py`, `query.py`; `ui/src/interfaces/Interface.tsx` handoff implementation. **Remaining:** live two-app approval/deny/upgrade/revoke/browser gauntlet and UI verification. Rejecting ambiguous legacy credentials is not revoking every explicitly valid self session.

### SEC-007 | High | Long-lived stolen sessions and revocation limits

**Lifecycle:** bounded-design/open. Historical B-7/S-5. `settings.py::TOKEN_EXPIRE_MINUTES` remains 87840 (roughly 61 days); SDK storage is JavaScript-readable. App contracts are checked live on inspected app requests, but there is no individual token revocation list or distributed session invalidation established by this audit. A stolen self credential retains owner authority until expiry or key invalidation.

**Evidence:** source, `auth_helper.py`, `settings.py`, `sdk/src/token.ts`; no theft simulation claimed. **Next:** shorter lifetimes/renewal, explicit session inventory and revocation, reauthentication for sensitive recovery changes, and multi-worker/node revocation tests. Contract revocation is not individual-token revocation.

## Query And Document Boundaries

### SEC-008 | Critical | Qualified-table and lexical CTE scope escape

**Lifecycle:** fixed-in-worktree for known shapes. Caller-controlled qualified table references and treating every nested CTE name as globally visible undermined the old raw-table wall. Earlier session reported harmless live access to `web10.logs`/system settings; that historical exploit report is retained, not independently rerun here. No secret rows or values are reproduced.

**Evidence:** current source `api/app/v3/services/safe_query.py::_validate`, lexical `traverse_scope`, qualification rejection and caller-settings rejection; local regression `test_query_security.py:26-67` for qualified collisions, nested/sibling scope, raw references and settings. **Remaining:** parser/server dialect differential fuzzing and independent live attack replay. An AST round trip alone does not prove ClickHouse resolves every name identically.

### SEC-009 | Critical | Fabricated projections minting media, face and ad capabilities

**Lifecycle:** fixed-in-worktree for inspected fabricated-projection and service-role paths (SEC-011). Safe input tables do not make arbitrary projected `author_key`, `body`, refs or IDs authoritative. `api/app/v3/endpoints/query.py::_canonical_prepare_doc` and `_prepare_rows` re-fetch current carrier data through service/app/group/query boundaries; face signing proves the canonical author/ref pair, not the supplied projection. Selected ads are independently reauthorized and replaced before signing. Table-free projections cannot mint capabilities. Current face/query readable-group helpers require effective service-role grants, not blanket membership; canonical provenance and service authorization remain separate checks.

**Evidence:** source plus local regression, `test_query_security.py` fabricated/table-free/revoked/hidden/mismatched carrier, projection replacement, selected-ad reauthorization and forged face tests (including shipped anonymous face-query shape). **Remaining:** real-storage/browser composition gauntlet; canonical checks and later signing are not an atomic transaction.

### SEC-010 | High | Query result and anonymous resource exhaustion

**Lifecycle:** partial. `query.py` caps rows (1000), result bytes (8 MiB), execution time (10 s), sets read-only/overflow-throw execution, checks prepared output size, and applies a shared per-worker anonymous budget. `safe_query.py::build_safe_query` caps caller limits and set operations rather than honoring arbitrarily large limits.

**Evidence:** source plus local regression, `test_query_security.py` limit/settings/oversized-result cases. **Remaining:** limits are per process, not global quotas; intermediary allocations and expensive computations can occur before a response cap. Test concurrent workers, anonymous pressure, joins and aggregate/string expansion with resource telemetry.

### SEC-011 | Critical | Direct reads trusted membership rather than service roles

**Lifecycle:** fixed-in-worktree for direct document path. `clickhouse.py::read_document_by_id` now requires the actual service's effective `readAll` role and uses the full query boundary for blocking, sharing, hidden/banned authors and current document/group visibility. Membership in a group is not blanket permission to every service.

**Evidence:** source plus earlier local regression `test_direct_document_security.py::test_membership_without_service_readall_is_denied`; earlier **live regression** `test_live_revocation_without_merges` passed here. **Broader lifecycle: fixed-in-worktree.** Reread `can_read_group`, `can_write_group` and `readable_groups_batched`: all now evaluate effective named/public/authenticated service grants, including document wildcards, without blanket member admission. Read gates require `readAll`, attachment/import write gates require `create`, and batching preserves point-gate semantics. Latest operator-reported evidence: **1708 API passes + 5 opt-in live passes**; inspected live fixture covers role downgrade, point/batch equivalence, service-boundary execution and read-only write denial before merges. Independent latest rerun: **not run**. Route-wide composition and concurrent revocation atomicity remain follow-up work, not an unfinished helper repair.

**Social compatibility boundary:** current `groups.ts::FOLLOWER_ROLES` explicitly grants follower reads of posts/profile/media and comment/reaction CRUD; `ensureFollowers` reconciles existing follower contracts against the canonical spec. SDK reconciliation fills missing operations in matching named roles, not just missing role names. Stored custom community and close-friends contracts are **not auto-migrated**; new role templates do not retroactively grant their existing members new rights. No social-suite execution or production migration is claimed by this documentation refresh.

### SEC-012 | High | Filtering tombstones before selecting latest versions

**Lifecycle:** partial across the entire node; fixed-in-worktree for tested direct paths. Filtering `deleted=0` first resurrects stale rows before ReplacingMergeTree merges. `get_document`, `get_document_any_author`, `get_doc_groups`, direct reads, carrier references, media listing and node-ad selection now deduplicate before filtering on inspected paths; direct helpers use deletion as a tie-breaker.

**Evidence:** `clickhouse.py` named functions; local and **live regression** `test_direct_document_security.py:15-137`, with merges disabled, covers current tombstones and detachments without relying on background merges. **Remaining:** audit every versioned table reader and equal-timestamp winner policy. The query boundary uses timestamp ordering; this is not proof that all temporal/tie cases throughout the node are settled.

**Known source residual:** `clickhouse.py::resolve_media_urls` still filters `deleted=0` before its latest-row window. A retained readable carrier can therefore resolve a deleted media metadata version and mint a fresh storage URL if the object remains. Canonical carrier authorization and author-prefix validation do not prove referenced metadata is current. Closure requires a merges-disabled carrier-to-deleted-media case through direct reads and query prepare; no reproduction or closure is claimed in this follow-up.

### SEC-013 | High | Group contract takeover, pending self-approval and unauthorized attachment

**Lifecycle:** fixed-in-worktree for inspected contract/invite/attachment gates. `groups.py::update_group` requires `manageRoles`, not mere membership; existing-group creation checks `assignRoles` against current authority rather than recreating owner rights. `accept_invite` accepts only manager-issued `invited` state, not the caller's own `pending` join. `documents.py::update_document` calls `can_write_group` for every replacement attachment group before mutation; the current helper requires effective `create` on the actual service, not mere membership (SEC-011). Non-atomic revocation windows remain below.

**Evidence:** source plus local regression, `api/tests/test_group_document_authz.py`, delegation tests. **Remaining:** invitation acceptance and contact-like check/write flows are not transactions; test concurrent revoke/approve/update with real storage. A manager intentionally assigning a powerful role is authorized behavior, not an exploit by itself.

### SEC-014 | High | Wildcard mismatch and management namespace escalation

**Lifecycle:** partial overall; backend reserved-operation gating and SDK consent comparison are fixed-in-worktree. Backend `auth_helper.py::require_app_permission` and SDK `v3.ts::appContractCovers` exclude `group`, `node`, `user` and `imports` from document `*`; blocking/import operations require exact reserved grants. The operator reports **184 SDK tests passed** after this alignment; independent rerun here: **not run**. `safe_query.py::document_service_allowed` still reserves `group`/`node` but not `user`/`imports` names; this narrower query namespace-policy drift remains to resolve, not proof of access to internal import jobs. Raw tables/functions stay forbidden and `group_meta` still requires opt-in and boundary construction.

**Evidence:** `safe_query.py::document_service_allowed`, `clickhouse.py::has_permission`, `auth_helper.py::require_app_permission`, `access.py::verify_access`, `sdk/src/v3.ts::appContractCovers`; local `test_query_security.py` wildcard/reserved-service cases and `test_delegation_surfaces.py`. **Remaining:** permission-schema evolution and mixed legacy role shapes must preserve this distinction.

## Media And Worker Boundaries

### SEC-015 | Critical | Direct/recursive signing of foreign object keys

**Lifecycle:** fixed-in-worktree for inspected signing paths. `media.py::read_url` requires the authenticated author's object tree; delegated calls locate current owned media metadata and require its actual service grant. `hls.py::owns_object_key` rejects malformed/traversal-shaped keys. Confirmation and recursive minio/media resolution validate keys against canonical document author, not reader/projection claims.

**Evidence:** source plus local regression, `test_media_security.py` direct read, foreign confirmation refs, generic minio and forged metadata; `test_delegation_surfaces.py` actual-service and raw-key cases. **Remaining:** owner-prefix validation is not an atomic server-issued upload ticket; possession of a key name must never itself authorize foreign signing.

The foreign-key repair does not close the stale metadata signing path in SEC-012. Ownership, current metadata and carrier authorization are separate checks.

### SEC-016 | High | Transcode input/output misuse and FFmpeg protocols

**Lifecycle:** partial. Endpoint/worker reject foreign input keys before I/O; worker checks object/download size; generated HLS manifest paths must match document prefix. FFmpeg/ffprobe allow only `file,pipe`; transcode queue is bounded (64) and full admission is nonblocking.

**Evidence:** `api/app/services/transcode.py::_process_job`, `_run_ffmpeg`, probe functions; `media.py::transcode_media`, `hls_variant`; local `test_media_security.py` worker/endpoint-before-I/O, protocol and queue cases. **Remaining:** no FFmpeg sandbox, no global CPU/disk/output quotas, no atomic immutable input binding, and local file protocols still exist. Protocol restriction is not containment against decoder bugs or local-file references.

**Authorization residual (source):** `submit_transcode_job` queues only `(doc_id, author_key)`. The worker rechecks object ownership/size, but retains no initiating app origin/expiry and does not recheck that app's live grants before work or output writes. Import-style persisted authorization does not apply here. Define whether admission deliberately permits completion after expiry/revocation; until that policy and its live evidence exist, do not promise revocation stops queued transcodes.

### SEC-017 | High | Empty HLS signing key and weak stream binding

**Lifecycle:** partial. Empty configuration now fails closed; dedicated `HLS_SIGNING_KEY` must be at least 32 bytes. `mint_sig`/`verify_sig` require expiration, document/prefix binding and authenticated class shape; manifest/variant/segment paths recheck current access and reject mismatching prefix/variant keys and malformed components.

**Evidence:** `hls.py:39-123`, `media.py::_hls_doc`, `hls_variant`; local `test_media_security.py` empty/dedicated/short-key, binding, expiration and path tests. **Remaining:** explicitly configured `PRIVATE_KEY` fallback still exists and is not equivalent to dedicated-key isolation. Already issued S3/segment capabilities have finite lifetimes; app contract revocation is not shown to invalidate every issued media capability immediately. Review signing-key separation and live stream revocation.

### SEC-018 | Medium | Raw CRUD bypasses media confirmation semantics

**Lifecycle:** open residual. Generic document create/update can write media-like metadata without passing `confirm_media` object-existence/size checks or an upload admission record. Downstream key checks prevent known foreign-key signing, but do not make every stored metadata claim trustworthy or quota-accounted.

**Evidence:** source, `documents.py::create_document`, `update_document` versus `media.py::confirm_media`, `clickhouse.py::validate_media_metadata`. Existing generic minio regression proves foreign signing denial, **not** elimination of this semantic bypass. **Next:** define a generic storage-capability seam rather than social-specific validation; test raw CRUD, absent/replaced objects, nested refs and resource accounting.

### SEC-019 | High | Archive expansion, directory/header allocations and worker admission

**Refresh:** worker authorization is no longer merely inherited from HTTP admission. Credential kind/origin/expiry are persisted and rehydrated; current app grants and person authority are rechecked before I/O and writes (SEC-022). The new `test_import_delegation.py` passed **51 tests** here. Current import write-role helpers require effective actual-service `create` (SEC-011, fixed-in-worktree); repeated authorization checks are not atomic transactions. Resource/queue limits below remain partial mitigations, not distributed quotas.

**Lifecycle:** partial. `import_worker.py` bounds part size (50 GiB), expanded bytes per part (100 GiB), metadata member (64 MiB), aggregate metadata (128 MiB), total members (100000), ZIP central directory (32 MiB), tar extension header (1 MiB), and queued jobs (100). ZIP directory inspection precedes materialization; tar iteration is streaming; download actual byte count is bounded. Local submission lock/dedup prevents repeated queued starts in a process; boot recovery is paginated. `imports.py` bounds upload/start and returns retryable queue-full status.

**Evidence:** source plus local regression, `api/tests/test_import_worker.py`; archive entries are read, not blindly extracted to caller filenames. **Remaining:** substantial allowed disk/expansion costs, private `zipfile` API dependency, parser allocations, and no distributed admission/quota/lease. Test malformed ZIP64, compressed streams, tar sparse/extension chains and multiple workers; passing synthetic archives is not real-export load evidence.

**Thumbnail residual (source):** `import_worker.py::_upload_thumbnail` uses `requests.get(url, timeout=15)` with default redirects and materializes `resp.content` without a response-byte cap. Archive budgets do not bound this allocation, and the timeout is not a whole-download deadline. The current YouTube parser derives the initial URL under `i.ytimg.com` (`services/importers/youtube.py::_thumbnail_url`); arbitrary-host SSRF is not established. Bound downloaded/decompressed bytes and total time, and validate redirect destinations/network behavior separately from the repaired manifest fetch. No hostile-network result is claimed.

## Recovery And Alternate Surfaces

### SEC-020 | Critical | False OTP verification and unverified recovery contacts

**Lifecycle:** partial. Historical code could mark contact verified without real OTP approval. `account.py` is now self-only, stages replacements unverified, checks the actual bound phone/email using the Twilio adapter, and rechecks the contact before marking. `recovery.py` only recovers existing accounts through matching verified contacts; tokens for replaced contacts no longer recover them.

**Evidence:** source plus local regression, `test_account_contact_security.py` real-adapter approval/failure, changed-during-check, pending/replaced-contact and alias cases. **Remaining:** the final check and `verify_phone`/`verify_email` write are **not atomic**. A replacement after the recheck can race the verification write; tests covering replacement during the OTP call do not prove that final window closed. Bind verification to contact/version with an atomic compare-and-write mechanism.

### SEC-021 | High | Stolen self session can establish persistent recovery control

**Lifecycle:** open residual. A valid self bearer can replace a recovery contact and prove an attacker-controlled contact. Self-only gating stops ordinary delegated apps, not a thief holding that credential. Contact ownership proof is not proof that the account owner authorized the replacement.

**Evidence:** source, `account.py::change_phone`, `set_email`, verification routes and `recovery.py::complete`; no fresh password/MFA step or individual self-session revocation is established here. **Next:** recent reauthentication, notifications/change delay or recovery challenge policy, revoke active sessions when appropriate, and live takeover/recovery tests. Severity assumes an already stolen self session, not unauthenticated access.

### SEC-022 | High | Alternate media/group/import/rating/blocking routes bypass app scope

**Lifecycle:** fixed-in-worktree for enumerated app-scope and group service-role gates; exhaustive full-route validation remains open. Media upload/confirm/list/read-url/thumbnail/delete/transcode check actual service operations; list filters services before storage pagination and deletion rejects arbitrary non-media services. Group-detail embedded posts require app `posts:readAll` AND current person's effective service `readAll` through repaired `can_read_group`. Attachment/import writes require effective actual-service `create`, not membership (SEC-011).

Imports are **delegated, not self-only**: `imports.py:43-161` requires exact `imports:create` for admission/start and `imports:read` for status, plus user ownership and app-origin binding to the stored job. Admission validates pipeline document and group grants through `import_worker.py::import_permissions`/`authorize_import_job`. Stored authorization contains credential kind, app origin and expiry, not a bearer token; status updates preserve it and workers rehydrate it. Workers recheck expiry, live contract, current document/group grants, target ownership and write/management authority before I/O, after parsing and around mutations. Unknown legacy scope fails closed pending renewed authorization. Status reads do not require all write/group permissions; mutation admission does. Global block/unblock delegates through exact `user:blockUsers`. App rating/review submission delegates through exact `user:rateApps`, not blocking authority or document wildcard; self sessions need no app contract.

**Rating refresh (source only):** `appstore.py::create_app_rating` and `test_delegation_surfaces.py::test_rating_exact_user_grant_signed_http`/`test_rating_self_session_needs_no_app_contract` describe this newer boundary. These test bodies were inspected, not run in this follow-up, and earlier batch totals are not evidence for the new cases. Consent currently lacks a `rateApps` label and describes every `user` grant as blocking (`ui/src/lib/permissionLabels.ts`); this remains an application follow-up, not a documentation repair. Queued transcode authority remains distinct (SEC-016), and RTC certification is not a live app-contract check (SEC-029).

**Evidence:** current `media.py`, `groups.py::group_detail`, `imports.py`, `import_worker.py::authorize_import_job`, `appstore.py::create_app_rating`, `blocking.py`; earlier **190 passed** alternate-route/import batch and **51 passed** `test_import_delegation.py`. The matrix rejects missing reserved grants and document-wildcard attempts; signed import tests cover app admission, cross-app denial, persisted/rehydrated scope and worker revocation. `test_import_delegation.py::test_user_blocking_exact_reserved_grant` verifies app/self blocking success and denial for missing, wildcard, group-only, revoked and spoofed grants. Latest source review confirms effective group gates and SDK reserved comparison; operator reports **1708 API + 5 opt-in live + 184 SDK passes**. **Remaining:** independent latest reruns and live browser validation **not run**; the earlier focused import storage/network tests are mocked, exhaustive legacy-route coverage and atomic revocation between check and mutation are not certified. No helper or SDK repair remains in-progress on the inspected paths.

### SEC-023 | High | Popup origin/source trust, same-user refresh and UI restoration

**Refresh:** popup trust and consent coverage are both fixed-in-worktree on inspected SDK paths. `appContractCovers` now excludes all four reserved namespaces (`group`, `node`, `user`, `imports`) from document wildcards. The earlier 10-test run remains historical; the latest **184 SDK passes** are operator-reported, not independently rerun here.

**Lifecycle:** fixed-in-worktree for SDK regressions; UI restoration source-reviewed only here. Historical S-1/S-6. `sdk/src/popup.ts:2-15` binds actual Window source to configured origin. `browser.ts::authListen` requires trusted source/origin and app credential for current app origin; outgoing contract/close messages use exact origins. Refresh callbacks deduplicate identical accepted tokens rather than suppressing every same-user token. `v3.ts` popup fallback/contract-on-ready also bind source/origin and compare requested operations rather than mere contract existence. UI `sessionClaims.ts` checks self-session shape/expiry/provider; `tokenVault.ts` and `Interface.tsx` restore selected account/session without unrestricted handoff.

**Evidence:** current source plus earlier **10 passed** SDK `browser.test.ts`; latest **184 SDK passes** are operator-reported. Current `authListen` checks app kind/origin, nonempty username, configured provider and finite future ISO expiry before writing the cookie; it invokes refresh callbacks for new same-user tokens and deduplicates only identical accepted handoffs. UI `sessionRestore.test.tsx`, `tokenVault.test.ts`, `delegation.test.tsx` are test references, **not execution claims from this pass**. **Remaining:** independent latest SDK rerun, live popup navigation/opener/referrer/account-switch gauntlet and UI run **not run**. `decodeJwt`/session payload decoding is unverified UX parsing; the node alone verifies credentials. JS-readable cookies expose tokens to same-origin XSS; SameSite/Secure do not prevent that. Historical anonymous `byUserGroups` transport (S-3) remains a functional concern, not proven cross-user disclosure; GET token usage elsewhere must be reviewed for proxy/history logging.

### SEC-024 | High | Node-ad designation and polluted selection window

**Lifecycle:** fixed-in-worktree for inspected CRUD and selector paths. Ordinary document authority must not designate operator inventory. `documents.py` create/update/delete require current admin authority plus explicit app `node:manageMonetization` when adding, removing or modifying existing `node_ad` designation; media delete/transcode enforce it for such documents too. `clickhouse.py::get_active_node_ads` filters current admin authors, latest rows, `ad`/`node_ad`, active status and live discover attachment **before LIMIT 20**, not merely in Python afterward.

**Evidence:** source plus local regression, `test_delegation_surfaces.py::test_node_inventory_designation_requires_node_authority`, `test_update_cannot_add_designation_with_ordinary_crud`, `test_media_mutations_cannot_bypass_node_designation`, `test_inventory_author_filter_precedes_limit_and_latest_tags`, `test_inventory_saturation_cannot_crowd_out_operator`; all included in the fresh 190-pass batch. `clickhouse.py::get_active_node_ads` was reread and still filters admin authors before `LIMIT 20`. The previously feared nonadmin-fill-the-first-20 window is addressed in current SQL, not left open based on an older snapshot. **Remaining:** live selection/admin-removal/tombstone regression and audit of alternate writers. Import worker scope is now checked (SEC-022), but that is not a complete import designation-provenance audit. A current admin can intentionally publish inventory; browser hiding alone would not be a gate.

### SEC-025 | Critical | DEFAULT_ADMINS character membership and undeletable bootstrap admins

**Lifecycle:** fixed-in-worktree. Environment strings previously passed through `list(settings.DEFAULT_ADMINS)` could become character usernames; union with bootstrap admins made removing them ineffective. `settings.py` parses comma-separated names and defaults empty; `config.py::list_admins` uses saved configuration as authoritative, including an intentionally empty list, validates names and does not union removed defaults back in.

**Evidence:** source plus earlier local regression, `test_settings_security.py`, `test_node_config.py`; actual current default is **empty**, not a hardcoded privileged account. Refreshed `config.py::list_admins` source plus `test_delegation_surfaces.py::test_admin_source_replaces_bootstrap` and `test_bootstrap_string_never_grants_character_admin_http` (included in the fresh 190-pass batch) independently confirm replacement/empty-list and exact-name behavior. **Next:** inspect deployed config/environment and audit historical admin actions; no claim that production ever used the exploitable string configuration.

### SEC-026 | High | PWA manifest SSRF, redirects and DNS rebinding

**Lifecycle:** fixed-in-worktree for inspected fetch path. `api/app/endpoints/system.py::pwa_listing` requires authoritative approved registration, rejects URL ambiguity/private or unusual hosts, validates **all** resolved addresses as public, connects to a pinned numeric IP, preserves Host and HTTPS SNI/certificate hostname, disables redirects/retries, and caps manifest read (256 KiB). This is distinct from the now-disabled federation certify fetch.

**Evidence:** current `pwa_listing` source reread confirms approved registration, all-address validation, numeric-IP pinning, HTTPS hostname verification, redirects/retries disabled and bounded streaming read; earlier local regression `test_system_security.py` covers malicious URLs, approval, mixed DNS/private answers, pinning/TLS settings, failures and redirects. Latest full **1708 API passes** are operator-reported, not independently rerun here. **Remaining:** actual network/TLS/proxy penetration validation **not run**; mocked transport tests do not establish it. Proxy/routing/certificate/dependency changes need revalidation (HYP-002). This fetch-path repair is fixed-in-worktree, not pending or deployed.

### SEC-027 | Medium | Conformance stubs mistaken for invariant evidence

**Lifecycle:** open evidence gap. `api/tests/test_v3_conformance.py:1-8` explicitly describes stubs; numerous test bodies are only `...` (`:54-80`, `:86-128`, and later sections). Their collection/passing cannot substantiate I1-I6 or a blanket security verdict. New targeted regression suites supply real assertions but do not turn the original skeleton into comprehensive coverage.

**Evidence:** source inspection. **Next:** implement meaningful permission/route/storage assertions, distinguish stub count from behavioral coverage, and run the live delegation gauntlet. The original audit's certainty was unsupported and is superseded, not quietly erased.

## Management Authority

### SEC-028 | High | Management delegation must intersect app and person authority

**Refresh:** import worker authorization intersects persisted app scope/current grants with current target ownership and management authority (SEC-022), verified in the earlier 51-test focused run. Current service-write authority uses the repaired effective `create` gate (SEC-011, fixed-in-worktree). Blocking is separately delegated by exact `user:blockUsers`; it does not inherit group `blockMembers` or document wildcard authority.

**Lifecycle:** fixed-in-worktree for inspected management gates; live acceptance remains open. An approved app grant must not create a group role or node-admin identity. `groups.py::_require_group_permission` combines exact app `group` operation with current person management permission. Service moderation combines the app's actual service `hideAll` with person moderation authority, or explicit app `node:moderate` with current node-admin authority. `auth.py::check_admin` admits app credentials only for the explicitly supported node capabilities. `system.py::get_config`/`patch_config` expose/change only delegated moderation/monetization policy subsets, not credentials or admin-list authority. Healing owner state is self-only.

**Evidence:** source plus local regression, `test_delegation.py`, `test_delegation_surfaces.py`; current D89 decision and `auth/delegation.md`. **Remaining:** real two-app/browser approval and upgrade matrix, actual storage role removal and node-admin removal during a session. A `node` grant cannot turn a nonadmin into an admin, and document `*` cannot substitute for any management grant. No social-app exemption is permitted.

## Additional Open Boundaries

### SEC-029 | High | RTC unsigned-provider certification and revocation gap

**Lifecycle:** open, source-grounded. `api/rtc/index.ts:36-60` unsigned-decodes the token, selects `CERTIFY_BASE_URL` or `https://${decoded.provider}`, then accepts HTTP 200 plus a caller-matching peer ID. Without a configured trusted base, an attacker-selected certification server can approve attacker-selected identity claims; the outbound destination also comes from unverified input. Python `certify_with_remote_provider` failing closed does not remove this separate remote-200 trust path.

**Evidence:** source only; no exploit/network test or deployment configuration claim. With a trusted local base, `/certify` checks the signed session, but `system.py::certify_endpoint` does not consult current app contracts. The RTC handler performs no periodic expiry/revocation recheck. **Next:** pin trusted local verification independently of claims, define signaling capabilities and socket revocation policy, and validate redirects, timeouts and behavior before asynchronous certification completes. No pre-certification signaling exploit is asserted without PeerServer/runtime evidence.

### SEC-030 | High | Public bootstrap takeover and non-atomic setup

**Lifecycle:** open, conditional on first-run exposure. `system.py::post_setup` is unauthenticated, checks `ch.node_has_users()` non-atomically, and saves signing/admin configuration before `ch.create_user` succeeds. A public empty node lets an untrusted first caller choose the administrator; concurrent setup/signup can leave configuration changed despite failed account creation. This is distinct from the repaired bootstrap-admin parsing in SEC-025.

**Evidence:** source only; no concurrency reproduction or production exposure claim. **Next:** keep setup private until completed, introduce an authenticated/atomic bootstrap policy, and prove concurrent setup/signup plus failed-creation behavior with real storage. Network isolation mitigates exposure; it does not repair the endpoint.

## Future Attack Hypotheses

These are **possibilities to investigate, not confirmed vulnerabilities**. Each has a bounded question and a proof requirement; do not promote it to a finding without reproduction.

| ID | Priority | Possibility And Next Proof |
|---|---|---|
| HYP-001 | High | sqlglot/ClickHouse dialect drift, alias shadowing, recursive/nested CTEs, quoted names, table functions and new settings syntax could hide a source. Differential fuzz parser output against live server resolution using harmless fixture tables; reject unsupported shapes. |
| HYP-002 | High | DNS pinning assumptions could change with proxying, IPv6 routing/translation, certificate handling or HTTP library upgrades. Test actual public/private mixed DNS, rebinding, TLS hostname mismatch and proxy environment behavior without contacting sensitive internal services. |
| HYP-003 | High | Concurrent revoke/role/contact/document edits could race canonical checks and later writes/signing. Use real storage and controlled barriers; define linearization points before claiming atomic authorization. SEC-020 has a known non-atomic residual; other races here are hypotheses. |
| HYP-004 | High | Many workers/users could multiply local rate/queue limits or exhaust memory/disk/CPU within allowed archive/media/query sizes. Include uncapped thumbnail responses/redirects (SEC-019), measured process-wide and distributed budgets, failed-job cleanup and restart duplication. |
| HYP-005 | High | Malicious codecs/playlists/local references could exploit FFmpeg/ffprobe despite protocol restrictions. Run hostile fixtures in a disposable constrained environment and add sandbox/output/disk/time boundaries, not only CLI assertions. |
| HYP-006 | High | Generic/raw/import writers and legacy helpers could bypass capability provenance, node-ad designation or attachment constraints. Enumerate routes and write paths, include raw metadata and tombstoned records, and test against live storage. |
| HYP-007 | High | XSS, compromised same-origin scripts or popup navigation could steal JS-readable tokens or mislead consent/session restoration. Audit render sinks and CSP/supply chain separately; test opener/source/origin and account transitions in actual browsers. SDK unit passes do not certify frontend rendering. |
| HYP-008 | Medium | Issued S3/HLS capabilities may outlive grant changes, and caching may delay enforcement. Measure each capability's expiry and recheck behavior after app/group revoke; document the intended maximum revocation window. |
| HYP-009 | Medium | Signing-key/JWKS rotation, stale caches, unknown key IDs or future federation mapping could cause acceptance confusion or outages. Test overlapping keys, forced revocation and issuer namespaces before enabling federation. |
| HYP-010 | Medium | ZIP64/private parser APIs, tar sparse/extension chains, decompression streams or JSON/CSV parser expansion could exceed measured budgets. Instrument allocations and bytes read before parser materialization, including ignored files. |
| HYP-011 | Medium | Additional log/error/proxy/artifact sinks could preserve bearer credentials or content even after middleware hardening. Trace real failures and browser/worker/network logs with synthetic markers, then audit retention/access policies. |

## Bounded Assumptions And Follow-Up

- Wildcard CORS remains intentional with `allow_credentials=False` and body bearer transport. It is not authorization. An explicitly supplied bearer header is not an ambient credential by itself; any transport change needs a specific threat review, especially cookie/credentialed requests. Wildcard alone is not a demonstrated current exploit (historical B-5).
- A raw any-author helper is not itself public authorization. Callers must bind lookup to verified capability/current read permission (historical B-6); the named HLS/direct fixes do not certify every future caller.
- External unsigned `pay` behavior that is a no-op is not evidence of a node billing mutation gap. Audit real charging/credit/webhook code separately before alleging financial impact; no payment test outcome is claimed here.
- Historical key/log compromise is operator incident response. Rotate, revoke, inventory access and purge retained copies; source cleanup is necessary but insufficient.
- Per-process limits are best-effort guardrails, not global quotas. Upload-prefix checks are not one-use atomic upload tickets. No FFmpeg sandbox or distributed individual-session revocation is established here.
- Next strongest evidence: the D89 live two-app delegation gauntlet, permission-route enumeration, real TLS/SSRF testing and parser/server differential tests. Keep merged/deployed status separate and append actual run artifacts when available. The parent task owns overview, other KB, changelog and strategy updates.
