# OPS-LOG.md — append-only ledger of changes to the box

Newest at top. Format per AGENT-OPS.md §8. Read the top entries
BEFORE doing ops work — someone may already be mid-fix.

## 07.11.2026 21:49 EST — OpenCode (san-marino / jacoby149/sigmod-submission-review) — completed approved immutable research inputs
did:
  - Read-only SSH verified all-spark and current web10 containers; inspected only
    the configured production storage bucket/list. No stack/source/config edit,
    restart, deployment, account write or database content change on the box.
  - Operator explicitly selected web10 MinIO and then approved the exact target
    `https://minio.web10.app`, bucket `web10-media`, prefix
    `research/costfn/datasets/<dataset-id>/`. No new bucket or public policy.
  - Published synthetic 40-author floor plus hot/dispersed million-author V2
    artifacts, six table objects and manifest each (21 objects). Immutable
    conditional puts, manifest last, full remote reads and fresh download/all-row
    validation. Large table totals 282,574,957 and 282,594,851 compressed bytes;
    identities `53b16c1072a8e80032b20ae23c5675040b851274ad7a314a106b7557be3b5363`
    and `dbed2201952f9ca1b581c30a541e44b6912a5a6ba1bec84ee166aa80575132b4`.
  - Existing storage credential configuration was consumed only in controller
    process memory, not printed/saved or copied to a droplet. No bearer/signing
    keys or production records in datasets. Existing media/permissions untouched.
state: authenticated publication/download proof is pinned in
  `research/experiments/costfn/evidence/v2-*-publication.json`. Local functional
  API/DB/MinIO acceptance and cleanup are separate from this production storage
  operation; no cloud study or production app deployment occurred.
next: actual approved sized-host restore/topology/headroom/budget/watchdog
  preflight. Provision read-only dataset access separately; do not hand production
  admin credentials to experiment hosts or infer public access from the prefix.

## 05.11.2026 10:30–10:45 UTC — OpenCode (vatican / jacoby149/samhanks-profile-picture-fix) — prod followers-group public-grant backfill
did:
  - Diagnosed the operator's web10.app/trending screenshot (v4.10.0): samhanks +
    other pre-#994 accounts rendered as initials while group faces painted.
    Marketing pipeline proven correct on the deployed revision (the served
    bundle carries the 4.7.1 hydrateAuthors; the identical anon face-prepare
    signs jacoby149's CDN face end-to-end; board content media resolves).
    Root cause = node data state: pre-#994 followers groups lack the reserved
    `anyone -> reader` member row, so the I3 gate denies the `profile` face to
    anon (samhanks also absent from the D0 people directory); #1041 removed
    the sign-in re-heal and `setProfilePublic` has no UI caller, so the legacy
    state had no convergence path.
  - Read-only prod probes from local (no credentials): /v3/query face-prepare
    (samhanks 0 rows; jacoby149 1 row + media.web10.app capability URL),
    /v3/users/directory (samhanks absent, 14 users), /v3/groups/detail
    (contract + reader role intact for samhanks), deployed-bundle marker grep.
  - Operator authorized converging ALL current users to public-by-default.
    Ran `ubuntu-deployment/scripts/backfill-followers-public.py` inside
    `web10-prod-api-1` (`docker exec -i ... uv run python -`), DRY-RUN first:
    27 followers groups, 13 would-heal, 0 anomalies, 0 errors. Then `--apply`:
    13 groups gained the `anyone -> reader` reserved row, 10 of them also the
    missing `reader` role definition. In-script verify: 27/27 groups
    `can_read_group(anon, profile)` True.
  - Post-apply external verify: samhanks face-prepare returns 1 row with a
    media.web10.app capability URL; GET = HTTP 200 image/jpeg 57,064 B
    (512x512 JPEG); /v3/users/directory now 27 users (was 14) incl. samhanks;
    board batch probe 9 -> 11 face rows (board authors with a picture set:
    jacoby149 + samhanks; the rest have no avatar_ref, honestly faceless).
  - web10-dev stack: dry-run only — 1 followers group, already public; no writes.
  - Browser captures of https://web10.app/trending at 375x812 + 1280x800
    (8s settle): samhanks' real face paints on the #1 post card, both widths.
    No app code / config / container change; no content or media write; no
    permission-policy or TTL change. Re-running the script is a no-op.
state: prod marketing trending/People/directory/preview surfaces now paint
  every anon-readable face; the healed set is exactly the pre-#994 legacy
  groups; dev untouched (already public).
next: commit the script + this record; PR to dev; CI; no further box action.

## 04.11.2026 00:52–00:56 UTC — OpenCode (charlotte) — normal production CDN persistence verified
did:
  - Normal production deploy 41749919820, cd/image publication 41749919850 and all
    four post-merge main E2E shards 41749919886 finish green for b4e3b4bd9a84.
  - Independently verify a new API container created 00:52:24 UTC and image
    sha256:7c20538aad31e869c7e20b58b3e9f3adcb0bcdaea268b7535a2a8f83d7ae7c18.
    Four runtime source-file hashes match the promoted revision; seven forwarded
    media fields remain and issuance is true. MinIO container unchanged; active
    private env and authoritative backup remain byte-identical.
  - Public status serves version 4.0.7 / b4e3b4bd. API docs, auth, social, marketing
    and apex return 200. Extra GET API root returns 405 because it is POST-only;
    correct that probe expectation from source, not the service.
  - Real API login/owner-issued CDN full/repeat reads match bytes, range returns
    206, missing and naturally expired capabilities return 403. An early expiry
    attempt stops locally; bounded deadline waiting then confirms real denial.
  - Browser attempts initially fail before navigation because matching Chromium
    is absent locally. Install matching Playwright browser; actual synthetic
    four-second MP4 again ends at 96 frames/206 at desktop and 375px. Marketing
    capture then times out on a nonexistent main selector; use its actual h1.
    Marketing and anonymous social desktop/375px captures succeed and are inspected,
    as are both playback captures. No application code or live config patched.
  - One new synthetic production signup/login passes (no uploads), with credentials
    retained privately. Existing canary account/objects reused for media probes;
    no existing private user data touched. Worker is still the normal adapter.
state: normal main deployment preserves enabled CDN issuance; bounded persistence
  gate CLOSED. Keys, origin credential, storage and private env backups retained.
  Original pinned rollback snapshots restore the earlier API generation, not the
  newly promoted release. Full-player renewal/provider/security gates stay OPEN.
next: continue MEDIA-LIVE-RELEASE proof work, not another persistence workaround.
  This deployment is not a capacity benchmark or broad security sign-off.

## 04.11.2026 00:51 UTC — OpenCode (charlotte) — operator-authorized normal production promotion started
did:
  - Operator approved deliberately promoting the dev batch to preserve CDN settings
    through normal production deployments, including the known importer retirement.
  - Promotion #1366 initially conflicts because of old squash ancestry. Reconcile
    existing main into dev through merge-commit PR #1367; before its changelog
    addition, the full tree exactly equals existing dev (no runtime/config delta).
  - Promotion checks all pass: API, security method/gauntlet, changed frontend
    tests/builds, all six image builds and all four E2E shards. Local frozen API
    suite also passes 1929 tests plus eight subtests, one opt-in skip; Ruff passes.
    Optional local frontend attempts lacked installed vitest; actual CI frontend
    jobs install their dependencies and pass. No frontend failure waived.
  - Read-only production preflight confirms both private env copies are identical
    and private, all seven media fields present, no shared media overrides, API
    storage credential matches MinIO, and the existing deploy credential guard
    passes without requiring password replacement. Exact old generation retained
    in private receipt for post-deploy comparison.
  - Merge #1366 with a merge commit at b4e3b4bd9a84b5b8ae823221fd8e91f20c74e424.
    Normal main deploy 41749919820, cd 41749919850 and E2E 41749919886 started.
state: main now contains canonical media forwarding. Normal production rollout is
  in flight; do not claim the deployed persistence gate closed until verified.
next: wait for green workflows, verify new API source/generation and retained media
  env/private backup, then repeat public/auth/CDN/range/expiry/browser acceptance.

## 04.11.2026 00:36 UTC — OpenCode (charlotte) — live cache and final normal-Worker verification
did:
  - Temporarily deployed metadata diagnostics restricted to the owned synthetic
    text canary path; all other requests delegate to the normal adapter. Two IAD
    requests return 200/matching bytes with cache=hit and no origin fetch. The
    naturally expired API-issued URL returns 403 with neither cache nor origin
    reached. Live origin credential stays enabled and unchanged throughout.
  - Restored normal media-delivery/cloudflare.mjs Worker and removed diagnostic
    configuration. Repeated actual production health/login/owner issuance, full
    reads/hash, range 206 and missing-capability 403 all pass after restoration.
  - Final node metadata: issuance true, separate key/base present, seven active
    media fields, authoritative backup present, diagnosticDeployed false. Recorded
    bounded evidence and immutable receipt hashes in media-delivery/PRODUCTION-ACCEPTANCE.md.
state: actual production API-issued CDN delivery is live; MinIO stays private and
  in place. Only synthetic account/text/video data added; original API image retained.
  No unrelated dev promotion, zone-wide SSL change or full security-readiness claim.
next: close normal main-deployment forwarding/persistence before the next production
  deploy; pinned private recovery snapshots exist in the scope-owned node vault.
  Complete document/query issuance, full-player long-video renewal, provider audit/
  measurements and independent diverse security review as separate gates.

## 04.11.2026 00:28–00:35 UTC — OpenCode (charlotte) — production CDN issuance enabled, API/browser canary passes
did:
  - Operator added the hostname-only Cloudflare SSL Configuration Rule. Normal
    production Worker canary now returns matching bytes/200 and expired/missing
    403; redirect failure is resolved without changing zone-wide SSL.
  - Activation preflight proves current Compose API non-media environment, command,
    storage credentials and networks match the running production generation.
    No production image rebuild or dev→main promotion performed.
  - Staged private candidate env, image-pinned API-only activation and rollback
    Compose snapshots in the existing scope-owned ops vault. First fresh-runtime
    validation fails because installed Compose 2.23 lacks run --pull; safe metadata
    diagnosis confirms the unsupported flag. Remove only that run flag; resumed
    staging checks exact prior artifact contents. Fresh runtime settings validate
    and public JWK equals the Worker key before active env files are touched.
  - Atomically wrote all seven media fields to active env.prod and the newly created
    authoritative ~/web10-ops/env.prod backup; PEM stays private, mode 0600. Recreated
    only production API using its exact existing sha256:0e1e38de41f6 image and frozen
    existing configuration. MinIO/root credentials and other services unchanged.
  - Live docs/login/owner read-url pass; actual API-issued media.web10.app capability
    has TTL 60, matching first/repeat full reads 200 and range 206, missing denial
    403. An early expiry probe stops locally before deadline; after actual expiry,
    the same API-issued URL returns 403.
  - Added one 118128-byte synthetic MP4 under the existing canary account via real
    production upload authorization. Chromium plays all four seconds/96 frames at
    desktop and 375px viewports with CDN 206; screenshots inspected independently.
    This is a synthetic direct-video probe, not social-player/HLS renewal proof.
state: production API issuance is ON, separate key/base present, normal Worker live;
  private active env and backup contain seven media fields. Original disabled env,
  exact image-pinned API rollback and enabled recovery Compose are retained privately.
  Main still lacks Compose forwarding; a future normal main deploy can revert to
  legacy delivery until wiring is deliberately promoted. No unrelated promotion.
next: verify cache behavior only on the owned synthetic canary without disabling
  the live origin credential; restore normal Worker, verify final state, then
  preserve wiring through normal production release coordination. Full-player
  renewal, provider measurements/log audit and diverse security review stay OPEN.

## 04.11.2026 00:22 UTC — OpenCode (charlotte) — media origin TLS blocker isolated, normal Worker restored
did:
  - Direct production S3 adapter GET returns 200/41 bytes. Temporary status-only
    Worker diagnostics show cache miss, origin 301 and same-origin redirect;
    no signed URLs, credentials or response content emitted.
  - Zone SSL mode is Flexible. Configuration Rules reads return 403 with both
    server deployment credential and local Wrangler OAuth. No rule was created.
  - Read-only inventory finds five other proxied records. Four deployment-origin
    hostnames fail direct public-origin certificate validation; a fifth record is
    not a deployment origin. Cause of those validation failures is not established.
    The guarded zone-wide Strict change was NOT run; unrelated services untouched.
  - Restored the normal media-delivery/cloudflare.mjs Worker, removing temporary
    diagnostics. Missing-capability request still returns expected 403/CORS.
  - Fresh node metadata confirms production issuance false, no key/base in runtime,
    zero media env fields in active env.prod, and authoritative env.prod backup
    still absent. No API recreate, env edit, production promotion or TLS mutation.
state: Worker/domain, restricted origin identity and separate private signing key
  are staged, not activated. Real app retains legacy delivery. Signed edge reads
  remain blocked by the observed redirect; full-player and broader release gates
  remain OPEN. Private scope and immutable receipts stay outside Git.
next: operator creates a hostname-only Configuration Rule (zone web10.app, SSL
  Full (strict), expression http.host in {"media.web10.app" "minio.web10.app"}),
  or provides Configuration Rules edit access through private credential storage.
  Do not change zone-wide TLS. After independent verification, repeat the canary,
  then resolve narrow production wiring persistence and activation with rollback.

## 04.11.2026 00:11–00:12 UTC — OpenCode (charlotte) — production Worker staged, activation held
did:
  - Actual production origin read identity passes independent GetObject 200/hash,
    ListObjects/PutObject AccessDenied 403; synthetic canary upload is private
    (unsigned origin 403). One dedicated synthetic production account/object added.
  - Generated a new media-only RSA key on the node, stored only in a private
    scope-owned ops vault; only its public JWK leaves the server. Authentication
    key unchanged. Exact private recovery state/receipts remain outside Git.
  - Deployed web10-media-prod with managed media.web10.app custom domain, 50 ms
    CPU, private origin credentials, outer cache/request logging off. API issuance
    remains disabled and neither active env.prod nor its missing backup is edited.
  - Domain health returns expected 403/CORS for missing credentials. Two signed
    canary acceptance attempts fail; retained latest response is empty 502 after
    authorization. Stopped activation/retries and moved to read-only origin
    diagnosis rather than changing node settings or broadening permissions.
state: production Worker/domain exist but real app still uses legacy delivery.
  New read-only IAM identity and signing key are staged; root passwords, existing
  identities/bucket policies, production API generation and data are unchanged
  except the explicit synthetic canary. No full CDN hookup claim.
next: establish the edge-origin fetch cause from safe metadata before repair,
  repeat acceptance only after an evidenced fix, then deliberate activation/rollback.

## 03.11.2026 — OpenCode (charlotte) — production origin identity provisioned, issuance still off
did:
  - Operator authorized resume. Server-side Cloudflare DNS read using the existing
    deployment credential returns 200 and zero media.web10.app records; token stays
    on the SSH host. Worker/domain absence and unchanged production config verified.
  - Through pinned official MinIO Admin SDK, created a uniquely scoped named policy
    granting only GetObject on the existing production media bucket, then a new
    dedicated direct IAM user and attached only that policy. Each operation's
    read-back verification succeeds; no root credential goes to the edge.
  - Direct IAM identity deliberately avoids the embedded service-account policy
    status-update behavior found in the smoke test. Exact scope/secret recovery
    state and receipts remain private under .context/cdn-live/production.
state: new read-only origin identity exists; no Worker/domain/node signing key or
  production env change yet, and issuance remains disabled. Existing data, root
  passwords, existing identities and bucket policies are unchanged.
next: independently prove actual GET/list/write behavior against an owned synthetic
  canary, stage the separate node signing key and Worker, then gated activation.

## 03.11.2026 — OpenCode (charlotte) — production CDN preflight, no mutation
did:
  - Operator explicitly requested actual production hookup. Verified production
    API/MinIO containers and existing web10-media / HTTPS MinIO origin metadata;
    production issuance remains false with no signing key/base. The active private
    env.prod exists with no media fields; authoritative backup is absent. Shared
    .env has no media overrides. Credentials/env contents never printed.
  - Cloudflare confirms proposed web10-media-prod Worker and media.web10.app Worker
    domain are absent. DNS-record lookup through current Wrangler OAuth does not
    succeed, so record absence is NOT proven and no domain is attached.
  - Two preflight attempts failed: an over-strict missing-backup assumption (local
    harness corrected), then unproven DNS absence. Stopped live operations at the
    runbook limit. Prepared, but did not execute, a safe DNS-read fallback using
    the existing CF_API_TOKEN on the SSH host; it never returns the token.
state: no production key/identity/policy/env/Worker/DNS/container mutation. No
  passwords rotated, objects uploaded/deleted or node flag enabled. Private
  proposed scope and immutable preflight receipts remain under .context/cdn-live/production.
next: operator-authorized resume of metadata-only DNS preflight through the
  existing deployment credential, then one-change-at-a-time production provisioning
  and deliberate promotion/activation with rollback. Do not report CDN as live.

## 03.11.2026 23:43–23:44 UTC — OpenCode (charlotte) — deployed disabled wiring verified
did:
  - Verified merged #1362/22838d349ee5 and successful deploy run 41741009836.
    Read-only SSH independently verifies all-spark and exact dev/prod API containers;
    raw inspect/environment values are captured privately, never printed.
  - Dev container created 23:41:21 UTC has all seven media env fields; fresh runtime
    settings report enabled=false, TTL=60, keyPresent=false, basePresent=false.
    Production runtime reports enabled=false, TTL=60, no key/base and zero media
    env fields. Production wiring merge is not on main; no activation inferred.
  - Dev/prod API docs and media JWKS GETs return 200 with empty key arrays.
    Created one recorded synthetic dev account, logged in and minted an owner-only
    legacy MinIO SigV4 read URL for a synthetic unuploaded key. Password/token/URL
    stay in memory; private account scope and redacted receipts stay in .context.
state: deployed dev wiring works in disabled mode and legacy signing remains.
  Production CDN is NOT configured/enabled. No object upload, config/credential/
  bucket-policy/DNS change, production mutation, container restart or redeploy by
  this session. Only one synthetic dev user was added; no private user data read.
next: actual scoped Worker/origin/key/hostname provisioning and gated activation
  remain. Do not equate merged wiring or disabled-mode acceptance with completion
  of the production CDN hookup or the broader MEDIA-LIVE-RELEASE gates.

## 03.11.2026 22:43–22:45 UTC — OpenCode (charlotte, web10-cdn-setup) — isolated CPU guardrail under accepted overage risk
did:
  - Operator explicitly accepted Workers Paid minimum/usage-overage exposure after
    discussion of the absence of a verified hard monthly cap. Did not infer waived
    security/playback gates or permission to activate unrelated paid products.
  - Persisted 50 ms per-invocation CPU in deployment example/private generator and
    deployed only the existing owned isolated Worker, keeping outer caching and
    request logging disabled in its configuration. Settings API independently
    returns cpu_ms=50 and logpush false; absent observability/cache fields remain
    unknown at the account level. No billing/notification-policy operations performed.
  - Repeated IAD cache-disable/expired-denial proof (19 requests, safe atomic storage
    status/policy updates, account restored). Then real local ClickHouse HLS HTTP/
    desktop/375px browser acceptance passes again (29 probes, four seconds/96 frames).
    Temporary local API/container removed and absence independently verified.
  - Aggregate-only CPU GraphQL query returned an error, no usable measurement;
    no raw logs/URLs requested, no CPU quantile or cost forecast claimed. 43 offline
    tests and Wrangler dry-run pass; receipts retain actual settings/results.
state: isolated Worker has 50 ms CPU guardrail; original restricted account and keys
  remain. No production issuance/DNS, shared passwords/bucket policies, R2 activation,
  billing subscription or alert changes. A per-request CPU guardrail is NOT a monthly cap.
next: confirm paid entitlement/alerts via permitted account access, complete safe
  logging/resource observations, authenticated issuance/full-player renewal and
  independent security review before any explicitly approved production canary.

## 03.11.2026 22:15–22:25 UTC — OpenCode (charlotte, web10-cdn-setup) — real local DB acceptance / provider audit
did:
  - Self-booted local-only, labelled ClickHouse 24.8.14.39 containers and loopback
    HLS API against actual source functions and existing restricted synthetic
    MinIO/Cloudflare scope. No production DB, node, policy or Worker changes.
  - Actual owner/member/carrier public/authenticated grants and revocation pass,
    including eight-second parent/edge expiry, explicit fresh renewal and revoked
    renewal denial. Final run: 29 named probes plus desktop/375px live API manifests
    and two Cloudflare segments/four seconds/96 frames each. One router-adaptation
    setup failure retained; corrected and subsequent clean runs passed.
  - Source hashes/engine/image receipt and redacted summary retained. Inspected
    screenshots; final receipt confirms API stopped and labelled container removed.
    Independent Docker label listing is empty. Existing unrelated containers untouched.
  - Read-only Cloudflare script settings show logpush false; subscriptions and
    account/zone log-export requests return 403. Did not infer absent exports or
    paid subscription from unavailable reads. No billing/logging settings changed.
  - Record current first-party terms/prices/limits and pin outer cache/logging off
    in the disabled deployment example; 43 offline tests, Ruff and Wrangler dry-run
    pass. The example was not deployed.
state: original isolated Worker/account/keys remain in prior verified restricted
  state; synthetic objects unchanged. All new local acceptance resources removed.
  No SSH host changes, production issuance/DNS, billing, R2 or unrelated-stack changes.
next: operator confirmation of paid entitlement and log exports, measured resource
  bounds, initial authenticated document issuance/full-player long-video renewal,
  independent security review and explicit canary approval remain release gates.

## 03.11.2026 22:00–22:07 UTC — OpenCode (charlotte, web10-cdn-setup) — atomic restriction repair verified
did:
  - Operator authorized diagnosis/repair. Read-only audit confirmed exact named
    account off with an empty policy; fixed null-Statement diagnostic parsing.
    Captured exact installed mc/MinIO versions without credentials. Upstream source
    proves status-only updates omit policy, and server IAM store removes the
    embedded restriction on nil policy, falling back to parent authority.
  - Added tested isolated-scope helper using official minio==7.2.18 Admin SDK.
    One-off containers use the existing API image and MinIO network namespace;
    no running API source/dependency/config changes. Root credentials stay remote
    in memory/stdin; never passed in command arguments or returned to the client.
  - Repaired status+exact GetObject policy atomically while account remained off.
    Controlled atomic enable yielded actual GET 200/hash match and list/write
    AccessDenied 403. Initial mc post-check rejected its omitted false field;
    fail-safe disabled the account. Corrected known omitempty parser, reran and
    independently inspected embedded policy/status before lifting local quarantine.
  - Repeated 19-request ATL cache disable/restore with atomic updates: warm 200,
    cold/range 502, expired 403 and restored range 206. Subsequent list/write remain
    AccessDenied 403; policy still exact, embedded and account on. Desktop/375px
    Chromium synthetic HLS completes two segments/96 frames/four seconds again;
    both screenshots inspected. All receipts retained separately, including failures.
state: isolated Worker restored with restricted original account and original keys;
  seven synthetic objects retained. No root/shared password or existing bucket-policy
  changes, production issuance, DNS, R2 or unrelated-container changes. 42 tests
  include six offline policy regressions; no independent security completion claim.
next: real-node permission/long-playback renewal, provider logging/limits and
  independent security review remain MEDIA-LIVE gates before production canary.

## 03.11.2026 21:50–21:57 UTC — OpenCode (charlotte, web10-cdn-setup) — acceptance progress, storage account quarantined
did:
  - Added Node-only location evidence and exclusive private per-run receipts;
    41 edge/interoperability tests pass. One new fetch-pool attempt remained
    inconclusive; switched the private probe to bounded single-socket keep-alive
    without dropping location checks. Fresh IAD cache-disable/expired-denial
    verification passed; restored the test account after that experiment.
  - Chromium desktop/375px image/range checks passed. Redeployed ONLY the owned
    isolated Worker through test-key staging, overlap and post-expiry retirement;
    original smoke public key remained throughout and original key set restored.
  - Uploaded three exact synthetic HLS fixtures to the isolated bucket. Actual API
    handlers (synthetic access stub, real MinIO playlist) generated exact-key,
    parent-bounded capabilities; Chromium played two CDN segments/four seconds/
    96 frames at both widths. Inspected both screenshots in `.context/cdn-live/`.
    Initial local script import setup failed, corrected project path and passed.
  - Negative permission probes using the Worker account returned list 200 and
    write 200, creating only `policy-probe.txt` with synthetic text. Immediately
    disabled that exact named account; independent signed origin probe returned
    403/InvalidAccessKeyId. Marked private state quarantined so normal reuse refuses.
  - Two guarded read-only policy-inspection attempts failed. Stopped live work at
    the runbook limit; ineffective-policy cause is not established. No shared/root
    password rotation, existing bucket-policy edits or other-account operations.
state: Worker remains deployed with original signing keys, storage account DISABLED
  and quarantined. Seven known synthetic objects remain, with exact-key cleanup
  scope recorded privately; no cleanup performed. Read-only/bucket-confined authority
  is NOT proven. No production-node issuance, DNS, R2 or unrelated-container changes.
next: operator-authorized policy diagnosis/repair with exact-version mc/MinIO
  semantics, effective-policy inspection and actual GET/list/write controls before
  any re-enable. Real-node authorization/renewal, logs/limits and independent
  security review still gate production. MEDIA-LIVE remains OPEN.

## 03.11.2026 21:33–21:34 UTC — OpenCode (charlotte, web10-cdn-setup) — resume isolated delivery verification
did:
  - Reconciled interrupted-session files before provisioning: synthetic bucket,
    separate service account and isolated workers.dev Worker already existed.
    Read saved 12:56 deployment/12:57 verification receipts: 15 checks passed at
    IAD, including account-disabled warm-cache 200, cold/range 502, expired 403
    and account restoration. Did not reprovision or redeploy.
  - Explicitly enabled only the recorded test service account through the guarded
    SSH harness. Two fresh verification attempts failed acceptance: EWR-to-IAD
    routing change, then EWR-warmed object checked at ATL during account disable
    returned 502. The second attempt's finally restored the account successfully.
  - Stopped live retries at the runbook limit. The harness overwrote its old
    per-stage receipt; transcribed the originally read success and fresh failures
    in `media-delivery/CONNECTED-ACCEPTANCE.md`, without credentials or signed URLs.
state: isolated resources remain deployed, account restored; no shared-password,
  production-node, DNS, existing bucket-policy or unrelated-container changes.
  Fresh cache proof is inconclusive across locations, not a demonstrated runtime
  regression. All 36 local edge/interoperability tests pass, including the saved
  origin-fetch no-store regression; HEAD fails that assertion offline.
next: preserve immutable receipts and match cache controls by observed location
  before another operator-authorized live attempt. Browser/HLS, rotation, policy,
  logging and independent security gates remain open; production issuance stays off.

## 02.11.2026 — OpenCode (charlotte, web10-cdn-setup) — isolated bucket created, account-name limit
did:
  - Resumed operator-authorized synthetic provisioning after the credential-alias
    repair. Created only the recorded random isolated test bucket, explicitly
    denied anonymous reads and uploaded three synthetic text/image fixtures.
  - Service-account creation failed twice before successful provisioning. Stopped
    retries and independently checked exact-version mc/madmin source read-only:
    account friendly names are limited to 32 characters; harness supplied the
    41-character bucket name. Client validation occurs before the creation call.
  - Read-only service-account listing returned no accounts for the parent. Fixed
    local harness to derive a distinct 26-character account name and use it for
    both creation and ownership checks. Improved diagnostics; no further retry.
state: isolated synthetic bucket/fixtures remain for continuation. No service
  account or Worker deployed; no DNS, existing bucket policy, shared password or
  node rollout changes. Exact scope retained privately under `.context/cdn-live/`.
next: resume the corrected account setup with operator authorization, then deploy
  and verify the isolated Worker; production delivery remains disabled.

## 02.11.2026 — OpenCode (charlotte, web10-cdn-setup) — isolated CDN setup blocked
did:
  - Verified SSH host `all-spark`, running web10 MinIO containers and installed
    `mc`; Cloudflare Wrangler OAuth login succeeded on the operator's machine.
  - Prepared a private local harness for an isolated synthetic bucket and scoped,
    two-day read-only service account. Root credentials stay inside the SSH host;
    requests capture child output rather than printing credentials or signed URLs.
  - Attempted synthetic provisioning, then read-only diagnostics. MinIO returned
    `SignatureDoesNotMatch` using the running container's root environment through
    an ephemeral MC_HOST alias. Stopped after repeated diagnostic failure under
    AGENT-OPS; do not infer whether this is credential drift or alias encoding.
state: no Worker deployment, DNS edits, node rollout, credential rotation or
  confirmed successful storage mutation. Initial provisioning did not complete;
  local private state retains the exact proposed bucket for later reconciliation.
next: reconcile the MinIO administration credential/alias path read-only before
  retrying provisioning; never reset the shared MINIO_PASSWORD as a shortcut.
  Connected cache/access/playback gates remain open; production delivery OFF.

Read-only follow-up (operator authorized diagnosis): confirmed API/container
credential equality without printing values; actual API HeadBucket returns 200.
The temporary harness percent-encoded credentials in MC_HOST; `mc` retained the
encoded secret literally. A literal-credential alias round-trips both values and
passes `mc admin info`. Corrected only the private local harness and added alias
round-trip validation before mutation. No server credentials, buckets, policies,
node configuration or Cloudflare deployments changed during diagnosis. Original
authentication blocker resolved; synthetic provisioning/live gates still pending.

## 03.11.2026 — OpenCode (mogadishu) — read-only group media incident diagnosis
did: verified documented host and prod container state; examined deployed carrier
  code and bounded current metadata. Eight group carriers/eleven refs have matching
  upload-owner metadata/namespaces; public raw URL range GETs all return 206.
state: serving HLS denies four group-carried videos. Local repair evaluated only
  in a short-lived read-only interpreter returns four 200 masters, eight 200
  variants and eight nonempty 200 sample segments from existing storage. No files,
  workers, settings, memberships or data changed; no backfill candidates found.
next: normal reviewed deployment and actual external browser playback acceptance.

## 28.10.2026 22:44-22:55 UTC — OpenCode (ssh-ubuntu-run-tests) — live research pilot
did:
  - Operator authorized SSH statistics and login to the operator's production
    account. Verified documented host identity; read hardware metadata, named
    production-container status, software versions, image IDs and query source hash.
  - Bounded read-only ClickHouse aggregates (`FINAL`, then deleted filtering;
    one thread, 10-15s timeout): 597 accounts, 593 documents, 49 groups, 1,298
    memberships, 437 document/group links. No private rows or credentials retained.
  - Actual social/auth popup login and consent, then three sequential rounds of
    Following/Music/Groups from one local browser. Normal app requests included
    contract adds and impressions; no deliberate post/follow/reaction/message or
    group edits. Closed browser; no session-state files or private screenshots.
  - No restarts, builds, deploys, schema/volume/host changes or password changes.
    CI fixtures, destructive seeds and concurrent write gauntlets were not run.
state: nine final route checks completed with HTTP 200 documents, retained
  sessions and zero uncaught page errors; 20 posts and six groups each round.
  Initial music-card wait timed out: zero music-tagged posts. Final check asserts
  the explicit empty state, not playback. Deployed API has no phase-timing marker;
  exact running-image application revision is unverified.
next: `research/live-observation-2026-10-28.md` records methods and limits. Collect
  continuous resources/build provenance and a larger controlled sample before a
  finished evaluation; no load-test or deployment authorization inferred.

## 30.09.2026 20:20 — opencode (montpellier, jacoby149/heal-dead-groups) — healed the operator's "dead groups" (creator row drifted off `owner`)
did:
  - Diagnosed the "groups I created I can't edit/delete" bug in prod + dev
    ClickHouse: the social app created community groups with the owner row
    under `web10.app/users/jacoby149` (full form), but the node resolves the
    acting user to the BARE username (`_user` → JWT `username`). The node's
    `create_group` then added `jacoby149 → admin` (a role NOT in the community
    contract), so the creator's resolvable role granted no `manageRoles` /
    `deleteGroup` → the group was unmanageable ("dead").
  - Healed the 4 dead groups by inserting a current `jacoby149 → owner` row
    (latest-row dedup makes it win over the stale admin/member row) — the same
    minimal fix the new node `ensure_creator_owner` / `POST /v3/groups/heal-owner`
    do in code:
    - web10-dev-clickhouse-1: `…/users/jacoby149/boxin-club`,
      `…/users/jacoby149/new-group`.
    - web10-prod-clickhouse-1: `…/users/jacoby149/boxin-club`,
      `…/users/jacoby149/e-sports-grinders`.
  - No volumes touched, no data deleted — additive membership rows only. The
    orphaned `web10.app/users/jacoby149 → owner` rows were left in place
    (harmless; the permission checks match the bare username).
state: all 4 groups now resolve `jacoby149 → owner` (verified via the
  deduped group_members read). The operator can now edit/delete them in the
  app. web10-dev + web10-prod stacks otherwise untouched.
next: the code fix (root cause + self-heal + delete affordance) ships in the
  montpellier branch → dev; once deployed, any future dead group self-heals on
  load and is deletable from the My Groups list.

## 09.09.2026 23:40 — opencode (honolulu) — retired the box e2e self-hosted runner (dead weight after 3.77.7 moved e2e to GitHub-hosted)
did:
  - The `web10-e2e-box` self-hosted runner (added 3.77.3, retired when e2e
    moved to GitHub-hosted runners in 3.77.7) was already unregistered from
    GitHub (repo `actions/runners` total_count=0) and its systemd service
    (`actions-runner-web10-e2e-box.service`) already stopped + disabled
    (Sep 09 23:07). Only dead weight remained on the box.
  - `sudo rm -rf /home/ci-runner/actions-runner` (917M of runner + cached
    npm/playwright/docker artifacts).
  - `sudo rm -f /etc/systemd/system/actions-runner-web10-e2e-box.service`
    + `systemctl daemon-reload` (the orphaned unit).
  - `sudo userdel -r ci-runner` (the dedicated runner user; it was in the
    docker group — verified nothing else referenced it: no other systemd
    unit, no crontab, no running process).
state: box clean — no runner process, no runner user, no runner unit, no
  GitHub registration. The 4-shard e2e runs on GitHub-hosted `ubuntu-latest`
  (PR #868, ~4.5 min, green). web10-dev + web10-prod stacks untouched.
next: none — the e2e runner loose end is fully closed.

## 12.08.2026 02:26 — opencode (amsterdam) — ClickHouse init script made resilient + web10-dev schema reset
did:
  - Diagnosed: clickhouse-init/001-init-v3-schema.sql ran before server
    accepted connections, silently creating 0 tables. Renamed to
    .sql.template (entrypoint ignores non-.sql/.sh). Added
    001-init-v3-schema.sh wrapper that retries clickhouse-client up to
    60s before piping SQL.
  - web10-dev-clickhouse-1: stopped, removed, volume
    web10-dev_clickhouse-data wiped, redeployed with docker compose.
    All 16 tables verified created on fresh start.
  - Pushed fix to dev (PR #567, merged).
state: web10-dev ClickHouse has all 16 tables (documents, doc_groups,
  group_contracts, group_members, group_join_requests, group_hidden_docs,
  service_contracts, user_blacklist, group_blacklist, user_group_sharing,
  provider_service_contracts, users, apps, app_ratings, app_contracts,
  bug_reports). Init script now resilient to startup race.
next: none — init is idempotent (IF NOT EXISTS), so future volume wipes
  will auto-recreate schema without manual intervention.

## 29.07.2026 01:35 — opencode (prague) — host reboot test: onboot + watchdog VERIFIED end-to-end
did:
  - Operator rebooted the Proxmox HOST as a live test. Result: VM 100
    auto-started ~1 min after the host (onboot: 1 works). All 20 docker
    containers came up; mongod active (restart drop-in held).
- Watchdog now fully live: i6300esb device visible in guest
     (lspci 00:04.0), /dev/watchdog0 present, RuntimeWatchdogUSec=30s
     armed (systemd pinging). A hung guest now gets hard-reset by the
     host. Note: i6300esb needed one manual `modprobe` this boot —
     root cause: Ubuntu ships `/etc/modprobe.d/97-blacklist-watchdog.conf`
     that blocks watchdog modules at boot. Blacklist file removed;
     `/etc/modules-load.d/watchdog.conf` (i6300esb) now loads it
     automatically. Verified post-fix: module loads, /dev/watchdog
     present, systemd armed at 30s — no manual steps needed.
  - Prod public smoke green after it all: web10.app, api/docs, auth,
    social, marketing-api/docs all 200.
state: fully hardened chain verified: power loss -> host boots -> VM
  boots (onboot) -> containers + mongo self-heal; guest hang ->
  watchdog reset. No manual steps needed anymore.
next: only the optional SSH-key-for-root@pve + password rotation
  remains (password was shared in chat).

## 29.07.2026 01:10 — opencode (prague) — hardening: VM watchdog + mongod auto-restart
did (operator-approved follow-up to the entry above):
  - HOST (pve): `qm set 100 --watchdog model=i6300esb,action=reset` —
    Proxmox now hard-resets the VM if the guest OS hangs. Device is in
    the config but NOT live yet: the i6300esb PCI device can't
    hotplug, so it activates at the next VM reboot (no /dev/watchdog
    in the guest until then).
  - GUEST: `/etc/modules-load.d/watchdog.conf` loads i6300esb at boot;
    `RuntimeWatchdogSec=30` set in /etc/systemd/system.conf so systemd
    pings the watchdog once the device exists (active next boot).
  - GUEST: systemd drop-in /etc/systemd/system/mongod.service.d/
    restart.conf — Restart=on-failure, RestartSec=5, no start limit —
    so the status-48 boot race self-heals instead of leaving mongo
    down. daemon-reloaded; verified via systemctl show (active/running,
    Restart=on-failure).
state: prod untouched and green. Watchdog pending one VM reboot;
  everything else live.
next: reboot the VM in a maintenance window (~1 min prod downtime) to
  activate the watchdog; after reboot verify /dev/watchdog exists and
  `systemctl show mongod` still active. Optionally install an SSH key
  for root@pve and rotate its password (currently shared in chat).

## 29.07.2026 00:58 — opencode (prague) — power loss took down Proxmox host; VM onboot fixed; mongod restarted
did:
  - INCIDENT: all web10.app vhosts unreachable (no ping, no TCP 22/80/443
    on the public IP). Root cause: NOT the VM — the Proxmox host
    (192.168.8.20, "pve") lost power / hard-crashed ~05:17 EDT 28.07:
    both host journal (prev boot, 5 months uptime since 04.02) and VM
    journal end abruptly mid-cron with no shutdown sequence. Host came
    back but the VM (100, server-rack-ubuntu-original) had no `onboot`
    flag, so it stayed off until the operator started it manually.
  - FIX (on pve): `qm set 100 --onboot 1` — VM now auto-starts with the
    host. Verified in /etc/pve/qemu-server/100.conf. New-boot journal
    shows no MCE/hardware errors; SMART on /dev/sdd clean (0
    reallocated, 33C). Cause reads as power event, not hardware fault.
  - Started the natively-installed mongod on the VM (`sudo systemctl
    start mongod`): it had failed at boot with exit status 48 (port
    already in use — startup race, also seen on the 17.07 boot). Now
    `active`, `enabled`, ping `{ok:1}`, listening on 127.0.0.1:27017.
  - Verified prod public slice: web10.app, www, auth, social,
    marketing-api/docs all 200; api.web10.app / 307 + /docs 200.
state: all green. Proxmox root login currently uses a password in
  operator chat — recommend installing an SSH key and rotating it.
  mongod boot-race (status 48) may recur on future VM boots.

## 24.07.2026 19:45 — opencode (el-paso-v1, chore/backup-restore-drill) — off-box backup + smoke verification
did (SSH as jacob@192.168.8.25):
  - SMOKE: ran scripts/smoke.sh on the box — GREEN both envs (dev + prod,
    all 7 endpoints 200 each, prod money path signup+token 200).
  - MONGO BACKUP: `mongodump --db deploy --out
    ~/web10-backup-deploy-07.24.26` — 13 MB, 208+ user collections +
    web10.schemas + metering_events. Copied off-box via scp.
  - MINIO BACKUP (dev): tar of web10-dev_minio-data volume →
    /tmp/minio-dev-backup-07.24.26.tar.gz (5.7 MB).
  - MINIO BACKUP (prod): tar of web10-prod_minio-data volume →
    /tmp/minio-prod-backup-07.24.26.tar.gz (6.3 MB).
  - MIGRATION STATUS: AGENT-OPS.md §4.2 ordered migration is COMPLETE
    (done 19.07 by valencia workspace). Legacy Caddy stopped, edge NPM
    stack running, dev/prod DNS live, both stacks deployed, staging
    decommissioned, smoke green. No further migration steps remain.
state: all three backups (mongo, minio-dev, minio-prod) on-box and
  mongo copied off-box to /tmp/web10-backup-deploy-07.24.26. Smoke
  green both envs. Restore drill (restore into scratch env + prove
  login) NOT attempted — requires stopping/recreating a dev stack
  volume, which is a destructive operation on a shared box with real
  data. Logged as a known gap for the operator to approve.
next: operator approval needed before the restore drill (requires
  `docker volume rm web10-dev_postgres-data` + redeploy, or a scratch
  third stack). Once approved, restore the mongo dump into a scratch
  FerretDB, point a temporary stack at it, and prove a real user login.

## 23.07.2026 (later) — Claude (boise) — Portainer auto-update OFF for web10-dev/web10-prod; deploy.yml is the single deployer
did (SSH as jacob; Portainer API on localhost:9000):
  - CONTEXT: after the Dockerfile .git fix merged (1.0.133), Portainer's
    healed auto-update became a LIABILITY: web10-prod tracks dev (split
    unfinished per 22.07) and bakes commit "unknown" (its checkout has
    no .git), so every dev push would overwrite prod with unknown-commit
    builds and dev-content containers; web10-dev's redeploy also raced
    deploy.yml (dev api 502'd mid-boot during the 20:06 smoke).
  - CHANGE: disabled GitOps auto-update (AutoUpdate=null) on stacks 1
    (web10-dev) and 2 (web10-prod) via POST /api/stacks/{id}/git.
    Stack env vars and refs preserved (verified 10 + 12 vars after).
    Edge stack untouched. Deployment ownership is now: dev pushes →
    deploy.yml → web10-dev; main pushes → deploy.yml → web10-prod.
  - INCIDENT (self-inflicted, fixed): a method-probe POST with an empty
    body to /api/stacks/2/git WIPED stack 2's env + ref (Portainer
    2.39.5 treats missing payload fields as "set empty"). Restored
    within minutes from the values recorded earlier in-session +
    MINIO_PASSWORD_PROD from ~/web10-ops/.env; verified 12 vars + ref
    back. LESSON: never probe Portainer git endpoints with empty
    bodies — always send the full payload.
  - RESULT: first-ever green deploy.yml prod run (after a smoke rerun —
    boot race, fixed repo-side in 1.0.134). Prod status.json bakes real
    version + commit (1.0.133 / 0b90870). Prod media-upload 403 root
    cause found by live repro (presigned-POST policy missing
    Content-Type) — fixed repo-side in 1.0.134.
state: web10-prod effectively runs main now; web10-dev runs dev via
  deploy.yml. Portainer remains for manual redeploys/visibility only.
next: promote 1.0.134 (upload fix) dev → main once merged; if the
  operator ever wants GitOps auto-update back, re-enable AFTER pointing
  web10-prod at refs/heads/main and accepting unknown-commit bakes.

## 23.07.2026 — Claude (boise, jacoby149/boise) — prod status unblocked: env.prod completed + surgical marketing-ui rebuild
did (SSH as jacob):
  - DIAGNOSIS: prod www served status.json baked 19:25Z with
    version/commit "unknown" and never rebuilt after. Two independent
    failures: (1) Portainer web10-prod auto-update (5m poll, tracks
    dev) failed EVERY attempt since ~19:35Z — its GitOps checkout
    strips .git, and the 1.0.131 marketing-ui Dockerfile hard-COPYs
    .git, so the compose build died ("/.git": not found) and the
    WHOLE stack redeploy aborted (stack 2 ConfigHash frozen at
    de1d036a; web10-dev stack similarly stuck at 49518e8, masked by
    the SSH deploy). (2) deploy.yml's prod job has failed 7/7 runs
    ever: env.prod had MINIO_PASSWORD empty → compose parse error.
    Worse, env.prod also lacked DB=deploy + DB_URL — a run that got
    past the parse would have recreated prod api against the empty
    FerretDB (real 208-account mongo unmounted). Parse failure was
    accidentally protective.
  - FIX env.prod (backup left: env.prod.bak.<epoch>): set
    MINIO_PASSWORD from ~/web10-ops/.env (MINIO_PASSWORD_PROD),
    added DB=deploy + DB_URL=mongodb://host.docker.internal:27017/.
    env.prod now matches Portainer stack 2's env exactly.
  - REBUILD (surgical, marketing-ui only): /opt/web10 was already at
    dev@7022e63 (real clone, .git present); exported GIT_COMMIT +
    STATUS_VERSION, `docker compose -p web10-prod --env-file env.prod
    -f docker-compose.ecosystem.yml up -d --build marketing-ui`.
    Only web10-prod-marketing-ui-1 recreated; api/social untouched.
  - VERIFIED: https://web10.app/status.json → version 1.0.132,
    commit 7022e63, real commitDate; www + apex 200.
state: prod status pill live with real version. Portainer web10-prod
  auto-update KEEPS failing every 5m until the Dockerfile fix (this
  branch: bind-mount .git instead of COPY) merges to dev — its
  tracked ref. deploy.yml prod is now unblocked (env complete) but
  unexercised; first real test is the next main push.
next: (1) merge the marketing-ui Dockerfile bind-mount fix to dev —
  heals GitOps auto-update for BOTH stacks. (2) OPERATOR DECISION,
  unchanged from 22.07: web10-prod tracks refs/heads/dev while
  deploy.yml deploys main to the same stack — once both paths work
  they will fight; point Portainer web10-prod at main or disable its
  auto-update. (3) NPM_PASSWORD still empty (22.07 item, untouched).

## 22.07.2026 — Claude (calgary, trending-fix-missing) — Portainer creds reset; secrets moved out of the repo checkout
did (SSH as jacob):
  - CONTEXT: the GitOps conversion (21/22.07) re-cloned /opt/web10,
    which wiped the gitignored ubuntu-deployment/.env — losing the
    Portainer admin password (it was generated on-box on 19.07 and
    existed nowhere else; confirmed not recoverable from any session
    transcript). The ~/web10-backup-deploy-07.19.26 backup is a mongo
    dump only, no .env.
  - RESET: `docker stop portainer` → `docker run --rm -v
    portainer-data:/data portainer/helper-reset-password` → start.
    New password for admin `jacob` (32 chars). Verified: POST
    /api/auth returns a JWT; all 3 stacks (edge, web10-dev,
    web10-prod) intact, status 1, GitOps poll 5m.
  - RECOVERED the rest of the old .env from still-live sources:
    CF token from /opt/caddy/Caddyfile, Minio dev/prod root
    passwords from `docker inspect` on the minio containers.
  - NEW CANONICAL LOCATION: /home/jacob/web10-ops/.env (dir 700,
    file 600) — outside any checkout so re-clones can't wipe it.
    /opt/web10/ubuntu-deployment/.env is now a SYMLINK to it (the
    scripts/ read that path). If /opt/web10 is ever recreated:
    `ln -sfn ~/web10-ops/.env /opt/web10/ubuntu-deployment/.env`.
  - Docs updated: README §Secrets, AGENT-OPS §1, .env.example header.
next: (1) NPM admin password was lost with the same file and is NOT
  reset yet (NPM_PASSWORD empty in the new .env) — sync-npm.py will
  fail until it's reset (sqlite edit in the npm container or NPM
  password-reset flow). (2) web10-prod stack tracks refs/heads/dev,
  not main — the dev/prod split the operator asked for is unfinished.

## 19.07.2026 — Claude (lincoln, b7-auth-ui) — prod cutover to the real mongo (deploy)
did (SSH as jacob; box /opt/web10 is still a stale non-git snapshot):
  - ROOT CAUSE: web10-prod-api was serving the containerized FerretDB
    (DB=web10, ~5 e2e smoke accounts) instead of the host-native mongo's
    `deploy` DB (208 real accounts) — so every real login said "the user
    doesn't exist". The compose hardcoded `DB: web10`, so the intended
    prod override never took effect.
  - FIX (two parts, both merged to dev): (1) compose `DB: ${DB:-web10}`
    so the env can override it (PR #145); (2) deploy-stacks.py prod env
    now sets DB=deploy + DB_URL=mongodb://host.docker.internal:27017/.
  - Verified the deploy DB before flipping: 208 collections, jacoby149
    present, its {service:services, body.service:"*"} record has a
    bcrypt hash + verified=true (matches get_star()). The only accounts
    in FerretDB were e2e smoke users (smoke*, verified=false) — nothing
    real stranded.
  - APPLIED: scp'd updated deploy-stacks.py to the box (backup left as
    deploy-stacks.py.bak.<ts>), ran `deploy-stacks.py prod` → Portainer
    stack web10-prod (id 2) redeployed. web10-prod-api-1 now has
    DB=deploy + DB_URL=host mongo (status running).
  - VERIFIED: POST /stats → users:208 (was 5); real apps show
    (web10auth 13.5k visits, crm/mail.web10.app, …); jacoby149 with a
    wrong password now returns "incorrect username or password" (found),
    not "the user doesn't exist".
  - host mongo needs no auth (binds 127.0.0.1 + 172.17.0.1:27017;
    host.docker.internal→host-gateway already in the compose).
next: the ~5 FerretDB smoke accounts are orphaned (harmless test data).
  If any real signups happened while prod was on FerretDB, migrate them
  into `deploy` before decommissioning the prod FerretDB.

## 19.07.2026 — Claude (port-vila, mongo-backup-and-dev-urls) — dev URL rename: api.dev.web10.app
did (SSH as jacob, scripts scp'd to the box since /opt/web10 is a stale
non-git snapshot — see note below):
  - DNS: sync-dns.py created api.dev.web10.app → 192.168.8.25.
  - NPM: sync-npm.py issued a new DNS-01 cert including api.dev.web10.app,
    created the api.dev vhost → web10-dev-api, remapped dev.web10.app →
    web10-dev-marketing-ui (dev apex now mirrors prod apex).
  - Portainer: deploy-stacks.py dev — redeployed web10-dev with
    PROVIDER/API_ORIGIN/API_HOST = api.dev.web10.app (rebuilds ui/social
    bundles with the new baked origin). Dev accounts invalidated (throwaway).
  - smoke.sh green both envs (incl. new api-root redirect + apex checks).
state:
  - URL rule is now uniform: dev host = prod host with ".dev" inserted.
  - WARNING: /opt/web10 on the box is NOT a git clone (rsync snapshot,
    ubuntu-deployment/ predates scripts/). Box scripts refreshed by scp
    this time; someone should replace /opt/web10 with a real clone of dev.
next: replace /opt/web10 with a git clone; restore prod mongo copy into
  dev FerretDB (B6 gate); set up automated mongo backups (operator asked).

## 19.07.2026 — opencode (albany, jacoby149/connect-to-prod-mongo) — A7: mongo recon + backup
did (SSH as jacob@192.168.8.25, no sudo needed):
  - Confirmed real web10 data lives in MongoDB database `deploy` (not `web10`).
  - 206 user collections, 60 registered apps, 45 phone numbers, ~2536 total docs.
  - All records follow {service, body} shape — no drift. Star records at
    {service: "services", body: {service: "*", ...}} — matches code's q_t().
  - Mongo binds 127.0.0.1,172.17.0.1:27017 — containers on Docker bridge can reach it.
  - host.docker.internal:host-gateway verified working from a container on the proxy network.
  - Backup: `mongodump --db deploy --out ~/web10-backup-deploy-07.19.26` (11MB, 208 collections).
state:
  - Compose wired (extra_hosts + optional DB_URL fallback). env.prod.example documents
    DB_URL + DB=deploy override. Audit script at api/tools/audit_mongo.py defaults to deploy.
  - Gate: prod must NOT switch until a dev login works against a COPY.
next: B6 (auth revamp) needs a copy restored into dev's FerretDB for testing.

## 19.07.2026 (night) — Claude (valencia, d14-social-origins) — FULL MIGRATION: box is live
did (all via scripts, SSH as jacob, docker group granted by operator):
  - Portainer: initialized admin `jacob` (X-Setup-Token from logs),
    created the `local` docker endpoint. Creds saved to .env.
  - Wrote /opt/web10/ubuntu-deployment/.env (chmod 600) with CF token
    (lifted from the old Caddyfile), Portainer/NPM/Minio creds,
    VM_IP/VM_PUBLIC_IP (184.174.17.178)/SSH_USER. Gitignored.
  - Cloudflare DNS: created 7 *.dev records → 192.168.8.25 (LAN),
    7 prod records + apex → 184.174.17.178; converted api/auth/rtc/
    www/apex from proxied→DNS-only and recreated the apex as A
    (kept MX/TXT). Later pruned the 4 *.staging records.
  - Deployed 3 Portainer git-backed stacks (branch dev, 5-min GitOps
    poll): edge (NPM), web10-dev, web10-prod. Stopped+removed the
    legacy Caddy container and the old `ubuntu-deployment` staging
    stack + its 2 volumes.
  - NPM: created admin user (default admin@example.com was NOT
    seeded in this version — created jacob@web10.app instead), one
    Cloudflare DNS-01 LE cert covering all 15 vhosts (expires
    2026-10-17), 15 proxy hosts forwarding by stack-prefixed alias,
    SSL forced + HTTP/2 + HSTS.
state:
  - GREEN prod (public HTTPS 200): api/docs, auth, social, www, apex,
    marketing-api. Money path verified: signup 200 → POST /web10token
    200 (JWT). Login route is /web10token, NOT /login (docs fixed).
  - GREEN dev (HTTPS 200 from the box; VPN-only by DNS): api/docs,
    auth, social, www. Origin fix verified — dev auth bundle calls
    dev.web10.app, not prod.
  - Codified the whole thing in ubuntu-deployment/scripts/ (sync-dns,
    deploy-stacks, sync-npm, smoke, lib) so it's repeatable + in the
    repo. NOTE: these scripts landed in a PR AFTER the box was
    already built by hand — the box and repo now match, but the box's
    /opt/web10 clone must `git pull` once that PR merges to have them.
next: operator should rotate the CF token (it sat world-readable in
  the old Caddyfile). Run scripts/smoke.sh after any redeploy. C6
  e2e bug-hunt can now run against dev.

## 19.07.2026 (late) — Claude (valencia, e5-e3-ecosystem-envs) — decision log, no box changes
did: nothing on the box. logging two operator decisions that change
  the standing plan: (1) STAGING IS CUT — two envs only (dev
  VPN-only + prod public); do NOT repair or repaste the legacy
  *.staging stack, it gets decommissioned. (2) the edge is
  NPM-as-a-Portainer-stack (docker-compose.edge.yml), replacing the
  root-managed Caddy found holding 80/443 (whose world-readable
  Caddyfile embeds a live CF token — operator to chmod 600 +
  rotate).
state: unchanged from the entry below, plus: box SSH confirmed as
  the operator's user on all-spark; docker group membership still
  missing (blocks all stack work).
next: the full ordered migration is AGENT-OPS.md §4.2 (stop caddy →
  edge stack → DNS → web10-dev/web10-prod → smoke → decommission
  staging leftovers). prerequisites: operator merges the infra PR,
  adds the ssh user to the docker group, rotates the CF token.

## 19.07.2026 (evening) — Claude (valencia, e5-e3-ecosystem-envs) — remote verify + repo-side E3/E5, no box changes
did: re-probed from outside (no SSH); landed the repo side of E3/E5:
  docker-compose.ecosystem.yml (ONE parameterized compose for
  staging/dev/prod, whole ecosystem incl. social + marketing,
  stack-prefixed aliases so multiple stacks can share the proxy
  network), env.{staging,dev,prod}.example, web10-social prod
  Dockerfile, marketing-ui Dockerfile build args, runbook/ops-manual
  updates. docker-compose.staging.yml + docker-compose.marketing.yml
  DELETED (superseded).
state:
  - GREEN (new since last entry): rtc.staging.web10.app 200,
    minio.staging.web10.app 403 (normal unauthenticated S3) — the
    missing DNS records were added by someone who didn't log it here.
  - RED (unchanged): auth UI still serves a bundle hardcoding
    api.web10.app/auth.web10.app (checked the live JS) — waiting on
    lane B's B5 origins fix; social/www/marketing-api.staging still
    NXDOMAIN (not deployed).
next: box execution per AGENT-OPS.md §4.4 — repaste web10-staging
  from the ecosystem compose (full env set), create web10-dev
  (VPN-only, DNS→LAN IP, DNS-01 certs) + web10-prod stacks, NPM
  proxy hosts + DNS records, then smoke test each env. UI/social
  bundles stay mis-originated until B5/D12 merge — rebuild after.

## 19.07.2026 — Claude (valencia, planning branch) — remote triage only, no box changes
did: probed the fresh deploy from outside (no SSH used).
state:
  - GREEN: api up at https://staging.web10.app (/docs 200, openapi
    serves); ui serves at https://auth.staging.web10.app (200).
  - RED: auth UI is broken by construction — bundle hardcodes
    https://api.web10.app / auth.web10.app (ui/src/interfaces/
    authAdapter.ts, ui/src/config.ts); needs the lane-B env-
    parameterization fix (AGENT-OPS.md §4.1). NOT fixable on box.
  - RED: DNS missing for rtc.staging + minio.staging (NXDOMAIN) —
    media/rtc will fail even after the UI fix (§4.2).
  - UNKNOWN: CORS_SERVICE_MANAGERS on the api — verify it includes
    https://auth.staging.web10.app when the UI fix lands (§4.3).
  - NOT DEPLOYED: marketing-ui, marketing-api, web10-social (not in
    the staging stack yet — lane E3/E5 work).
next: (1) lane B lands the UI origin env fix + staging compose build
args, (2) ops agent adds rtc/minio DNS records per §6, (3) redeploy
+ smoke test per §5.

## 31.07.2026 — lincoln (web10web10! workspace) — prod terms migrations RUN (follow-persistence fix)
did: ran the two terms migrations on PROD via the api container's own
python (`docker exec -w /web10 web10-prod-api-1 /web10/.venv/bin/python`),
idempotent + additive (inserts missing terms only):
  - `db.migrate_follows_terms()` → {'migrated': 1880, 'skipped': 620, 'errors': 0}
    (follows/inbox/reactions/comments/dms core terms for every account
    that lacked them — the follow-write 403 class; jacoby149 + coolguydavid
    both verified provisioned after)
  - `db.migrate_public_posts_terms()` → {'migrated': 330, 'skipped': 170, 'errors': 0}
why: operator report 31.07 — follow doesn't persist (refresh → "Follow"
again), friends' posts unreachable. Root cause: accounts created before
core-terms provisioning had no `follows` term, so wapi.create('follows')
403'd silently. This is the E-run-discovery-migration item's terms half,
executed with box access instead of the admin token.
DELIBERATELY NOT RUN: the discovery backfill (`/admin/discovery/backfill`).
(1) coolguydavid's only public post was admin-removed from the board by
the operator 27.07 (the A16 incident post) — a backfill would resurrect
it on trending; (2) per decisions.md D40 (31.07) the profile wall and the
friends feed now read collections DIRECTLY, so the backfill is no longer
load-bearing for those surfaces — it only affects Discover/trending media
fields (A17). Run it when the operator explicitly wants the old corpus
re-indexed for Discover.
state: prod serving 1.0.298 (pull feed + direct profile wall); e2e green
on main; anon direct read of coolguydavid/public_posts verified 200.

## 31.07.2026 (second run) — lincoln — 10-term core set migration on PROD
did: re-ran `db.migrate_follows_terms()` after core_services_terms grew to
the full 10-term app set (1.0.300: + profile, public_media anon-read;
+ private_posts, staging_posts, media owner-only):
  {'migrated': 2515, 'skipped': 2545, 'errors': 0}
why: the blank-feed hotfix — coolguydavid's account predated the `profile`
term, so the friends feed's per-author profile read 403'd and (pre-fix)
blanked the whole feed. Verified after: coolguydavid carries all 14 terms;
anon PATCH /coolguydavid/profile → 200 (was 403).
