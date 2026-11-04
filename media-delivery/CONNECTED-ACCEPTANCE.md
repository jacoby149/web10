# Isolated MinIO / Cloudflare acceptance — 03.11.2026

Historical isolated results below are unchanged. Subsequent operator-directed
production activation and its remaining gates are recorded separately in
[Production acceptance — 04.11.2026](PRODUCTION-ACCEPTANCE.md).

The goal is repeated protected delivery without repeatedly reading MinIO. Fresh
cache, browser and rotation checks now pass in the isolated setup. The demonstrated
storage-permission failure has been repaired and rechecked; production still awaits
authorization/renewal, logging/limits and independent-review gates.

## Initial CPU guardrail under accepted paid-plan risk (22:43–22:45 UTC)

After explicitly accepting Workers Paid minimum/usage-overage risk without a verified
monthly cap, the operator authorized continuation. Applied the persisted 50 ms
per-invocation CPU setting only to the existing isolated Worker; the settings API
confirms `cpu_ms: 50` and logpush false. No billing activation, alert configuration,
production node/DNS change or release-gate waiver is claimed.

Both bounded acceptance runs pass again under that deployment: 19-request IAD
cache/expired-denial control and 29 real-ClickHouse HTTP probes with desktop/375px
live manifests/Cloudflare segments. Each browser completes four seconds/96 frames;
local API/container teardown is verified. Fresh immutable receipts remain under
`.context/cdn-live/receipts/`. An aggregate-only CPU query returned an error rather
than usable measurements, so no actual CPU quantile or bill forecast is claimed.
See [provider readiness](PROVIDER-READINESS.md) for the distinction between this
per-request guardrail and the still-unbounded monthly request/usage exposure.

## Real-database HLS HTTP acceptance (22:15–22:25 UTC)

The new repository harness (`connected-node.mjs` / `connected-node.py`) replaces
the earlier permission stub with actual `hls.can_view_doc` and ClickHouse services,
and serves the actual master/variant endpoint functions over loopback HTTP. A new
local ClickHouse 24.8.14.39 container uses four production-layout tables plus the
current contract columns, randomized credentials, one CPU/2 GiB, temporary data/log
filesystems and no production database connection. The restricted existing test
MinIO bucket and Cloudflare Worker supply the playlist/segments without policy or
Worker changes. No document, membership or storage authorization is monkeypatched.

Final run: 29 named HTTP probes pass, plus desktop/375px Chromium playback through
the live API manifests and two real Cloudflare segments each. Both play four
seconds/96 decoded frames with no fatal error. Screenshots were inspected at
`.context/cdn-live/node-browser-{1280,375}.png`. The last receipt records actual API
shutdown and ownership-checked container deletion; an independent Docker listing
confirms no acceptance containers remain. A [redacted summary with source hashes](evidence/node-2026-11-03.json)
retains public evidence; full immutable receipts remain private.

| Boundary | Observed control |
|---|---|
| Owner and current direct member | Master/variant 200 |
| Outsider or missing stream token | 403 |
| Member removed through actual tombstone SQL | Existing-token master/variant 403; regrant restores 200 |
| Public carrier `anyone` role grant | Anonymous master/variant 200; revoke yields 403 |
| Carrier `authenticated` grant | Unauthenticated 403, authenticated 200; revoke yields 403 |
| Already-issued segment after membership removal | Still 200 until its capability deadline, as designed |
| Eight-second parent deadline | Parent master/variant and earlier edge segment capability all 403 after real expiry |
| Explicit fresh token while still authorized | New master/variant and segment 200 |
| Fresh token for revoked reader | Manifest 403; no bypass of the live permission recheck |

The fixture controller mints real test stream tokens with an isolated signing key;
it is not login, document CRUD or app-contract certification. Four-second playback
and compressed parent expiry are not seamless long-video renewal in the full
social player. Earlier setup failure while adapting FastAPI's deferred router
objects is retained; explicitly registering only the two actual endpoint functions
corrected it without changing their permission logic. Repeated clean runs pass.

Provider readiness is a separate gate: a read-only audit confirms script logpush
off but returns 403 for subscriptions and account/zone export jobs. It cannot
certify billing or log-export absence. Current paid-service terms, request/CPU
bounds and outer-cache controls are recorded in [PROVIDER-READINESS.md](PROVIDER-READINESS.md).

## Scope and current state

- Worker: `web10-media-smoke-charlotte`, on workers.dev, using the existing
  `media-delivery/cloudflare.mjs` adapter and production MinIO's S3 endpoint.
- Storage: one randomly named synthetic bucket, anonymous access denied, and a
  separate two-day service account intended to be GetObject-only. **That restriction
  failed live list/write probes and was quarantined; the exact account's embedded
  restriction is now repaired and verified.**
  Seven known synthetic objects remain: three original fixtures, one HLS playlist,
  two HLS segments and one permission-probe object.
  Exact scope, signing key and credentials remain private in `.context/cdn-live/`.
- Real API `media_delivery.get_url` issues test capabilities in a local child
  process with child-only settings overrides. No production node rollout, DNS
  changes, R2 activation or production capability issuance was performed.
- The Worker remains deployed with its original signing keys. Its storage account
  is enabled only after embedded-policy inspection and independent GET/list/write
  controls passed; local quarantine is lifted. No cleanup was performed. Status
  changes must use the atomic policy-preserving helper below, never the installed
  CLI's status-only enable/disable commands.

## Credential repair and fresh acceptance (22:00–22:07 UTC)

Installed versions: MinIO `RELEASE.2025-09-07T16-13-09Z`, commit
`07c3a429bfed433e49018cb0f78a52145d4bedeb`; mc
`RELEASE.2025-08-13T08-35-41Z`, commit `7394ce0dd2a80935aded936b09fa12cbb3cb8096`.
The failure was not evidence that initial creation ignored its policy. The cache
test's status toggles were unsafe on this version:

- mc's [enable command](https://github.com/minio/mc/blob/7394ce0dd2a80935aded936b09fa12cbb3cb8096/cmd/admin-user-svcacct-enable.go)
  submits `NewStatus` without `NewPolicy`.
- The [server update handler](https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/cmd/admin-handlers-users.go#L860-L879)
  passes a nil session policy when omitted.
- [IAM store update](https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/cmd/iam-store.go#L2656-L2683)
  removes the embedded policy on that nil input and switches to inherited authority.
  The test account is root-derived, so inheritance is not an acceptable fallback.

Read-only inspection confirmed disabled status with an empty policy. Earlier
inspection failures came from calling `len()` on a null `Statement`; the diagnostic
now handles that shape. One post-repair check falsely rejected mc's omitted false
`impliedPolicy` field (`omitempty` in its exact-version source); it safely disabled
the account, then passed after correcting that parser. Failed receipts are retained.

`minio_account.py` uses an injected official MinIO Admin SDK client to submit
**status and exact-bucket GetObject policy together**, check exact account ownership,
then re-read and verify embedded policy/status. On ambiguous update or failed
post-check it requests a restricted disable. The private runner uses pinned official
`minio==7.2.18` in short-lived containers from the already-running API image,
sharing the MinIO network namespace; no API-container dependencies or node
configuration were changed. Root credentials stay remote, in memory/stdin, never
command arguments, source or receipts. This helper is intentionally restricted to
the synthetic bucket/name scheme, not a production provisioning command.

Repair first installed the policy while keeping the account off. Controlled enable
then demonstrated GET 200 with matching hash, ListObjectsV2 403 AccessDenied and
PutObject 403 AccessDenied; policy inspection confirmed `impliedPolicy: false`,
one exact GetObject statement and status on. Only then was quarantine lifted.
A new 19-request **ATL** cache disable/restore experiment passed, followed by renewed
list/write denials and policy inspection proving the restriction survived both
status changes. Synthetic HLS/image/range checks passed again at 1280px/375px,
with two segments/96 decoded frames/four seconds at each viewport.

Local verification: 42 edge/interoperability tests, including a Node wrapper
running six Python policy-update regressions. These reproduce omitted-policy
removal in an offline model of the source semantics and pin atomic updates,
disabled repair, ownership checks, policy rejection and failure containment.
The actual connected before/after probes are list/write 200 → AccessDenied 403.

## Fresh acceptance progress (21:50–21:55 UTC)

The repository's Node-only `acceptance.mjs` helper tracks warmed locations, matching
cached bytes and expired-token denials, plus independent cold/range origin-denial
controls. It never counts an unmatched location or a matched miss as proof. The
private harness uses a bounded single-socket keep-alive agent to improve affinity,
but still requires matching location evidence. A first fetch-pool attempt remained
inconclusive (EWR warmed, IAD checked); the subsequent 19-request run passed at IAD.
The account was restored after that experiment, before later quarantine.

Fresh immutable receipts, including failures, are retained under
`.context/cdn-live/receipts/` with exclusive creation and mode 0600:

| Check | Result and scope |
|---|---|
| Location-matched credential-disable cache control | IAD cached full object 200; cold/range 502; expired warm capability 403; restored range 206 |
| Chromium image/range, 1280px and 375px | Image decoded at 1×1; full/range body hashes matched; missing/expired capabilities 403 |
| Deployed signing-key rotation | Unknown new key 403; old/new overlap 200; old expires before retirement; new continues 200; original key set restored |
| Synthetic Chromium HLS, both sizes | Four-second video completed; 96 decoded frames, two CDN segment responses of 200, no fatal playback error |
| Actual API HLS handlers in local TestClient | Master/variant 200, real isolated MinIO playlist read, exact segment claims bounded by parent expiry; expired/missing sig and synthetic revoked authority 403 |
| Credential negative controls | **FAIL: ListObjectsV2 200 and PutObject 200**, rather than AccessDenied |

HLS used the actual API-generated master/rewritten variant and vendored hls.js,
served by a local fixture server; segments came from the Cloudflare Worker. The
document-access function was a synthetic stub, not actual ClickHouse membership.
This is not a connected production node, full social player, Safari/native mobile,
long-video renewal or real-user authorization test. A 375px Chromium viewport is
not a physical phone. Desktop/mobile screenshots were inspected at
`.context/cdn-live/browser-hls-{1280,375}.png`.

Rotation used two additional test keys while retaining the original smoke key, so
existing test capabilities were not prematurely revoked. The old rotation key's
only tokens had a 15-second lifetime; retirement followed their real expiry.

## Historical finding and containment (repaired above)

The actual Worker account successfully listed the isolated bucket and wrote only
`policy-probe.txt`, containing synthetic text. No production document/object reads,
existing-object writes or destructive permission tests were performed. Broader
authority is unknown; do not infer confinement from the intended policy.

Containment: disabled only that named service account, independently confirmed
signed origin denial, and quarantined its local state so ordinary enable/deploy/
verify commands refuse reuse. Root/shared passwords and existing bucket policies
are unchanged. Two guarded read-only account-inspection attempts initially failed;
live diagnosis stopped under the runbook. The subsequent operator-authorized
session established the status-update cause and verified the repair above.

## Recovered result from the interrupted session

Before making new requests, this session read the saved deployment and verification
JSON files. Deployment completed at 12:56:51 UTC; verification completed at
12:57:10 UTC, with 15 requests, `ok: true`, `cacheProof: true` and
`accountRestored: true`. All Worker verification responses reported IAD.

| Probe | Observed status |
|---|---|
| Anonymous direct MinIO read | 403 |
| Authorized full text, repeated text and image | 200, expected body hashes |
| Missing, expired, tampered or wrong-object capability | 403 |
| Direct internal cache path | 403 |
| Authorized byte range | 206, expected partial-body hash |
| Account disabled: cold object / range | 502 / 502 |
| Account disabled: warmed full text | 200, expected hash, same IAD location |
| Account disabled: expired capability for warmed text | 403 |
| Account restored: range | 206 |

That credential-disable control is evidence of cached delivery without successful
origin authorization, not merely a repeated 200 or a cache-status header. The
full-text hash was
`e8b7528e6d1fcc27721ac2b78a922a7e0335594090dccfdf8790462b8b6d596e`.

Provenance limit: the private harness overwrites its per-stage receipt on every
run. The fresh attempts below replaced the original verification JSON; the table
above transcribes the receipt read at session start, not a newly repeated pass.
Future runs must preserve immutable timestamped receipts, including failures.

## Fresh attempts and stop condition

The test account was explicitly enabled before verification. Two bounded attempts
then failed acceptance:

1. Full-object requests switched from EWR to IAD before the disable experiment;
   the harness rejected the comparison as inconclusive.
2. Full-object requests warmed EWR, while the disabled-account cache check landed
   at ATL and returned 502. Cold/range controls also returned 502 at ATL. The
   harness restored the test account successfully in `finally` before exiting.
   Earlier invalid-capability checks still returned 403, and authorized range/image
   reads returned 206/200 with matching hashes.

Stopped live retries under `ubuntu-deployment/AGENT-OPS.md`. These attempts do not
prove a cache regression: they did not compare the warmed and disabled-origin
responses at the same location. They also do not establish reliable cache hit
rates across locations. The current harness is too dependent on routing affinity.

## Local regression and next gates

The interrupted session left a one-line origin-fetch repair: retain Fetch
`cache: 'no-store'` without the competing Cloudflare `cf.cacheTtl: 0` override.
The new injected-fetch assertion rejects the HEAD version offline; all 36 current
edge/interoperability tests pass. This pins the option combination, not a separate
live replay of the original runtime exception.

All 43 local edge/interoperability tests pass, including the six Python regressions
run by a Node wrapper and the deployment-example guard. Still required: initial
authenticated document issuance and full-player long-playback renewal, provider
logging/audit and subscription confirmation, practical size/CPU/cost bounds and independent
security review. MEDIA-LIVE remains open; production issuance stays off. Urgent
revocation/purge is separate MEDIA-C work.
