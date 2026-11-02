# Protected Media Delivery

Disabled-by-default edge implementation of
[`media-delivery.md`](../knowledge-base/web10-v3/media-delivery.md).
The edge code needs no packages or framework and does not deploy itself. The
node-side issuer is integrated separately in `api/`, also disabled by default.
Run with Node 22+ and `uv` available for the cross-runtime check:

```sh
node --test media-delivery/delivery.test.mjs
node --test api/tests/media_delivery_interop.test.mjs
```

## Boundary

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
There is no stale serving, retry, purge API or request coalescing. No cloud
resources are provisioned. Keep production rollout disabled.
