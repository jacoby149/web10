# Production CDN activation — 04.11.2026

The operator asked for the real hookup, retaining MinIO. Production now issues
protected `media.web10.app` URLs, and a synthetic video plays through them. This
is a bounded operational result, not a declaration that every release gate closed.

## What is live

| Component | Verified state |
|---|---|
| Node | `api.web10.app`, media issuance enabled, direct capability TTL 60 seconds |
| Edge | `web10-media-prod`, custom domain `media.web10.app`, normal Cloudflare adapter |
| Storage | Existing private MinIO bucket `web10-media`; no storage migration |
| Origin credential | Dedicated direct IAM user, named GetObject-only policy; actual GET succeeds, list/write denied |
| Signing | Separate media-only RSA key in the node's private ops vault; matching public JWK at the Worker |
| Initial guardrails | Worker CPU 50 ms; outer response cache, invocation logging and Logpush disabled in deployment config |
| Recovery | Original disabled env and exact-image API-only enabled/rollback Compose snapshots retained privately |

The API was recreated with its exact existing image,
`sha256:0e1e38de41f63bea26bef6b8634b8d4c3021bc8b42dc0b420a3499556b86d379`.
Preflight compared non-media environment, command, networks and storage credentials
with the running generation. No newer API source was built; no other service was
recreated. Active `env.prod` and its new authoritative `~/web10-ops/env.prod` backup
hold the seven media settings privately. Authentication keys and shared MinIO
passwords were not rotated.

## The failure and the repair

Initial signed edge reads returned 502. Temporary metadata-only diagnostics showed
an origin 301 to the same HTTPS origin, while the identical adapter outside
Cloudflare returned 200. The zone was in Flexible SSL mode.

Both available credentials received 403 reading Configuration Rules. Other proxied
origins could not be validated for zone-wide Strict, so that change was not made.
The operator added the requested hostname-only SSL rule matching
`http.host in {"media.web10.app" "minio.web10.app"}`. Signed canary reads then
succeeded; unrelated zone settings and origins were left alone. The screenshot
shows the rule active; its selected SSL value is not independently API-readable
with the available credentials.

First fresh-runtime staging validation also stopped on an unsupported Compose
`run --pull` flag (installed version 2.23). Safe diagnosis identified the flag;
removing it allowed actual fresh runtime validation and matching public JWK
verification before active env changes. Existing staged files were checked for
exact content rather than overwritten blindly.

## Connected checks

| Probe | Observed result |
|---|---|
| Normal Worker canary before activation | Valid 200 with matching SHA-256; expired/missing 403 |
| Real production login and owner `media/read-url` | 200; returned URL host `media.web10.app`, capability TTL 60 |
| Actual API-issued full read and repeat | 200, matching 41-byte synthetic canary, private/no-store |
| Range `bytes=0-9` | 206, exact ten bytes and Content-Range |
| Missing capability | 403 |
| Same API-issued capability after natural expiry | 403; earlier premature probe stopped locally before a request |
| Canary-only edge cache observation | Two IAD hits with matching bytes and no origin fetch |
| Expired capability against that cached object | 403, neither cache lookup nor origin fetch reached |
| Chromium synthetic MP4, 1280px and 375px | Four seconds, 96 decoded frames, ended=true, CDN 206 |
| After restoring normal Worker | API health/login/issuance/full/range/missing-denial checks pass again |

Cache diagnostics were restricted to the owned synthetic text object's path.
Other requests used the normal adapter. The live storage credential was never
disabled to force a cache result. The normal Worker was restored afterward.
Final node metadata confirms enabled issuance, key/base present, seven media env
fields, authoritative backup present and diagnostics absent.
The public `/v3/media/jwks` returns 200 with one public key matching the Worker.
All 42 cases in `delivery.test.mjs` pass after the operations; this record changes
no tracked application or deployment source.

Only one synthetic production account and two synthetic objects (text and MP4)
were added. The video is 118128 bytes with SHA-256
`1d1e37e6e6b9668f37a5d79c39b36e9ad3d4f38434a8583c0b9d83c12564314a`.
No existing user's objects were read or modified for these probes. Screenshots
were read individually at `.context/cdn-live/production/browser-{1280,375}.png`.
Immutable redacted receipts remain in that directory's `receipts/`; credentials,
signed URLs and PEM are excluded from this record.

Receipt SHA-256 anchors:

| Successful stage | Receipt digest |
|---|---|
| Activation | `21bbabbe6b8828636b919a567a13e6795ad64abc991f33fbab4f2ad1afda694c` |
| Natural expiry | `1963af9dc9e2bae4cb6be1aaccbf6e84fe3c33e343010d293549298db83ddfeb` |
| Browser | `be2f97984000f33ba97d40ecbaf106250dc897696ae2622a2121c20184859d39` |
| Cache | `93f2b75bd5abdf48b70ea5c08dccb3f61a43ae9d0663d3e6c89984f7263b19a1` |
| Normal Worker restored | `eaffb30cf2acf17877f450b106fbd40aa2ba19c4d21dd3108af02107a9c16152` |
| Final API acceptance | `cc1962b2992dcfca3724e3b266f7cdce2640e96bcb590a80b2f891ce9df8f723` |
| Final node status | `128b13ba763783cd817c4f86d195d2b1f7fd70947b5ac57a4e9154fc1ce54f6d` |

## Recovery and the next deployment

**The current activation survives API restarts, but normal main deployment
persistence is still open.** Main lacks the merged dev Compose forwarding. A
normal production deployment from that older Compose can remove the media env
from the container and fall back to legacy delivery. Do not silently promote
unrelated dev changes just to close this gap.

The scope-owned private vault under `~/web10-ops/cdn-production-<recorded-scope>/`
contains `env.prod.before`, `env.prod.candidate`, `activation-manifest.json`,
`api-enabled.compose.json` and `api-rollback.compose.json`. The Compose snapshots
pin the exact existing image and networks and contain private environment values;
never print them. The local private helper's `rollback` stage checks env hashes,
atomically restores the disabled env to both active and authoritative copies,
then recreates only the API from its pinned rollback snapshot. Enabled recovery
can use the corresponding snapshot after revalidating current state. Neither
operation changes the origin credential or immediately revokes issued capabilities.

Next: deliberately carry the forwarding through production release coordination,
then verify the normal deployed generation. Initial authenticated document/query
issuance, the full social player's HLS/long-video automatic renewal, representative
provider resource measurements, logging/export completeness and independent
model-diverse security review remain open. Operator-directed activation occurred
before all those gates closed; this record does not waive them. See
[provider readiness](PROVIDER-READINESS.md) and the historical
[isolated acceptance](CONNECTED-ACCEPTANCE.md).
