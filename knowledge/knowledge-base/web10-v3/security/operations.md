# Security Operations

An operator needs a node that survives restarts without changing identity and
can withdraw access without waiting for storage compaction. The runbook below
describes the current working tree as inspected on 06.10.2026. Deployment and
live proof are separate tasks; a source change is not a production rotation.

## Provision Before Exposure

Keep first-run setup on a private network until the operator account and admin
list exist. `/setup/configure` is unauthenticated and guarded by whether users
exist, not by a deployment secret or an atomic first-writer transaction. Do not
race public signup against setup. Persist the database and object store, and
restrict their network access and credentials independently of the public API.

Setup saves admin/signing configuration before account creation succeeds; a
failed or concurrent attempt can therefore change configuration without completing
the intended account creation. Treat public first-run takeover and this ordering
as SEC-030, separate from repaired `DEFAULT_ADMINS` parsing. Private setup is
containment, not proof of atomic bootstrap.

| Environment | Operator requirement | Actual checked behavior |
|---|---|---|
| `PROVIDER` | Stable local API identity, e.g. `api.example.com` | Session provider and issuer must match it; a present target must be local. |
| `AUTH_SIGNING_KEY` | Persistent, secret, unencrypted RSA PEM private key, at least 2048 bits | `public_jwks()` parses and validates it when publishing/issuing/verifying RSA credentials. There is no central startup validator. |
| `AUTH_KEY_ID` | Stable identifier for the active key; change on rotation | RSA verification requires exact `kid`; JWKS publishes one current public key. Default is `node-1`. |
| `HLS_SIGNING_KEY` | Independent persistent secret, at least 32 encoded bytes | HLS signing/verification checks byte length when used. Missing key falls back to explicit `PRIVATE_KEY`/`ALGORITHM`; without either, HLS signing fails. |
| `PRIVATE_KEY`, `ALGORITHM`, `AUTH_LEGACY_VERIFY_UNTIL` | Only for a bounded migration: explicit old HS256 secret, `HS256`, UTC deadline | With RSA enabled, legacy verify requires a valid future deadline. Without RSA, explicit HS256 can still issue/verify indefinitely. Empty/published placeholder auth key is rejected. No HS256 minimum length check here. |
| `TOKEN_EXPIRE_MINUTES` | Choose the session lifetime deliberately | Typed integer environment setting used by login/recovery/delegate, default `87840` (61 days). A saved config display value does not change these minters. No positive-range validation here. |
| `DEFAULT_ADMINS` | Explicit comma-separated bootstrap usernames, or complete private setup | Default empty; saved `admins` takes precedence, including an empty list. `list_admins()` checks list/string shape and current membership. |
| `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_SECURE` | Persistent store, explicit non-shared credentials, correct TLS/network policy | Settings parse types and the client connects. Empty password is the module default; there is no secret-strength preflight. |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_USE_SSL`, `S3_PUBLIC_USE_SSL` | Explicit storage credentials; public signing endpoint reachable over HTTPS in production | Credential defaults are empty; storage failures occur when clients/bucket operations run. Internal and browser signing endpoints are distinct. No credential-strength preflight. |
| `TWILIO_SERVICE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER` | Configure the real OTP provider if contacts are enabled | Provider calls are the OTP proof; contact-shape validation alone is not verification. |
| `TWILIO_E2E` | Unset in production | Enables deterministic local/in-memory OTP behavior; it is test plumbing, not real contact proof. |
| `STRIPE_STATUS`, `STRIPE_TEST_KEY`, `STRIPE_LIVE_KEY` | Explicit credentials and correct billing mode if used | Secret defaults empty; provider behavior must be verified separately. |
| `CORS_SERVICE_MANAGERS` | Narrow authenticator trust list, not all apps | Distinct from wildcard browser CORS and from app-contract permission grants. |

Environment booleans/integers/floats are parsed in `settings.py`; boolean base
settings reject values outside `true/false/1/0`. This is type checking, not a
comprehensive security validation of all settings. Full config contains storage,
Twilio and Stripe credentials and is self-admin-only; never send it to an app.

The checked-in root/e2e/deployment compose files do not currently wire the new
auth/HLS signing secrets. A bare compose launch must not be called a clean,
secure boot: auth signing fails closed without an explicit key, HLS fails when
used without a signing configuration, and storage may fail independently.
`/ready` proves ClickHouse reachability, not signing, OTP, storage or delegation.
Private setup's generated persisted HS256 key is not the runtime RSA provisioning
path: the auth service reads signing settings, not the saved wizard key.

Provision keys outside version control through the deployment secret mechanism.
Do not generate or commit example private keys. `api/pyproject.toml` now declares
`PyJWT[crypto]>=2.9`, and `api/uv.lock` includes its crypto extra and `cryptography`.
The dependency declaration/lock repair is present; RSA/JWKS operation in the
actual built container is still untested and must be verified before release.

## Rotate and Contain Exposure

Treat credentials ever present in git history as exposed, even if their current
defaults are empty. The operator must inventory and rotate auth, HLS, storage,
database, Twilio and Stripe credentials with their respective providers. Review
deployment secrets, backups, CI artifacts and historical logs, not just HEAD.
History cleanup does not revoke credentials already copied by someone else.

For RSA rotation, provision a new persistent private key and `AUTH_KEY_ID`,
deploy consistently to every API worker, and confirm JWKS and real login. The
current verifier/JWKS supports one RSA key, not an old-key overlap ring: old
RSA sessions stop verifying after replacement. Plan a relogin window. A legacy
HS256 deadline only permits HS256 overlap, not prior RSA keys. Set the shortest
necessary legacy deadline, remove the old secret when it closes, and verify an
old credential is rejected. Old ambiguous self/app sessions already require
relogin regardless of signing compatibility.

HLS rotation uses the dedicated secret and invalidates existing stream signatures.
Object-store credential rotation must also account for outstanding presigned URLs.
Never put bearer tokens, private keys, OTPs or presigned URLs into an incident
report. Preserve a restricted evidence copy if necessary, then apply the retention
and access policy to historical logs and backups.

Current request middleware records route templates, method, status and timing,
with empty body/header/user metadata fields. It does not erase historical
secret-bearing rows. Proxy/CDN access logs, worker logs, browser logs and third-party
tools need their own review; HLS query strings and presigned URLs are credentials.
Unexpected API errors use correlation IDs rather than raw exception text.

## Withdraw Authority

Revoke the exact-origin app contract or reduce its permission map from a self
session. `is_origin_allowed()` and `get_app_permissions()` select the latest row
before inspecting `deleted`; the next checked request is denied without waiting
for background merges. This is app-wide revocation, not per-token revocation.
A newly approved contract for the same origin can make an unexpired stolen app
credential usable again. Do not reapprove a compromised app before containment.

Remove group roles/memberships or node-admin status to withdraw person authority.
Node operations require both the app's exact `node` grant and current admin
status. Delegated config has these complete policy allowlists:

| Grant | Read/write fields |
|---|---|
| `node: moderate` | `sensitive_words`, `auto_moderate`, `moderation_enabled`, `auto_hide_users` |
| `node: manageMonetization` | `node_ad_percentage`, `node_ad_overwrite` |

Mixed updates require every relevant grant. Apps cannot read/write secrets,
auth settings or `admins`; ordinary data `*` never unlocks either node grant.
See [delegation](../auth/delegation.md) for all structural group capabilities.

Exact `user: blockUsers` and `user: rateApps` grants authorize different actions:
account-wide blocking versus rating/review submission as the person. Neither is
covered by document wildcard or by the other operation. Rating consent labels
still need application follow-up; do not describe a rating grant as blocking.

Self sessions have no individual token revocation mechanism. Logout clears a
client cookie; the authenticator vault persists. Password changes do not revoke
previous JWTs. For stolen self credentials, contain the origin, withdraw exposed
authority and consider node signing-key rotation with its node-wide relogin cost.

Storage GET capabilities default to 60 seconds. HLS signatures default to 600
seconds; manifests recheck document visibility, while segments check only the
signature/prefix. HLS signatures do not encode an app origin or consult app
contracts, so app revocation is not immediate invalidation of an already minted
stream capability. Never promise that revocation retracts downloaded content.

**RTC exception (SEC-029):** set `CERTIFY_BASE_URL` to a trusted local verifier,
never a token-selected destination. Without it, `api/rtc/index.ts` uses unsigned
`provider` and trusts a remote HTTP 200. This configured-base mitigation does not
establish live app revocation: local `/certify` checks signed session validity,
not app contracts, and the RTC handler has no periodic socket revalidation.
Review redirect/timeout and pre-certification behavior against the actual runtime;
no network exploit or deployed configuration has been verified by this docs pass.

## Delegated Import Jobs

Imports are not self-only. `POST /v3/imports` and `/v3/imports/start` require
`imports: create`; `/v3/imports/status` requires `imports: read`. An app may
inspect/start only a job owned by its user and initiated for that exact signed
app origin. A self session retains owner access; another app cannot borrow it.

The job stores `authorization: {credential_kind, app_origin, expires}`, never
the bearer token. `authorize_import_job()` validates that recorded kind/expiry,
rechecks the latest active app contract and affected grants, and checks current
target ownership/role authority. The worker repeats authorization at execution
and mutation boundaries; persisted admission is not a permanent write grant.
Legacy jobs without scope require renewed authorization, rather than defaulting
to self authority. Starting an eligible non-running job records the newly
verified request scope; queued/processing jobs retain their recorded scope.

Current `import_permissions()` requires `readAll` and `create` on
`staging_posts`, `comments`, `media_metadata` and `profile`, plus exact
`imports: create` and `group: createGroup/manageRoles/assignRoles`. With an
explicit target, `profile` requires only `readAll`, and
`web10-social-group-identity` additionally requires `readAll/create`. Document
wildcards can cover those document services, never the reserved import/group
keys. Existing targets also require owner authority, effective `create` on the
written group services and `manageRoles/assignRoles` person authority. Expiry,
revocation or role removal must stop later checked writes; this is not an atomic
transaction or rollback of records already written.

Group reads and creation now require effective service `readAll` and `create`,
respectively, not just membership. Audit old custom contracts for missing grants
before resuming jobs or declaring an upgrade successful. There is no automatic
migration of arbitrary roles; the social app's canonical followers reconciliation
repairs its own contract only. Grant media permissions to `media_metadata` or
`public_media`, not a legacy `media` label. See [group access](../groups/access.md).

## Contacts and Media

New/replaced contacts remain unverified until the OTP provider approves the
stored contact. Recovery lists and authenticates existing accounts only through
verified, matching contacts. The five-minute recovery token has
`purpose: "recovery"` and numeric `exp`, and cannot serve as a session token.

Historical falsely verified contacts need an operator migration: identify rows
whose flags were set without OTP evidence, reset those flags and require real
verification before recovery. Do not assume the code repair cleans existing data.
Account verification rereads the contact after OTP, but the reread and verification
insert are not atomic. Concurrent contact replacement remains an open race;
recovery tokens are also not one-use records. Capture this in live tests and the
findings ledger rather than claiming transactional safety.

Object keys must stay under the authenticated author's prefix, with invalid path
components rejected. Confirmation checks object existence/size; workers recheck
ownership and size. This is **not upload-ticket provenance**: a key under the
author's tree does not prove that this request/app obtained the upload grant.
Upload, confirmation, list, read URL, thumbnail, delete, transcode, direct document
CRUD and query prepare all need their own service/app/person checks. The inspected
media endpoints contain grant checks, but complete live endpoint coverage remains
open. Keep that distinction in the ledger.

`resolve_media_urls` still filters deleted metadata before selecting its latest
version. If a readable carrier and the storage object remain, it can mint a fresh
URL from stale metadata; a short URL TTL does not fix repeated reminting. Include
deleted media references in merges-disabled direct-read/query-prepare checks
(SEC-012/015), not just carrier deletion.

Transcode admission checks app authority, but the queue retains only document
and author identifiers. Worker ownership/size checks are not a live check of the
initiating app's expiry or grants. Decide whether admission authorizes completion
after revocation, and validate that policy before promising queued-job cancellation
(SEC-016). Import execution checks do not establish transcode behavior.

## Enforced Limits

These are the inspected constants/defaults, not a global denial-of-service guarantee.

| Surface | Current bound | Source |
|---|---|---|
| Query | 1000 rows, 8 MiB result bytes, 10 seconds ClickHouse execution per query; read-only execution | `v3/endpoints/query.py` |
| Query rate | 60 requests per 60 seconds per verified user per worker; anon shares one worker budget | `v3/endpoints/query.py` |
| Recovery send | 5 per contact per 3600 seconds, minimum 60-second gap; per worker | `v3/endpoints/recovery.py` |
| Recovery proof | 5 minutes | `v3/endpoints/recovery.py` |
| Media | `max(1, min(MAX_UPLOAD_SIZE, 1 GiB))`; default `MAX_UPLOAD_SIZE=524288000` (500 MiB) | `services/hls.py`, `settings.py` |
| Presigned storage | Upload 300 seconds; read 60 seconds by default | `settings.py` |
| HLS | Signature 600 seconds; transcode queue 64; worker concurrency 1; ffmpeg timeout 600 seconds per rendition by default | `settings.py`, `services/transcode.py` |
| Import | Default 10 parts; 50 GiB compressed per part; 100 GiB expanded per part; 64 MiB per metadata member; 128 MiB metadata and 100000 members across job | `settings.py`, `v3/services/import_worker.py` |
| Import parser/queue | ZIP directory 32 MiB; TAR extended-header payload 1 MiB; queued jobs 100; worker concurrency default 1 | `v3/services/import_worker.py`, `settings.py` |
| PWA manifest proxy | 256 KiB response cap | `endpoints/system.py` |
| Import thumbnail fetch | 15-second requests timeout; no response-byte cap or whole-download deadline; default redirects and materialized response content | `v3/services/import_worker.py::_upload_thumbnail` |
| Password hashing | bcrypt uses the first 72 UTF-8 bytes (explicit truncation) | `services/auth.py` |

In-memory rate limits are best-effort, reset on restart and multiply with worker
count. Query execution time is not a whole-request deadline for all prepare reads.
No general HTTP body-size, SQL-length or global distributed abuse limit is established
by this table. Set edge/network budgets and verify them with the shipped stack.

Thumbnail fetching starts at the parser-derived `i.ytimg.com` URL, not a proven
arbitrary-host input. Its response allocation and redirect/network policy still
need separate bounds and validation; archive limits and the PWA manifest repair
do not cover that HTTP path (SEC-019).

## Live Release Gauntlet

Run against isolated disposable persistent stores and two real app origins. Record
build/version, configuration without secrets, cases, expected/actual results and
sanitized logs. Do not substitute mocked service calls for this evidence.

- Disable ClickHouse background merges and prove latest-row revocation, permission reduction, group changes, blocks/sharing and tombstones cannot resurrect old grants or content.
- Exercise two users, two apps with different grants, public/authenticated/private groups and service-isolated reads/writes, including direct IDs and media refs.
- In a real browser, approve app A, deny app B, request an upgrade, deny it, approve it, revoke it and retry with the same unexpired app token. A must never borrow B's grant.
- Exercise every reserved group capability, non-manager denials and node moderation/monetization with both admin and non-admin users; remove admin status and retry.
- Deny `user: blockUsers` and `imports: create/read` even with document wildcard grants. Verify cross-app job privacy, persisted scope after worker restart, old jobs requiring renewal, and expiry/contract/service/target-role revocation during import execution.
- Exercise exact `user: rateApps`, blocking-only/wildcard denials, consent wording and subsequent-request revocation without attributing older batch results to newer rating cases.
- Test point/batched/query reads and group attachment with read-only, create-only and missing-service roles, including old custom contracts without automatic migration and canonical followers reconciliation.
- Spoof/omit request Origin, send popup messages from wrong origins/windows, navigate/reuse popups, refresh, restore vault sessions and cross expiry. Never hand off a self credential on failure.
- Run hostile SQL/projections, raw-table/table-function attempts and prepare minting attempts; verify no cross-user secret or storage capability emerges.
- Walk every media endpoint, object-prefix/traversal attempt, oversized upload, worker recheck, HLS manifest/segment and post-revocation TTL window against real object storage.
- Verify real OTP, false historical flags, contact-replacement concurrency, forged/replayed recovery proofs and rate-limit behavior across workers.
- Exercise RTC with a trusted local base and an absent base, synthetic certification servers, revoked/expired app credentials and already connected sockets; validate redirects, deadlines and admission ordering without contacting sensitive internal services.
- Revoke/expire an app after transcode admission and record queued/in-flight behavior; test bounded thumbnail responses and redirects independently of archive parsing.
- Boot the built container with missing/malformed secrets and then explicit production-shaped secrets; prove login, JWKS, storage, HLS, setup isolation and key persistence after restart.
- Race isolated setup/signup and failed admin creation to establish bootstrap configuration ordering and the intended atomicity policy.
- Scan sanitized API, proxy, worker and browser evidence for credentials/content leakage; test old signing credentials after rotation/deadline.

Mocked regression tests, live storage tests, browser tests and an independent
external audit are separate assurance layers. The live delegation gauntlet and
external audit are outstanding until their evidence is attached. Track closures in
[the findings ledger](findings.md), not by declaring the
backend universally secure. Preserve D56 content-blind telemetry; this runbook
does not disable or redesign the approved telemetry policy.
