# Cloudflare + Protected Media Delivery

**Status: local opt-in implementation, disabled by default; not deployed.**
No connected CDN or browser-playback result is claimed. The authoritative
contract is [media-delivery.md](../knowledge-base/web10-v3/media-delivery.md);
the [adapter README](../media-delivery/README.md) owns provisioning, operational
bounds and live gates. This research note preserves the offload intent, not an
alternative deployment recipe.

## Goal and Historic Intent

A creator should be able to serve the same image or video to many viewers
without sending every byte through the node. The original plan split this into
MEDIA-A (images/audio/documents), MEDIA-B (HLS segments), and MEDIA-C (urgent
takedown). That division remains useful; its original security and cost
assumptions do not.

**Origin-only authorization is not sufficient for a signature-stripped shared
cache.** A cache hit bypasses the origin check. Edge authorization is mandatory,
not a later paid optimization. Nor does this work assume existing authentication
or HLS signing is already asymmetric: it introduces a separate media-only RSA
key, not an authentication-key migration. Earlier free-delivery and price
estimates are withdrawn.

## Current Request Path

1. The node applies existing document/group and owner/provenance checks before
   issuing an exact-object capability through
   `api/app/services/media_delivery.py`. Uploads are unchanged.
2. The browser GETs
   `https://<delivery-host>/media/<canonical-base64url-object-key>?cap=<JWT>`.
   The media JWT uses RS256 and a separate RSA key of at least 2048 bits, with
   pinned `kid`, issuer, audience, version, bucket, exact key, method and times.
   Capabilities live at most 600 seconds.
3. `media-delivery/core.mjs` verifies the signature and all required claims,
   including expiry and exact GET/key/bucket binding, **before every cache
   lookup, including warm hits**. Missing, expired or tampered capabilities
   fail closed. There is no unsigned fallback or token-selected key URL.
4. Only after authorization does the core consult the shared bucket/key cache
   or fetch private storage. `media-delivery/cloudflare.mjs` supplies Cloudflare
   Cache API and S3 SigV4 adapters; the core uses portable Fetch/WebCrypto APIs.
   Another CDN replaces adapters, not node permissions or the token contract.

MinIO, S3 and R2 are storage choices, not authorization mechanisms. Storage must
deny anonymous reads, and no alternate public bucket/proxy/CDN host may bypass
the edge gate. Read-only origin credentials stay at the edge. A cache rule must
never serve incoming `/media/*` requests before Worker execution.

Successful full-object responses may share an internal cache entry independently
of reader tokens. Browser responses remain private/no-store; ranges authorize
first and bypass caching. Errors, redirects and partial responses do not populate
the full-object cache. Internal cache lifetime is not an access grant.

### HLS

Master and variant manifests stay on the node with live permission and uploader
provenance checks. `api/app/services/hls.py` rewrites segment URLs for edge
delivery only when enabled. Each segment has its own exact-key capability,
expiring no later than the verified parent stream capability and no more than
600 seconds after issuance. Segment bytes can then bypass the node; manifests
do not become shared edge-cached authorization substitutes. Disabled mode keeps
legacy delivery paths.

## Configuration and Evidence

Use the adapter README's **Provisioning** instructions, not the historic
MEDIA-A/B rollout steps. Relevant configuration and source locations:

- `api/app/settings.py`: `MEDIA_DELIVERY_ENABLED` defaults to false;
  `MEDIA_DELIVERY_BASE` is an HTTPS host-only URL. Configure
  `MEDIA_DELIVERY_ISSUER`, `MEDIA_DELIVERY_AUDIENCE`, `MEDIA_DELIVERY_KID`,
  `MEDIA_DELIVERY_PRIVATE_KEY`, `MEDIA_DELIVERY_TTL` (default 60, range 1..600)
  and `S3_BUCKET`. The private media key must be separate from `PRIVATE_KEY`.
- `api/app/v3/endpoints/media.py`: `/v3/media/jwks` exports media public keys;
  provision public JWKs out of band into static edge `CAP_JWKS`. The edge does
  not fetch keys per request. Deploy old+new public keys before changing the
  issuing kid; retain old keys until outstanding capabilities expire.
- `media-delivery/wrangler.example.toml`: disabled example with no active route.
  Match `DELIVERY_ORIGIN`, `CAP_ISSUER`, `CAP_AUDIENCE`, `CAP_JWKS`, `S3_BUCKET`,
  `S3_ENDPOINT` and `S3_REGION` to the node and private origin. Provision
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and optional `S3_SESSION_TOKEN` in
  the edge secret store, with GetObject-only access to the intended scope.
- `media-delivery/README.md`: dedicated cookieless media host, browser CORS and
  range constraints, private-origin denial checks, cache bounds, rotation and
  query/path log redaction. Capabilities are bearer secrets; neither signed
  URLs nor object keys belong in diagnostic logs.

Run the standalone edge suite from the repository root with Node 22+:

```sh
node --test media-delivery/delivery.test.mjs
```

Node and cross-runtime coverage lives in `api/tests/test_media_delivery.py` and
`api/tests/media_delivery_interop.test.mjs`. Local tests exercise real signatures,
warm-cache denial and disabled-mode/HLS integration, but mocked cache/storage
are not live delivery proof. Keep rollout disabled until actual Cloudflare cache
behavior and limits, private-origin denial, browser playback/CORS, HLS integration,
rotation, origin interoperability, cost and independent security review pass the
gates in the authoritative docs. No cloud resources are provisioned here.

## MEDIA-C Remains Open

Capabilities are shareable bearer credentials until expiry. Ordinary permission
revocation affects issuance/renewal, not every segment request. Browser no-store,
origin deletion and internal cache expiry do not establish immediate global
revocation of an already-issued capability or already-cached bytes.

MEDIA-C is separate work: define and verify urgent edge revocation, origin object
deletion (including renditions/thumbnails), cache purge and failure/retry behavior.
The current adapter has no purge API. Do not claim instant takedown or a measured
global purge bound. CDN offloading also does not repair stored-reference or
attached-ad authority debt, nor optimize database queries.

## Cost and Research Bounds

Offloading aims to reduce node byte-proxy work, not eliminate node compute or
prove capacity. Budget storage, storage operations, origin egress, edge requests
and verification CPU, cache behavior and any purge/control-plane charges
separately. Check current provider terms, limits and measured workload before
deployment; no free-delivery claim or current-price guarantee follows from this
architecture. Query-path measurements are not CDN, playback or cost evidence.
