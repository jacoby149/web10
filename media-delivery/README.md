# Protected Media Delivery

Disabled-by-default edge implementation of
[`media-delivery.md`](../knowledge-base/web10-v3/media-delivery.md).
The edge code needs no packages or framework and does not deploy itself. The
node-side issuer is integrated separately in `api/`, also disabled by default.
An isolated Worker has been deployed against synthetic MinIO fixtures; see the
[connected acceptance record](CONNECTED-ACCEPTANCE.md) for fresh cache/browser/HLS/
rotation evidence and the repaired storage-permission finding. The isolated storage
account is restored with a verified GetObject-only policy; production remains off.
The [provider-readiness record](PROVIDER-READINESS.md) covers current terms/prices,
unknown subscription status, incomplete account/zone logging audit and release gates.
The operator accepts paid usage-overage risk; a 50 ms per-invocation CPU guardrail
is persisted and verified on the isolated Worker. It is not a monthly spending cap
or evidence that a paid subscription/alerts have been activated.
Run with Node 22+ and `uv` available for the cross-runtime check:

```sh
node --test media-delivery/delivery.test.mjs
node --test api/tests/media_delivery_interop.test.mjs
```

## Boundary

`acceptance.mjs` is Node-only test tooling, never deployed: location-matched cache
evidence classification and private, uniquely named per-run receipt creation.
Its regressions run in `delivery.test.mjs`; inconclusive routing is not a cache
proof, and a matched hit requires expired-token denial plus origin controls.

`core.mjs` uses standard Fetch and WebCrypto APIs. It imports pinned public RSA
keys once, verifies every GET before any cache lookup, then orchestrates cache
and origin adapters. Replace the adapters to change CDN; keep the capability
format and authorization unchanged. Cache adapters implement `get(scope)` and
`put(scope, response)` where scope is `{bucket, key}`. Origin adapters receive
`{bucket, key, range}` and return a Response. Never expose cache adapters as an
unauthenticated route. The optional core event callback receives fixed event
names only, never URLs, tokens, object keys, payloads or exception text.

Call the core handler as `delivery(request, schedule)`, where `schedule(promise)`
extends that request's lifetime. Cloudflare passes `ctx.waitUntil` per request,
not through cached worker configuration. Cache writes run in the background;
delivery does not wait for body consumption or cache completion. Without a
scheduler, cache writes are skipped. Only canonical nonnegative integer
Content-Length values at most 32 MiB are eligible; unknown, malformed and larger
objects stream directly without cloning. This bound relies on trusted storage
reporting accurate Content-Length. Cache write failures never replace successful
delivery and emit only `cache-write-failed` (a fixed warning in Cloudflare).

`cloudflare.mjs` implements Cache API storage and path-style S3 SigV4 GETs against
one operator-configured HTTPS endpoint. It supports private MinIO, S3 and R2 with
their correct endpoint/region. Origin redirects are returned manually and denied
by the core. Only full 200 responses without Content-Range populate cache;
single byte ranges bypass cache after authorization. Multiple/malformed ranges
are rejected. Browser responses, including errors, are no-store. Cookies and
origin cache-policy headers are not forwarded. No conditional request headers,
client authorization, cookies or arbitrary origin headers are forwarded.

Opaque UTF-8 keys travel in canonical unpadded base64url. Origin paths preserve
slashes and encode reserved characters. Keys containing literal `.` or `..`
path segments fail closed because Fetch URL normalization cannot preserve them.
The adapter requires an endpoint without a path prefix; use a bucket-accessible
path-style endpoint, not a public bucket host. All responses (hits, misses,
ranges and errors) send `Access-Control-Allow-Origin: *` and expose Content-Type,
Content-Length, Content-Range, Accept-Ranges, ETag and Last-Modified. Credentials
are never allowed: browser fetch clients must omit credentials and use only the
URL bearer capability, not Authorization headers. Simple GETs with a single
CORS-safelisted Range (`bytes=N-M` or `bytes=N-`) need no preflight. OPTIONS and
non-simple/preflighted requests are unsupported (OPTIONS denies without cache or
origin I/O); suffix ranges may require preflight in browsers. HTML or other active
uploads should be delivered on an isolated, cookieless media domain.

## Provisioning

MinIO operators: on the tested 2025-09-07 server, status-only service-account
updates remove embedded policy. Do not use `mc admin user svcacct enable/disable`
on a root-derived restricted account. Submit status and restriction policy together
through the official admin SDK and inspect the result. `minio_account.py` provides
that guarded operation for the isolated smoke bucket only; it is not a production
provisioner. Its six offline regressions run automatically in `delivery.test.mjs`.

1. Keep both node rollout and `MEDIA_DELIVERY_ENABLED` disabled until connected
   gates pass. This directory does not change existing node delivery, uploads,
   manifests, capability issuance or HLS parent expiry enforcement.
2. Provision a separate media-signing RSA key at the node (2048 bits minimum).
   Configure exact issuer, audience and bucket on both sides. Export only public
   JWKs, with unique nonempty kids, into static `CAP_JWKS`. Do not configure a
   per-request JWKS URL. The edge never fetches keys from the node or token URLs.
3. Copy/adapt `wrangler.example.toml` through your deployment process. Provision
   edge-only `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and optional
   `S3_SESSION_TOKEN` using the secret store, never source control. Grant only
   GetObject for the chosen bucket/prefix, no writes, deletes or listing. Rotate
   temporary credentials before expiration. The example contains no credentials
   and no active route.
4. Deny anonymous reads at storage. Remove alternate public bucket, proxy and
   CDN hosts that bypass the gate. Ensure the configured origin resolves only to
   trusted storage, never a user-selected host. Validate private-origin denial
   from outside the edge and test SigV4 against your actual storage provider.
5. Configure a dedicated custom media host with no path prefix. Do not attach a
   cache rule that serves incoming `/media/*` requests before Worker execution.
   The internal cache namespace is never directly served. Use one origin mapping
   per delivery host; purge the namespace when remapping a bucket to new storage.
6. Disable/redact URL query and path capture in Cloudflare request logs, tracing,
   analytics, origin access logs and error collectors. Capabilities are bearer
   secrets; object keys may be private data. Application code logs neither.
7. For key rotation deploy old+new public keys before issuing the new kid, then
   retain the old key until all its capabilities expire (up to 600 seconds).
   Keep clocks synchronized. No future-iat or expiry grace is allowed.

## Connected real-database harness

`connected-node.mjs` self-boots one local ClickHouse container and a loopback-only
API using the actual HLS endpoint functions and unmodified database permission
checks. It reads the already-provisioned **private** acceptance directory; it does
not provision a Cloudflare account, storage, billing, DNS or production node.
It requires Docker with ClickHouse 24.8 already cached, Node 22+, API `uv`
dependencies, Playwright with Chromium, and the verified synthetic bucket/Worker.

```sh
# PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs when it is not
# resolvable from this directory. CLICKHOUSE_ACCEPTANCE_IMAGE may select a cached
# image; its immutable image ID and actual engine version are recorded.
node media-delivery/connected-node.mjs .context/cdn-live
```

The private directory must contain `state.json`, `secrets.json`, `private.pem` and
the existing playback fixture scope. It must stay outside source control; do not
paste its contents into logs or chat. The runner refuses unverified/quarantined
state, uses randomized local database credentials, binds ports to loopback, limits
ClickHouse to one CPU/2 GiB and temporary data/log filesystems, and removes only
its random ownership-labelled container. Receipts exclude signed URLs/credentials;
screenshots show only the synthetic clip. There is no automatic cloud/load-test CI
invocation; the ordinary offline tests need no cloud credentials.

The fixture controller is local test infrastructure, not user authentication or a
production endpoint. It mints test stream tokens and seeds four isolated tables;
the actual HLS owner/member/carrier/public/authenticated checks are not stubbed.
An eight-second parent exercises real expiry and explicit renewal; four-second
Chromium playback at 1280px/375px is not a long-playback/full-app/Safari claim.

`finally` tears down the local API and container on normal errors. SIGKILL, daemon
loss or parent-machine failure can bypass cleanup. Recover only the exact container
in private `local-node-run.json`, first verifying its ownership label; never run
broad Docker pruning. Connected receipts record verified teardown on completed runs.

## Operational Bounds

Possession of a capability grants its exact object until expiry. Ordinary
permission revocation affects issuance/renewal, not each segment request.
Browser no-store and the 300-second internal cache lifetime do not make a bearer
revocable. Urgent takedown needs separate edge revocation, origin deletion and
cache purge procedures; no immediate global revocation is implemented here.

Live gates remain open: actual Cloudflare cache behavior/limits and CPU cost,
large-object streaming/cloning, private-origin denial, browser playback and CORS,
HLS exact-key/parent-expiry integration, disabled-node preservation, deployment
key rotation, origin interoperability, and independent security review. Local
tests use real RSA signatures and independently recompute SigV4, but use in-memory
cache and mocked fetch. They are not live CDN, private storage or playback proof.
Cache lookup failures currently fail closed with 502 rather than bypassing storage.
Background cache write failures do not fail successful origin delivery.
There is no stale serving, retry, purge API or request coalescing. No production
cloud resources are provisioned by the implementation. Isolated test resources
are recorded separately above. Keep production rollout disabled.
