# Portable Protected Media Delivery

Status: locally implemented and tested; production disabled by default. An isolated
Cloudflare Worker has fresh synthetic MinIO cache, Chromium HLS/range and deployed
test-key rotation evidence, not production approval. Its intended read-only storage
credential failed list/write denial probes after status-only updates removed its
embedded policy. Atomic status+policy updates repair that path; the restored account
passes GET/list/write and repeated cache/playback checks. See the
[connected record](../../media-delivery/CONNECTED-ACCEPTANCE.md); real-node
authorization/renewal, logging/limits and independent review remain open.

Further isolated acceptance now exercises actual ClickHouse-backed HLS permission
checks and loopback HTTP manifests, owner/member and carrier principal-class
revocation, real edge expiry and explicit fresh-token renewal, plus Chromium
1280px/375px playback. This replaces the earlier synthetic access stub for that
bounded HLS path, not initial login/document certification, the full production
node or seamless long-video player renewal. Provider subscription/log-export audit
is permission-blocked; details and release gates remain in the connected record.
This supersedes the origin-check-only shared
cache proposal in `research/cloudflare-plan.md`.

## Contract

The node authorizes document/group reads using existing gates, then issues a
short-lived, media-only RS256 JWT using a separate RSA key. This is not an auth
key migration. Claims: `iss`, `aud`, `iat`, `exp`, `v: 1`, `bucket`, `key`, and
`method: GET`; header `typ: JWT`, `alg: RS256`, `kid` identifies a pinned public
key. RSA keys must be at least 2048 bits. Lifetime is at most 600 seconds.

Delivery URL: `https://<delivery-host>/media/<base64url-utf8-object-key>?cap=<JWT>`.
The key encoding is unpadded canonical base64url, avoiding URL path normalization
of opaque storage keys. The delivery host has no path prefix. The issuer and
audience are operator-configured, provider-neutral strings. Bucket and exact key
must match the configured storage and decoded request. Only GET is authorized.

Every request, including warm-cache requests, must verify signature, fixed
algorithm, trusted key ID, issuer, audience, claim types, lifetime, expiry,
method, and exact key BEFORE cache access. Invalid requests fail closed. No
token-selected key URLs or unsigned fallback. Public verification keys are
configured at the adapter; rotation retains old public keys until outstanding
capabilities expire. Tokens and signed URLs must not enter diagnostic logs.

## Provider Boundary

Provider-independent JavaScript verifies capabilities and owns the authorize ->
cache -> private-origin sequence. Cloudflare-specific code implements cache and
private S3-compatible origin access. Changing CDN requires replacing that adapter,
not node permission logic or the capability format. MinIO, S3 and R2 remain
storage choices. DNS merely routes the delivery host.

The edge caches successful full-object responses by bucket/key, independent of
reader tokens. Browser responses are private/no-store; internal edge cache TTL
does not grant access. Range requests authorize first and may bypass caching;
errors, partial responses and redirects must never populate the shared full-object
cache. Origin endpoints and credentials are trusted configuration, never supplied
by a capability. Storage must deny anonymous reads; no alternate public host may
bypass the gate. Read-only origin credentials stay at the edge.

## Integration and Bounds

Direct GET signing switches at existing owner-authorized sinks. Uploads are
unchanged. HLS manifests stay on the node with their existing live permission and
uploader provenance checks. Only segment delivery switches; each segment gets an
exact-key capability expiring no later than its parent stream capability.
Direct capabilities default to 60 seconds (`MEDIA_DELIVERY_TTL`, range 1..600).
HLS segment expiry is `min(parent_exp, now + 600)` independently of that direct
TTL, preserving the existing stream window rather than expiring a VOD playlist's
later segments at 60 seconds. Playback beyond the existing stream window still
requires renewal; this change does not implement player renewal.

Credentialless wildcard CORS permits cross-origin GET playback; cookies are not
forwarded or enabled. OPTIONS/preflight is not supported. Single-range GETs use
the origin after authorization. Full objects with a valid Content-Length up to
32 MiB may populate the edge cache in the background through the request's
`waitUntil`; larger or unknown-length objects stream without cloning/caching.
Cache-write failure does not fail otherwise successful delivery.

Capabilities are shareable bearer credentials until expiry. Ordinary permission
revocation takes effect at issuance/renewal, not on every segment request. Urgent
takedown/edge revocation and origin/cache purge remain separate work; no immediate
global revocation claim. CDN offloading does not repair existing stored-reference
or attached-ad authority debt and does not optimize database queries.

## Gates

Local tests must cover public-key-only verification, disabled-mode preservation,
wrong signature/issuer/audience/key/bucket/method, malformed claims, expiry,
unknown kid, opaque keys, and expired/missing/tampered capabilities against a
warm cache without cache/origin access. HLS capability expiry cannot exceed its
parent. Actual Cloudflare cache behavior, private-origin denial, browser playback,
rotation, provider limits/cost and independent security review gate production
enablement. No cloud resources are provisioned by this implementation task.

## Configuration

Node settings: `MEDIA_DELIVERY_ENABLED=false`, `MEDIA_DELIVERY_BASE` (HTTPS host,
no slash/path), `MEDIA_DELIVERY_ISSUER`, `MEDIA_DELIVERY_AUDIENCE`,
`MEDIA_DELIVERY_KID`, `MEDIA_DELIVERY_PRIVATE_KEY` (PEM in secret configuration),
`MEDIA_DELIVERY_TTL` and existing `S3_BUCKET`. Invalid enabled configuration
refuses startup. `/v3/media/jwks` returns the current media public key for operator
provisioning; it returns an empty key set while disabled. Stage public keys out
of band before enabling issuance; edge key rotation retains old+new keys.

Cloudflare settings and secret provisioning are in
[`media-delivery/README.md`](../../media-delivery/README.md) and its disabled
Wrangler example. API defaults preserve existing SigV4 URLs, uploads and HLS
routes. No DNS, production storage or deployed Worker is changed automatically.
